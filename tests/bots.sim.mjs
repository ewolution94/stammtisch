// Simulated games for the bots: whole deals by every rank in every game, and the temperament over many hands.
// Not in CI (the user, 2026-10-20: "rely on simpler (unit) tests there"); run them with `npm run test:sim`.

// The bots' ranks (server/bots/rank.mjs) in every game: none reads a hand but its own, every rank
// plays whole deals by the rules, the same position always gives the same move, the apprentice's
// slips stay small, a temperament leans the way it says, and the four quirks Stichle's session found
// (2026-10-14) stay fixed.

import { test } from 'node:test';
import assert from 'node:assert/strict';

// The master's trial deals bound by count, not by the clock: repeatable, and quick.
process.env.STAMMTISCH_MASTER_MS = '100000';
process.env.STAMMTISCH_MASTER_PLAYS = '400';
const { GAMES } = await import('../server/games/index.mjs');
const { levelsFor, LEVELS } = await import('../server/bots/rank.mjs');
const { appraise } = await import('../server/bots/skat.mjs');
const { seeded } = await import('./helpers.mjs');

const PLAYERS = { doppelkopf: 4, skat: 3, durak: 3, maumau: 3 };
const RULES = {
  doppelkopf: [{}, { schweinchen: true, dulle: 'second' }, { nines: false }, { poverty: true, schweinchen: true }],
  skat: [{ kontra: true }, { ramsch: true }],
  durak: [{}, { transfer: true }],
  maumau: [{}],
};

/** A fresh deal of `game`. */
function dealOf(game, rules, dealer, randomInt) {
  const M = GAMES[game].module;
  return game === 'doppelkopf' || game === 'skat' ? M.deal({ dealer, rules, randomInt }) : M.deal({ players: PLAYERS[game], dealer, rules, randomInt });
}

/** Positions part-way through deals, each with the seat whose move it is (journeymen play up to it). */
function positions(game, count, seed) {
  const M = GAMES[game].module;
  const randomInt = seeded(seed);
  const out = [];
  for (let d = 0; out.length < count && d < count * 4; d++) {
    const rules = RULES[game][d % RULES[game].length];
    const s = dealOf(game, rules, d % PLAYERS[game], randomInt);
    const stop = randomInt(40);
    for (let k = 0; k < stop && s.phase !== 'done'; k++) M.act(s, s.turn, GAMES[game].bot(s, s.turn), { randomInt });
    if (s.phase !== 'done') out.push(s);
  }
  return out;
}

/**
 * The same position with everything this seat can't see shuffled: the others' cards among the
 * others, the Skat and what went back into it, the stock under its turned card, and Doppelkopf's
 * hidden truths (who's Re where the seat can't know it, an unshown Schweinchen, the others'
 * reservations). Null when the shuffle changed what the seat sees.
 */
function scramble(game, s, seat, randomInt) {
  const M = GAMES[game].module;
  const t = structuredClone(s);
  const shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  /** Hidden places, as [object, key, count]: their cards are pooled, shuffled and dealt back. */
  const places = [];
  const others = [...Array(t.hands.length).keys()].filter((p) => p !== seat);
  const open = game === 'skat' && t.contract?.ouvert && t.phase === 'play' ? t.declarer : null;
  for (const p of others) if (p !== open) places.push([t.hands, p]);
  if (game === 'skat') {
    if (t.skat.length) places.push([t, 'skat']);
    if (t.put.length && seat !== t.declarer) places.push([t, 'put']);
  }
  if (game === 'maumau') places.push([t, 'stock']);
  const pool = shuffle(places.flatMap(([o, k]) => o[k]));
  for (const [o, k] of places) o[k] = pool.splice(0, o[k].length);
  if (game === 'durak' && t.stock.length > 1) t.stock = [...shuffle(t.stock.slice(0, -1)), t.stock.at(-1)];
  if (game === 'doppelkopf') {
    const known = M.knownParties(s, seat);
    if (t.parties) t.parties = t.parties.map((x, i) => (known[i] === null && x !== null ? (randomInt(2) ? 're' : 'kontra') : x));
    const ownPigs = s.hands[seat].filter((id) => id === 'd-A').length === 2;
    if (s.rules.schweinchen && !t.pigsShown && !ownPigs) t.pigs = [null, ...others][randomInt(others.length + 1)];
    t.declared = t.declared.map((d, i) => (i === seat || d === null ? d : { kind: 'healthy' }));
  }
  return JSON.stringify(M.view(t, seat)) === JSON.stringify(M.view(s, seat)) ? t : null;
}

for (const game of Object.keys(GAMES)) {
  test(`${game}: every rank plays whole deals by the rules, and a position always gives the same move`, () => {
    const M = GAMES[game].module;
    const randomInt = seeded(3);
    const ranks = levelsFor(game);
    for (let d = 0; d < 6; d++) {
      const s = dealOf(game, RULES[game][d % RULES[game].length], d % PLAYERS[game], randomInt);
      for (let steps = 0; s.phase !== 'done'; steps++) {
        assert.ok(steps < 3000, 'the deal ends');
        const seat = s.turn;
        const level = ranks[(seat + d) % ranks.length];
        const move = GAMES[game].bot(s, seat, { level, temper: ['cautious', 'steady', 'bold'][seat % 3] });
        if (steps % 7 === 0) assert.deepEqual(GAMES[game].bot(s, seat, { level, temper: ['cautious', 'steady', 'bold'][seat % 3] }), move, 'repeatable');
        M.act(s, seat, move, { randomInt });
      }
    }
  });
}

test('a temperament leans the bid: a bold bot takes on what a cautious one passes', () => {
  const randomInt = seeded(21);
  const deck = ['c', 's', 'h', 'd'].flatMap((s) => ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'].map((r) => `${s}-${r}`));
  let bolder = 0;
  for (let k = 0; k < 400; k++) {
    const pool = [...deck];
    const hand = Array.from({ length: 10 }, () => pool.splice(randomInt(pool.length), 1)[0]);
    const ok = (lean) => appraise(hand, lean).filter((g) => g.ok).length;
    assert.ok(ok(1) >= ok(0) && ok(0) >= ok(-1), 'bold ≥ steady ≥ cautious');
    if (ok(1) > ok(-1)) bolder += 1;
  }
  assert.ok(bolder > 20, 'the lean shows');
});

for (const game of Object.keys(GAMES)) {
  test(`${game}: no rank reads a hand but its own (everything hidden shuffled, the same move)`, () => {
    const randomInt = seeded(7);
    let checked = 0;
    for (const s of positions(game, 24, 11)) {
      const seat = s.turn;
      for (const level of levelsFor(game)) {
        const before = GAMES[game].bot(s, seat, { level });
        for (let k = 0; k < 2; k++) {
          const t = scramble(game, s, seat, randomInt);
          if (!t) continue;
          assert.deepEqual(GAMES[game].bot(t, seat, { level }), before, `${level} at ${game}, ${s.phase}`);
          checked += 1;
        }
      }
    }
    assert.ok(checked >= 30, `only ${checked} positions checked`);
  });
}

test("an apprentice's slips stay small: at most every other card, the same job done, never a fox, a Dulle or a ♣Q", async () => {
  const { trickWinner } = await import('../server/core/tricks.mjs');
  const { rankingFor, rulesCard } = await import('../server/bots/doppelkopf.mjs');
  const M = GAMES.doppelkopf.module;
  let differ = 0, follows = 0;
  for (const s of positions('doppelkopf', 60, 5)) {
    if (s.phase !== 'play' || !s.trick.cards.length) continue;
    const seat = s.turn;
    const a = GAMES.doppelkopf.bot(s, seat, { level: 'apprentice' });
    if (a.type !== 'play') continue;
    // The apprentice's own rules (it doesn't count) gave this card; a slip departs from it.
    const own = rulesCard(s, seat, false);
    follows += 1;
    if (a.card === own) continue;
    differ += 1;
    const r = rankingFor(s, seat);
    const last = s.tricks.length + 1 === s.size;
    const wins = (card) => trickWinner([...s.trick.cards, { seat, card }], r, { last }) === s.trick.cards.length;
    assert.ok(M.legalCards(s, seat).includes(a.card));
    assert.equal(wins(a.card), wins(own), `${a.card} for ${own}: the same job`);
    assert.ok(!['d-A', 'h-10', 'c-Q'].includes(a.card), `slipped a ${a.card}`);
  }
  assert.ok(follows >= 15, `only ${follows} positions`);
  assert.ok(differ <= follows * 0.6, `${differ} of ${follows} differ`);
});
