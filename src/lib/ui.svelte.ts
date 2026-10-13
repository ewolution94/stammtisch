// Page-wide things any component may open: the how-to-play guide, the table's or a game's (from the
// start page, the lobby and Settings; the table's also once on a device's first visit).

import type { GuideId } from './guides';

export const ui = $state<{ guide: GuideId | null }>({ guide: null });
