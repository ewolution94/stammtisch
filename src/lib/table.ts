// Where things are around the table, from your own seat: you sit at the bottom, and play goes on to
// your left, across the top, and round to your right (clockwise, as at a real table). Seats here are
// the deal's own (the game's seats, the dealer's left first); a watcher, or the dealer sitting a deal
// out, sees it from the first seat. From Stichle's src/lib/table.ts.

import { cardTwist, pileCardWidth, placeOf as kitPlaceOf, seatAngle, stackPlace, sweepTo, trickSlot } from '../../vendor/ewo/elements/card-pile.js';

let uid = 0;
/** A fresh id for one drawn card, so its foil gradients never clash with another card's. */
export const nextUid = () => ++uid;

/** The seat at the bottom of this page's table. */
export const homeSeat = (mine: number) => (mine >= 0 ? mine : 0);

// The table's geometry comes from Folio's card kit (vendor/ewo/elements/card-pile.js), under the names
// the components use.

/** A seat's place: 0 is you, then 1, 2 … in the order play goes. */
export const placeOf = (seat: number, mine: number, n: number) => kitPlaceOf(seat, homeSeat(mine), n);

/** The direction a seat sits in, in degrees (0 = right, 90 = down): you at 90, the others from the left over the top to the right. */
export const angleOf = (seat: number, mine: number, n: number) => seatAngle(seat, mine, n);

/** A steady twist for a card on the pile (from its id, so every page agrees), so a trick looks dropped. */
export const twist = (card: string, seat: number) => cardTwist(card, seat).toFixed(1);

/** How big a card is on the pile in the middle, for a trick area of w × h px. */
export const trickCardWidth = (w: number, h: number, cap?: number) => pileCardWidth(w, h, cap);

/** Where a seat's card lies on the pile, from the area's centre (nudged a third of a card towards its seat). */
export const slotOffset = (angle: number, cardWidth: number) => trickSlot(angle, cardWidth);

/** Off the table towards a seat: where a taken trick sweeps to. */
export const sweepOffset = (angle: number, w: number, h: number) => sweepTo(angle, w, h);

/** A card on Mau-Mau's discard pile: a little off-centre and askew, the same on every page. */
export { stackPlace };

/**
 * A hand's cards with a key each that stays put while they're held: Doppelkopf has every card twice,
 * so the id alone can't key them ("h-10", "h-10~1").
 */
export function keyed(cards: readonly string[]) {
  const seen = new Map<string, number>();
  return cards.map((id) => {
    const k = seen.get(id) ?? 0;
    seen.set(id, k + 1);
    return { id, key: k ? `${id}~${k}` : id };
  });
}

/** The card a key stands for: the id, without the "~1" that tells two equal cards apart. */
export const idOfKey = (key: string) => key.replace(/~\d+$/, '');

/**
 * A held hand's keys, kept from the last ones given out: a card that stays keeps its key, one that
 * arrives gets a key no card had a moment ago (nor the one in the air), and of two equal cards the one in the air (`leaving`)
 * is the one that goes. By position alone (`keyed`), the second Herz König would take the first one's
 * key the moment that one was played, and the hand would think it still in the air.
 */
export function rekey(cards: readonly string[], prev: readonly { id: string; key: string }[], leaving: string | null = null) {
  const pool = new Map<string, string[]>();
  for (const c of prev) pool.set(c.id, [...(pool.get(c.id) ?? []), c.key]);
  const need = new Map<string, number>();
  for (const id of cards) need.set(id, (need.get(id) ?? 0) + 1);
  if (leaving) {
    const keys = pool.get(idOfKey(leaving));
    if (keys && keys.includes(leaving) && (need.get(idOfKey(leaving)) ?? 0) < keys.length) keys.splice(keys.indexOf(leaving), 1);
  }
  const old = new Set(prev.map((c) => c.key));
  if (leaving) old.add(leaving);
  const given = new Set<string>();
  return cards.map((id) => {
    let key = pool.get(id)?.shift();
    for (let k = 0; !key || given.has(key); k++) {
      const fresh = k ? `${id}~${k}` : id;
      if (!old.has(fresh) && !given.has(fresh)) key = fresh;
    }
    given.add(key);
    return { id, key };
  });
}
