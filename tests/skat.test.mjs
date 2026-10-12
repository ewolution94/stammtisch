import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDeck, sumAugen } from '../server/core/cards.mjs';
import { trickWinner } from '../server/core/tricks.mjs';
import * as S from '../server/games/skat.mjs';
import { cardsIn, sameCards, seeded, throws } from './helpers.mjs';

const { act, deal, legalCards, matadors, moves, ranking, view } = S;

/** A fixed deal: the given cards for some seats and the Skat, the rest in box order. Dealer 2: seat 0 Vorhand. */
function hands(given = {}, skat = null) {
  const left = makeDeck('skat');
  for (const cards of [...Object.values(given), skat ?? []]) for (const id of cards) left.splice(left.indexOf(id), 1);
  const hs = [0, 1, 2].map((s) => {
    const h = [...(given[s] ?? [])];
    while (h.length < 10) h.push(/** @type {string} */ (left.shift()));
    return h;
  });
  return { hands: hs, skat: skat ?? left.splice(0, 2) };
}

/** Bidding done the short way: Mittelhand says `bid`, Vorhand passes, Hinterhand passes. Declarer: seat 1. */
function bidTo(s, bid = 18) {
  act(s, 1, { type: 'bid', value: bid });
  act(s, 0, { type: 'pass' });
  act(s, 2, { type: 'pass' });
}

// ---- values and ranks --------------------------------------------------------------------------------

test('the bid values: 18, 20, 22, 23, 24, 27 … up to 264, every game value there is', () => {
  assert.deepEqual(S.BIDS.slice(0, 20), [18, 20, 22, 23, 24, 27, 30, 33, 35, 36, 40, 44, 45, 46, 48, 50, 54, 55, 59, 60]);
  assert.equal(S.BIDS.at(-1), 264);
  assert.ok(S.BIDS.includes(23) && S.BIDS.includes(35) && S.BIDS.includes(46) && S.BIDS.includes(59), 'the Null values');
  assert.ok(!S.BIDS.includes(21) && !S.BIDS.includes(25));
});

test('a suit game: the four Unter, then the suit A 10 K O 9 8 7; plain suits A 10 K O 9 8 7', () => {
  const r = ranking('h');
  const trumps = makeDeck('skat').filter((id) => r.cls(id) === 'trump').sort((a, b) => r.rank(b) - r.rank(a));
  assert.deepEqual(trumps, ['c-J', 's-J', 'h-J', 'd-J', 'h-A', 'h-10', 'h-K', 'h-Q', 'h-9', 'h-8', 'h-7']);
  const clubs = makeDeck('skat').filter((id) => r.cls(id) === 'c').sort((a, b) => r.rank(b) - r.rank(a));
  assert.deepEqual(clubs, ['c-A', 'c-10', 'c-K', 'c-Q', 'c-9', 'c-8', 'c-7']);
});

test('the Grand: only the Unter are trump; Null: no trump, A K O U 10 9 8 7', () => {
  const g = ranking('grand');
  assert.deepEqual(makeDeck('skat').filter((id) => g.cls(id) === 'trump'), ['c-J', 's-J', 'h-J', 'd-J']);
  const n = ranking('null');
  assert.equal(n.cls('c-J'), 'c');
  const hearts = makeDeck('skat').filter((id) => n.cls(id) === 'h').sort((a, b) => n.rank(b) - n.rank(a));
  assert.deepEqual(hearts, ['h-A', 'h-K', 'h-Q', 'h-J', 'h-10', 'h-9', 'h-8', 'h-7']);
});

test('tricks: a trump beats every plain card, the highest of the suit led otherwise', () => {
  const T = (...cards) => cards.map((card, seat) => ({ seat, card }));
  assert.equal(trickWinner(T('c-A', 'd-J', 'c-10'), ranking('h')), 1);
  assert.equal(trickWinner(T('c-10', 'c-A', 'h-7'), ranking('h')), 2);
  assert.equal(trickWinner(T('c-10', 'c-A', 'h-7'), ranking('grand')), 1);
  assert.equal(trickWinner(T('c-10', 'c-J', 'c-9'), ranking('null')), 1, 'in Null the Unter ranks above the 10');
});

test('matadors: with the ♣ Unter, how many from the top in a row; without, how many missing', () => {
  assert.deepEqual(matadors(['c-J', 's-J', 'd-J'], 'c'), { mit: true, n: 2 });
  assert.deepEqual(matadors(['c-J', 's-J', 'h-J', 'd-J', 'c-A', 'c-10'], 'c'), { mit: true, n: 6 });
  assert.deepEqual(matadors(['s-J', 'h-A'], 'h'), { mit: false, n: 1 });
  assert.deepEqual(matadors(['h-A'], 'h'), { mit: false, n: 4 });
  assert.deepEqual(matadors(['h-10'], 'h'), { mit: false, n: 5 });
  assert.deepEqual(matadors(['c-J', 's-J', 'h-J', 'd-J'], 'grand'), { mit: true, n: 4 });
  assert.deepEqual(matadors(['d-J'], 'grand'), { mit: false, n: 3 });
});

// ---- the deal and the bidding ----------------------------------------------------------------------------

test('the deal: ten each, two in the Skat; Mittelhand says first, to Vorhand', () => {
  const s = deal({ randomInt: seeded(4) });
  assert.ok(sameCards([...s.hands.flat(), ...s.skat], makeDeck('skat')));
  assert.deepEqual(s.hands.map((h) => h.length), [10, 10, 10]);
  assert.deepEqual(S.positions(s), [0, 1, 2]);
  assert.equal(s.turn, 1);
  assert.deepEqual(moves(s, 1).slice(0, 2), [{ type: 'bid', value: 18 }, { type: 'bid', value: 20 }]);
  throws(() => deal({ hands: [[], [], []], skat: [] }), 'deal');
  assert.throws(() => deal({}), TypeError);
});

test('bidding: Mittelhand says, Vorhand holds or passes; then Hinterhand says to whoever is left', () => {
  const s = deal({ randomInt: seeded(1) });
  throws(() => act(s, 0, { type: 'hold' }), 'turn');
  throws(() => act(s, 1, { type: 'hold' }), 'say');
  throws(() => act(s, 1, { type: 'bid', value: 19 }), 'bid');
  act(s, 1, { type: 'bid', value: 18 });
  throws(() => act(s, 1, { type: 'bid', value: 20 }), 'turn');
  throws(() => act(s, 0, { type: 'bid', value: 20 }), 'answer');
  act(s, 0, { type: 'hold' });
  throws(() => act(s, 1, { type: 'bid', value: 18 }), 'bid');
  act(s, 1, { type: 'bid', value: 20 });
  act(s, 0, { type: 'pass' });
  // Hinterhand now says to Mittelhand, from above 20.
  assert.equal(s.turn, 2);
  assert.equal(moves(s, 2)[0].value, 22);
  act(s, 2, { type: 'bid', value: 22 });
  act(s, 1, { type: 'hold' });
  const events = act(s, 2, { type: 'pass' });
  assert.deepEqual(events.at(-1), { type: 'declarer', seat: 1, bid: 22 });
  assert.equal(s.phase, 'skat');
  assert.equal(s.declarer, 1);
  assert.equal(s.bid, 22);
});

test('bidding: nobody says a value, Vorhand may play at 18; or everyone passes and it’s dealt again', () => {
  const s = deal({ randomInt: seeded(2) });
  act(s, 1, { type: 'pass' });
  act(s, 2, { type: 'pass' });
  assert.equal(s.turn, 0);
  assert.equal(s.bidding.stage, 3);
  act(s, 0, { type: 'bid', value: 18 });
  assert.equal(s.declarer, 0);
  const t = deal({ randomInt: seeded(2) });
  act(t, 1, { type: 'pass' });
  act(t, 2, { type: 'pass' });
  act(t, 0, { type: 'pass' });
  assert.equal(t.phase, 'done');
  assert.deepEqual(t.result, { void: 'passed', redeal: true, points: [0, 0, 0] });
});

test('Mittelhand passes at once: Hinterhand says to Vorhand', () => {
  const s = deal({ randomInt: seeded(3) });
  act(s, 1, { type: 'pass' });
  act(s, 2, { type: 'bid', value: 18 });
  assert.equal(s.turn, 0);
  act(s, 0, { type: 'pass' });
  assert.equal(s.declarer, 2);
});

// ---- the Skat, the declaration ------------------------------------------------------------------------------

test('the Skat: picked up, two put back, then the game; Hand: the Skat stays, announcements allowed', () => {
  const s = deal({ randomInt: seeded(5) });
  bidTo(s);
  const skat = [...s.skat];
  act(s, 1, { type: 'take' });
  assert.equal(s.hands[1].length, 12);
  assert.equal(s.phase, 'discard');
  throws(() => act(s, 1, { type: 'discard', cards: [skat[0]] }), 'cards');
  act(s, 1, { type: 'discard', cards: skat });
  assert.deepEqual(s.put, skat);
  throws(() => act(s, 1, { type: 'declare', game: 'c', schneider: true }), 'announce');
  throws(() => act(s, 1, { type: 'declare', game: 'x' }), 'game');
  act(s, 1, { type: 'declare', game: 'null', ouvert: true });
  assert.deepEqual(s.contract, { game: 'null', hand: false, schneider: false, schwarz: false, ouvert: true });
  assert.equal(s.turn, 0, 'Vorhand leads');

  const h = deal({ randomInt: seeded(5) });
  bidTo(h);
  act(h, 1, { type: 'hand' });
  assert.equal(h.phase, 'declare');
  throws(() => act(h, 1, { type: 'declare', game: 'c', ouvert: true }), 'announce');
  act(h, 1, { type: 'declare', game: 'c', schneider: true, schwarz: true });
  assert.deepEqual(h.contract, { game: 'c', hand: true, schneider: true, schwarz: true, ouvert: false });
});

test('following: trump on trump (the Unter are trump), the suit on a plain suit; in Null an Unter is its suit', () => {
  const { hands: hs, skat } = hands({ 0: ['c-A'], 1: ['c-J', 'c-7', 'h-7'] });
  const s = deal({ hands: hs, skat });
  bidTo(s);
  act(s, 1, { type: 'hand' });
  act(s, 1, { type: 'declare', game: 'h' });
  act(s, 0, { type: 'play', card: 'c-A' });
  // Clubs led: the ♣ Unter is a trump, not a club.
  assert.ok(!legalCards(s, 1).includes('c-J'));
  assert.ok(legalCards(s, 1).includes('c-7'));
  throws(() => act(s, 1, { type: 'play', card: 'c-J' }), 'follow');
  const n = deal({ hands: hs, skat });
  bidTo(n, 23);
  act(n, 1, { type: 'hand' });
  act(n, 1, { type: 'declare', game: 'null' });
  act(n, 0, { type: 'play', card: 'c-A' });
  assert.ok(legalCards(n, 1).includes('c-J'), 'in Null the ♣ Unter follows clubs');
});

test('Null ends the moment the declarer takes a trick, lost', () => {
  const { hands: hs, skat } = hands({ 0: ['c-7'], 1: ['c-A'], 2: ['c-8'] });
  const s = deal({ hands: hs, skat });
  bidTo(s, 23);
  act(s, 1, { type: 'hand' });
  act(s, 1, { type: 'declare', game: 'null' });
  act(s, 0, { type: 'play', card: 'c-7' });
  act(s, 1, { type: 'play', card: 'c-A' });
  act(s, 2, { type: 'play', card: 'c-8' });
  assert.equal(s.phase, 'done');
  assert.equal(s.result.won, false);
  // Null Hand: 35; lost, twice that, minus.
  assert.equal(s.result.value, 35);
  assert.deepEqual(s.result.points, [0, -70, 0]);
});

// ---- the game value ----------------------------------------------------------------------------------------------

/**
 * A finished suit or Grand game for scoring: the declarer (seat 1) held exactly `mine` (plus the
 * Skat), and took `augen` with the Skat in `declTricks` tricks; the defenders' cards carry the Augen.
 */
function finished({ game, hand = false, schneider = false, schwarz = false, ouvert = false, bid = 18, mine, skat = ['c-7', 'c-8'], augen, declTricks = 1, otherTricks = 9, scoring }) {
  const s = deal({ randomInt: seeded(1), rules: scoring ? { scoring } : {} });
  s.hands = [[], [...mine], []];
  s.phase = 'done';
  s.declarer = 1;
  s.bid = bid;
  s.took = !hand;
  s.put = hand ? [] : [...skat];
  s.skat = hand ? [...skat] : [];
  s.contract = { game, hand, schneider, schwarz, ouvert };
  const trickAugen = augen - sumAugen(skat);
  s.tricks = [
    ...Array.from({ length: declTricks }, (_, i) => ({ lead: 0, cards: cardsWorth(i ? 0 : trickAugen), winner: 1, augen: i ? 0 : trickAugen })),
    ...Array.from({ length: otherTricks }, () => ({ lead: 0, cards: [], winner: 0, augen: 0 })),
  ];
  return S.score(s);
}

/** Cards a defender played, adding up to exactly `n` Augen (repeats are fine: only the sum counts). */
function cardsWorth(n) {
  const coins = [['h-A', 11], ['h-10', 10], ['h-K', 4], ['h-Q', 3], ['h-J', 2]];
  const best = [[]];
  for (let k = 1; k <= n; k++) {
    best[k] = null;
    for (const [id, v] of coins) if (v <= k && best[k - v]) { best[k] = [...best[k - v], id]; break; }
  }
  assert.ok(best[n], `${n} Augen can be made`);
  return best[n].map((card) => ({ seat: 0, card }));
}

test('Kreuz mit 2 (♣ and ♠ Unter): 12 × 3 = 36, won with 61', () => {
  const r = finished({ game: 'c', mine: ['c-J', 's-J', 'c-A'], augen: 61 });
  assert.deepEqual(r.matadors, { mit: true, n: 2 });
  assert.equal(r.won, true);
  assert.equal(r.value, 36);
  assert.deepEqual(r.points, [0, 36, 0]);
});

test('60 Augen lose; 30 or less is Schneider, for the declarer too', () => {
  const lost = finished({ game: 'c', mine: ['c-J', 's-J'], augen: 60 });
  assert.equal(lost.won, false);
  assert.equal(lost.value, 36);
  assert.deepEqual(lost.points, [0, -72, 0]);
  const cut = finished({ game: 's', mine: ['h-J', 's-A'], augen: 28 });
  // ohne 2, Spiel 3, Schneider 4: 44, lost twice.
  assert.deepEqual(cut.matadors, { mit: false, n: 2 });
  assert.equal(cut.value, 44);
  assert.equal(cut.points[1], -88);
});

test('Schneider and Schwarz: 90 is Schneider; every trick is Schwarz too', () => {
  const sch = finished({ game: 'h', mine: ['c-J'], augen: 95 });
  assert.equal(sch.value, 10 * 3);
  const black = finished({ game: 'h', mine: ['c-J'], augen: 120, declTricks: 10, otherTricks: 0 });
  // mit 1, Spiel, Schneider, Schwarz: 4 × 10.
  assert.equal(black.value, 40);
});

test('Hand and announcements: Grand Hand mit 4, Schneider announced and made: 24 × 7 = 168', () => {
  const r = finished({ game: 'grand', hand: true, schneider: true, mine: ['c-J', 's-J', 'h-J', 'd-J'], augen: 92, bid: 18 });
  // mit 4, Spiel, Hand, Schneider, Schneider angesagt: 4 + 1 + 1 + 1 + 1 = 8? No: 4 + 1 = 5, + Hand 6, + Schneider 7, + angesagt 8.
  assert.equal(r.value, 24 * 8);
  const missed = finished({ game: 'grand', hand: true, schneider: true, mine: ['c-J', 's-J', 'h-J', 'd-J'], augen: 85, bid: 18 });
  assert.equal(missed.won, false, 'Schneider announced needs 90');
  assert.equal(missed.value, 24 * 7);
});

test('the Skat counts for the declarer, and for its matadors', () => {
  const r = finished({ game: 'd', mine: ['s-J'], skat: ['c-J', 'h-7'], augen: 63 });
  assert.deepEqual(r.matadors, { mit: true, n: 2 });
  assert.equal(r.value, 27);
});
