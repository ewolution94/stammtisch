// A Mau-Mau bot in two ranks (server/bots/rank.mjs: the cards decide most of Mau-Mau, so there's no
// master), deterministic (the same state gives the same move). It looks only at what its own seat
// may see. The journeyman keeps its Unter for when nothing else fits, sheds the suit it holds most of
// (so the pile stays in a suit it can follow), puts a 7 or an 8 on whoever is close to going out,
// passes a waiting 7 on when it can, and never forgets "Mau!". The apprentice puts any card that fits
// every other move (an Unter too, early), and forgets "Mau!" one time in four.

import { SUITS, parseCard } from '../core/cards.mjs';
import { cost, moves, view } from '../games/maumau.mjs';
import { seeded } from './rank.mjs';

/** @typedef {import('../games/maumau.mjs').State} State */

/**
 * The bot's move for `seat`, whose turn it is.
 * @param {State} state  @param {number} seat  @param {import('./rank.mjs').Style} [style]
 */
export function botMove(state, seat, { level = 'journeyman' } = {}) {
  let move = ruleMove(state, seat);
  if (level !== 'apprentice') return move;
  const v = view(state, seat);
  const r = seeded(`apprentice|${state.dealer}|${seat}|${/** @type {string[]} */ (v.hand).join(',')}|${state.pile.length}|${state.pile.at(-1)}|${v.penalty}|${v.drawn ?? ''}`);
  // Any card that fits, every other move (not on a waiting 7: that one has only one answer).
  if (move.type === 'play' && !v.penalty && !v.drawn && r() < 0.5) {
    const plays = moves(state, seat).filter((m) => m.type === 'play');
    const other = plays[Math.floor(r() * plays.length)];
    if (other) move = { ...pickWish(other, /** @type {string[]} */ (v.hand), state), ...('mau' in move ? { mau: true } : {}) };
  }
  // "Mau!" forgotten now and then.
  if ('mau' in move && r() < 0.25) delete move.mau;
  return move;
}

/** The journeyman's move. @param {State} state  @param {number} seat */
function ruleMove(state, seat) {
  const v = view(state, seat);
  const legal = moves(state, seat);
  if (!legal.length) throw new Error('not this seat’s turn');
  const hand = /** @type {string[]} */ (v.hand);
  const mau = state.rules.mau && hand.length === 2 ? { mau: true } : {};
  const plays = legal.filter((m) => m.type === 'play');

  // A 7 is waiting: pass it on if a 7 is in hand, else take the cards.
  if (v.penalty > 0) {
    const seven = plays[0];
    return seven ? { ...seven, ...mau } : { type: 'draw' };
  }
  // Drew a card that fits: play it, unless it's an Unter worth keeping for later.
  if (v.drawn) {
    const play = plays[0];
    if (play && !(isJack(v.drawn, state) && hand.length > 2)) return { ...pickWish(play, hand, state), ...mau };
    return { type: 'pass' };
  }
  if (!plays.length) return { type: 'draw' };

  const next = (state.turn + v.dir + v.players) % v.players;
  const nextClose = v.counts[next] <= 2;
  const cards = [...new Set(plays.map((m) => /** @type {string} */ (m.card)))];
  const score = (/** @type {string} */ id) => {
    const { s, r } = parseCard(id);
    let n = 0;
    // Keep the Unter: it fits anything, so it's the way out of a bad pile.
    if (isJack(id, state)) n -= hand.length > 2 ? 40 : 5;
    // Stay in a suit the hand can follow: the more cards of this suit after this one, the better.
    n += 3 * (hand.filter((h) => h !== id && parseCard(h).s === s).length);
    if (state.rules.seven && r === '7') n += nextClose ? 12 : 1;
    if (state.rules.eight && r === '8') n += nextClose ? 10 : 1;
    // Playing again is a free card, as long as something else can follow.
    if (state.rules.ace && r === 'A') n += hand.length > 2 ? 4 : 0;
    // With points counted, shed the expensive cards first.
    if (state.rules.scoring === 'points') n += cost(id) / 4;
    return n;
  };
  // Best score first; a tie goes to the card earlier in the sorted hand.
  const best = cards.reduce((a, b) => (score(b) > score(a) ? b : a));
  const play = /** @type {Record<string, unknown>} */ (plays.find((m) => m.card === best));
  return { ...pickWish(play, hand, state), ...mau };
}

/** An Unter wishes the suit the bot holds most of (the Unter itself aside); ties go by SUITS order. */
function pickWish(play, hand, state) {
  if (!('wish' in play)) return play;
  const rest = [...hand];
  rest.splice(rest.indexOf(/** @type {string} */ (play.card)), 1);
  const count = (s) => rest.filter((id) => parseCard(id).s === s && !isJack(id, state)).length;
  const wish = SUITS.reduce((best, s) => (count(s) > count(best) ? s : best), SUITS[0]);
  return { type: 'play', card: play.card, wish };
}

const isJack = (id, state) => state.rules.jack && parseCard(id).r === 'J';
