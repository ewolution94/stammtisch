// A match: deals in a row at one table, for any game here. Pure, like the games (no I/O, no clock; a
// randomInt comes in). It knows who sits where, whose deal it is, who sits out (more people at the
// table than the game takes: the dealer first), and the running totals; each deal's own state is the
// game's (match.current), played through the game's moves and act().
//
// A match runs `rounds` times round the table: every seat deals once a round. A deal that isn't
// played (thrown in, poverty nobody took) is dealt again by the same dealer and doesn't count. A game
// may add its own match rules through hooks (Doppelkopf: the duty solo and Bock rounds, below).

import { RuleError, nextSeat } from './cards.mjs';

/**
 * @typedef {{
 *   id: string, PLAYERS: { min: number, max: number }, TABLE?: { min: number, max: number },
 *   cleanRules(input?: Record<string, unknown>): Record<string, any>,
 *   deal(o: Record<string, any>): any,
 *   match?: {
 *     start?(match: Match): void,
 *     dealArgs?(match: Match, seats: number[]): Record<string, unknown>,
 *     after?(match: Match, record: DealRecord): { counts?: boolean, sameDealer?: boolean },
 *     multiplier?(match: Match): number,
 *     over?(match: Match): boolean,
 *   },
 * }} Game
 * @typedef {{ n: number, dealer: number, seats: number[], points: number[], factor: number, counts: boolean, result: any }} DealRecord
 * @typedef {{
 *   game: string, table: number, rules: Record<string, any>, rounds: number, dealer: number,
 *   counted: number, totals: number[], history: DealRecord[], current: any, seats: number[] | null,
 *   extra: Record<string, any>,
 * }} Match
 */

/**
 * A new match for `table` people (seats 0 … table − 1, in the order they sit). `rounds`: how many
 * times the deal goes round. `dealer`: who deals first.
 * @param {Game} game  @param {{ table: number, rules?: Record<string, unknown>, rounds?: number, dealer?: number }} o
 * @returns {Match}
 */
export function createMatch(game, { table, rules, rounds = 1, dealer = 0 }) {
  const limits = game.TABLE ?? game.PLAYERS;
  if (!Number.isInteger(table) || table < limits.min || table > limits.max) throw new RuleError('table');
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 20) throw new RuleError('rounds');
  if (!Number.isInteger(dealer) || dealer < 0 || dealer >= table) throw new RuleError('players');
  /** @type {Match} */
  const match = {
    game: game.id,
    table,
    rules: game.cleanRules(rules),
    rounds,
    dealer,
    counted: 0,
    totals: Array(table).fill(0),
    history: [],
    current: null,
    seats: null,
    extra: {},
  };
  game.match?.start?.(match);
  return match;
}

/**
 * Who plays the next deal, as table seats in the game's seat order (the dealer's left first): all of
 * them, or with more at the table than the game takes, everyone but the dealer and the seats before
 * them. The dealer is the game's last seat when they play.
 * @param {Game} game  @param {Match} match
 */
export function activeSeats(game, match) {
  const players = Math.min(match.table, game.PLAYERS.max);
  return Array.from({ length: players }, (_, i) => nextSeat(match.dealer, match.table, 1 + i));
}

/** Whether every deal has been played (and the game has nothing left to settle). */
export function isOver(game, match) {
  if (match.counted < match.rounds * match.table) return false;
  return game.match?.over ? game.match.over(match) : true;
}

/**
 * Deals the next deal: match.current becomes the game's state, match.seats maps its seats to the
 * table's. Throws 'over' after the last deal, 'playing' while one is still on.
 * @param {Game} game  @param {Match} match  @param {(n: number) => number} randomInt
 */
export function nextDeal(game, match, randomInt) {
  if (match.current && match.current.phase !== 'done') throw new RuleError('playing');
  if (isOver(game, match)) throw new RuleError('over');
  const base = activeSeats(game, match);
  // A game may add to the deal (Doppelkopf: who owes a duty solo) or seat it differently.
  const extra = { ...(game.match?.dealArgs?.(match, base) ?? {}) };
  const order = /** @type {number[]} */ (extra.seats ?? base);
  delete extra.seats;
  match.seats = order;
  match.current = game.deal({
    players: order.length,
    // The game's dealer is its last seat: the dealer's left (seat 0) begins.
    dealer: order.length - 1,
    rules: match.rules,
    randomInt,
    ...extra,
  });
  return match.current;
}

/**
 * Settles a finished deal: its points (times any multiplier, Bock rounds) go to the table seats'
 * totals, and the deal moves on (or stays, if the game says so). Returns the deal's record.
 * @param {Game} game  @param {Match} match
 */
export function endDeal(game, match) {
  const state = match.current;
  if (!state || state.phase !== 'done') throw new RuleError('phase');
  const seats = /** @type {number[]} */ (match.seats);
  const result = state.result ?? { points: state.points };
  const raw = result.points ?? state.points;
  const factor = result.void ? 1 : game.match?.multiplier?.(match) ?? 1;
  const points = Array(match.table).fill(0);
  raw.forEach((p, i) => (points[seats[i]] = p * factor));
  /** @type {DealRecord} */
  const record = { n: match.history.length + 1, dealer: match.dealer, seats: [...seats], points, factor, counts: !result.void, result };
  const after = game.match?.after?.(match, record) ?? {};
  if (after.counts !== undefined) record.counts = after.counts;
  match.history.push(record);
  points.forEach((p, s) => (match.totals[s] += p));
  if (record.counts) match.counted += 1;
  const same = after.sameDealer ?? !record.counts;
  if (!same) match.dealer = nextSeat(match.dealer, match.table);
  match.current = null;
  match.seats = null;
  return record;
}

/** The seats with the highest total (more than one on a tie). @param {Match} match */
export function leaders(match) {
  const best = Math.max(...match.totals);
  return match.totals.flatMap((t, s) => (t === best ? [s] : []));
}
