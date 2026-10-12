import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDeck } from '../server/core/cards.mjs';
import { trickWinner } from '../server/core/tricks.mjs';
import * as D from '../server/games/doppelkopf.mjs';
import { cardsIn, sameCards, seeded, throws } from './helpers.mjs';

const { act, announceOptions, deal, isTrump, knownParties, legalCards, moves, ranking, view } = D;

/**
 * A fixed deal: the given cards for some seats, every other card dealt out in box order to whoever
 * still needs cards (seat 0 first). `size` 12, or 10 without the nines.
 */
function hands(given = {}, size = 12) {
  const left = makeDeck(size === 12 ? 'doko' : 'doko40', 2);
  for (const cards of Object.values(given)) for (const id of cards) left.splice(left.indexOf(id), 1);
  return [0, 1, 2, 3].map((s) => {
    const h = [...(given[s] ?? [])];
    while (h.length < size) h.push(/** @type {string} */ (left.shift()));
    return h;
  });
}

/** A deal from fixed hands, everyone healthy (or as told), so play can start. Dealer 3: seat 0 begins. */
function started(given, { rules = {}, reserve = {}, dealer = 3 } = {}) {
  const s = deal({ dealer, rules, hands: hands(given, rules.nines === false ? 10 : 12) });
  for (let k = 0; k < 4; k++) {
    const seat = s.turn;
    act(s, seat, reserve[seat] ?? { type: 'reserve', kind: 'healthy' });
    if (s.phase !== 'reserve') break;
  }
  return s;
}

/** Plays each seat's given card in turn order. */
function playTrick(s, ...cards) {
  for (const card of cards) act(s, s.turn, { type: 'play', card });
}

// ---- rules, the deal ---------------------------------------------------------------------------------------

test('house rules: the DDV by default, every switch off; wrong kinds refused', () => {
  assert.deepEqual({ ...D.RULES }, { nines: true, dulle: 'first', schweinchen: false, poverty: false, throw: false, duty: false, bock: false });
  assert.equal(D.cleanRules({ dulle: 'second' }).dulle, 'second');
  for (const bad of [{ nines: 1 }, { dulle: 'third' }, { poverty: 'yes' }]) throws(() => D.cleanRules(bad), 'rules');
});

test('the deal: 48 cards, twelve each, three at a time from the dealer’s left; without the nines 40 and ten', () => {
  const s = deal({ dealer: 1, randomInt: seeded(5) });
  assert.ok(sameCards(s.hands.flat(), makeDeck('doko', 2)));
  assert.deepEqual(s.hands.map((h) => h.length), [12, 12, 12, 12]);
  assert.equal(s.first, 2);
  assert.equal(s.turn, 2);
  assert.equal(s.phase, 'reserve');
  const short = deal({ dealer: 0, rules: { nines: false }, randomInt: seeded(5) });
  assert.ok(sameCards(short.hands.flat(), makeDeck('doko40', 2)));
  assert.equal(short.size, 10);
  throws(() => deal({ dealer: 4, randomInt: seeded(1) }), 'players');
  throws(() => deal({ dealer: 0, hands: [[], [], [], []] }), 'deal');
  const three = hands();
  three[0][0] = three[1][0];
  throws(() => deal({ dealer: 0, hands: three }), 'card');
  assert.throws(() => deal({ dealer: 0 }), TypeError);
});

// ---- trumps and ranks ---------------------------------------------------------------------------------------

/** A ranking's trumps high to low, each card once, and a plain suit's order. */
const trumpsOf = (trump, o) => {
  const r = ranking(trump, o);
  return [...new Set(makeDeck('doko'))].filter((id) => r.cls(id) === 'trump').sort((a, b) => r.rank(b) - r.rank(a));
};
const plainOf = (trump, suit) => {
  const r = ranking(trump);
  return [...new Set(makeDeck('doko'))].filter((id) => r.cls(id) === suit).sort((a, b) => r.rank(b) - r.rank(a));
};

test('the normal game: Dullen, the Ober, the Unter, then Karo; 26 trumps; ♣ ♠ A 10 K 9, ♥ A K 9', () => {
  assert.deepEqual(trumpsOf('d'), ['h-10', 'c-Q', 's-Q', 'h-Q', 'd-Q', 'c-J', 's-J', 'h-J', 'd-J', 'd-A', 'd-10', 'd-K', 'd-9']);
  assert.equal(makeDeck('doko', 2).filter((id) => isTrump(id, 'd')).length, 26);
  assert.deepEqual(plainOf('d', 'c'), ['c-A', 'c-10', 'c-K', 'c-9']);
  assert.deepEqual(plainOf('d', 's'), ['s-A', 's-10', 's-K', 's-9']);
  assert.deepEqual(plainOf('d', 'h'), ['h-A', 'h-K', 'h-9']);
  assert.deepEqual(plainOf('d', 'd'), []);
});

test('suit solos: the suit takes Karo’s place; Herz keeps the Dulle on top (24 trumps)', () => {
  assert.deepEqual(trumpsOf('c').slice(-4), ['c-A', 'c-10', 'c-K', 'c-9']);
  assert.deepEqual(trumpsOf('c').slice(0, 9), trumpsOf('d').slice(0, 9));
  assert.deepEqual(plainOf('c', 'd'), ['d-A', 'd-10', 'd-K', 'd-9']);
  assert.deepEqual(plainOf('s', 'h'), ['h-A', 'h-K', 'h-9']);
  assert.deepEqual(trumpsOf('h'), ['h-10', 'c-Q', 's-Q', 'h-Q', 'd-Q', 'c-J', 's-J', 'h-J', 'd-J', 'h-A', 'h-K', 'h-9']);
  assert.equal(makeDeck('doko', 2).filter((id) => isTrump(id, 'h')).length, 24);
  for (const t of ['c', 's', 'd']) assert.equal(makeDeck('doko', 2).filter((id) => isTrump(id, t)).length, 26);
});

test('Damen-, Buben- and the Fleischlose: only Ober, only Unter, no trump; the ♥10 is a plain heart', () => {
  assert.deepEqual(trumpsOf('Q'), ['c-Q', 's-Q', 'h-Q', 'd-Q']);
  assert.deepEqual(plainOf('Q', 'h'), ['h-A', 'h-10', 'h-K', 'h-J', 'h-9']);
  assert.deepEqual(trumpsOf('J'), ['c-J', 's-J', 'h-J', 'd-J']);
  assert.deepEqual(plainOf('J', 'c'), ['c-A', 'c-10', 'c-K', 'c-Q', 'c-9']);
  assert.deepEqual(trumpsOf(null), []);
  assert.deepEqual(plainOf(null, 's'), ['s-A', 's-10', 's-K', 's-Q', 's-J', 's-9']);
  assert.equal(isTrump('h-10', 'Q'), false);
});

test('Schweinchen: the two ♦A above the Dullen', () => {
  assert.deepEqual(trumpsOf('d', { pigs: true }).slice(0, 2), ['d-A', 'h-10']);
});

const T = (...cards) => cards.map((card, seat) => ({ seat, card }));

test('who takes a trick: the highest trump, else the highest of the suit led; of two equal cards the first', () => {
  const r = ranking('d');
  assert.equal(trickWinner(T('c-A', 'c-10', 'c-K', 'c-A'), r), 0, 'the first of two Asse');
  assert.equal(trickWinner(T('c-A', 'd-9', 'c-10', 'h-A'), r), 1, 'a Karo 9 trumps');
  assert.equal(trickWinner(T('h-9', 'h-10', 'h-A', 'h-K'), r), 1, 'the Dulle is trump, not a heart');
  assert.equal(trickWinner(T('h-10', 'h-10', 'c-Q', 'd-9'), r), 0, 'the first Dulle beats the second (DDV)');
  assert.equal(trickWinner(T('s-9', 'c-A', 'h-A', 's-K'), r), 3, 'other suits never win');
  assert.equal(trickWinner(T('c-J', 's-Q', 'c-Q', 'd-A'), r), 2);
});

test('the Dullen house rules: the second beats the first, or only outside the last trick', () => {
  const second = ranking('d', { dulle: 'second' });
  assert.equal(trickWinner(T('h-10', 'h-10', 'c-Q', 'd-9'), second), 1);
  assert.equal(trickWinner(T('h-10', 'h-10', 'c-Q', 'd-9'), second, { last: true }), 1);
  const notLast = ranking('d', { dulle: 'second-not-last' });
  assert.equal(trickWinner(T('h-10', 'h-10'), notLast), 1);
  assert.equal(trickWinner(T('h-10', 'h-10'), notLast, { last: true }), 0);
  // Two other equal cards: still the first.
  assert.equal(trickWinner(T('c-Q', 'c-Q'), second), 0);
  // In a Damensolo the ♥10 is no Dulle: the rule doesn't touch it.
  assert.equal(trickWinner(T('h-10', 'h-10'), ranking('Q', { dulle: 'second' })), 0);
});

test('following: trump on trump (the Dulle and Ober are trump), the suit on a plain suit, else anything', () => {
  const s = started({ 0: ['h-9'], 1: ['h-10', 'h-A', 'c-9'], 2: ['d-9', 'c-A'], 3: ['s-9'] });
  // Seat 1 holds hearts and a Dulle; on a heart lead the Dulle doesn't count as a heart.
  s.trick = { lead: 0, cards: [{ seat: 0, card: 'h-9' }] };
  s.turn = 1;
  const legal = new Set(legalCards(s, 1));
  assert.ok(legal.has('h-A'));
  assert.ok(!legal.has('h-10'));
  // On a trump lead (a Karo 9), the Dulle is trump.
  s.trick = { lead: 0, cards: [{ seat: 0, card: 'd-9' }] };
  assert.ok(legalCards(s, 1).every((id) => isTrump(id, 'd')));
  assert.ok(legalCards(s, 1).includes('h-10'));
});

// ---- reservations ---------------------------------------------------------------------------------------------

test('everyone healthy: a normal game; the ♣Q holders are Re; the dealer’s left leads', () => {
  const s = started({ 0: ['c-Q'], 2: ['c-Q'] });
  assert.equal(s.phase, 'play');
  assert.equal(s.contract.kind, 'normal');
  assert.deepEqual(s.parties, ['re', 'kontra', 're', 'kontra']);
  assert.equal(s.turn, 0);
  assert.deepEqual(s.reserve, ['healthy', 'healthy', 'healthy', 'healthy']);
});

test('reservations go round once from the dealer’s left; out of turn or out of phase is refused', () => {
  const s = deal({ dealer: 3, hands: hands({ 0: ['c-Q', 'c-Q'] }) });
  throws(() => act(s, 1, { type: 'reserve', kind: 'healthy' }), 'turn');
  throws(() => act(s, 0, { type: 'play', card: 'c-Q' }), 'phase');
  throws(() => act(s, 0, { type: 'announce', level: 0 }), 'phase');
  throws(() => act(s, 1, { type: 'reserve', kind: 'wedding' }), 'turn');
  throws(() => act(s, 0, { type: 'reserve', kind: 'solo', solo: 'x' }), 'solo');
  throws(() => act(s, 0, { type: 'reserve', kind: 'poverty' }), 'poverty');
  throws(() => act(s, 0, { type: 'reserve', kind: 'throw' }), 'throw');
  throws(() => act(s, 0, { type: 'reserve', kind: 'nap' }), 'move');
  const events = act(s, 0, { type: 'reserve', kind: 'wedding' });
  assert.deepEqual(events, [{ type: 'reserve', seat: 0, reserved: true }]);
  throws(() => act(s, 1, { type: 'reserve', kind: 'wedding' }), 'wedding');
  assert.deepEqual(moves(s, 1).map((m) => m.kind), ['healthy', 'solo', 'solo', 'solo', 'solo', 'solo', 'solo', 'solo']);
});

test('a solo beats a wedding; of two solos the one nearer the dealer’s left plays; a lust solo’s lead stays left of the dealer', () => {
  const s = deal({ dealer: 3, hands: hands({ 1: ['c-Q', 'c-Q'] }) });
  act(s, 0, { type: 'reserve', kind: 'healthy' });
  act(s, 1, { type: 'reserve', kind: 'wedding' });
  act(s, 2, { type: 'reserve', kind: 'solo', solo: 'Q' });
  const events = act(s, 3, { type: 'reserve', kind: 'solo', solo: 'h' });
  assert.deepEqual(events.slice(1), [{ type: 'contract', kind: 'solo', solo: 'Q', seat: 2, duty: false }, { type: 'lead', seat: 0 }]);
  assert.equal(s.contract.trump, 'Q');
  assert.deepEqual(s.parties, ['kontra', 'kontra', 're', 'kontra']);
  assert.equal(s.turn, 0);
});

test('a compulsory solo (house rule) beats a lust solo nearer the dealer, and its soloist leads', () => {
  const s = deal({ dealer: 3, rules: { duty: true }, owes: [false, false, true, false], hands: hands() });
  act(s, 0, { type: 'reserve', kind: 'solo', solo: 'c' });
  act(s, 1, { type: 'reserve', kind: 'healthy' });
  act(s, 2, { type: 'reserve', kind: 'solo', solo: 'A' });
  act(s, 3, { type: 'reserve', kind: 'healthy' });
  assert.equal(s.contract.soloist, 2);
  assert.equal(s.contract.duty, true);
  assert.equal(s.contract.trump, null);
  assert.equal(s.turn, 2);
});

test('a forced solo (Vorführung): no asking round, the seat names its solo and leads', () => {
  const s = deal({ dealer: 0, forced: 3, hands: hands() });
  assert.equal(s.turn, 3);
  assert.deepEqual(moves(s, 3).map((m) => m.solo), D.SOLOS);
  throws(() => act(s, 3, { type: 'reserve', kind: 'healthy' }), 'forced');
  act(s, 3, { type: 'reserve', kind: 'solo', solo: 'J' });
  assert.equal(s.phase, 'play');
  assert.equal(s.contract.duty, true);
  assert.equal(s.turn, 3);
});

test('a silent wedding: both ♣Q kept quiet; one against three, a normal game to everyone else', () => {
  const s = started({ 2: ['c-Q', 'c-Q'] });
  assert.equal(s.contract.kind, 'silent');
  assert.deepEqual(s.parties, ['kontra', 'kontra', 're', 'kontra']);
  assert.equal(view(s, 0).contract.kind, 'normal');
  assert.equal(view(s, 2).contract.kind, 'silent');
  assert.equal(view(s, 0).party, 'kontra');
  assert.deepEqual(view(s, 0).parties, ['kontra', null, null, null]);
});

// ---- the wedding --------------------------------------------------------------------------------------------------

test('a wedding: the first other player to take one of the first three tricks is the partner', () => {
  const s = started({ 0: ['c-Q', 'c-Q', 'c-A', 's-9'], 1: ['c-9', 's-A'], 2: ['c-9', 's-K'], 3: ['c-10', 's-10'] }, {
    reserve: { 0: { type: 'reserve', kind: 'wedding' } },
  });
  assert.equal(s.contract.kind, 'wedding');
  assert.deepEqual(s.parties, ['re', null, null, null]);
  assert.deepEqual(announceOptions(s, 0), [], 'no announcements before the partner is found');
  assert.deepEqual(knownParties(s, 2), ['re', null, null, null]);
  // Trick 1: seat 0 leads its ♣ Ass and takes it.
  playTrick(s, 'c-A', 'c-9', 'c-9', 'c-10');
  assert.equal(s.tricks[0].winner, 0);
  assert.equal(s.wedding.partner, null);
  // Trick 2: seat 1's spade Ass takes it: the partner.
  playTrick(s, 's-9', 's-A', 's-K');
  const events = act(s, 3, { type: 'play', card: 's-10' });
  assert.deepEqual(events.at(-1), { type: 'partner', seat: 1, trick: 2 });
  assert.deepEqual(s.parties, ['re', 're', 'kontra', 'kontra']);
  assert.deepEqual(knownParties(s, 3), ['re', 're', 'kontra', 'kontra']);
  // Found in trick 2: every deadline a card earlier (Re with 10 cards left, not 11).
  assert.equal(s.hands[1].length, 10);
  assert.deepEqual(announceOptions(s, 1), [0, 1, 2, 3, 4]);
  s.hands[1].pop();
  assert.deepEqual(announceOptions(s, 1), []);
});

test('a wedding whose bride takes the first three tricks: alone, scored as a solo', () => {
  const s = deal({ dealer: 3, hands: hands({ 0: ['c-Q', 'c-Q', 'h-10', 'h-10', 's-Q', 's-Q'] }) });
  act(s, 0, { type: 'reserve', kind: 'wedding' });
  for (const seat of [1, 2, 3]) act(s, seat, { type: 'reserve', kind: 'healthy' });
  const lead = ['h-10', 'h-10', 'c-Q'];
  let events = [];
  for (const card of lead) {
    act(s, 0, { type: 'play', card });
    for (const seat of [1, 2, 3]) events = act(s, seat, { type: 'play', card: legalCards(s, seat)[0] });
  }
  assert.deepEqual(events.at(-1), { type: 'alone', seat: 0 });
  assert.equal(s.contract.alone, true);
  assert.deepEqual(s.parties, ['re', 'kontra', 'kontra', 'kontra']);
  assert.ok(D.soloScored(s.contract));
  // Found in trick 3: two cards earlier. Re now needs at least nine cards: seat 0 has nine.
  assert.deepEqual(announceOptions(s, 0), [0, 1, 2, 3, 4]);
});

// ---- announcements ----------------------------------------------------------------------------------------------

/** A normal game ready to play: seats 0 and 2 Re. */
const normalGame = (rules) => started({ 0: ['c-Q'], 2: ['c-Q'] }, { rules });

/** Takes cards out of a hand without playing them (for deadlines; the tests count cards held). */
const drop = (s, seat, n) => s.hands[seat].splice(0, n);

test('Re and Kontra: with 11 cards or more; keine 90 with 10, 60 with 9, 30 with 8, schwarz with 7', () => {
  const s = normalGame();
  assert.deepEqual(announceOptions(s, 0), [0, 1, 2, 3, 4], 'before the first card, after the asking');
  drop(s, 0, 1);
  assert.deepEqual(announceOptions(s, 0), [0, 1, 2, 3, 4], 'eleven cards');
  drop(s, 0, 1);
  assert.deepEqual(announceOptions(s, 0), [], 'ten cards: too late for Re, so for any Absage too');
  // Kontra announced in time; then each Absage a card later.
  act(s, 1, { type: 'announce', level: 0 });
  drop(s, 1, 2);
  assert.deepEqual(announceOptions(s, 1), [1, 2, 3, 4], '10 cards: keine 90 and up');
  drop(s, 1, 1);
  assert.deepEqual(announceOptions(s, 1), [], '9 cards and keine 90 missed: nothing more (no skipping past it)');
  const t = normalGame();
  act(t, 3, { type: 'announce', level: 2 });
  assert.equal(t.calls.kontra, 2, 'keine 60 says Kontra and keine 90 with it');
  drop(t, 1, 3);
  assert.deepEqual(announceOptions(t, 1), [3, 4], 'the partner’s announcements count: keine 30 with 9 cards is on time');
  throws(() => act(t, 1, { type: 'announce', level: 2 }), 'announce');
  throws(() => act(t, 1, { type: 'announce', level: 7 }), 'level');
});

test('answering: one card fewer than the other side’s announcement needed; a late answer allows no Absagen', () => {
  const s = normalGame();
  act(s, 0, { type: 'announce', level: 0 });
  drop(s, 1, 2);
  // Kontra with 10 cards: too late on its own, in time as an answer to Re (which needed 11).
  assert.deepEqual(announceOptions(s, 1), [0]);
  act(s, 1, { type: 'announce', level: 0 });
  assert.equal(s.late.kontra, true);
  assert.deepEqual(announceOptions(s, 3), [], 'no Absagen after a late answer, for the partner either');
  // After keine 90 (10 cards), the answer needs 9.
  const t = normalGame();
  act(t, 0, { type: 'announce', level: 1 });
  drop(t, 1, 3);
  assert.deepEqual(announceOptions(t, 1), [0]);
  drop(t, 1, 1);
  assert.deepEqual(announceOptions(t, 1), []);
});

test('an announcement in time is not late, and nobody repeats one', () => {
  const s = normalGame();
  act(s, 1, { type: 'announce', level: 0 });
  assert.equal(s.late.kontra, false);
  throws(() => act(s, 3, { type: 'announce', level: 0 }), 'announce');
  act(s, 3, { type: 'announce', level: 1 });
  assert.deepEqual(s.announcements, [{ seat: 1, party: 'kontra', level: 0 }, { seat: 3, party: 'kontra', level: 1 }]);
  act(s, 1, { type: 'announce', level: 4 });
  assert.deepEqual(announceOptions(s, 1), []);
});

test('announcing tells the table your party', () => {
  const s = normalGame();
  act(s, 1, { type: 'announce', level: 0 });
  assert.deepEqual(knownParties(s, 3), [null, 'kontra', null, 'kontra']);
  assert.deepEqual(knownParties(s, 0), ['re', 'kontra', null, null]);
  act(s, 0, { type: 'play', card: 'c-Q' });
  // Seat 0 played a ♣Q: Re. Seat 2 knows it holds the other, so the rest is Kontra.
  assert.deepEqual(knownParties(s, 2), ['re', 'kontra', 're', 'kontra']);
  assert.deepEqual(knownParties(s, null), ['re', 'kontra', null, null]);
});

// ---- scoring (DDV §7, with the research notes' worked examples) ----------------------------------------------------

/**
 * A finished deal for scoring: parties, the contract, the calls and the tricks as [winner, augen,
 * cards?]. Cards matter only for the extra points.
 */
function scored({ parties = ['re', 'kontra', 're', 'kontra'], kind = 'normal', soloist = null, calls = {}, tricks }) {
  const s = deal({ dealer: 3, hands: hands() });
  s.phase = 'done';
  s.parties = parties;
  s.contract = { kind, trump: 'd', soloist, solo: null, duty: false, alone: false };
  s.calls = { re: -1, kontra: -1, ...calls };
  s.tricks = tricks.map(([winner, augen, cards = []]) => ({ lead: 0, winner, augen, cards }));
  return D.score(s);
}
/**
 * Re's and Kontra's Augen spread over their tricks, at most 39 a trick (so no trick is a Doppelkopf
 * by accident), winners seat 0 (Re) and seat 1 (Kontra).
 */
function split(re, kontra, { reTricks = 6, kontraTricks = 6 } = {}) {
  const spread = (seat, total, n) => Array.from({ length: n }, (_, i) => [seat, Math.max(0, Math.min(39, total - 39 * i))]);
  const out = [...spread(0, re, reTricks), ...spread(1, kontra, kontraTricks)];
  assert.equal(out.reduce((n, t) => n + t[1], 0), re + kontra, 'the Augen fit in the tricks');
  return out;
}

test('no announcements: Re wins with 121, at 120 : 120 Kontra wins, plus "gegen die Alten"', () => {
  const a = scored({ tricks: split(121, 119) });
  assert.equal(a.winner, 're');
  assert.equal(a.value, 1);
  assert.deepEqual(a.points, [1, -1, 1, -1]);
  const b = scored({ tricks: split(120, 120) });
  assert.equal(b.winner, 'kontra');
  assert.deepEqual(b.extras, [{ key: 'alten', party: 'kontra' }]);
  assert.deepEqual(b.points, [-2, 2, -2, 2], 'worked example 2');
});

test('only Kontra announced: Re wins with 120, Kontra needs 121', () => {
  const s = scored({ calls: { kontra: 0 }, tricks: split(120, 120) });
  assert.equal(s.winner, 're');
  assert.equal(s.value, 3);
});

test('worked example 1: only "Re", 130 : 110: Re +3; a fox and a Doppelkopf cancel out', () => {
  const tricks = [
    [0, 40, [{ seat: 1, card: 'd-A' }, { seat: 0, card: 'c-A' }]],
    [1, 45, []],
    [0, 39], [0, 39], [0, 12], [0, 0], [0, 0],
    [1, 39], [1, 26], [1, 0], [1, 0], [1, 0],
  ];
  const s = scored({ calls: { re: 0 }, tricks });
  assert.deepEqual([s.augen.re, s.augen.kontra], [130, 110]);
  assert.equal(s.winner, 're');
  assert.equal(s.value, 3);
  assert.deepEqual(s.extras.map((e) => [e.key, e.party]), [['doppelkopf', 're'], ['fox', 're'], ['doppelkopf', 'kontra']]);
  assert.deepEqual(s.points, [4, -4, 4, -4], 'the fox makes it 3 + 2 − 1');
});

test('worked example 3: "Re, keine 90" against "Kontra", 145 : 95: Kontra wins 6, plus gegen die Alten', () => {
  const s = scored({ calls: { re: 1, kontra: 0 }, tricks: split(145, 95) });
  assert.equal(s.winner, 'kontra');
  assert.equal(s.value, 6);
  assert.deepEqual(s.points, [-7, 7, -7, 7]);
});

test('worked example 4: both say keine 90, 125 : 115: nobody wins; Re gets 120 against keine 90', () => {
  const s = scored({ calls: { re: 1, kontra: 1 }, tricks: split(125, 115) });
  assert.equal(s.winner, null);
  assert.deepEqual(s.items, [{ key: 'vs90', party: 're' }]);
  assert.deepEqual(s.points, [1, -1, 1, -1]);
});

test('worked example 5: a Damensolo, Re and Kontra said, 160 : 80: the soloist +18, each opponent −6', () => {
  const s = scored({ parties: ['re', 'kontra', 'kontra', 'kontra'], kind: 'solo', soloist: 0, calls: { re: 0, kontra: 0 }, tricks: split(160, 80) });
  assert.equal(s.winner, 're');
  assert.equal(s.value, 6);
  assert.deepEqual(s.points, [18, -6, -6, -6]);
  assert.deepEqual(s.extras, [], 'no extra points in a solo');
});

test('a won Absage counts the Absage and what was played: Re keine 60, Kontra 55', () => {
  const s = scored({ calls: { re: 2 }, tricks: split(185, 55) });
  assert.equal(s.winner, 're');
  // won 1, under 90, under 60, Re 2, keine 90 1, keine 60 1
  assert.equal(s.value, 7);
  const lost = scored({ calls: { re: 2 }, tricks: split(181, 59) });
  assert.equal(lost.winner, 're', 'under 60 is 59 or less');
  const missed = scored({ calls: { re: 2 }, tricks: split(180, 60) });
  assert.equal(missed.winner, 'kontra', 'Kontra reached 60 against keine 60');
  // won 1, Re 2, keine 90 1, keine 60 1, 90 against keine 60? no (60): 5, plus gegen die Alten.
  assert.equal(missed.value, 5);
  assert.deepEqual(missed.points, [-6, 6, -6, 6]);
});

test('schwarz: announced and made takes every trick; against it one trick is enough', () => {
  const made = scored({ calls: { re: 4 }, tricks: split(240, 0, { reTricks: 12, kontraTricks: 0 }) });
  assert.equal(made.winner, 're');
  // won, under 90, 60, 30, schwarz (5), Re (2), four Absagen (4)
  assert.equal(made.value, 11);
  const broken = scored({ calls: { re: 4 }, tricks: split(240, 0, { reTricks: 11, kontraTricks: 1 }) });
  assert.equal(broken.winner, 'kontra', 'a trick of no Augen still breaks schwarz');
});

test('extra points: the Karlchen takes the last trick; extra points can leave a winner below zero', () => {
  const last = [0, 0, [{ seat: 1, card: 'd-9' }, { seat: 0, card: 'c-J' }]];
  const s = scored({ tricks: [...split(121, 119).slice(0, 11), last] });
  assert.deepEqual(s.extras.map((e) => e.key), ['karlchen']);
  const notWinning = [2, 0, [{ seat: 0, card: 'c-J' }, { seat: 2, card: 'c-Q' }]];
  assert.deepEqual(scored({ tricks: [...split(121, 119).slice(0, 11), notWinning] }).extras, [], 'the Karlchen must win it itself');
  const fox = (seat) => [1, 0, [{ seat, card: 'd-A' }]];
  const neg = scored({ tricks: [[0, 39], [0, 39], [0, 39], [0, 4], fox(0), fox(2), [1, 40, []], [1, 40, []], [1, 39], [0, 0], [0, 0], [0, 0]] });
  assert.equal(neg.winner, 're');
  // Re wins 1; Kontra caught two foxes and made two Doppelköpfe: 1 − 4 = −3 per Re player.
  assert.deepEqual(neg.points, [-3, 3, -3, 3]);
});

test('a silent wedding scores as a solo: three times, no extra points', () => {
  // Seat 1 is Re alone: 140 against 100, with a Doppelkopf that doesn't count.
  const tricks = [[1, 40], [1, 39], [1, 39], [1, 22], [0, 39], [0, 39], [0, 22], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]];
  const s = scored({ parties: ['kontra', 're', 'kontra', 'kontra'], kind: 'silent', soloist: 1, tricks });
  assert.equal(s.winner, 're');
  assert.deepEqual(s.extras, []);
  assert.deepEqual(s.points, [-1, 3, -1, -1]);
});

// ---- the house rules in play --------------------------------------------------------------------------------------------

test('Schweinchen: both ♦A in one hand outrank the Dullen and show when the first is played', () => {
  const s = started({ 0: ['d-A', 'd-A'], 1: ['h-10'] }, { rules: { schweinchen: true } });
  assert.equal(s.pigs, 0);
  assert.equal(view(s, 1).pigs, null);
  const events = act(s, 0, { type: 'play', card: 'd-A' });
  assert.deepEqual(events.at(-1), { type: 'pigs', seat: 0 });
  act(s, 1, { type: 'play', card: 'h-10' });
  act(s, 2, { type: 'play', card: legalCards(s, 2)[0] });
  act(s, 3, { type: 'play', card: legalCards(s, 3)[0] });
  assert.equal(s.tricks[0].winner, 0);
  assert.equal(started({ 0: ['d-A', 'd-A'] }).pigs, null, 'off by default');
});

test('throwing in (house rule): five nines, and the same dealer deals again', () => {
  const s = deal({ dealer: 3, rules: { throw: true }, hands: hands({ 0: ['c-9', 'c-9', 's-9', 's-9', 'h-9'] }) });
  assert.ok(moves(s, 0).some((m) => m.kind === 'throw'));
  act(s, 0, { type: 'reserve', kind: 'throw' });
  for (const seat of [1, 2, 3]) act(s, seat, { type: 'reserve', kind: 'healthy' });
  assert.equal(s.phase, 'done');
  assert.deepEqual(s.result, { void: 'throw', seat: 0, redeal: true, points: [0, 0, 0, 0] });
});

test('poverty (house rule): three trumps or fewer go across, the taker gives three back and they play together', () => {
  // Seat 1 holds only two trumps (♦9, ♦K).
  const plain = ['c-A', 'c-A', 'c-10', 'c-10', 's-A', 's-A', 's-10', 's-10', 'h-A', 'h-A'];
  const s = deal({ dealer: 0, rules: { poverty: true }, hands: hands({ 1: [...plain, 'd-9', 'd-K'] }) });
  assert.ok(moves(s, 1).some((m) => m.kind === 'poverty'));
  act(s, 1, { type: 'reserve', kind: 'poverty' });
  for (const seat of [2, 3, 0]) act(s, seat, { type: 'reserve', kind: 'healthy' });
  assert.equal(s.phase, 'poverty-give');
  throws(() => act(s, 1, { type: 'give', cards: ['c-A', 'c-A', 'd-9'] }), 'trumps');
  throws(() => act(s, 1, { type: 'give', cards: ['d-9', 'd-K'] }), 'cards');
  assert.equal(moves(s, 1).length, 5, 'the two trumps and one of five different plain cards');
  act(s, 1, { type: 'give', cards: ['d-9', 'd-K', 'h-A'] });
  assert.equal(s.hands[1].length, 9);
  assert.ok(!cardsIn(view(s, 2)).includes('d-K') || s.hands[2].includes('d-K'), 'the offered cards stay hidden');
  act(s, 2, { type: 'decline' });
  act(s, 3, { type: 'take' });
  assert.equal(s.phase, 'poverty-return');
  assert.equal(s.hands[3].length, 15);
  const back = s.hands[3].filter((id) => !isTrump(id, 'd')).slice(0, 3);
  act(s, 3, { type: 'return', cards: back });
  assert.deepEqual(s.hands.map((h) => h.length), [12, 12, 12, 12]);
  assert.equal(s.contract.kind, 'poverty');
  assert.deepEqual(s.parties, ['kontra', 're', 'kontra', 're']);
  assert.equal(s.poverty.back, 0);
  assert.deepEqual(knownParties(s, 0), ['kontra', 're', 'kontra', 're']);
  assert.equal(s.turn, 1, 'the dealer’s left leads');
});

test('poverty nobody takes: the deal is void and dealt again', () => {
  const plain = ['c-A', 'c-A', 'c-10', 'c-10', 's-A', 's-A', 's-10', 's-10', 'h-A', 'h-A'];
  const s = deal({ dealer: 0, rules: { poverty: true }, hands: hands({ 1: [...plain, 'd-9', 'd-K'] }) });
  act(s, 1, { type: 'reserve', kind: 'poverty' });
  for (const seat of [2, 3, 0]) act(s, seat, { type: 'reserve', kind: 'healthy' });
  act(s, 1, { type: 'give', cards: ['d-9', 'd-K', 'h-A'] });
  for (const seat of [2, 3, 0]) act(s, seat, { type: 'decline' });
  assert.equal(s.phase, 'done');
  assert.equal(s.result.void, 'poverty');
  assert.equal(s.hands[1].length, 12, 'the cards came back');
});

test('without the nines: ten cards each, and the deadlines a card earlier for each card fewer', () => {
  const s = started({ 0: ['c-Q'], 2: ['c-Q'] }, { rules: { nines: false } });
  assert.equal(s.size, 10);
  drop(s, 0, 1);
  assert.deepEqual(announceOptions(s, 0), [0, 1, 2, 3, 4]);
  drop(s, 0, 1);
  assert.deepEqual(announceOptions(s, 0), []);
});

// ---- views -------------------------------------------------------------------------------------------------------------------

test('a view: your own hand sorted (trumps high to low, then ♣ ♠ ♥ ♦), nobody else’s; your own reservation only', () => {
  const s = deal({ dealer: 3, hands: hands({ 0: ['c-9', 'h-10', 'd-9', 'c-A', 's-K', 'h-A', 'c-Q', 'd-A', 'c-J', 'h-K', 's-9', 'h-9'] }) });
  act(s, 0, { type: 'reserve', kind: 'solo', solo: 'h' });
  const v = view(s, 0);
  assert.deepEqual(v.hand, ['h-10', 'c-Q', 'c-J', 'd-A', 'd-9', 'c-A', 'c-9', 's-K', 's-9', 'h-A', 'h-K', 'h-9']);
  assert.deepEqual(v.declared, { kind: 'solo', solo: 'h' });
  assert.equal(view(s, 1).declared, null);
  assert.deepEqual(view(s, 1).reserve, ['reserved', null, null, null]);
  for (const seat of [1, 2, 3]) {
    const seen = new Set(cardsIn(view(s, seat)));
    for (const id of seen) assert.ok(s.hands[seat].includes(id), `seat ${seat} sees only its own cards (${id})`);
  }
});
