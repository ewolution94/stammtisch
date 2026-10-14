<!--
  What a Skat seat decides, above its hand: the bidding (say a value or pass; hold or pass when
  listening; Vorhand alone plays at 18 or passes), the Skat (pick it up, or play Hand), the two cards
  to put back, the game (with Hand: Schneider, Schwarz, Ouvert announced; Null Ouvert either way),
  and Kontra or Re (a house rule). Playing is done with the cards themselves.
-->
<script lang="ts">
  import type { SkatDeal } from '../lib/api';
  import { BIDS, suitName } from '../lib/games';
  import { t } from '../lib/i18n.svelte';
  import type { Suit } from '../lib/deck';

  let {
    deal,
    mine,
    myTurn,
    picked,
    decide,
    name,
  }: {
    deal: SkatDeal;
    mine: number;
    myTurn: boolean;
    picked: string[];
    decide: (move: Record<string, unknown>, from: Event) => Promise<void>;
    name: (seat: number) => string;
  } = $props();

  const b = $derived(deal.bidding);
  const saying = $derived(deal.phase === 'bid' && myTurn && b.awaiting === 'say');
  const answering = $derived(deal.phase === 'bid' && myTurn && b.awaiting === 'answer');
  const above = $derived(BIDS.filter((v) => v > deal.bid));

  // The value to say: the next one up to start with, − and + to choose.
  let at = $state(0);
  let lastBid = -1;
  $effect(() => {
    if (deal.bid !== lastBid) {
      lastBid = deal.bid;
      at = 0;
    }
  });
  const value = $derived(above[Math.min(at, above.length - 1)] ?? 18);

  // The game to declare, and its announcements (Hand games only; Ouvert for Null either way).
  let game: string = $state('c');
  let schneider = $state(false);
  let schwarz = $state(false);
  let ouvert = $state(false);
  const hand = $derived(!deal.took);
  $effect(() => {
    if (game === 'null') {
      schneider = false;
      schwarz = false;
    }
  });
  const GAMES = ['c', 's', 'h', 'd', 'grand', 'null'];
  const gameLabel = (g: string) => (g === 'grand' ? 'Grand' : g === 'null' ? 'Null' : suitName(g as Suit));
  const can = (type: string) => deal.moves.some((m) => m.type === type);
  const send = (move: Record<string, unknown>) => (e: Event) => void decide(move, e).catch(() => {});

  function toggle(which: 'schneider' | 'schwarz' | 'ouvert') {
    if (which === 'schneider') {
      schneider = !schneider;
      if (!schneider) schwarz = ouvert = false;
    } else if (which === 'schwarz') {
      schwarz = !schwarz;
      if (schwarz) schneider = true;
      else ouvert = false;
    } else {
      ouvert = !ouvert;
      if (ouvert && game !== 'null') schneider = schwarz = true;
    }
  }
</script>

{#if saying}
  <div class="panel sheet center">
    {#if b.stage === 3}
      <span class="label">{t('skatAlone')}</span>
      <div class="pair">
        <button class="btn primary" type="button" onclick={send({ type: 'bid', value: 18 })}>{t('skatPlay18')}</button>
        <button class="btn" type="button" onclick={send({ type: 'pass' })}>{t('skatPass')}</button>
      </div>
    {:else}
      <span class="label">{deal.bid ? t('skatSayOver', { bid: deal.bid }) : t('skatSay')}</span>
      <div class="dial">
        <button class="step" type="button" aria-label={t('less')} disabled={at <= 0} onclick={() => (at = Math.max(0, at - 1))}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12" /></svg>
        </button>
        {#key value}<span class="big display">{value}</span>{/key}
        <button class="step" type="button" aria-label={t('more')} disabled={at >= above.length - 1} onclick={() => (at = Math.min(above.length - 1, at + 1))}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12M12 6v12" /></svg>
        </button>
      </div>
      <div class="pair">
        <button class="btn primary" type="button" onclick={send({ type: 'bid', value })}>{t('skatSayBtn', { n: value })}</button>
        <button class="btn" type="button" onclick={send({ type: 'pass' })}>{t('skatPass')}</button>
      </div>
    {/if}
  </div>
{:else if answering}
  <div class="panel sheet center">
    <span class="label">{t('skatHold', { name: name(b.sayer), bid: deal.bid })}</span>
    <div class="pair">
      <button class="btn primary" type="button" onclick={send({ type: 'hold' })}>{t('skatYes', { n: deal.bid })}</button>
      <button class="btn" type="button" onclick={send({ type: 'pass' })}>{t('skatPass')}</button>
    </div>
  </div>
{:else if deal.phase === 'skat' && myTurn}
  <div class="panel sheet center">
    <span class="label">{t('skatWon', { bid: deal.bid })}</span>
    <div class="pair">
      <button class="btn primary" type="button" onclick={send({ type: 'take' })}>{t('skatTake')}</button>
      <button class="btn" type="button" onclick={send({ type: 'hand' })}>{t('skatHand')}</button>
    </div>
  </div>
{:else if deal.phase === 'discard' && myTurn}
  <div class="panel sheet">
    <span class="label">{t('skatDiscard')}</span>
    <button class="btn primary block" type="button" disabled={picked.length !== 2} onclick={send({ type: 'discard', cards: picked })}>{t('skatDiscardBtn', { n: picked.length })}</button>
  </div>
{:else if deal.phase === 'declare' && myTurn}
  <div class="panel sheet">
    <span class="label">{t('skatDeclare', { bid: deal.bid })}</span>
    <div class="games" role="radiogroup" aria-label={t('skatDeclare', { bid: deal.bid })}>
      {#each GAMES as g (g)}
        <button class="chip" type="button" role="radio" aria-checked={game === g} onclick={() => ((game = g), g === 'null' || (ouvert && !schwarz) ? (ouvert = false) : null)}>{gameLabel(g)}</button>
      {/each}
    </div>
    {#if (hand && game !== 'null') || game === 'null'}
      <div class="extras">
        {#if hand && game !== 'null'}
          <button class="chip" type="button" aria-pressed={schneider} onclick={() => toggle('schneider')}>{t('skat_schneiderAnn')}</button>
          <button class="chip" type="button" aria-pressed={schwarz} onclick={() => toggle('schwarz')}>{t('skat_schwarzAnn')}</button>
        {/if}
        {#if game === 'null' || hand}
          <button class="chip" type="button" aria-pressed={ouvert} onclick={() => toggle('ouvert')}>Ouvert</button>
        {/if}
      </div>
    {/if}
    <button class="btn primary block" type="button" onclick={send({ type: 'declare', game, schneider: game !== 'null' && schneider, schwarz: game !== 'null' && schwarz, ouvert })}>{t('skatDeclareBtn')}</button>
  </div>
{/if}

{#if deal.phase === 'play' && (can('kontra') || can('re'))}
  <div class="calls">
    <button class="btn call" type="button" onclick={send({ type: can('re') ? 're' : 'kontra' })}>{can('re') ? 'Re' : 'Kontra'}</button>
  </div>
{/if}

<style>
  /* Your decision floats over the table, just above your place card: the table keeps its size
     underneath (Stichle's, after the user's first game on the phone, 2026-10-13). */
  .panel {
    position: absolute;
    z-index: 30;
    left: 0;
    right: 0;
    bottom: calc(100% + 8px);
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
    max-width: 440px;
    margin-inline: auto;
    box-shadow:
      0 1px 0 rgb(0 0 0 / 0.35),
      0 24px 40px -18px rgb(0 0 0 / 0.85);
    padding: 18px 18px 16px;
    animation: rise 0.28s cubic-bezier(0.2, 0.9, 0.3, 1.1) both;
  }
  .panel.center {
    align-items: center;
    text-align: center;
  }
  @keyframes rise {
    from {
      translate: 0 14px;
      opacity: 0;
    }
  }
  .dial {
    display: grid;
    grid-template-columns: 52px minmax(0, 1fr) 52px;
    align-items: center;
    gap: 10px;
    width: 100%;
    max-width: 280px;
  }
  .step {
    display: grid;
    place-items: center;
    width: 52px;
    height: 52px;
    padding: 0;
    border: 1.5px solid var(--ink);
    border-radius: 50%;
    background: #fff;
    color: var(--ink);
  }
  .step svg {
    width: 22px;
    height: 22px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.4;
    stroke-linecap: round;
  }
  .step:disabled {
    opacity: 0.3;
  }
  .big {
    font-size: 60px;
    line-height: 1;
    font-variant-numeric: lining-nums tabular-nums;
    text-align: center;
    color: var(--ink);
    animation: pop 0.3s cubic-bezier(0.25, 1.6, 0.4, 1) both;
  }
  @keyframes pop {
    from {
      scale: 0.7;
      opacity: 0;
    }
  }
  .pair {
    width: 100%;
  }
  .games,
  .extras {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  /* During play, beside your place card: no row of its own, so the table keeps its size. */
  .calls {
    position: absolute;
    z-index: 6;
    top: 4px;
    right: 4px;
    display: flex;
  }
  .call {
    min-height: 38px;
    border: 0;
    background: var(--kontra);
    color: #fff;
    font: 700 15px/1 var(--display);
    font-variant-numeric: lining-nums;
  }
</style>
