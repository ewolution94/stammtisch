import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SUITS, makeDeck } from '../server/core/cards.mjs';
import * as M from '../server/games/maumau.mjs';
import { cardsIn, sameCards, seeded, throws } from './helpers.mjs';

const { act, cleanRules, deal, fits, moves, playable, view, RULES } = M;

/**
 * A fixed deal: seat 0 is the dealer, so seat 1 plays first (unless the upcard says otherwise). Mau
 * is off unless a test turns it on, so short hands don't draw for a forgotten "Mau!".
 */
function table(hands, top, { stock = [], rules = {}, dealer = 0 } = {}) {
  return deal({ players: hands.length, dealer, rules: { mau: false, ...rules }, hands, top, stock });
}

/** Every card in the deal: hands, stock and pile. */
const everything = (s) => [...s.hands.flat(), ...s.stock, ...s.pile];

// ---- rules and the deal --------------------------------------------------------------------------

test('house rules: the defaults the user picked, known keys replaced, wrong kinds refused', () => {
  assert.equal(deal({ players: 2, dealer: 0, randomInt: seeded(1) }).rules.mau, true);
  assert.deepEqual({ ...RULES }, {
    seven: true, sevenStack: true, eight: true, jack: true, jackOnJack: false,
    ace: false, nine: false, mau: true, scoring: 'tally', hand: 5,
  });
  assert.deepEqual(cleanRules(), RULES);
  assert.equal(cleanRules({ ace: true, other: 1 }).ace, true);
  assert.equal('other' in cleanRules({ other: 1 }), false);
  assert.equal(cleanRules({ scoring: 'points' }).scoring, 'points');
  assert.equal(cleanRules({ hand: 7 }).hand, 7);
  for (const bad of [{ seven: 'yes' }, { scoring: 'chips' }, { hand: 2 }, { hand: 8 }, { hand: 5.5 }]) throws(() => cleanRules(bad), 'rules');
});

test('the deal: five each from the dealer’s left, one up, the rest the stock; one deck to four, two from five', () => {
  for (const players of [2, 3, 4, 5, 6]) {
    const s = deal({ players, dealer: players - 1, randomInt: seeded(players) });
    const deck = makeDeck('skat', M.decksFor(players));
    assert.ok(sameCards(everything(s), deck), `${players}: every card once (or twice)`);
    assert.deepEqual(s.hands.map((h) => h.length), Array(players).fill(5));
    assert.equal(s.pile.length, 1);
    assert.equal(s.stock.length, deck.length - 5 * players - 1);
    assert.equal(s.phase, 'play');
  }
  assert.equal(M.decksFor(4), 1);
  assert.equal(M.decksFor(5), 2);
  const seven = deal({ players: 3, dealer: 0, rules: { hand: 7 }, randomInt: seeded(3) });
  assert.deepEqual(seven.hands.map((h) => h.length), [7, 7, 7]);
  // The same seed deals the same cards.
  assert.deepEqual(deal({ players: 4, dealer: 2, randomInt: seeded(9) }), deal({ players: 4, dealer: 2, randomInt: seeded(9) }));
  for (const players of [1, 7, 2.5, '3']) throws(() => deal({ players, dealer: 0, randomInt: seeded(1) }), 'players');
  throws(() => deal({ players: 3, dealer: 3, randomInt: seeded(1) }), 'players');
  throws(() => deal({ players: 3, dealer: 0, hands: [['c-7'], ['c-8']], top: 'c-9' }), 'deal');
  throws(() => deal({ players: 2, dealer: 0, hands: [['c-7'], ['x-8']], top: 'c-9' }), 'card');
  assert.throws(() => deal({ players: 3, dealer: 0 }), TypeError);
});

test('the upcard: an ordinary card lets the dealer’s left begin', () => {
  const s = table([['c-7'], ['c-8'], ['c-9']], 's-K', { dealer: 1 });
  assert.equal(s.turn, 2);
  assert.equal(s.penalty, 0);
  assert.equal(s.wish, null);
});

test('the upcard: a 7 makes the first player draw two, an 8 skips them, an Unter wishes its own suit', () => {
  const seven = table([['c-7'], ['c-8'], ['c-9']], 's-7');
  assert.equal(seven.turn, 1);
  assert.equal(seven.penalty, 2);
  const eight = table([['c-7'], ['c-8'], ['c-9']], 's-8');
  assert.equal(eight.turn, 2);
  assert.equal(eight.skipped, 1);
  const unter = table([['c-7'], ['c-8'], ['c-9']], 's-J');
  assert.equal(unter.wish, 's');
  // With the rules off they're plain cards.
  const off = { seven: false, eight: false, jack: false };
  assert.equal(table([['c-7'], ['c-8']], 's-7', { rules: off }).penalty, 0);
  assert.equal(table([['c-7'], ['c-8'], ['c-9']], 's-8', { rules: off }).turn, 1);
  assert.equal(table([['c-7'], ['c-8']], 's-J', { rules: off }).wish, null);
});

test('the upcard: a 9 under the reverse rule starts to the dealer’s right', () => {
  const s = table([['c-7'], ['c-8'], ['c-9'], ['c-10']], 's-9', { rules: { nine: true }, dealer: 1 });
  assert.equal(s.dir, -1);
  assert.equal(s.turn, 0);
  assert.equal(table([['c-7'], ['c-8'], ['c-9']], 's-9').dir, 1);
});

// ---- what fits -------------------------------------------------------------------------------------

test('fits: the suit or the value on top; an Unter on anything but an Unter; a wish asks for its suit', () => {
  const s = table([['h-8', 's-K', 'd-9', 'c-J', 'h-J'], ['c-7']], 'h-K');
  assert.equal(fits(s, 'h-8'), true, 'same suit');
  assert.equal(fits(s, 's-K'), true, 'same value');
  assert.equal(fits(s, 'd-9'), false);
  assert.equal(fits(s, 'c-J'), true, 'an Unter goes on anything');
  s.pile.push('s-J');
  s.wish = 'd';
  assert.equal(fits(s, 'd-9'), true, 'the wished suit');
  assert.equal(fits(s, 's-K'), false, 'the Unter’s own suit no longer counts');
  assert.equal(fits(s, 'h-J'), false, 'no Unter on an Unter');
  s.rules = cleanRules({ jackOnJack: true });
  assert.equal(fits(s, 'h-J'), true, 'unless the house allows it');
});

test('fits: with the Unter rule off, an Unter is a plain card and nothing is wished', () => {
  const s = table([['c-7'], ['c-J', 'h-J', 's-9']], 'h-K', { rules: { jack: false } });
  assert.equal(fits(s, 'c-J'), false);
  assert.equal(fits(s, 'h-J'), true);
  assert.equal(M.wishes(s, 'h-J'), false);
  assert.deepEqual(moves(s, 1), [{ type: 'play', card: 'h-J' }, { type: 'draw' }]);
  act(s, 1, { type: 'play', card: 'h-J' });
  assert.equal(s.wish, null);
});

test('moves: each card that fits once (an Unter once per wish), and drawing; nothing out of turn', () => {
  const s = table([['c-7'], ['h-8', 'h-8', 's-J', 'd-9']], 'h-K', { rules: { hand: 4 } });
  assert.deepEqual(moves(s, 1), [
    { type: 'play', card: 'h-8' },
    ...SUITS.map((wish) => ({ type: 'play', card: 's-J', wish })),
    { type: 'draw' },
  ]);
  assert.deepEqual(moves(s, 0), []);
  assert.deepEqual(playable(s, 1), ['h-8', 's-J']);
});

// ---- playing -----------------------------------------------------------------------------------------

test('a play: off the hand onto the pile, the turn moves on; refused out of turn, off-hand or not fitting', () => {
  const s = table([['c-7', 'c-8'], ['h-9', 'h-10', 's-7'], ['d-A', 'd-K']], 'h-K');
  throws(() => act(s, 0, { type: 'play', card: 'c-7' }), 'turn');
  throws(() => act(s, 1, { type: 'play', card: 'd-A' }), 'card');
  throws(() => act(s, 1, { type: 'play', card: 's-7' }), 'fits');
  throws(() => act(s, 1, { type: 'play', card: 'x-1' }), 'card');
  throws(() => act(s, 1, { type: 'fold' }), 'move');
  throws(() => act(s, 1, null), 'move');
  const events = act(s, 1, { type: 'play', card: 'h-9' });
  assert.deepEqual(events, [{ type: 'play', seat: 1, card: 'h-9' }]);
  assert.deepEqual(s.hands[1], ['h-10', 's-7']);
  assert.equal(M.topCard(s), 'h-9');
  assert.equal(s.turn, 2);
});

test('an Unter wishes a suit, the next must follow it; the wish is gone once followed', () => {
  const s = table([['c-7', 'c-8'], ['s-J', 'h-10', 's-7'], ['d-A', 'd-K', 'h-A']], 'h-K');
  throws(() => act(s, 1, { type: 'play', card: 's-J' }), 'wish');
  throws(() => act(s, 1, { type: 'play', card: 's-J', wish: 'x' }), 'wish');
  act(s, 1, { type: 'play', card: 's-J', wish: 'd' });
  assert.equal(s.wish, 'd');
  assert.deepEqual(playable(s, 2), ['d-A', 'd-K']);
  throws(() => act(s, 2, { type: 'play', card: 'h-A' }), 'fits');
  act(s, 2, { type: 'play', card: 'd-K' });
  assert.equal(s.wish, null);
});

test('the 7: the next draws two and the turn passes; a 7 on a 7 makes it four', () => {
  const s = table([['c-7', 'c-8', 'c-9'], ['h-7', 'h-10', 's-9'], ['d-A', 'd-K', 'd-9']], 'h-K', {
    stock: ['s-A', 's-K', 's-Q', 's-10', 's-8', 'd-8'],
  });
  act(s, 1, { type: 'play', card: 'h-7' });
  assert.equal(s.penalty, 2);
  assert.equal(s.turn, 2);
  // Seat 2 has no 7: only drawing.
  assert.deepEqual(moves(s, 2), [{ type: 'draw' }]);
  throws(() => act(s, 2, { type: 'play', card: 'd-9' }), 'fits');
  const events = act(s, 2, { type: 'draw' });
  assert.deepEqual(events, [{ type: 'draw', seat: 2, count: 2, penalty: true }]);
  assert.deepEqual(s.hands[2], ['d-A', 'd-K', 'd-9', 's-A', 's-K']);
  assert.equal(s.penalty, 0);
  assert.equal(s.turn, 0, 'drawing the penalty ends the turn');
  // The 7 is spent: seat 0 plays on it as on any card.
  act(s, 0, { type: 'play', card: 'c-7' });
  assert.equal(s.penalty, 2);
  act(s, 1, { type: 'draw' });
  assert.equal(s.penalty, 0);

  const stack = table([['c-7', 'c-8'], ['h-7', 'h-10'], ['s-7', 'd-K'], ['d-9', 'd-8']], 'h-K', {
    stock: ['s-A', 's-K', 's-Q', 's-10', 's-8'],
  });
  act(stack, 1, { type: 'play', card: 'h-7' });
  assert.deepEqual(moves(stack, 2), [{ type: 'play', card: 's-7' }, { type: 'draw' }]);
  act(stack, 2, { type: 'play', card: 's-7' });
  assert.equal(stack.penalty, 4);
  act(stack, 3, { type: 'draw' });
  assert.equal(stack.hands[3].length, 6);
});

test('the 7 without stacking: a waiting 7 can only be drawn for; with the 7 rule off it’s a plain card', () => {
  const s = table([['c-7', 'c-8'], ['h-7', 'h-10'], ['s-7', 'd-K']], 'h-K', { rules: { sevenStack: false }, stock: ['s-A', 's-K'] });
  act(s, 1, { type: 'play', card: 'h-7' });
  assert.deepEqual(moves(s, 2), [{ type: 'draw' }]);
  throws(() => act(s, 2, { type: 'play', card: 's-7' }), 'fits');
  const off = table([['c-7', 'c-8'], ['h-7', 'h-10'], ['s-7', 'd-K']], 'h-K', { rules: { seven: false } });
  act(off, 1, { type: 'play', card: 'h-7' });
  assert.equal(off.penalty, 0);
  assert.deepEqual(playable(off, 2), ['s-7']);
});

test('the 8 skips the next; with two at the table the same player goes again', () => {
  const s = table([['c-7', 'c-8'], ['h-8', 'h-10'], ['s-7', 'd-K']], 'h-K');
  const events = act(s, 1, { type: 'play', card: 'h-8' });
  assert.deepEqual(events, [{ type: 'play', seat: 1, card: 'h-8' }, { type: 'skip', seat: 2 }]);
  assert.equal(s.turn, 0);
  assert.equal(s.skipped, 2);
  const two = table([['c-7', 'c-8'], ['h-8', 'h-10', 'h-9']], 'h-K');
  act(two, 1, { type: 'play', card: 'h-8' });
  assert.equal(two.turn, 1);
  const off = table([['c-7', 'c-8'], ['h-8', 'h-10'], ['s-7', 'd-K']], 'h-K', { rules: { eight: false } });
  act(off, 1, { type: 'play', card: 'h-8' });
  assert.equal(off.turn, 2);
});

test('the Daus plays again (house rule); off by default', () => {
  const s = table([['c-7', 'c-8'], ['h-A', 'h-10', 'd-9'], ['s-7', 'd-K']], 'h-K', { rules: { ace: true }, stock: ['c-K'] });
  const events = act(s, 1, { type: 'play', card: 'h-A' });
  assert.deepEqual(events.at(-1), { type: 'again', seat: 1 });
  assert.equal(s.turn, 1);
  assert.equal(s.again, true);
  act(s, 1, { type: 'play', card: 'h-10' });
  assert.equal(s.turn, 2);
  assert.equal(s.again, false);
  const off = table([['c-7', 'c-8'], ['h-A', 'h-10', 'd-9'], ['s-7', 'd-K']], 'h-K');
  act(off, 1, { type: 'play', card: 'h-A' });
  assert.equal(off.turn, 2);
});

test('the 9 reverses (house rule): play goes the other way round', () => {
  const s = table([['c-7', 'h-Q'], ['h-9', 'h-10', 'd-9'], ['s-7', 'd-K'], ['c-8', 'c-9']], 'h-K', { rules: { nine: true } });
  const events = act(s, 1, { type: 'play', card: 'h-9' });
  assert.deepEqual(events.at(-1), { type: 'reverse', dir: -1 });
  assert.equal(s.turn, 0);
  act(s, 0, { type: 'play', card: 'h-Q' });
  assert.equal(s.turn, 3);
});

// ---- drawing ------------------------------------------------------------------------------------------

test('drawing: a card that doesn’t fit ends the turn; one that fits may go straight on, or be kept', () => {
  const s = table([['c-7', 'c-8'], ['d-9', 'd-10'], ['s-7', 'd-K']], 'h-K', { stock: ['c-9', 'h-7', 'h-A'] });
  assert.deepEqual(act(s, 1, { type: 'draw' }), [{ type: 'draw', seat: 1, count: 1 }]);
  assert.equal(s.turn, 2, 'the c-9 doesn’t fit');
  act(s, 2, { type: 'draw' });
  assert.equal(s.turn, 2, 'the h-7 fits: seat 2 decides');
  assert.equal(s.drawn, 'h-7');
  assert.deepEqual(moves(s, 2), [{ type: 'play', card: 'h-7' }, { type: 'pass' }]);
  throws(() => act(s, 2, { type: 'play', card: 's-7' }), 'drawn');
  throws(() => act(s, 2, { type: 'draw' }), 'drawn');
  act(s, 2, { type: 'pass' });
  assert.equal(s.turn, 0);
  assert.equal(s.drawn, null);
  throws(() => act(s, 0, { type: 'pass' }), 'pass');
  act(s, 0, { type: 'draw' });
  assert.equal(s.drawn, 'h-A');
  act(s, 0, { type: 'play', card: 'h-A' });
  assert.equal(M.topCard(s), 'h-A');
  assert.equal(s.turn, 1);
});

test('an empty stock: the pile under the top card is shuffled into a new one', () => {
  const s = table([['c-7', 'c-8'], ['h-9', 'd-10'], ['s-7', 'd-K']], 'h-K', { stock: [] });
  s.pile = ['s-A', 'd-A', 'c-A', 'h-K'];
  assert.throws(() => act(s, 1, { type: 'draw' }), TypeError, 'needs a random to shuffle');
  const events = act(s, 1, { type: 'draw' }, { randomInt: seeded(4) });
  assert.deepEqual(events[0], { type: 'reshuffle', count: 3 });
  assert.deepEqual(s.pile, ['h-K']);
  assert.equal(s.stock.length, 2);
  assert.ok(sameCards([...s.stock, s.hands[1].at(-1)], ['s-A', 'd-A', 'c-A']));
});

test('nothing left to draw: the turn passes; once nobody can play or draw, the fewest cards win', () => {
  const s = table([['c-7', 'c-8', 'c-9'], ['d-9', 'd-10'], ['s-7', 's-8']], 'h-K', { stock: [] });
  assert.deepEqual(act(s, 1, { type: 'draw' }), [{ type: 'draw', seat: 1, count: 0 }]);
  assert.equal(s.turn, 2);
  act(s, 2, { type: 'draw' });
  const events = act(s, 0, { type: 'draw' });
  assert.equal(s.phase, 'done');
  // Seats 1 and 2 hold two each; seat 1 comes first from the dealer’s left.
  assert.equal(s.winner, 1);
  assert.deepEqual(events.at(-1), { type: 'blocked', seat: 1 });
  assert.deepEqual(s.points, [0, 1, 0]);
});

// ---- Mau and the end --------------------------------------------------------------------------------

test('Mau: playing down to one card without it costs a card; with it, nothing; the rule off, never', () => {
  const s = table([['c-7', 'c-8'], ['h-9', 'h-10'], ['h-Q', 'h-7', 'd-K']], 'h-K', { stock: ['s-A', 's-K'], rules: { mau: true } });
  const forgot = act(s, 1, { type: 'play', card: 'h-9' });
  assert.deepEqual(forgot, [{ type: 'play', seat: 1, card: 'h-9' }, { type: 'forgot', seat: 1 }]);
  assert.deepEqual(s.hands[1], ['h-10', 's-A']);
  act(s, 2, { type: 'play', card: 'h-Q', mau: true });
  assert.equal(s.hands[2].length, 2, 'three cards to two: no Mau needed');
  act(s, 0, { type: 'draw' });
  const said = act(s, 1, { type: 'play', card: 'h-10', mau: true });
  assert.deepEqual(said.slice(0, 2), [{ type: 'play', seat: 1, card: 'h-10' }, { type: 'mau', seat: 1 }]);
  assert.deepEqual(s.hands[1], ['s-A']);
  assert.equal(s.said[1], true);
  const off = table([['c-7', 'c-8'], ['h-9', 'h-10']], 'h-K', { rules: { mau: false } });
  act(off, 1, { type: 'play', card: 'h-9' });
  assert.deepEqual(off.hands[1], ['h-10']);
});

test('the last card wins the deal: an Unter needs no wish; the tally gives the winner a point', () => {
  const s = table([['c-7', 'c-8'], ['s-J'], ['h-8', 'd-K']], 'h-K');
  const events = act(s, 1, { type: 'play', card: 's-J' });
  assert.deepEqual(events, [{ type: 'play', seat: 1, card: 's-J' }, { type: 'out', seat: 1 }]);
  assert.equal(s.phase, 'done');
  assert.equal(s.winner, 1);
  assert.deepEqual(s.points, [0, 1, 0]);
  throws(() => act(s, 2, { type: 'draw' }), 'phase');
  assert.deepEqual(moves(s, 2), []);
});

test('scoring by points: the others lose what their cards cost (Daus 11, 10, König 4, Ober 3, Unter 2, the rest their number)', () => {
  const s = table([['c-A', 'c-10', 'c-K', 'c-Q'], ['h-9'], ['h-J', 'd-7', 'd-8']], 'h-K', { rules: { scoring: 'points' } });
  act(s, 1, { type: 'play', card: 'h-9' });
  assert.deepEqual(s.points, [-28, 0, -17]);
  assert.equal(M.cost('d-9'), 9);
});

// ---- the views -----------------------------------------------------------------------------------------

test('a view: your own hand sorted, the others only as counts; a drawn card only to its drawer', () => {
  const s = table([['c-7', 'c-8'], ['d-9', 'h-A', 'c-10'], ['s-7', 'd-K']], 'h-K', { stock: ['h-Q'] });
  const mine = view(s, 1);
  assert.deepEqual(mine.hand, ['c-10', 'h-A', 'd-9']);
  assert.deepEqual(mine.counts, [2, 3, 2]);
  assert.deepEqual(mine.pile, ['h-K']);
  assert.equal(mine.stock, 1);
  assert.deepEqual(mine.playable, ['h-A']);
  assert.equal(mine.hands, null);
  const other = view(s, 0);
  assert.deepEqual(cardsIn(other).sort(), ['c-7', 'c-8', 'h-K'].sort(), 'seat 0 sees its cards and the pile, nothing else');
  assert.deepEqual(cardsIn(view(s, null)), ['h-K'], 'a watcher sees the pile');
  act(s, 1, { type: 'draw' });
  assert.equal(view(s, 1).drawn, 'h-Q');
  assert.equal(view(s, 0).drawn, null);
  assert.equal(view(s, 0).choosing, true);
  assert.ok(!cardsIn(view(s, 2)).includes('h-Q'));
  act(s, 1, { type: 'play', card: 'h-Q' });
  assert.equal(view(s, 0).choosing, false);
  // The pile shows its last four cards.
  s.pile = ['c-A', 'c-K', 'c-Q', 'c-J', 'c-10'];
  assert.deepEqual(view(s, 0).pile, ['c-K', 'c-Q', 'c-J', 'c-10']);
  assert.equal(view(s, 0).piled, 5);
});

test('at the end the view shows every hand, as when the cards are counted', () => {
  const s = table([['c-7', 'c-8'], ['h-9'], ['s-7', 'd-K']], 'h-K');
  act(s, 1, { type: 'play', card: 'h-9' });
  assert.deepEqual(view(s, 0).hands, [['c-7', 'c-8'], [], ['s-7', 'd-K']]);
});
