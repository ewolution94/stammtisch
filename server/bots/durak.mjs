// A Durak bot: legal and sensible, deterministic. It looks only at its own hand and the table:
//   - leads its lowest plain card (a pair of the same rank first, to throw the second in), trumps last;
//   - throws in cheap plain cards of the ranks on the table, never a trump or a high card while the
//     stock lasts;
//   - defends with the cheapest card that beats each attack, plain before trump; when that would
//     cost a high trump early, or nothing beats, it takes;
//   - passes the attack on (transfer, a house rule) with a cheap card of its rank.

import { parseCard } from '../core/cards.mjs';
import { attackCards, beatOptions, moves, transferCards } from '../games/durak.mjs';

/** @typedef {import('../games/durak.mjs').State} State */

const ORDER = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const rank = (id) => ORDER.indexOf(parseCard(id).r);

/**
 * The bot's move for `seat` (whose turn it is).
 * @param {State} s  @param {number} seat
 */
export function botMove(s, seat) {
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
    if (options.length) {
      const { at, cards } = options[0];
      if (!cards.length) return { type: 'take' };
      const card = cheapest(cards);
      // A high trump spent early on a low plain card isn't worth it: take instead (while more
      // than a couple of cards are on the table, taking costs too much).
      if (!late && isTrump(card) && rank(card) >= 6 && !isTrump(s.table[at].attack) && s.table.length <= 2) return { type: 'take' };
      return { type: 'beat', card, at };
    }
    return { type: 'take' };
  }

  const throwable = attackCards(s, seat);
  if (!s.table.length) {
    // Lead: a plain card that has a twin (to throw the second in), else the lowest plain card.
    const plain = hand.filter((id) => !isTrump(id));
    const pool = plain.length ? plain : hand;
    const twin = pool.filter((id) => pool.some((o) => o !== id && parseCard(o).r === parseCard(id).r));
    return { type: 'attack', card: cheapest(twin.length ? twin : pool) };
  }
  // Throw in: cheap plain cards (high ones and trumps only once the stock is gone), else done.
  const ok = throwable.filter((id) => late || (!isTrump(id) && rank(id) <= 5) || s.taking);
  if (ok.length && moves(s, seat).some((m) => m.type === 'attack')) return { type: 'attack', card: cheapest(ok) };
  if (moves(s, seat).some((m) => m.type === 'pass')) return { type: 'pass' };
  // Nothing sensible and no pass offered (the attack still needs a lead): the cheapest legal card.
  const any = moves(s, seat)[0];
  return any ?? { type: 'pass' };
}
