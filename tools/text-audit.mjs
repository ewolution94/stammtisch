// The text-centring audit (plans/text-centering.md): every single line of text that sits in a box of
// its own (a button, a chip, a pill, a badge, a tag, a code field), and how far its optical middle
// (halfway between the baseline and the cap height) sits from the box's middle. Run it in the page:
//
//   import { textAudit } from './text-audit.mjs';   // a copy in the app's tools/
//   const rows = await page.evaluate(textAudit, { min: 1, skip: ['header.top'] });
//
// `skip`: selectors of boxes whose text isn't centred on purpose (a bar that keeps its label in
// place while a second line comes and goes); say why where you pass them.
//
// Each row: where (the box's selector), text, font, the box's height, `off` (px; + means the text
// sits low, − high) and `bias`, the part that comes from the font itself: a line box centred in its
// box puts the cap middle (ascent − descent − cap) / 2 below the middle, whatever the line-height.
// A row whose `off` matches its `bias` is the font's doing; one that doesn't is the layout's (a
// padding, a line-height on a block that isn't centred, a baseline alignment).
// Self-contained (Playwright sends the function's source to the page): no imports, no closures.
export function textAudit({ min = 1, maxHeight = 96, skip = [] } = {}) {
  const ctx = document.createElement('canvas').getContext('2d');
  const fonts = new Map();
  const fontOf = (cs) => {
    const key = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    if (!fonts.has(key)) {
      ctx.font = key;
      const m = ctx.measureText('H');
      fonts.set(key, { cap: m.actualBoundingBoxAscent, ascent: m.fontBoundingBoxAscent, descent: m.fontBoundingBoxDescent });
    }
    return fonts.get(key);
  };
  const clear = (c) => !c || c === 'transparent' || /rgba?\([^)]*,\s*0\)$/.test(c) || /\/\s*0\)$/.test(c);
  const boxy = (el) => {
    if (el.matches('button, [role=button], a.btn, summary, label.chip, output')) return true;
    const cs = getComputedStyle(el);
    if (cs.display === 'inline' || cs.display === 'contents') return false;
    if (!clear(cs.backgroundColor) || cs.backgroundImage !== 'none' || cs.boxShadow !== 'none') return true;
    return ['Top', 'Bottom'].some((s) => parseFloat(cs[`border${s}Width`]) > 0 && !clear(cs[`border${s}Color`]));
  };
  const path = (el) => {
    const name = (e) => e.tagName.toLowerCase() + [...e.classList].filter((c) => !c.startsWith('svelte-')).map((c) => `.${c}`).join('');
    const parts = [name(el)];
    let up = el.parentElement ?? el.getRootNode().host;
    for (let i = 0; i < 2 && up && up !== document.body; i++, up = up.parentElement ?? up.getRootNode().host) parts.unshift(name(up));
    return parts.join(' > ');
  };
  // Every text node, in the page and inside open shadow roots (Folio's elements).
  const texts = [];
  const walk = (root) => {
    const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = it.nextNode(); n; n = it.nextNode()) {
      if (n.nodeType === 1) {
        if (n.shadowRoot) walk(n.shadowRoot);
        continue;
      }
      if (n.textContent.trim()) texts.push(n);
    }
  };
  walk(document.body);
  // Each text to its nearest box.
  const boxes = new Map();
  for (const t of texts) {
    let el = t.parentElement;
    while (el && el !== document.body && !boxy(el)) el = el.parentElement ?? el.getRootNode().host;
    if (!el || el === document.body) continue;
    const range = document.createRange();
    range.selectNodeContents(t);
    const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
    if (!rects.length) continue;
    const cs = getComputedStyle(t.parentElement);
    if (cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
    const f = fontOf(cs);
    // The baseline, from the text's content area (the font's ascent above it, its descent below).
    const lines = rects.map((r) => (r.top + f.ascent + r.bottom - f.descent) / 2);
    if (!boxes.has(el)) boxes.set(el, []);
    boxes.get(el).push({ t, f, cs, lines });
  }
  // A box inside something still moving (a panel scaling in, a sheet sliding up) is measured mid-way:
  // left for the next shot.
  const moving = document.getAnimations().filter((a) => a.playState === 'running').map((a) => a.effect?.target).filter((t) => t instanceof Element);
  const still = (el) => !moving.some((t) => t === el || t.contains(el));
  const rows = [];
  for (const [el, items] of boxes) {
    if (!still(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.height === 0 || r.height > maxHeight || skip.some((sel) => el.matches(sel))) continue;
    const baselines = items.flatMap((i) => i.lines);
    const lo = Math.min(...baselines), hi = Math.max(...baselines);
    if (hi - lo > 2) continue; // more than one line: not a centred label
    const baseline = (lo + hi) / 2;
    const top = items.reduce((a, i) => (i.f.cap > a.f.cap ? i : a));
    const off = baseline - top.f.cap / 2 - (r.top + r.height / 2);
    if (Math.abs(off) < min) continue;
    rows.push({
      where: path(el),
      text: items.map((i) => i.t.textContent.trim()).join(' ').replace(/\s+/g, ' ').slice(0, 32),
      font: `${top.cs.fontFamily.split(',')[0].replace(/"/g, "'")} ${top.cs.fontWeight} ${top.cs.fontSize}`,
      height: Math.round(r.height),
      off: Math.round(off * 10) / 10,
      bias: Math.round(((top.f.ascent - top.f.descent - top.f.cap) / 2) * 10) / 10,
    });
  }
  // Fields keep their text out of the DOM: a single-line field centres its line box in its content
  // box, so the text's middle is the content box's middle plus the font's bias (an estimate).
  for (const el of document.querySelectorAll('input:not([type=hidden], [type=checkbox], [type=radio], [type=range], [type=color]), select')) {
    const r = el.getBoundingClientRect();
    const text = el.value || el.placeholder || '';
    if (!r.height || r.height > maxHeight || !text.trim() || skip.some((sel) => el.matches(sel))) continue;
    const cs = getComputedStyle(el);
    const f = fontOf(cs);
    const px = (p) => parseFloat(cs[p]) || 0;
    const middle = (r.top + px('borderTopWidth') + px('paddingTop') + r.bottom - px('borderBottomWidth') - px('paddingBottom')) / 2;
    const bias = (f.ascent - f.descent - f.cap) / 2;
    const off = middle + bias - (r.top + r.height / 2);
    if (Math.abs(off) < min) continue;
    rows.push({
      where: path(el),
      text: `${text.slice(0, 24)} (field, estimated)`,
      font: `${cs.fontFamily.split(',')[0].replace(/"/g, "'")} ${cs.fontWeight} ${cs.fontSize}`,
      height: Math.round(r.height),
      off: Math.round(off * 10) / 10,
      bias: Math.round(bias * 10) / 10,
    });
  }
  return rows;
}

// Digits drawn in a face whose own digits are old-style (a 9 hanging below the line, a 0 at
// x-height) that the page meant to show full height: any text whose face has old-style digits and
// whose computed style asks for neither `lining-nums` nor `'lnum'`. The usual cause is a `font:`
// shorthand, which resets font-variant-numeric (and font-feature-settings) to normal, so a rule that
// sets the face in one line drops the root's lining-nums. A face with lining digits of its own is
// never listed. Run it in the page like textAudit: `await page.evaluate(digitAudit)`.
export function digitAudit() {
  const ctx = document.createElement('canvas').getContext('2d');
  const faces = new Map();
  // The canvas draws a face's default digits: compare its 9 and 0 with its H.
  const oldStyle = (cs) => {
    const key = `${cs.fontStyle} ${cs.fontWeight} 100px ${cs.fontFamily}`;
    if (!faces.has(key)) {
      ctx.font = key;
      const H = ctx.measureText('H'), nine = ctx.measureText('9'), zero = ctx.measureText('0');
      faces.set(key, nine.actualBoundingBoxDescent > 8 || zero.actualBoundingBoxAscent < H.actualBoundingBoxAscent * 0.85);
    }
    return faces.get(key);
  };
  const path = (el) => {
    const name = (e) => e.tagName.toLowerCase() + [...e.classList].filter((c) => !c.startsWith('svelte-')).map((c) => `.${c}`).join('');
    const parts = [name(el)];
    let up = el.parentElement ?? el.getRootNode().host;
    for (let i = 0; i < 2 && up && up !== document.body; i++, up = up.parentElement ?? up.getRootNode().host) parts.unshift(name(up));
    return parts.join(' > ');
  };
  const rows = [];
  const walk = (root) => {
    const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = it.nextNode(); n; n = it.nextNode()) {
      if (n.nodeType === 1) {
        if (n.shadowRoot) walk(n.shadowRoot);
        continue;
      }
      if (!/\d/.test(n.textContent)) continue;
      const el = n.parentElement;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      if (/lining-nums/.test(cs.fontVariantNumeric) || /lnum/.test(cs.fontFeatureSettings)) continue;
      if (!oldStyle(cs)) continue;
      rows.push({ where: path(el), text: n.textContent.trim().slice(0, 32), font: `${cs.fontFamily.split(',')[0].replace(/"/g, "'")} ${cs.fontWeight} ${cs.fontSize}`, numeric: cs.fontVariantNumeric });
    }
  };
  walk(document.body);
  return rows;
}

// The @font-face overrides that put a face's caps in the middle of its own line box, keeping the line's
// height: `await page.evaluate(capCentred, "'Texturina Variable'")` once the face has loaded →
// { ascent: '113.2%', descent: '42.8%', bias } (bias: how far below the middle the caps sit now, in
// em). Measure the face as it ships (without overrides already on it), at a weight the app uses.
export function capCentred(family, weight = 700) {
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.font = `${weight} 1000px ${family}`;
  const m = ctx.measureText('H');
  const a = m.fontBoundingBoxAscent / 1000, d = m.fontBoundingBoxDescent / 1000, cap = m.actualBoundingBoxAscent / 1000;
  const pct = (x) => `${Math.round(x * 1000) / 10}%`;
  return { ascent: pct((a + d + cap) / 2), descent: pct((a + d - cap) / 2), bias: Math.round(((a - d - cap) / 2) * 1000) / 1000 };
}
