<!--
  The game's sounds, from what changes in the view: the deal, every card landing (a shimmer for a
  Wizard), a trick taken (bright when it's yours), your move, the round's result for you, the end.
  Each device plays its own (src/lib/sound.svelte.ts; off in Settings).
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
    const mine = v.me ? g.seats.indexOf(v.me) : -1;
    if (g.round !== pg.round || (g.phase === 'round' && pg.phase !== 'round')) play.deal(g.round);
    const landed = g.trick.cards.length > pg.trick.cards.length || (g.lastTrick && g.lastTrick.n !== pg.lastTrick?.n);
    if (landed) {
      play.card();
      const card = g.lastTrick && g.lastTrick.n !== pg.lastTrick?.n ? g.lastTrick.cards.at(-1)?.card : g.trick.cards.at(-1)?.card;
      if (card?.startsWith('z-')) setTimeout(() => play.wizard(), 80);
    }
    if (g.lastTrick && g.lastTrick.n !== pg.lastTrick?.n) {
      const yours = g.lastTrick.winner === mine;
      setTimeout(() => (yours ? play.won() : play.lost()), 650);
    }
    const myMove = g.phase === 'round' && g.stage !== 'done' && g.turn === mine;
    const wasMine = pg.phase === 'round' && pg.stage !== 'done' && pg.turn === mine && pg.stage === g.stage;
    if (mine >= 0 && myMove && !wasMine) setTimeout(() => play.yourTurn(), landed ? 500 : 0);
    if (mine >= 0 && g.pad.length > pg.pad.length) {
      const row = g.pad.at(-1)!;
      setTimeout(() => (row.bids[mine] === row.won[mine] ? play.made() : play.missed()), 300);
    }
    if (v.phase === 'final' && before.phase === 'play' && g.ended === 'done') setTimeout(() => play.fanfare(), 900);
  });
</script>
