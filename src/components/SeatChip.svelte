<!--
  One seat at the table, as a place card: the player's seal and name, a line of what matters in this
  game (tricks taken, cards held), small tags (Re, Kontra, keine 90; the declarer; "Mau!"), their
  total, and whose move it is (a gold edge, with the clock when there is one). The dealer carries a
  small deck. From Stichle's SeatChip.svelte, without Wizard's bids.
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
    compact = false,
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
    compact?: boolean;
    line?: string;
    tags?: { text: string; tone?: 're' | 'kontra' | 'gold' | 'plain' }[];
    total: number;
    dealer?: boolean;
    active?: boolean;
    gone?: boolean;
    endsAt?: number | null;
  } = $props();
</script>

<div class="seat" class:active class:me class:compact class:gone={gone || (player && !player.online)}>
  <div class="face">
    {#if player}<Avatar avatar={player.avatar} size={compact ? 30 : 36} />{/if}
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
  .seat.compact {
    flex-direction: column;
    gap: 2px;
    margin-top: 16px;
    padding: 22px 6px 7px;
    text-align: center;
  }
  .compact .face {
    position: absolute;
    top: -16px;
    left: 50%;
    translate: -50% 0;
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
  .compact .info {
    align-items: center;
    width: 100%;
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
    font-variant-numeric: tabular-nums;
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
  .seat:not(.compact) .tags {
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
</style>
