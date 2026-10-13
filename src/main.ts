import './app.css';
import './lib/scrolling';
// Folio's shared elements (vendor/ewo); each defines itself once.
import '../vendor/ewo/elements/settings-button.js';
import '../vendor/ewo/elements/sheet.js';
import '../vendor/ewo/elements/guide.js';
import '../vendor/ewo/elements/segmented.js';
import '../vendor/ewo/elements/switch.js';
import '../vendor/ewo/elements/emblem.js';
import '../vendor/ewo/elements/emblem-maker.js';
import '../vendor/ewo/elements/connection.js';

import { mount } from 'svelte';
import App from './App.svelte';
import { defs } from './lib/deck';
import { paperGrain } from '../vendor/ewo/elements/card-paper.js';
// Every tap answers on a phone, the games' lively way (Folio's pressFeedback,
// development/plans/mobile-touch.md).
import { pressFeedback } from '../vendor/ewo/elements/press.js';
// A wait for the server shows at the control that asked (Folio's track() via src/lib/waits.ts):
// Stammtisch's working mark is a little fan of three cards opening and closing (app.css), Stichle's.
import { configureWaiting } from '../vendor/ewo/elements/waiting.js';

pressFeedback({ preset: 'lively' });
configureWaiting({
  mark: '<svg class="fan" viewBox="0 0 28 20" aria-hidden="true"><rect class="l" x="9" y="2" width="10" height="15" rx="1.6" /><rect class="r" x="9" y="2" width="10" height="15" rx="1.6" /><rect x="9" y="2" width="10" height="15" rx="1.6" /></svg>',
});

// The deck's engravings and pressed-ink filter, once for every card on the page (src/lib/deck.js).
document.body.insertAdjacentHTML('afterbegin', `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">${defs()}</svg>`);

// The cards' paper grain: a small tile of noise, made once, laid over every card (Card.svelte; Folio's card kit).
paperGrain();

function start() {
  mount(App, { target: document.getElementById('app')! });
  requestAnimationFrame(() => dispatchEvent(new Event('splash:ready')));
}

// Installed, the app opens on the splash screen (index.html, switched on by public/boot.js; written by
// development/plans/splash-rollout). iOS fades its launch image into the page as soon as the page has
// laid out, so the splash has to be on screen before the app's first render takes the main thread, or
// the fade goes through a blank white web view. It lifts a frame after the app has mounted.
if (document.documentElement.classList.contains('splash')) {
  let started = false;
  const once = () => {
    if (started) return;
    started = true;
    start();
  };
  requestAnimationFrame(() => setTimeout(once));
  setTimeout(once, 100);
} else {
  start();
}

/**
 * The offline shell (see public/sw.js). Production only: a worker in front of the dev server would
 * cache the modules Vite is trying to hot-replace.
 */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
