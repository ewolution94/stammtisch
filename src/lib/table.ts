// Where things are around the table, from your own seat: you sit at the bottom, and play goes on to
// your left, across the top, and round to your right (clockwise, as at a real table). Seats here are
// the deal's own (the game's seats, the dealer's left first); a watcher, or the dealer sitting a deal
// out, sees it from the first seat. From Stichle's src/lib/table.ts.

let uid = 0;
/** A fresh id for one drawn card, so its foil gradients never clash with another card's. */
export const nextUid = () => ++uid;

/** The seat at the bottom of this page's table. */
export const homeSeat = (mine: number) => (mine >= 0 ? mine : 0);

/** A seat's place: 0 is you, then 1, 2 … in the order play goes. */
export const placeOf = (seat: number, mine: number, n: number) => (seat - homeSeat(mine) + n) % n;

/**
 * The direction a seat sits in, in degrees (0 = right, 90 = down): you at 90, the others spread from
 * the left (180) over the top (270) to the right (360).
 */
export function angleOf(seat: number, mine: number, n: number) {
  const place = placeOf(seat, mine, n);
  return place === 0 ? 90 : 180 + (place * 180) / n;
}

/** A steady twist for a card on the pile (from its id, so every page agrees), so a trick looks dropped. */
export function twist(card: string, seat: number) {
  let h = seat * 7919;
  for (const ch of card) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return ((Math.abs(h) % 2200) / 100 - 11).toFixed(1);
}

/** How big a card is on the pile in the middle, for a trick area of w × h px. */
export const trickCardWidth = (w: number, h: number, cap = w > 600 ? 120 : 100) => Math.round(Math.min(cap, w * 0.27, (h * 0.5) / 1.4));

/**
 * Where a seat's card lies on the pile, from the area's centre: a stack, each card nudged towards the
 * seat that played it, about a third of a card, which keeps one of its corner indices in view.
 */
export function slotOffset(angle: number, cardWidth: number) {
  const rad = (angle * Math.PI) / 180;
  return { dx: Math.cos(rad) * cardWidth * 0.36, dy: Math.sin(rad) * cardWidth * 1.4 * 0.27 };
}

/** Off the table towards a seat: where a taken trick sweeps to. */
export function sweepOffset(angle: number, w: number, h: number) {
  const rad = (angle * Math.PI) / 180;
  return { dx: Math.cos(rad) * w * 0.75, dy: Math.sin(rad) * h * 0.75 };
}

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
