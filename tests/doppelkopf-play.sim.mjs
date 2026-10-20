// Simulated games for Doppelkopf: whole deals by bots and random players, and bots against random players.
// Not in CI (the user, 2026-10-20: "rely on simpler (unit) tests there"); run them with `npm run test:sim`.
// Whole deals of Doppelkopf, played by the bots and by random legal play, under every house rule,
// with the invariants checked after every move: no card lost or made, every move the bot picks is
// legal, the Augen add up to 240 and the points to zero, no view shows a card it shouldn't, and the
// parties a seat "knows" are never wrong.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDeck } from '../server/core/cards.mjs';
import * as D from '../server/games/doppelkopf.mjs';
import { botMove } from '../server/bots/doppelkopf.mjs';
import { cardsIn, pick, sameCards, seeded } from './helpers.mjs';

const RULESETS = [
  {},
  { dulle: 'second', schweinchen: true },
  { poverty: true, throw: true },
  { nines: false, dulle: 'second-not-last' },
  { duty: true, poverty: true, schweinchen: true },
];

/** Every card of the deal, wherever it is now. */
const everywhere = (s) => [
  ...s.hands.flat(),
  ...s.tricks.flatMap((t) => t.cards.map((p) => p.card)),
  ...s.trick.cards.map((p) => p.card),
  ...(s.poverty?.cards ?? []),
];

const same = (a, b) => JSON.stringify(normal(a)) === JSON.stringify(normal(b));
const normal = (m) => (m.cards ? { ...m, cards: [...m.cards].sort() } : m);

function check(s, deck) {
  assert.ok(sameCards(everywhere(s), deck), 'cards conserved');
  for (let seat = 0; seat < 4; seat++) {
    // The parties as the seat knows them are the truth, or unknown.
    const known = D.knownParties(s, seat);
    known.forEach((p, i) => assert.ok(p === null || p === s.parties[i], `seat ${seat} thinks ${i} is ${p}`));
    if (s.phase === 'done') continue;
    const allowed = new Set([...s.hands[seat], ...s.trick.cards.map((p) => p.card), ...(s.tricks.at(-1)?.cards.map((p) => p.card) ?? [])]);
    for (const id of cardsIn(D.view(s, seat))) assert.ok(allowed.has(id), `seat ${seat} sees ${id}`);
  }
  const watcher = D.knownParties(s, null);
  watcher.forEach((p, i) => assert.ok(p === null || p === s.parties[i]));
}

function finished(s) {
  assert.equal(s.phase, 'done');
  if (s.result.void) return;
  assert.equal(s.result.augen.re + s.result.augen.kontra, s.size === 12 ? 240 : 240);
  assert.equal(s.result.points.reduce((a, b) => a + b, 0), 0, 'points sum to zero');
  assert.equal(s.tricks.length, s.size);
}

/** A random player: any legal move, an announcement now and then, healthy more often than not. */
function randomMove(s, seat, randomInt) {
  const all = D.moves(s, seat);
  const plays = all.filter((m) => m.type !== 'announce');
  if (s.phase === 'reserve' && randomInt(3)) return all[0];
  if (plays.length && (randomInt(6) || !all.some((m) => m.type === 'announce'))) return pick(plays, randomInt);
  return pick(all, randomInt);
}

test('bots play every deal to its end, legally, under every house rule', () => {
  const kinds = new Set();
  for (const rules of RULESETS) {
    for (let seed = 1; seed <= 60; seed++) {
      const randomInt = seeded(seed * 7 + 1);
      const owes = [seed % 2 === 0, true, false, seed % 3 === 0];
      const s = D.deal({ dealer: seed % 4, rules, randomInt, owes, forced: rules.duty && seed % 10 === 0 ? seed % 4 : null });
      const deck = makeDeck(rules.nines === false ? 'doko40' : 'doko', 2);
      for (let n = 0; s.phase !== 'done'; n++) {
        assert.ok(n < 400, 'the deal ends');
        const seat = s.turn;
        const move = botMove(s, seat);
        assert.ok(D.moves(s, seat).some((m) => same(m, move)), `legal: ${JSON.stringify(move)} in ${s.phase}`);
        D.act(s, seat, move);
        check(s, deck);
      }
      finished(s);
      kinds.add(s.result.void ?? s.contract.kind);
    }
  }
  for (const k of ['normal', 'wedding', 'solo']) assert.ok(kinds.has(k), `bots played a ${k}`);
});

test('random play (announcements anyone may make, at any time) never breaks a rule or a view', () => {
  for (const rules of RULESETS) {
    for (let seed = 1; seed <= 40; seed++) {
      const randomInt = seeded(seed * 13 + 5);
      const s = D.deal({ dealer: seed % 4, rules, randomInt });
      const deck = makeDeck(rules.nines === false ? 'doko40' : 'doko', 2);
      for (let n = 0; s.phase !== 'done'; n++) {
        assert.ok(n < 600, 'the deal ends');
        // Anyone may announce, not only the seat in turn.
        const seat = s.phase === 'play' && randomInt(4) === 0 ? randomInt(4) : s.turn;
        const all = D.moves(s, seat);
        if (!all.length) continue;
        D.act(s, seat, seat === s.turn ? randomMove(s, seat, randomInt) : pick(all, randomInt));
        check(s, deck);
      }
      finished(s);
    }
  }
});

test('two bots against two random players come out well ahead over 400 deals', () => {
  let bots = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const randomInt = seeded(seed + 5000);
    const s = D.deal({ dealer: seed % 4, randomInt });
    while (s.phase !== 'done') {
      const seat = s.turn;
      D.act(s, seat, seat % 2 === 0 ? botMove(s, seat) : randomMove(s, seat, randomInt));
    }
    bots += s.result.points[0] + s.result.points[2];
  }
  assert.ok(bots > 200, `the bots made ${bots}`);
});
