// Tricks, for every game that takes them (Doppelkopf, Skat, later Hearts and Schafkopf): who must
// follow what, and who takes a trick. Each game brings its own ranking; the rules here are the ones
// they share: follow the class led (a suit, or trump) if you can; a trump beats every plain card; else
// the highest card of the class led wins; of two equal cards the first one played, unless the game
// says otherwise (Doppelkopf's house rule "the second Dulle beats the first").

import { sumAugen } from './cards.mjs';

/**
 * @typedef {{ seat: number, card: string }} Played
 * @typedef {{
 *   cls(id: string): string,
 *   rank(id: string): number,
 *   tie?(id: string, ctx: TrickContext): boolean,
 * }} Ranking
 *   cls: what a card counts as when following: 'trump', or its plain suit;
 *   rank: higher beats lower within a class;
 *   tie: whether this card, played after an equal one, beats it (default: never).
 * @typedef {{ last?: boolean }} TrickContext  last: the round's last trick
 */

/**
 * The cards of `hand` that may go on `trick`: those of the class led, or any card when the hand has
 * none of it (or the trick is empty). Returns a new array, in the hand's order, copies included.
 * @param {readonly string[]} hand  @param {readonly Played[]} trick  @param {Ranking} ranking
 */
export function legalFollow(hand, trick, ranking) {
  if (!trick.length) return [...hand];
  const led = ranking.cls(trick[0].card);
  const same = hand.filter((id) => ranking.cls(id) === led);
  return same.length ? same : [...hand];
}

/**
 * Which entry of a trick (in play order) takes it, as an index into `cards`; -1 for an empty trick.
 * @param {readonly Played[]} cards  @param {Ranking} ranking  @param {TrickContext} [ctx]
 */
export function trickWinner(cards, ranking, ctx = {}) {
  if (!cards.length) return -1;
  const led = ranking.cls(cards[0].card);
  let best = 0;
  for (let i = 1; i < cards.length; i++) if (beats(cards[i].card, cards[best].card, led, ranking, ctx)) best = i;
  return best;
}

/** Whether `card`, played later, beats the trick's best so far (always a trump or of the class led). */
function beats(card, best, led, ranking, ctx) {
  const c = ranking.cls(card);
  const b = ranking.cls(best);
  if (c === 'trump' && b !== 'trump') return true;
  // A plain card of another class never wins; nor does a card of the class led over a trump.
  if (c !== b || (c !== 'trump' && c !== led)) return false;
  const rc = ranking.rank(card);
  const rb = ranking.rank(best);
  if (rc !== rb) return rc > rb;
  return ranking.tie ? ranking.tie(card, ctx) : false;
}

/** The Augen in a trick's cards. @param {readonly Played[]} cards */
export const trickAugen = (cards) => sumAugen(cards.map((p) => p.card));
