// A Doppelkopf bot: legal and sensible, deterministic. It knows only what its seat may know: its
// hand, the tricks played so far (as a player remembers them), and the parties as far as they've been
// shown (knownParties). What it does:
//   - reservations: a solo only with a hand built for one; a wedding with both ♣Q; poverty and
//     throwing in when the house allows and the hand is that bad;
//   - announces Re or Kontra (and keine 90) with a strong hand, on its turn and in time;
//   - leads a plain suit's Ass in its first round, otherwise pulls trumps as Re with many of them;
//   - follows: lets a partner's sure trick run and "schmiert" it (a fat card on it), takes a trick
//     worth having as cheaply as it can, else throws its cheapest card, and keeps its foxes home.

import { augen, parseCard } from '../core/cards.mjs';
import { trickWinner } from '../core/tricks.mjs';
import { SOLOS, announceOptions, isTrump, knownParties, legalCards, moves, ranking, rankingOf, poor, mayThrow } from '../games/doppelkopf.mjs';

/** @typedef {import('../games/doppelkopf.mjs').State} State */

const HIGH = new Set(['h-10', 'c-Q', 's-Q']);

/**
 * The bot's move for `seat`: its reservation, poverty step, an announcement, or a card. In play it
 * may answer with an announcement first; asked again, it plays.
 * @param {State} state  @param {number} seat
 */
export function botMove(state, seat) {
  const hand = state.hands[seat];
  switch (state.phase) {
    case 'reserve': return reserveFor(state, seat, hand);
    case 'poverty-give': return { type: 'give', cards: povertyGive(hand) };
    case 'poverty-offer': return takesPoverty(state, hand) ? { type: 'take' } : { type: 'decline' };
    case 'poverty-return': return { type: 'return', cards: povertyReturn(hand) };
    case 'play': {
      const level = wantAnnounce(state, seat, hand);
      if (level !== null) return { type: 'announce', level };
      return { type: 'play', card: playFor(state, seat, hand) };
    }
    default: throw new Error('nothing to do');
  }
}

// ---- reservations ---------------------------------------------------------------------------------

/** How good a hand is for a solo with this trump: trumps, the high ones, Asse of plain suits. */
function soloStrength(hand, solo) {
  const trump = { Q: 'Q', J: 'J', c: 'c', s: 's', h: 'h', d: 'd', A: null }[solo];
  const r = ranking(trump);
  const trumps = hand.filter((id) => r.cls(id) === 'trump');
  const aces = hand.filter((id) => r.cls(id) !== 'trump' && parseCard(id).r === 'A').length;
  if (solo === 'A') return { ok: aces >= 6 || (aces >= 5 && hand.filter((id) => parseCard(id).r === '10').length >= 3) };
  if (solo === 'Q' || solo === 'J') {
    const top = trumps.filter((id) => ['c', 's'].includes(parseCard(id).s)).length;
    return { ok: trumps.length >= 6 && top >= 3 && aces >= 2 };
  }
  // A suit solo needs length and the top: about half the deck's 26 trumps, with Dullen and Ober.
  const high = trumps.filter((id) => HIGH.has(id)).length;
  return { ok: (trumps.length >= 10 && high >= 4) || (trumps.length >= 11 && high >= 3) };
}

function reserveFor(state, seat, hand) {
  const solo = SOLOS.find((s) => soloStrength(hand, s).ok);
  if (state.forced !== null) return { type: 'reserve', kind: 'solo', solo: solo ?? bestForcedSolo(hand) };
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

function takesPoverty(state, hand) {
  const trumps = hand.filter((id) => isTrump(id, 'd'));
  return trumps.length >= 7 && trumps.filter((id) => HIGH.has(id)).length >= 2;
}

function povertyReturn(hand) {
  // Back go the cheapest plain cards; only short of them, the lowest trumps.
  const plain = hand.filter((id) => !isTrump(id, 'd')).sort(cheapFirst);
  const trumps = hand.filter((id) => isTrump(id, 'd')).sort((a, b) => normal.rank(a) - normal.rank(b));
  return [...plain, ...trumps].slice(0, 3);
}

// ---- announcing -------------------------------------------------------------------------------------

/** Re or Kontra with a strong hand, keine 90 with a very strong one; only on its own turn. */
function wantAnnounce(state, seat, hand) {
  if (seat !== state.turn) return null;
  const options = announceOptions(state, seat);
  if (!options.length) return null;
  const r = rankingOf(state);
  const trumps = hand.filter((id) => r.cls(id) === 'trump');
  const high = trumps.filter((id) => r.rank(id) >= r.rank('h-Q')).length;
  const c = /** @type {NonNullable<State['contract']>} */ (state.contract);
  const lone = c.soloist === seat && (c.kind === 'solo' || c.kind === 'silent');
  // Re (or Kontra) first.
  if (options.includes(0) && state.calls[/** @type {'re' | 'kontra'} */ (state.parties[seat])] < 0) {
    const strong = lone ? trumps.length >= 9 && high >= 4 : trumps.length >= 7 && high >= 4;
    return strong ? 0 : null;
  }
  if (options.includes(1) && !lone && trumps.length >= 9 && high >= 6) return 1;
  return null;
}

// ---- playing ------------------------------------------------------------------------------------------

function playFor(state, seat, hand) {
  const legal = [...new Set(legalCards(state, seat))];
  if (legal.length === 1) return legal[0];
  const r = rankingOf(state);
  const known = knownParties(state, seat);
  const me = known[seat];
  const trick = state.trick.cards;
  const played = state.tricks.flatMap((t) => t.cards.map((p) => p.card)).concat(trick.map((p) => p.card));
  /** Copies of `id` neither in this hand nor played yet: still out there. */
  const out = (id) => 2 - played.filter((x) => x === id).length - hand.filter((x) => x === id).length;
  const cheapest = (cards) => [...cards].sort((a, b) => augen(a) - augen(b) || r.rank(a) - r.rank(b) || (a === 'd-A' ? 1 : b === 'd-A' ? -1 : 0))[0];
  const fattest = (cards) => [...cards].sort((a, b) => augen(b) - augen(a) || r.rank(a) - r.rank(b))[0];

  // A bride still looking for her partner lets the others take the tricks.
  const w = state.wedding;
  const seeking = w !== null && w.trick === null && w.seat === seat;

  if (!trick.length) {
    if (seeking) {
      const plain = legal.filter((id) => r.cls(id) !== 'trump' && parseCard(id).r !== 'A');
      if (plain.length) return cheapest(plain);
    }
    return lead(state, seat, hand, legal, r, me, played, cheapest, out);
  }

  const at = trickWinner(trick, r, { last: state.tricks.length + 1 === state.size });
  const leader = trick[at].seat;
  const friend = me !== null && known[leader] === me;
  const rest = 3 - trick.length;
  const after = [1, 2, 3].slice(0, rest).map((k) => (seat + k) % 4);
  const friendsAfter = after.every((s) => me !== null && known[s] === me);
  const wins = (id) => trickWinner([...trick, { seat, card: id }], r, { last: state.tricks.length + 1 === state.size }) === trick.length;
  const winners = legal.filter(wins);
  const losers = legal.filter((id) => !wins(id));
  const pot = trick.reduce((n, p) => n + augen(p.card), 0);
  // A card that no card still out there beats (counting every higher trump not yet seen).
  const sure = (id) => {
    if (r.cls(id) !== 'trump') return r.cls(trick[0].card) === r.cls(id) && !anyHigher(id, r, out) && !trumpsOut(r, out, hand, played);
    return !anyHigher(id, r, out);
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

/** Whether any card still out there (not in this hand, not played) ranks above `id` in its class. */
function anyHigher(id, r, out) {
  const cls = r.cls(id);
  for (const s of ['c', 's', 'h', 'd']) {
    for (const rk of ['9', '10', 'J', 'Q', 'K', 'A']) {
      const x = `${s}-${rk}`;
      if (r.cls(x) === cls && r.rank(x) > r.rank(id) && out(x) > 0) return true;
    }
  }
  return false;
}

/** Whether trumps are still out there (anyone else might trump in). */
function trumpsOut(r, out) {
  for (const s of ['c', 's', 'h', 'd']) for (const rk of ['9', '10', 'J', 'Q', 'K', 'A']) if (r.cls(`${s}-${rk}`) === 'trump' && out(`${s}-${rk}`) > 0) return true;
  return false;
}

function lead(state, seat, hand, legal, r, me, played, cheapest, out) {
  const c = /** @type {NonNullable<State['contract']>} */ (state.contract);
  const lone = c.soloist === seat && (c.kind === 'solo' || c.kind === 'silent' || c.alone);
  if (lone) {
    // A soloist: a trump nothing out there beats first, then a fresh Ass, then a low trump to draw theirs.
    const trumps = legal.filter((id) => r.cls(id) === 'trump').sort((a, b) => r.rank(b) - r.rank(a));
    const sureTrump = trumps.find((id) => !anyHigher(id, r, out));
    if (sureTrump && trumpsOut(r, out)) return sureTrump;
    const freshAce = legal.find((id) => r.cls(id) !== 'trump' && parseCard(id).r === 'A' && !state.tricks.some((t) => r.cls(t.cards[0].card) === r.cls(id)));
    if (freshAce) return freshAce;
    if (trumps.length && trumpsOut(r, out)) return trumps[trumps.length - 1];
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
    // Pull trumps: the highest when it's sure to hold, else a middling one.
    const sorted = [...trumps].sort((a, b) => r.rank(b) - r.rank(a));
    return sorted[Math.min(1, sorted.length - 1)];
  }
  // Otherwise a plain card from the longest plain suit, low.
  const plain = legal.filter((id) => r.cls(id) !== 'trump' && id !== 'd-A');
  if (plain.length) {
    const len = (id) => hand.filter((x) => r.cls(x) === r.cls(id)).length;
    return [...plain].sort((a, b) => len(b) - len(a) || augen(a) - augen(b))[0];
  }
  return cheapest(legal.filter((id) => id !== 'd-A').length ? legal.filter((id) => id !== 'd-A') : legal);
}

export { moves };
