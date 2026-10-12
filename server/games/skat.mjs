// Skat as a pure state machine (see server/core/cards.mjs for what "pure" means here), to the
// Internationale Skatordnung (ISkO; the notes are in the README). One deal: three players, 32 cards,
// ten each and two in the Skat. Seats: 0 Vorhand (the dealer's left), 1 Mittelhand, 2 Hinterhand
// (the dealer, with three at the table; with four the dealer sits out, server/core/match.mjs).
//
// A deal's phases: bid (Mittelhand says to Vorhand, Hinterhand to whoever is left; nobody bids:
// Vorhand may play at 18) → skat (the declarer takes it or plays Hand) → discard (two back) → declare
// (the game, and with Hand: Schneider, Schwarz, Ouvert announced) → play (ten tricks, Vorhand leads)
// → done. Everyone passes: dealt again, or Ramsch (a house rule).
//
// Moves (plain JSON):
//   { type: 'bid', value }  say a value (the one bidding), or Vorhand's 18 when nobody bid
//   { type: 'hold' }        "ja": the one listening holds the value said
//   { type: 'pass' }
//   { type: 'take' } / { type: 'hand' }      the declarer: pick up the Skat, or play Hand
//   { type: 'discard', cards }                two cards back into the Skat
//   { type: 'declare', game, schneider?, schwarz?, ouvert? }   game: d h s c grand null
//   { type: 'kontra' } / { type: 're' }       house rule: a defender doubles, the declarer redoubles
//   { type: 'play', card }

import { RuleError, dealPackets, isCard, makeDeck, nextSeat, parseCard, shuffled, sortBy, sumAugen, takeCard } from '../core/cards.mjs';
import { legalFollow, trickWinner } from '../core/tricks.mjs';

/** @typedef {import('../core/tricks.mjs').Ranking} Ranking */

export const id = 'skat';
export const PLAYERS = Object.freeze({ min: 3, max: 3 });
/** Three play; with four the dealer sits out. */
export const TABLE = Object.freeze({ min: 3, max: 4 });

/**
 * The house rules and their defaults (the ISkO's where it has one).
 * ramsch: everyone passed: play Ramsch instead of dealing again · kontra: Kontra and Re · bock: Bock
 * rounds (the match keeps count) · scoring: 'plain' (the game value; a lost game twice, minus) or
 * 'list' (the ISkO's list: +50 a won game, −50 a lost one, the defenders 40 each at three, 30 at four).
 */
export const RULES = Object.freeze({ ramsch: false, kontra: false, bock: false, scoring: 'plain' });
export const SCORINGS = Object.freeze(['plain', 'list']);

/** @param {Record<string, unknown>} [input] */
export function cleanRules(input = {}) {
  const out = { ...RULES };
  for (const k of ['ramsch', 'kontra', 'bock']) {
    if (input[k] === undefined) continue;
    if (typeof input[k] !== 'boolean') throw new RuleError('rules');
    out[k] = input[k];
  }
  if (input.scoring !== undefined) {
    if (!SCORINGS.includes(/** @type {string} */ (input.scoring))) throw new RuleError('rules');
    out.scoring = /** @type {string} */ (input.scoring);
  }
  return Object.freeze(out);
}

// ---- games, values, bids --------------------------------------------------------------------------

export const GAMES = Object.freeze(['d', 'h', 's', 'c', 'grand', 'null']);
/** A suit game's and the Grand's base value. */
export const BASE = Object.freeze({ d: 9, h: 10, s: 11, c: 12, grand: 24 });
/** The Null games' fixed values. */
export const NULLS = Object.freeze({ plain: 23, hand: 35, ouvert: 46, ouvertHand: 59 });
export const nullValue = (hand, ouvert) => (ouvert ? (hand ? NULLS.ouvertHand : NULLS.ouvert) : hand ? NULLS.hand : NULLS.plain);

/** Every value a game can be worth, from 18: what may be bid. */
export const BIDS = Object.freeze(
  [
    ...new Set([
      ...Object.entries(BASE).flatMap(([g, base]) => {
        // At most: every trump a matador (11 in a suit game, the four Unter in a Grand), Spiel, and
        // the seven extras (Hand, Schneider and announced, Schwarz and announced, Ouvert).
        const top = (g === 'grand' ? 4 : 11) + 1 + 6;
        return Array.from({ length: top - 1 }, (_, i) => base * (i + 2));
      }),
      ...Object.values(NULLS),
    ]),
  ]
    .filter((v) => v >= 18)
    .sort((a, b) => a - b),
);

const JACKS = ['c-J', 's-J', 'h-J', 'd-J'];
const SUIT_ORDER = ['A', '10', 'K', 'Q', '9', '8', '7'];
const NULL_ORDER = ['A', 'K', 'Q', 'J', '10', '9', '8', '7'];

/**
 * The ranking of a game: a suit game's trumps are the four Unter (♣ ♠ ♥ ♦), then the suit's Ass,
 * Zehn, König, Ober, 9, 8, 7; the Grand's (and Ramsch's) only the Unter; Null has no trump and ranks
 * Ass, König, Ober, Unter, Zehn, 9, 8, 7. Plain suits rank Ass, Zehn, König, Ober, 9, 8, 7.
 * @param {string} game  @returns {Ranking}
 */
export function ranking(game) {
  if (game === 'null') {
    return { cls: (id) => parseCard(id).s, rank: (id) => 10 - NULL_ORDER.indexOf(parseCard(id).r) };
  }
  const suit = game in BASE && game !== 'grand' ? game : null;
  const isTrump = (id) => JACKS.includes(id) || (suit !== null && parseCard(id).s === suit);
  return {
    cls: (id) => (isTrump(id) ? 'trump' : parseCard(id).s),
    rank: (id) => {
      if (JACKS.includes(id)) return 100 - JACKS.indexOf(id);
      return 10 - SUIT_ORDER.indexOf(parseCard(id).r);
    },
  };
}

/** The trumps of a suit game or Grand from the top, the order matadors are counted in. */
export function trumpLine(game) {
  return game === 'grand' ? [...JACKS] : [...JACKS, ...SUIT_ORDER.map((r) => `${game}-${r}`)];
}

/**
 * Matadors ("Spitzen"): with the ♣ Unter, how many trumps from the top in a row the declarer holds
 * (hand and Skat together); without it, how many from the top in a row are missing.
 * @param {readonly string[]} cards  @param {string} game
 */
export function matadors(cards, game) {
  const line = trumpLine(game);
  const has = (id) => cards.includes(id);
  const mit = has(line[0]);
  let n = 0;
  while (n < line.length && has(line[n]) === mit) n += 1;
  return { mit, n };
}

// ---- the deal -----------------------------------------------------------------------------------

/**
 * @typedef {{ game: string, hand: boolean, schneider: boolean, schwarz: boolean, ouvert: boolean }} Contract
 * @typedef {{ lead: number, cards: { seat: number, card: string }[] }} Trick
 * @typedef {{
 *   game: 'skat', rules: typeof RULES, players: 3, dealer: number, hands: string[][], skat: string[],
 *   phase: 'bid' | 'skat' | 'discard' | 'declare' | 'play' | 'done', turn: number,
 *   bidding: { stage: 1 | 2 | 3, sayer: number, listener: number | null, awaiting: 'say' | 'answer', out: boolean[], said: { seat: number, value: number | null }[] },
 *   bid: number, declarer: number | null, took: boolean, put: string[], contract: Contract | null,
 *   doubled: 0 | 1 | 2, reOpen: boolean, played: boolean[],
 *   trick: Trick, tricks: (Trick & { winner: number, augen: number })[], result: any,
 * }} State
 */

/**
 * Deals a fresh deal. Tests pass `hands` (three of ten) and `skat` (two) instead of randomInt.
 * @param {{ dealer?: number, rules?: Record<string, unknown>, randomInt?: (n: number) => number, hands?: string[][], skat?: string[] }} o
 * @returns {State}
 */
export function deal({ dealer = 2, rules: raw, randomInt, hands: fixed, skat: fixedSkat }) {
  const rules = cleanRules(raw);
  if (!Number.isInteger(dealer) || dealer < 0 || dealer > 2) throw new RuleError('players');
  const vorhand = nextSeat(dealer, 3);
  /** @type {string[][]} */
  let hands;
  /** @type {string[]} */
  let skat;
  if (fixed) {
    const all = [...fixed.flat(), ...(fixedSkat ?? [])];
    if (fixed.length !== 3 || fixed.some((h) => h.length !== 10) || fixedSkat?.length !== 2) throw new RuleError('deal');
    if (!all.every(isCard) || new Set(all).size !== 32 || all.some((id) => !makeDeck('skat').includes(id))) throw new RuleError('card');
    hands = fixed.map((h) => [...h]);
    skat = [...fixedSkat];
  } else {
    if (typeof randomInt !== 'function') throw new TypeError('deal needs randomInt or hands');
    // Three each, two to the Skat, four each, three each (ISkO 2.2): the same as dealing the Skat last.
    const dealt = dealPackets(shuffled(makeDeck('skat'), randomInt), { players: 3, first: vorhand, packets: [3, 4, 3] });
    hands = dealt.hands;
    skat = dealt.rest;
  }
  const mittel = nextSeat(vorhand, 3);
  return {
    game: 'skat',
    rules,
    players: 3,
    dealer,
    hands,
    skat,
    phase: 'bid',
    turn: mittel,
    bidding: { stage: 1, sayer: mittel, listener: vorhand, awaiting: 'say', out: [false, false, false], said: [] },
    bid: 0,
    declarer: null,
    took: false,
    put: [],
    contract: null,
    doubled: 0,
    reOpen: false,
    played: [false, false, false],
    trick: { lead: vorhand, cards: [] },
    tricks: [],
    result: null,
  };
}

/** Vorhand, Mittelhand, Hinterhand of a deal. @param {State} s */
export const positions = (s) => [1, 2, 3].map((k) => nextSeat(s.dealer, 3, k));

// ---- moves -------------------------------------------------------------------------------------------

/**
 * Every legal move for `seat` now. Bidding lists every value it may say; a play phase lists its
 * legal cards (on its turn) and Kontra or Re (any time it may).
 * @param {State} s  @param {number} seat
 */
export function moves(s, seat) {
  /** @type {Record<string, unknown>[]} */
  const out = [];
  if (s.phase === 'bid' && seat === s.turn) {
    const b = s.bidding;
    // Vorhand alone (nobody bid) may only play at 18; the others may jump to any value.
    if (b.awaiting === 'say') for (const value of b.stage === 3 ? [18] : BIDS.filter((v) => v > s.bid)) out.push({ type: 'bid', value });
    else out.push({ type: 'hold' });
    out.push({ type: 'pass' });
  } else if (s.phase === 'skat' && seat === s.turn) {
    out.push({ type: 'take' }, { type: 'hand' });
  } else if (s.phase === 'discard' && seat === s.turn) {
    const h = [...s.hands[seat]].sort();
    for (let i = 0; i < h.length; i++) for (let j = i + 1; j < h.length; j++) out.push({ type: 'discard', cards: [h[i], h[j]] });
  } else if (s.phase === 'declare' && seat === s.turn) {
    for (const game of GAMES) for (const extra of announcements(s, game)) out.push({ type: 'declare', game, ...extra });
  } else if (s.phase === 'play') {
    if (seat === s.turn) for (const card of legalCards(s, seat)) out.push({ type: 'play', card });
    if (mayKontra(s, seat)) out.push({ type: 'kontra' });
    if (mayRe(s, seat)) out.push({ type: 're' });
  }
  return out;
}

/** The announcements a game may carry: with Hand, Schneider, Schwarz, Ouvert; Null Ouvert either way. */
function announcements(s, game) {
  const hand = !s.took;
  if (game === 'null') return [{ ouvert: false }, { ouvert: true }].map((o) => ({ schneider: false, schwarz: false, ...o }));
  const none = { schneider: false, schwarz: false, ouvert: false };
  if (!hand) return [none];
  return [none, { ...none, schneider: true }, { ...none, schneider: true, schwarz: true }, { schneider: true, schwarz: true, ouvert: true }];
}

/** The cards `seat` may play now; empty when it isn't its turn to play. */
export function legalCards(s, seat) {
  if (s.phase !== 'play' || seat !== s.turn) return [];
  return legalFollow(s.hands[seat], s.trick.cards, ranking(/** @type {Contract} */ (s.contract).game));
}

/**
 * Kontra (house rule; not in the ISkO): a defender, after the declaration and before playing a card,
 * once. It and Re double the score, never the value checked against the bid; the list's 50 and 40/30
 * stay as they are.
 */
export function mayKontra(s, seat) {
  return s.rules.kontra && s.phase === 'play' && s.contract?.game !== 'ramsch' && seat !== s.declarer && s.doubled === 0 && !s.played[seat];
}
/** Re (house rule): the declarer's answer to a Kontra, at once (before the next card). */
export function mayRe(s, seat) {
  return s.rules.kontra && s.phase === 'play' && seat === s.declarer && s.doubled === 1 && s.reOpen;
}

// ---- acting --------------------------------------------------------------------------------------------

/**
 * Makes a move. Changes `s` and returns what happened, for the table (public: a discard says only
 * that two cards went back).
 * @param {State} s  @param {number} seat  @param {Record<string, any>} move
 */
export function act(s, seat, move) {
  if (!move || typeof move !== 'object') throw new RuleError('move');
  if (!Number.isInteger(seat) || seat < 0 || seat > 2) throw new RuleError('turn');
  /** @type {Record<string, unknown>[]} */
  const events = [];
  const turnOnly = () => {
    if (seat !== s.turn) throw new RuleError('turn');
  };
  switch (move.type) {
    case 'bid':
    case 'hold':
    case 'pass':
      if (s.phase !== 'bid') throw new RuleError('phase');
      turnOnly();
      bidding(s, seat, move, events);
      break;
    case 'take':
    case 'hand':
      if (s.phase !== 'skat') throw new RuleError('phase');
      turnOnly();
      s.took = move.type === 'take';
      if (s.took) {
        s.hands[seat].push(...s.skat);
        s.skat = [];
        s.phase = 'discard';
      } else s.phase = 'declare';
      events.push({ type: move.type, seat });
      break;
    case 'discard': {
      if (s.phase !== 'discard') throw new RuleError('phase');
      turnOnly();
      const cards = move.cards;
      if (!Array.isArray(cards) || cards.length !== 2 || !cards.every(isCard)) throw new RuleError('cards');
      const left = [...s.hands[seat]];
      for (const id of cards) takeCard(left, id);
      s.hands[seat] = left;
      s.put = [...cards];
      s.phase = 'declare';
      events.push({ type: 'discard', seat });
      break;
    }
    case 'declare':
      if (s.phase !== 'declare') throw new RuleError('phase');
      turnOnly();
      declare(s, seat, move, events);
      break;
    case 'kontra':
      if (!mayKontra(s, seat)) throw new RuleError('kontra');
      s.doubled = 1;
      s.reOpen = true;
      events.push({ type: 'kontra', seat });
      break;
    case 're':
      if (!mayRe(s, seat)) throw new RuleError('re');
      s.doubled = 2;
      events.push({ type: 're', seat });
      break;
    case 'play':
      if (s.phase !== 'play') throw new RuleError('phase');
      turnOnly();
      playCard(s, seat, move.card, events);
      break;
    default:
      throw new RuleError('move');
  }
  return events;
}

function bidding(s, seat, move, events) {
  const b = s.bidding;
  if (move.type === 'bid') {
    if (b.awaiting !== 'say') throw new RuleError('answer');
    if (!BIDS.includes(move.value) || move.value <= s.bid || (b.stage === 3 && move.value !== 18)) throw new RuleError('bid');
    s.bid = move.value;
    b.said.push({ seat, value: move.value });
    events.push({ type: 'bid', seat, value: move.value });
    // Vorhand alone (nobody bid): saying a value means playing.
    if (b.stage === 3) return settle(s, seat, events);
    b.awaiting = 'answer';
    s.turn = /** @type {number} */ (b.listener);
    return;
  }
  if (move.type === 'hold') {
    if (b.awaiting !== 'answer') throw new RuleError('say');
    b.said.push({ seat, value: null });
    events.push({ type: 'hold', seat, value: s.bid });
    b.awaiting = 'say';
    s.turn = b.sayer;
    return;
  }
  // A pass: that seat is out; the other one in this pair goes on.
  b.out[seat] = true;
  events.push({ type: 'pass', seat });
  if (b.stage === 3) return settle(s, null, events);
  const winner = seat === b.sayer ? /** @type {number} */ (b.listener) : b.sayer;
  if (b.stage === 1) {
    const [, , hinter] = positions(s);
    b.stage = 2;
    b.sayer = hinter;
    b.listener = winner;
    b.awaiting = 'say';
    s.turn = hinter;
    return;
  }
  if (s.bid > 0) return settle(s, winner, events);
  // Nobody said a value: Vorhand may still play (at 18) or pass.
  b.stage = 3;
  b.sayer = winner;
  b.listener = null;
  b.awaiting = 'say';
  s.turn = winner;
}

/** The bidding is over: `seat` declares, or (null) everyone passed. */
function settle(s, seat, events) {
  if (seat === null) {
    if (s.rules.ramsch) {
      s.contract = { game: 'ramsch', hand: false, schneider: false, schwarz: false, ouvert: false };
      events.push({ type: 'ramsch' });
      return startPlay(s, events);
    }
    s.phase = 'done';
    s.result = { void: 'passed', redeal: true, points: [0, 0, 0] };
    events.push({ type: 'passed' });
    return;
  }
  s.declarer = seat;
  s.phase = 'skat';
  s.turn = seat;
  events.push({ type: 'declarer', seat, bid: s.bid });
}

function declare(s, seat, move, events) {
  const game = move.game;
  if (!GAMES.includes(game)) throw new RuleError('game');
  const ann = { schneider: move.schneider === true, schwarz: move.schwarz === true, ouvert: move.ouvert === true };
  const legal = announcements(s, game).some((a) => a.schneider === ann.schneider && a.schwarz === ann.schwarz && a.ouvert === ann.ouvert);
  if (!legal) throw new RuleError('announce');
  s.contract = { game, hand: !s.took, ...ann };
  events.push({ type: 'declare', seat, ...s.contract });
  // A Null worth less than the bid can't be won: lost at once (ISkO 3.6.2).
  if (game === 'null' && nullValue(s.contract.hand, ann.ouvert) < s.bid) {
    s.phase = 'done';
    s.result = scoreOverbidNull(s);
    events.push({ type: 'overbid', seat });
    return;
  }
  startPlay(s, events);
}

/**
 * The cheapest suit or Grand game the declarer could have reached the bid with (its matadors, the
 * Skat included, then levels added until it gets there): what an overbid game is lost with.
 */
export function cheapestReaching(cards, bid) {
  return Math.min(...Object.entries(BASE).map(([g, base]) => base * Math.max(matadors(cards, g).n + 1, Math.ceil(bid / base))));
}

function scoreOverbidNull(s) {
  const d = /** @type {number} */ (s.declarer);
  const cards = [...s.hands[d], ...(s.took ? s.put : s.skat)];
  const value = cheapestReaching(cards, s.bid);
  const points = [0, 0, 0];
  points[d] = s.rules.scoring === 'list' ? -2 * value - 50 : -2 * value;
  if (s.rules.scoring === 'list') for (const seat of [0, 1, 2]) if (seat !== d) points[seat] = 40;
  return { won: false, value, overbid: true, factor: 1, declarer: d, bid: s.bid, contract: { ...s.contract }, points };
}

function startPlay(s, events) {
  const [vorhand] = positions(s);
  s.phase = 'play';
  s.turn = vorhand;
  s.trick = { lead: vorhand, cards: [] };
  events.push({ type: 'lead', seat: vorhand });
}

function playCard(s, seat, card, events) {
  const hand = s.hands[seat];
  if (!isCard(card) || !hand.includes(card)) throw new RuleError('card');
  if (!legalCards(s, seat).includes(card)) throw new RuleError('follow');
  takeCard(hand, card);
  // Re answers the Kontra at once: the next card closes it.
  s.reOpen = false;
  s.played[seat] = true;
  s.trick.cards.push({ seat, card });
  events.push({ type: 'play', seat, card });
  if (s.trick.cards.length < 3) {
    s.turn = nextSeat(seat, 3);
    return;
  }
  const c = /** @type {Contract} */ (s.contract);
  const winner = s.trick.cards[trickWinner(s.trick.cards, ranking(c.game))].seat;
  const done = { ...s.trick, winner, augen: sumAugen(s.trick.cards.map((p) => p.card)) };
  s.tricks.push(done);
  events.push({ type: 'trick', seat: winner, augen: done.augen });
  s.trick = { lead: winner, cards: [] };
  s.turn = winner;
  // Null is lost the moment the declarer takes a trick.
  const nullLost = c.game === 'null' && winner === s.declarer;
  if (nullLost || s.tricks.length === 10) {
    s.phase = 'done';
    s.result = score(s);
    events.push({ type: 'done' });
  }
}

// ---- scoring ------------------------------------------------------------------------------------------

/**
 * A finished deal's score.
 * @param {State} s
 */
export function score(s) {
  const c = /** @type {Contract} */ (s.contract);
  if (c.game === 'ramsch') return scoreRamsch(s);
  const d = /** @type {number} */ (s.declarer);
  const factor = s.doubled === 2 ? 4 : s.doubled === 1 ? 2 : 1;
  const declTricks = s.tricks.filter((t) => t.winner === d);
  let won;
  let value;
  /** @type {Record<string, unknown>} */
  const detail = {};
  if (c.game === 'null') {
    won = declTricks.length === 0;
    value = nullValue(c.hand, c.ouvert);
    detail.null = value;
  } else {
    const skatCards = s.took ? s.put : s.skat;
    const augen = sumAugen(declTricks.flatMap((t) => t.cards.map((p) => p.card))) + sumAugen(skatCards);
    // The declarer's twelve: what's left in hand, what they played, and the Skat (ISkO: it counts).
    const mine = [...s.hands[d], ...s.tricks.flatMap((t) => t.cards.filter((p) => p.seat === d).map((p) => p.card)), ...skatCards];
    const m = matadors(mine, c.game);
    // Schneider: a side with 30 or less (the declarer too, the Skat counted); Schwarz: a side with no
    // trick (the Skat is no trick). An announced level counts whether reached or not, and no level
    // counts twice (ISkO 2.5.5–2.5.7).
    const schneider = augen >= 90 || augen <= 30 || c.schneider;
    const schwarz = declTricks.length === 10 || declTricks.length === 0 || c.schwarz;
    won = augen >= 61 && (!c.schneider || augen >= 90) && (!c.schwarz || declTricks.length === 10);
    const mult = m.n + 1 + (c.hand ? 1 : 0) + (schneider ? 1 : 0) + (c.schneider ? 1 : 0) + (schwarz ? 1 : 0) + (c.schwarz ? 1 : 0) + (c.ouvert ? 1 : 0);
    value = BASE[/** @type {keyof typeof BASE} */ (c.game)] * mult;
    Object.assign(detail, { augen, matadors: m, schneider, schwarz, mult });
  }
  // Overbid: lost, and worth at least the bid, rounded up to the game's next multiple.
  const base = c.game === 'null' ? value : BASE[/** @type {keyof typeof BASE} */ (c.game)];
  const overbid = value < s.bid;
  if (overbid) {
    won = false;
    value = Math.ceil(s.bid / base) * base;
  }
  value *= factor;
  const points = [0, 0, 0];
  if (s.rules.scoring === 'list') {
    points[d] = won ? value + 50 : -2 * value - 50;
    if (!won) for (const seat of [0, 1, 2]) if (seat !== d) points[seat] = 40;
  } else points[d] = won ? value : -2 * value;
  return { won, value, overbid, factor, declarer: d, bid: s.bid, contract: { ...c }, ...detail, points };
}

/**
 * Ramsch (house rule; not in the ISkO): everyone for themselves, only the Unter trump. The most Augen
 * lose them (ties: each in full); a player without a trick (Jungfrau) doubles it; one player taking
 * every trick (Durchmarsch) wins 120.
 */
function scoreRamsch(s) {
  const augen = [0, 0, 0];
  const tricks = [0, 0, 0];
  for (const t of s.tricks) {
    augen[t.winner] += t.augen;
    tricks[t.winner] += 1;
  }
  // The Skat goes to whoever has the most (to each of them on a tie): the usual custom.
  const top = Math.max(...augen);
  augen.forEach((a, seat) => {
    if (a === top) augen[seat] += sumAugen(s.skat);
  });
  const points = [0, 0, 0];
  const through = tricks.findIndex((n) => n === 10);
  if (through >= 0) {
    points[through] = 120;
    return { ramsch: true, augen, tricks, durchmarsch: through, points };
  }
  const most = Math.max(...augen);
  const virgins = tricks.filter((n) => n === 0).length;
  const factor = 2 ** virgins;
  augen.forEach((a, seat) => {
    if (a === most) points[seat] = -a * factor;
  });
  return { ramsch: true, augen, tricks, jungfrau: virgins, points };
}

// ---- views ------------------------------------------------------------------------------------------------

/** A hand as it's held: Unter first, then the trump suit, then the rest; Null by its own order. */
export function sortHand(s, hand) {
  const game = s.contract?.game ?? 'grand';
  const r = ranking(game === 'ramsch' ? 'grand' : game);
  const SUITS = ['c', 's', 'h', 'd'];
  return sortBy(hand, (id) => (r.cls(id) === 'trump' ? 1000 - r.rank(id) : 2000 + SUITS.indexOf(parseCard(id).s) * 100 + (100 - r.rank(id))));
}

/**
 * What one seat sees: its own hand and nobody else's (an Ouvert declarer's lies open), the bidding,
 * the contract, the trick and the last one; the Skat only once the deal is over (the declarer sees
 * what it put back). `seat` null: a watcher.
 * @param {State} s  @param {number | null} seat
 */
export function view(s, seat) {
  const mine = seat !== null && seat >= 0 && seat < 3;
  const open = s.contract?.ouvert && s.phase === 'play' ? sortHand(s, s.hands[/** @type {number} */ (s.declarer)]) : null;
  return {
    game: 'skat',
    rules: s.rules,
    phase: s.phase,
    players: 3,
    dealer: s.dealer,
    positions: positions(s),
    turn: s.turn,
    bidding: { ...s.bidding, out: [...s.bidding.out], said: s.bidding.said.map((x) => ({ ...x })) },
    bid: s.bid,
    declarer: s.declarer,
    took: s.took,
    contract: s.contract ? { ...s.contract } : null,
    doubled: s.doubled,
    open,
    trick: { lead: s.trick.lead, cards: s.trick.cards.map((x) => ({ ...x })) },
    last: s.tricks.length ? { ...s.tricks[s.tricks.length - 1] } : null,
    won: [0, 1, 2].map((p) => s.tricks.filter((t) => t.winner === p).length),
    counts: s.hands.map((h) => h.length),
    hand: mine ? sortHand(s, s.hands[seat]) : null,
    put: mine && seat === s.declarer ? [...s.put] : null,
    moves: mine ? moves(s, seat).filter((m) => m.type !== 'discard') : [],
    legal: mine ? legalCards(s, seat) : [],
    skat: s.phase === 'done' ? [...s.skat, ...s.put] : null,
    result: s.result,
  };
}

// ---- the match (server/core/match.mjs) ------------------------------------------------------------------

/**
 * Skat's match rules: a game everyone passed counts as a game in the list and the next player deals
 * (ISkO 3.3.7). The list at a four-table: the declarer's lost game gives each other player, the dealer
 * too, 30 instead of 40. Bock rounds (house rule): after 60 : 60, or Kontra and Re both said, the next
 * round of deals counts double.
 */
export const match = {
  /** @param {import('../core/match.mjs').Match} m */
  start(m) {
    m.extra.bock = 0;
  },
  /** @param {import('../core/match.mjs').Match} m  @param {import('../core/match.mjs').DealRecord} record */
  after(m, record) {
    const r = record.result;
    if (r.void) return { counts: true, sameDealer: false };
    if (m.rules.scoring === 'list' && m.table === 4 && !r.won && !r.ramsch) {
      const declarer = record.seats[r.declarer];
      for (let seat = 0; seat < m.table; seat++) if (seat !== declarer) record.points[seat] = 30;
    }
    if (m.rules.bock) {
      if (m.extra.bock > 0) m.extra.bock -= 1;
      const tie = r.augen === 60;
      const both = m.current?.doubled === 2;
      m.extra.bock += ((tie ? 1 : 0) + (both ? 1 : 0)) * m.table;
    }
    return {};
  },
  /** @param {import('../core/match.mjs').Match} m */
  multiplier(m) {
    return m.rules.bock && m.extra.bock > 0 ? 2 : 1;
  },
};
