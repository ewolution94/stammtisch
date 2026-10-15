// A Durak bot in three ranks (server/bots/rank.mjs). It looks only at its own hand and the table:
// what's gone off ("bito"), what lies on the table, the trump card under the stock, and what the
// last defender picked up (everyone saw it). The journeyman:
//   - leads its lowest plain card (a pair of the same rank first, to throw the second in), trumps last;
//   - throws in cheap plain cards of the ranks on the table, never a trump or a high card while the
//     stock lasts; to a defender who's taking, only plain cards (never a trump to make it stronger);
//   - defends when it can beat every card on the table: the most hard-pressed attack first, each with
//     the cheapest card that beats it, plain before trump; when that would cost a high trump early,
//     or something can't be beaten, it takes;
//   - passes the attack on (transfer, a house rule) with a cheap card of its rank.
// The apprentice doesn't weigh: now and then it leads, throws in or beats with a dearer card than it
// needed (the same job done). The master tries every move it may make in many deals of the cards it
// can't see, each played to the end of the deal with the journeyman's rules for everyone.

import { makeDeck, parseCard } from '../core/cards.mjs';
import { act, attackCards, beatOptions, beats, moves, transferCards } from '../games/durak.mjs';
import { dealOut, search, seeded, shuffle, trials, without } from './rank.mjs';

/** @typedef {import('../games/durak.mjs').State} State */
/** @typedef {import('./rank.mjs').Style} Style */

const ORDER = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const rank = (id) => ORDER.indexOf(parseCard(id).r);
const DECK = makeDeck('durak');

/**
 * The bot's move for `seat` (whose turn it is).
 * @param {State} s  @param {number} seat  @param {Style} [style]
 */
export function botMove(s, seat, { level = 'journeyman' } = {}) {
  if (level === 'master') return masterMove(s, seat);
  const move = ruleMove(s, seat);
  return level === 'apprentice' ? slip(s, seat, move) : move;
}

/** The rules' move. */
function ruleMove(s, seat) {
  const trump = s.trump;
  const isTrump = (id) => parseCard(id).s === trump;
  /** What a card is worth keeping: trumps far above plain cards. */
  const cost = (id) => rank(id) + (isTrump(id) ? 20 : 0);
  const cheapest = (cards) => [...cards].sort((a, b) => cost(a) - cost(b))[0];
  const hand = s.hands[seat];
  const late = s.stock.length === 0;

  if (seat === s.defender) {
    const transfer = transferCards(s, seat).filter((id) => !isTrump(id) || late);
    if (transfer.length) return { type: 'transfer', card: cheapest(transfer) };
    const options = beatOptions(s, seat);
    if (!options.length) return { type: 'take' };
    // Every open card must be beaten: plan it, the attack with the fewest answers first, each with
    // its cheapest card still free. One that can't be met: take.
    const plan = [];
    const used = [];
    for (const o of [...options].sort((a, b) => a.cards.length - b.cards.length || a.at - b.at)) {
      const free = without(o.cards, used);
      if (!free.length) return { type: 'take' };
      const card = cheapest(free);
      used.push(card);
      plan.push({ at: o.at, card });
    }
    // A high trump spent early on a low plain card isn't worth it: take instead (while more than a
    // couple of cards are on the table, taking costs too much).
    const dear = plan.some((p) => !late && isTrump(p.card) && rank(p.card) >= 6 && !isTrump(s.table[p.at].attack));
    if (dear && s.table.length <= 2) return { type: 'take' };
    return { type: 'beat', card: plan[0].card, at: plan[0].at };
  }

  const legal = moves(s, seat);
  const throwable = attackCards(s, seat);
  if (!s.table.length) {
    // Lead: a plain card that has a twin (to throw the second in), else the lowest plain card.
    const plain = hand.filter((id) => !isTrump(id));
    const pool = plain.length ? plain : hand;
    const twin = pool.filter((id) => pool.some((o) => o !== id && parseCard(o).r === parseCard(id).r));
    return { type: 'attack', card: cheapest(twin.length ? twin : pool) };
  }
  // Throw in: cheap plain cards (high ones and trumps only once the stock is gone); to a defender
  // who's taking, any plain card it'll have to pick up, but never a trump.
  const ok = throwable.filter((id) => (s.taking ? !isTrump(id) : late || (!isTrump(id) && rank(id) <= 5)));
  if (ok.length && legal.some((m) => m.type === 'attack')) return { type: 'attack', card: cheapest(ok) };
  if (legal.some((m) => m.type === 'pass')) return { type: 'pass' };
  // Nothing sensible and no pass offered (the attack still needs a lead): the cheapest legal card.
  return legal[0] ?? { type: 'pass' };
}

/**
 * An apprentice's slip, every other move: a card dearer than the rules' that does the same job: a
 * higher lead or throw-in of another rank, a higher card on the same attack. Never a take or a pass
 * turned into anything else.
 */
function slip(s, seat, move) {
  if (move.type !== 'attack' && move.type !== 'beat') return move;
  const r = seeded(`slip|${key(s, seat)}`);
  if (r() >= 0.5) return move;
  const isTrump = (id) => parseCard(id).s === s.trump;
  const card = /** @type {string} */ (move.card);
  /** @type {string[]} */
  let like;
  if (move.type === 'beat') {
    const attack = s.table[/** @type {number} */ (move.at)].attack;
    // Another card that beats the same attack: a plain one stays plain, a trump stays a trump.
    like = s.hands[seat].filter((id) => id !== card && beats(id, attack, s.trump) && isTrump(id) === isTrump(card));
  } else {
    const throwable = s.table.length ? attackCards(s, seat) : s.hands[seat];
    like = throwable.filter((id) => id !== card && isTrump(id) === isTrump(card) && rank(id) > rank(card));
  }
  return like.length ? { ...move, card: like[Math.floor(r() * like.length)] } : move;
}

// ---- the master: many deals, played to the end -------------------------------------------------

/** A deal played out can't run forever, whatever the rules' bots do. */
const STEPS = 600;

/** What `seat` sees, as a key for its random draws: its hand, the table, the stock's size, the bout. */
function key(s, seat) {
  const table = s.table.map((p) => `${p.by}${p.attack}${p.defense ?? ''}`).join('.');
  return `${s.dealer}|${seat}|${s.bout}|${s.hands[seat].join(',')}|${table}|${s.stock.length}|${s.discard.length}|${s.taking}|${s.hands.map((h) => h.length).join(',')}`;
}

function masterMove(s, seat) {
  const choices = moves(s, seat);
  if (choices.length === 1) return choices[0];
  const left = s.hands.reduce((n, h) => n + h.length, 0) + s.stock.length;
  const prefer = ruleMove(s, seat);
  const same = (a, b) => a.type === b.type && a.card === b.card && a.at === b.at;
  return search({
    choices,
    prefer,
    same,
    deals: trials(choices.length * Math.max(12, left), 120),
    r: seeded(`move|${key(s, seat)}`),
    imagine: (r) => imagine(s, seat, r),
    trial: (w, move) => {
      const t = structuredClone(w);
      act(t, seat, move);
      for (let k = 0; k < STEPS && t.phase === 'play'; k++) act(t, t.turn, ruleMove(t, t.turn));
      // Not the Durak: 0; the Durak: −1. Fewer cards left in hand break a tie.
      return t.phase === 'done' ? t.result.points[seat] : -0.5 - t.hands[seat].length / 100;
    },
  });
}

/**
 * One way the deal could stand, as `seat` sees it: the cards it hasn't seen dealt to the others (as
 * many as each holds; what the last defender picked up is in its hand, unless played since) and the
 * stock (the turned trump at its bottom). Nothing else is taken from the real deal.
 * @param {State} s  @param {number} seat  @param {() => number} r
 */
export function imagine(s, seat, r) {
  const onTable = s.table.flatMap((p) => [p.attack, p.defense].filter(Boolean));
  // The turned trump lies under the stock until the last card is drawn.
  const under = s.stock.length ? [s.trumpCard] : [];
  const unseen = without(DECK, [...s.hands[seat], ...s.discard, ...onTable, ...under]);
  const others = [...Array(s.players).keys()].filter((p) => p !== seat && !s.out.includes(p));
  /** @type {Map<number, string[]>} */
  const must = new Map();
  const last = s.lastBout;
  if (last?.took && last.defender !== seat && others.includes(last.defender)) {
    const picked = last.pairs.flatMap((p) => [p.attack, p.defense].filter(Boolean));
    must.set(last.defender, picked.filter((id) => unseen.includes(id)));
  }
  const need = new Map(others.map((p) => [p, s.hands[p].length]));
  const { hands, rest } = dealOut(unseen, need, () => true, r, must);
  const w = structuredClone(s);
  for (const [p, h] of hands) w.hands[p] = h;
  w.stock = s.stock.length ? [...shuffle(rest, r), s.trumpCard].slice(-s.stock.length) : [];
  return w;
}

export { moves };
