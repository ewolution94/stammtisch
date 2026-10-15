// What every bot here shares: its rank, its temperament, a random draw seeded by what its seat sees,
// and the master's search. The ranks are a guild's (the user, 2026-10-14, the same as Stichle's):
//
//   apprentice  the rules with a beginner's habits: now and then the wrong one of two cards that do
//               the same job, no counting of what's been played, a guess where a journeyman weighs
//   journeyman  the rules, counting the cards (the default; what the bots played before the ranks)
//   master      deals out the cards it can't see, many times over (as they could lie, given what its
//               seat has seen), plays each choice to the end of the deal in all of them with the
//               journeyman's rules for everyone, and takes the one that scores best on average
//
// Mau-Mau has the first two only: the cards decide most of it. A temperament (cautious, steady,
// bold) comes with a bot's name and leans its bold decisions: a solo, an announcement, a bid.
//
// No bot ever reads a hand but its own (tests/bots.test.mjs → "honest"). Every draw comes from a
// generator seeded by what the seat sees, so the same position always gives the same move.

/** The ranks, weakest first, and the temperaments. */
export const LEVELS = Object.freeze(['apprentice', 'journeyman', 'master']);
export const TEMPERS = Object.freeze(['cautious', 'steady', 'bold']);

/** The ranks a game has: Mau-Mau two (a master would hardly play it better). */
export const levelsFor = (game) => (game === 'maumau' ? LEVELS.slice(0, 2) : LEVELS);

/** The rank a bot plays a game at: a rank the game hasn't (a master at Mau-Mau) is its best one. */
export function levelIn(game, level) {
  const ranks = levelsFor(game);
  return ranks.includes(level) ? level : ranks[ranks.length - 1];
}

/** @typedef {{ level?: string, temper?: string }} Style */

/**
 * A master's hard stop in wall-clock time (Stichle's, for the NAS's two slow cores, three to five
 * times this Mac): no new trial deal starts after it. STAMMTISCH_MASTER_MS overrides it for
 * tools/ladder.mjs.
 */
export const MASTER_MS = Number(globalThis.process?.env?.STAMMTISCH_MASTER_MS ?? 150);
/** How much play a master's decision may cost, in cards played across its trial deals
 *  (STAMMTISCH_MASTER_PLAYS overrides it: tests use a few, so the count binds before the clock). */
export const PLAYS = Number(globalThis.process?.env?.STAMMTISCH_MASTER_PLAYS ?? 6000);
/** How many trial deals a decision gets when one costs `cost` card plays: between 8 and `most`. */
export const trials = (cost, most) => clamp(Math.floor(PLAYS / Math.max(1, cost)), 8, most);
/** The wall-clock stop for a part of a decision: `share` of the master's time. */
export const stopAt = (share = 1) => Date.now() + MASTER_MS * share;

/**
 * The master's search: `imagine(r)` deals out one world as it could be (from what the seat knows),
 * `trial(world, choice)` plays a choice to the end in it and says what it brought the seat (the
 * world isn't changed). Every choice meets the same worlds, so they're compared fairly; it stops
 * after `deals` worlds or at the wall-clock stop, at least one world each. The best average wins; a
 * tie goes to `prefer` (the journeyman's own choice), then to the earlier choice.
 * @template C
 * @param {{ choices: C[], deals: number, imagine: (r: () => number) => any, trial: (world: any, choice: C) => number,
 *   r: () => number, prefer?: C, same?: (a: C, b: C) => boolean }} o
 * @returns {C}
 */
export function search({ choices, deals, imagine, trial, r, prefer, same = (a, b) => a === b }) {
  if (choices.length === 1) return choices[0];
  const total = choices.map(() => 0);
  const until = Date.now() + MASTER_MS;
  for (let d = 0; d < deals; d++) {
    const world = imagine(r);
    for (let i = 0; i < choices.length; i++) total[i] += trial(world, choices[i]);
    if (Date.now() > until) break;
  }
  let best = 0;
  for (let i = 1; i < choices.length; i++) {
    if (total[i] > total[best] + 1e-9) best = i;
    else if (Math.abs(total[i] - total[best]) <= 1e-9 && prefer !== undefined && same(choices[i], prefer) && !same(choices[best], prefer)) best = i;
  }
  return choices[best];
}

/**
 * A repeatable random number generator for one decision, seeded by a key the bot builds from what
 * its seat sees (and what the draw is for), so the same position always gives the same move.
 * @param {string} key
 */
export function seeded(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates in place, with a seeded generator. @template T @param {T[]} cards @param {() => number} r */
export function shuffle(cards, r) {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/**
 * One way the unseen cards could lie: each seat in `need` gets as many as it needs, first the cards
 * it's known to hold (`must`), then from the shuffled rest only cards `fits(seat, card)` allows (a
 * suit it showed it can't follow, a card it can't hold); when the cards can't honour every rule,
 * any will do. The most constrained seats are dealt first. What's left over is returned too.
 * @param {string[]} unseen  @param {Map<number, number>} need  seat → how many cards
 * @param {(seat: number, card: string) => boolean} fits  @param {() => number} r
 * @param {Map<number, string[]>} [must]  seat → cards it's known to hold (each taken from `unseen`)
 * @returns {{ hands: Map<number, string[]>, rest: string[] }}
 */
export function dealOut(unseen, need, fits, r, must = new Map()) {
  /** @type {(string | null)[]} */
  const pool = shuffle([...unseen], r);
  /** @type {Map<number, string[]>} */
  const hands = new Map([...need.keys()].map((s) => [s, []]));
  for (const [seat, cards] of must) {
    const hand = hands.get(seat);
    if (!hand) continue;
    for (const id of cards) {
      const k = pool.indexOf(id);
      if (k >= 0 && hand.length < /** @type {number} */ (need.get(seat))) {
        hand.push(id);
        pool[k] = null;
      }
    }
  }
  // The seats with the most cards ruled out first: they have the least choice.
  const ruled = (seat) => pool.reduce((n, id) => n + (id !== null && !fits(seat, id) ? 1 : 0), 0);
  const order = [...need.keys()].sort((a, b) => ruled(b) - ruled(a) || a - b);
  for (const pass of [true, false]) {
    for (const seat of order) {
      const hand = /** @type {string[]} */ (hands.get(seat));
      const want = /** @type {number} */ (need.get(seat));
      for (let k = 0; k < pool.length && hand.length < want; k++) {
        const id = pool[k];
        // First only what fits; then, the cards not allowing every rule, any will do.
        if (id !== null && (!pass || fits(seat, id))) {
          hand.push(id);
          pool[k] = null;
        }
      }
    }
  }
  return { hands, rest: /** @type {string[]} */ (pool.filter((id) => id !== null)) };
}

/** A multiset difference: `all` without one copy of each card in `minus`. @param {string[]} all @param {Iterable<string>} minus */
export function without(all, minus) {
  const left = [...all];
  for (const id of minus) {
    const k = left.indexOf(id);
    if (k >= 0) left.splice(k, 1);
  }
  return left;
}
