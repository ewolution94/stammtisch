// Simulated games for Mau-Mau: whole deals by bots and random players, and the bots against random play.
// Not in CI (the user, 2026-10-20: "rely on simpler (unit) tests there"); run them with `npm run test:sim`.
// Whole deals of Mau-Mau, played by the bots (and by random legal play), every house rule on and off,
// with the invariants checked after every move: no card lost or made, every move the bot picks is
// legal, no view shows a card it shouldn't, every deal ends.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDeck } from '../server/core/cards.mjs';
import * as M from '../server/games/maumau.mjs';
import { botMove } from '../server/bots/maumau.mjs';
import { cardsIn, pick, sameCards, seeded } from './helpers.mjs';

const RULESETS = [
  {},
  { sevenStack: false },
  { seven: false, eight: false, jack: false },
  { jackOnJack: true, ace: true, nine: true },
  { mau: false, scoring: 'points', hand: 7 },
  { ace: true, nine: true, sevenStack: false, hand: 3 },
];

/** Plays one deal to its end; `chooser(state, seat)` picks each move. Returns the finished state. */
function playOut(state, chooser, randomInt, check = () => {}) {
  const deck = makeDeck('skat', M.decksFor(state.players));
  for (let n = 0; n < 5000; n++) {
    if (state.phase === 'done') return state;
    const seat = state.turn;
    const move = chooser(state, seat);
    M.act(state, seat, move, { randomInt });
    assert.ok(sameCards([...state.hands.flat(), ...state.stock, ...state.pile], deck), 'cards conserved');
    check(state);
  }
  assert.fail('the deal never ended');
}

const legal = (state, seat, move) => {
  const { mau, ...plain } = move;
  return M.moves(state, seat).some((m) => JSON.stringify(m) === JSON.stringify(plain));
};

test('bots play every deal to its end with legal moves, under every house rule, 2 to 6 players', () => {
  let deals = 0;
  for (const rules of RULESETS) {
    for (let players = 2; players <= 6; players++) {
      for (let seed = 1; seed <= 12; seed++) {
        const randomInt = seeded(seed * 100 + players);
        const state = M.deal({ players, dealer: seed % players, rules, randomInt });
        const done = playOut(state, (s, seat) => {
          const move = botMove(s, seat);
          assert.ok(legal(s, seat, move), `legal: ${JSON.stringify(move)}`);
          return move;
        }, randomInt);
        assert.equal(done.phase, 'done');
        assert.ok(done.winner !== null);
        deals += 1;
      }
    }
  }
  assert.equal(deals, RULESETS.length * 5 * 12);
});

test('bots never forget "Mau!"', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const randomInt = seeded(seed);
    const state = M.deal({ players: 3, dealer: 0, randomInt });
    let forgot = 0;
    for (let n = 0; n < 5000 && state.phase === 'play'; n++) {
      const events = M.act(state, state.turn, botMove(state, state.turn), { randomInt });
      forgot += events.filter((e) => e.type === 'forgot').length;
    }
    assert.equal(forgot, 0);
  }
});

test('no view shows a card from another hand or the stock, at any point of random play', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const randomInt = seeded(seed);
    const players = 2 + (seed % 4);
    const state = M.deal({ players, dealer: 0, rules: RULESETS[seed % RULESETS.length], randomInt });
    playOut(state, (s, seat) => withMau(s, seat, randomMove(s, seat, randomInt)), randomInt, (s) => {
      if (s.phase === 'done') return;
      for (let seat = 0; seat < players; seat++) {
        // What the seat may see: its own hand and the pile's visible top (its playable cards and
        // a drawn card repeat ones from its hand).
        const allowed = new Set([...s.hands[seat], ...s.pile.slice(-4)]);
        for (const id of cardsIn(M.view(s, seat))) assert.ok(allowed.has(id), `seat ${seat} sees ${id}`);
      }
    });
  }
});

test('the bots beat random play: over 300 two-player deals they win clearly more than half', () => {
  let bot = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const randomInt = seeded(seed);
    const botSeat = seed % 2;
    const state = M.deal({ players: 2, dealer: seed % 2, randomInt });
    playOut(state, (s, seat) => (seat === botSeat ? botMove(s, seat) : withMau(s, seat, randomMove(s, seat, randomInt))), randomInt);
    if (state.winner === botSeat) bot += 1;
  }
  assert.ok(bot > 300 * 0.55, `the bot won ${bot} of 300`);
});

/**
 * Random play, but a card whenever one fits: drawing with a card to play, over and over, can keep a
 * deal going for ever, and no one plays like that.
 */
function randomMove(s, seat, randomInt) {
  const all = M.moves(s, seat);
  const plays = all.filter((m) => m.type === 'play');
  return pick(plays.length ? plays : all, randomInt);
}

/**
 * Random play that at least says "Mau!": without it every player down to one card draws again, and a
 * deal of random players never ends; and the comparison with the bot is about the cards.
 */
const withMau = (s, seat, move) => (move.type === 'play' && s.hands[seat].length === 2 ? { ...move, mau: true } : move);
