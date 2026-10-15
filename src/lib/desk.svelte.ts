// Whether this window gets the desktop table (src/lib/table.ts → DESK: from 1100 × 740 up; phones
// and small windows keep theirs, the user insisted), and how big it's drawn (deskScale; Settings →
// Table size). One state for every table and the settings sheet.

import { DESK, deskScale } from './table';
import { prefs } from './prefs.svelte';

const mq = typeof matchMedia === 'function' ? matchMedia(DESK) : null;

export const screen = $state({
  desk: mq?.matches ?? false,
  w: typeof innerWidth === 'number' ? innerWidth : 1440,
  h: typeof innerHeight === 'number' ? innerHeight : 900,
});

mq?.addEventListener('change', () => (screen.desk = mq.matches));
if (typeof addEventListener === 'function') {
  addEventListener('resize', () => {
    screen.w = innerWidth;
    screen.h = innerHeight;
  });
}

/** The desktop table's size factor now: 1 off the desktop table. */
export const tableScale = () => (screen.desk ? deskScale(screen.w, screen.h, prefs.size) : 1);
