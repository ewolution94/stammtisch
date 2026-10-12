// Doppelkopf as a pure state machine (see server/core/cards.mjs for what "pure" means here), to the
// DDV's tournament rules (Turnierspielregeln, as of 2026-02-21; the notes are in the README). One
// deal: four players, 48 cards (every card twice, 9 to Ass), 12 each.
//
// A deal's phases: reserve (in turn from the dealer's left, each says "gesund" or has a reservation:
// a wedding or a solo; the house rules add poverty and throwing in) → [poverty: give, offer, return]
// → play (twelve tricks; announcements any time, within their deadlines) → done (scored).
//
// The parties: whoever holds a ♣Q (an Eichel-Ober) is Re, the others Kontra; nobody knows who's with
// whom until a ♣Q is played or someone announces. A wedding (both ♣Q, announced) makes the first
// other player to take one of the first three tricks the partner; a solo is one against three; both
// ♣Q kept quiet ("gesund") is a silent wedding, scored as a solo.
//
// House rules (off by default, RULES below): without the nines (40 cards, 10 each); the second Dulle
// beats the first (always, or except in the last trick); Schweinchen (both ♦A in one hand rank above
// the Dullen); poverty (three trumps or fewer: give them to whoever takes them, who gives three back);
// throwing in (five nines or five kings: deal again). The compulsory solo and Bock rounds belong to
// the match: deal() takes who still owes a solo (owes) or must play one now (forced).
//
// Moves (plain JSON):
//   { type: 'reserve', kind: 'healthy' | 'wedding' | 'solo' | 'poverty' | 'throw', solo? }
//   { type: 'give', cards }      poverty: the three cards (all your trumps among them)
//   { type: 'take' } / { type: 'decline' }   poverty: take it or not
//   { type: 'return', cards }    poverty: three cards back
//   { type: 'announce', level }  0 Re/Kontra, 1 keine 90, 2 keine 60, 3 keine 30, 4 schwarz; any
//                                time in play, by anyone, within the deadline (lower levels implied)
//   { type: 'play', card }

import { RuleError, dealPackets, isCard, makeDeck, nextSeat, parseCard, shuffled, sortBy, sumAugen, takeCard } from '../core/cards.mjs';
import { legalFollow, trickWinner } from '../core/tricks.mjs';

/** @typedef {import('../core/tricks.mjs').Ranking} Ranking */
/** @typedef {'re' | 'kontra'} Party */

export const id = 'doppelkopf';
export const PLAYERS = Object.freeze({ min: 4, max: 4 });
/** Four play; from five the dealer sits out (and with six the seat before them too). */
export const TABLE = Object.freeze({ min: 4, max: 6 });

/**
 * The solos (DDV §2.3.3): Damen (Ober), Buben (Unter), the four suits (Karo is the normal game's
 * trumps), and the Fleischlose with no trump at all ('A', the Asse-Solo).
 */
export const SOLOS = Object.freeze(['Q', 'J', 'c', 's', 'h', 'd', 'A']);
export const DULLE = Object.freeze(['first', 'second', 'second-not-last']);

/**
 * The house rules and their defaults (the DDV's rules where they have one).
 * nines: play with the nines (48 cards) · dulle: which of two Dullen wins: 'first' (DDV), 'second', or
 * 'second-not-last' · schweinchen · poverty (Armut) · throw (Schmeißen) · duty (a compulsory solo per
 * player and round; the match keeps count) · bock (Bock rounds; the match keeps count).
 */
export const RULES = Object.freeze({
  nines: true,
  dulle: 'first',
  schweinchen: false,
  poverty: false,
  throw: false,
  duty: false,
  bock: false,
});

const FLAGS = ['nines', 'schweinchen', 'poverty', 'throw', 'duty', 'bock'];

/** @param {Record<string, unknown>} [input] */
export function cleanRules(input = {}) {
  const out = { ...RULES };
  for (const k of FLAGS) {
    if (input[k] === undefined) continue;
    if (typeof input[k] !== 'boolean') throw new RuleError('rules');
    out[k] = input[k];
  }
  if (input.dulle !== undefined) {
    if (!DULLE.includes(/** @type {string} */ (input.dulle))) throw new RuleError('rules');
    out.dulle = /** @type {string} */ (input.dulle);
  }
  return Object.freeze(out);
}

// ---- ranking ----------------------------------------------------------------------------------

const SUIT_RANK = { c: 3, s: 2, h: 1, d: 0 };
/** A plain suit's order: Ass, Zehn, König, Ober, Unter, Neun (each only where it isn't trump). */
const PLAIN = { A: 6, 10: 5, K: 4, Q: 3, J: 2, 9: 1 };

/**
 * Whether a card is trump: with a suit as trump (the normal game is Karo), the Dullen (♥10), every
 * Ober and Unter and the suit; in a Damen- or Bubensolo only the Ober or the Unter; with no trump
 * (the Fleischlose), none.
 * @param {string} id  @param {string | null} trump  'c' | 's' | 'h' | 'd' | 'Q' | 'J' | null
 */
export function isTrump(id, trump) {
  const { s, r } = parseCard(id);
  if (trump === null) return false;
  if (trump === 'Q' || trump === 'J') return r === trump;
  return id === 'h-10' || r === 'Q' || r === 'J' || s === trump;
}

/**
 * The ranking for a deal's trumps: Dullen, then the Ober (♣ ♠ ♥ ♦), the Unter (the same), then the
 * trump suit's Ass, Zehn, König, Neun; plain suits Ass, Zehn, König (Ober, Unter), Neun. `pigs`: the
 * two ♦A rank above everything (Schweinchen). `dulle`: which of two Dullen wins.
 * @param {string | null} trump  @param {{ pigs?: boolean, dulle?: string }} [o]  @returns {Ranking}
 */
export function ranking(trump, { pigs = false, dulle = 'first' } = {}) {
  const suitTrump = trump !== null && trump in SUIT_RANK;
  const rank = (id) => {
    const { s, r } = parseCard(id);
    if (!isTrump(id, trump)) return PLAIN[r];
    if (pigs && id === 'd-A') return 200;
    if (suitTrump && id === 'h-10') return 100;
    if (r === 'Q') return 90 + SUIT_RANK[s];
    if (r === 'J') return 80 + SUIT_RANK[s];
    return 70 + PLAIN[r];
  };
  /** @type {Ranking} */
  const out = { cls: (id) => (isTrump(id, trump) ? 'trump' : parseCard(id).s), rank };
  if (suitTrump && dulle === 'second') out.tie = (id) => id === 'h-10';
  if (suitTrump && dulle === 'second-not-last') out.tie = (id, ctx) => id === 'h-10' && !ctx.last;
  return out;
}

/** The trump a contract plays with: a solo's own, else Karo (the normal game). */
const SOLO_TRUMP = { Q: 'Q', J: 'J', c: 'c', s: 's', h: 'h', d: 'd', A: null };

// ---- state --------------------------------------------------------------------------------------

/**
 * @typedef {{ lead: number, cards: { seat: number, card: string }[] }} Trick
 * @typedef {Trick & { winner: number, augen: number }} DoneTrick
 * @typedef {{ kind: 'healthy' | 'wedding' | 'solo' | 'poverty' | 'throw', solo?: string }} Declaration
 * @typedef {{ kind: 'normal' | 'wedding' | 'silent' | 'solo' | 'poverty', trump: string | null,
 *   soloist: number | null, solo: string | null, duty: boolean, alone: boolean }} Contract
 * @typedef {{
 *   game: 'doppelkopf', rules: typeof RULES, players: 4, dealer: number, first: number, size: number,
 *   hands: string[][], phase: 'reserve' | 'poverty-give' | 'poverty-offer' | 'poverty-return' | 'play' | 'done',
 *   turn: number, owes: boolean[], forced: number | null,
 *   reserve: ('healthy' | 'reserved' | null)[], declared: (Declaration | null)[],
 *   contract: Contract | null, parties: (Party | null)[],
 *   wedding: { seat: number, partner: number | null, trick: number | null } | null,
 *   poverty: { seat: number, trumps: number, cards: string[], offered: number[], taker: number | null, back: number | null } | null,
 *   calls: Record<Party, number>, late: Record<Party, boolean>,
 *   announcements: { seat: number, party: Party, level: number }[],
 *   pigs: number | null, pigsShown: boolean,
 *   trick: Trick, tricks: DoneTrick[], result: any,
 * }} State
 */

/**
 * Deals a fresh deal. Tests pass `hands` (four, of 12 or 10 cards) instead of randomInt.
 * owes: who still owes a compulsory solo (the duty rule); forced: who must play it now (Vorführung:
 * no reservations asked, that seat names a solo).
 * @param {{ dealer: number, rules?: Record<string, unknown>, randomInt?: (n: number) => number,
 *   hands?: string[][], owes?: boolean[], forced?: number | null }} o
 * @returns {State}
 */
export function deal({ dealer, rules: raw, randomInt, hands: fixed, owes, forced = null }) {
  const rules = cleanRules(raw);
  if (!Number.isInteger(dealer) || dealer < 0 || dealer > 3) throw new RuleError('players');
  const deck = makeDeck(rules.nines ? 'doko' : 'doko40', 2);
  const size = deck.length / 4;
  const first = nextSeat(dealer, 4);
  /** @type {string[][]} */
  let hands;
  if (fixed) {
    if (!Array.isArray(fixed) || fixed.length !== 4 || fixed.some((h) => !Array.isArray(h) || h.length !== size)) {
      throw new RuleError('deal');
    }
    const all = fixed.flat();
    if (!all.every(isCard)) throw new RuleError('card');
    // Two of each card, no more: a fixed deal is still a real deck.
    const count = new Map();
    for (const id of all) count.set(id, (count.get(id) ?? 0) + 1);
    if (count.size !== deck.length / 2 || [...count.values()].some((n) => n !== 2) || all.some((id) => !deck.includes(id))) {
      throw new RuleError('card');
    }
    hands = fixed.map((h) => [...h]);
  } else {
    if (typeof randomInt !== 'function') throw new TypeError('deal needs randomInt or hands');
    // Three at a time, left of the dealer first (DDV §3.3.7); without the nines 3-4-3.
    hands = dealPackets(shuffled(deck, randomInt), { players: 4, first, packets: rules.nines ? [3, 3, 3, 3] : [3, 4, 3] }).hands;
  }
  if (forced !== null && (!Number.isInteger(forced) || forced < 0 || forced > 3)) throw new RuleError('players');
  return {
    game: 'doppelkopf',
    rules,
    players: 4,
    dealer,
    first,
    size,
    hands,
    phase: 'reserve',
    turn: forced ?? first,
    owes: owes ? owes.map(Boolean) : [false, false, false, false],
    forced,
    reserve: [null, null, null, null],
    declared: [null, null, null, null],
    contract: null,
    parties: [null, null, null, null],
    wedding: null,
    poverty: null,
    calls: { re: -1, kontra: -1 },
    late: { re: false, kontra: false },
    announcements: [],
    pigs: null,
    pigsShown: false,
    trick: { lead: first, cards: [] },
    tricks: [],
    result: null,
  };
}

/** The ranking of the deal being played (normal trumps until a solo is settled). @param {State} state */
export function rankingOf(state) {
  const trump = state.contract ? state.contract.trump : 'd';
  return ranking(trump, { pigs: state.pigs !== null, dulle: state.rules.dulle });
}

const trumpCount = (hand, trump = 'd') => hand.filter((id) => isTrump(id, trump)).length;
const both = (hand, id) => hand.filter((c) => c === id).length === 2;

/** Whether `seat` may declare poverty: three trumps or fewer (the house rule). */
export const poor = (state, seat) => state.rules.poverty && trumpCount(state.hands[seat]) <= 3;
/** Whether `seat` may throw in: five nines or five kings (the house rule). */
export function mayThrow(state, seat) {
  if (!state.rules.throw) return false;
  const hand = state.hands[seat];
  const n = (r) => hand.filter((id) => parseCard(id).r === r).length;
  return (state.rules.nines && n('9') >= 5) || n('K') >= 5;
}

// ---- moves ----------------------------------------------------------------------------------------

/**
 * Every legal move for `seat` now: its reservation in turn; poverty's steps; in play, its legal
 * cards on its turn and any announcement it may make at any time.
 * @param {State} state  @param {number} seat
 */
export function moves(state, seat) {
  /** @type {Record<string, unknown>[]} */
  const out = [];
  if (state.phase === 'reserve' && seat === state.turn) {
    if (state.forced === null) {
      out.push({ type: 'reserve', kind: 'healthy' });
      if (both(state.hands[seat], 'c-Q')) out.push({ type: 'reserve', kind: 'wedding' });
      if (poor(state, seat)) out.push({ type: 'reserve', kind: 'poverty' });
      if (mayThrow(state, seat)) out.push({ type: 'reserve', kind: 'throw' });
    }
    for (const solo of SOLOS) out.push({ type: 'reserve', kind: 'solo', solo });
  } else if (state.phase === 'poverty-give' && seat === state.turn) {
    const hand = state.hands[seat];
    const trumps = hand.filter((id) => isTrump(id, 'd'));
    const rest = hand.filter((id) => !isTrump(id, 'd'));
    for (const fill of choose(rest, 3 - trumps.length)) out.push({ type: 'give', cards: [...trumps, ...fill] });
  } else if (state.phase === 'poverty-offer' && seat === state.turn) {
    out.push({ type: 'take' }, { type: 'decline' });
  } else if (state.phase === 'poverty-return' && seat === state.turn) {
    for (const cards of choose(state.hands[seat], 3)) out.push({ type: 'return', cards });
  } else if (state.phase === 'play') {
    if (seat === state.turn) for (const card of new Set(legalCards(state, seat))) out.push({ type: 'play', card });
    for (const level of announceOptions(state, seat)) out.push({ type: 'announce', level });
  }
  return out;
}

/** Every way to pick k cards from a hand, each set of cards once (copies are the same card). */
function choose(cards, k) {
  const sorted = [...cards].sort();
  /** @type {string[][]} */
  const out = [];
  const seen = new Set();
  const walk = (from, picked) => {
    if (picked.length === k) {
      const key = picked.join();
      if (!seen.has(key)) {
        seen.add(key);
        out.push([...picked]);
      }
      return;
    }
    for (let i = from; i < sorted.length; i++) {
      if (i > from && sorted[i] === sorted[i - 1]) continue;
      walk(i + 1, [...picked, sorted[i]]);
    }
  };
  if (k >= 0 && k <= sorted.length) walk(0, []);
  return out;
}

/** The cards `seat` may play now (copies included); empty when it isn't its turn to play. */
export function legalCards(state, seat) {
  if (state.phase !== 'play' || seat !== state.turn) return [];
  return legalFollow(state.hands[seat], state.trick.cards, rankingOf(state));
}

/**
 * The announcement levels `seat` may make now (DDV §6): the first (Re or Kontra) while holding at
 * least size − 1 cards, keine 90/60/30/schwarz one card later each; in a wedding only once the partner
 * is found, every deadline a card earlier per trick it took. A party that hasn't announced may still
 * answer the other side's announcement with one card fewer than that one needed (but then makes no
 * further ones). Skipping levels is fine while the lowest skipped one is still on time.
 * @param {State} state  @param {number} seat
 */
export function announceOptions(state, seat) {
  if (state.phase !== 'play') return [];
  const party = state.parties[seat];
  if (!party) return [];
  const w = state.wedding;
  if (w && w.trick === null) return [];
  const shift = w ? /** @type {number} */ (w.trick) - 1 : 0;
  const need = (level) => state.size - 1 - shift - level;
  const held = state.hands[seat].length;
  const own = state.calls[party];
  const other = party === 're' ? 'kontra' : 're';
  if (own >= 4 || state.late[party]) return [];
  const all = (from) => [0, 1, 2, 3, 4].filter((k) => k >= from);
  if (held >= need(own + 1)) return all(own + 1);
  // A late answer to the other side: only Re or Kontra, and nothing after it.
  if (own < 0 && state.calls[other] >= 0 && held >= need(state.calls[other]) - 1) return [0];
  return [];
}

// ---- acting -----------------------------------------------------------------------------------------

/**
 * Makes a move. Changes `state` and returns what happened, for the table. Events are public: they
 * name a reservation's kind only once it's the one that plays.
 * @param {State} state  @param {number} seat  @param {Record<string, any>} move
 */
export function act(state, seat, move) {
  if (!move || typeof move !== 'object') throw new RuleError('move');
  if (!Number.isInteger(seat) || seat < 0 || seat > 3) throw new RuleError('turn');
  /** @type {Record<string, unknown>[]} */
  const events = [];
  switch (move.type) {
    case 'reserve': reserve(state, seat, move, events); break;
    case 'give': give(state, seat, move.cards, events); break;
    case 'take':
    case 'decline': offer(state, seat, move.type === 'take', events); break;
    case 'return': giveBack(state, seat, move.cards, events); break;
    case 'announce': announce(state, seat, move.level, events); break;
    case 'play': playCard(state, seat, move.card, events); break;
    default: throw new RuleError('move');
  }
  return events;
}

function reserve(state, seat, move, events) {
  if (state.phase !== 'reserve') throw new RuleError('phase');
  if (seat !== state.turn) throw new RuleError('turn');
  const hand = state.hands[seat];
  const kind = move.kind;
  /** @type {Declaration} */
  let d;
  if (kind === 'solo') {
    if (!SOLOS.includes(move.solo)) throw new RuleError('solo');
    d = { kind, solo: move.solo };
  } else if (state.forced !== null) {
    throw new RuleError('forced');
  } else if (kind === 'healthy') d = { kind };
  else if (kind === 'wedding') {
    if (!both(hand, 'c-Q')) throw new RuleError('wedding');
    d = { kind };
  } else if (kind === 'poverty') {
    if (!poor(state, seat)) throw new RuleError('poverty');
    d = { kind };
  } else if (kind === 'throw') {
    if (!mayThrow(state, seat)) throw new RuleError('throw');
    d = { kind };
  } else throw new RuleError('move');

  state.declared[seat] = d;
  state.reserve[seat] = d.kind === 'healthy' ? 'healthy' : 'reserved';
  events.push({ type: 'reserve', seat, reserved: d.kind !== 'healthy' });
  // A forced solo asks no one else; otherwise round the table once.
  const next = nextSeat(seat, 4);
  if (state.forced === null && next !== state.first) {
    state.turn = next;
    return;
  }
  settle(state, events);
}

/** Who plays what once every reservation is in (DDV §4.1.5: duty solo, solo, then wedding). */
function settle(state, events) {
  const order = [0, 1, 2, 3].map((k) => nextSeat(state.first, 4, k));
  const of = (kind) => order.filter((s) => state.declared[s]?.kind === kind);
  const solos = of('solo');
  const duty = solos.filter((s) => state.forced === s || (state.rules.duty && state.owes[s]));
  const soloist = duty[0] ?? solos[0];
  if (soloist !== undefined) {
    const solo = /** @type {string} */ (state.declared[soloist]?.solo);
    const isDuty = duty.includes(soloist);
    state.contract = { kind: 'solo', trump: SOLO_TRUMP[solo], soloist, solo, duty: isDuty, alone: false };
    state.parties = [0, 1, 2, 3].map((s) => (s === soloist ? 're' : 'kontra'));
    events.push({ type: 'contract', kind: 'solo', solo, seat: soloist, duty: isDuty });
    // A duty solo's soloist leads; any other game, whoever began the asking (DDV §4.2.2, §4.3.1).
    return startPlay(state, isDuty ? soloist : state.first, events);
  }
  const thrower = of('throw')[0];
  if (thrower !== undefined) {
    events.push({ type: 'contract', kind: 'throw', seat: thrower });
    return finishVoid(state, 'throw', thrower);
  }
  const pauper = of('poverty')[0];
  if (pauper !== undefined) {
    state.poverty = { seat: pauper, trumps: trumpCount(state.hands[pauper]), cards: [], offered: [], taker: null, back: null };
    state.phase = 'poverty-give';
    state.turn = pauper;
    events.push({ type: 'contract', kind: 'poverty', seat: pauper });
    return;
  }
  const bride = of('wedding')[0];
  if (bride !== undefined) {
    state.contract = { kind: 'wedding', trump: 'd', soloist: bride, solo: null, duty: false, alone: false };
    state.wedding = { seat: bride, partner: null, trick: null };
    state.parties = [0, 1, 2, 3].map((s) => (s === bride ? 're' : null));
    events.push({ type: 'contract', kind: 'wedding', seat: bride });
    return startPlay(state, state.first, events);
  }
  // Everyone healthy: a normal game, or a silent wedding if one hand holds both ♣Q.
  const silent = order.find((s) => both(state.hands[s], 'c-Q'));
  if (silent !== undefined) {
    state.contract = { kind: 'silent', trump: 'd', soloist: silent, solo: null, duty: false, alone: false };
    state.parties = [0, 1, 2, 3].map((s) => (s === silent ? 're' : 'kontra'));
  } else {
    state.contract = { kind: 'normal', trump: 'd', soloist: null, solo: null, duty: false, alone: false };
    state.parties = state.hands.map((h) => (h.includes('c-Q') ? 're' : 'kontra'));
  }
  // Everyone at the table hears only "a normal game".
  events.push({ type: 'contract', kind: 'normal' });
  startPlay(state, state.first, events);
}

function startPlay(state, lead, events) {
  state.phase = 'play';
  state.turn = lead;
  state.trick = { lead, cards: [] };
  const c = /** @type {Contract} */ (state.contract);
  // Schweinchen: both ♦A in one hand, in a game with the normal trumps.
  if (state.rules.schweinchen && c.trump === 'd') {
    const pig = [0, 1, 2, 3].find((s) => both(state.hands[s], 'd-A'));
    state.pigs = pig ?? null;
  }
  events.push({ type: 'lead', seat: lead });
}

// ---- poverty (house rule) -----------------------------------------------------------------------------

/** @param {unknown} cards  @param {string[]} hand */
function threeFrom(cards, hand) {
  if (!Array.isArray(cards) || cards.length !== 3 || !cards.every(isCard)) throw new RuleError('cards');
  const left = [...hand];
  for (const id of cards) takeCard(left, id);
  return left;
}

function give(state, seat, cards, events) {
  if (state.phase !== 'poverty-give') throw new RuleError('phase');
  if (seat !== state.turn) throw new RuleError('turn');
  const hand = state.hands[seat];
  const left = threeFrom(cards, hand);
  // Every trump goes across.
  if (left.some((id) => isTrump(id, 'd'))) throw new RuleError('trumps');
  const p = /** @type {NonNullable<State['poverty']>} */ (state.poverty);
  state.hands[seat] = left;
  p.cards = [...cards];
  events.push({ type: 'give', seat, trumps: p.trumps });
  state.phase = 'poverty-offer';
  state.turn = nextSeat(seat, 4);
}

function offer(state, seat, take, events) {
  if (state.phase !== 'poverty-offer') throw new RuleError('phase');
  if (seat !== state.turn) throw new RuleError('turn');
  const p = /** @type {NonNullable<State['poverty']>} */ (state.poverty);
  p.offered.push(seat);
  events.push({ type: take ? 'take' : 'decline', seat });
  if (take) {
    p.taker = seat;
    state.hands[seat].push(...p.cards);
    p.cards = [];
    state.phase = 'poverty-return';
    return;
  }
  const next = nextSeat(seat, 4);
  // Round the table and nobody took it: deal again.
  if (next === p.seat) {
    state.hands[p.seat].push(...p.cards);
    p.cards = [];
    return finishVoid(state, 'poverty', p.seat);
  }
  state.turn = next;
}

function giveBack(state, seat, cards, events) {
  if (state.phase !== 'poverty-return') throw new RuleError('phase');
  if (seat !== state.turn) throw new RuleError('turn');
  const p = /** @type {NonNullable<State['poverty']>} */ (state.poverty);
  state.hands[seat] = threeFrom(cards, state.hands[seat]);
  state.hands[p.seat].push(...cards);
  p.back = trumpCount(cards);
  p.cards = [];
  events.push({ type: 'return', seat, trumps: p.back });
  state.contract = { kind: 'poverty', trump: 'd', soloist: null, solo: null, duty: false, alone: false };
  state.parties = [0, 1, 2, 3].map((s) => (s === p.seat || s === p.taker ? 're' : 'kontra'));
  startPlay(state, state.first, events);
}

// ---- announcing and playing ---------------------------------------------------------------------------

function announce(state, seat, level, events) {
  if (state.phase !== 'play') throw new RuleError('phase');
  if (!Number.isInteger(level) || level < 0 || level > 4) throw new RuleError('level');
  const options = announceOptions(state, seat);
  if (!options.includes(level)) throw new RuleError('announce');
  const party = /** @type {Party} */ (state.parties[seat]);
  const w = state.wedding;
  const shift = w ? /** @type {number} */ (w.trick) - 1 : 0;
  // An answer after one's own deadline: no Absagen for this party from now on.
  if (state.calls[party] < 0 && state.hands[seat].length < state.size - 1 - shift) state.late[party] = true;
  state.calls[party] = level;
  state.announcements.push({ seat, party, level });
  events.push({ type: 'announce', seat, party, level });
}

function playCard(state, seat, card, events) {
  if (state.phase !== 'play') throw new RuleError('phase');
  if (seat !== state.turn) throw new RuleError('turn');
  const hand = state.hands[seat];
  if (!isCard(card) || !hand.includes(card)) throw new RuleError('card');
  if (!legalCards(state, seat).includes(card)) throw new RuleError('follow');
  takeCard(hand, card);
  state.trick.cards.push({ seat, card });
  events.push({ type: 'play', seat, card });
  if (card === 'd-A' && state.pigs === seat && !state.pigsShown) {
    state.pigsShown = true;
    events.push({ type: 'pigs', seat });
  }
  const c = /** @type {Contract} */ (state.contract);
  if (c.kind === 'silent' && card === 'c-Q' && !hand.includes('c-Q')) events.push({ type: 'silent', seat });
  if (state.trick.cards.length < 4) {
    state.turn = nextSeat(seat, 4);
    return;
  }

  const number = state.tricks.length + 1;
  const last = number === state.size;
  const at = trickWinner(state.trick.cards, rankingOf(state), { last });
  const winner = state.trick.cards[at].seat;
  const done = { lead: state.trick.lead, cards: state.trick.cards, winner, augen: sumAugen(state.trick.cards.map((p) => p.card)) };
  state.tricks.push(done);
  events.push({ type: 'trick', seat: winner, augen: done.augen });

  // A wedding: the first other player to take one of the first three tricks is the partner.
  const w = state.wedding;
  if (w && w.trick === null) {
    if (winner !== w.seat) {
      w.partner = winner;
      w.trick = number;
      state.parties = [0, 1, 2, 3].map((s) => (s === w.seat || s === winner ? 're' : 'kontra'));
      events.push({ type: 'partner', seat: winner, trick: number });
    } else if (number === 3) {
      // Took all three: a Karo solo after all (DDV §4.4.3b), scored as one.
      w.trick = 3;
      c.alone = true;
      state.parties = [0, 1, 2, 3].map((s) => (s === w.seat ? 're' : 'kontra'));
      events.push({ type: 'alone', seat: w.seat });
    }
  }

  state.trick = { lead: winner, cards: [] };
  state.turn = winner;
  if (last) {
    state.phase = 'done';
    state.result = score(state);
    events.push({ type: 'done' });
  }
}

/** A deal that's not played: thrown in, or poverty nobody took. The same dealer deals again. */
function finishVoid(state, why, seat) {
  state.phase = 'done';
  state.result = { void: why, seat, redeal: true, points: [0, 0, 0, 0] };
}

// ---- scoring (DDV §7) -----------------------------------------------------------------------------------

const UNDER = [null, 90, 60, 30];
const other = (p) => (p === 're' ? 'kontra' : 're');

/** Whether a deal is scored as a solo: one against three (a solo, a silent wedding, a wedding alone). */
export const soloScored = (c) => c.kind === 'solo' || c.kind === 'silent' || (c.kind === 'wedding' && c.alone);

/**
 * A finished deal's score: who won, the game value and its items, the extra points, and each seat's
 * points (each winner +, each loser −; a soloist three times).
 * @param {State} state
 */
export function score(state) {
  const parties = /** @type {Party[]} */ (state.parties);
  const c = /** @type {Contract} */ (state.contract);
  const augenOf = { re: 0, kontra: 0 };
  const tricksOf = { re: 0, kontra: 0 };
  for (const t of state.tricks) {
    augenOf[parties[t.winner]] += t.augen;
    tricksOf[parties[t.winner]] += 1;
  }
  const { calls } = state;

  /** Whether party p reached what it has to (DDV §7.1). */
  const reached = (p) => {
    const o = other(p);
    if (calls[p] >= 1) return calls[p] === 4 ? tricksOf[o] === 0 : augenOf[o] < /** @type {number} */ (UNDER[calls[p]]);
    if (calls[o] >= 1) return calls[o] === 4 ? tricksOf[p] > 0 : augenOf[p] >= /** @type {number} */ (UNDER[calls[o]]);
    const onlyKontra = calls.kontra >= 0 && calls.re < 0;
    const need = p === 're' ? (onlyKontra ? 120 : 121) : onlyKontra ? 121 : 120;
    return augenOf[p] >= need;
  };
  const winner = reached('re') ? 're' : reached('kontra') ? 'kontra' : null;

  /** What a party earned by itself: the other side under 90/60/30/schwarz, and 120/90/60/30 against its Absagen. */
  const earned = (p) => {
    const o = other(p);
    /** @type {{ key: string, party: Party }[]} */
    const items = [];
    if (augenOf[o] < 90) items.push({ key: 'under90', party: p });
    if (augenOf[o] < 60) items.push({ key: 'under60', party: p });
    if (augenOf[o] < 30) items.push({ key: 'under30', party: p });
    if (tricksOf[o] === 0) items.push({ key: 'schwarz', party: p });
    if (calls[o] >= 1 && augenOf[p] >= 120) items.push({ key: 'vs90', party: p });
    if (calls[o] >= 2 && augenOf[p] >= 90) items.push({ key: 'vs60', party: p });
    if (calls[o] >= 3 && augenOf[p] >= 60) items.push({ key: 'vs30', party: p });
    if (calls[o] >= 4 && augenOf[p] >= 30) items.push({ key: 'vsSchwarz', party: p });
    return items;
  };

  /** @type {{ key: string, party: Party | null }[]} */
  let items = [];
  let value; // for Re: positive when Re comes out ahead
  if (winner) {
    // The game value is the winners' (DDV §7.2.2): what the losers may have reached doesn't count
    // against it (a side that wins against an Absage can itself stay under 90).
    items.push({ key: 'won', party: winner });
    items.push(...earned(winner));
    if (calls.re >= 0) items.push({ key: 're', party: winner });
    if (calls.kontra >= 0) items.push({ key: 'kontra', party: winner });
    for (const p of /** @type {Party[]} */ (['re', 'kontra'])) {
      for (let k = 1; k <= calls[p]; k++) items.push({ key: ['', 'no90', 'no60', 'no30', 'noSchwarz'][k], party: winner, by: p });
    }
    const total = items.reduce((n, i) => n + (i.key === 're' || i.key === 'kontra' ? 2 : 1), 0);
    value = winner === 're' ? total : -total;
  } else {
    // Both sides missed their Absage: nobody wins; only what each earned counts (DDV §7.1.3).
    items = [...earned('re'), ...earned('kontra')];
    value = items.filter((i) => i.party === 're').length - items.filter((i) => i.party === 'kontra').length;
  }

  /** @type {{ key: string, party: Party, trick?: number }[]} */
  const extras = [];
  if (!soloScored(c)) {
    if (winner === 'kontra' && (c.kind === 'normal' || c.kind === 'wedding')) extras.push({ key: 'alten', party: 'kontra' });
    state.tricks.forEach((t, i) => {
      const p = parties[t.winner];
      if (t.augen >= 40) extras.push({ key: 'doppelkopf', party: p, trick: i + 1 });
      for (const { seat, card } of t.cards) if (card === 'd-A' && parties[seat] !== p) extras.push({ key: 'fox', party: p, trick: i + 1 });
      const top = t.cards.find((x) => x.seat === t.winner);
      if (i === state.tricks.length - 1 && top?.card === 'c-J') extras.push({ key: 'karlchen', party: p, trick: i + 1 });
    });
  }
  const extraRe = extras.filter((e) => e.party === 're').length - extras.filter((e) => e.party === 'kontra').length;
  // Per Re player (a Kontra player gets the opposite, a soloist three times it).
  const perRe = value + extraRe;
  const solo = soloScored(c);
  const points = parties.map((p) => (p === 're' ? (solo ? 3 * perRe : perRe) : -perRe));
  return {
    winner,
    augen: augenOf,
    tricks: tricksOf,
    calls: { ...calls },
    value: Math.abs(value),
    items,
    extras,
    solo,
    duty: c.duty,
    contract: c,
    parties: [...parties],
    points,
  };
}

// ---- views ------------------------------------------------------------------------------------------------

/** A hand as it's held: trumps high to low, then ♣ ♠ ♥ ♦ each high to low. */
export function sortHand(state, hand) {
  const r = rankingOf(state);
  return sortBy(hand, (id) => (r.cls(id) === 'trump' ? 1000 - r.rank(id) : 2000 + (3 - SUIT_RANK[parseCard(id).s]) * 100 + (100 - r.rank(id))));
}

/**
 * The parties as `seat` knows them for certain: its own (a ♣Q in hand makes it Re); whoever played a
 * ♣Q or announced; a solo, a wedding with its partner found, poverty: everyone. Once two are known
 * Re (or the Kontra side is full), the rest follows.
 * @param {State} state  @param {number | null} seat
 */
export function knownParties(state, seat) {
  /** @type {(Party | null)[]} */
  const known = [null, null, null, null];
  if (state.phase === 'done' && state.result && !state.result.void) return [...state.parties];
  const c = state.contract;
  if (!c) return known;
  const silentShown = c.kind === 'silent' && playedBy(state, c.soloist, 'c-Q') === 2;
  if (c.kind === 'solo' || c.kind === 'poverty' || silentShown || (c.kind === 'wedding' && state.wedding?.trick !== null)) {
    return [...state.parties];
  }
  if (c.kind === 'wedding') {
    known[/** @type {number} */ (c.soloist)] = 're';
    return known;
  }
  // A normal game (or a silent wedding nobody has seen yet).
  const mine = seat !== null && seat >= 0 && seat < 4;
  for (const { cards } of [...state.tricks, state.trick]) for (const p of cards) if (p.card === 'c-Q') known[p.seat] = 're';
  for (const a of state.announcements) known[a.seat] = a.party;
  /** How many Re there are, as far as this seat knows: 1 in its own silent wedding, 2 if it holds one ♣Q. */
  let reSize = null;
  if (mine) {
    const q = state.hands[seat].filter((id) => id === 'c-Q').length + playedBy(state, seat, 'c-Q');
    known[seat] = q > 0 ? 're' : 'kontra';
    if (q === 2) reSize = 1;
    if (q === 1) reSize = 2;
  }
  const re = known.filter((p) => p === 're').length;
  const kontra = known.filter((p) => p === 'kontra').length;
  if (re === 2) reSize = 2;
  if (reSize !== null && re === reSize) return known.map((p) => p ?? 'kontra');
  if (reSize !== null && kontra === 4 - reSize) return known.map((p) => p ?? 're');
  if (kontra === 3) return known.map((p) => p ?? 're');
  return known;
}

/** How many copies of `card` seat has played this deal. */
function playedBy(state, seat, card) {
  let n = 0;
  for (const { cards } of [...state.tricks, state.trick]) for (const p of cards) if (p.seat === seat && p.card === card) n += 1;
  return n;
}

/** The contract as `seat` may know it: a silent wedding looks like a normal game to everyone else. */
function publicContract(state, seat) {
  const c = state.contract;
  if (!c) return null;
  if (c.kind === 'silent' && seat !== c.soloist && state.phase !== 'done' && playedBy(state, c.soloist, 'c-Q') < 2) {
    return { kind: 'normal', trump: 'd', soloist: null, solo: null, duty: false, alone: false };
  }
  return { ...c };
}

/**
 * What one seat sees: its own hand and nobody else's (only how many cards each holds), the trick on
 * the table and the last one, the parties as far as it knows them, the announcements, its legal cards
 * and announcements. `seat` null: a watcher.
 * @param {State} state  @param {number | null} seat
 */
export function view(state, seat) {
  const mine = seat !== null && seat >= 0 && seat < 4;
  const p = state.poverty;
  const known = knownParties(state, seat);
  return {
    game: 'doppelkopf',
    rules: state.rules,
    phase: state.phase,
    players: 4,
    dealer: state.dealer,
    first: state.first,
    size: state.size,
    turn: state.turn,
    forced: state.forced,
    reserve: [...state.reserve],
    contract: publicContract(state, seat),
    wedding: state.wedding ? { ...state.wedding } : null,
    poverty: p ? { seat: p.seat, trumps: p.trumps, offered: [...p.offered], taker: p.taker, back: p.back } : null,
    parties: known,
    party: mine ? known[seat] : null,
    calls: { ...state.calls },
    announcements: state.announcements.map((a) => ({ ...a })),
    options: mine ? announceOptions(state, seat) : [],
    trick: { lead: state.trick.lead, cards: state.trick.cards.map((x) => ({ ...x })) },
    last: state.tricks.length ? { ...state.tricks[state.tricks.length - 1] } : null,
    won: [0, 1, 2, 3].map((s) => state.tricks.filter((t) => t.winner === s).length),
    counts: state.hands.map((h) => h.length),
    hand: mine ? sortHand(state, state.hands[seat]) : null,
    legal: mine ? [...new Set(legalCards(state, seat))] : [],
    declared: mine ? state.declared[seat] : null,
    /** Your reservations to choose from, when it's your turn to say one. */
    choices: mine && state.phase === 'reserve' && seat === state.turn ? moves(state, seat) : [],
    pigs: state.pigsShown ? state.pigs : null,
    result: state.result,
  };
}

// ---- the match (server/core/match.mjs): the duty solo and Bock rounds --------------------------------

/**
 * Doppelkopf's match rules (house rules, off by default):
 * - duty: everyone owes one solo a match (DDV §4.2: the Pflichtsolo). It beats a lust solo, its
 *   soloist leads, and it doesn't use up a deal: the same dealer deals again. Whoever still owes one
 *   once the deals are played must play it (Vorführung), the one nearest the dealer's left first; then
 *   the next player deals.
 * - bock: a deal that ends 120 : 120, or where both Re and Kontra were said, brings a Bock round: the
 *   next deals, one per seat at the table, count double. More of them queue up.
 */
export const match = {
  /** @param {import('../core/match.mjs').Match} m */
  start(m) {
    m.extra.owes = Array(m.table).fill(Boolean(m.rules.duty));
    m.extra.bock = 0;
  },
  /** @param {import('../core/match.mjs').Match} m  @param {number[]} seats */
  dealArgs(m, seats) {
    if (!m.rules.duty) return {};
    const owes = m.extra.owes;
    if (m.counted < m.rounds * m.table) return { owes: seats.map((s) => owes[s]) };
    const order = Array.from({ length: m.table }, (_, i) => nextSeat(m.dealer, m.table, 1 + i));
    const who = order.find((s) => owes[s]);
    if (who === undefined) return {};
    // The forced player plays even where they'd sit out: then the four seats that end with them.
    const active = seats.includes(who) ? seats : [3, 2, 1, 0].map((k) => nextSeat(who, m.table, -k));
    return { seats: active, owes: active.map((s) => owes[s]), forced: active.indexOf(who) };
  },
  /** @param {import('../core/match.mjs').Match} m  @param {import('../core/match.mjs').DealRecord} record */
  after(m, record) {
    const r = record.result;
    if (r.void) return { counts: false, sameDealer: true };
    let counts = true;
    let sameDealer = false;
    if (m.rules.duty && r.duty) {
      m.extra.owes[record.seats[/** @type {number} */ (r.contract.soloist)]] = false;
      counts = false;
      sameDealer = m.current?.forced === null;
    }
    if (m.rules.bock) {
      if (m.extra.bock > 0) m.extra.bock -= 1;
      const tie = r.augen.re === 120 && r.augen.kontra === 120;
      const both = r.calls.re >= 0 && r.calls.kontra >= 0;
      m.extra.bock += ((tie ? 1 : 0) + (both ? 1 : 0)) * m.table;
    }
    return { counts, sameDealer };
  },
  /** A Bock deal counts double. @param {import('../core/match.mjs').Match} m */
  multiplier(m) {
    return m.rules.bock && m.extra.bock > 0 ? 2 : 1;
  },
  /** Not over while anyone owes a duty solo. @param {import('../core/match.mjs').Match} m */
  over(m) {
    return !m.rules.duty || !m.extra.owes.some(Boolean);
  },
};
