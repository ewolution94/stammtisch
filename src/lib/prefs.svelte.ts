// What this device prefers, kept on it: where the other players' place cards are, round the table on
// its rail where each one sits (the default), or on a board above the cloth, everyone in playing order
// (the user's picks B and C, 2026-10-15, as in Stichle: Settings → Players). Kept in localStorage;
// blocked storage just means the default.

const SEATS = 'stammtisch:seats';

export type Seating = 'table' | 'board';

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export const prefs = $state({ seats: (read(SEATS) === 'board' ? 'board' : 'table') as Seating });

export function setSeats(seats: Seating) {
  prefs.seats = seats;
  try {
    localStorage.setItem(SEATS, seats);
  } catch {
    // not kept
  }
}
