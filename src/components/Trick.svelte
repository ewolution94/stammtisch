<!--
  The middle of the table: the cards of the trick in progress, each nudged towards the seat that
  played it, a little askew, landing with a slap. A finished trick stays for its moment (the server's
  holdUntil), the winning card catches the light, then the cards sweep off towards the winner. Your
  own card arrives from your hand (Hand.svelte flies it here), so it isn't drawn until it lands.
  From Stichle's Trick.svelte; keyed by seat, since a Doppelkopf trick can hold two equal cards.
-->
<script lang="ts">
  import type { Played, Trick } from '../lib/api';
  import { flight } from '../lib/flight.svelte';
  import type { Room } from '../lib/room.svelte';
  import { angleOf, slotOffset, sweepOffset, trickCardWidth, twist } from '../lib/table';
  import Card from './Card.svelte';

  let {
    room,
    trick,
    last,
    holdUntil,
    mine,
    n,
    width = $bindable(320),
    height = $bindable(260),
  }: {
    room: Room;
    trick: Trick;
    last: { cards: Played[]; winner: number; n: number } | null;
    holdUntil: number;
    mine: number;
    n: number;
    width?: number;
    height?: number;
  } = $props();

  const SWEEP = 560;
  let now = $state(Date.now());
  $effect(() => {
    const wait = Math.max(room.left(holdUntil), flight.until - Date.now());
    if (wait <= -SWEEP) return;
    const timers = [wait + 20, wait + SWEEP + 20].filter((ms) => ms > 0).map((ms) => setTimeout(() => (now = Date.now()), ms));
    return () => timers.forEach(clearTimeout);
  });
  $effect(() => {
    void trick.cards.length;
    void last?.n;
    now = Date.now();
  });

  const showLast = $derived(!trick.cards.length && last !== null && room.left(holdUntil, now) > -SWEEP);
  const sweeping = $derived(showLast && room.left(holdUntil, now) <= 0);
  const shown = $derived(trick.cards.length ? trick.cards : showLast && last ? last.cards : []);
  const cw = $derived(trickCardWidth(width, height));

  function place(seat: number) {
    const { dx, dy } = slotOffset(angleOf(seat, mine, n), cw);
    return { x: width / 2 + dx - cw / 2, y: height / 2 + dy - (cw * 1.4) / 2 };
  }

  function from(seat: number) {
    const { dx, dy } = sweepOffset(angleOf(seat, mine, n), width * 0.25, height * 0.25);
    return { x: dx, y: dy };
  }

  const away = $derived.by(() => {
    if (!last) return { x: 0, y: 0 };
    const { dx, dy } = sweepOffset(angleOf(last.winner, mine, n), width, height);
    return { x: dx, y: dy };
  });
</script>

<div class="trick" bind:clientWidth={width} bind:clientHeight={height} aria-live="polite">
  {#each shown as played, i (played.seat)}
    {@const p = place(played.seat)}
    {@const won = showLast && last?.winner === played.seat}
    {@const hidden = played.seat === mine && played.card === flight.card && now < flight.until}
    <div
      class="played"
      class:won
      class:sweep={sweeping}
      class:mine={played.seat === mine}
      style:width="{cw}px"
      style:left="{p.x}px"
      style:top="{p.y}px"
      style:z-index={i + 1}
      style:--r="{twist(played.card, played.seat)}deg"
      style:--ax="{away.x}px"
      style:--ay="{away.y}px"
      style:--fx="{from(played.seat).x}px"
      style:--fy="{from(played.seat).y}px"
      style:visibility={hidden ? 'hidden' : 'visible'}
    >
      <Card id={played.card} />
    </div>
  {/each}
</div>

<style>
  .trick {
    position: relative;
    width: 100%;
    height: 100%;
  }
  .played {
    position: absolute;
    rotate: var(--r);
    animation: land 0.32s cubic-bezier(0.2, 0.9, 0.3, 1.2) backwards;
    transition:
      translate 0.5s cubic-bezier(0.5, 0, 0.75, 0),
      opacity 0.5s ease-in,
      scale 0.5s ease-in;
  }
  .played.mine {
    animation: none;
  }
  @keyframes land {
    from {
      translate: var(--fx) var(--fy);
      scale: 1.16;
      opacity: 0;
    }
  }
  .played.won {
    z-index: 20 !important;
    scale: 1.06;
  }
  .played.won :global(.face) {
    box-shadow:
      0 0 0 2px var(--gold-hi),
      0 0 18px 2px rgb(243 220 148 / 0.55),
      0 14px 22px -10px rgb(5 8 25 / 0.8);
  }
  .played.sweep {
    translate: var(--ax) var(--ay);
    scale: 0.7;
    opacity: 0;
  }
</style>
