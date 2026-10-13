<!--
  Your hand: a fan along the bottom of the table, two rows once it's too many cards for one. From
  Stichle's Hand.svelte: run a thumb along it and the cards lift under it; drag one up or flick it,
  and it flies to the table; or tap a card to lift it and tap it again to play it. A card you may not
  play lifts, refuses with a shake and drops back. Hold a card still to look at it big.

  What's new here: cards are keyed by instance (Doppelkopf has every card twice); `select` turns the
  fan into picking several cards (the Skat to put back, poverty's three), taps toggle and nothing
  flies; `intercept` stops a card before it flies (a Mau-Mau Unter asks for a wish first); `marked`
  is a card to point out (the one just drawn).
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { nameOf } from '../lib/deck';
  import { flying } from '../lib/flight.svelte';
  import { i18n } from '../lib/i18n.svelte';
  import { idOfKey, rekey } from '../lib/table';
  import Card from './Card.svelte';

  type Target = { x: number; y: number; rot: number; width: number };

  let {
    cards,
    legal,
    canPlay,
    onplay,
    target,
    oninspect,
    onrefuse,
    select = null,
    intercept = null,
    marked = null,
  }: {
    cards: string[];
    /** What may be played now; empty when it's not your move. */
    legal: string[];
    canPlay: boolean;
    /** Sends the move; rejects with the server's reason. */
    onplay: (card: string) => Promise<void>;
    /** Where your card lands (page coordinates), or null to let it go without a flight. */
    target: (card: string) => Target | null;
    oninspect: (card: string) => void;
    /** A card that may not be played now was tried. */
    onrefuse: (card: string) => void;
    /** Picking cards: the keys picked so far, and the toggle. */
    select?: { picked: string[]; ontoggle: (key: string, id: string) => void } | null;
    /** A card that needs a question before it's played: true stops it (it stays lifted). */
    intercept?: ((card: string) => boolean) | null;
    marked?: string | null;
  } = $props();

  const FLY_MS = 380;
  let box: HTMLDivElement | undefined = $state();
  let width = $state(360);
  let sel: string | null = $state(null);
  /** The card in the air: still drawn here until it has landed, but out of the fan. */
  let air = $state<{ key: string; id: string; transform: string; landed: boolean } | null>(null);
  let shaking: string | null = $state(null);
  /** The card under a finger that's dragging it, and where it is. */
  let drag = $state<{ key: string; x: number; y: number; r: number } | null>(null);

  // Each card's key, kept while it's held (see rekey): built on the last ones given out, with the
  // card in the air as the one of two equal cards that leaves.
  let given: { id: string; key: string }[] = [];
  const items = $derived.by(() => (given = rekey(cards, given, untrack(() => air?.key ?? null))));
  const idOf = (key: string) => items.find((c) => c.key === key)?.id ?? air?.id ?? idOfKey(key);

  const els = new Map<string, HTMLElement>();
  function register(node: HTMLElement, key: string) {
    els.set(key, node);
    return {
      update(next: string) {
        els.delete(key);
        key = next;
        els.set(key, node);
      },
      destroy: () => els.delete(key),
    };
  }

  // A lifted card that left the hand is no longer lifted.
  $effect(() => {
    if (sel && !items.some((c) => c.key === sel)) sel = null;
  });
  // Landed, and the server's hand no longer has it: from now on it's the table's to draw.
  $effect(() => {
    if (air?.landed && !items.some((c) => c.key === air!.key)) air = null;
  });
  /** Drawn in a steady order, so the card in the air keeps its element (and its transition). */
  const list = $derived(air && !items.some((c) => c.key === air!.key) ? [...items, { id: air.id, key: air.key }] : items);
  const fan = $derived(items.filter((c) => c.key !== air?.key));

  // Few cards are held bigger; a full hand shrinks to fit, never below 58 px.
  const cap = $derived(width > 600 ? [124, 112, 100] : [104, 92, 84]);
  const cw = $derived(Math.round(Math.max(58, Math.min(cards.length <= 3 ? cap[0] : cards.length <= 6 ? cap[1] : cap[2], width / (cards.length * 0.62 + 0.6)))));
  const ch = $derived(Math.round(cw * 1.4));
  const rows = $derived(fan.length > 1 && (width - 8 - cw) / (fan.length - 1) < 24 ? 2 : 1);
  const height = $derived(rows === 2 ? Math.round(ch * 1.45) + 30 : ch + 30);
  const picked = $derived(new Set(select?.picked ?? []));

  /** Each card's place in the fan: x, y (top left), turn, and which is on top. */
  const places = $derived.by(() => {
    const out = new Map<string, { x: number; y: number; r: number; z: number }>();
    const split = rows === 2 ? Math.ceil(fan.length / 2) : fan.length;
    const parts = rows === 2 ? [fan.slice(0, split), fan.slice(split)] : [fan];
    parts.forEach((row, ri) => {
      const m = row.length;
      const step = m > 1 ? Math.min(cw * 0.62, (width - 8 - cw) / (m - 1)) : 0;
      const x0 = (width - (cw + step * (m - 1))) / 2;
      const front = ri === parts.length - 1;
      const baseY = height - ch - 8 - (front ? 0 : Math.round(ch * 0.45));
      row.forEach((c, i) => {
        const t = m > 1 ? (i - (m - 1) / 2) / ((m - 1) / 2) : 0;
        out.set(c.key, { x: x0 + i * step, y: baseY + t * t * 8, r: t * 7, z: (front ? 100 : 0) + i + 1 });
      });
    });
    return out;
  });

  const lift = (key: string) => (key === sel || picked.has(key) ? 24 : 0);

  function transformOf(key: string) {
    if (drag?.key === key) return `translate(${drag.x}px, ${drag.y}px) rotate(${drag.r}deg) scale(1.12)`;
    const p = places.get(key);
    if (!p) return '';
    const up = lift(key);
    return `translate(${p.x.toFixed(1)}px, ${(p.y - up).toFixed(1)}px) rotate(${p.r.toFixed(2)}deg) scale(${up ? 1.05 : 1})`;
  }

  // ---- finding the card under a finger -------------------------------------------------------

  function local(e: PointerEvent) {
    const r = box!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function at(x: number, y: number): string | null {
    let best: string | null = null;
    let bestZ = -1;
    for (const [key, p] of places) {
      const top = p.y - lift(key);
      if (x >= p.x && x <= p.x + cw && y >= top - 6 && y <= p.y + ch && p.z > bestZ) {
        best = key;
        bestZ = p.z;
      }
    }
    if (best) return best;
    let near: string | null = null;
    let dist = Infinity;
    for (const [key, p] of places) {
      const d = Math.abs(x - (p.x + cw / 2)) + Math.abs(y - (p.y + ch / 2)) * 0.3;
      if (d < dist) {
        dist = d;
        near = key;
      }
    }
    return near;
  }

  // ---- the gesture ---------------------------------------------------------------------------

  let down: { x: number; y: number; key: string | null; was: string | null; moved: boolean; refused: boolean } | null = null;
  let flick = { x: 0, y: 0, t: 0, vx: 0, vy: 0, ox: 0, oy: 0 };
  let press = 0;

  function pointerdown(e: PointerEvent) {
    if (!box || air || !fan.length || e.button > 0) return;
    box.setPointerCapture(e.pointerId);
    const p = local(e);
    const key = at(p.x, p.y);
    down = { x: p.x, y: p.y, key, was: sel, moved: false, refused: false };
    if (key && !select) sel = key;
    clearTimeout(press);
    press = window.setTimeout(() => {
      if (down && !down.moved && !drag && down.key) {
        const key = down.key;
        down = null;
        oninspect(idOf(key));
      }
    }, 480);
  }

  function pointermove(e: PointerEvent) {
    if (!down) return;
    const p = local(e);
    const now = performance.now();
    if (drag) {
      const dt = Math.max(1, now - flick.t);
      flick.vx = flick.vx * 0.6 + ((p.x - flick.x) / dt) * 0.4;
      flick.vy = flick.vy * 0.6 + ((p.y - flick.y) / dt) * 0.4;
      flick = { ...flick, x: p.x, y: p.y, t: now };
      drag = { key: drag.key, x: p.x - flick.ox, y: p.y - flick.oy, r: Math.max(-18, Math.min(18, flick.vx * 22)) };
      return;
    }
    if (Math.hypot(p.x - down.x, p.y - down.y) > 7) {
      down.moved = true;
      clearTimeout(press);
    }
    if (select) return;
    if (sel && down.y - p.y > 22) {
      const id = idOf(sel);
      if (canPlay && legal.includes(id)) {
        if (intercept?.(id)) {
          down = null;
          return;
        }
        const pl = places.get(sel)!;
        flick = { x: p.x, y: p.y, t: now, vx: 0, vy: 0, ox: p.x - pl.x, oy: p.y - (pl.y - 24) };
        drag = { key: sel, x: pl.x, y: pl.y - 24, r: pl.r };
      } else if (canPlay && !down.refused) {
        down.refused = true;
        refuse(sel);
      }
      return;
    }
    const key = at(p.x, p.y);
    if (key && key !== sel) sel = key;
  }

  function pointerup() {
    clearTimeout(press);
    if (drag) {
      const key = drag.key;
      const gone = drag.y + ch / 2 < 0 || flick.vy < -0.5;
      if (gone) void send(key);
      drag = null;
    } else if (down && down.key && !down.moved) {
      if (select) select.ontoggle(down.key, idOf(down.key));
      else if (down.key === down.was) tryPlay(down.key);
    }
    down = null;
  }

  function pointercancel() {
    clearTimeout(press);
    drag = null;
    down = null;
  }

  function tryPlay(key: string) {
    if (!canPlay) return;
    const id = idOf(key);
    if (!legal.includes(id)) return refuse(key);
    if (intercept?.(id)) return;
    void send(key);
  }

  function refuse(key: string) {
    shaking = key;
    setTimeout(() => shaking === key && (shaking = null), 420);
    onrefuse(idOf(key));
  }

  /** Flies the card to its place on the table, and sends the move; back into the hand if refused. */
  async function send(key: string) {
    const id = idOf(key);
    const el = els.get(key);
    const to = target(id);
    if (box && el && to) {
      const r = box.getBoundingClientRect();
      const scale = to.width / cw;
      air = { key, id, landed: false, transform: `translate(${(to.x - r.left - cw / 2).toFixed(1)}px, ${(to.y - r.top - ch / 2).toFixed(1)}px) rotate(${to.rot}deg) scale(${scale.toFixed(3)})` };
      flying(id, FLY_MS);
      setTimeout(() => {
        if (air?.key === key) air = { ...air, landed: true };
      }, FLY_MS + 40);
    }
    sel = null;
    try {
      await onplay(id);
    } catch {
      air = null;
      flying('', 0);
      sel = key;
      refuse(key);
    }
  }

  function keyboard(e: MouseEvent, key: string) {
    // Taps arrive as pointer events above; this is Enter or Space on a focused card.
    if (e.detail !== 0) return;
    if (select) return select.ontoggle(key, idOf(key));
    sel = key;
    tryPlay(key);
  }
</script>

<div
  class="hand"
  class:picking={Boolean(select)}
  bind:this={box}
  bind:clientWidth={width}
  style:height="{height}px"
  role="group"
  data-press="own"
  aria-label={i18n.lang === 'de' ? 'Deine Karten' : 'Your cards'}
  onpointerdown={pointerdown}
  onpointermove={pointermove}
  onpointerup={pointerup}
  onpointercancel={pointercancel}
  oncontextmenu={(e) => e.preventDefault()}
>
  {#each list as c (c.key)}
    {@const p = places.get(c.key)}
    <button
      type="button"
      class="slot"
      class:lifted={c.key === sel || picked.has(c.key)}
      class:picked={picked.has(c.key)}
      class:marked={marked !== null && c.id === marked}
      class:dim={!select && canPlay && !legal.includes(c.id)}
      class:dragging={drag?.key === c.key}
      class:air={air?.key === c.key}
      class:shake={shaking === c.key}
      style:width="{cw}px"
      style:transform={air && air.key === c.key ? air.transform : transformOf(c.key)}
      style:z-index={air?.key === c.key || drag?.key === c.key ? 300 : (p?.z ?? 0)}
      aria-label={nameOf(c.id, i18n.lang)}
      aria-pressed={select ? picked.has(c.key) : undefined}
      aria-disabled={!select && (!canPlay || !legal.includes(c.id))}
      onclick={(e) => keyboard(e, c.key)}
      use:register={c.key}
    >
      <Card id={c.id} />
    </button>
  {/each}
</div>

<style>
  .hand {
    position: relative;
    width: 100%;
    touch-action: none;
    -webkit-user-select: none;
    user-select: none;
    -webkit-touch-callout: none;
  }
  .slot {
    position: absolute;
    left: 0;
    top: 0;
    padding: 0;
    border: 0;
    background: none;
    border-radius: 6px;
    transform-origin: 50% 50%;
    transition: transform 0.24s cubic-bezier(0.2, 0.8, 0.2, 1), filter 0.2s;
    will-change: transform;
    -webkit-tap-highlight-color: transparent;
    cursor: grab;
  }
  .picking .slot {
    cursor: pointer;
  }
  .slot:focus-visible {
    outline: 3px solid var(--gold);
    outline-offset: 2px;
  }
  .slot.lifted :global(.face) {
    box-shadow: 0 2px 2px rgb(5 8 25 / 0.3), 0 18px 26px -12px rgb(5 8 25 / 0.75);
  }
  /* Picked to put back or give: a gold edge. */
  .slot.picked :global(.face) {
    box-shadow: 0 0 0 2.5px var(--gold-hi), 0 18px 26px -12px rgb(5 8 25 / 0.75);
  }
  /* The card just drawn: a gold hairline until it's played or kept. */
  .slot.marked :global(.face) {
    box-shadow: 0 0 0 2px var(--gold), 0 0 14px 2px rgb(243 220 148 / 0.45);
  }
  /* Not playable now: the paper darkens a little, as if in shadow. */
  .slot.dim {
    filter: brightness(0.74) saturate(0.85);
  }
  .slot.dragging {
    transition: none;
    cursor: grabbing;
  }
  .slot.air {
    transition: transform 0.38s cubic-bezier(0.16, 0.84, 0.26, 1);
    pointer-events: none;
  }
  .slot.shake {
    animation: shake 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97);
  }
  @keyframes shake {
    20%,
    60% {
      translate: -5px 0;
    }
    40%,
    80% {
      translate: 5px 0;
    }
  }
</style>
