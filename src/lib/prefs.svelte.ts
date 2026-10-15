// What this device prefers, kept on it: where the other players' place cards are, round the table on
// its rail where each one sits (the default), or on a board above the cloth, everyone in playing order
// (the user's picks B and C, 2026-10-15, as in Stichle: Settings → Players); and on the desktop table
// the hand laid out flat or held as a fan, and the table's size (Stichle's, the user's go 2026-10-15).
// Kept in localStorage; blocked storage just means the default.

import { TABLE_SIZES, type TableSize } from './table';

const SEATS = 'stammtisch:seats';
const HAND = 'stammtisch:hand';
const SIZE = 'stammtisch:size';

export type Seating = 'table' | 'board';
/** The desktop table's hand: laid out flat, every card whole, or the fan of the phone. */
export type HandLayout = 'flat' | 'fan';

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function keep(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // not kept
  }
}

export const prefs = $state({
  seats: (read(SEATS) === 'board' ? 'board' : 'table') as Seating,
  hand: (read(HAND) === 'fan' ? 'fan' : 'flat') as HandLayout,
  size: (TABLE_SIZES.find((s) => s === read(SIZE)) ?? 'auto') as TableSize,
});

export function setSeats(seats: Seating) {
  prefs.seats = seats;
  keep(SEATS, seats);
}

export function setHand(hand: HandLayout) {
  prefs.hand = hand;
  keep(HAND, hand);
}

export function setSize(size: TableSize) {
  prefs.size = size;
  keep(SIZE, size);
}
