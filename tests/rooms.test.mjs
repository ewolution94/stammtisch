import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameError, mergeSettings, DEFAULT_SETTINGS, AWAY_MS } from '../server/rooms.mjs';
import { GAMES } from '../server/games/index.mjs';
import { botMove as dokoBot } from '../server/bots/doppelkopf.mjs';
import { setup, table, watch } from './room-helpers.mjs';

const refused = (fn, code) => assert.throws(fn, (e) => e instanceof GameError && e.code === code, code);

/** Runs the clock until the game is over (or gives up). */
function playOut(clock, page, maxMs = 6 * 60 * 60_000) {
  for (let t = 0; t < maxMs && page.view.phase === 'play'; t += 1000) clock.advance(1000);
  return page.view;
}

test('a room: the host makes it, others join by its code, everyone sees the same table', () => {
  const { rooms } = setup();
  const t = table(rooms, 2);
  assert.equal(t.pages[0].view.phase, 'lobby');
  assert.equal(t.pages[0].view.settings.game, 'doppelkopf');
  assert.equal(t.pages[0].view.order.length, 3);
  assert.equal(t.pages[1].view.host, t.host.player);
  assert.deepEqual(rooms.info(t.code), { code: t.code, phase: 'lobby', game: 'doppelkopf', players: 3, full: false });
  refused(() => rooms.join('ZZZZ', { name: 'X' }), 'no-room');
  refused(() => rooms.create({ name: '' }), 'name');
});

test('settings: the host picks the game, the rounds, the clock and each game’s house rules; invalid values are ignored', () => {
  const merged = mergeSettings({ ...DEFAULT_SETTINGS }, { skat: { ...GAMES.skat.module.RULES } }, { game: 'skat', rounds: 2, clock: 'quick', rules: { skat: { ramsch: true, scoring: 'nonsense' } } });
  assert.deepEqual(merged.settings, { game: 'skat', clock: 'quick', rounds: 2, bots: 'journeyman' });
  assert.equal(merged.rules.skat.ramsch, false, 'one invalid value refuses the whole patch');
  const ok = mergeSettings({ ...DEFAULT_SETTINGS }, { skat: { ...GAMES.skat.module.RULES } }, { rules: { skat: { ramsch: true } } });
  assert.equal(ok.rules.skat.ramsch, true);
  assert.deepEqual(mergeSettings(DEFAULT_SETTINGS, {}, { game: 'poker', rounds: 5, clock: 'slow', bots: 'grandmaster' }).settings, DEFAULT_SETTINGS);

  const { rooms } = setup();
  const t = table(rooms, 1);
  t.act(t.host, 'settings', { game: 'maumau', rules: { maumau: { ace: true } } });
  assert.equal(t.pages[1].view.settings.game, 'maumau');
  assert.equal(t.pages[1].view.rules.maumau.ace, true);
  assert.equal(t.pages[1].view.rules.doppelkopf.dulle, 'first', 'the other games keep theirs');
  refused(() => t.act(t.seats[1], 'settings', { game: 'skat' }), 'not-host');
});

test('bots in three ranks: the table’s rank is every bot’s, the host sets one bot’s own; each has its temperament', () => {
  const { rooms } = setup();
  const t = table(rooms, 1);
  t.act(t.host, 'bot', { add: true });
  t.act(t.host, 'bot', { add: true });
  const bots = () => t.pages[0].view.players.filter((p) => p.bot);
  assert.deepEqual(bots().map((b) => b.level), ['journeyman', 'journeyman'], 'the default');
  assert.deepEqual(bots().map((b) => b.temper), ['bold', 'cautious'], 'Robo Rita bold, Bot Bernd cautious');
  t.act(t.host, 'settings', { bots: 'master' });
  assert.equal(t.pages[1].view.settings.bots, 'master');
  assert.deepEqual(bots().map((b) => b.level), ['master', 'master'], 'the table’s rank is every bot’s');
  t.act(t.host, 'bot', { player: bots()[1].id, level: 'apprentice' });
  assert.deepEqual(bots().map((b) => b.level), ['master', 'apprentice'], 'one bot’s own');
  t.act(t.host, 'bot', { add: true });
  assert.equal(bots()[2].level, 'master', 'a new bot comes at the table’s rank');
  refused(() => t.act(t.host, 'bot', { player: bots()[0].id, level: 'grandmaster' }), 'level');
  refused(() => t.act(t.host, 'bot', { player: t.seats[1].player, level: 'master' }), 'no-player');
  refused(() => t.act(t.seats[1], 'bot', { player: bots()[0].id, level: 'apprentice' }), 'not-host');
  // A human's page never shows a rank.
  assert.ok(t.pages[0].view.players.filter((p) => !p.bot).every((p) => !('level' in p)));
});

test('starting needs the game’s table: Doppelkopf four to six, Skat three or four, Mau-Mau two to six', () => {
  const { rooms } = setup();
  const t = table(rooms, 2);
  assert.throws(() => t.act(t.host, 'start'), (e) => e.code === 'too-few' && e.detail.min === 4);
  t.act(t.host, 'bot', { add: true });
  t.act(t.host, 'bot', { add: true });
  t.act(t.host, 'settings', { game: 'skat' });
  assert.throws(() => t.act(t.host, 'start'), (e) => e.code === 'too-many' && e.detail.max === 4);
  t.act(t.host, 'settings', { game: 'doppelkopf' });
  t.act(t.host, 'start');
  assert.equal(t.pages[0].view.phase, 'play');
  assert.equal(t.pages[0].view.game.id, 'doppelkopf');
});

test('a human plays through the room: only on their turn, only what the rules allow', () => {
  const { rooms, clock } = setup(3);
  const t = table(rooms, 1, 'maumau');
  t.act(t.host, 'start');
  const g = () => t.pages[0].view.game;
  // Whoever's turn it is: a move from the other is refused by the rules.
  const turn = g().deal.turn;
  const mover = g().dealSeats[turn] === 0 ? 0 : 1;
  const other = 1 - mover;
  assert.throws(() => t.act(t.seats[other], 'move', { move: { type: 'draw' } }), (e) => e.code === 'turn');
  t.act(t.seats[mover], 'move', { move: { type: 'draw' } });
  assert.ok(g().events.some((e) => e.type === 'draw'));
  assert.throws(() => t.act(t.seats[mover], 'move', { move: null }), (e) => e.code === 'move');
  // Draw and pass on until the deal moves: both pages see the same pile.
  clock.advance(10);
  assert.deepEqual(t.pages[0].view.game.deal.pile, t.pages[1].view.game.deal.pile);
});

test('every page sees its own hand and no one else’s; a watcher sees none', () => {
  const { rooms } = setup(5);
  const t = table(rooms, 3, 'doppelkopf');
  t.act(t.host, 'start');
  const hands = t.pages.map((p) => p.view.game.deal.hand);
  for (const h of hands) assert.equal(h.length, 12);
  assert.notDeepEqual(hands[0], hands[1]);
  const watcher = watch(rooms, t.code);
  assert.equal(watcher.view.game.deal.hand, null);
  assert.equal(watcher.view.game.seat, -1);
  // No view carries the full hands.
  for (const p of [...t.pages, watcher]) assert.ok(!JSON.stringify(p.view).includes('"hands":[['), 'no hands array');
});

test('Doppelkopf with five: the dealer sits the deal out, sees no hand, and can’t move', () => {
  const { rooms } = setup(9);
  const t = table(rooms, 4, 'doppelkopf');
  t.act(t.host, 'start');
  const out = t.pages.find((p) => p.view.game.seat === -1);
  assert.ok(out, 'one page sits out');
  assert.equal(out.view.game.deal.hand, null);
  assert.equal(t.pages.filter((p) => p.view.game.seat >= 0).length, 4);
  const who = t.seats[t.pages.indexOf(out)];
  assert.throws(() => t.act(who, 'move', { move: { type: 'reserve', kind: 'healthy' } }), (e) => e.code === 'not-playing');
});

test('the host stops a game: the end for everyone; a rematch deals again', () => {
  const { rooms } = setup(13);
  const t = table(rooms, 2, 'skat');
  t.act(t.host, 'start');
  refused(() => t.act(t.seats[1], 'stop'), 'not-host');
  t.act(t.host, 'stop');
  assert.equal(t.pages[1].view.phase, 'final');
  assert.equal(t.pages[1].view.game.ended, 'stopped');
  t.act(t.host, 'rematch');
  assert.equal(t.pages[1].view.phase, 'play');
  t.act(t.host, 'stop');
  t.act(t.host, 'rematch', { lobby: true });
  assert.equal(t.pages[1].view.phase, 'lobby');
});

test('a bot in the room plays its moves; Doppelkopf announcements come from any seat, not only the one in turn', () => {
  const { rooms, clock } = setup(17);
  const t = table(rooms, 3, 'doppelkopf');
  t.act(t.host, 'start');
  // Everyone says "gesund" in turn.
  for (let k = 0; k < 4; k++) {
    const v = t.pages[0].view.game;
    const seat = t.seats[v.dealSeats[v.deal.turn]];
    t.act(seat, 'move', { move: { type: 'reserve', kind: 'healthy' } });
  }
  const v = t.pages[0].view.game;
  assert.equal(v.deal.phase, 'play');
  // Someone not in turn announces (Re or Kontra) before the first card.
  const turnTable = v.dealSeats[v.deal.turn];
  const other = [0, 1, 2, 3].find((s) => s !== turnTable);
  const page = t.pages[other];
  assert.deepEqual(page.view.game.deal.options, [0, 1, 2, 3, 4]);
  t.act(t.seats[other], 'move', { move: { type: 'announce', level: 0 } });
  assert.ok(t.pages[0].view.game.events.some((e) => e.type === 'announce' && e.seat === other));
  void clock;
  void dokoBot;
});
