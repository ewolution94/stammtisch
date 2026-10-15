<!--
  On a board (Stichle's, the user's pick C, 2026-10-15): a dark plaque above the cloth with everyone's
  small place card in playing order, you last, three to a row; the cloth then holds only the play.
  The table passes each card in.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let { order, chip }: { order: number[]; chip: Snippet<[number]> } = $props();
</script>

<div class="boardrow" style:--cols={Math.min(3, order.length)}>
  {#each order as seat (seat)}<div class="tile">{@render chip(seat)}</div>{/each}
</div>

<style>
  .boardrow {
    flex: none;
    display: grid;
    grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
    gap: 6px;
    margin: 10px 0 0;
    padding: 7px;
    border-radius: 16px;
    background: rgb(18 11 7 / 0.55);
    box-shadow: inset 0 0 0 1px rgb(236 230 214 / 0.08);
  }
  .tile {
    position: relative;
    min-width: 0;
  }
</style>
