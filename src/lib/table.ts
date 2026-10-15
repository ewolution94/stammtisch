// Where things are around the table, from your own seat: you sit at the bottom, and play goes on to
// your left, across the top, and round to your right (clockwise, as at a real table). Seats here are
// the deal's own (the game's seats, the dealer's left first); a watcher, or the dealer sitting a deal
// out, sees it from the first seat. From Stichle's src/lib/table.ts.

import { cardTwist, pileCardWidth, placeOf as kitPlaceOf, seatAngle, stackPlace, sweepTo, trickSlot } from '../../vendor/ewo/elements/card-pile.js';

/**
 * The end of a trick, in beats counted back from the server's holdUntil (its TRICK_PAUSE, 2600 ms,
 * starts when the last card is played): first the table rests with every card where it landed, then
 * the winner lifts and catches the light while the others dim, then the cards gather under the
 * winner, then the stack sweeps off to the winner's seat (Stichle's, after the user's first game on
 * the phone, 2026-10-13: "it feels very rushed"). Every page reads the same beats from the same
 * holdUntil.
 */
export const TRICK_REVEAL = 1900; // ms before holdUntil: the winner shows (700 ms after the last card)
export const TRICK_GATHER = 420; // ms before holdUntil: the cards gather under the winner
export const TRICK_SWEEP = 560; // ms after holdUntil: the stack sweeps off, then it's gone
export type TrickPhase = 'rest' | 'reveal' | 'gather' | 'sweep' | 'gone';
/** The finished trick's beat, from the time left until holdUntil (negative after it). */
export function trickPhase(left: number): TrickPhase {
  if (left > TRICK_REVEAL) return 'rest';
  if (left > TRICK_GATHER) return 'reveal';
  if (left > 0) return 'gather';
  if (left > -TRICK_SWEEP) return 'sweep';
  return 'gone';
}

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

/**
 * Where a seat sits on the rail, round the table (Stichle's, the user's pick B, 2026-10-15): its
 * direction from the middle (angleOf, the same the trick's cards lean towards) carried out to the
 * edge of a square, then stretched to the cloth, so the seats spread over the side rails and the far
 * one alike instead of crowding the long edge. x and y from -1 to 1 across the cloth; `side` on a
 * side rail (a narrow card there), else on the far rail or its corner.
 */
export function seatSpot(angle: number) {
  const r = (angle * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const k = 1 / Math.max(Math.abs(c), Math.abs(s));
  const x = Math.round(c * k * 1000) / 1000 || 0;
  const y = Math.round(s * k * 1000) / 1000 || 0;
  return { x, y, side: Math.abs(x) === 1 && y > -1 };
}

/** A place card round the table: its seat, where its centre is over the cloth (px), its width. */
export type Spot = { seat: number; side: boolean; narrow: boolean; x: number; y: number; w: number };

/**
 * Round the table: each other seat on the rail its direction from the middle meets (seatSpot). The
 * far rail's cards share its width evenly, left to right (narrow cards with their names on two lines
 * when there's little room); a side rail's card is narrow, a little below the corners. A card may
 * reach `reach` past the cloth's edge, never off the screen. Positions in px over a cloth `w` × `h`.
 */
export function seatSpots(others: readonly number[], mine: number, n: number, w: number, h: number, wide = 150, narrowW = 112, reach = 12): Spot[] {
  const raw = others.map((seat) => ({ seat, ...seatSpot(angleOf(seat, mine, n)) }));
  // Left to right, whatever order play goes round in (Mau-Mau's can turn).
  const far = raw.filter((p) => !p.side).sort((a, b) => a.x - b.x);
  const k = far.length;
  const farW = Math.min(wide, Math.floor((w + 2 * reach - (k - 1) * 6) / Math.max(1, k)));
  const lo = farW / 2 - reach;
  const hi = w - farW / 2 + reach;
  return raw.map((p) => {
    if (p.side) {
      const x = p.x < 0 ? narrowW / 2 - reach : w - narrowW / 2 + reach;
      const y = Math.min(Math.max(h / 2 + (p.y * h) / 2, h * 0.28), h * 0.7);
      return { seat: p.seat, side: true, narrow: true, x: Math.round(x), y: Math.round(y), w: narrowW };
    }
    const i = far.indexOf(p);
    const x = k === 1 ? w / 2 : lo + ((hi - lo) * i) / (k - 1);
    // Over the far rail, a little in from it: clear of the bar above.
    return { seat: p.seat, side: false, narrow: farW < 130, x: Math.round(x), y: 6, w: farW };
  });
}
