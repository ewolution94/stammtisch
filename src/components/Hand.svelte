<!--
  Your hand: a fan along the bottom of the table, two rows once it's too many cards for one. Folio's
  card kit (vendor/ewo/elements/card-fan.js and card-hand.js, from Stichle's hand): run a thumb along
  it and the cards lift under it; drag one up or flick it, and it flies to the table; or tap a card to
  lift it and tap it again to play it. A card you may not play lifts, refuses with a shake and drops
  back. Hold a card still to look at it big. Every card is also a button, for the keyboard.

  Stammtisch's own on top: cards are keyed by instance and keep their key while held (rekey: Doppelkopf
  has every card twice); `select` turns the fan into picking several cards (the Skat to put back,
  poverty's three), taps toggle and nothing flies; `intercept` stops a card before it flies (a
  Mau-Mau Unter asks for a wish first); `marked` is a card to point out (the one just drawn).

  On the desktop table the hand can lie flat instead (`flat`, Stichle's): side by side, every card
  whole, the ones you may play standing a little higher (src/lib/table.ts → flatLayout); with
  `hotkeys`, 1 to 9 and 0 play the first ten cards (or pick them, when picking), ← and → move through
  the hand, Enter plays. `scale` is that table's size (deskScale): the cards, the box and the keys
  grow with it.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { nameOf } from '../lib/deck';
  import { flying } from '../lib/flight.svelte';
  import { i18n } from '../lib/i18n.svelte';
  import { flatLayout, idOfKey, rekey } from '../lib/table';
  import Card from './Card.svelte';
  import { fanLayout, fanTransform, flightTransform } from '../../vendor/ewo/elements/card-fan.js';
  import { handGestures, type Dragged } from '../../vendor/ewo/elements/card-hand.js';

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
    flat = false,
    hotkeys = false,
    scale = 1,
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
    /** Laid out flat, side by side (the desktop table), instead of the fan. */
    flat?: boolean;
    /** The number keys, the arrows and Enter play (the desktop table). */
    hotkeys?: boolean;
    /** The desktop table's size. */
    scale?: number;
  } = $props();

  const FLY_MS = 380;
  let box: HTMLDivElement | undefined = $state();
  let width = $state(360);
  let sel: string | null = $state(null);
  /** The card in the air: still drawn here until it has landed, but out of the fan. */
  let air = $state<{ key: string; id: string; transform: string; landed: boolean } | null>(null);
  let shaking: string | null = $state(null);
  /** The card under a finger that's dragging it, and where it is. */
  let drag = $state<Dragged | null>(null);

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
  // A lifted card drops back on a tap or click anywhere outside the hand, or on Escape: on a laptop it
  // had no way down (Stichle dc1b4d5; the user, 2026-10-13). The kit's gestures listen on the hand's
  // own box only, so a press inside it lifts as before.
  $effect(() => {
    if (!sel) return;
    const away = (e: PointerEvent) => {
      if (!(e.target instanceof Node && box?.contains(e.target))) sel = null;
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') sel = null;
    };
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', away, true);
      document.removeEventListener('keydown', escape);
    };
  });
  // Landed, and the server's hand no longer has it: from now on it's the table's to draw.
  $effect(() => {
    if (air?.landed && !items.some((c) => c.key === air!.key)) air = null;
  });
  /** Drawn in a steady order, so the card in the air keeps its element (and its transition). */
  const list = $derived(air && !items.some((c) => c.key === air!.key) ? [...items, { id: air.id, key: air.key }] : items);
  const picked = $derived(new Set(select?.picked ?? []));

  // The fan from the kit: few cards are held bigger, a full hand shrinks to fit (never below 58 px,
  // for Doppelkopf's twelve) and goes to two rows; a laptop's wider table lets them grow a little.
  const keys = $derived(items.filter((c) => c.key !== air?.key).map((c) => c.key));
  const sizes = $derived<[number, number, number]>(width > 600 ? [124 * scale, 112 * scale, 100 * scale] : [104, 92, 84]);
  // The hand's box keeps one height all game: the tallest any hand gets at this width (a few cards,
  // held big), with the cards at its foot. A card leaving the hand or one drawn changes their size,
  // never the box, so the table above never moves (Stichle e28b833; the user, 2026-10-13: "it cannot
  // jump").
  const room = $derived(
    flat ? 0 : Math.max(...Array.from({ length: 20 }, (_, i) => fanLayout(Array.from({ length: i + 1 }, (_, k) => `${k}`), { width, count: i + 1, sizes, min: 58 }).height)),
  );
  const natural = $derived(fanLayout(keys, { width, count: cards.length, sizes, min: 58 }));
  // Flat, the cards you may play now stand a little higher; the box keeps one height there too.
  const raise = $derived(flat && canPlay && !select ? new Set(keys.filter((k) => legal.includes(idOf(k)))) : new Set<string>());
  const layout = $derived(flat ? flatLayout(keys, width, { raise, scale }) : fanLayout(keys, { width, count: cards.length, sizes, min: 58, top: 22 + room - natural.height }));
  const cw = $derived(layout.cw);
  const height = $derived(layout.height);
  const places = $derived(layout.places);
  const lifted = (key: string) => key === sel || picked.has(key);

  function transformOf(key: string) {
    if (drag?.key === key) return `translate(${drag.x}px, ${drag.y}px) rotate(${drag.r}deg) scale(1.12)`;
    return fanTransform(layout, key, { lifted: lifted(key) });
  }

  // The gestures from the kit: scrub, drag or flick up, tap twice, refuse, hold to look; in select
  // mode a tap toggles.
  $effect(() => {
    if (!box) return;
    const gestures = handGestures(box, {
      fan: () => layout,
      lifted: () => sel,
      lift: (key) => (sel = key),
      enabled: () => !air && keys.length > 0,
      mode: () => (select ? 'select' : 'play'),
      raised: () => picked,
      canPlay: () => canPlay,
      playable: (key) => legal.includes(idOf(key)),
      play,
      refuse,
      toggle: (key) => select?.ontoggle(key, idOf(key)),
      inspect: (key) => oninspect(idOf(key)),
      drag: (d) => (drag = d),
    });
    return () => gestures.destroy();
  });

  /** A card on its way: a question first if it needs one (it stays lifted), else it flies. */
  function play(key: string) {
    if (intercept?.(idOf(key))) return;
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
      air = { key, id, landed: false, transform: flightTransform(layout, box.getBoundingClientRect(), to) };
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
    // Taps arrive as pointer events (the kit's gestures); this is Enter or Space on a focused card.
    if (e.detail !== 0) return;
    tryPlay(key);
  }

  /** A card chosen from the keyboard: picked when picking, else lifted and played if it may be. */
  function tryPlay(key: string) {
    if (select) return select.ontoggle(key, idOf(key));
    sel = key;
    if (!canPlay) return;
    if (!legal.includes(idOf(key))) return refuse(key);
    play(key);
  }

  // The keyboard (the desktop table): a number plays that card, the arrows lift the next one, Enter
  // plays the lifted card. Never while you type, or while a sheet, the guide or a dialog is open.
  $effect(() => {
    if (!hotkeys) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const at = e.target instanceof Element ? e.target : null;
      if (at?.closest('input, textarea, select, [contenteditable]')) return;
      if (document.querySelector('ewo-sheet[open], ewo-guide[open], dialog[open], .veil')) return;
      if (/^[0-9]$/.test(e.key)) {
        const key = keys[e.key === '0' ? 9 : Number(e.key) - 1];
        if (!key || air) return;
        e.preventDefault();
        tryPlay(key);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (!keys.length || (!canPlay && !select)) return;
        e.preventDefault();
        const now = sel ? keys.indexOf(sel) : -1;
        sel = keys[e.key === 'ArrowRight' ? (now + 1) % keys.length : now <= 0 ? keys.length - 1 : now - 1];
      } else if (e.key === 'Enter' && sel && (!at || at === document.body)) {
        e.preventDefault();
        tryPlay(sel);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
</script>

<div
  class="hand"
  class:picking={Boolean(select)}
  bind:this={box}
  bind:clientWidth={width}
  style:height="{height}px"
  style:--scale={scale}
  role="group"
  data-press="own"
  aria-label={i18n.lang === 'de' ? 'Deine Karten' : 'Your cards'}
>
  {#each list as c (c.key)}
    {@const p = places.get(c.key)}
    <button
      type="button"
      class="slot"
      class:lifted={lifted(c.key)}
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
  {#if hotkeys && flat}
    <!-- The keys under the first ten cards; gold under the ones you may play (or pick) now. -->
    {#each keys.slice(0, 10) as key, i (key)}
      {@const p = places.get(key)}
      {#if p}<span class="key" class:on={select ? true : canPlay && legal.includes(idOf(key))} style:left="{p.x + cw / 2}px" style:top="{height - 24 * scale}px" aria-hidden="true">{(i + 1) % 10}</span>{/if}
    {/each}
  {/if}
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
  .key {
    position: absolute;
    translate: -50% 0;
    min-width: calc(12px * var(--scale, 1));
    padding: calc(3px * var(--scale, 1)) calc(6px * var(--scale, 1));
    border-radius: calc(4px * var(--scale, 1));
    font: 600 calc(12px * var(--scale, 1)) / 1 var(--ewo-mono);
    text-align: center;
    color: var(--on-cloth-2);
    opacity: 0.6;
    transition:
      background-color 0.2s,
      color 0.2s,
      opacity 0.2s,
      left 0.24s cubic-bezier(0.2, 0.8, 0.2, 1);
    pointer-events: none;
  }
  .key.on {
    background: var(--gold-hi);
    color: var(--ink);
    opacity: 1;
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
