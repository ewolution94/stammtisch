<!--
  The middle of the table: the cards of the trick in progress, each nudged towards the seat that
  played it, a little askew, landing with a slap. A finished trick takes its time (src/lib/table.ts →
  trickPhase, from the server's holdUntil): the table rests with every card where it landed; the
  winner lifts and catches the light while the others dim; the cards gather under the winner; the
  stack sweeps off towards the winner's seat. Your own card arrives from your hand (Hand.svelte flies
  it here), so it isn't drawn until it lands.
  From Stichle's Trick.svelte; keyed by seat, since a Doppelkopf trick can hold two equal cards.
-->
<script lang="ts">
  import type { Played, Trick } from '../lib/api';
  import { flight } from '../lib/flight.svelte';
  import type { Room } from '../lib/room.svelte';
  import { angleOf, slotOffset, sweepOffset, trickCardWidth, trickPhase, twist, TRICK_GATHER, TRICK_REVEAL, TRICK_SWEEP } from '../lib/table';
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
    cap = undefined,
  }: {
    room: Room;
    trick: Trick;
    last: { cards: Played[]; winner: number; n: number } | null;
    holdUntil: number;
    mine: number;
    n: number;
    width?: number;
    height?: number;
    /** The largest a card may be (the desktop table's, at its size). */
    cap?: number;
  } = $props();

  let now = $state(Date.now());
  // The clock wakes once for every moment something changes: a card in the air lands, and the
  // finished trick's beats (the winner, the gathering, the sweep, gone). Each moment has its own
  // timer: a card that finished the trick from your hand lands long before the pause is over, and
  // waiting for the pause left it unseen until the sweep (Stichle's fix, 2026-10-13).
  $effect(() => {
    const local = Date.now();
    const offset = room.offset;
    // Read the clock again with this offset (it moves with every view), so no stale moment lingers.
    now = local;
    const marks = [holdUntil - TRICK_REVEAL, holdUntil - TRICK_GATHER, holdUntil, holdUntil + TRICK_SWEEP].map((at) => at - offset - local);
    marks.push(flight.until - local);
    const timers = marks.filter((ms) => ms > 0 && ms < 15_000).map((ms) => setTimeout(() => (now = Date.now()), ms + 20));
    return () => timers.forEach(clearTimeout);
  });
  $effect(() => {
    void trick.cards.length;
    void last?.n;
    void flight.until;
    now = Date.now();
  });

  const phase = $derived(trickPhase(holdUntil - (now + room.offset)));
  const showLast = $derived(!trick.cards.length && last !== null && phase !== 'gone');
  const shown = $derived(trick.cards.length ? trick.cards : showLast && last ? last.cards : []);
  const cw = $derived(trickCardWidth(width, height, cap));

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
  /** The winner's spot and turn on the pile, where the others gather. */
  const winnerAt = $derived.by(() => {
    if (!last) return null;
    const card = last.cards.find((c) => c.seat === last.winner);
    return card ? { ...place(card.seat), r: twist(card.card, card.seat) } : null;
  });
</script>

<div class="trick" bind:clientWidth={width} bind:clientHeight={height} aria-live="polite">
  {#each shown as played, i (played.seat)}
    {@const p = place(played.seat)}
    {@const winner = showLast && last?.winner === played.seat}
    {@const decided = showLast && phase !== 'rest'}
    {@const hidden = played.seat === mine && played.card === flight.card && now < flight.until}
    <div
      class="played"
      class:won={decided && winner}
      class:lost={decided && !winner}
      class:gather={showLast && !winner && (phase === 'gather' || phase === 'sweep')}
      class:sweep={showLast && phase === 'sweep'}
      class:mine={played.seat === mine}
      style:width="{cw}px"
      style:left="{p.x}px"
      style:top="{p.y}px"
      style:z-index={i + 1}
      style:--r="{twist(played.card, played.seat)}deg"
      style:--wr="{winnerAt?.r ?? twist(played.card, played.seat)}deg"
      style:--gx="{winnerAt ? winnerAt.x - p.x : 0}px"
      style:--gy="{winnerAt ? winnerAt.y - p.y : 0}px"
      style:--ax="{away.x}px"
      style:--ay="{away.y}px"
      style:--fx="{from(played.seat).x}px"
      style:--fy="{from(played.seat).y}px"
      style:visibility={hidden ? 'hidden' : 'visible'}
    >
      <Card id={played.card} />
      {#if decided && winner}<span class="sheen" aria-hidden="true"></span>{/if}
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
    translate: 0 0;
    rotate: var(--r);
    /* Backwards only: a fill that held the end state would keep the card opaque through its sweep. */
    animation: land 0.32s cubic-bezier(0.2, 0.9, 0.3, 1.2) backwards;
    transition:
      translate 0.42s cubic-bezier(0.4, 0, 0.2, 1),
      rotate 0.42s cubic-bezier(0.4, 0, 0.2, 1),
      scale 0.4s cubic-bezier(0.2, 0.9, 0.3, 1.25),
      filter 0.4s ease,
      opacity 0.45s ease-in;
  }
  .played.mine {
    animation: none;
  }
  .played :global(.face) {
    transition: box-shadow 0.45s ease;
  }
  /* Dropped onto the pile from its player's side: a little bigger, a little further out, then down. */
  @keyframes land {
    from {
      translate: var(--fx) var(--fy);
      scale: 1.16;
      opacity: 0;
    }
  }
  /* The winner lifts and comes to the top as it's picked up, a gold ring round it; the others dim. */
  .played.won {
    z-index: 20 !important;
    translate: 0 -6px;
    scale: 1.08;
  }
  .played.won :global(.face) {
    box-shadow:
      0 0 0 2px var(--gold-hi),
      0 0 22px 3px rgb(243 220 148 / 0.6),
      0 18px 26px -10px rgb(5 8 25 / 0.8);
  }
  .played.lost {
    filter: brightness(0.78) saturate(0.85);
  }
  /* A band of light crosses the winner once. */
  .sheen {
    position: absolute;
    inset: 0;
    overflow: hidden;
    border-radius: 5.6% / 4%;
    pointer-events: none;
  }
  .sheen::before {
    content: '';
    position: absolute;
    inset: -20% -60%;
    background: linear-gradient(105deg, transparent 38%, rgb(255 246 214 / 0.75) 50%, transparent 62%);
    translate: -70% 0;
    animation: sheen 0.9s 0.15s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  }
  @keyframes sheen {
    to {
      translate: 70% 0;
    }
  }
  /* The others slide under the winner and take its turn: one neat stack. */
  .played.gather {
    translate: var(--gx) var(--gy);
    rotate: var(--wr);
  }
  /* Then the stack goes to the winner's seat. */
  .played.sweep {
    translate: calc(var(--gx) + var(--ax)) calc(var(--gy) + var(--ay));
    scale: 0.7;
    opacity: 0;
    transition:
      translate 0.5s cubic-bezier(0.5, 0, 0.75, 0),
      rotate 0.5s ease-in,
      scale 0.5s ease-in,
      opacity 0.5s ease-in;
  }
</style>
