<!--
  What a Doppelkopf seat decides, above its hand: "gesund" or a reservation (a wedding, a solo, and
  with the house rules poverty or throwing in), poverty's steps (the three cards to give, taking it
  or not, the three to give back), and announcements (Re, Kontra, keine 90 …), which may come at
  any time, not only on your turn. Playing is done with the cards themselves.
-->
<script lang="ts">
  import type { DokoDeal } from '../lib/api';
  import { callName, soloName } from '../lib/games';
  import { t } from '../lib/i18n.svelte';

  let {
    deal,
    mine,
    myTurn,
    picked,
    decide,
    name,
  }: {
    deal: DokoDeal;
    mine: number;
    myTurn: boolean;
    /** The cards picked in the hand (poverty), as ids. */
    picked: string[];
    decide: (move: Record<string, unknown>, from: Event) => Promise<void>;
    name: (seat: number) => string;
  } = $props();

  let reserving = $state(false);
  $effect(() => {
    if (!myTurn || deal.phase !== 'reserve') reserving = false;
  });
  const choices = $derived(deal.choices ?? []);
  const forced = $derived(deal.forced !== null && deal.forced === mine);
  const solos = $derived(choices.filter((c) => c.kind === 'solo'));
  const others = $derived(choices.filter((c) => c.kind !== 'solo' && c.kind !== 'healthy'));
  /** The next announcement you may make (the lowest level open to you). */
  const nextCall = $derived(deal.options.length ? deal.options[0] : null);
  const send = (move: Record<string, unknown>) => (e: Event) => void decide(move, e).catch(() => {});
</script>

{#if deal.phase === 'reserve' && myTurn}
  <div class="panel sheet">
    {#if forced}
      <span class="label">{t('dokoForced')}</span>
      <div class="grid">
        {#each solos as c (c.solo)}<button class="btn small" type="button" onclick={send(c)}>{soloName(c.solo as string)}</button>{/each}
      </div>
    {:else if !reserving}
      <span class="label">{t('dokoReserveAsk')}</span>
      <div class="pair">
        <button class="btn primary" type="button" onclick={send({ type: 'reserve', kind: 'healthy' })}>{t('dokoHealthy')}</button>
        <button class="btn" type="button" onclick={() => (reserving = true)}>{t('dokoReserve')}</button>
      </div>
    {:else}
      <span class="label">{t('dokoReserveWhich')}</span>
      {#if others.length}
        <div class="grid">
          {#each others as c (c.kind)}<button class="btn small" type="button" onclick={send(c)}>{t(`doko_${c.kind}` as 'doko_wedding')}</button>{/each}
        </div>
      {/if}
      <div class="grid">
        {#each solos as c (c.solo)}<button class="btn small" type="button" onclick={send(c)}>{soloName(c.solo as string)}</button>{/each}
      </div>
      <button class="btn quiet small" type="button" onclick={() => (reserving = false)}>{t('back')}</button>
    {/if}
  </div>
{:else if deal.phase === 'poverty-give' && myTurn}
  <div class="panel sheet">
    <span class="label">{t('povertyGive')}</span>
    <button class="btn primary block" type="button" disabled={picked.length !== 3} onclick={send({ type: 'give', cards: picked })}>{t('povertyGiveBtn', { n: picked.length })}</button>
  </div>
{:else if deal.phase === 'poverty-offer' && myTurn && deal.poverty}
  <div class="panel sheet">
    <span class="label">{t('povertyOffer', { name: name(deal.poverty.seat), n: deal.poverty.trumps })}</span>
    <div class="pair">
      <button class="btn primary" type="button" onclick={send({ type: 'take' })}>{t('povertyTake')}</button>
      <button class="btn" type="button" onclick={send({ type: 'decline' })}>{t('povertyDecline')}</button>
    </div>
  </div>
{:else if deal.phase === 'poverty-return' && myTurn}
  <div class="panel sheet">
    <span class="label">{t('povertyReturn')}</span>
    <button class="btn primary block" type="button" disabled={picked.length !== 3} onclick={send({ type: 'return', cards: picked })}>{t('povertyReturnBtn', { n: picked.length })}</button>
  </div>
{/if}

{#if deal.phase === 'play' && nextCall !== null && deal.party}
  <div class="calls">
    <button class="btn call {deal.party}" type="button" onclick={send({ type: 'announce', level: nextCall })}>
      {callName(deal.party, nextCall)}
    </button>
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
  @keyframes rise {
    from {
      translate: 0 14px;
      opacity: 0;
    }
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
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
    padding: 0 16px;
    border: 0;
    color: #fff;
    font: 700 15px/1 var(--display);
    font-variant-numeric: lining-nums;
    letter-spacing: 0.02em;
    box-shadow: 0 0 0 1px rgb(255 255 255 / 0.4), 0 8px 16px -8px rgb(0 0 0 / 0.8);
  }
  .call.re {
    background: var(--re);
  }
  .call.kontra {
    background: var(--kontra);
  }
</style>
