// The bots' ranks (server/bots/rank.mjs) on set positions: the ranks each game has, and the four
// quirks Stichle's session found (2026-10-14) stay fixed. Honesty (no rank reads a hand but its own),
// whole deals by every rank, the apprentice's slips and the temperament play positions out, so they
// are in bots.sim.mjs (`npm run test:sim`, not in CI).

import { test } from 'node:test';
import assert from 'node:assert/strict';

// The master's trial deals bound by count, not by the clock: repeatable, and quick.
process.env.STAMMTISCH_MASTER_MS = '100000';
process.env.STAMMTISCH_MASTER_PLAYS = '400';
const { GAMES } = await import('../server/games/index.mjs');
const { levelsFor, LEVELS } = await import('../server/bots/rank.mjs');
const { appraise } = await import('../server/bots/skat.mjs');
const { seeded } = await import('./helpers.mjs');

const PLAYERS = { doppelkopf: 4, skat: 3, durak: 3, maumau: 3 };
const RULES = {
  doppelkopf: [{}, { schweinchen: true, dulle: 'second' }, { nines: false }, { poverty: true, schweinchen: true }],
  skat: [{ kontra: true }, { ramsch: true }],
  durak: [{}, { transfer: true }],
  maumau: [{}],
};

/** A fresh deal of `game`. */
function dealOf(game, rules, dealer, randomInt) {
  const M = GAMES[game].module;
  return game === 'doppelkopf' || game === 'skat' ? M.deal({ dealer, rules, randomInt }) : M.deal({ players: PLAYERS[game], dealer, rules, randomInt });
}

/** Positions part-way through deals, each with the seat whose move it is (journeymen play up to it). */
function positions(game, count, seed) {
  const M = GAMES[game].module;
  const randomInt = seeded(seed);
  const out = [];
  for (let d = 0; out.length < count && d < count * 4; d++) {
    const rules = RULES[game][d % RULES[game].length];
    const s = dealOf(game, rules, d % PLAYERS[game], randomInt);
    const stop = randomInt(40);
    for (let k = 0; k < stop && s.phase !== 'done'; k++) M.act(s, s.turn, GAMES[game].bot(s, s.turn), { randomInt });
    if (s.phase !== 'done') out.push(s);
  }
  return out;
}

/**
 * The same position with everything this seat can't see shuffled: the others' cards among the
 * others, the Skat and what went back into it, the stock under its turned card, and Doppelkopf's
 * hidden truths (who's Re where the seat can't know it, an unshown Schweinchen, the others'
 * reservations). Null when the shuffle changed what the seat sees.
 */
function scramble(game, s, seat, randomInt) {
  const M = GAMES[game].module;
  const t = structuredClone(s);
  const shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  /** Hidden places, as [object, key, count]: their cards are pooled, shuffled and dealt back. */
  const places = [];
  const others = [...Array(t.hands.length).keys()].filter((p) => p !== seat);
  const open = game === 'skat' && t.contract?.ouvert && t.phase === 'play' ? t.declarer : null;
  for (const p of others) if (p !== open) places.push([t.hands, p]);
  if (game === 'skat') {
    if (t.skat.length) places.push([t, 'skat']);
    if (t.put.length && seat !== t.declarer) places.push([t, 'put']);
  }
  if (game === 'maumau') places.push([t, 'stock']);
  const pool = shuffle(places.flatMap(([o, k]) => o[k]));
  for (const [o, k] of places) o[k] = pool.splice(0, o[k].length);
  if (game === 'durak' && t.stock.length > 1) t.stock = [...shuffle(t.stock.slice(0, -1)), t.stock.at(-1)];
  if (game === 'doppelkopf') {
    const known = M.knownParties(s, seat);
    if (t.parties) t.parties = t.parties.map((x, i) => (known[i] === null && x !== null ? (randomInt(2) ? 're' : 'kontra') : x));
    const ownPigs = s.hands[seat].filter((id) => id === 'd-A').length === 2;
    if (s.rules.schweinchen && !t.pigsShown && !ownPigs) t.pigs = [null, ...others][randomInt(others.length + 1)];
    t.declared = t.declared.map((d, i) => (i === seat || d === null ? d : { kind: 'healthy' }));
  }
  return JSON.stringify(M.view(t, seat)) === JSON.stringify(M.view(s, seat)) ? t : null;
}

test('the ranks: three, and Mau-Mau two', () => {
  assert.deepEqual(levelsFor('doppelkopf'), LEVELS);
  assert.deepEqual(levelsFor('maumau'), ['apprentice', 'journeyman']);
});

test('Doppelkopf: an unshown Schweinchen in another hand ranks as a plain ♦A for the bot', async () => {
  const { rankingFor } = await import('../server/bots/doppelkopf.mjs');
  const M = GAMES.doppelkopf.module;
  const s = M.deal({ dealer: 0, rules: { schweinchen: true }, randomInt: seeded(4) });
  // Seat 2 holds both ♦A: put them there.
  for (let seat = 0; seat < 4; seat++) {
    for (const id of [...s.hands[seat]]) {
      if (id === 'd-A' && seat !== 2) {
        const swap = s.hands[2].find((x) => x !== 'd-A');
        s.hands[seat][s.hands[seat].indexOf(id)] = swap;
        s.hands[2][s.hands[2].indexOf(swap)] = id;
      }
    }
  }
  while (s.phase === 'reserve') M.act(s, s.turn, { type: 'reserve', kind: 'healthy' });
  assert.equal(s.pigs, 2);
  assert.ok(rankingFor(s, 0).rank('d-A') < rankingFor(s, 0).rank('h-10'), 'seat 0 can’t know');
  assert.ok(rankingFor(s, 2).rank('d-A') > rankingFor(s, 2).rank('h-10'), 'seat 2 holds them');
});

test('Durak: nobody throws a trump in to a defender who is taking', async () => {
  const D = GAMES.durak.module;
  const s = D.deal({ players: 2, dealer: 1, randomInt: seeded(9) });
  const a = s.attacker;
  const tr = s.trump;
  const plain = ['c', 's', 'h', 'd'].find((x) => x !== tr);
  s.hands[a] = [`${tr}-7`, `${plain}-7`, `${plain}-A`];
  s.hands[s.defender] = [`${plain}-6`];
  s.table = [{ attack: `${tr === 'c' ? 's' : 'c'}-7`, by: a, defense: null }];
  s.taking = true;
  s.turn = a;
  s.limit = 6;
  for (const level of ['apprentice', 'journeyman']) {
    const move = GAMES.durak.bot(s, a, { level });
    assert.ok(!(move.type === 'attack' && move.card === `${tr}-7`), `${level} threw ${move.card}`);
  }
});

test('Skat: the declarer answers a Kontra with Re on a strong hand (house rule)', () => {
  const S = GAMES.skat.module;
  const s = S.deal({ dealer: 2, rules: { kontra: true }, hands: [['c-J', 's-J', 'h-J', 'd-J', 'c-A', 'c-10', 'c-K', 's-A', 'h-A', 'd-7'], ['c-Q', 'c-9', 'c-8', 's-10', 's-K', 's-Q', 'h-10', 'h-K', 'h-Q', 'd-A'], ['c-7', 's-9', 's-8', 's-7', 'h-9', 'h-8', 'h-7', 'd-10', 'd-K', 'd-Q']], skat: ['d-9', 'd-8'] });
  Object.assign(s, { phase: 'play', declarer: 0, bid: 18, took: false, contract: { game: 'grand', hand: true, schneider: false, schwarz: false, ouvert: false }, doubled: 1, reOpen: true, turn: 0 });
  assert.deepEqual(GAMES.skat.bot(s, 0, { level: 'journeyman' }), { type: 're' });
});
