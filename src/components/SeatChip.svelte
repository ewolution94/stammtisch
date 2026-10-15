<!--
  One seat at the table, as a place card: the player's seal and name, a line of what matters in this
  game (tricks taken, cards held), small tags (Re, Kontra, keine 90; the declarer; "Mau!"), their
  total, and whose move it is (a gold edge, with the clock when there is one). The dealer carries a
  small deck. From Stichle's SeatChip.svelte, without Wizard's bids.

  Its shapes (the user's picks, 2026-10-15, as in Stichle): on its side, everyone's the same round the
  table and yours in the dock; `narrow` on a side rail or with three across (the name on two lines
  rather than cut); `board`, a small card on the board above the cloth (the seal and the name above,
  the total large under them).
-->
<script lang="ts">
  import type { Player } from '../lib/api';
  import { score, t } from '../lib/i18n.svelte';
  import type { Room } from '../lib/room.svelte';
  import Avatar from './Avatar.svelte';
  import Clock from './Clock.svelte';

  let {
    room,
    player,
    me = false,
    narrow = false,
    board = false,
    line = '',
    tags = [],
    total,
    dealer = false,
    active = false,
    gone = false,
    endsAt = null,
  }: {
    room: Room;
    player: Player | undefined;
    me?: boolean;
    /** On a side rail, or three across the far one: a narrow card, the name on up to two lines. */
    narrow?: boolean;
    /** A small card on the board above the cloth. */
    board?: boolean;
    line?: string;
    tags?: { text: string; tone?: 're' | 'kontra' | 'gold' | 'plain' }[];
    total: number;
    dealer?: boolean;
    active?: boolean;
    gone?: boolean;
    endsAt?: number | null;
  } = $props();
</script>

<div class="seat" class:active class:me class:narrow class:onboard={board} class:gone={gone || (player && !player.online)}>
  <div class="face">
    {#if player}<Avatar avatar={player.avatar} size={board ? 24 : narrow ? 30 : 36} />{/if}
    {#if dealer}<span class="dealer" title={t('dealer')} aria-label={t('dealer')}></span>{/if}
  </div>
  <div class="info">
    <span class="name">{me ? t('you') : (player?.name ?? '?')}</span>
    <span class="line">
      {#if line}<span class="what">{line}</span>{/if}
      <span class="total">{score(total)}</span>
    </span>
  </div>
  {#if tags.length}
    <span class="tags">{#each tags as tag, i (i)}<span class="tag {tag.tone ?? 'plain'}">{tag.text}</span>{/each}</span>
  {/if}
  {#if active && endsAt}<span class="clock"><Clock {room} {endsAt} tick={me} /></span>{/if}
</div>

<style>
  .seat {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 6px 12px 6px 6px;
    border-radius: 12px;
    background: var(--paper);
    color: var(--ink);
    box-shadow:
      0 1px 0 rgb(0 0 0 / 0.35),
      0 12px 20px -12px rgb(0 0 0 / 0.8);
    transition:
      box-shadow 0.25s,
      translate 0.25s cubic-bezier(0.2, 0.9, 0.3, 1.2);
  }
  .seat::before {
    content: '';
    position: absolute;
    inset: 3px;
    border: 1px solid rgb(28 26 34 / 0.45);
    border-radius: 9px;
    box-shadow: inset 0 0 0 2px var(--paper), inset 0 0 0 3px rgb(28 26 34 / 0.2);
    pointer-events: none;
  }
  .seat::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background-image: var(--grain);
    background-size: 160px;
    mix-blend-mode: multiply;
    opacity: 0.35;
    pointer-events: none;
  }
  .seat.active {
    translate: 0 -2px;
    box-shadow:
      0 0 0 2px var(--gold),
      0 0 0 4px rgb(201 162 74 / 0.25),
      0 0 18px 2px rgb(243 220 148 / 0.35),
      0 14px 22px -12px rgb(0 0 0 / 0.85);
  }
  .seat.gone {
    filter: grayscale(0.7);
    opacity: 0.62;
  }
  .face {
    position: relative;
    z-index: 1;
    flex: none;
    display: grid;
    border-radius: 50%;
    box-shadow: 0 2px 6px -2px rgb(0 0 0 / 0.6);
  }
  .dealer {
    position: absolute;
    right: -6px;
    bottom: -4px;
    width: 12px;
    height: 16px;
    border-radius: 2px;
    background: var(--back-ground);
    box-shadow:
      -3px -2px 0 -1px var(--back-ground),
      -3px -2px 0 0 var(--back-line),
      0 0 0 1px var(--back-line);
  }
  .info {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .name {
    overflow: hidden;
    max-width: 100%;
    font: 650 12.5px/1.15 var(--ewo-sans);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .line {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 15px;
  }
  .what {
    font: 600 11px/1 var(--ewo-sans);
    color: var(--mute);
    white-space: nowrap;
  }
  .total {
    font: 700 14px/1 var(--display);
    font-variant-numeric: lining-nums tabular-nums;
  }
  .tags {
    position: absolute;
    z-index: 2;
    bottom: -9px;
    left: 50%;
    translate: -50% 0;
    display: flex;
    gap: 3px;
    white-space: nowrap;
  }
  .seat:not(.onboard) .tags {
    left: auto;
    right: 8px;
    translate: none;
  }
  .tag {
    padding: 2px 6px;
    border-radius: 999px;
    font: 700 9.5px/1.1 var(--ewo-sans);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    box-shadow: 0 3px 6px -3px rgb(0 0 0 / 0.7);
    animation: tag-in 0.4s cubic-bezier(0.2, 0.9, 0.3, 1.3) backwards;
  }
  .tag.plain {
    background: var(--ink);
    color: var(--paper);
  }
  .tag.gold {
    background: linear-gradient(var(--gold-hi), var(--gold));
    color: var(--ink);
    box-shadow: 0 0 0 1px var(--gold-lo), 0 3px 6px -3px rgb(0 0 0 / 0.7);
  }
  .tag.re {
    background: var(--re);
    color: #fff;
  }
  .tag.kontra {
    background: var(--kontra);
    color: #fff;
  }
  @keyframes tag-in {
    from {
      opacity: 0;
      scale: 0.6;
    }
  }
  .clock {
    position: absolute;
    z-index: 2;
    top: -10px;
    right: -6px;
  }
  /* Narrow: the name on two lines rather than cut short. */
  .seat.narrow {
    gap: 7px;
    padding: 7px 10px 7px 7px;
  }
  .narrow .name {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  /* On the board: the seal and the name in a row, the total large under them and what matters
     beside it. The class isn't .board: a global one of that name would reach it (Stichle's lesson). */
  .seat.onboard {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    grid-template-areas:
      'face name'
      'line line';
    align-items: center;
    gap: 6px 7px;
    width: 100%;
    box-sizing: border-box;
    padding: 6px 10px 10px 8px;
    border-radius: 10px;
  }
  .onboard .face {
    grid-area: face;
  }
  .onboard .info {
    display: contents;
  }
  .onboard .name {
    grid-area: name;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .onboard .dealer {
    right: -4px;
    bottom: -3px;
    width: 9px;
    height: 12px;
  }
  .onboard .line {
    grid-area: line;
    justify-content: space-between;
    height: 22px;
  }
  .onboard .total {
    order: -1;
    font-size: 22px;
  }
</style>
