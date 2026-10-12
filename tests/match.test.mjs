import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeSeats, createMatch, endDeal, isOver, leaders, nextDeal } from '../server/core/match.mjs';
import * as MauMau from '../server/games/maumau.mjs';
import * as Doko from '../server/games/doppelkopf.mjs';
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

test('a match refuses a table the game can’t seat, and silly rounds', () => {
  throws(() => createMatch(MauMau, { table: 1 }), 'table');
  throws(() => createMatch(MauMau, { table: 7 }), 'table');
  throws(() => createMatch(Doko, { table: 3 }), 'table');
  throws(() => createMatch(MauMau, { table: 3, rounds: 0 }), 'rounds');
  throws(() => createMatch(MauMau, { table: 3, dealer: 3 }), 'players');
  throws(() => createMatch(MauMau, { table: 3, rules: { hand: 9 } }), 'rules');
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

test('Doppelkopf with four: everyone plays, the dealer as the game’s last seat', () => {
  const m = createMatch(Doko, { table: 4, dealer: 1 });
  assert.deepEqual(activeSeats(Doko, m), [2, 3, 0, 1]);
  const s = nextDeal(Doko, m, seeded(2));
  assert.equal(s.dealer, 3);
  assert.equal(m.seats[s.dealer], 1);
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

test('a deal thrown in (or poverty nobody takes) is dealt again by the same dealer and doesn’t count', () => {
  const m = createMatch(Doko, { table: 4, rules: { throw: true } });
  fakeDone(m, { void: 'throw', points: [0, 0, 0, 0] });
  const record = endDeal(Doko, m);
  assert.equal(record.counts, false);
  assert.equal(m.dealer, 0);
  assert.equal(m.counted, 0);
});

test('the duty solo (house rule): the same dealer deals again, the soloist owes nothing more', () => {
  const m = createMatch(Doko, { table: 4, rules: { duty: true } });
  assert.deepEqual(m.extra.owes, [true, true, true, true]);
  const s = nextDeal(Doko, m, seeded(4));
  assert.deepEqual(s.owes, [true, true, true, true]);
  // Game seat 2 (table seat 3) plays its duty solo.
  fakeDone(m, { duty: true, contract: { soloist: 2 } });
  const record = endDeal(Doko, m);
  assert.equal(record.counts, false);
  assert.equal(m.dealer, 0, 'the same dealer');
  assert.deepEqual(m.extra.owes, [true, true, true, false]);
  // A lust solo or a normal game moves the deal on.
  fakeDone(m, {});
  endDeal(Doko, m);
  assert.equal(m.dealer, 1);
  assert.equal(m.counted, 1);
});

test('the duty solo: whoever still owes one once the deals are played is forced to play it, then the next deals', () => {
  const m = createMatch(Doko, { table: 4, rounds: 1, rules: { duty: true } });
  m.extra.owes = [false, true, false, true];
  m.counted = 4;
  m.dealer = 2;
  assert.equal(isOver(Doko, m), false);
  const s = nextDeal(Doko, m, seeded(5));
  // From the dealer's left (seat 3) the first who owes is seat 3: game seat 0, no asking round.
  assert.equal(s.forced, 0);
  assert.equal(m.seats[s.forced], 3);
  Doko.act(s, 0, { type: 'reserve', kind: 'solo', solo: 'Q' });
  assert.equal(s.turn, 0, 'the forced soloist leads');
  fakeDone(m, { duty: true, contract: { soloist: 0 } }, { forced: 0 });
  m.seats = [3, 0, 1, 2];
  endDeal(Doko, m);
  assert.deepEqual(m.extra.owes, [false, true, false, false]);
  assert.equal(m.dealer, 3, 'after a forced solo the next player deals');
  const t = nextDeal(Doko, m, seeded(6));
  assert.equal(m.seats[t.forced], 1);
  fakeDone(m, { duty: true, contract: { soloist: t.forced } }, { forced: t.forced });
  m.seats = [0, 1, 2, 3];
  endDeal(Doko, m);
  assert.equal(isOver(Doko, m), true);
});

test('the duty solo with five: a forced player who’d sit out plays, in the four seats that end with them', () => {
  const m = createMatch(Doko, { table: 5, rounds: 1, rules: { duty: true } });
  m.extra.owes = [false, false, true, false, false];
  m.counted = 5;
  m.dealer = 2;
  const s = nextDeal(Doko, m, seeded(7));
  assert.deepEqual(m.seats, [4, 0, 1, 2]);
  assert.equal(m.seats[s.forced], 2);
});

test('Bock rounds (house rule): 120 : 120 or Re and Kontra both said, and the next deals count double', () => {
  const m = createMatch(Doko, { table: 4, rounds: 3, rules: { bock: true } });
  fakeDone(m, { augen: { re: 120, kontra: 120 }, points: [-2, 2, -2, 2] });
  assert.equal(endDeal(Doko, m).factor, 1);
  assert.equal(m.extra.bock, 4);
  fakeDone(m, { calls: { re: 0, kontra: 0 }, points: [5, -5, 5, -5] });
  const doubled = endDeal(Doko, m);
  assert.equal(doubled.factor, 2);
  assert.deepEqual(doubled.points.slice().sort((a, b) => a - b), [-10, -10, 10, 10]);
  // Both said: another Bock round queued behind the rest of this one.
  assert.equal(m.extra.bock, 3 + 4);
  for (let i = 0; i < 7; i++) {
    fakeDone(m, {});
    assert.equal(endDeal(Doko, m).factor, 2);
  }
  fakeDone(m, {});
  assert.equal(endDeal(Doko, m).factor, 1);
  // Off by default.
  const plain = createMatch(Doko, { table: 4 });
  fakeDone(plain, { augen: { re: 120, kontra: 120 } });
  endDeal(Doko, plain);
  assert.equal(plain.extra.bock, 0);
});
