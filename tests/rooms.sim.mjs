// Simulated games for the rooms: whole games and deals played out on the fake clock, bots moving for absent humans.
// Not in CI (the user, 2026-10-20: "rely on simpler (unit) tests there"); run them with `npm run test:sim`.

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

for (const [id, people, bots] of [['maumau', 1, 2], ['doppelkopf', 1, 2], ['skat', 1, 1], ['durak', 1, 2]]) {
  test(`a whole ${id} game of bots and absent humans plays to its end; the totals add up`, () => {
    const { rooms, clock } = setup(id.length);
    const t = table(rooms, people, id);
    for (let i = 0; i < bots; i++) t.act(t.host, 'bot', { add: true });
    // The quick clock: when a human's 25 s run out, the bot moves for them.
    t.act(t.host, 'settings', { clock: 'quick' });
    t.act(t.host, 'start');
    // The other humans leave the stream (the bot plays for them once they're away); the host's page
    // stays, so the game isn't left unwatched.
    for (const p of t.pages.slice(1)) p.close();
    const watcher = watch(rooms, t.code);
    const v = playOut(clock, t.pages[0]);
    assert.equal(v.phase, 'final', `${id} ended`);
    assert.equal(v.game.ended, 'done');
    assert.equal(v.game.match.counted, v.game.match.deals);
    assert.ok(v.game.match.totals.every(Number.isInteger));
    if (id === 'doppelkopf') assert.equal(v.game.match.totals.reduce((a, b) => a + b, 0), 0, 'Doppelkopf points sum to zero');
    assert.ok(v.game.match.history.length >= v.game.match.deals);
    watcher.close();
  });
}

test('a finished deal: its result waits for everyone’s "next", then the next deal', () => {
  const { rooms, clock } = setup(11);
  const t = table(rooms, 1, 'maumau');
  // Two at the table, once round: two deals. The quick clock plays the humans' moves for them.
  t.act(t.host, 'settings', { clock: 'quick' });
  t.act(t.host, 'start');
  for (let i = 0; i < 20_000 && t.pages[0].view.game.phase === 'deal'; i++) clock.advance(1000);
  const g = t.pages[0].view.game;
  assert.equal(g.phase, 'scored');
  assert.equal(g.last.n, 1);
  assert.equal(g.match.history.length, 1);
  assert.ok(g.readyBy > clock.now());
  t.act(t.seats[0], 'next');
  assert.equal(t.pages[0].view.game.phase, 'scored', 'still waiting for the other');
  assert.deepEqual(t.pages[1].view.game.ready, [t.seats[0].player]);
  t.act(t.seats[1], 'next');
  assert.equal(t.pages[0].view.game.phase, 'deal');
  assert.equal(t.pages[0].view.game.match.counted, 1);
  refused(() => t.act(t.seats[0], 'next'), 'wrong-phase');
});
