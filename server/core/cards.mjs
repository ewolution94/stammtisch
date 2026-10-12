// The cards every game here shares: ids, decks, points, shuffling, dealing. Pure, like the rest of
// server/core and server/games: no I/O, no clock, no randomness of its own (a randomInt comes in), so
// the page may import it too.
//
// A card id is "<suit>-<rank>" and names the card in the French way, whatever deck the page draws:
// suits c (Kreuz, Eichel), s (Pik, Grün), h (Herz), d (Karo, Schellen), in the order Skat and
// Doppelkopf rank them; ranks 2 to 10, J (Bube, Unter), Q (Dame, Ober), K, A (Ass, Daus). The page
// draws the German deck by default. A deck with two of each card (Doppelkopf, Mau-Mau with many
// players) carries the same id twice: equal cards are equal, and which of two was played first is the
// trick's business, not the card's.

export class RuleError extends Error {
  /** @param {string} code */
  constructor(code) {
    super(code);
    this.name = 'RuleError';
    this.code = code;
  }
}

/** @typedef {'c' | 's' | 'h' | 'd'} Suit */
/** @typedef {'2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'|'10'|'J'|'Q'|'K'|'A'} Rank */

/** Kreuz/Eichel, Pik/Grün, Herz, Karo/Schellen: the order Skat and Doppelkopf rank them. */
export const SUITS = Object.freeze(/** @type {Suit[]} */ (['c', 's', 'h', 'd']));
/** Low to high, the plain order (each game ranks its own way). */
export const RANKS = Object.freeze(/** @type {Rank[]} */ (['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']));

const CARD = /^([cshd])-(10|[2-9]|[JQKA])$/;

/** @param {unknown} id  @returns {{ s: Suit, r: Rank }} */
export function parseCard(id) {
  const m = typeof id === 'string' ? CARD.exec(id) : null;
  if (!m) throw new RuleError('card');
  return { s: /** @type {Suit} */ (m[1]), r: /** @type {Rank} */ (m[2]) };
}

/** @param {unknown} id */
export const isCard = (id) => typeof id === 'string' && CARD.test(id);
/** @param {string} id  @returns {Suit} */
export const suitOf = (id) => parseCard(id).s;
/** @param {string} id  @returns {Rank} */
export const rankOf = (id) => parseCard(id).r;
/** @param {Suit} s  @param {Rank} r */
export const cardId = (s, r) => `${s}-${r}`;

/**
 * The decks, by the ranks they hold: Skat's 32 (7 to Ass, also Mau-Mau's), Doppelkopf's 9 to Ass
 * (twice) and without the nines, Durak's 36 (6 to Ass), the full 52.
 */
export const DECK_RANKS = Object.freeze({
  skat: Object.freeze(/** @type {Rank[]} */ (['7', '8', '9', '10', 'J', 'Q', 'K', 'A'])),
  doko: Object.freeze(/** @type {Rank[]} */ (['9', '10', 'J', 'Q', 'K', 'A'])),
  doko40: Object.freeze(/** @type {Rank[]} */ (['10', 'J', 'Q', 'K', 'A'])),
  durak: Object.freeze(/** @type {Rank[]} */ (['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'])),
  full: RANKS,
});

/**
 * A deck in box order: suit by suit (SUITS order), each low to high; `copies` times over (Doppelkopf
 * and Mau-Mau for five or six take two). Returns a new array.
 * @param {keyof typeof DECK_RANKS} kind  @param {number} [copies]
 */
export function makeDeck(kind, copies = 1) {
  const ranks = DECK_RANKS[kind];
  if (!ranks) throw new RuleError('deck');
  const one = SUITS.flatMap((s) => ranks.map((r) => cardId(s, r)));
  return Array.from({ length: copies }, () => one).flat();
}

/** What a card counts in Skat and Doppelkopf (Augen): Ass 11, Zehn 10, König 4, Ober 3, Unter 2. */
export const AUGEN = Object.freeze({ A: 11, 10: 10, K: 4, Q: 3, J: 2 });
/** @param {string} id */
export const augen = (id) => AUGEN[rankOf(id)] ?? 0;
/** @param {readonly string[]} cards */
export const sumAugen = (cards) => cards.reduce((sum, id) => sum + augen(id), 0);

/**
 * Fisher–Yates. Returns a new array.
 * @template T  @param {readonly T[]} cards  @param {(n: number) => number} randomInt 0..n-1
 */
export function shuffled(cards, randomInt) {
  if (typeof randomInt !== 'function') throw new TypeError('shuffled needs randomInt');
  const a = [...cards];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** The seat `steps` on from `seat` (negative goes the other way round). */
export const nextSeat = (seat, players, steps = 1) => (((seat + steps) % players) + players) % players;

/**
 * Deals `deck` (already shuffled) round the table in packets, starting at `first` and going on by
 * `dir`: `packets` is the cards per seat in each pass (Skat's 3-4-3, Doppelkopf's 3-3-3-3, or [n] for
 * one pass of n). Returns the hands and what's left, in order.
 * @param {readonly string[]} deck  @param {{ players: number, first: number, packets: number[], dir?: 1 | -1 }} o
 */
export function dealPackets(deck, { players, first, packets, dir = 1 }) {
  const need = players * packets.reduce((a, b) => a + b, 0);
  if (need > deck.length) throw new RuleError('deck');
  /** @type {string[][]} */
  const hands = Array.from({ length: players }, () => []);
  let at = 0;
  for (const n of packets) {
    for (let k = 0; k < players; k++) {
      hands[nextSeat(first, players, dir * k)].push(...deck.slice(at, at + n));
      at += n;
    }
  }
  return { hands, rest: deck.slice(at) };
}

/**
 * Takes one copy of `id` out of `hand` (in place). Throws 'card' when the hand hasn't got it.
 * @param {string[]} hand  @param {string} id
 */
export function takeCard(hand, id) {
  const at = hand.indexOf(id);
  if (at < 0) throw new RuleError('card');
  hand.splice(at, 1);
  return id;
}

/** Counts of each id: a multiset, for checking that cards are neither lost nor made. */
export function tally(cards) {
  /** @type {Map<string, number>} */
  const m = new Map();
  for (const id of cards) m.set(id, (m.get(id) ?? 0) + 1);
  return m;
}

/**
 * Sorts a hand by a game's own key (lower first). Returns a new array; equal keys keep their order.
 * @param {readonly string[]} hand  @param {(id: string) => number} key
 */
export const sortBy = (hand, key) => [...hand].sort((a, b) => key(a) - key(b));
