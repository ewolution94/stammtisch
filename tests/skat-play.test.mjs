// Whole deals of Skat, played by the bots and by random legal play, under every house rule, with the
// invariants checked after every move: no card lost or made, every bot move legal, the Augen add up
// to 120 with the Skat, no view shows a card it shouldn't.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDeck, sumAugen } from '../server/core/cards.mjs';
import * as S from '../server/games/skat.mjs';
import { botMove } from '../server/bots/skat.mjs';
import { cardsIn, pick, sameCards, seeded } from './helpers.mjs';

const RULESETS = [{}, { ramsch: true }, { kontra: true, scoring: 'list' }, { ramsch: true, kontra: true }];

const everywhere = (s) => [...s.hands.flat(), ...s.skat, ...s.put, ...s.tricks.flatMap((t) => t.cards.map((p) => p.card)), ...s.trick.cards.map((p) => p.card)];
const same = (a, b) => JSON.stringify(a.cards ? { ...a, cards: [...a.cards].sort() } : a) === JSON.stringify(b.cards ? { ...b, cards: [...b.cards].sort() } : b);

function check(s) {
  assert.ok(sameCards(everywhere(s), makeDeck('skat')), 'cards conserved');
  if (s.phase === 'done') return;
  for (let seat = 0; seat < 3; seat++) {
    const v = S.view(s, seat);
    const allowed = new Set([...s.hands[seat], ...s.trick.cards.map((p) => p.card), ...(s.tricks.at(-1)?.cards.map((p) => p.card) ?? []), ...(seat === s.declarer ? s.put : []), ...(v.open ?? [])]);
    for (const id of cardsIn(v)) assert.ok(allowed.has(id), `seat ${seat} sees ${id} in ${s.phase}`);
  }
}

function finished(s) {
  assert.equal(s.phase, 'done');
  if (s.result.void) return;
  if (s.contract.game !== 'null' && s.tricks.length === 10) {
    assert.equal(s.tricks.reduce((n, t) => n + t.augen, 0) + sumAugen([...s.skat, ...s.put]), 120);
  }
}

test('bots play every deal to its end, legally, under every house rule', () => {
  const games = new Set();
  for (const rules of RULESETS) {
    for (let seed = 1; seed <= 80; seed++) {
      const s = S.deal({ rules, randomInt: seeded(seed * 3 + 1) });
      for (let n = 0; s.phase !== 'done'; n++) {
        assert.ok(n < 300, 'the deal ends');
        const seat = s.turn;
        const move = botMove(s, seat);
        assert.ok(S.moves(s, seat).some((m) => same(m, move)), `legal: ${JSON.stringify(move)} in ${s.phase}`);
        S.act(s, seat, move);
        check(s);
      }
      finished(s);
      games.add(s.result.void ?? s.contract.game);
    }
  }
  for (const g of ['c', 's', 'h', 'd', 'grand', 'ramsch']) assert.ok(games.has(g), `bots played ${g}`);
});

test('random play (any legal move, Kontra and Re included) never breaks a rule or a view', () => {
  for (const rules of RULESETS) {
    for (let seed = 1; seed <= 60; seed++) {
      const randomInt = seeded(seed * 11 + 7);
      const s = S.deal({ rules, randomInt });
      for (let n = 0; s.phase !== 'done'; n++) {
        assert.ok(n < 400, 'the deal ends');
        // Anyone may say Kontra or Re in play, not only the seat in turn.
        const seat = s.phase === 'play' && randomInt(5) === 0 ? randomInt(3) : s.turn;
        const all = S.moves(s, seat);
        if (!all.length) continue;
        // Bidding at random goes high fast: mostly the next value, or a pass.
        const move = s.phase === 'bid' && all[0].type === 'bid' ? (randomInt(3) ? all[0] : all.at(-1)) : pick(all, randomInt);
        S.act(s, seat, move);
        check(s);
      }
      finished(s);
    }
  }
});
