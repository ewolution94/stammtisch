// Stammtisch's German deck (the user's picks, 2026-10-13: the courts standing, Eichel in umber): the
// number cards in Prägung (letterpress, Stichle's classic deck), the Unter, Ober and König as paper
// cuts (Stichle's figure style, drawn anew for this deck), each Daus one big sign in an engraved rose
// (the Schellen-Daus with its sow), bordeaux backs in gold foil. Every function returns an SVG string
// in a 250 × 350 viewBox (a poker card); main.ts injects defs() once. Drawn first for the user's
// review in the workspace (plans/card-games/deck.js, its contact sheet deck.html); this is the copy
// the app uses, and the one to change.
//
// Cards are named as the engine names them (stammtisch/server/core/cards.mjs): "h-10", "c-Q" …
// suits c Eichel, s Grün, h Herz, d Schellen; ranks 7 to 10, J Unter, Q Ober, K König, A Daus.
// The corner index is sized for the hand: a card 74 px wide shows a strip of about 26 px (88 units).

export const SUITS = ['c', 's', 'h', 'd'];

/** The four inks, apart at a glance in a fan; Eichel in umber (an acorn) or black (the tournament ♣). */
export const INKS = {
  umber: { c: '#4a3122', s: '#17834a', h: '#cc2b2b', d: '#c99700' },
  black: { c: '#1c1a22', s: '#17834a', h: '#cc2b2b', d: '#c99700' },
};
/**
 * The disc behind a court's person: the suit's ink, but Eichel's lighter (a ripe acorn's brown, or
 * slate with black ink), so the black paper cut still stands out against it.
 */
export const DISC = {
  umber: { c: '#a87a4c', s: '#17834a', h: '#cc2b2b', d: '#c99700' },
  black: { c: '#7a7684', s: '#17834a', h: '#cc2b2b', d: '#c99700' },
};
/** Each suit's paper, tinted with its ink, so even a sliver of a card in the hand reads as its suit. */
export const TINT = { c: '#efe8de', s: '#e6f3ea', h: '#fbe9e6', d: '#fbf1d6' };
export const PAPER = '#f8f6f1';
export const LINEN = '#fbfaf6';
export const BLACK = '#1c1a22';
export const BORDEAUX = '#5b1427';

export const WORDS = {
  de: {
    suit: { c: 'Eichel', s: 'Grün', h: 'Herz', d: 'Schellen' },
    rank: { J: 'Unter', Q: 'Ober', K: 'König', A: 'Daus' },
    back: 'Rückseite',
  },
  en: {
    suit: { c: 'Acorns', s: 'Leaves', h: 'Hearts', d: 'Bells' },
    rank: { J: 'Under', Q: 'Over', K: 'King', A: 'Ace' },
    back: 'Back',
  },
};
const INDEX = { J: 'U', Q: 'O', K: 'K', A: 'A' };

export function parse(id) {
  const m = /^([cshd])-(10|[6-9]|[JQKA])$/.exec(id ?? '');
  return m ? { s: m[1], r: m[2] } : null;
}

export function nameOf(id, lang = 'de') {
  const c = parse(id);
  const t = WORDS[lang];
  if (!c) return t.back;
  const rank = t.rank[c.r] ?? c.r;
  return lang === 'de' && t.rank[c.r] ? `${t.suit[c.s]}-${rank}` : `${t.suit[c.s]} ${rank}`;
}

// ---------- Geometry (Stichle's helpers) ----------

const F = (n) => Math.round(n * 10) / 10;

/** Catmull-Rom through points [x, y, corner?]; a corner point gets sharp tangents. */
function smooth(pts, closed = true, k = 0.2) {
  const n = pts.length;
  const P = (i) => pts[(i + n) % n];
  let d = `M${F(pts[0][0])},${F(pts[0][1])}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const s1 = p1[2] || (!closed && i === 0);
    const s2 = p2[2] || (!closed && i === n - 2);
    const c1 = s1 ? p1 : [p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k];
    const c2 = s2 ? p2 : [p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k];
    d += `C${F(c1[0])},${F(c1[1])} ${F(c2[0])},${F(c2[1])} ${F(p2[0])},${F(p2[1])}`;
  }
  return d + (closed ? 'Z' : '');
}
const poly = (p) => 'M' + p.map(([x, y]) => `${F(x)},${F(y)}`).join('L') + 'Z';
const ellipse = (cx, cy, rx, ry) => `M${F(cx - rx)},${F(cy)}a${F(rx)},${F(ry)} 0 1 0 ${F(2 * rx)},0a${F(rx)},${F(ry)} 0 1 0 ${F(-2 * rx)},0Z`;
const circle = (cx, cy, r) => ellipse(cx, cy, r, r);
/** A limb: a band of width w along a smooth line of points, square at both ends. */
function limb(pts, w) {
  const out = [];
  const back = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * (w / 2), ny = (dx / len) * (w / 2);
    out.push([pts[i][0] + nx, pts[i][1] + ny]);
    back.unshift([pts[i][0] - nx, pts[i][1] - ny]);
  }
  out[0][2] = 1;
  back[back.length - 1][2] = 1;
  out[out.length - 1][2] = 1;
  back[0][2] = 1;
  return smooth([...out, ...back]);
}

/** Guilloche: n rings of k lobes each, offset in phase so they weave into a band. */
function rosette(cx, cy, R, A, k, n) {
  const pts = 72 + k * 10;
  let d = '';
  for (let j = 0; j < n; j++) {
    const ph = (j / n) * 2 * Math.PI;
    for (let i = 0; i <= pts; i++) {
      const t = (i / pts) * 2 * Math.PI, r = R + A * Math.sin(k * t + ph);
      d += (i ? 'L' : 'M') + F(cx + r * Math.cos(t)) + ' ' + F(cy + r * Math.sin(t));
    }
    d += 'Z';
  }
  return d;
}

/** A compass rose: four long points, four short ones. */
function rose(cx, cy, R1, R2, r) {
  let d = '';
  for (let i = 0; i < 16; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 8, rad = i % 4 === 0 ? R1 : i % 2 === 0 ? R2 : r;
    d += (i ? 'L' : 'M') + F(cx + Math.cos(a) * rad) + ' ' + F(cy + Math.sin(a) * rad);
  }
  return d + 'Z';
}

// ---------- The four signs ----------
// Drawn in a unit box (about −1 to 1, upright) and placed with translate + scale. `fill` is the
// sign, `cut` the lines cut into it (the paper showing through), `line` an outline for a sign held by
// a figure (white on the coloured disc).

const SIGN = {
  // Herz: a full, round heart.
  h: (fill, cut, line, sw) =>
    `<path d="M0,.9C-.36,.62 -.98,.2 -.98,-.34C-.98,-.76 -.62,-.96 -.32,-.96C-.12,-.96 0,-.82 0,-.64C0,-.82 .12,-.96 .32,-.96C.62,-.96 .98,-.76 .98,-.34C.98,.2 .36,.62 0,.9Z" fill="${fill}"${line}/>`,
  // Schellen: a round sleigh bell on its loop, two bands round its waist, the slot below.
  d: (fill, cut, line, sw) =>
    `<circle cx="0" cy="-.76" r=".19" fill="${fill}"${line}/><circle cx="0" cy="-.76" r=".08" fill="${cut}"/>` +
    `<circle cx="0" cy=".1" r=".74" fill="${fill}"${line}/>` +
    `<path d="M-.72,-.04Q0,.14 .72,-.04M-.7,.12Q0,.3 .7,.12" fill="none" stroke="${cut}" stroke-width=".07"/>` +
    `<path d="M-.32,.52H.32M0,.52V.84" fill="none" stroke="${cut}" stroke-width=".08" stroke-linecap="round"/>` +
    `<circle cx="-.34" cy=".52" r=".1" fill="${cut}"/><circle cx=".34" cy=".52" r=".1" fill="${cut}"/>`,
  // Grün: a broad leaf, tip up, on its stalk, with its veins cut in.
  s: (fill, cut, line, sw) =>
    `<path d="M0,-1C.2,-.8 .52,-.62 .74,-.32C.93,-.06 .9,.3 .66,.5C.46,.66 .2,.64 .07,.6L.07,.98H-.07L-.07,.6C-.2,.64 -.46,.66 -.66,.5C-.9,.3 -.93,-.06 -.74,-.32C-.52,-.62 -.2,-.8 0,-1Z" fill="${fill}"${line}/>` +
    `<path d="M0,-.78V.56M0,-.36L.36,-.6M0,-.36L-.36,-.6M0,-.02L.52,-.28M0,-.02L-.52,-.28M0,.3L.48,.1M0,.3L-.48,.1" fill="none" stroke="${cut}" stroke-width=".06" stroke-linecap="round"/>`,
  // Eichel: an acorn standing in its cup, on a short stalk, the cup cross-hatched.
  c: (fill, cut, line, sw) =>
    `<path d="M0,-1C.12,-.95 .45,-.78 .47,-.36C.48,-.1 .42,.06 .34,.12H-.34C-.42,.06 -.48,-.1 -.47,-.36C-.45,-.78 -.12,-.95 0,-1Z" fill="${fill}"${line}/>` +
    `<path d="M-.62,.08C-.64,.5 -.4,.8 0,.82C.4,.8 .64,.5 .62,.08Z" fill="${fill}"${line}/>` +
    `<path d="M-.08,.8H.08V1H-.08Z" fill="${fill}"/>` +
    `<path d="M-.6,.08H.6M-.24,-.66Q-.32,-.36 -.26,-.08" fill="none" stroke="${cut}" stroke-width=".06" stroke-linecap="round"/>` +
    `<path d="M-.44,.24L-.12,.62M-.12,.22L.22,.66M.2,.22L.46,.52M.44,.24L.12,.62M.12,.22L-.22,.66M-.2,.22L-.46,.52" fill="none" stroke="${cut}" stroke-width=".05" stroke-linecap="round"/>`,
};

/**
 * A suit's sign at (x, y), `size` half its height. With `line`, an outline of that colour (for a
 * sign on a coloured ground).
 */
export function sign(suit, x, y, size, fill, cut, line = null) {
  const sw = line ? 2.2 / size : 0;
  const ln = line ? ` stroke="${line}" stroke-width="${F(sw * 100) / 100}" stroke-linejoin="round"` : '';
  return `<g transform="translate(${F(x)} ${F(y)}) scale(${F(size * 100) / 100})">${SIGN[suit](fill, cut, ln, sw)}</g>`;
}

// ---------- Foil and frames ----------

const GOLD = [[0, '#6e4f16'], [0.16, '#b98b34'], [0.3, '#f3dc94'], [0.38, '#fff6d6'], [0.46, '#d6aa4c'], [0.6, '#7b5719'], [0.76, '#c79a3c'], [0.88, '#f0d68a'], [1, '#94702a']];
const foil = (id, stops, k) =>
  `<linearGradient id="${id}" class="foil" data-k="${k}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="250" y2="350" spreadMethod="reflect">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;

const BODONI = `font-family="'Bodoni Moda', Didot, 'Times New Roman', serif"`;
const svg = (defs, body) => `<svg viewBox="0 0 250 350" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>${defs}</defs>${body}</svg>`;
const corners = (inner) => `<g>${inner}</g><g transform="rotate(180 125 175)">${inner}</g>`;
const frames = (st) =>
  `<rect x="11" y="11" width="228" height="328" rx="8" fill="none" stroke="${st}" stroke-width="1"/><rect x="15.5" y="15.5" width="219" height="319" rx="6" fill="none" stroke="${st}" stroke-width="2.2"/>`;
const index = (txt, fill, mark) =>
  `<text x="47" y="63" text-anchor="middle" ${BODONI} font-weight="800" font-size="${txt.length > 1 ? 46 : 50}" style="font-variation-settings:'opsz' 14" fill="${fill}">${txt}</text>${mark}`;
const label = (txt, fill) =>
  `<text x="125" y="318" text-anchor="middle" ${BODONI} font-weight="700" font-size="13" letter-spacing="5" fill="${fill}">${txt.toUpperCase()}</text>`;

/** The pressed-ink shadow and the engravings, once per page. */
export function defs() {
  let d = `<filter id="sm-press" x="-8%" y="-8%" width="116%" height="116%">
    <feOffset in="SourceAlpha" dx="0" dy="1.6" result="o"/><feGaussianBlur in="o" stdDeviation="1" result="b"/>
    <feComposite in="SourceAlpha" in2="b" operator="out" result="inner"/><feFlood flood-color="#000" flood-opacity=".42"/>
    <feComposite in2="inner" operator="in" result="shade"/><feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="shade"/></feMerge>
  </filter>`;
  d += `<path id="sm-ros" d="${rosette(125, 172, 84, 8, 9, 6)}"/>`;
  d += `<path id="sm-ros-sow" d="${rosette(125, 142, 74, 7, 9, 6)}"/>`;
  d += `<path id="sm-bros" d="${rosette(125, 175, 52, 8, 10, 5)}"/>`;
  let waves = '';
  for (let y = 16; y <= 336; y += 7.5) for (let x = 10, i = 0; x <= 240; x += 5, i++) waves += (i ? 'L' : 'M') + F(x) + ' ' + F(y + 3.4 * Math.sin(x / 9 + y * 0.41));
  d += `<path id="sm-waves" d="${waves}"/>`;
  return `<defs>${d}</defs>`;
}

// ---------- Number cards ----------

/**
 * Where the signs sit on 7 to 10: two columns clear of the corner indices, the rest down the middle
 * (the French layouts every player knows).
 */
const L = 95, R = 155, M = 125;
const PIPS = {
  6: [[L, 84], [R, 84], [L, 175], [R, 175], [L, 266], [R, 266]],
  7: [[L, 84], [R, 84], [M, 130], [L, 175], [R, 175], [L, 266], [R, 266]],
  8: [[L, 84], [R, 84], [M, 130], [L, 175], [R, 175], [M, 220], [L, 266], [R, 266]],
  9: [[L, 84], [R, 84], [L, 145], [R, 145], [M, 175], [L, 205], [R, 205], [L, 266], [R, 266]],
  10: [[L, 84], [R, 84], [M, 116], [L, 145], [R, 145], [L, 205], [R, 205], [M, 234], [L, 266], [R, 266]],
};

function numberCard(s, v, ink) {
  const pips = PIPS[v].map(([x, y]) => sign(s, x, y, 17, ink, TINT[s])).join('');
  return svg('', `<rect width="250" height="350" rx="14" fill="${TINT[s]}"/>${frames(ink)}
    <g filter="url(#sm-press)">${pips}</g>
    ${corners(index(String(v), ink, sign(s, 47, 90, 12, ink, TINT[s])))}`);
}

// ---------- The Daus ----------

function dausCard(s, ink, lang) {
  const t = WORDS[lang];
  const tint = TINT[s];
  if (s === 'd') {
    // The Schellen-Daus: the bell above, the sow below it (why players call a Daus a "Sau").
    return svg('', `<rect width="250" height="350" rx="14" fill="${tint}"/>${frames(ink)}
      <use href="#sm-ros-sow" fill="none" stroke="${ink}" stroke-width=".55" opacity=".55"/>
      <circle cx="125" cy="142" r="60" fill="${tint}" stroke="${ink}" stroke-width=".9"/>
      <g filter="url(#sm-press)">${sign(s, 125, 136, 44, ink, tint)}</g>
      <path d="M58,294C86,287 106,289 122,290C140,291 158,287 172,292V299H58Z" fill="${BLACK}"/>
      <g transform="translate(116 292) scale(.86) translate(-118 -292)">${sow(118, 266)}</g>
      <path d="M17,17H76V84Q76,100 60,100H17Z" fill="${tint}"/><path d="M233,333H174V266Q174,250 190,250H233Z" fill="${tint}"/>
      ${frames(ink)}
      ${corners(index('A', ink, sign(s, 47, 90, 12, ink, tint)))}
      ${label(t.rank.A, BLACK)}`);
  }
  return svg('', `<rect width="250" height="350" rx="14" fill="${tint}"/>${frames(ink)}
    <use href="#sm-ros" fill="none" stroke="${ink}" stroke-width=".55" opacity=".55"/>
    <circle cx="125" cy="172" r="70" fill="${tint}" stroke="${ink}" stroke-width=".9"/>
    <circle cx="125" cy="172" r="94" fill="none" stroke="${ink}" stroke-width=".9"/>
    <g filter="url(#sm-press)">${sign(s, 125, 170, 54, ink, tint)}</g>
    ${corners(index('A', ink, sign(s, 47, 90, 12, ink, tint)))}
    ${label(t.rank.A, ink)}`);
}

/** The sow, as a paper cut, standing at (x, ground y − 26): head to the right, a curl of a tail. */
function sow(x, y) {
  const parts = [
    ellipse(x - 2, y, 40, 21),
    smooth([[x + 30, y - 16], [x + 46, y - 18], [x + 56, y - 8], [x + 58, y + 4], [x + 48, y + 12], [x + 32, y + 12]]),
    poly([[x + 56, y - 4], [x + 64, y - 3], [x + 64, y + 7], [x + 56, y + 8]]),
    poly([[x + 38, y - 16], [x + 48, y - 30], [x + 50, y - 14]]),
    limb([[x - 28, y + 12], [x - 30, y + 26]], 8),
    limb([[x - 14, y + 14], [x - 13, y + 26]], 8),
    limb([[x + 14, y + 14], [x + 15, y + 26]], 8),
    limb([[x + 28, y + 12], [x + 30, y + 26]], 8),
  ];
  const tail = `<path d="M${x - 41},${y - 6}c-8,-3 -12,4 -7,7c5,3 9,-4 3,-8" fill="none" stroke="${BLACK}" stroke-width="2.6" stroke-linecap="round"/>`;
  const eye = `<circle cx="${x + 46}" cy="${y - 6}" r="1.8" fill="${LINEN}"/>`;
  return parts.map((d) => `<path d="${d}" fill="${BLACK}"/>`).join('') + tail + eye;
}

// ---------- The court cards: Unter, Ober, König as paper cuts ----------
// Each person is drawn once as parts in the card's space, standing on the ground at y ≈ 292, and
// printed as one black silhouette; linen (collars, a sash, a plume) and gold stay bright, and the
// suit's sign they hold is white with a black edge, against the disc of the suit's ink. As in the old
// German decks, the Ober holds his sign high and the Unter low; the König holds his out at his side.

const head = (cx = 125, cy = 92, rx = 14.5, ry = 17.5) => [
  ['skin', poly([[cx - 6, cy + 12], [cx + 6, cy + 12], [cx + 7, cy + 32], [cx - 7, cy + 32]])],
  ['skin', ellipse(cx, cy, rx, ry)],
];
const legs = (y0 = 230) => [
  ['dark', limb([[113, y0], [110, 286]], 13)],
  ['dark', limb([[137, y0], [140, 286]], 13)],
  ['dark', ellipse(107, 289, 11, 4.5)],
  ['dark', ellipse(143, 289, 11, 4.5)],
];
const feet = () => [['dark', ellipse(110, 291, 10, 4.5)], ['dark', ellipse(140, 291, 10, 4.5)]];

export const COURTS = {
  // Der Unter: a young servant in a doublet and a cap with a feather, one hand on his hip, the
  // other holding the sign low at his side.
  J: {
    sign: [84, 186, 18],
    parts: [
      ...legs(226),
      ['cloth', smooth([[108, 121], [125, 127], [142, 121], [154, 132, 1], [150, 178], [158, 234, 1], [92, 234, 1], [100, 178], [96, 132, 1]])],
      ['dark', poly([[100, 176], [150, 176], [151, 184], [99, 184]])],
      ['gold', circle(125, 180, 3.6)],
      ['cloth', limb([[152, 134], [168, 158], [150, 178]], 12)],
      ['cloth', limb([[98, 134], [88, 152], [86, 166]], 12)],
      ['skin', circle(86, 169, 5.5)],
      ...head(),
      ['linen', smooth([[110, 120], [125, 132], [140, 120], [143, 128], [125, 141], [107, 128]])],
      ['hair', smooth([[110, 92], [111, 78], [125, 74], [139, 78], [140, 92], [136, 84], [125, 82], [114, 84]])],
      ['cloth', smooth([[106, 80, 1], [108, 68], [120, 62], [134, 63], [144, 70], [146, 80, 1]])],
      ['linen', smooth([[140, 68], [150, 52], [164, 44], [174, 46], [162, 52], [150, 62], [144, 72]])],
    ],
  },
  // Der Ober: a courtier in a long coat and a broad hat with a plume, a sash across him, a sword at
  // his hip, his sign raised high.
  Q: {
    sign: [170, 50, 18],
    parts: [
      ...legs(240),
      ['cloth', smooth([[108, 121], [125, 127], [142, 121], [156, 132, 1], [152, 180], [166, 248, 1], [84, 248, 1], [98, 180], [94, 132, 1]])],
      ['dark', limb([[100, 190], [72, 270]], 4.5)],
      ['gold', circle(102, 186, 4.5)],
      ['linen', limb([[104, 132], [148, 196]], 8)],
      ['cloth', limb([[98, 134], [82, 160], [98, 180]], 13)],
      ['cloth', limb([[152, 132], [166, 110], [170, 84]], 13)],
      ['skin', circle(170, 77, 5.8)],
      ...head(),
      ['linen', smooth([[106, 121], [125, 134], [144, 121], [148, 132], [125, 147], [102, 132]])],
      ['hair', smooth([[109, 90], [110, 104], [114, 120], [108, 118], [104, 100]])],
      ['hair', smooth([[141, 90], [140, 104], [136, 120], [142, 118], [146, 100]])],
      ['hat', ellipse(125, 76, 32, 6.5)],
      ['hat', smooth([[107, 76, 1], [109, 60], [125, 53], [141, 60], [143, 76, 1]])],
      ['linen', smooth([[110, 62], [96, 46], [78, 40], [64, 46], [80, 49], [95, 56], [106, 69]])],
    ],
  },
  // Der König: in a long robe and an ermine collar, crowned, the sceptre in one hand and his sign
  // held out in the other.
  K: {
    sign: [70, 146, 18],
    parts: [
      ['cloth2', smooth([[96, 124, 1], [154, 124, 1], [172, 200], [178, 290, 1], [72, 290, 1], [78, 200]])],
      ['cloth', smooth([[108, 121], [125, 128], [142, 121], [156, 134, 1], [154, 180], [166, 289, 1], [84, 289, 1], [96, 180], [94, 134, 1]])],
      ['gold', poly([[121, 150], [129, 150], [131, 289], [119, 289]])],
      ...feet(),
      ['cloth', limb([[98, 134], [82, 150], [74, 166]], 15)],
      ['skin', circle(73, 170, 6)],
      ['cloth', limb([[152, 134], [162, 162], [158, 190]], 16)],
      ['gold', poly([[160, 82], [164.5, 82], [163.5, 210], [160.5, 210]])],
      ['gold', smooth([[162, 62], [170, 72], [162, 84], [154, 72]])],
      ['skin', circle(158, 192, 6.2)],
      ['wool', smooth([[90, 128], [125, 146], [160, 128], [165, 142], [125, 162], [85, 142]])],
      ['dark', 'M101,140l2,5l2,-5zM117,148l2,5l2,-5zM131,148l2,5l2,-5zM147,140l2,5l2,-5zM109,150l2,5l2,-5zM139,150l2,5l2,-5z'],
      ['hair', smooth([[106, 82], [110, 70], [125, 66], [140, 70], [144, 82], [146, 118], [138, 124], [140, 96], [125, 90], [110, 96], [112, 124], [104, 118]])],
      ['skin', ellipse(125, 92, 14, 17)],
      ['hair', smooth([[111, 100], [114, 120], [125, 140, 1], [136, 120], [139, 100], [134, 108], [125, 110], [116, 108]])],
      ['gold', poly([[108, 82], [108, 60], [115, 70], [120, 56], [125, 68], [130, 56], [135, 70], [142, 60], [142, 82]])],
    ],
  },
};

/** A court's person as a paper cut, with its sign. */
function person(r, s, gold) {
  const fig = COURTS[r];
  let out = '';
  for (const [role, d] of fig.parts) {
    // Gold edged in black, so a crown still reads against Schellen's golden disc.
    if (role === 'gold') out += `<path d="${d}" fill="${gold}" stroke="${BLACK}" stroke-width="1.6" stroke-linejoin="round"/>`;
    else if (role === 'wool' || role === 'linen') out += `<path d="${d}" fill="${LINEN}" stroke="${BLACK}" stroke-width="2.2" stroke-linejoin="round"/>`;
    else out += `<path d="${d}" fill="${BLACK}" stroke="${BLACK}" stroke-width="1.2" stroke-linejoin="round"/>`;
  }
  const [x, y, size] = fig.sign;
  return out + sign(s, x, y, size, LINEN, BLACK, BLACK);
}

/**
 * A court card. style 'A': the person standing, full length, against the disc of the suit's ink.
 * style 'B': double-headed, as in the old decks: the upper half of the person twice, the card reads
 * the same either way up.
 */
function courtCard(s, r, ink, disc, lang, style, u) {
  const t = WORDS[lang];
  const tint = TINT[s];
  const g = `url(#sm-gold-${u})`;
  const plates = `<path d="M17,17H76V84Q76,100 60,100H17Z" fill="${tint}"/><path d="M233,333H174V266Q174,250 190,250H233Z" fill="${tint}"/>`;
  const idx = corners(index(INDEX[r], ink, sign(s, 47, 90, 12, ink, tint)));
  if (style === 'B') {
    const half = `<g clip-path="url(#sm-half-${u})"><g transform="translate(0 -26)">${person(r, s, g)}</g></g>`;
    return svg(foil(`sm-gold-${u}`, GOLD, 9) + `<clipPath id="sm-half-${u}"><rect x="0" y="0" width="250" height="175"/></clipPath><clipPath id="sm-card-${u}"><rect x="17" y="17" width="216" height="316" rx="5"/></clipPath>`,
      `<rect width="250" height="350" rx="14" fill="${tint}"/>
      <g clip-path="url(#sm-card-${u})"><ellipse cx="125" cy="175" rx="104" ry="150" fill="${disc}"/></g>
      ${half}<g transform="rotate(180 125 175)">${half}</g>
      <path d="M30,175H220" stroke="${BLACK}" stroke-width="2.4"/>
      ${plates}${frames(ink)}${idx}`);
  }
  return svg(foil(`sm-gold-${u}`, GOLD, 9), `<rect width="250" height="350" rx="14" fill="${tint}"/>
    <circle cx="125" cy="150" r="88" fill="${disc}"/><circle cx="125" cy="150" r="96" fill="none" stroke="${ink}" stroke-width="1.2"/>
    <path d="M30,294C70,284 100,288 125,290C150,292 185,284 220,294V300H30Z" fill="${BLACK}"/>
    <g transform="translate(125 294) scale(.92) translate(-125 -292)">${person(r, s, g)}</g>
    ${plates}${frames(ink)}${idx}
    ${label(t.rank[r], BLACK)}`);
}

// ---------- The back ----------

function backCard(u) {
  const g = `url(#sm-gold-${u})`;
  const four = SUITS.map((s, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 2, x = 125 + Math.cos(a) * 84, y = 175 + Math.sin(a) * 84;
    return `<circle cx="${F(x)}" cy="${F(y)}" r="14" fill="${BORDEAUX}" stroke="${g}" stroke-width="1"/>${sign(s, x, y, 8.5, g, BORDEAUX)}`;
  }).join('');
  return svg(foil(`sm-gold-${u}`, GOLD, 9) + `<clipPath id="sm-clip-${u}"><rect x="12" y="12" width="226" height="326" rx="8"/></clipPath>`,
    `<rect width="250" height="350" rx="14" fill="${PAPER}"/><rect x="12" y="12" width="226" height="326" rx="8" fill="${BORDEAUX}"/>
    <g clip-path="url(#sm-clip-${u})"><use href="#sm-waves" fill="none" stroke="${g}" stroke-width=".55" opacity=".75"/></g>
    <rect x="12" y="12" width="226" height="326" rx="8" fill="none" stroke="${g}" stroke-width="1.4"/>
    <circle cx="125" cy="175" r="68" fill="${BORDEAUX}" stroke="${g}" stroke-width="1.6"/>
    <use href="#sm-bros" fill="none" stroke="${g}" stroke-width=".6"/>
    <circle cx="125" cy="175" r="40" fill="${BORDEAUX}" stroke="${g}" stroke-width="1"/>
    <path d="${rose(125, 175, 34, 22, 9)}" fill="${g}"/>${four}`);
}

/**
 * One card as SVG. `uid` keeps each card's own gradient and clip ids apart on a page.
 * @param {string | null} id  "h-10", "c-Q" … or null for the back
 * @param {{ lang?: 'de' | 'en', uid?: string | number, courts?: 'A' | 'B', eichel?: 'umber' | 'black' }} [o]
 */
export function card(id, { lang = 'de', uid = 0, courts = 'A', eichel = 'umber' } = {}) {
  const c = parse(id);
  const u = String(uid);
  if (!c) return backCard(u);
  const ink = INKS[eichel][c.s];
  if (c.r === 'A') return dausCard(c.s, ink, lang);
  if (c.r === 'J' || c.r === 'Q' || c.r === 'K') return courtCard(c.s, c.r, ink, DISC[eichel][c.s], lang, courts, u);
  return numberCard(c.s, Number(c.r), ink);
}
