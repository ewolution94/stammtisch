import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AUGEN, DECK_RANKS, RANKS, SUITS, augen, cardId, dealPackets, isCard, makeDeck, nextSeat, parseCard,
  rankOf, shuffled, sortBy, suitOf, sumAugen, takeCard, tally,
} from '../server/core/cards.mjs';
import { legalFollow, trickAugen, trickWinner } from '../server/core/tricks.mjs';
import { seeded, sameCards, throws } from './helpers.mjs';

test('card ids: suit and rank both ways; anything else is refused', () => {
  assert.deepEqual(parseCard('h-10'), { s: 'h', r: '10' });
  assert.deepEqual(parseCard('c-Q'), { s: 'c', r: 'Q' });
  assert.deepEqual(parseCard('d-2'), { s: 'd', r: '2' });
  assert.equal(cardId('s', 'A'), 's-A');
  assert.equal(suitOf('d-A'), 'd');
  assert.equal(rankOf('d-A'), 'A');
  for (const s of SUITS) for (const r of RANKS) assert.equal(cardId(...Object.values(parseCard(cardId(s, r)))), cardId(s, r));
  for (const bad of ['h-1', 'h-11', 'h-01', 'x-10', 'H-10', 'h10', 'h-q', 'h-', '-Q', '', null, undefined, 10, {}]) {
    throws(() => parseCard(bad), 'card');
    assert.equal(isCard(bad), false);
  }
});

test('decks: Skat 32, Doppelkopf 48 (twice 9 to Ass) or 40 without the nines, Durak 36, full 52', () => {
  const skat = makeDeck('skat');
  assert.equal(skat.length, 32);
  assert.equal(new Set(skat).size, 32);
  assert.deepEqual(skat.slice(0, 8), ['c-7', 'c-8', 'c-9', 'c-10', 'c-J', 'c-Q', 'c-K', 'c-A']);
  assert.equal(skat[31], 'd-A');
  const doko = makeDeck('doko', 2);
  assert.equal(doko.length, 48);
  assert.equal(new Set(doko).size, 24);
  for (const n of tally(doko).values()) assert.equal(n, 2);
  assert.equal(makeDeck('doko40', 2).length, 40);
  assert.ok(!makeDeck('doko40', 2).some((id) => rankOf(id) === '9'));
  assert.equal(makeDeck('durak').length, 36);
  assert.equal(makeDeck('full').length, 52);
  assert.equal(makeDeck('skat', 2).length, 64);
  assert.ok(Object.isFrozen(DECK_RANKS.skat));
  throws(() => makeDeck('tarot'), 'deck');
});

test('Augen: Ass 11, Zehn 10, König 4, Ober 3, Unter 2, the rest nothing; 120 in a Skat deck, 240 in Doppelkopf', () => {
  assert.deepEqual({ ...AUGEN }, { A: 11, 10: 10, K: 4, Q: 3, J: 2 });
  assert.equal(augen('h-A'), 11);
  assert.equal(augen('h-9'), 0);
  assert.equal(augen('c-7'), 0);
  assert.equal(sumAugen(makeDeck('skat')), 120);
  assert.equal(sumAugen(makeDeck('doko', 2)), 240);
  assert.equal(sumAugen([]), 0);
});

test('shuffled: a new array, same cards, repeatable for a seed, box order for a random that never swaps', () => {
  const deck = makeDeck('skat');
  const before = [...deck];
  const a = shuffled(deck, seeded(1));
  assert.deepEqual(deck, before);
  assert.ok(sameCards(a, deck));
  assert.notDeepEqual(a, deck);
  assert.deepEqual(shuffled(deck, seeded(1)), a);
  assert.notDeepEqual(shuffled(deck, seeded(2)), a);
  assert.deepEqual(shuffled(deck, (n) => n - 1), deck);
  assert.throws(() => shuffled(deck), TypeError);
});

test('dealPackets: packets round the table from the first seat, the rest kept in order', () => {
  const deck = makeDeck('skat');
  // Skat's 3-4-3 to three players from seat 1, two left over (the Skat).
  const { hands, rest } = dealPackets(deck, { players: 3, first: 1, packets: [3, 4, 3] });
  assert.deepEqual(hands[1].slice(0, 3), deck.slice(0, 3));
  assert.deepEqual(hands[2].slice(0, 3), deck.slice(3, 6));
  assert.deepEqual(hands[0].slice(0, 3), deck.slice(6, 9));
  assert.deepEqual(hands[1].slice(3, 7), deck.slice(9, 13));
  assert.deepEqual(hands.map((h) => h.length), [10, 10, 10]);
  assert.deepEqual(rest, deck.slice(30));
  // The other way round.
  const back = dealPackets(deck, { players: 4, first: 0, packets: [1], dir: -1 });
  assert.deepEqual(back.hands.map((h) => h[0]), [deck[0], deck[3], deck[2], deck[1]]);
  throws(() => dealPackets(deck, { players: 4, first: 0, packets: [9] }), 'deck');
});

test('takeCard takes one copy; nextSeat goes round both ways', () => {
  const hand = ['h-10', 'c-Q', 'h-10'];
  assert.equal(takeCard(hand, 'h-10'), 'h-10');
  assert.deepEqual(hand, ['c-Q', 'h-10']);
  throws(() => takeCard(hand, 'd-A'), 'card');
  assert.equal(nextSeat(3, 4), 0);
  assert.equal(nextSeat(0, 4, -1), 3);
  assert.equal(nextSeat(1, 4, 2), 3);
  assert.equal(nextSeat(1, 4, -6), 3);
  assert.deepEqual(sortBy(['b', 'a', 'c'], (x) => ({ a: 1, b: 2, c: 0 })[x]), ['c', 'a', 'b']);
});

// ---- tricks, with a toy ranking: hearts are trump, plain suits rank by Augen then value ----------

const ORDER = ['7', '8', '9', 'J', 'Q', 'K', '10', 'A'];
const toy = { cls: (id) => (suitOf(id) === 'h' ? 'trump' : suitOf(id)), rank: (id) => ORDER.indexOf(rankOf(id)) };
const T = (...cards) => cards.map((card, seat) => ({ seat, card }));

test('legalFollow: the class led if you hold it, else anything; anything on an empty trick', () => {
  const hand = ['c-7', 'h-A', 's-K', 'c-A'];
  assert.deepEqual(legalFollow(hand, [], toy), hand);
  assert.deepEqual(legalFollow(hand, T('c-10'), toy), ['c-7', 'c-A']);
  assert.deepEqual(legalFollow(hand, T('h-7'), toy), ['h-A']);
  assert.deepEqual(legalFollow(hand, T('d-7'), toy), hand);
  assert.deepEqual(legalFollow(['c-7', 'c-7'], T('c-A'), toy), ['c-7', 'c-7']);
});

test('trickWinner: highest of the suit led, a trump over any plain card, other suits never; equal: the first', () => {
  assert.equal(trickWinner([], toy), -1);
  assert.equal(trickWinner(T('c-7', 'c-A', 'c-10'), toy), 1);
  assert.equal(trickWinner(T('c-7', 's-A', 'd-A'), toy), 0);
  assert.equal(trickWinner(T('c-A', 'h-7', 'c-10'), toy), 1);
  assert.equal(trickWinner(T('c-A', 'h-7', 'h-8', 's-A'), toy), 2);
  assert.equal(trickWinner(T('h-7', 'c-A', 'h-8'), toy), 2);
  // Two equal cards: the first one played.
  assert.equal(trickWinner(T('c-K', 'c-A', 'c-A'), toy), 1);
  // A game may let the later one win (Doppelkopf's house rule for the Dullen), here only the hearts Ass,
  // and only when it isn't the last trick.
  const later = { ...toy, tie: (id, ctx) => id === 'h-A' && !ctx.last };
  assert.equal(trickWinner(T('h-A', 'h-A'), later), 1);
  assert.equal(trickWinner(T('h-A', 'h-A'), later, { last: true }), 0);
  assert.equal(trickWinner(T('c-A', 'c-A'), later), 0);
  assert.equal(trickAugen(T('c-A', 'h-10', 'c-K', 's-9')), 25);
});
