<!--
  The desktop table (Stichle's spread, the user's pick C; Stammtisch's go 2026-10-15): from a window of
  1100 × 740 up, the cloth fills the window and keeps its rail. The others sit on the rail where they
  are (or on a board above it, Settings → Players), the play lies in the middle with room either side
  (the table puts there what it has: the Skat, Durak's stock and what went off, the last trick), you
  sit at the near edge on the left, and your hand lies along it, the status and any question floating
  above it. Phones never see this (the user insisted).

  Its size is --scale (deskScale; Settings → Table size): the measures here are multiplied by it, and
  the parts that lie on the cloth take it as zoom; the hand and the trick, whose cards fly by measured
  positions, take it in their own layout. Nothing with a viewport unit is zoomed
  (learnings/css-and-layout.md → "zoom the leaves").
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { seatSpots } from '../lib/table';

  let {
    n,
    mine,
    home,
    others,
    onBoard,
    scale,
    held,
    max = 8,
    chip,
    top,
    left,
    middle,
    right,
    float,
    beside,
    hand,
  }: {
    n: number;
    mine: number;
    home: number;
    /** The other seats, in playing order from yours. */
    others: number[];
    onBoard: boolean;
    scale: number;
    /** How many cards a seat holds (their backs under their card). */
    held: (seat: number) => number;
    max?: number;
    /** A seat's place card: on the rail or for you ('desk'), or a small one on the board. */
    chip: Snippet<[number, 'desk' | 'board']>;
    top: Snippet;
    left?: Snippet;
    middle: Snippet;
    right?: Snippet;
    /** The status, the toast and the panels: they float above the hand. */
    float: Snippet;
    /** Buttons beside your card (Mau-Mau's draw and "Mau!", Durak's take and done): above it. */
    beside?: Snippet;
    hand: Snippet;
  } = $props();

  let w = $state(1200);
  let h = $state(700);
  // Round the table: the full card on every rail, inside the cloth (Stichle's desk spots).
  const spots = $derived(seatSpots(others, mine, n, w, h, 220 * scale, 220 * scale, -18 * scale, false));
</script>

<div class="desk" style:--scale={scale}>
  <div class="desk-bar"><div class="desk-top">{@render top()}</div></div>

  <div class="desk-room" class:boarded={onBoard}>
    {#if onBoard}
      <!-- The board above the cloth: everyone in playing order, you last. -->
      <div class="desk-boardrow">
        {#each [...others, home] as seat (seat)}<div class="desk-tile">{@render chip(seat, 'board')}</div>{/each}
      </div>
    {/if}
    <div class="felt desk-cloth" class:ringed={!onBoard} bind:clientWidth={w} bind:clientHeight={h}>
      {#if !onBoard}
        {#each spots as spot (spot.seat)}
          {@const count = Math.min(held(spot.seat), max)}
          <div class="desk-spot" style:left="{spot.x}px" style:top="{spot.y}px">
            <div class="desk-seat">
              {@render chip(spot.seat, 'desk')}
              <span class="held" aria-hidden="true">
                {#each { length: count } as _, k (k)}<i style:--k={k - (count - 1) / 2}></i>{/each}
              </span>
            </div>
          </div>
        {/each}
      {/if}

      <div class="desk-left">{#if left}{@render left()}{/if}</div>
      <div class="desk-middle">{@render middle()}</div>
      <div class="desk-right">{#if right}{@render right()}{/if}</div>

      <!-- You: at the near edge, on the left of your hand. -->
      <div class="desk-me">
        {#if beside}<div class="desk-beside">{@render beside()}</div>{/if}
        {#if !onBoard && n > 0}{@render chip(home, 'desk')}{/if}
      </div>

      <div class="desk-hand">
        <!-- The status and the questions float over the hand, drawn at the table's size. -->
        <div class="desk-float">{@render float()}</div>
        {@render hand()}
      </div>
    </div>
  </div>
</div>

<style>
  .desk {
    position: fixed;
    inset: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    color: var(--on-cloth);
  }
  .desk-bar {
    padding: calc(8px * var(--scale)) max(calc(44px * var(--scale)), calc((100vw - 1640px * var(--scale)) / 2)) 0;
  }
  .desk-top,
  .desk-seat,
  .desk-left,
  .desk-right,
  .desk-me,
  .desk-float,
  .desk-boardrow {
    zoom: var(--scale);
  }
  .desk-room {
    min-height: 0;
    display: flex;
    padding: calc(28px * var(--scale)) max(calc(48px * var(--scale)), calc((100vw - 1640px * var(--scale)) / 2)) calc(30px * var(--scale));
  }
  .desk-cloth {
    flex: 1;
    min-width: 0;
    display: grid;
    grid-template-columns: calc(230px * var(--scale)) minmax(0, 1fr) calc(230px * var(--scale));
    grid-template-rows: minmax(0, 1fr) auto;
    padding: calc(26px * var(--scale)) calc(26px * var(--scale)) calc(6px * var(--scale));
  }
  /* Round the table: the far rail's cards over it, a side rail's inside it, the play's room starting
     under the far ones. */
  .desk-cloth.ringed {
    padding-top: calc(80px * var(--scale));
  }
  .desk-spot {
    position: absolute;
    z-index: 4;
    translate: -50% calc(-27px * var(--scale));
  }
  .desk-seat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }
  .desk-seat :global(.seat) {
    min-width: 170px;
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
  /* On the board: a row of small cards above the cloth, everyone in playing order. */
  .desk-room.boarded {
    flex-direction: column;
    gap: calc(14px * var(--scale));
  }
  .desk-boardrow {
    flex: none;
    align-self: center;
    display: flex;
    gap: 10px;
    padding: 10px;
    border-radius: 16px;
    background: rgb(18 11 7 / 0.55);
    box-shadow: inset 0 0 0 1px rgb(236 230 214 / 0.08);
  }
  .desk-tile {
    width: 190px;
  }
  /* Either side of the play: what lies on the table there, lower round the table (clear of a side
     rail's card). */
  .desk-left,
  .desk-right {
    grid-row: 1;
    align-self: center;
    justify-self: center;
  }
  .ringed .desk-left,
  .ringed .desk-right {
    align-self: end;
    margin-bottom: 24px;
  }
  .desk-left {
    grid-column: 1;
  }
  .desk-right {
    grid-column: 3;
  }
  .desk-middle {
    grid-column: 2;
    grid-row: 1;
    position: relative;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .desk-me {
    grid-column: 1;
    grid-row: 2;
    align-self: end;
    justify-self: start;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    align-items: flex-start;
    gap: 12px;
    width: 210px;
    padding: 0 0 34px 6px;
    box-sizing: border-box;
  }
  .desk-me :global(.seat) {
    min-width: 170px;
  }
  .desk-beside {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .desk-hand {
    grid-column: 2;
    grid-row: 2;
    position: relative;
    z-index: 5;
  }
  /* A line along the hand's top edge: the status and the panels float above it. */
  .desk-float {
    position: absolute;
    z-index: 30;
    top: 0;
    left: 0;
    right: 0;
    height: 0;
  }
</style>
