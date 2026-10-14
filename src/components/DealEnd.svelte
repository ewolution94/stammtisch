<!--
  A deal's result, over the table until everyone has tapped on (or the wait runs out): who won it and
  how, each game in its own words (Mau-Mau: who went out; Doppelkopf: the parties, the Augen, the
  scoring items and extra points; Skat: the game, the matadors, the value, the Skat), then everyone's
  points for the deal and in all. A deal that wasn't played (passed in, thrown in) says so and goes on.
-->
<script lang="ts">
  import { ApiError, type DokoResult, type SkatResult, type View } from '../lib/api';
  import { callName, contractName, skatGame } from '../lib/games';
  import { errorText, score, t } from '../lib/i18n.svelte';
  import type { Room } from '../lib/room.svelte';
  import { keyed } from '../lib/table';
  import { actAt } from '../lib/waits';
  import Card from './Card.svelte';

  let { room, view }: { room: Room; view: View } = $props();

  const game = $derived(view.game!);
  const rec = $derived(game.last!);
  const result = $derived(rec.result);
  const nameOfTable = (t2: number) => (view.players.find((p) => p.id === game.seats[t2])?.id === view.me ? t('you') : (view.players.find((p) => p.id === game.seats[t2])?.name ?? '?'));
  /** A game seat of this deal, as a name. */
  const nameAt = (seat: number) => nameOfTable(rec.seats[seat]);
  const ready = $derived(view.me !== null && game.ready.includes(view.me));

  let now = $state(Date.now());
  $effect(() => {
    const timer = setInterval(() => (now = Date.now()), 500);
    return () => clearInterval(timer);
  });
  const left = $derived(game.readyBy ? Math.ceil(room.left(game.readyBy, now) / 1000) : 0);

  let error = $state('');
  async function next(e: Event) {
    error = '';
    try {
      await actAt(room, 'next', undefined, e);
    } catch (err) {
      error = errorText(err instanceof ApiError ? err.code : 'other');
    }
  }

  const doko = $derived(game.id === 'doppelkopf' && !result.void ? (result as DokoResult) : null);
  const skat = $derived(game.id === 'skat' && !result.void && !result.ramsch ? (result as SkatResult) : null);
  const ramsch = $derived(game.id === 'skat' && result.ramsch ? (result as SkatResult) : null);

  /** Doppelkopf's scoring items, grouped and counted: "Re angesagt +2", "keine 90 gespielt +1". */
  function itemText(key: string) {
    return t(`item_${key}` as 'item_won');
  }
  /** Whether a game seat of this deal is you. */
  const isMe = (seat: number) => game.seats[rec.seats[seat]] === view.me;
  const winnerLine = $derived.by(() => {
    if (game.id === 'maumau') return isMe(result.winner ?? 0) ? t('mauOutYou') : t('mauOut', { name: nameAt(result.winner ?? 0) });
    if (game.id === 'durak') {
      if (result.loser === null || result.loser === undefined) return t('durakDraw');
      return isMe(result.loser) ? t('durakIsYou') : t('durakIs', { name: nameAt(result.loser) });
    }
    if (doko) return doko.winner ? t(doko.winner === 're' ? 'reWins' : 'kontraWins') : t('nobodyWins');
    if (skat) {
      const me = isMe(skat.declarer);
      if (skat.won) return me ? t('skatWonYou') : t('skatWonBy', { name: nameAt(skat.declarer) });
      if (skat.overbid) return me ? t('skatOverbidYou') : t('skatOverbid', { name: nameAt(skat.declarer) });
      return me ? t('skatLostYou') : t('skatLostBy', { name: nameAt(skat.declarer) });
    }
    if (ramsch) {
      if (ramsch.durchmarsch !== undefined) return isMe(ramsch.durchmarsch) ? t('ramschThroughYou') : t('ramschThrough', { name: nameAt(ramsch.durchmarsch) });
      return t('ramschLoses', { names: (ramsch.points ?? []).flatMap((p, i) => (p < 0 ? [nameAt(i)] : [])).join(', ') });
    }
    if (result.void === 'passed') return t('voidPassed');
    if (result.void === 'throw') return t('voidThrow', { name: nameAt(result.seat ?? 0) });
    if (result.void === 'poverty') return t('voidPoverty', { name: nameAt(result.seat ?? 0) });
    return '';
  });
  /** Everyone's points this deal and in all, best total first. */
  const rows = $derived(
    game.seats
      .map((_, ts) => ({ ts, name: nameOfTable(ts), deal: rec.points[ts] ?? 0, total: game.match.totals[ts] ?? 0, played: rec.seats.includes(ts) }))
      .sort((a, b) => b.total - a.total),
  );
</script>

<div class="veil" role="dialog" aria-modal="true" aria-label={winnerLine}>
  <div class="card sheet">
    <span class="label">{t('dealN', { n: rec.n })}{#if rec.factor > 1}{` · Bock ×${rec.factor}`}{/if}</span>
    <h2 class="display">{winnerLine}</h2>

    {#if (game.id === 'maumau' || game.id === 'durak') && result.hands}
      <div class="hands">
        {#each result.hands as hand, seat (seat)}
          {#if hand.length}
            <div class="handrow">
              <span class="who">{nameAt(seat)}</span>
              <span class="minis">{#each keyed(hand) as c (c.key)}<span class="mini"><Card id={c.id} /></span>{/each}</span>
            </div>
          {/if}
        {/each}
      </div>
    {/if}

    {#if doko}
      <p class="line">
        <b>{contractName(doko.contract)}</b> ·
        <span class="re">Re</span> {doko.parties.flatMap((p, i) => (p === 're' ? [nameAt(i)] : [])).join(' + ')}
        <span class="vs">{doko.augen.re} : {doko.augen.kontra}</span>
      </p>
      {#if doko.calls.re >= 0 || doko.calls.kontra >= 0}
        <p class="line soft">{t('callsMade')}: {[doko.calls.re >= 0 ? callName('re', doko.calls.re) + (doko.calls.re > 0 ? ' (Re)' : '') : '', doko.calls.kontra >= 0 ? callName('kontra', doko.calls.kontra) + (doko.calls.kontra > 0 ? ' (Kontra)' : '') : ''].filter(Boolean).join(' · ')}</p>
      {/if}
      <ul class="items">
        {#each doko.items as item, i (i)}
          <li><span>{itemText(item.key)}{#if item.by}{` (${item.by === 're' ? 'Re' : 'Kontra'})`}{/if}</span><b>+{item.key === 're' || item.key === 'kontra' ? 2 : 1}</b></li>
        {/each}
        {#each doko.extras as extra, i (`x${i}`)}
          <li class="extra"><span>{t(`extra_${extra.key}` as 'extra_fox')} · {extra.party === 're' ? 'Re' : 'Kontra'}</span><b>+1</b></li>
        {/each}
      </ul>
      {#if doko.solo}<p class="line soft">{t('soloTimesThree')}</p>{/if}
    {/if}

    {#if skat}
      <p class="line"><b>{skatGame(skat.contract)}</b> · {t('skatBidLine', { bid: skat.bid })}</p>
      {#if skat.contract.game === 'null'}
        <p class="line soft">{t('skatNullValue', { n: skat.null ?? skat.value })}</p>
      {:else if typeof skat.augen === 'number' && skat.matadors}
        <p class="line soft">
          {t('skatAugen', { n: skat.augen })} · {skat.matadors.mit ? t('skatMit', { n: skat.matadors.n }) : t('skatOhne', { n: skat.matadors.n })} · {t('skatMult', { n: skat.mult ?? 0 })}{#if skat.schneider}{` · ${t('skatSchneider')}`}{/if}{#if skat.schwarz}{` · ${t('skatSchwarz')}`}{/if}
        </p>
      {/if}
      <p class="line">{t('skatValue', { n: skat.value })}{#if skat.factor > 1}{` (Kontra${skat.factor > 2 ? ', Re' : ''})`}{/if}</p>
    {/if}
    {#if ramsch && Array.isArray(ramsch.augen)}
      <p class="line soft">{ramsch.augen.map((a, i) => `${nameAt(i)} ${a}`).join(' · ')}{#if ramsch.jungfrau}{' · Jungfrau ×2'}{/if}</p>
    {/if}
    {#if result.skatCards?.length}
      <div class="skat"><span class="label">Skat</span>{#each result.skatCards as c, i (i)}<span class="mini"><Card id={c} /></span>{/each}</div>
    {/if}

    {#if !result.void}
      <table class="points">
        <tbody>
          {#each rows as row (row.ts)}
            <tr class:out={!row.played}>
              <th>{row.name}</th>
              <td class="d">{row.played ? score(row.deal, true) : '·'}</td>
              <td class="t display">{score(row.total)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}

    {#if error}<p class="error" role="alert">{error}</p>{/if}
    {#if view.me && game.seats.includes(view.me) && !result.void}
      <button class="btn primary block" type="button" disabled={ready} onclick={next}>
        {ready ? t('waitingOthers') : t('nextDeal')}{#if left > 0}{` · ${left}`}{/if}
      </button>
    {:else}
      <p class="soft center">{t('nextSoon', { n: left })}</p>
    {/if}
  </div>
</div>

<style>
  .veil {
    position: fixed;
    inset: 0;
    z-index: 40;
    display: grid;
    place-items: end center;
    padding: 16px 12px calc(env(safe-area-inset-bottom, 0px) + 14px);
    background: rgb(8 16 11 / 0.55);
    animation: fade 0.25s ease-out both;
    overflow-y: auto;
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
    max-width: 460px;
    padding: 20px 18px 16px;
    animation: rise 0.32s cubic-bezier(0.2, 0.9, 0.3, 1.1) both;
  }
  @keyframes rise {
    from {
      translate: 0 24px;
      opacity: 0;
    }
  }
  h2 {
    margin: 0;
    font-size: 24px;
    line-height: 1.15;
  }
  .line {
    margin: 0;
    font-size: 14px;
    line-height: 1.45;
  }
  .soft {
    color: var(--mute);
    font-size: 13px;
  }
  .center {
    text-align: center;
  }
  .re {
    color: var(--re);
    font-weight: 700;
  }
  .vs {
    margin-left: 6px;
    font: 700 15px/1 var(--display);
    font-variant-numeric: lining-nums;
  }
  .items {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 2px;
    font-size: 13px;
  }
  .items li {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    padding: 2px 0;
    border-bottom: 1px dotted var(--line);
  }
  .items .extra {
    color: var(--ink-2);
  }
  .hands {
    display: grid;
    gap: 6px;
  }
  .handrow {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .who {
    flex: none;
    width: 70px;
    overflow: hidden;
    font-size: 13px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .minis {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
  }
  .mini {
    display: block;
    width: 28px;
  }
  .skat {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .skat .mini {
    width: 34px;
  }
  .points {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  }
  .points th {
    padding: 4px 0;
    text-align: left;
    font-weight: 600;
  }
  .points td {
    text-align: right;
    font-variant-numeric: lining-nums tabular-nums;
  }
  .points .d {
    width: 64px;
    color: var(--ink-2);
  }
  .points .t {
    width: 64px;
    font-size: 17px;
  }
  .points tr + tr {
    border-top: 1px solid var(--line);
  }
  .points tr.out {
    color: var(--mute);
  }
</style>
