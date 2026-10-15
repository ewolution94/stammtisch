<!--
  Round the table (Stichle's, the user's pick B, 2026-10-15): each other player's place card on the
  rail where they sit (src/lib/table.ts → seatSpots), their cards face down under it. The spots are
  over the cloth, which holds them (the felt is position: relative); the table passes each card in.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Spot } from '../lib/table';

  let {
    spots,
    held,
    max = 8,
    label,
    chip,
  }: {
    spots: Spot[];
    /** How many cards a seat holds. */
    held: (seat: number) => number;
    /** The most backs drawn under a card. */
    max?: number;
    /** What the backs say to a screen reader; none: they're only a picture. */
    label?: (seat: number) => string;
    chip: Snippet<[Spot]>;
  } = $props();
</script>

{#each spots as spot (spot.seat)}
  {@const count = Math.min(held(spot.seat), max)}
  <div class="spot" style:left="{spot.x}px" style:top="{spot.y}px" style:--w="{spot.w}px">
    {@render chip(spot)}
    <span class="held" aria-label={label?.(spot.seat)} aria-hidden={label ? undefined : 'true'}>
      {#each { length: count } as _, k (k)}<i style:--k={k - (count - 1) / 2}></i>{/each}
    </span>
  </div>
{/each}

<style>
  /* A seat round the table: its card centred on the rail it faces (on the far rail half over it), its
     hand face down under the card, below the tags that hang 9 px under it (Re, Gesund, greift an). */
  .spot {
    position: absolute;
    z-index: 2;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    translate: -50% -26px;
  }
  .spot :global(.seat) {
    width: var(--w);
  }
  /* Their hand, face down: a little fan of backs. */
  .held {
    position: relative;
    height: 16px;
    width: 40px;
  }
  .held i {
    position: absolute;
    left: calc(50% - 5px);
    bottom: 0;
    width: 10px;
    height: 14px;
    border-radius: 1.5px;
    background: var(--back-ground);
    box-shadow: 0 0 0 1px var(--back-line), inset 0 0 0 2px rgb(255 255 255 / 0.08);
    transform-origin: 50% 120%;
    rotate: calc(var(--k) * 9deg);
  }
</style>
