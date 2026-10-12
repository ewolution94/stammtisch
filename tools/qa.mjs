// Stammtisch QA: one person and bots at each game (Mau-Mau, Doppelkopf, Skat), played through the
// page like a person would (tap a legal card twice, the panels' buttons: "Gesund", the bids, the
// Skat, "Drücken", the Unter's wish, "Mau!"), screenshots at each new phase, overflow and console
// checks; after the first deal of each game the host ends it and the end screen is shot. From
// Stichle's tools/qa.mjs. Not part of CI: Playwright is borrowed from Folio's checkout next door
// (the workspace's `folio/node_modules`, WebKit already installed).
//
//   npm run build && node server/server.mjs --port 6411     (or the stammtisch-prod preview)
//   node tools/qa.mjs [base] [outdir]          GAMES=maumau,doppelkopf,skat W=390 H=844 by default
import { webkit } from '../../folio/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:6411';
const OUT = process.argv[3] ?? '/tmp/stammtisch-qa/';
const GAMES = (process.env.GAMES ?? 'maumau,doppelkopf,skat').split(',');
const W = Number(process.env.W ?? 390), H = Number(process.env.H ?? 844);
const LANG = process.env.LANG_UI ?? 'en';
mkdirSync(OUT, { recursive: true });

const problems = [];
const say = (...a) => console.log(...a);
const browser = await webkit.launch();

async function person(name) {
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  await context.addInitScript((lang) => {
    try {
      localStorage.setItem('ewo:lang', lang);
    } catch {}
  }, LANG);
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
        return r.width > 0 && r.right > w + 1 && !el.closest('.hand, .trick, svg, .played');
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
  return p.page.evaluate(() => {
    // A tap where a finger would land on a card in the fan: its visible strip, on its left edge,
    // half way down (the cards to its right cover the rest).
    const click = (el) => {
      const r = el.getBoundingClientRect();
      const at = { bubbles: true, clientX: r.x + Math.min(14, r.width / 3), clientY: r.y + r.height * 0.45, pointerId: 1, button: 0 };
      el.dispatchEvent(new PointerEvent('pointerdown', at));
      el.dispatchEvent(new PointerEvent('pointerup', at));
    };
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
    const legal = [...document.querySelectorAll('.hand .slot')].find((s) => s.getAttribute('aria-disabled') === 'false');
    if (legal) {
      click(legal);
      click(legal);
      return 'play';
    }
    const draw = [...document.querySelectorAll('.actions .btn')].find((b) => !b.disabled);
    if (draw) return draw.click(), draw.textContent.trim();
    // A finished trick still holds the table ("Your trick."): wait.
    return /trick|Stich/.test(status.textContent) ? 'wait' : 'stuck';
  });
}

for (const game of GAMES) {
  const host = await person(`host-${game}`);
  await host.page.goto(BASE);
  const seat = await api(host.page, '/api/rooms', { name: 'Anna', avatar: [1, 2, 3], game });
  await host.page.evaluate(([code, s]) => localStorage.setItem(`stammtisch:seat:${code}`, JSON.stringify({ ...s, at: Date.now() })), [seat.code, seat]);
  await host.page.goto(`${BASE}/${seat.code}`, { waitUntil: 'load' });
  await host.page.waitForSelector('.lobby');
  const bots = game === 'skat' ? 2 : 3;
  for (let i = 0; i < bots; i++) await api(host.page, `/api/rooms/${seat.code}/bot`, { add: true }, seat.token);
  await snap(host, `${game}-lobby`);
  await host.page.getByRole('button', { name: /^(Deal|Geben)$/ }).click();
  await host.page.waitForSelector('.table');
  say(game, 'dealt', seat.code);
  const done = new Set();
  let steps = 0;
  let stuck = 0;
  for (let t = 0; t < 900; t++) {
    const what = await step(host);
    const key = what.replace(/\d+/g, '#');
    if (!done.has(key) && !['wait', 'pick'].includes(what)) {
      done.add(key);
      await snap(host, `${game}-${key.replace(/[^a-z#]+/gi, '-')}`);
    }
    if (what === 'scored') {
      await snap(host, `${game}-dealend`);
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
  await host.context.close();
}

await browser.close();
say(problems.length ? `PROBLEMS:\n${problems.join('\n')}` : 'no problems');
