// Stammtisch QA: one person (or more) and bots at each game (Mau-Mau, Doppelkopf, Skat, Durak),
// played through the page like a person would (tap a legal card, then tap it again; the panels'
// buttons: "Gesund", the bids, the Skat, "Drücken", the Unter's wish, "Mau!", Durak's "Take" and
// "Done"), screenshots at each new phase, overflow and console checks; after the first deal of each
// game the host ends it and the end screen is shot. From Stichle's tools/qa.mjs. Not part of CI:
// Playwright is borrowed from Folio's checkout next door (the workspace's `folio/node_modules`,
// WebKit already installed).
//
//   npm run build && node server/server.mjs --port 6411     (or the stammtisch-prod preview)
//   node tools/qa.mjs [base] [outdir]          GAMES=maumau,doppelkopf,skat,durak W=390 H=844 by default
//   PEOPLE=2 node tools/qa.mjs …                 a guest joins through the page and plays too
//   SLOWFONT=2000 node tools/qa.mjs …            the display face arrives late (a slow phone)
import { webkit } from '../../folio/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:6411';
const OUT = process.argv[3] ?? '/tmp/stammtisch-qa/';
const GAMES = (process.env.GAMES ?? 'maumau,doppelkopf,skat,durak').split(',');
const W = Number(process.env.W ?? 390), H = Number(process.env.H ?? 844);
const LANG = process.env.LANG_UI ?? 'en';
const PEOPLE = Number(process.env.PEOPLE ?? 1);
/** Hold the display face back this many ms, so the page starts in the fallback (Stichle's check). */
const SLOWFONT = Number(process.env.SLOWFONT ?? 0);
mkdirSync(OUT, { recursive: true });

const problems = [];
const say = (...a) => console.log(...a);
const browser = await webkit.launch();

async function person(name) {
  // Playwright doesn't route a service worker's requests: once sw.js runs, a held font would come
  // through it on time, so a late-font run keeps the worker out.
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, serviceWorkers: SLOWFONT ? 'block' : 'allow' });
  await context.addInitScript((lang) => {
    try {
      localStorage.setItem('ewo:lang', lang);
      // The table's guide opens once on a first visit: seen already.
      localStorage.setItem('stammtisch:guide', '1');
    } catch {}
    // The table never changes size or place while you play (the user, 2026-10-13, on Stichle: "it
    // cannot jump"): every frame, the felt, the middle, your place card and your hand's box are
    // measured, and any move is written down with what the status line said (Stichle's check).
    const watched = ['.table .cloth', '.table .middle', '.table .dock > div.mine', '.table .hand'];
    const last = new Map();
    window.__jumps = [];
    const look = () => {
      for (const sel of watched) {
        const el = document.querySelector(sel);
        if (!el) {
          last.delete(sel);
          continue;
        }
        const r = el.getBoundingClientRect();
        const now = [r.left, r.top, r.width, r.height].map(Math.round).join(',');
        const was = last.get(sel);
        if (was && was !== now) window.__jumps.push(`${sel}: ${was} → ${now} (${document.querySelector('.status, .toast')?.textContent ?? (document.querySelector('.panel') ? 'panel' : '-')})`);
        last.set(sel, now);
      }
      requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  }, LANG);
  if (SLOWFONT) await context.route('**/texturina-*.woff2', async (route) => {
    await new Promise((r) => setTimeout(r, SLOWFONT));
    await route.continue();
  });
  const page = await context.newPage();
  page.on('console', (m) => m.type() === 'error' && problems.push(`${name} console: ${m.text()}`));
  page.on('pageerror', (e) => problems.push(`${name} pageerror: ${e.message}`));
  return { name, context, page };
}

async function api(page, path, body, token) {
  return page.evaluate(
    async ([path, body, token]) => {
      const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { 'x-stammtisch-token': token } : {}) }, body: JSON.stringify(body ?? {}) });
      return r.status === 204 ? null : r.json();
    },
    [path, body, token],
  );
}

async function overflow(p, label) {
  const wide = await p.page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    return [...document.querySelectorAll('body *')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.right > w + 1 && !el.closest('.hand, .trick, svg, .played, .wrap');
      })
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} → ${Math.round(el.getBoundingClientRect().right)}`);
  });
  if (wide.length) problems.push(`${p.name} overflow at ${label}: ${wide.join(', ')}`);
}

let shot = 0;
async function snap(p, label) {
  await p.page.waitForTimeout(450);
  await p.page.screenshot({ path: `${OUT}${String(++shot).padStart(2, '0')}-${label}.png` });
  await overflow(p, label);
}

/** One move like a person; returns what it did (or 'wait'). */
async function step(p) {
  const { what, tap } = await p.page.evaluate(() => {
    // A tap where a finger would land on a card in the fan: its visible strip, on its left edge,
    // half way down (the cards to its right cover the rest). The page works out the point; the
    // mouse taps it for real, below.
    let tap = null;
    const click = (el) => {
      const r = el.getBoundingClientRect();
      tap = [r.x + Math.min(14, r.width / 3), r.y + r.height * 0.45];
    };
    const what = (() => {
      const button = (re, root = document) => [...root.querySelectorAll('button')].find((b) => !b.disabled && re.test(b.textContent.trim()));
      if (document.querySelector('.final')) return 'final';
      const veil = document.querySelector('.veil');
      if (veil) {
        // The deal's result: shot first (the caller), then on.
        if (!veil.dataset.seen) {
          veil.dataset.seen = '1';
          return 'scored';
        }
        const next = button(/^(Next|Weiter)/, veil);
        if (next) {
          next.click();
          return 'next';
        }
        return 'scored';
      }
      const panel = document.querySelector('.dock .panel');
      if (panel) {
        // A Mau-Mau wish: the first suit.
        const suit = panel.querySelector('.suitbtn');
        if (suit) return suit.click(), 'wish';
        for (const re of [/^(Healthy|Gesund)$/, /^(Pick up the Skat|Skat aufnehmen)$/, /^(Declare|Ansagen)$/, /^(Play \(18\)|Spielen \(18\))$/, /^(Yes|Ja), \d+/, /^(Bid|\d+ sagen)/, /^(Take it|Nehmen)$/]) {
          const b = button(re, panel);
          if (b) return b.click(), b.textContent.trim();
        }
        // Putting cards back or giving them: pick the first ones, then confirm.
        const confirm = button(/\((\d)\/(\d)\)$/, panel) ?? [...panel.querySelectorAll('button')].find((b) => /\(\d\/\d\)$/.test(b.textContent.trim()));
        if (confirm) {
          const [, have, need] = /\((\d)\/(\d)\)$/.exec(confirm.textContent.trim()).map(Number);
          if (have < need) {
            const slot = [...document.querySelectorAll('.hand .slot')].find((s) => s.getAttribute('aria-pressed') === 'false');
            if (slot) return click(slot), 'pick';
          } else if (!confirm.disabled) return confirm.click(), 'confirm';
        }
        return 'panel?';
      }
      const status = document.querySelector('.status.mine');
      const mau = document.querySelector('.btn.mau:not(.on)');
      if (mau) mau.click();
      if (!status) return 'wait';
      // Tap a legal card once to lift it, and once more (the next step, as a person would) to play it.
      const slots = [...document.querySelectorAll('.hand .slot')];
      const lifted = slots.find((s) => s.classList.contains('lifted') && s.getAttribute('aria-disabled') === 'false');
      if (lifted) return click(lifted), 'play';
      const legal = slots.find((s) => s.getAttribute('aria-disabled') === 'false');
      if (legal) return click(legal), 'lift';
      const draw = [...document.querySelectorAll('.actions .btn')].find((b) => !b.disabled);
      if (draw) return draw.click(), draw.textContent.trim();
      // A finished trick still holds the table ("Your trick."): wait.
      return /trick|Stich/.test(status.textContent) ? 'wait' : 'stuck';
    })();
    return { what, tap };
  });
  if (tap) await p.page.mouse.click(tap[0], tap[1]);
  return what;
}

for (const game of GAMES) {
  const host = await person(`host-${game}`);
  await host.page.goto(BASE);
  const seat = await api(host.page, '/api/rooms', { name: 'Anna', avatar: [1, 2, 3], game });
  await host.page.evaluate(([code, s]) => localStorage.setItem(`stammtisch:seat:${code}`, JSON.stringify({ ...s, at: Date.now() })), [seat.code, seat]);
  await host.page.goto(`${BASE}/${seat.code}`, { waitUntil: 'load' });
  await host.page.waitForSelector('.lobby');
  // Guests: the table's link, the name, "Play", like a person.
  const people = [host];
  for (let i = 1; i < PEOPLE; i++) {
    const guest = await person(`guest${i}-${game}`);
    await guest.page.goto(`${BASE}/${seat.code}`, { waitUntil: 'load' });
    await guest.page.locator('.join input.input').fill(`Gast ${i}`);
    await guest.page.getByRole('button', { name: /^(Play|Mitspielen)$/ }).click();
    await guest.page.waitForSelector('.lobby');
    people.push(guest);
  }
  if (PEOPLE > 1 && !(await host.page.getByText('Gast 1').count())) problems.push(`${game}: the host's lobby doesn't show the guest`);
  const bots = (game === 'skat' ? 3 : 4) - people.length;
  for (let i = 0; i < bots; i++) await api(host.page, `/api/rooms/${seat.code}/bot`, { add: true }, seat.token);
  await snap(host, `${game}-lobby`);
  await host.page.getByRole('button', { name: /^(Deal|Geben)$/ }).click();
  for (const p of people) await p.page.waitForSelector('.table');
  say(game, 'dealt', seat.code);
  const done = new Set();
  let steps = 0;
  let stuck = 0;
  for (let t = 0; t < 900; t++) {
    // A guest's turn first (the host's own moves, and the shots, follow below).
    for (const guest of people.slice(1)) {
      const did = await step(guest);
      if (did === 'play' && !done.has(`${guest.name}-play`)) {
        done.add(`${guest.name}-play`);
        await snap(guest, `${game}-guest-play`);
      }
    }
    const what = await step(host);
    if (process.env.TRACE) say(t, what, ...(await host.page.evaluate(() => [document.querySelector('.status')?.textContent ?? '', document.querySelector('.hand .slot.lifted')?.getAttribute('aria-label') ?? '-', document.querySelectorAll('.hand .slot').length])));
    const key = what.replace(/\d+/g, '#');
    if (!done.has(key) && !['wait', 'pick', 'lift'].includes(what)) {
      done.add(key);
      await snap(host, `${game}-${key.replace(/[^a-z#]+/gi, '-')}`);
    }
    if (what === 'scored') {
      await snap(host, `${game}-dealend`);
      for (const guest of people.slice(1)) await snap(guest, `${game}-guest-dealend`);
      break;
    }
    if (what === 'stuck' || what === 'panel?') {
      if (++stuck > 20) {
        problems.push(`${game}: stuck (${what})`);
        await snap(host, `${game}-stuck`);
        break;
      }
    } else stuck = 0;
    if (what === 'play') steps++;
    if (steps === 5 && !done.has('mid')) {
      done.add('mid');
      await snap(host, `${game}-mid`);
    }
    await host.page.waitForTimeout(what === 'wait' ? 400 : 250);
  }
  // The score sheet, then the host ends the game: the final screen.
  await host.page.locator('.tool').first().click().catch(() => {});
  await snap(host, `${game}-sheet`);
  await host.page.keyboard.press('Escape');
  await api(host.page, `/api/rooms/${seat.code}/stop`, {}, seat.token);
  await host.page.waitForSelector('.final', { timeout: 5000 }).catch(() => problems.push(`${game}: no final screen`));
  await snap(host, `${game}-final`);
  for (const p of people) {
    const jumps = await p.page.evaluate(() => window.__jumps);
    if (jumps.length) problems.push(`${p.name}: the table moved ${jumps.length}×:\n  ${[...new Set(jumps)].slice(0, 12).join('\n  ')}`);
  }
  for (const guest of people.slice(1)) {
    await guest.page.waitForSelector('.final', { timeout: 5000 }).catch(() => problems.push(`${game}: the guest saw no final screen`));
    await snap(guest, `${game}-guest-final`);
    await guest.context.close();
  }
  await host.context.close();
}

await browser.close();
say(problems.length ? `PROBLEMS:\n${problems.join('\n')}` : 'no problems');
