// Shared by the tests: a seeded random, error matching, and whole deals played by bots with the
// invariants checked after every move.

import assert from 'node:assert/strict';
import { RuleError, tally } from '../server/core/cards.mjs';

/** mulberry32: a repeatable random integer below n. */
export function seeded(seed = 1) {
  let a = seed >>> 0;
  return (n) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
  };
}

/** Asserts that fn throws a RuleError with this code. */
export const throws = (fn, code) => assert.throws(fn, (e) => e instanceof RuleError && e.code === code, code);

/** Whether two multisets of cards hold the same cards. */
export function sameCards(a, b) {
  const x = tally(a);
  const y = tally(b);
  if (x.size !== y.size) return false;
  for (const [k, n] of x) if (y.get(k) !== n) return false;
  return true;
}

/** The cards a view's JSON mentions anywhere, as a multiset (card ids are "s-r"). */
export function cardsIn(value) {
  const found = [];
  const walk = (v) => {
    if (typeof v === 'string' && /^[cshd]-(10|[2-9]|[JQKA])$/.test(v)) found.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(value);
  return found;
}

/** The every-seat choice of a moves list, for random play. */
export const pick = (list, randomInt) => list[randomInt(list.length)];

export { assert };
