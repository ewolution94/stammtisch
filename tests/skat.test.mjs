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
function finished({ game, hand = false, schneider = false, schwarz = false, ouvert = false, bid = 18, mine, skat = ['c-7', 'c-8'], augen, declTricks = 1, otherTricks = 9, scoring, doubled = 0 }) {
  const s = deal({ randomInt: seeded(1), rules: scoring ? { scoring } : {} });
  s.doubled = doubled;
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

test('Hand and announcements: an announced level counts whether made or not, and none twice (ISkO 2.5.7)', () => {
  const made = finished({ game: 'grand', hand: true, schneider: true, mine: ['c-J', 's-J', 'h-J', 'd-J'], augen: 92 });
  // mit 4, Spiel, Hand, Schneider, Schneider angesagt: 8 × 24.
  assert.equal(made.value, 192);
  assert.equal(made.won, true);
  // The ISkO's example: the defenders get 32, the announced Schneider is missed: lost with the same 8.
  const missed = finished({ game: 'grand', hand: true, schneider: true, mine: ['c-J', 's-J', 'h-J', 'd-J'], augen: 88 });
  assert.equal(missed.won, false);
  assert.equal(missed.value, 192);
  assert.deepEqual(missed.points, [0, -384, 0]);
  // Kreuz mit 3, Schwarz announced and made: 3 + Spiel, Hand, Schneider, angesagt, Schwarz, angesagt = 9 × 12.
  const black = finished({ game: 'c', hand: true, schneider: true, schwarz: true, mine: ['c-J', 's-J', 'h-J'], augen: 120, declTricks: 10, otherTricks: 0 });
  assert.equal(black.value, 108);
  // Kreuz ouvert mit 2: everything announced, and Ouvert: 9 × 12.
  const open = finished({ game: 'c', hand: true, schneider: true, schwarz: true, ouvert: true, mine: ['c-J', 's-J'], augen: 120, declTricks: 10, otherTricks: 0 });
  assert.equal(open.value, 108);
  // Grand ouvert mit 4: the highest game there is.
  const top = finished({ game: 'grand', hand: true, schneider: true, schwarz: true, ouvert: true, mine: ['c-J', 's-J', 'h-J', 'd-J'], augen: 120, declTricks: 10, otherTricks: 0 });
  assert.equal(top.value, 264);
});

test('the declarer Schneider himself: Pik ohne 1 at 33, 30 Augen: ohne 1, Spiel 2, Schneider 3: −66', () => {
  const r = finished({ game: 's', mine: ['s-J'], augen: 30, bid: 33 });
  assert.deepEqual(r.matadors, { mit: false, n: 1 });
  assert.equal(r.won, false);
  assert.equal(r.overbid, false);
  assert.deepEqual(r.points, [0, -66, 0]);
});

test('overbid: lost, at the bid rounded up to the game’s next multiple (ISkO 3.6.1, 3.6.3)', () => {
  // Bid 45, Herz mit 3: 40 without Schneider: lost as 50.
  const herz = finished({ game: 'h', mine: ['c-J', 's-J', 'h-J'], augen: 80, bid: 45 });
  assert.equal(herz.overbid, true);
  assert.equal(herz.won, false);
  assert.deepEqual(herz.points, [0, -100, 0]);
  // Kreuz Hand overbid at 40: valued 48.
  const kreuz = finished({ game: 'c', hand: true, mine: ['c-J'], augen: 70, bid: 40 });
  assert.equal(kreuz.value, 48);
  // Herz Hand at 60 with the Herz Unter in the Skat: ohne 2, Spiel, Hand = 40: lost as 60.
  const hand = finished({ game: 'h', hand: true, mine: ['h-A'], skat: ['h-J', 'c-7'], augen: 80, bid: 60 });
  assert.deepEqual(hand.matadors, { mit: false, n: 2 });
  assert.deepEqual(hand.points, [0, -120, 0]);
});

test('an overbid Null is lost the moment it’s declared, as the cheapest suit or Grand game reaching the bid', () => {
  const s = deal({ randomInt: seeded(9) });
  bidTo(s, 24);
  act(s, 1, { type: 'take' });
  act(s, 1, { type: 'discard', cards: s.hands[1].slice(0, 2) });
  const events = act(s, 1, { type: 'declare', game: 'null' });
  assert.deepEqual(events.at(-1), { type: 'overbid', seat: 1 });
  assert.equal(s.phase, 'done');
  assert.equal(s.result.won, false);
  // Kreuz mit or ohne 1 is 24, the cheapest game at 24 for any hand with at most one matador.
  const cards = [...s.hands[1], ...s.put];
  assert.equal(s.result.value, S.cheapestReaching(cards, 24));
  assert.ok(s.result.value >= 24);
  // The Skatgericht's examples, for a declarer with the ♣ Unter alone (mit 1 in every game):
  // bid 24 → Kreuz 24, 30 → Herz 30, 48 → Kreuz or Grand 48, 50 → Herz 50, 60 → Herz or Kreuz 60.
  const mit1 = ['c-J', 'c-8', 's-7', 's-8', 's-9', 'h-7', 'h-8', 'h-9', 'd-7', 'd-8', 'd-9', 'c-7'];
  assert.deepEqual([24, 30, 48, 50, 60].map((bid) => S.cheapestReaching(mit1, bid)), [24, 30, 48, 50, 60]);
});

test('Vorhand alone may only play at 18', () => {
  const s = deal({ randomInt: seeded(2) });
  act(s, 1, { type: 'pass' });
  act(s, 2, { type: 'pass' });
  assert.deepEqual(moves(s, 0), [{ type: 'bid', value: 18 }, { type: 'pass' }]);
  throws(() => act(s, 0, { type: 'bid', value: 20 }), 'bid');
});

test('Kontra and Re (house rule): a defender before their first card, the declarer’s answer at once; the score doubles, not the bid check', () => {
  const s = deal({ rules: { kontra: true }, randomInt: seeded(12) });
  bidTo(s, 18);
  act(s, 1, { type: 'hand' });
  act(s, 1, { type: 'declare', game: 'grand' });
  throws(() => act(s, 1, { type: 'kontra' }), 'kontra');
  throws(() => act(s, 1, { type: 're' }), 're');
  act(s, 2, { type: 'kontra' });
  throws(() => act(s, 0, { type: 'kontra' }), 'kontra');
  assert.ok(moves(s, 1).some((m) => m.type === 're'));
  // A card played first: the moment for Re is gone.
  act(s, 0, { type: 'play', card: legalCards(s, 0)[0] });
  throws(() => act(s, 1, { type: 're' }), 're');
  const off = deal({ randomInt: seeded(12) });
  bidTo(off, 18);
  act(off, 1, { type: 'hand' });
  act(off, 1, { type: 'declare', game: 'grand' });
  throws(() => act(off, 2, { type: 'kontra' }), 'kontra');
  // Kontra doubles the score, Re again; the list's 50 and 40 stay.
  assert.deepEqual(finished({ game: 'c', mine: ['c-J', 's-J'], augen: 70, doubled: 1 }).points, [0, 72, 0]);
  assert.deepEqual(finished({ game: 'c', mine: ['c-J', 's-J'], augen: 50, doubled: 2 }).points, [0, -288, 0]);
  assert.deepEqual(finished({ game: 'c', mine: ['c-J', 's-J'], augen: 50, doubled: 1, scoring: 'list' }).points, [40, -194, 40]);
  // The bid is checked against the undoubled value: Kreuz mit 2 (36) at a bid of 40 is overbid even with Kontra.
  const over = finished({ game: 'c', mine: ['c-J', 's-J'], augen: 70, bid: 40, doubled: 1 });
  assert.equal(over.overbid, true);
  assert.equal(over.value, 96);
});

test('the list (ISkO): +50 a won game, −2 × value −50 a lost one, the other two 40 each', () => {
  const won = finished({ game: 'c', mine: ['c-J', 's-J'], augen: 70, scoring: 'list' });
  assert.deepEqual(won.points, [0, 86, 0]);
  const lost = finished({ game: 'c', mine: ['c-J', 's-J'], augen: 50, scoring: 'list' });
  assert.deepEqual(lost.points, [40, -122, 40]);
});

test('Ramsch (house rule): the most Augen lose them, the Skat added; a Jungfrau doubles; a Durchmarsch wins 120', () => {
  const ramsch = (tricks, skat = ['c-7', 'c-8']) => {
    const s = deal({ rules: { ramsch: true }, randomInt: seeded(1) });
    s.contract = { game: 'ramsch', hand: false, schneider: false, schwarz: false, ouvert: false };
    s.skat = skat;
    s.tricks = tricks.map(([winner, augen]) => ({ lead: 0, cards: [], winner, augen }));
    return S.score(s);
  };
  const plain = ramsch([[0, 40], [1, 50], [2, 30], ...Array(7).fill([0, 0])], ['c-A', 'c-7']);
  assert.deepEqual(plain.augen, [40, 61, 30]);
  assert.deepEqual(plain.points, [0, -61, 0]);
  const virgin = ramsch([[0, 70], [1, 50], ...Array(8).fill([0, 0])]);
  assert.equal(virgin.jungfrau, 1);
  assert.deepEqual(virgin.points, [-140, 0, 0]);
  const tie = ramsch([[0, 60], [1, 60], [2, 0], ...Array(7).fill([2, 0])]);
  assert.deepEqual(tie.points, [-60, -60, 0]);
  const through = ramsch(Array(10).fill([2, 12]));
  assert.deepEqual(through.points, [0, 0, 120]);
  // Everyone passes with Ramsch on: no redeal, Ramsch is played.
  const s = deal({ rules: { ramsch: true }, randomInt: seeded(2) });
  act(s, 1, { type: 'pass' });
  act(s, 2, { type: 'pass' });
  act(s, 0, { type: 'pass' });
  assert.equal(s.phase, 'play');
  assert.equal(s.contract.game, 'ramsch');
  assert.equal(s.turn, 0);
});
test('the Skat counts for the declarer, and for its matadors', () => {
  const r = finished({ game: 'd', mine: ['s-J'], skat: ['c-J', 'h-7'], augen: 63 });
  assert.deepEqual(r.matadors, { mit: true, n: 2 });
  assert.equal(r.value, 27);
});
