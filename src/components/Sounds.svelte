<!--
  The game's sounds, from what changes in the view: the deal, every card landing, a trick taken
  (bright when it's yours), your move, the deal's result for you, the end. Each device plays its own
  (src/lib/sound.svelte.ts; off by default, on in Settings). From Stichle's Sounds.svelte.
-->
<script lang="ts">
  import type { View } from '../lib/api';
  import type { Room } from '../lib/room.svelte';
  import { play, unlockOnGesture } from '../lib/sound.svelte';

  let { room }: { room: Room } = $props();

  let prev: View | null = null;
  unlockOnGesture();

  $effect(() => {
    const v = room.view;
    const before = prev;
    prev = v;
    if (!v?.game || !before?.game || before.game.n !== v.game.n) return;
    const g = v.game;
    const pg = before.game;
    const lastSeen = pg.events.at(-1)?.n ?? 0;
    const fresh = g.events.filter((e) => e.n > lastSeen);
    const mine = g.seat >= 0 ? g.dealSeats[g.seat] : -1;
    let landed = false;
    for (const e of fresh) {
      if (e.type === 'deal') play.deal(8);
      else if (e.type === 'play') landed = true;
      else if (e.type === 'trick' && typeof e.seat === 'number') {
        const yours = e.seat === mine;
        setTimeout(() => (yours ? play.won() : play.lost()), 650);
      }
    }
    if (landed) play.card();
    const turn = g.deal && g.phase === 'deal' ? g.deal.turn : -1;
    const was = pg.deal && pg.phase === 'deal' ? pg.deal.turn : -1;
    if (g.seat >= 0 && turn === g.seat && (was !== g.seat || pg.deal?.phase !== g.deal?.phase)) setTimeout(() => play.yourTurn(), landed ? 500 : 0);
    if (mine >= 0 && g.phase === 'scored' && pg.phase !== 'scored' && g.last && !g.last.result?.void) {
      const p = g.last.points[mine] ?? 0;
      setTimeout(() => (p > 0 ? play.made() : play.missed()), 300);
    }
    if (v.phase === 'final' && before.phase === 'play' && g.ended === 'done') setTimeout(() => play.fanfare(), 900);
  });
</script>
