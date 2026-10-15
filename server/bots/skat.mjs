// A Skat bot in three ranks (server/bots/rank.mjs). It knows only what its seat may know: its hand,
// the cards played, the contract and who declared (as declarer, what it put in the Skat; an Ouvert
// declarer's open hand). The journeyman:
//   - bids up to what its best game is worth with its own ten cards (matadors without the Skat);
//   - as declarer: picks up the Skat, puts away points and short suits, declares the game it planned
//     the discard for (both chosen on the same twelve cards), pulls trumps, then cashes its Asse;
//   - as a defender: leads Asse, lets its partner's sure trick run and "schmiert" it, takes the
//     declarer's tricks as cheaply as it can; says Kontra (house rule) with three Unter or four trumps
//     and two Asse, and as declarer answers it with Re on a hand that strong;
//   - Null: the declarer stays under, the defenders try to make it take one; Ramsch: shed the points.
// The apprentice misjudges its hand by a step now and then, doesn't count the trumps out, and every
// other move puts the wrong one of two cards that do the same job (never an Unter or an Ass). The
// master bids, picks its game and plays its cards by trying them in many deals of the cards it can't
// see. A temperament leans how weak a game it will bid on.

import { augen, makeDeck, parseCard } from '../core/cards.mjs';
import { trickWinner } from '../core/tricks.mjs';
import { BASE, BIDS, GAMES, act, deal, legalCards, matadors, mayKontra, mayRe, moves, nullValue, ranking, trumpLine } from '../games/skat.mjs';
import { dealOut, search, seeded, stopAt, trials, without } from './rank.mjs';

/** @typedef {import('../games/skat.mjs').State} State */
/** @typedef {import('./rank.mjs').Style} Style */

const SUITS = ['c', 's', 'h', 'd'];
const JACKS = ['c-J', 's-J', 'h-J', 'd-J'];
const DECK = makeDeck('skat');
const of = (cards, s) => cards.filter((id) => !JACKS.includes(id) && parseCard(id).s === s);
/**
 * How far a temperament moves the hand a game needs (in trumps), and the master's odds: to bid a game
 * (as the journeyman would play it out: the master plays it better, and wins about four in five of
 * the games it bids on these), and to say Kontra.
 */
const LEAN = { cautious: -1, steady: 0, bold: 1 };
const ODDS = { cautious: 0.5, steady: 0.42, bold: 0.35 };
const KONTRA = { cautious: 0.65, steady: 0.6, bold: 0.55 };
const NULL_RANK = { 7: 0, 8: 1, 9: 2, 10: 3, J: 4, Q: 5, K: 6, A: 7 };

/**
 * How playable each game is with these cards, and what it's worth (matadors counted on these cards
 * only, so the bot never counts on the Skat; one level more for a Hand game). Null scores by how safe
 * each suit is. `lean`: a bold bot plays a trump shorter, a cautious one a trump longer.
 * @param {string[]} cards  @param {number} [lean]  @param {boolean} [hand]
 */
export function appraise(cards, lean = 0, hand = false) {
  /** @type {{ game: string, ok: boolean, value: number, strength: number }[]} */
  const out = [];
  const jacks = cards.filter((id) => JACKS.includes(id)).length;
  const highJacks = cards.filter((id) => id === 'c-J' || id === 's-J').length;
  const sideAces = (trump) => SUITS.filter((s) => s !== trump && of(cards, s).some((id) => parseCard(id).r === 'A')).length;
  const extra = hand ? 1 : 0;
  for (const game of ['d', 'h', 's', 'c']) {
    const trumps = jacks + of(cards, game).length;
    const strength = trumps * 2 + highJacks + sideAces(game) * 1.5 + (of(cards, game).some((id) => parseCard(id).r === 'A') ? 1 : 0);
    // Five trumps with some top, or six of any kind (the usual minimum for a suit game).
    const ok = (trumps >= 5 - lean && strength >= 12 - 2 * lean) || trumps >= 6 - lean;
    out.push({ game, ok, value: BASE[game] * (matadors(cards, game).n + 1 + extra), strength });
  }
  const aces = sideAces(null);
  const grandStrength = jacks * 3 + highJacks * 2 + aces * 2 + SUITS.filter((s) => of(cards, s).length >= 4).length * 2;
  out.push({ game: 'grand', ok: (jacks >= 3 && aces >= 2 - lean) || (jacks === 4 && aces >= 1) || grandStrength >= 18 - 2 * lean, value: BASE.grand * (matadors(cards, 'grand').n + 1 + extra), strength: grandStrength });
  // Null: each suit is safe when its cards are low and its seven is there (or the suit is void).
  const risk = SUITS.reduce((n, s) => {
    const suit = cards.filter((id) => parseCard(id).s === s).map((id) => NULL_RANK[parseCard(id).r]).sort((a, b) => a - b);
    // Each card should be no higher than twice its place in the suit: 7, 8/9, 9/10/J …
    return n + suit.reduce((r, v, i) => r + Math.max(0, v - 2 * i), 0);
  }, 0);
  out.push({ game: 'null', ok: risk <= 1 + lean, value: nullValue(hand, false), strength: 10 - risk });
  return out;
}

/** The highest value the bot will bid to: its best playable game. */
function maxBid(cards, lean) {
  const ok = appraise(cards, lean).filter((g) => g.ok);
  return ok.length ? Math.max(...ok.map((g) => g.value)) : 0;
}

/**
 * The bot's move for `seat`.
 * @param {State} s  @param {number} seat  @param {Style} [style]
 */
export function botMove(s, seat, { level = 'journeyman', temper = 'steady' } = {}) {
  const hand = s.hands[seat];
  const lean = LEAN[temper] ?? 0;
  switch (s.phase) {
    case 'bid': {
      const top = level === 'master' ? masterLimit(s, seat, temper) : maxBid(hand, level === 'apprentice' ? gut(s, seat) + lean : lean);
      if (s.bidding.awaiting === 'answer') return s.bid <= top ? { type: 'hold' } : { type: 'pass' };
      const next = s.bidding.stage === 3 ? 18 : BIDS.find((v) => v > s.bid);
      return next !== undefined && next <= top ? { type: 'bid', value: next } : { type: 'pass' };
    }
    case 'skat':
      return { type: 'take' };
    case 'discard':
      return { type: 'discard', cards: level === 'master' ? masterPlan(s, seat, hand).discard : discardFor(hand, chooseGame(hand, s.bid, true, lean)) };
    case 'declare': {
      // The game is chosen on the twelve cards the discard was chosen on: the hand and what went back.
      const cards = s.took ? [...hand, ...s.put] : hand;
      const plan = level === 'master' && s.took ? masterPlan(s, seat, cards) : null;
      const same = plan !== null && [...plan.discard].sort().join() === [...s.put].sort().join();
      const game = plan && same ? plan.game : chooseGame(cards, s.bid, s.took, lean);
      return { type: 'declare', game, schneider: false, schwarz: false, ouvert: false };
    }
    case 'play': {
      if (mayRe(s, seat) && (level === 'master' ? masterOdds(s, seat) >= 0.75 : strongHand(s, seat, lean))) return { type: 're' };
      if (mayKontra(s, seat) && (level === 'master' ? 1 - masterOdds(s, seat) >= (KONTRA[temper] ?? KONTRA.steady) : strongHand(s, seat, lean))) return { type: 'kontra' };
      if (level === 'master') return { type: 'play', card: masterCard(s, seat) };
      const card = playFor(s, seat, hand, level !== 'apprentice');
      return { type: 'play', card: level === 'apprentice' ? slip(s, seat, card) : card };
    }
    default:
      throw new Error('nothing to do');
  }
}

/** An apprentice's misjudging of its hand, the same all deal: a trump either way now and then. */
function gut(s, seat) {
  const r = seeded(`gut|${s.dealer}|${seat}|${[...s.hands[seat]].sort().join(',')}`);
  return Math.round((r() + r() - 1) * 1.5);
}

/**
 * The game to declare: the playable one worth the most that reaches the bid; else the strongest.
 * `took`: false for a Hand game (one level more).
 */
function chooseGame(cards, bid, took, lean = 0) {
  const games = appraise(cards, lean, !took);
  const reach = games.filter((g) => g.ok && g.value >= bid);
  const pool = reach.length ? reach : games.filter((g) => g.game !== 'null' || g.ok);
  pool.sort((a, b) => b.strength - a.strength || b.value - a.value);
  return pool[0]?.game ?? 'grand';
}

/** Two cards back for `game`: for Null the two most dangerous; else points and short suits, never a trump or an Ass. */
function discardFor(hand, game) {
  if (game === 'null') return [...hand].sort((a, b) => NULL_RANK[parseCard(b).r] - NULL_RANK[parseCard(a).r]).slice(0, 2);
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

/** Kontra (a defender) or Re (the declarer), house rule: three Unter, or four trumps and two Asse (a bold bot one trump fewer). */
function strongHand(s, seat, lean) {
  if (s.contract?.game === 'null') return false;
  const r = ranking(/** @type {string} */ (s.contract?.game));
  const hand = s.hands[seat];
  const trumps = hand.filter((id) => r.cls(id) === 'trump');
  const aces = hand.filter((id) => parseCard(id).r === 'A').length;
  if (seat === s.declarer) return trumps.filter((id) => JACKS.includes(id)).length >= 3 || trumps.length >= 7 - lean;
  return trumps.filter((id) => JACKS.includes(id)).length >= 3 || (trumps.length >= 4 - lean && aces >= 2);
}

// ---- play ------------------------------------------------------------------------------------------------

/**
 * The rules' card. `counting`: remember what's been played, so the declarer pulls trumps only while
 * some are still out (a journeyman's; an apprentice pulls them until it has none).
 */
function playFor(s, seat, hand, counting = true) {
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

  if (c.game === 'null') return playNull(s, seat, legal, losers, r, highest);
  if (c.game === 'ramsch') {
    // Shed points: the highest card that loses; forced to win, the cheapest winner.
    if (losers.length) return [...losers].sort((a, b) => augen(b) - augen(a) || r.rank(b) - r.rank(a))[0];
    return cheapest(winners);
  }

  const declarer = /** @type {number} */ (s.declarer);
  const played = s.tricks.flatMap((t) => t.cards.map((p) => p.card)).concat(trick.map((p) => p.card));
  const known = new Set([...hand, ...played, ...(seat === declarer ? s.put : [])]);
  const trumpsOut = counting ? trumpLine(game).filter((id) => !known.has(id)).length : 1;

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

function playNull(s, seat, legal, losers, r, highest) {
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

/**
 * An apprentice's slip, every other move: the wrong one of two cards that do the same job (it takes
 * the trick if the rules' card does, loses it if that loses), never an Unter or an Ass, never in Null
 * and never on the lead.
 */
function slip(s, seat, card) {
  const trick = s.trick.cards;
  const c = /** @type {NonNullable<State['contract']>} */ (s.contract);
  if (!trick.length || c.game === 'null') return card;
  const r = seeded(`slip|${key(s, seat)}`);
  if (r() >= 0.5) return card;
  const keep = (id) => JACKS.includes(id) || parseCard(id).r === 'A';
  if (keep(card)) return card;
  const rk = ranking(c.game === 'ramsch' ? 'grand' : c.game);
  const wins = (id) => trickWinner([...trick, { seat, card: id }], rk) === trick.length;
  const same = wins(card);
  const like = legalCards(s, seat).filter((id) => id !== card && !keep(id) && wins(id) === same);
  return like.length ? like[Math.floor(r() * like.length)] : card;
}

// ---- the master: many deals, played to the end -------------------------------------------------

/** What `seat` sees, as a key for its random draws: its hand, the bidding, the tricks. Nothing hidden. */
function key(s, seat) {
  const tricks = [...s.tricks, s.trick].map((t) => t.cards.map((p) => `${p.seat}${p.card}`).join('.')).join('/');
  return `${s.dealer}|${seat}|${s.hands[seat].join(',')}|${s.bid}|${s.declarer}|${s.contract?.game ?? '-'}|${seat === s.declarer ? s.put.join(',') : ''}|${tricks}`;
}

/** A few answers kept, so a bid or a plan isn't worked out twice (the same position gives the same one anyway). */
const memo = new Map();
function remember(k, make) {
  if (memo.has(k)) return memo.get(k);
  const v = make();
  memo.set(k, v);
  if (memo.size > 200) memo.delete(/** @type {string} */ (memo.keys().next().value));
  return v;
}

/**
 * A fresh deal as it could be from `seat`'s ten cards: the other twenty-two dealt to the others and
 * the Skat (the bidding says nothing the bot uses), at the same seats, with `bid` said and `seat` the
 * declarer about to take the Skat.
 */
function freshWorld(s, seat, r, bid) {
  const others = [0, 1, 2].filter((p) => p !== seat);
  const need = new Map([...others.map((p) => [p, 10]), [-1, 2]]);
  const { hands } = dealOut(without(DECK, s.hands[seat]), need, () => true, r);
  const w = deal({ dealer: s.dealer, rules: s.rules, hands: [0, 1, 2].map((p) => (p === seat ? [...s.hands[seat]] : /** @type {string[]} */ (hands.get(p)))), skat: /** @type {string[]} */ (hands.get(-1)) });
  Object.assign(w, { phase: 'skat', turn: seat, declarer: seat, bid });
  w.bidding.awaiting = 'say';
  return w;
}

/** A Skat game played to the end from a world where `seat` declares `game`: what it brought `seat`. */
function declareAndPlay(w, seat, game, discard) {
  const s = structuredClone(w);
  if (s.phase === 'skat') act(s, seat, { type: 'take' });
  if (s.phase === 'discard') act(s, seat, { type: 'discard', cards: discard ?? discardFor(s.hands[seat], game) });
  act(s, seat, { type: 'declare', game, schneider: false, schwarz: false, ouvert: false });
  return finish(s);
}

/**
 * The master's limit: for each game its ten cards could carry, how often it's won when the Skat is
 * picked up and the game played out with the journeyman's rules; it bids to the best value whose
 * odds are good enough for its temperament.
 */
function masterLimit(s, seat, temper) {
  const hand = s.hands[seat];
  return remember(`limit|${s.dealer}|${seat}|${[...hand].sort().join(',')}|${temper}`, () => {
    const games = appraise(hand, 2).filter((g) => g.ok).sort((a, b) => b.strength - a.strength).slice(0, 4);
    if (!games.length) return 0;
    const r = seeded(`limit|${key(s, seat)}`);
    const won = games.map(() => 0);
    let n = 0;
    const until = stopAt(0.9);
    for (let d = 0, most = trials(30 * games.length, 40); d < most; d++) {
      const w = freshWorld(s, seat, r, 18);
      games.forEach((g, i) => {
        w.bid = g.value;
        if (declareAndPlay(w, seat, g.game).result.won) won[i] += 1;
      });
      n += 1;
      if (Date.now() > until) break;
    }
    const good = games.filter((_, i) => won[i] / n >= (ODDS[temper] ?? ODDS.steady));
    return good.length ? Math.max(...good.map((g) => g.value)) : 0;
  });
}

/**
 * The master's game and discard, chosen together on its twelve cards: for each game that reaches the
 * bid, its discard, tried in many deals of the twenty cards it can't see; the best average score wins.
 */
function masterPlan(s, seat, cards) {
  return remember(`plan|${s.dealer}|${seat}|${[...cards].sort().join(',')}|${s.bid}`, () => {
    const games = appraise(cards, 2)
      .filter((g) => g.value >= s.bid && (g.ok || g.game !== 'null'))
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 4);
    const options = (games.length ? games : appraise(cards).sort((a, b) => b.value - a.value).slice(0, 1)).map((g) => ({ game: g.game, discard: discardFor(cards, g.game) }));
    const r = seeded(`plan|${s.dealer}|${seat}|${[...cards].sort().join(',')}|${s.bid}`);
    return search({
      choices: options,
      deals: trials(30 * options.length, 40),
      r,
      same: (a, b) => a.game === b.game,
      imagine: (r) => planWorld(s, seat, cards, r),
      trial: (w, o) => worth(declareAndPlay(w, seat, o.game, o.discard), seat),
    });
  });
}

/**
 * A deal as it could be once `seat` has picked up the Skat: its twelve cards in hand, the other twenty
 * dealt to the others, about to put two back.
 */
function planWorld(s, seat, cards, r) {
  const others = [0, 1, 2].filter((p) => p !== seat);
  const { hands } = dealOut(without(DECK, cards), new Map(others.map((p) => [p, 10])), () => true, r);
  // deal() wants ten each and a Skat: the twelve split so, then all twelve in hand.
  const w = deal({ dealer: s.dealer, rules: s.rules, hands: [0, 1, 2].map((p) => (p === seat ? cards.slice(0, 10) : /** @type {string[]} */ (hands.get(p)))), skat: cards.slice(10) });
  w.hands[seat] = [...cards];
  w.skat = [];
  Object.assign(w, { phase: 'discard', turn: seat, declarer: seat, bid: s.bid, took: true });
  return w;
}

/** How often the declarer wins from here, tried in many deals of the cards `seat` can't see. */
function masterOdds(s, seat) {
  const r = seeded(`odds|${key(s, seat)}`);
  let won = 0, n = 0;
  const until = stopAt(0.4);
  const left = s.hands.reduce((n, h) => n + h.length, 0);
  for (let d = 0, most = trials(left, 40); d < most; d++) {
    if (finish(structuredClone(imagine(s, seat, r))).result.won) won += 1;
    n += 1;
    if (Date.now() > until) break;
  }
  return won / n;
}

/** The master's card: each legal card tried in many deals of the cards it can't see. */
function masterCard(s, seat) {
  const choices = legalCards(s, seat);
  if (choices.length === 1) return choices[0];
  const left = s.hands.reduce((n, h) => n + h.length, 0);
  return search({
    choices,
    prefer: playFor(s, seat, s.hands[seat]),
    deals: trials(choices.length * left, 120),
    r: seeded(`card|${key(s, seat)}`),
    imagine: (r) => imagine(s, seat, r),
    trial: (w, card) => {
      const t = structuredClone(w);
      act(t, seat, { type: 'play', card });
      return worth(finish(t), seat);
    },
  });
}

/** What a finished deal brought `seat`: the declarer its score, a defender the declarer's loss; its side's Augen break a tie. */
function worth(s, seat) {
  const res = s.result;
  if (res.ramsch) return res.points[seat] - res.augen[seat] / 1000;
  const d = res.declarer;
  const points = seat === d ? res.points[d] : -res.points[d];
  const side = s.tricks.filter((t) => (seat === d ? t.winner === d : t.winner !== d)).reduce((n, t) => n + t.augen, 0);
  return points + side / 1000;
}

/** The deal played to the end with the journeyman's rules for everyone. */
function finish(s) {
  while (s.phase === 'play') {
    const t = s.turn;
    const legal = legalCards(s, t);
    act(s, t, { type: 'play', card: legal.length === 1 ? legal[0] : playFor(s, t, s.hands[t]) });
  }
  return s;
}

/**
 * One way the deal could stand, as `seat` sees it: the cards it can't see dealt to the others and the
 * Skat (no card of a class someone couldn't follow; an Ouvert declarer's hand as it lies open; what
 * the declarer put back, for the declarer itself). Nothing else is taken from the real deal but what
 * everyone at the table knows.
 * @param {State} s  @param {number} seat  @param {() => number} r
 */
export function imagine(s, seat, r) {
  const c = /** @type {NonNullable<State['contract']>} */ (s.contract);
  const rk = ranking(c.game === 'ramsch' ? 'grand' : c.game);
  const d = s.declarer;
  const plays = [...s.tricks, s.trick].flatMap((t) => t.cards);
  const open = c.ouvert && d !== null && d !== seat ? s.hands[d] : [];
  const mine = seat === d && s.took ? s.put : [];
  const unseen = without(DECK, [...s.hands[seat], ...plays.map((p) => p.card), ...open, ...mine]);
  /** @type {Map<number, Set<string>>} */
  const voids = new Map();
  for (const t of [...s.tricks, s.trick]) {
    const led = t.cards.length ? rk.cls(t.cards[0].card) : null;
    for (const p of t.cards.slice(1)) {
      if (rk.cls(p.card) !== led) {
        if (!voids.has(p.seat)) voids.set(p.seat, new Set());
        /** @type {Set<string>} */ (voids.get(p.seat)).add(/** @type {string} */ (led));
      }
    }
  }
  // The others' hands, and the Skat as a seat of its own (-1): the two put back, or the untouched Skat.
  const need = new Map([0, 1, 2].filter((p) => p !== seat && !(open.length && p === d)).map((p) => [p, s.hands[p].length]));
  if (!mine.length) need.set(-1, 2);
  const { hands } = dealOut(unseen, need, (p, id) => p < 0 || !voids.get(p)?.has(rk.cls(id)), r);
  const w = structuredClone(s);
  for (const [p, h] of hands) if (p >= 0) w.hands[p] = h;
  const skat = hands.get(-1);
  if (skat) {
    if (s.took) w.put = skat;
    else w.skat = skat;
  }
  return w;
}

export { moves, GAMES };
