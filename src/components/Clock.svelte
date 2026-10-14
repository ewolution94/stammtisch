<!-- Seconds left until the server's deadline, ticking down; the last ten turn red (and tick, if asked). -->
<script lang="ts">
  import type { Room } from '../lib/room.svelte';
  import { play } from '../lib/sound.svelte';

  let { room, endsAt, tick = false }: { room: Room; endsAt: number; tick?: boolean } = $props();

  let now = $state(Date.now());
  $effect(() => {
    const timer = setInterval(() => (now = Date.now()), 250);
    return () => clearInterval(timer);
  });
  const left = $derived(Math.ceil(room.left(endsAt, now) / 1000));
  let ticked = -1;
  $effect(() => {
    if (tick && left > 0 && left <= 5 && left !== ticked) {
      ticked = left;
      play.tick();
    }
  });
</script>

<span class="clock" class:urgent={left <= 10} role="timer" aria-live="off">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span>

<style>
  .clock {
    font: 600 13px/1 var(--ewo-mono);
    font-variant-numeric: lining-nums tabular-nums;
    padding: 4px 8px 3px;
    border-radius: 999px;
    background: var(--ink);
    color: var(--paper);
    box-shadow: 0 0 0 1.5px var(--gold);
  }
  .urgent {
    background: var(--bad);
    color: #ffffff;
  }
</style>
