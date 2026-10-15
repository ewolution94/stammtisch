// A Doppelkopf bot in three ranks (server/bots/rank.mjs). It knows only what its seat may know: its
// hand, the tricks played so far (as a player remembers them), the parties as far as they've been
// shown (knownParties), and the Schweinchen once shown or in its own hand. The journeyman:
//   - reservations: a solo only with a hand built for one; a wedding with both ♣Q; poverty and
//     throwing in when the house allows and the hand is that bad;
//   - announces Re or Kontra (and keine 90) with a strong hand, on its turn and in time;
//   - leads a plain suit's Ass in its first round, otherwise pulls trumps as Re with many of them;
//   - follows: lets a partner's sure trick run and "schmiert" it (a fat card on it), takes a trick
//     worth having as cheaply as it can, else throws its cheapest card, and keeps its foxes home;
//   - counts the cards: a card nothing still out there beats is a sure one.
// The apprentice doesn't count (a high card looks sure), plays a lust solo never, announces by gut,
// and every other move puts the wrong one of two cards that do the same job (never a fox, a Dulle or
// a ♣Q). The master tries its cards, and its Re or Kontra, in many deals of the cards it can't see.
// A temperament leans the solo and the announcement by a trump.

import { augen, makeDeck, parseCard } from '../core/cards.mjs';
import { trickWinner } from '../core/tricks.mjs';
import { SOLOS, act, announceOptions, isTrump, knownParties, legalCards, mayThrow, moves, poor, ranking } from '../games/doppelkopf.mjs';
import { dealOut, search, seeded, stopAt, trials, without } from './rank.mjs';

/** @typedef {import('../games/doppelkopf.mjs').State} State */
/** @typedef {import('./rank.mjs').Style} Style */

const HIGH = new Set(['h-10', 'c-Q', 's-Q']);
/** How far a temperament moves the hand a solo or an announcement needs, in trumps. */
const LEAN = { cautious: -1, steady: 0, bold: 1 };

/**
 * The bot's move for `seat`: its reservation, poverty step, an announcement, or a card. In play it
 * may answer with an announcement first; asked again, it plays.
 * @param {State} state  @param {number} seat  @param {Style} [style]
 */
export function botMove(state, seat, { level = 'journeyman', temper = 'steady' } = {}) {
  const hand = state.hands[seat];
  const lean = LEAN[temper] ?? 0;
  switch (state.phase) {
    case 'reserve': return reserveFor(state, seat, hand, level, lean);
    case 'poverty-give': return { type: 'give', cards: povertyGive(hand) };
    case 'poverty-offer': return takesPoverty(hand, lean) ? { type: 'take' } : { type: 'decline' };
    case 'poverty-return': return { type: 'return', cards: povertyReturn(hand) };
    case 'play': {
      const call = level === 'master' ? masterAnnounce(state, seat, temper) : wantAnnounce(state, seat, hand, level === 'apprentice' ? gut(state, seat) : lean);
      if (call !== null) return { type: 'announce', level: call };
      if (level === 'master') return { type: 'play', card: masterCard(state, seat) };
      const card = playFor(state, seat, hand, level !== 'apprentice');
      return { type: 'play', card: level === 'apprentice' ? slip(state, seat, card) : card };
    }
    default: throw new Error('nothing to do');
  }
}

/** The deck this deal is played with (with the nines or without), and each card once. */
const deckOf = (state) => makeDeck(state.rules.nines ? 'doko' : 'doko40', 2);
const kindsOf = (state) => makeDeck(state.rules.nines ? 'doko' : 'doko40', 1);

/**
 * The ranking as `seat` knows it: the deal's trumps, and the Schweinchen (both ♦A above the Dullen)
 * only once shown or when they're in its own hand; until then a ♦A looks like a ♦A.
 * @param {State} state  @param {number} seat
 */
export function rankingFor(state, seat) {
  const trump = state.contract ? state.contract.trump : 'd';
  const own = state.hands[seat].filter((id) => id === 'd-A').length === 2;
  const pigs = Boolean(state.rules.schweinchen) && trump === 'd' && (state.pigsShown || own);
  return ranking(trump, { pigs, dulle: state.rules.dulle });
}

// ---- reservations ---------------------------------------------------------------------------------

/** How good a hand is for a solo with this trump: trumps, the high ones, Asse of plain suits. */
function soloOk(hand, solo, lean) {
  const trump = { Q: 'Q', J: 'J', c: 'c', s: 's', h: 'h', d: 'd', A: null }[solo];
  const r = ranking(trump);
  const trumps = hand.filter((id) => r.cls(id) === 'trump');
  const aces = hand.filter((id) => r.cls(id) !== 'trump' && parseCard(id).r === 'A').length;
  if (solo === 'A') return aces >= 6 - lean || (aces >= 5 - lean && hand.filter((id) => parseCard(id).r === '10').length >= 3);
  if (solo === 'Q' || solo === 'J') {
    const top = trumps.filter((id) => ['c', 's'].includes(parseCard(id).s)).length;
    return trumps.length >= 6 - lean && top >= 3 && aces >= 2;
  }
  // A suit solo needs length and the top: about half the deck's 26 trumps, with Dullen and Ober.
  const high = trumps.filter((id) => HIGH.has(id)).length;
  return (trumps.length >= 10 - lean && high >= 4) || (trumps.length >= 11 - lean && high >= 3);
}

function reserveFor(state, seat, hand, level, lean) {
  // An apprentice plays a solo only when it must.
  const solo = level === 'apprentice' ? undefined : SOLOS.find((s) => soloOk(hand, s, lean));
  if (state.forced !== null) return { type: 'reserve', kind: 'solo', solo: SOLOS.find((s) => soloOk(hand, s, lean)) ?? bestForcedSolo(hand) };
  if (solo) return { type: 'reserve', kind: 'solo', solo };
  if (mayThrow(state, seat)) return { type: 'reserve', kind: 'throw' };
  if (poor(state, seat)) return { type: 'reserve', kind: 'poverty' };
  if (hand.filter((id) => id === 'c-Q').length === 2) return { type: 'reserve', kind: 'wedding' };
  return { type: 'reserve', kind: 'healthy' };
}

/** A compulsory solo with no good one: the suit (or Ober/Unter) with the most trumps. */
function bestForcedSolo(hand) {
  const count = (solo) => {
    const r = ranking({ Q: 'Q', J: 'J', c: 'c', s: 's', h: 'h', d: 'd', A: null }[solo]);
    return hand.filter((id) => r.cls(id) === 'trump').length + (solo === 'Q' || solo === 'J' ? 3 : 0);
  };
  return ['d', 'c', 's', 'h', 'Q', 'J'].reduce((best, s) => (count(s) > count(best) ? s : best), 'd');
}

// ---- poverty (house rule) ---------------------------------------------------------------------------

const normal = ranking('d');
/** Plain cards by what they're worth to keep: low Augen go first. */
const cheapFirst = (a, b) => augen(a) - augen(b) || normal.rank(a) - normal.rank(b);

function povertyGive(hand) {
  const trumps = hand.filter((id) => isTrump(id, 'd'));
  const plain = hand.filter((id) => !isTrump(id, 'd')).sort(cheapFirst);
  return [...trumps, ...plain.slice(0, 3 - trumps.length)];
}

function takesPoverty(hand, lean) {
  const trumps = hand.filter((id) => isTrump(id, 'd'));
  return trumps.length >= 7 - lean && trumps.filter((id) => HIGH.has(id)).length >= 2;
}

function povertyReturn(hand) {
  // Back go the cheapest plain cards; only short of them, the lowest trumps.
  const plain = hand.filter((id) => !isTrump(id, 'd')).sort(cheapFirst);
  const trumps = hand.filter((id) => isTrump(id, 'd')).sort((a, b) => normal.rank(a) - normal.rank(b));
  return [...plain, ...trumps].slice(0, 3);
}

// ---- announcing -------------------------------------------------------------------------------------

/** An apprentice's gut for announcing: a trump either way now and then, the same all deal long. */
function gut(state, seat) {
  const r = seeded(`gut|${state.dealer}|${[...state.hands[seat], ...playedBy(state, seat)].sort().join(',')}`);
  return Math.round((r() + r() - 1) * 1.5);
}

/** Re or Kontra with a strong hand, keine 90 with a very strong one; only on its own turn. */
function wantAnnounce(state, seat, hand, lean) {
  if (seat !== state.turn) return null;
  const options = announceOptions(state, seat);
  if (!options.length) return null;
  const r = rankingFor(state, seat);
  const trumps = hand.filter((id) => r.cls(id) === 'trump');
  const high = trumps.filter((id) => r.rank(id) >= r.rank('h-Q')).length;
  const c = /** @type {NonNullable<State['contract']>} */ (state.contract);
  const lone = c.soloist === seat && (c.kind === 'solo' || c.kind === 'silent');
  // Re (or Kontra) first.
  const mine = knownParties(state, seat)[seat];
  if (options.includes(0) && mine && state.calls[mine] < 0) {
    const strong = lone ? trumps.length >= 9 - lean && high >= 4 : trumps.length >= 7 - lean && high >= 4;
    return strong ? 0 : null;
  }
  if (options.includes(1) && !lone && trumps.length >= 9 - lean && high >= 6) return 1;
  return null;
}

// ---- playing ------------------------------------------------------------------------------------------

/** The cards `seat` has played this deal. */
function playedBy(state, seat) {
  return [...state.tricks, state.trick].flatMap((t) => t.cards.filter((p) => p.seat === seat).map((p) => p.card));
}

/**
 * The rules' card. `counting`: remember what's been played, so a card nothing still out there beats
 * is known to be sure (a journeyman's; an apprentice goes by a card's look).
 * @param {State} state  @param {number} seat  @param {string[]} hand  @param {boolean} counting
 */
function playFor(state, seat, hand, counting) {
  const legal = [...new Set(legalCards(state, seat))];
  if (legal.length === 1) return legal[0];
  const r = rankingFor(state, seat);
  const known = knownParties(state, seat);
  const me = known[seat];
  const trick = state.trick.cards;
  const last = state.tricks.length + 1 === state.size;
  // Copies of each card neither in this hand nor played yet: still out there.
  const left = new Map();
  for (const id of deckOf(state)) left.set(id, (left.get(id) ?? 0) + 1);
  for (const t of [...state.tricks, state.trick]) for (const p of t.cards) left.set(p.card, left.get(p.card) - 1);
  for (const id of hand) left.set(id, left.get(id) - 1);
  const kinds = kindsOf(state);
  /** Whether any card still out there ranks above `id` in its class. */
  const anyHigher = (id) => {
    const cls = r.cls(id);
    return kinds.some((x) => r.cls(x) === cls && r.rank(x) > r.rank(id) && left.get(x) > 0);
  };
  const trumpsOut = () => kinds.some((x) => r.cls(x) === 'trump' && left.get(x) > 0);
  const cheapest = (cards) => [...cards].sort((a, b) => augen(a) - augen(b) || r.rank(a) - r.rank(b) || (a === 'd-A' ? 1 : b === 'd-A' ? -1 : 0))[0];
  const fattest = (cards) => [...cards].sort((a, b) => augen(b) - augen(a) || r.rank(a) - r.rank(b))[0];
  // Without counting, a card looks sure when it's high: a Dulle or a ♣Q, a plain suit's Ass first time round.
  const looksSure = (id) => (r.cls(id) === 'trump' ? r.rank(id) >= r.rank('c-Q') : parseCard(id).r === 'A' && !state.tricks.some((t) => r.cls(t.cards[0].card) === r.cls(id)));

  // A bride still looking for her partner lets the others take the tricks.
  const w = state.wedding;
  const seeking = w !== null && w.trick === null && w.seat === seat;

  if (!trick.length) {
    if (seeking) {
      const plain = legal.filter((id) => r.cls(id) !== 'trump' && parseCard(id).r !== 'A');
      if (plain.length) return cheapest(plain);
    }
    return lead(state, seat, hand, legal, r, me, cheapest, counting ? anyHigher : (id) => !looksSure(id), counting ? trumpsOut : () => true);
  }

  const at = trickWinner(trick, r, { last });
  const leader = trick[at].seat;
  const friend = me !== null && known[leader] === me;
  const rest = 3 - trick.length;
  const after = [1, 2, 3].slice(0, rest).map((k) => (seat + k) % 4);
  const friendsAfter = after.every((s) => me !== null && known[s] === me);
  const wins = (id) => trickWinner([...trick, { seat, card: id }], r, { last }) === trick.length;
  const winners = legal.filter(wins);
  const losers = legal.filter((id) => !wins(id));
  const pot = trick.reduce((n, p) => n + augen(p.card), 0);
  // A card no card still out there beats (a plain one only while nobody can trump it).
  const sure = (id) => {
    if (!counting) return looksSure(id);
    if (r.cls(id) !== 'trump') return r.cls(trick[0].card) === r.cls(id) && !anyHigher(id) && !trumpsOut();
    return !anyHigher(id);
  };

  if (seeking) {
    const duck = losers.filter((id) => id !== 'd-A');
    if (duck.length) return cheapest(duck);
  }
  if (friend && (rest === 0 || friendsAfter || sure(trick[at].card))) {
    // The trick is ours: put something fat on it (a fox too, it's safe with a partner).
    const plain = losers.filter((id) => r.cls(id) !== 'trump' || id === 'd-A' || id === 'd-10');
    return fattest(plain.length ? plain : legal);
  }
  if (winners.length) {
    if (rest === 0) return cheapest(winners);
    const safe = winners.filter(sure);
    if (safe.length) return cheapest(safe);
    if (pot >= 10 || r.cls(trick[0].card) !== 'trump') {
      // Over a plain suit, a high trump: an Ober or better holds most of the time.
      const strong = winners.filter((id) => r.rank(id) >= r.rank('h-Q'));
      if (strong.length) return cheapest(strong);
    }
  }
  // Can't take it (or not worth it): the cheapest card, no fox if it can be helped.
  const noFox = losers.filter((id) => id !== 'd-A');
  return cheapest(noFox.length ? noFox : losers.length ? losers : legal);
}

function lead(state, seat, hand, legal, r, me, cheapest, anyHigher, trumpsOut) {
  const c = /** @type {NonNullable<State['contract']>} */ (state.contract);
  const lone = c.soloist === seat && (c.kind === 'solo' || c.kind === 'silent' || c.alone);
  if (lone) {
    // A soloist: a trump nothing out there beats first, then a fresh Ass, then a low trump to draw theirs.
    const trumps = legal.filter((id) => r.cls(id) === 'trump').sort((a, b) => r.rank(b) - r.rank(a));
    const sureTrump = trumps.find((id) => !anyHigher(id));
    if (sureTrump && trumpsOut()) return sureTrump;
    const freshAce = legal.find((id) => r.cls(id) !== 'trump' && parseCard(id).r === 'A' && !state.tricks.some((t) => r.cls(t.cards[0].card) === r.cls(id)));
    if (freshAce) return freshAce;
    if (trumps.length && trumpsOut()) return trumps[trumps.length - 1];
    if (sureTrump) return sureTrump;
  }
  // A plain suit's Ass while nobody has played that suit yet: it usually goes through once.
  const fresh = legal.filter((id) => {
    if (r.cls(id) === 'trump' || parseCard(id).r !== 'A') return false;
    const suit = r.cls(id);
    return !state.tricks.some((t) => r.cls(t.cards[0].card) === suit);
  });
  if (fresh.length) return fresh[0];
  const trumps = legal.filter((id) => r.cls(id) === 'trump');
  if (me === 're' && trumps.length >= 5) {
    // Pull trumps: the second highest, keeping the top one to come back in.
    const sorted = [...trumps].sort((a, b) => r.rank(b) - r.rank(a));
    return sorted[Math.min(1, sorted.length - 1)];
  }
  // Otherwise a plain card from the longest plain suit, low.
  const plain = legal.filter((id) => r.cls(id) !== 'trump' && id !== 'd-A');
  if (plain.length) {
    const len = (id) => hand.filter((x) => r.cls(x) === r.cls(id)).length;
    return [...plain].sort((a, b) => len(b) - len(a) || augen(a) - augen(b))[0];
  }
  const noFox = legal.filter((id) => id !== 'd-A');
  return cheapest(noFox.length ? noFox : legal);
}

/**
 * An apprentice's slip, every other move: the wrong one of two cards that do the same job. If the
 * rules' card takes the trick the slip takes it too, if it loses so does the slip; never a fox, a
 * Dulle or a ♣Q, never on the lead: a fat card kept back from a partner's trick, a winner dearer than
 * it had to be, points thrown on the other side's trick.
 */
function slip(state, seat, card) {
  const trick = state.trick.cards;
  if (!trick.length) return card;
  const r = seeded(`slip|${key(state, seat)}`);
  if (r() >= 0.5) return card;
  const keep = (id) => id === 'd-A' || id === 'h-10' || id === 'c-Q';
  if (keep(card)) return card;
  const rk = rankingFor(state, seat);
  const last = state.tricks.length + 1 === state.size;
  const wins = (id) => trickWinner([...trick, { seat, card: id }], rk, { last }) === trick.length;
  const same = wins(card);
  const like = [...new Set(legalCards(state, seat))].filter((id) => id !== card && !keep(id) && wins(id) === same);
  return like.length ? like[Math.floor(r() * like.length)] : card;
}

// ---- the master: many deals, played to the end -------------------------------------------------

/** What `seat` sees, as a key for its random draws: its hand, the tricks, the calls. Nothing hidden. */
function key(state, seat) {
  const tricks = [...state.tricks, state.trick].map((t) => t.cards.map((p) => `${p.seat}${p.card}`).join('.')).join('/');
  const c = state.contract;
  return `${state.dealer}|${state.hands[seat].join(',')}|${tricks}|${state.calls.re},${state.calls.kontra}|${c ? `${c.kind === 'silent' && c.soloist !== seat ? 'normal' : c.kind}${c.solo ?? ''}` : '-'}`;
}

/** The master's card: each different legal card tried in many deals of the cards it can't see. */
function masterCard(state, seat) {
  const choices = [...new Set(legalCards(state, seat))];
  const prefer = playFor(state, seat, state.hands[seat], true);
  if (choices.length === 1) return choices[0];
  const left = state.hands.reduce((n, h) => n + h.length, 0);
  return search({
    choices,
    prefer,
    deals: trials(choices.length * left, 120),
    r: seeded(`card|${key(state, seat)}`),
    imagine: (r) => imagine(state, seat, r),
    trial: (world, card) => worth(playOut(world, seat, card), seat),
  });
}

/**
 * The master's Re or Kontra: its party's chances, tried in many deals from here; it announces when
 * they're good enough for its temperament (keine 90 when the other side stays under 90 often).
 */
function masterAnnounce(state, seat, temper) {
  if (seat !== state.turn) return null;
  const options = announceOptions(state, seat);
  if (!options.includes(0) && !options.includes(1)) return null;
  const mine = knownParties(state, seat)[seat];
  if (!mine) return null;
  const other = mine === 're' ? 'kontra' : 're';
  const r = seeded(`announce|${key(state, seat)}`);
  let won = 0, under = 0, n = 0;
  const until = stopAt(0.45);
  const left = state.hands.reduce((n, h) => n + h.length, 0);
  for (let d = 0, most = trials(left, 48); d < most; d++) {
    const s = playOut(imagine(state, seat, r), seat, null);
    n += 1;
    if (s.result.points[seat] > 0) won += 1;
    if (s.result.augen[other] < 90) under += 1;
    if (Date.now() > until) break;
  }
  const need = { cautious: 0.75, steady: 0.68, bold: 0.6 }[temper] ?? 0.68;
  if (options.includes(0) && state.calls[mine] < 0) return won / n >= need ? 0 : null;
  if (options.includes(1) && under / n >= need + 0.15) return 1;
  return null;
}

/** What a finished trial deal brought `seat`: its points, its side's Augen breaking a tie. */
function worth(s, seat) {
  const res = s.result;
  const party = res.parties[seat];
  return res.points[seat] + (party ? res.augen[party] / 1000 : 0);
}

/** A copy of `world` with `card` played for `seat` (none: as it stands), and everyone's rules to the end. */
function playOut(world, seat, card) {
  const s = structuredClone(world);
  if (card !== null) act(s, seat, { type: 'play', card });
  while (s.phase === 'play') {
    const t = s.turn;
    const legal = legalCards(s, t);
    act(s, t, { type: 'play', card: legal.length === 1 ? legal[0] : playFor(s, t, s.hands[t], true) });
  }
  return s;
}

/**
 * One way the deal could stand, as `seat` sees it: the cards it can't see dealt to the others (as
 * many as each holds; no card of a class someone couldn't follow; a ♣Q where an announcement or a
 * wedding says one is, none where the seat knows there's none), and what follows from where the ♣Q
 * and the ♦A lie in that deal: who's Re, a silent wedding, the Schweinchen. Nothing else is taken
 * from the real deal but what everyone at the table knows.
 * @param {State} state  @param {number} seat  @param {() => number} r
 */
export function imagine(state, seat, r) {
  const rk = rankingFor(state, seat);
  const plays = [...state.tricks, state.trick].flatMap((t) => t.cards);
  const unseen = without(deckOf(state), [...state.hands[seat], ...plays.map((p) => p.card)]);
  const others = [0, 1, 2, 3].filter((s) => s !== seat);
  const need = new Map(others.map((s) => [s, state.hands[s].length]));
  // Who couldn't follow what.
  /** @type {Map<number, Set<string>>} */
  const voids = new Map();
  for (const t of [...state.tricks, state.trick]) {
    const led = t.cards.length ? rk.cls(t.cards[0].card) : null;
    for (const p of t.cards.slice(1)) {
      if (rk.cls(p.card) !== led) {
        if (!voids.has(p.seat)) voids.set(p.seat, new Set());
        /** @type {Set<string>} */ (voids.get(p.seat)).add(/** @type {string} */ (led));
      }
    }
  }
  const c = /** @type {NonNullable<State['contract']>} */ (state.contract);
  const qPlayed = [0, 1, 2, 3].map((s) => plays.filter((p) => p.seat === s && p.card === 'c-Q').length);
  // The game as this seat knows it: someone else's silent wedding looks like a normal game.
  const shown = qPlayed.some((n) => n === 2);
  const looksNormal = c.kind === 'normal' || (c.kind === 'silent' && c.soloist !== seat && !shown);
  const known = knownParties(state, seat);
  /** @type {Map<number, string[]>} */
  const must = new Map();
  const noQ = new Set();
  if (looksNormal) {
    for (const s of others) {
      if (known[s] === 're' && qPlayed[s] === 0) must.set(s, ['c-Q']);
      if (known[s] === 'kontra') noQ.add(s);
    }
  } else if (c.kind === 'wedding' && c.soloist !== seat && c.soloist !== null) {
    must.set(c.soloist, Array(Math.max(0, 2 - qPlayed[c.soloist])).fill('c-Q'));
  }
  const fits = (s, id) => !voids.get(s)?.has(rk.cls(id)) && !(id === 'c-Q' && noQ.has(s));
  const { hands } = dealOut(unseen, need, fits, r, must);

  const world = structuredClone(state);
  for (const [s, h] of hands) world.hands[s] = h;
  // Nobody else's reservation is known (only that one was made).
  world.declared = state.declared.map((d, i) => (i === seat ? d : null));
  if (looksNormal) {
    // Who's who follows from where the ♣Q lie (and who played one).
    const q = [0, 1, 2, 3].map((s) => world.hands[s].filter((id) => id === 'c-Q').length + qPlayed[s]);
    const silent = q.findIndex((n) => n === 2);
    if (silent >= 0) {
      world.contract = { ...c, kind: 'silent', soloist: silent };
      world.parties = [0, 1, 2, 3].map((s) => (s === silent ? 're' : 'kontra'));
    } else {
      world.contract = { ...c, kind: 'normal', soloist: null };
      world.parties = q.map((n) => (n > 0 ? 're' : 'kontra'));
    }
  }
  // The Schweinchen: whoever holds both ♦A in this deal (none without the house rule, in a game
  // without the normal trumps, or once a ♦A went without being shown).
  if (!state.pigsShown) {
    const gone = plays.some((p) => p.card === 'd-A');
    const pig = [0, 1, 2, 3].find((s) => world.hands[s].filter((id) => id === 'd-A').length === 2);
    world.pigs = state.rules.schweinchen && world.contract.trump === 'd' && !gone ? (pig ?? null) : null;
  }
  return world;
}

/** The rules' card (with or without counting): what an apprentice's slip departs from (tests). */
export const rulesCard = (state, seat, counting) => playFor(state, seat, state.hands[seat], counting);

export { moves };
