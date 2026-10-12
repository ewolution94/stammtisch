// Mau-Mau as a pure state machine (see server/core/cards.mjs for what "pure" means here). One deal:
// everyone gets a hand, the next card turns up and starts the pile; in turn, put a card on the pile
// that matches its suit or its value, or draw one; first with no cards left wins the deal.
//
// The house rules are the host's (RULES, below, with the defaults the user picked on 2026-10-13):
// the 7 makes the next draw two (a 7 on a 7 passes it on), the 8 skips the next, the Unter goes on any
// card and wishes a suit, "Mau!" before the second-to-last card. Off by default: Unter on Unter, the
// Daus plays again, the 9 reverses.
//
// Moves (plain JSON, from the page or a bot):
//   { type: 'play', card, wish?, mau? }  wish: a suit, with an Unter (when it wishes); mau: said "Mau!"
//   { type: 'draw' }                     one card, or the 7s' penalty, which ends the turn
//   { type: 'pass' }                     after drawing a card that fits, keep it
// act() returns events for the table (who played, drew, was skipped …). Events are public: a draw
// says how many cards, never which.

import { RuleError, SUITS, isCard, makeDeck, nextSeat, parseCard, shuffled, sortBy, takeCard } from '../core/cards.mjs';

/** @typedef {import('../core/cards.mjs').Suit} Suit */

export const id = 'maumau';
export const PLAYERS = Object.freeze({ min: 2, max: 6 });

/**
 * The house rules and their defaults.
 * seven: 7 = the next draws two · sevenStack: a 7 on a 7 passes it on (2, 4, 6 …) · eight: 8 = the
 * next is skipped · jack: the Unter goes on any card and wishes a suit · jackOnJack: an Unter on an
 * Unter · ace: the Daus plays again · nine: the 9 reverses · mau: "Mau!" before the second-to-last
 * card, or draw one · scoring: 'tally' (a point for winning a deal) or 'points' (minus the cards left
 * in hand) · hand: cards dealt to each.
 */
export const RULES = Object.freeze({
  seven: true,
  sevenStack: true,
  eight: true,
  jack: true,
  jackOnJack: false,
  ace: false,
  nine: false,
  mau: true,
  scoring: 'tally',
  hand: 5,
});

const FLAGS = ['seven', 'sevenStack', 'eight', 'jack', 'jackOnJack', 'ace', 'nine', 'mau'];
export const SCORINGS = Object.freeze(['tally', 'points']);
export const HAND = Object.freeze({ min: 3, max: 7 });

/**
 * The house rules from a lobby's settings: the defaults, with every known key that's set replacing
 * its default. Throws 'rules' for a value of the wrong kind; unknown keys are dropped.
 * @param {Record<string, unknown>} [input]
 */
export function cleanRules(input = {}) {
  const out = { ...RULES };
  for (const k of FLAGS) {
    if (input[k] === undefined) continue;
    if (typeof input[k] !== 'boolean') throw new RuleError('rules');
    out[k] = input[k];
  }
  if (input.scoring !== undefined) {
    if (!SCORINGS.includes(/** @type {string} */ (input.scoring))) throw new RuleError('rules');
    out.scoring = /** @type {'tally' | 'points'} */ (input.scoring);
  }
  if (input.hand !== undefined) {
    const n = input.hand;
    if (!Number.isInteger(n) || n < HAND.min || n > HAND.max) throw new RuleError('rules');
    out.hand = /** @type {number} */ (n);
  }
  return Object.freeze(out);
}

/** One Skat deck (32) for up to four players, two from five, so the stock never starts thin. */
export const decksFor = (players) => (players >= 5 ? 2 : 1);

/** What a card left in hand costs with the 'points' scoring: Daus 11, 10, König 4, Ober 3, Unter 2, the rest its number. */
const COST = { A: 11, K: 4, Q: 3, J: 2 };
export const cost = (id) => {
  const { r } = parseCard(id);
  return COST[r] ?? Number(r);
};

/**
 * @typedef {{
 *   game: 'maumau', rules: typeof RULES, players: number, dealer: number,
 *   hands: string[][], stock: string[], pile: string[],
 *   phase: 'play' | 'done', turn: number, dir: 1 | -1,
 *   wish: Suit | null, penalty: number, drawn: string | null, again: boolean,
 *   skipped: number | null, stuck: number, said: boolean[],
 *   winner: number | null, points: number[] | null,
 * }} State
 */

/**
 * Deals a fresh deal. randomInt(n) returns 0..n-1. Tests pass `hands`, `top` and `stock` (the next
 * cards to be drawn first) instead, for a fixed deal.
 * @param {{ players: number, dealer: number, rules?: Record<string, unknown>, randomInt?: (n: number) => number,
 *   hands?: string[][], top?: string, stock?: string[] }} o
 * @returns {State}
 */
export function deal({ players, dealer, rules: raw, randomInt, hands: fixed, top: fixedTop, stock: fixedStock }) {
  const rules = cleanRules(raw);
  if (!Number.isInteger(players) || players < PLAYERS.min || players > PLAYERS.max) throw new RuleError('players');
  if (!Number.isInteger(dealer) || dealer < 0 || dealer >= players) throw new RuleError('players');

  /** @type {string[][]} */
  let hands;
  /** @type {string} */
  let top;
  /** @type {string[]} */
  let stock;
  if (fixed) {
    if (!Array.isArray(fixed) || fixed.length !== players || fixed.some((h) => !Array.isArray(h) || !h.length)) {
      throw new RuleError('deal');
    }
    const all = [...fixed.flat(), fixedTop, ...(fixedStock ?? [])];
    if (!all.every(isCard)) throw new RuleError('card');
    hands = fixed.map((h) => [...h]);
    top = /** @type {string} */ (fixedTop);
    stock = [...(fixedStock ?? [])];
  } else {
    if (typeof randomInt !== 'function') throw new TypeError('deal needs randomInt or hands');
    const deck = shuffled(makeDeck('skat', decksFor(players)), randomInt);
    hands = Array.from({ length: players }, () => []);
    // One card at a time, left of the dealer first.
    for (let i = 0; i < players * rules.hand; i++) hands[nextSeat(dealer, players, 1 + (i % players))].push(deck[i]);
    top = deck[players * rules.hand];
    stock = deck.slice(players * rules.hand + 1);
  }

  /** @type {State} */
  const state = {
    game: 'maumau',
    rules,
    players,
    dealer,
    hands,
    stock,
    pile: [top],
    phase: 'play',
    turn: 0,
    dir: 1,
    wish: null,
    penalty: 0,
    drawn: null,
    again: false,
    skipped: null,
    stuck: 0,
    said: Array(players).fill(false),
    winner: null,
    points: null,
  };
  // The upcard counts as the dealer's play: a 7 makes the first player draw, an 8 skips them, an
  // Unter wishes its own suit, a 9 sends play the other way. A Daus does nothing.
  const { r, s } = parseCard(top);
  if (rules.nine && r === '9') state.dir = -1;
  let first = nextSeat(dealer, players, state.dir);
  if (rules.seven && r === '7') state.penalty = 2;
  if (rules.jack && r === 'J') state.wish = s;
  if (rules.eight && r === '8') {
    state.skipped = first;
    first = nextSeat(first, players, state.dir);
  }
  state.turn = first;
  return state;
}

/** The card on top of the pile. @param {State} state */
export const topCard = (state) => state.pile[state.pile.length - 1];

/**
 * Whether `id` may go on the pile now, whatever hand it's in (the turn's other limits, like the card
 * just drawn, are in playable()).
 * @param {State} state  @param {string} id
 */
export function fits(state, id) {
  const { r, s } = parseCard(id);
  const top = parseCard(topCard(state));
  const { rules } = state;
  // A 7 is waiting: only another 7 passes it on.
  if (state.penalty > 0) return rules.sevenStack && r === '7';
  if (rules.jack && r === 'J') return rules.jackOnJack || top.r !== 'J';
  if (state.wish) return s === state.wish;
  return s === top.s || r === top.r;
}

/**
 * The cards `seat` may play now, each once, in the hand's order; empty when it isn't their turn.
 * @param {State} state  @param {number} seat
 */
export function playable(state, seat) {
  if (state.phase !== 'play' || seat !== state.turn) return [];
  if (state.drawn) return fits(state, state.drawn) ? [state.drawn] : [];
  return [...new Set(state.hands[seat].filter((id) => fits(state, id)))];
}

/** Whether playing `id` asks for a wish: an Unter, under the jack rule. */
export const wishes = (state, id) => state.rules.jack && parseCard(id).r === 'J';

/**
 * Every legal move for `seat` (an Unter once per suit it may wish). A play may also carry
 * `mau: true`; leaving it out is legal too (and costs a card).
 * @param {State} state  @param {number} seat
 */
export function moves(state, seat) {
  if (state.phase !== 'play' || seat !== state.turn) return [];
  /** @type {Record<string, unknown>[]} */
  const out = [];
  for (const card of playable(state, seat)) {
    if (wishes(state, card) && state.hands[seat].length > 1) for (const wish of SUITS) out.push({ type: 'play', card, wish });
    else out.push({ type: 'play', card });
  }
  out.push(state.drawn ? { type: 'pass' } : { type: 'draw' });
  return out;
}

/**
 * Makes a move. Changes `state` and returns what happened, in order, for the table.
 * `randomInt` is needed when the stock runs out and the pile is shuffled into a new one.
 * @param {State} state  @param {number} seat  @param {Record<string, any>} move
 * @param {{ randomInt?: (n: number) => number }} [ctx]
 */
export function act(state, seat, move, { randomInt } = {}) {
  if (state.phase !== 'play') throw new RuleError('phase');
  if (seat !== state.turn) throw new RuleError('turn');
  if (!move || typeof move !== 'object') throw new RuleError('move');
  /** @type {Record<string, unknown>[]} */
  const events = [];
  if (move.type === 'play') playCard(state, seat, move, events, randomInt);
  else if (move.type === 'draw') draw(state, seat, events, randomInt);
  else if (move.type === 'pass') {
    if (!state.drawn) throw new RuleError('pass');
    events.push({ type: 'pass', seat });
    endTurn(state, seat);
  } else throw new RuleError('move');
  return events;
}

function playCard(state, seat, move, events, randomInt) {
  const { card } = move;
  const hand = state.hands[seat];
  if (!isCard(card) || !hand.includes(card)) throw new RuleError('card');
  if (state.drawn && card !== state.drawn) throw new RuleError('drawn');
  if (!fits(state, card)) throw new RuleError('fits');
  const { r } = parseCard(card);
  const last = hand.length === 1;
  // An Unter wishes a suit, unless it's the last card (the deal is over).
  const wish = wishes(state, card) && !last ? move.wish : undefined;
  if (wishes(state, card) && !last && !SUITS.includes(wish)) throw new RuleError('wish');

  takeCard(hand, card);
  state.pile.push(card);
  state.drawn = null;
  state.again = false;
  state.skipped = null;
  state.stuck = 0;
  events.push(wish ? { type: 'play', seat, card, wish } : { type: 'play', seat, card });

  if (!hand.length) {
    finish(state, seat);
    events.push({ type: 'out', seat });
    return;
  }
  // Down to one card: it should have been announced.
  if (state.rules.mau && hand.length === 1) {
    if (move.mau === true) {
      state.said[seat] = true;
      events.push({ type: 'mau', seat });
    } else {
      events.push({ type: 'forgot', seat });
      drawCards(state, seat, 1, events, randomInt);
    }
  }

  state.wish = wish ?? null;
  const rules = state.rules;
  if (rules.seven && r === '7') state.penalty += 2;
  if (rules.nine && r === '9') {
    state.dir = state.dir === 1 ? -1 : 1;
    events.push({ type: 'reverse', dir: state.dir });
  }
  if (rules.ace && r === 'A') {
    state.again = true;
    events.push({ type: 'again', seat });
    return;
  }
  let next = nextSeat(seat, state.players, state.dir);
  if (rules.eight && r === '8') {
    state.skipped = next;
    events.push({ type: 'skip', seat: next });
    next = nextSeat(next, state.players, state.dir);
  }
  state.turn = next;
}

function draw(state, seat, events, randomInt) {
  if (state.drawn) throw new RuleError('drawn');
  state.skipped = null;
  if (state.penalty > 0) {
    const n = state.penalty;
    state.penalty = 0;
    const got = drawCards(state, seat, n, events, randomInt);
    events.push({ type: 'draw', seat, count: got, penalty: true });
    endTurn(state, seat);
    return;
  }
  const got = drawCards(state, seat, 1, events, randomInt);
  events.push({ type: 'draw', seat, count: got });
  if (!got) {
    // Nothing left to draw. Once nobody at the table can play or draw, the deal ends (blocked).
    state.stuck += 1;
    if (state.stuck >= state.players) {
      const fewest = Math.min(...state.hands.map((h) => h.length));
      const winner = [...Array(state.players).keys()]
        .map((k) => nextSeat(state.dealer, state.players, 1 + k))
        .find((s) => state.hands[s].length === fewest);
      finish(state, /** @type {number} */ (winner));
      events.push({ type: 'blocked', seat: winner });
      return;
    }
    endTurn(state, seat);
    return;
  }
  state.stuck = 0;
  const card = state.hands[seat][state.hands[seat].length - 1];
  // A card that fits may go straight on; anything else ends the turn.
  if (fits(state, card)) state.drawn = card;
  else endTurn(state, seat);
}

/**
 * Draws up to `n` cards into `seat`'s hand, turning the pile (all but its top card) into a new stock
 * when the stock runs out. Returns how many it got.
 */
function drawCards(state, seat, n, events, randomInt) {
  let got = 0;
  for (let i = 0; i < n; i++) {
    if (!state.stock.length) {
      const under = state.pile.slice(0, -1);
      if (!under.length) break;
      if (typeof randomInt !== 'function') throw new TypeError('act needs randomInt to shuffle the pile');
      state.stock = shuffled(under, randomInt);
      state.pile = [topCard(state)];
      events.push({ type: 'reshuffle', count: state.stock.length });
    }
    state.hands[seat].push(/** @type {string} */ (state.stock.shift()));
    state.said[seat] = false;
    got += 1;
  }
  return got;
}

function endTurn(state, seat) {
  state.drawn = null;
  state.again = false;
  state.turn = nextSeat(seat, state.players, state.dir);
}

function finish(state, winner) {
  state.phase = 'done';
  state.winner = winner;
  state.drawn = null;
  state.penalty = 0;
  state.points = scoreDeal(state);
}

/**
 * A deal's points per seat: with 'tally' a point for the winner; with 'points' everyone else loses
 * what their cards left in hand cost.
 * @param {State} state
 */
export function scoreDeal(state) {
  return state.hands.map((hand, seat) => {
    if (state.rules.scoring === 'tally') return seat === state.winner ? 1 : 0;
    return seat === state.winner ? 0 : -hand.reduce((sum, id) => sum + cost(id), 0);
  });
}

const SUIT_AT = Object.fromEntries(SUITS.map((s, i) => [s, i]));
const RANK_AT = Object.fromEntries(['7', '8', '9', '10', 'J', 'Q', 'K', 'A'].map((r, i) => [r, i]));
/** A hand as it's held: by suit (Eichel, Grün, Herz, Schellen), each low to high. */
export const sortHand = (hand) => sortBy(hand, (id) => {
  const { s, r } = parseCard(id);
  return SUIT_AT[s] * 20 + (RANK_AT[r] ?? 0);
});

/**
 * What one seat sees: its own hand and nobody else's (only how many cards each holds), the pile's
 * top few cards, the stock's size, whose turn it is and what's pending. `seat` null: a watcher.
 * @param {State} state  @param {number | null} seat
 */
export function view(state, seat) {
  const mine = seat !== null && seat >= 0 && seat < state.players;
  return {
    game: 'maumau',
    rules: state.rules,
    phase: state.phase,
    players: state.players,
    dealer: state.dealer,
    turn: state.turn,
    dir: state.dir,
    pile: state.pile.slice(-4),
    piled: state.pile.length,
    stock: state.stock.length,
    counts: state.hands.map((h) => h.length),
    wish: state.wish,
    penalty: state.penalty,
    again: state.again,
    skipped: state.skipped,
    said: [...state.said],
    // Someone drew a card that fits and is choosing; which card it is only they know.
    choosing: state.drawn !== null,
    hand: mine ? sortHand(state.hands[seat]) : null,
    drawn: mine && seat === state.turn ? state.drawn : null,
    playable: mine ? playable(state, seat) : [],
    winner: state.winner,
    points: state.points,
    // At the end every hand is shown, as when the cards are counted.
    hands: state.phase === 'done' ? state.hands.map(sortHand) : null,
  };
}
