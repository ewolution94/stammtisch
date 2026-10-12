// A Skat bot: legal and sensible, deterministic. It knows only what its seat may know: its hand,
// the cards played, the contract and who declared (and, as declarer, what it put in the Skat).
//   - bids up to what its best game is worth with its own ten cards (matadors without the Skat);
//   - as declarer: picks up the Skat, puts away points and short suits, declares the game that
//     reaches the bid, pulls trumps, then cashes its Asse;
//   - as a defender: leads Asse, lets its partner's sure trick run and "schmiert" it, takes the
//     declarer's tricks as cheaply as it can;
//   - Null: the declarer stays under, the defenders try to make it take one; Ramsch: shed the points.

import { augen, parseCard } from '../core/cards.mjs';
import { trickWinner } from '../core/tricks.mjs';
import { BASE, BIDS, GAMES, legalCards, matadors, mayKontra, moves, ranking, trumpLine } from '../games/skat.mjs';

/** @typedef {import('../games/skat.mjs').State} State */

const SUITS = ['c', 's', 'h', 'd'];
const JACKS = ['c-J', 's-J', 'h-J', 'd-J'];
const of = (cards, s) => cards.filter((id) => !JACKS.includes(id) && parseCard(id).s === s);

/**
 * How playable each game is with these cards, and what it's worth (matadors counted on these cards
 * only, so the bot never counts on the Skat). Null scores by how safe each suit is.
 * @param {string[]} cards
 */
export function appraise(cards) {
  /** @type {{ game: string, ok: boolean, value: number, strength: number }[]} */
  const out = [];
  const jacks = cards.filter((id) => JACKS.includes(id)).length;
  const highJacks = cards.filter((id) => id === 'c-J' || id === 's-J').length;
  const sideAces = (trump) => SUITS.filter((s) => s !== trump && of(cards, s).some((id) => parseCard(id).r === 'A')).length;
  for (const game of ['d', 'h', 's', 'c']) {
    const trumps = jacks + of(cards, game).length;
    const strength = trumps * 2 + highJacks + sideAces(game) * 1.5 + (of(cards, game).some((id) => parseCard(id).r === 'A') ? 1 : 0);
    // Five trumps with some top, or six of any kind (the usual minimum for a suit game).
    const ok = (trumps >= 5 && strength >= 12) || trumps >= 6;
    out.push({ game, ok, value: BASE[game] * (matadors(cards, game).n + 1), strength });
  }
  const aces = sideAces(null);
  const grandStrength = jacks * 3 + highJacks * 2 + aces * 2 + SUITS.filter((s) => of(cards, s).length >= 4).length * 2;
  out.push({ game: 'grand', ok: (jacks >= 3 && aces >= 2) || (jacks === 4 && aces >= 1) || grandStrength >= 18, value: BASE.grand * (matadors(cards, 'grand').n + 1), strength: grandStrength });
  // Null: each suit is safe when its cards are low and its seven is there (or the suit is void).
  const NULL_RANK = { 7: 0, 8: 1, 9: 2, 10: 3, J: 4, Q: 5, K: 6, A: 7 };
  const risk = SUITS.reduce((n, s) => {
    const suit = cards.filter((id) => parseCard(id).s === s).map((id) => NULL_RANK[parseCard(id).r]).sort((a, b) => a - b);
    // Each card should be no higher than twice its place in the suit: 7, 8/9, 9/10/J …
    return n + suit.reduce((r, v, i) => r + Math.max(0, v - 2 * i), 0);
  }, 0);
  out.push({ game: 'null', ok: risk <= 1, value: 23, strength: 10 - risk });
  return out;
}

/** The highest value the bot will bid to: its best playable game. */
function maxBid(cards) {
  const ok = appraise(cards).filter((g) => g.ok);
  return ok.length ? Math.max(...ok.map((g) => g.value)) : 0;
}

/**
 * The bot's move for `seat`.
 * @param {State} s  @param {number} seat
 */
export function botMove(s, seat) {
  const hand = s.hands[seat];
  switch (s.phase) {
    case 'bid': {
      const top = maxBid(hand);
      if (s.bidding.awaiting === 'answer') return s.bid <= top ? { type: 'hold' } : { type: 'pass' };
      const next = BIDS.find((v) => v > s.bid);
      return next !== undefined && next <= top ? { type: 'bid', value: next } : { type: 'pass' };
    }
    case 'skat':
      return { type: 'take' };
    case 'discard':
      return { type: 'discard', cards: discardFor(hand, s.bid) };
    case 'declare':
      return { type: 'declare', game: chooseGame(hand, s.bid, s.took), schneider: false, schwarz: false, ouvert: false };
    case 'play': {
      if (mayKontra(s, seat) && kontraWorth(s, seat)) return { type: 'kontra' };
      return { type: 'play', card: playFor(s, seat, hand) };
    }
    default:
      throw new Error('nothing to do');
  }
}

/** The game to declare: the playable one worth the most that reaches the bid; else the strongest. */
function chooseGame(hand, bid) {
  const games = appraise(hand);
  const reach = games.filter((g) => g.ok && (g.game === 'null' ? g.value >= bid : g.value >= bid));
  const pool = reach.length ? reach : games.filter((g) => g.game !== 'null' || g.ok);
  pool.sort((a, b) => b.strength - a.strength || b.value - a.value);
  return pool[0]?.game ?? 'grand';
}

/** Two cards back: for Null the two most dangerous; else points and short suits, never a trump or an Ass. */
function discardFor(hand, bid) {
  const game = chooseGame(hand, bid);
  if (game === 'null') {
    const NULL_RANK = { 7: 0, 8: 1, 9: 2, 10: 3, J: 4, Q: 5, K: 6, A: 7 };
    return [...hand].sort((a, b) => NULL_RANK[parseCard(b).r] - NULL_RANK[parseCard(a).r]).slice(0, 2);
  }
  const r = ranking(game);
  const plain = hand.filter((id) => r.cls(id) !== 'trump');
  const pool = plain.length >= 2 ? plain : [...hand].sort((a, b) => r.rank(a) - r.rank(b)).slice(0, 4);
  let best = [pool[0], pool[1]];
  let bestScore = -Infinity;
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const pair = [pool[i], pool[j]];
      let score = augen(pair[0]) + augen(pair[1]);
      for (const id of pair) {
        const suit = r.cls(id);
        const left = plain.filter((x) => r.cls(x) === suit && !pair.includes(x));
        if (parseCard(id).r === 'A') score -= 25;
        if (!left.length) score += 12;
        // A ten with no Ass beside it is easily lost: better in the Skat.
        if (parseCard(id).r === '10' && !left.some((x) => parseCard(x).r === 'A')) score += 6;
        if (r.cls(id) === 'trump') score -= 30;
      }
      if (score > bestScore) {
        bestScore = score;
        best = pair;
      }
    }
  }
  return best;
}

/** Kontra (house rule): a defender with three Unter, or four trumps and two Asse. */
function kontraWorth(s, seat) {
  const r = ranking(/** @type {string} */ (s.contract?.game));
  if (s.contract?.game === 'null') return false;
  const hand = s.hands[seat];
  const trumps = hand.filter((id) => r.cls(id) === 'trump');
  return trumps.filter((id) => JACKS.includes(id)).length >= 3 || (trumps.length >= 4 && hand.filter((id) => parseCard(id).r === 'A').length >= 2);
}

// ---- play ------------------------------------------------------------------------------------------------

function playFor(s, seat, hand) {
  const legal = legalCards(s, seat);
  if (legal.length === 1) return legal[0];
  const c = /** @type {NonNullable<State['contract']>} */ (s.contract);
  const game = c.game === 'ramsch' ? 'grand' : c.game;
  const r = ranking(game);
  const trick = s.trick.cards;
  const wins = (id) => trickWinner([...trick, { seat, card: id }], r) === trick.length;
  const winners = legal.filter(wins);
  const losers = legal.filter((id) => !wins(id));
  const cheap = (a, b) => augen(a) - augen(b) || r.rank(a) - r.rank(b);
  const cheapest = (cards) => [...cards].sort(cheap)[0];
  const highest = (cards) => [...cards].sort((a, b) => r.rank(b) - r.rank(a))[0];
  const last = trick.length === 2;

  if (c.game === 'null') return playNull(s, seat, legal, winners, losers, r, cheapest, highest);
  if (c.game === 'ramsch') {
    // Shed points: the highest card that loses; forced to win, the cheapest winner.
    if (losers.length) return [...losers].sort((a, b) => augen(b) - augen(a) || r.rank(b) - r.rank(a))[0];
    return cheapest(winners);
  }

  const declarer = /** @type {number} */ (s.declarer);
  const played = s.tricks.flatMap((t) => t.cards.map((p) => p.card)).concat(trick.map((p) => p.card));
  const known = new Set([...hand, ...played, ...(seat === declarer ? s.put : [])]);
  const trumpsOut = trumpLine(game).filter((id) => !known.has(id)).length;

  if (!trick.length) {
    const trumps = legal.filter((id) => r.cls(id) === 'trump');
    if (seat === declarer) {
      // Pull trumps while the defenders may still hold some, from the top.
      if (trumps.length && trumpsOut > 0) return highest(trumps);
      const aces = legal.filter((id) => r.cls(id) !== 'trump' && parseCard(id).r === 'A');
      if (aces.length) return aces[0];
      return cheapest(legal);
    }
    // A defender: an Ass first; else a low card of a long suit (so the partner can take it).
    const aces = legal.filter((id) => r.cls(id) !== 'trump' && parseCard(id).r === 'A');
    if (aces.length) return aces[0];
    const plain = legal.filter((id) => r.cls(id) !== 'trump');
    if (plain.length) {
      const len = (id) => plain.filter((x) => r.cls(x) === r.cls(id)).length;
      return [...plain].sort((a, b) => len(b) - len(a) || cheap(a, b))[0];
    }
    return cheapest(legal);
  }

  const at = trickWinner(trick, r);
  const leader = trick[at].seat;
  const friend = seat !== declarer && leader !== declarer;
  // Whether the declarer still plays after this card.
  const declarerAfter = !last && trick.every((p) => p.seat !== declarer) && seat !== declarer;
  if (friend && !declarerAfter) {
    // The partner has it and the declarer has played: put the fattest card that won't take it over.
    const fat = losers.length ? losers : legal;
    return [...fat].sort((a, b) => augen(b) - augen(a) || r.rank(a) - r.rank(b))[0];
  }
  if (winners.length && !friend) {
    const pot = trick.reduce((n, p) => n + augen(p.card), 0);
    if (last || pot >= 10 || seat === declarer) return cheapest(winners);
    const strong = winners.filter((id) => r.cls(id) === 'trump' || parseCard(id).r === 'A');
    if (strong.length) return cheapest(strong);
  }
  return cheapest(losers.length ? losers : legal);
}

function playNull(s, seat, legal, winners, losers, r, cheapest, highest) {
  const declarer = s.declarer;
  const trick = s.trick.cards;
  if (seat === declarer) {
    // Stay under: the highest card that loses; when every card would win, the lowest.
    if (losers.length) return highest(losers);
    return [...legal].sort((a, b) => r.rank(a) - r.rank(b))[0];
  }
  if (!trick.length) return [...legal].sort((a, b) => r.rank(a) - r.rank(b))[0];
  const at = trickWinner(trick, r);
  const declarerWinning = trick[at].seat === declarer;
  // The declarer is winning: stay under him. Otherwise go low, so he may have to go over.
  if (declarerWinning && losers.length) return highest(losers);
  return [...legal].sort((a, b) => r.rank(a) - r.rank(b))[0];
}

export { moves, GAMES };
