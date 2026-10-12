// Durak as a pure state machine (see server/core/cards.mjs for what "pure" means here): the Russian
// throwing-in game ("podkidnoy"), with the transfer ("perevodnoy") as a house rule. 2 to 6 players,
// 36 cards (6 to Ass), six each; the next card turns up and goes under the stock: its suit is trump.
//
// A bout: the attacker leads a card; the defender beats it (a higher card of its suit, or any trump
// over a plain card, a higher trump over a trump). Everyone else at the table (or only the
// defender's neighbours, a house rule) may throw in more cards of a rank already on the table: never
// more than six in a bout (five in the first), and never more than the defender held at its start.
// The defender beats them all, and the cards go off ("bito"): the defender attacks next. Or the
// defender takes them all (and the others may still throw in), and the player after the defender
// attacks. Then everyone draws back up to six, the attacker first, the defender last. With the stock
// gone, whoever has no cards left is out; the last one holding cards is the Durak, the fool.
//
// Moves (plain JSON):
//   { type: 'attack', card }     the attacker's lead, or throwing in a card of a rank on the table
//   { type: 'beat', card, at }   the defender beats the attack at index `at` with `card`
//   { type: 'transfer', card }   house rule: the defender adds a card of the attack's rank instead,
//                                and the attack moves on to the next player
//   { type: 'take' }             the defender takes the table
//   { type: 'pass' }             an attacker is done throwing in ("bito")
// The deal waits on `turn` (the defender while a card is open, else the next attacker who may still
// throw in); others may throw in or pass at any time.

import { RuleError, isCard, makeDeck, nextSeat, parseCard, shuffled, sortBy, takeCard } from '../core/cards.mjs';

export const id = 'durak';
export const PLAYERS = Object.freeze({ min: 2, max: 6 });

/** transfer: the defender may pass the attack on · throwIn: 'all' or 'neighbours' may throw in · firstFive: five in the first bout. */
export const RULES = Object.freeze({ transfer: false, throwIn: 'all', firstFive: true });
export const THROW_INS = Object.freeze(['all', 'neighbours']);

/** @param {Record<string, unknown>} [input] */
export function cleanRules(input = {}) {
  const out = { ...RULES };
  for (const k of ['transfer', 'firstFive']) {
    if (input[k] === undefined) continue;
    if (typeof input[k] !== 'boolean') throw new RuleError('rules');
    out[k] = input[k];
  }
  if (input.throwIn !== undefined) {
    if (!THROW_INS.includes(/** @type {string} */ (input.throwIn))) throw new RuleError('rules');
    out.throwIn = /** @type {string} */ (input.throwIn);
  }
  return Object.freeze(out);
}

const ORDER = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const value = (id) => ORDER.indexOf(parseCard(id).r);
const HAND = 6;

/** Whether `card` beats `attack` with this trump suit. */
export function beats(card, attack, trump) {
  const c = parseCard(card);
  const a = parseCard(attack);
  if (c.s === a.s) return value(card) > value(attack);
  return c.s === trump && a.s !== trump;
}

/**
 * @typedef {{ attack: string, by: number, defense: string | null }} Pair
 * @typedef {{
 *   game: 'durak', rules: typeof RULES, players: number, dealer: number,
 *   hands: string[][], stock: string[], trumpCard: string, trump: string, discard: string[],
 *   out: number[], attacker: number, defender: number, table: Pair[], taking: boolean,
 *   passed: boolean[], bout: number, limit: number, phase: 'play' | 'done', turn: number,
 *   loser: number | null, result: any,
 *   lastBout: { n: number, pairs: Pair[], took: boolean, defender: number } | null,
 * }} State
 */

/**
 * Deals a fresh deal. Tests pass `hands` and `stock` (drawn from the front; its last card is the
 * turned trump) instead of randomInt.
 * @param {{ players: number, dealer: number, rules?: Record<string, unknown>, randomInt?: (n: number) => number, hands?: string[][], stock?: string[] }} o
 * @returns {State}
 */
export function deal({ players, dealer, rules: raw, randomInt, hands: fixed, stock: fixedStock }) {
  const rules = cleanRules(raw);
  if (!Number.isInteger(players) || players < PLAYERS.min || players > PLAYERS.max) throw new RuleError('players');
  if (!Number.isInteger(dealer) || dealer < 0 || dealer >= players) throw new RuleError('players');
  /** @type {string[][]} */
  let hands;
  /** @type {string[]} */
  let stock;
  if (fixed) {
    if (fixed.length !== players || [...fixed.flat(), ...(fixedStock ?? [])].some((id) => !isCard(id))) throw new RuleError('deal');
    hands = fixed.map((h) => [...h]);
    stock = [...(fixedStock ?? [])];
  } else {
    if (typeof randomInt !== 'function') throw new TypeError('deal needs randomInt or hands');
    const deck = shuffled(makeDeck('durak'), randomInt);
    hands = Array.from({ length: players }, () => []);
    for (let i = 0; i < players * HAND; i++) hands[nextSeat(dealer, players, 1 + (i % players))].push(deck[i]);
    stock = deck.slice(players * HAND);
  }
  // The turned card lies under the stock; with six at the table there's no stock, and the dealer's
  // last card shows the trump.
  const trumpCard = stock.length ? stock[stock.length - 1] : hands[dealer][hands[dealer].length - 1];
  const trump = parseCard(trumpCard).s;
  // The lowest trump leads; nobody has one: the dealer's left.
  let attacker = nextSeat(dealer, players);
  let low = Infinity;
  for (let s = 0; s < players; s++) {
    for (const id of hands[s]) if (parseCard(id).s === trump && value(id) < low) (low = value(id)), (attacker = s);
  }
  /** @type {State} */
  const state = {
    game: 'durak',
    rules,
    players,
    dealer,
    hands,
    stock,
    trumpCard,
    trump,
    discard: [],
    out: [],
    attacker,
    defender: 0,
    table: [],
    taking: false,
    passed: Array(players).fill(false),
    bout: 0,
    limit: 0,
    phase: 'play',
    turn: attacker,
    loser: null,
    result: null,
    lastBout: null,
  };
  startBout(state, attacker);
  return state;
}

/** The seats still holding cards (or able to draw), in order from `seat`. */
const active = (s) => [...Array(s.players).keys()].filter((p) => !s.out.includes(p));
function nextActive(s, seat) {
  for (let k = 1; k <= s.players; k++) {
    const p = nextSeat(seat, s.players, k);
    if (!s.out.includes(p)) return p;
  }
  return seat;
}

function startBout(s, attacker) {
  s.attacker = attacker;
  s.defender = nextActive(s, attacker);
  s.table = [];
  s.taking = false;
  s.passed = Array(s.players).fill(false);
  s.bout += 1;
  s.limit = Math.min(s.rules.firstFive && s.bout === 1 ? 5 : 6, s.hands[s.defender].length);
  s.turn = attacker;
}

/** Who may throw in this bout: everyone but the defender, or only its neighbours (house rule). */
export function throwers(s) {
  const all = active(s).filter((p) => p !== s.defender);
  if (s.rules.throwIn === 'all') return all;
  const left = nextActive(s, s.defender);
  return all.filter((p) => p === s.attacker || p === left);
}

const ranksOnTable = (s) => new Set(s.table.flatMap((p) => [p.attack, p.defense].filter(Boolean).map((id) => parseCard(id).r)));
const open = (s) => s.table.filter((p) => p.defense === null).length;

/** The cards `seat` may attack or throw in with now. */
export function attackCards(s, seat) {
  if (s.phase !== 'play' || seat === s.defender || !throwers(s).includes(seat)) return [];
  if (!s.table.length) return seat === s.attacker ? [...s.hands[seat]] : [];
  if (s.table.length >= s.limit) return [];
  const ranks = ranksOnTable(s);
  return s.hands[seat].filter((id) => ranks.has(parseCard(id).r));
}

/** For the defender: each open attack's index with the cards that beat it. */
export function beatOptions(s, seat) {
  if (s.phase !== 'play' || seat !== s.defender || s.taking) return [];
  return s.table.flatMap((p, at) => (p.defense === null ? [{ at, cards: s.hands[seat].filter((id) => beats(id, p.attack, s.trump)) }] : []));
}

/** Transfer (house rule): before any card is beaten, a card of the attack's rank passes it on. */
export function transferCards(s, seat) {
  if (!s.rules.transfer || s.phase !== 'play' || seat !== s.defender || s.taking || !s.table.length) return [];
  if (s.table.some((p) => p.defense !== null)) return [];
  const rank = parseCard(s.table[0].attack).r;
  if (s.table.some((p) => parseCard(p.attack).r !== rank)) return [];
  const next = nextActive(s, s.defender);
  if (next === s.attacker && active(s).length === 2) return [];
  if (s.hands[next].length < s.table.length + 1) return [];
  return s.hands[seat].filter((id) => parseCard(id).r === rank);
}

/** Every legal move for `seat` now. */
export function moves(s, seat) {
  /** @type {Record<string, unknown>[]} */
  const out = [];
  if (s.phase !== 'play') return out;
  for (const card of new Set(attackCards(s, seat))) out.push({ type: 'attack', card });
  for (const { at, cards } of beatOptions(s, seat)) for (const card of new Set(cards)) out.push({ type: 'beat', card, at });
  for (const card of new Set(transferCards(s, seat))) out.push({ type: 'transfer', card });
  if (seat === s.defender && s.table.length && !s.taking) out.push({ type: 'take' });
  if (seat !== s.defender && s.table.length && throwers(s).includes(seat) && !s.passed[seat] && (open(s) === 0 || s.taking)) out.push({ type: 'pass' });
  return out;
}

/**
 * Makes a move; returns what happened, for the table.
 * @param {State} s  @param {number} seat  @param {Record<string, any>} move
 */
export function act(s, seat, move) {
  if (s.phase !== 'play') throw new RuleError('phase');
  if (!move || typeof move !== 'object') throw new RuleError('move');
  if (!Number.isInteger(seat) || seat < 0 || seat >= s.players) throw new RuleError('turn');
  /** @type {Record<string, unknown>[]} */
  const events = [];
  switch (move.type) {
    case 'attack': {
      if (!isCard(move.card) || !s.hands[seat].includes(move.card)) throw new RuleError('card');
      if (!attackCards(s, seat).includes(move.card)) throw new RuleError(s.table.length ? 'throw-in' : 'turn');
      takeCard(s.hands[seat], move.card);
      s.table.push({ attack: move.card, by: seat, defense: null });
      s.passed = Array(s.players).fill(false);
      events.push({ type: 'attack', seat, card: move.card });
      break;
    }
    case 'beat': {
      if (seat !== s.defender || s.taking) throw new RuleError('turn');
      const pair = s.table[move.at];
      if (!pair || pair.defense !== null) throw new RuleError('at');
      if (!isCard(move.card) || !s.hands[seat].includes(move.card)) throw new RuleError('card');
      if (!beats(move.card, pair.attack, s.trump)) throw new RuleError('beat');
      takeCard(s.hands[seat], move.card);
      pair.defense = move.card;
      s.passed = Array(s.players).fill(false);
      events.push({ type: 'beat', seat, card: move.card, at: move.at });
      break;
    }
    case 'transfer': {
      if (!transferCards(s, seat).includes(move.card)) throw new RuleError('transfer');
      takeCard(s.hands[seat], move.card);
      s.table.push({ attack: move.card, by: seat, defense: null });
      s.attacker = seat;
      s.defender = nextActive(s, seat);
      s.limit = Math.max(s.table.length, Math.min(s.rules.firstFive && s.bout === 1 ? 5 : 6, s.hands[s.defender].length + 0));
      s.passed = Array(s.players).fill(false);
      events.push({ type: 'transfer', seat, card: move.card, to: s.defender });
      break;
    }
    case 'take': {
      if (seat !== s.defender || !s.table.length || s.taking) throw new RuleError('take');
      s.taking = true;
      s.passed = Array(s.players).fill(false);
      events.push({ type: 'take', seat });
      break;
    }
    case 'pass': {
      if (!moves(s, seat).some((m) => m.type === 'pass')) throw new RuleError('pass');
      s.passed[seat] = true;
      events.push({ type: 'pass', seat });
      break;
    }
    default:
      throw new RuleError('move');
  }
  settle(s, events);
  return events;
}

/** After every move: the bout ends when nothing is open and every thrower is done; else whose turn. */
function settle(s, events) {
  const allDone = throwers(s).every((p) => s.passed[p] || attackCards(s, p).length === 0);
  const nothingOpen = open(s) === 0 || s.taking;
  if (s.table.length && nothingOpen && allDone) return endBout(s, events);
  // Whose move the deal waits for.
  if (open(s) > 0 && !s.taking) s.turn = s.defender;
  else {
    const order = [s.attacker, ...throwers(s).filter((p) => p !== s.attacker)];
    s.turn = order.find((p) => !s.passed[p] && attackCards(s, p).length > 0) ?? s.attacker;
  }
}

function endBout(s, events) {
  const cards = s.table.flatMap((p) => [p.attack, p.defense].filter(Boolean));
  const took = s.taking;
  // The bout as it ended, for the table to show a moment longer (beaten off, or taken up).
  s.lastBout = { n: s.bout, pairs: s.table.map((p) => ({ ...p })), took, defender: s.defender };
  if (took) {
    s.hands[s.defender].push(...cards);
    events.push({ type: 'took', seat: s.defender, count: cards.length });
  } else {
    s.discard.push(...cards);
    events.push({ type: 'bito', count: cards.length });
  }
  // Draw back up to six: the attacker first, the other throwers in turn, the defender last.
  const order = [s.attacker, ...throwers(s).filter((p) => p !== s.attacker), s.defender];
  for (const p of order) {
    while (s.hands[p].length < HAND && s.stock.length) s.hands[p].push(/** @type {string} */ (s.stock.shift()));
  }
  s.table = [];
  // Whoever has no cards left, with the stock gone, is out.
  if (!s.stock.length) for (const p of order) if (!s.hands[p].length && !s.out.includes(p)) (s.out.push(p), events.push({ type: 'out', seat: p }));
  const left = active(s);
  if (left.length <= 1) return finish(s, left[0] ?? null, events);
  const defender = s.defender;
  const next = took ? nextActive(s, defender) : s.out.includes(defender) ? nextActive(s, defender) : defender;
  startBout(s, next);
}

function finish(s, loser, events) {
  s.phase = 'done';
  s.loser = loser;
  s.turn = loser ?? s.attacker;
  // The Durak loses a point; everyone else nothing (a draw when the last two went out together).
  const points = Array(s.players).fill(0);
  if (loser !== null) points[loser] = -1;
  s.result = { loser, out: [...s.out], points, hands: s.hands.map((h) => [...h]) };
  events.push({ type: 'durak', seat: loser });
}

/** A hand as it's held: by suit (trumps last), each low to high. */
export function sortHand(s, hand) {
  const SUITS = ['c', 's', 'h', 'd'].filter((x) => x !== s.trump).concat(s.trump);
  return sortBy(hand, (id) => SUITS.indexOf(parseCard(id).s) * 20 + value(id));
}

/**
 * What one seat sees: its own hand, the others' card counts, the table, the trump card under the
 * stock, the stock's and the discard's size, and its own legal moves.
 * @param {State} s  @param {number | null} seat
 */
export function view(s, seat) {
  const mine = seat !== null && seat >= 0 && seat < s.players;
  return {
    game: 'durak',
    rules: s.rules,
    phase: s.phase,
    players: s.players,
    dealer: s.dealer,
    turn: s.turn,
    attacker: s.attacker,
    defender: s.defender,
    trumpCard: s.trumpCard,
    trump: s.trump,
    stock: s.stock.length,
    discard: s.discard.length,
    out: [...s.out],
    table: s.table.map((p) => ({ ...p })),
    taking: s.taking,
    passed: [...s.passed],
    limit: s.limit,
    bout: s.bout,
    counts: s.hands.map((h) => h.length),
    hand: mine ? sortHand(s, s.hands[seat]) : null,
    moves: mine ? moves(s, seat) : [],
    lastBout: s.lastBout,
    loser: s.loser,
    result: s.result,
  };
}
