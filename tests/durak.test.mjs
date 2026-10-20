import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDeck } from '../server/core/cards.mjs';
import * as D from '../server/games/durak.mjs';
import { botMove } from '../server/bots/durak.mjs';
import { cardsIn, pick, sameCards, seeded, throws } from './helpers.mjs';

const { act, beats, deal, moves, view } = D;

/** A fixed deal: hands and the stock (its last card the turned trump). Dealer: the last seat. */
const table = (hands, stock, rules = {}) => deal({ players: hands.length, dealer: hands.length - 1, hands, stock, rules });
const everything = (s) => [...s.hands.flat(), ...s.stock, ...s.discard, ...s.table.flatMap((p) => [p.attack, p.defense].filter(Boolean))];

test('the deal: 36 cards, six each, the next turned under the stock as trump; the lowest trump leads', () => {
  const s = deal({ players: 3, dealer: 0, randomInt: seeded(3) });
  assert.ok(sameCards(everything(s), makeDeck('durak')));
  assert.deepEqual(s.hands.map((h) => h.length), [6, 6, 6]);
  assert.equal(s.stock.length, 18);
  assert.equal(s.trumpCard, s.stock[17]);
  assert.equal(s.trump, s.trumpCard[0]);
  const lowest = Math.min(...s.hands.flatMap((h) => h.filter((id) => id[0] === s.trump).map((id) => ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'].indexOf(id.slice(2)))));
  assert.ok(s.hands[s.attacker].some((id) => id[0] === s.trump && ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'].indexOf(id.slice(2)) === lowest));
  assert.equal(s.defender, (s.attacker + 1) % 3);
  const six = deal({ players: 6, dealer: 2, randomInt: seeded(4) });
  assert.equal(six.stock.length, 0);
  assert.equal(six.trumpCard, six.hands[2][5], 'no stock: the dealer’s last card shows trump');
  for (const p of [1, 7]) throws(() => deal({ players: p, dealer: 0, randomInt: seeded(1) }), 'players');
});

test('beats: a higher card of the suit, any trump over a plain card, a higher trump over a trump', () => {
  assert.equal(beats('h-9', 'h-7', 'c'), true);
  assert.equal(beats('h-7', 'h-9', 'c'), false);
  assert.equal(beats('s-A', 'h-7', 'c'), false, 'another plain suit never');
  assert.equal(beats('c-6', 'h-A', 'c'), true, 'the lowest trump over the highest plain card');
  assert.equal(beats('c-7', 'c-6', 'c'), true);
  assert.equal(beats('h-A', 'c-6', 'c'), false, 'nothing plain over a trump');
});

// Seat 0 attacks seat 1 (seat 0 holds the lowest trump, clubs).
const HANDS = [
  ['c-6', 'h-7', 's-7', 'd-9', 'h-K', 's-A'],
  ['h-9', 'h-8', 'c-10', 'd-7', 's-8', 'd-A'],
  ['h-6', 'd-6', 's-9', 'h-A', 'd-K', 'c-A'],
];
const STOCK = ['s-6', 'c-7', 'h-10', 'd-8', 'd-10', 'c-K'];

test('a bout: lead, beat, throw in on the ranks on the table, then bito: the defender attacks next', () => {
  const s = table(HANDS, STOCK);
  assert.equal(s.attacker, 0);
  assert.equal(s.defender, 1);
  assert.equal(s.limit, 5, 'five in the first bout');
  throws(() => act(s, 1, { type: 'attack', card: 'h-9' }), 'turn');
  act(s, 0, { type: 'attack', card: 'h-7' });
  assert.equal(s.turn, 1);
  throws(() => act(s, 1, { type: 'beat', card: 'd-7', at: 0 }), 'beat');
  act(s, 1, { type: 'beat', card: 'h-8', at: 0 });
  // Ranks on the table: 7 and 8. Seat 0 throws in its spade 7; seat 2 has nothing of them.
  assert.deepEqual(D.attackCards(s, 0), ['s-7']);
  assert.deepEqual(D.attackCards(s, 2), []);
  throws(() => act(s, 2, { type: 'attack', card: 'h-6' }), 'throw-in');
  act(s, 0, { type: 'attack', card: 's-7' });
  // Beaten, and nobody holds a 7 or an 8 any more: bito, without anyone saying so.
  const events = act(s, 1, { type: 'beat', card: 's-8', at: 1 });
  assert.ok(events.some((e) => e.type === 'bito'));
  assert.equal(s.discard.length, 4);
  // Everyone draws back to six, the attacker first; the defender attacks now.
  assert.deepEqual(s.hands.map((h) => h.length), [6, 6, 6]);
  assert.deepEqual(s.hands[0].slice(-2), ['s-6', 'c-7']);
  assert.equal(s.attacker, 1);
  assert.equal(s.defender, 2);
  assert.equal(s.limit, 6);
});

test('taking: the defender picks the table up (the others may still throw in), the player after attacks', () => {
  const s = table(HANDS, STOCK);
  act(s, 0, { type: 'attack', card: 'h-7' });
  act(s, 1, { type: 'take' });
  assert.equal(s.taking, true);
  throws(() => act(s, 1, { type: 'beat', card: 'h-8', at: 0 }), 'turn');
  // Seat 0 may still throw in its spade 7; then nobody has another 7 to add: taken at once.
  assert.ok(moves(s, 0).some((m) => m.type === 'pass'), 'or seat 0 could say it’s done');
  const events = act(s, 0, { type: 'attack', card: 's-7' });
  assert.ok(events.some((e) => e.type === 'took'));
  assert.equal(s.hands[1].length, 8, 'six and the two taken');
  assert.equal(s.attacker, 2, 'the defender took: the next player attacks');
  assert.equal(s.defender, 0);
});

test('never more on the table than the defender can answer', () => {
  const s = table([['c-6', 'h-7', 's-7', 'd-7', 'c-7'], ['h-9'], ['s-9']], []);
  assert.equal(s.limit, 1, 'the defender holds one card');
  act(s, 0, { type: 'attack', card: 'h-7' });
  assert.deepEqual(D.attackCards(s, 0), []);
});

test('going out and the Durak: the last one holding cards loses a point', () => {
  // No stock (the dealer's last card, a spade, shows trump): seat 0 leads its spade 6, seat 1 beats
  // it with its last card; both are out, seat 2 is left holding cards.
  const s = table([['s-6'], ['s-8'], ['h-9', 's-9']], []);
  act(s, 0, { type: 'attack', card: 's-6' });
  act(s, 1, { type: 'beat', card: 's-8', at: 0 });
  assert.equal(s.phase, 'done');
  assert.equal(s.loser, 2);
  assert.deepEqual(s.result.points, [0, 0, -1]);
  assert.deepEqual(s.out, [0, 1]);
});

test('the last two out together: a draw, nobody is the Durak', () => {
  const s = table([['h-7'], ['h-9']], []);
  act(s, 0, { type: 'attack', card: 'h-7' });
  act(s, 1, { type: 'beat', card: 'h-9', at: 0 });
  assert.equal(s.phase, 'done');
  assert.equal(s.loser, null);
  assert.deepEqual(s.result.points, [0, 0]);
});

test('transfer (house rule): a card of the attack’s rank passes it on to the next player', () => {
  const hands = [['c-6', 'h-7', 'd-K'], ['s-7', 'h-9', 'c-8'], ['h-6', 'd-6', 's-9', 'h-A']];
  const s = table(hands, ['c-A'], { transfer: true });
  act(s, 0, { type: 'attack', card: 'h-7' });
  assert.deepEqual(D.transferCards(s, 1), ['s-7']);
  act(s, 1, { type: 'transfer', card: 's-7' });
  assert.equal(s.attacker, 1);
  assert.equal(s.defender, 2);
  assert.equal(s.table.length, 2);
  const off = table(hands, ['c-A']);
  act(off, 0, { type: 'attack', card: 'h-7' });
  assert.deepEqual(D.transferCards(off, 1), [], 'off by default');
});

test('throwing in only from the neighbours (house rule)', () => {
  const hands = [['c-6', 'h-7'], ['h-9', 'h-8'], ['s-7', 'd-9'], ['d-7', 's-8']];
  const s = table(hands, ['c-A'], { throwIn: 'neighbours' });
  act(s, 0, { type: 'attack', card: 'h-7' });
  // The defender is 1; its neighbours are 0 (the attacker) and 2. Seat 3 may not throw in.
  assert.deepEqual(D.throwers(s).sort(), [0, 2]);
  assert.deepEqual(D.attackCards(s, 3), []);
});

test('a view: your own hand, the others as counts; the table and the trump card for everyone', () => {
  const s = table(HANDS, STOCK);
  const v = view(s, 2);
  assert.deepEqual(v.counts, [6, 6, 6]);
  assert.equal(v.trumpCard, 'c-K');
  for (const id of cardsIn(v)) assert.ok(HANDS[2].includes(id) || id === 'c-K', `seat 2 sees ${id}`);
  assert.equal(view(s, null).hand, null);
});
