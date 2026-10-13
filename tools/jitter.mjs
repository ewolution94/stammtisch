// The lock-up hunt, after Stichle's (the user, 2026-10-13, on Stichle: "the game locks up"): one
// person and bots at Doppelkopf or Skat (GAME), the two games whose trick table holds after a trick, every other view arriving as if JITTER ms (250) slower (a
// phone's network jitter, made by skewing Date.now while that view is handled). The person plays a
// legal card whenever it's their turn. Stuck = mid-deal and nothing on the table changed for 15 s (in
// the lock-up the hand is never playable again, so no card is legal).
//
//   npm run build && node server/server.mjs --port 6411     (or the stammtisch-prod preview)
//   GAME=doppelkopf DEALS=3 JITTER=250 node tools/jitter.mjs [base]      (GAME=skat for Skat)
import { webkit } from '../../folio/node_modules/playwright/index.mjs';

const BASE = process.argv[2] ?? 'http://localhost:6411';
const DEALS = Number(process.env.DEALS ?? 3);
const JITTER = Number(process.env.JITTER ?? 250);
const GAME = process.env.GAME ?? 'doppelkopf';
const browser = await webkit.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
await context.addInitScript((jitter) => {
  try {
    localStorage.setItem('ewo:lang', 'en');
    localStorage.setItem('stammtisch:guide', '1');
  } catch {}
  // Every other view is handled as if it had taken JITTER ms longer to arrive.
  const realNow = Date.now.bind(Date);
  let skew = 0;
  Date.now = () => realNow() + skew;
  const add = EventSource.prototype.addEventListener;
  let count = 0;
  EventSource.prototype.addEventListener = function (type, fn, opts) {
    if (type !== 'view') return add.call(this, type, fn, opts);
    return add.call(
      this,
      type,
      (event) => {
        skew = ++count % 2 ? jitter : 0;
        try {
          fn(event);
        } finally {
          skew = 0;
        }
      },
      opts,
    );
  };
}, JITTER);
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(BASE, { waitUntil: 'load' });
const api = (path, body, token) =>
  page.evaluate(
    async ([path, body, token]) => {
      const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { 'x-stammtisch-token': token } : {}) }, body: JSON.stringify(body ?? {}) });
      return r.status === 204 ? null : r.json();
    },
    [path, body, token],
  );
const seat = await api('/api/rooms', { name: 'Anna', avatar: [1, 2, 3], game: GAME });
await page.evaluate(([code, s]) => localStorage.setItem(`stammtisch:seat:${code}`, JSON.stringify({ ...s, at: Date.now() })), [seat.code, seat]);
await page.goto(`${BASE}/${seat.code}`, { waitUntil: 'load' });
await page.waitForSelector('.lobby');
for (let i = 0; i < (GAME === 'skat' ? 2 : 3); i++) await api(`/api/rooms/${seat.code}/bot`, { add: true }, seat.token);
await page.getByRole('button', { name: /^Deal$/ }).click();
await page.waitForSelector('.table');

const look = () =>
  page.evaluate(() => ({
    status: document.querySelector('.status, .toast')?.textContent ?? '',
    mine: Boolean(document.querySelector('.status.mine')),
    hand: document.querySelectorAll('.hand .slot').length,
    trick: document.querySelectorAll('.trick .played').length,
    legal: Boolean(document.querySelector('.hand .slot[aria-disabled="false"]')),
    veil: Boolean(document.querySelector('.veil')),
    deal: document.querySelector('.top .label')?.textContent ?? '',
  }));
const tap = async (selector) => {
  const at = await page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return [r.x + Math.min(14, r.width / 3), r.y + r.height * 0.45];
  }, selector);
  if (at) await page.mouse.click(at[0], at[1]);
};

let deals = 0;
let stuckSince = 0;
let last = '';
let verdict = 'clean';
while (deals < DEALS) {
  const s = await look();
  const key = JSON.stringify(s);
  if (key !== last) {
    last = key;
    stuckSince = Date.now();
  }
  if (s.veil) {
    const next = page.locator('.veil button').filter({ hasText: /^(Next|Weiter)/ });
    if (await next.count()) {
      deals++;
      await next.first().click({ timeout: 1000 }).catch(() => {});
    }
  } else {
    // A decision: healthy in Doppelkopf, pass in Skat's bidding; should the Skat still come to us,
    // pick it up, put the first two back and declare what's offered.
    const answer = await page.evaluate(() => {
      const panel = document.querySelector('.dock .panel');
      if (!panel) return null;
      const buttons = [...panel.querySelectorAll('button')].filter((b) => !b.disabled);
      for (const re of [/^Healthy$/, /^Pass$/, /^Pick up the Skat$/, /^Declare$/, /\(2\/2\)$/]) {
        const b = buttons.find((x) => re.test(x.textContent.trim()));
        if (b) return b.click(), re.source;
      }
      return 'pick';
    });
    if (answer === 'pick') await tap('.hand .slot[aria-pressed="false"]');
    else if (!answer && s.mine && s.legal) {
      await tap('.hand .slot[aria-disabled="false"]');
      await page.waitForTimeout(200);
      await tap('.hand .slot.lifted');
    }
  }
  if (!s.veil && Date.now() - stuckSince > 15_000) {
    verdict = `STUCK in "${s.deal}": ${JSON.stringify(s)}`;
    break;
  }
  await page.waitForTimeout(300);
}
console.log(`${verdict} after ${deals} deals${errors.length ? `; page errors: ${errors.join(' | ')}` : ''}`);
await browser.close();
