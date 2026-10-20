// Simulated games for Durak: whole deals by bots and random players, and the bot against random play.
// Not in CI (the user, 2026-10-20: "rely on simpler (unit) tests there"); run them with `npm run test:sim`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDeck } from '../server/core/cards.mjs';
import * as D from '../server/games/durak.mjs';
import { botMove } from '../server/bots/durak.mjs';
import { cardsIn, pick, sameCards, seeded, throws } from './helpers.mjs';

const { act, beats, deal, moves, view } = D;

/** A fixed deal: hands and the stock (its last card the turned trump). Dealer: the last seat. */
const table = (hands, stock, rules = {}) => deal({ players: hands.length, dealer: hands.length - 1, hands, stock, rules });
const everything = (s) => [...s.hands.flat(), ...s.stock, ...s.discard, ...s.table.flatMap((p) => [p.attack, p.defense].filter(Boolean))];

test('bots and random players play every deal to its end, legally, cards conserved, 2 to 6 players', () => {
  for (const rules of [{}, { transfer: true }, { throwIn: 'neighbours', firstFive: false }]) {
    for (let seed = 1; seed <= 40; seed++) {
      const randomInt = seeded(seed * 5 + 3);
      const players = 2 + (seed % 5);
      const s = deal({ players, dealer: seed % players, rules, randomInt });
      for (let n = 0; s.phase !== 'done'; n++) {
        assert.ok(n < 2000, 'the deal ends');
        const seat = s.turn;
        const bot = seed % 2 === 0;
        const move = bot ? botMove(s, seat) : pick(moves(s, seat), randomInt);
        if (bot) assert.ok(moves(s, seat).some((m) => JSON.stringify(m) === JSON.stringify(move)), `legal: ${JSON.stringify(move)}`);
        act(s, seat, move);
        assert.ok(sameCards(everything(s), makeDeck('durak')), 'cards conserved');
      }
      assert.ok(s.result.points.reduce((a, b) => a + b, 0) >= -1);
    }
  }
});

test('a bot loses less often than a random player in a two-player game', () => {
  let botFools = 0;
  let randomFools = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const randomInt = seeded(seed + 900);
    const s = deal({ players: 2, dealer: seed % 2, randomInt });
    const botSeat = seed % 2;
    while (s.phase !== 'done') {
      const seat = s.turn;
      act(s, seat, seat === botSeat ? botMove(s, seat) : pick(moves(s, seat), randomInt));
    }
    if (s.loser === botSeat) botFools++;
    else if (s.loser !== null) randomFools++;
  }
  assert.ok(botFools < randomFools, `bot fools ${botFools}, random fools ${randomFools}`);
});
