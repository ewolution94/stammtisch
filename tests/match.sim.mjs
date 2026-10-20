// Simulated games for the match: whole matches and deals played by bots.
// Not in CI (the user, 2026-10-20: "rely on simpler (unit) tests there"); run them with `npm run test:sim`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeSeats, createMatch, endDeal, isOver, leaders, nextDeal } from '../server/core/match.mjs';
import * as MauMau from '../server/games/maumau.mjs';
import * as Doko from '../server/games/doppelkopf.mjs';
import * as Skat from '../server/games/skat.mjs';
import { botMove as skatBot } from '../server/bots/skat.mjs';
import { botMove as mauBot } from '../server/bots/maumau.mjs';
import { botMove as dokoBot } from '../server/bots/doppelkopf.mjs';
import { seeded, throws } from './helpers.mjs';

/** Plays the current deal to its end with bots. */
function playDeal(game, bot, match, randomInt) {
  const s = match.current;
  for (let n = 0; s.phase !== 'done'; n++) {
    assert.ok(n < 5000);
    game.act(s, s.turn, bot(s, s.turn), { randomInt });
  }
}

/** A finished Doppelkopf deal to settle, without playing it: the result's fields the match reads. */
function fakeDone(match, result, { forced = null } = {}) {
  match.current = { phase: 'done', forced, result: { void: null, duty: false, contract: { soloist: null }, augen: { re: 130, kontra: 110 }, calls: { re: -1, kontra: -1 }, points: [1, -1, 1, -1], ...result } };
  match.seats = activeSeats(Doko, match);
}

test('a Mau-Mau match: the deal goes round the table once a round; totals add up; it ends', () => {
  const randomInt = seeded(3);
  const m = createMatch(MauMau, { table: 3, rounds: 2, dealer: 1 });
  const dealers = [];
  while (!isOver(MauMau, m)) {
    nextDeal(MauMau, m, randomInt);
    throws(() => nextDeal(MauMau, m, randomInt), 'playing');
    dealers.push(m.dealer);
    playDeal(MauMau, mauBot, m, randomInt);
    endDeal(MauMau, m);
  }
  assert.deepEqual(dealers, [1, 2, 0, 1, 2, 0]);
  assert.equal(m.history.length, 6);
  assert.equal(m.totals.reduce((a, b) => a + b, 0), 6, 'a point a deal with the tally');
  assert.deepEqual(m.totals, [0, 1, 2].map((s) => m.history.filter((r) => r.points[s] === 1).length));
  assert.ok(leaders(m).every((s) => m.totals[s] === Math.max(...m.totals)));
  throws(() => nextDeal(MauMau, m, randomInt), 'over');
  throws(() => endDeal(MauMau, m), 'phase');
});

test('Doppelkopf with five: the dealer sits out, the dealer’s left begins; the points land on the right seats', () => {
  const randomInt = seeded(8);
  const m = createMatch(Doko, { table: 5, dealer: 2 });
  assert.deepEqual(activeSeats(Doko, m), [3, 4, 0, 1]);
  const s = nextDeal(Doko, m, randomInt);
  assert.equal(s.first, 0, 'game seat 0 is table seat 3, the dealer’s left');
  assert.deepEqual(m.seats, [3, 4, 0, 1]);
  playDeal(Doko, dokoBot, m, randomInt);
  const pts = s.result.void ? [0, 0, 0, 0] : s.result.points;
  const record = endDeal(Doko, m);
  assert.equal(record.points[2], 0, 'the dealer sat out');
  assert.deepEqual([3, 4, 0, 1].map((t) => record.points[t]), pts);
  assert.equal(m.totals.reduce((a, b) => a + b, 0), 0);
});

test('a whole Doppelkopf match of bots: four rounds at four, every deal counted, the totals sum to zero', () => {
  const randomInt = seeded(21);
  const m = createMatch(Doko, { table: 4, rounds: 4 });
  while (!isOver(Doko, m)) {
    nextDeal(Doko, m, randomInt);
    playDeal(Doko, dokoBot, m, randomInt);
    endDeal(Doko, m);
  }
  assert.equal(m.counted, 16);
  assert.equal(m.totals.reduce((a, b) => a + b, 0), 0);
});

test('a whole Skat match of bots at three: every deal counted, the totals are the declarers’ results', () => {
  const randomInt = seeded(31);
  const m = createMatch(Skat, { table: 3, rounds: 3, rules: { scoring: 'list' } });
  while (!isOver(Skat, m)) {
    nextDeal(Skat, m, randomInt);
    playDeal(Skat, skatBot, m, randomInt);
    endDeal(Skat, m);
  }
  assert.equal(m.counted, 9);
  assert.equal(m.history.length, 9);
});
