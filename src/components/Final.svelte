<!--
  The end of a game: who won, everyone's total, the totals as lines across the deals, and the best
  single deal. The host deals again at the same table or goes back to the lobby (to change the game);
  anyone can leave. A game the host ended early says so. From Stichle's Final.svelte.
-->
<script lang="ts">
  import { ApiError, type View } from '../lib/api';
  import { errorText, names, score, t } from '../lib/i18n.svelte';
  import type { Room } from '../lib/room.svelte';
  import { actAt } from '../lib/waits';
  import Avatar from './Avatar.svelte';

  let { room, view, onleave }: { room: Room; view: View; onleave: (from?: Event) => void } = $props();

  const game = $derived(view.game!);
  const isHost = $derived(view.me === view.host);
  const hostName = $derived(view.players.find((p) => p.id === view.host)?.name ?? '');
  const playerAt = (seat: number) => view.players.find((p) => p.id === game.seats[seat]);
  const nameAt = (seat: number) => (game.seats[seat] === view.me ? t('you') : (playerAt(seat)?.name ?? '?'));
  /** Line colours per seat: the four inks, then bordeaux and gold. */
  const COLOURS = ['#4a3122', '#17834a', '#cc2b2b', '#c99700', '#5b1427', '#1c5bc4'];
  const history = $derived(game.match.history.filter((h) => h.counts || h.points.some(Boolean)));

  const standings = $derived(game.seats.map((_, seat) => ({ seat, total: game.match.totals[seat] })).sort((a, b) => b.total - a.total));
  const best = $derived(standings[0]?.total ?? 0);
  const winners = $derived(history.length ? standings.filter((s) => s.total === best) : []);
  const stoppedBy = $derived(game.ended === 'stopped' && game.stoppedBy ? (view.players.find((p) => p.id === game.stoppedBy)?.name ?? '') : null);

  /** The best single deal: the most points one player made in one deal. */
  const topDeal = $derived.by((): { seat: number; points: number; n: number } | null => {
    let top = { seat: -1, points: 0, n: 0 };
    for (const h of history) {
      for (let seat = 0; seat < h.points.length; seat++) if (h.points[seat] > top.points) top = { seat, points: h.points[seat], n: h.n };
    }
    return top.seat >= 0 ? top : null;
  });

  const W = 320;
  const H = 150;
  const series = $derived.by(() => {
    const sums = game.seats.map(() => 0);
    const points = game.seats.map(() => [0]);
    for (const h of history) h.points.forEach((p, i) => points[i]?.push((sums[i] += p)));
    return points;
  });
  const lo = $derived(Math.min(0, ...series.flat()));
  const hi = $derived(Math.max(1, ...series.flat()));
  const x = (i: number) => 8 + (i / Math.max(1, history.length)) * (W - 16);
  const y = (v: number) => 8 + (1 - (v - lo) / (hi - lo || 1)) * (H - 16);

  let error = $state('');
  async function act(action: string, body: unknown, from: Event) {
    error = '';
    try {
      await actAt(room, action, body, from);
    } catch (e) {
      error = errorText(e instanceof ApiError ? e.code : 'other');
    }
  }
</script>

<div class="final">
  <section class="sheet head">
    <span class="label">{t(`game_${game.id}`)}</span>
    {#if stoppedBy !== null}<span class="label early">{game.stoppedBy === view.me ? t('endedByYou') : t('endedBy', { name: stoppedBy })}</span>{/if}
    {#if winners.length}
      <div class="crown">
        {#each winners as w (w.seat)}
          {@const p = playerAt(w.seat)}
          {#if p}<Avatar avatar={p.avatar} size={64} />{/if}
        {/each}
      </div>
      <h1 class="display">{winners.length > 1 ? t('winnersAre', { names: names(winners.map((w) => nameAt(w.seat))) }) : game.seats[winners[0].seat] === view.me ? t('youWin') : t('winnerIs', { name: nameAt(winners[0].seat) })}</h1>
      <p class="sub">{best === 1 ? t('withPointsOne') : t('withPoints', { n: score(best) })} · {game.match.counted === 1 ? t('dealsPlayedOne') : t('dealsPlayed', { n: game.match.counted })}</p>
    {:else}
      <h1 class="display">{t('noDeals')}</h1>
    {/if}

    <ol class="standings">
      {#each standings as s, i (s.seat)}
        {@const p = playerAt(s.seat)}
        <li class:me={game.seats[s.seat] === view.me}>
          <span class="rank display">{i + 1}</span>
          <i class="dot" style:background={COLOURS[s.seat % COLOURS.length]}></i>
          {#if p}<Avatar avatar={p.avatar} size={26} />{/if}
          <span class="who">{nameAt(s.seat)}</span>
          <b class="display">{score(s.total)}</b>
        </li>
      {/each}
    </ol>

    {#if history.length > 1}
      <svg class="chart" viewBox="0 0 {W} {H}" role="img" aria-label={t('chartLabel')}>
        <line x1="8" x2={W - 8} y1={y(0)} y2={y(0)} class="zero" />
        {#each series as pts, seat (seat)}
          <polyline points={pts.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')} style:stroke={COLOURS[seat % COLOURS.length]} />
          <circle cx={x(pts.length - 1)} cy={y(pts.at(-1)!)} r="3" style:fill={COLOURS[seat % COLOURS.length]} />
        {/each}
      </svg>
    {/if}
  </section>

  {#if topDeal}
    <section class="sheet award">
      <span class="label">{t('awardBest')}</span>
      <b>{nameAt(topDeal.seat)}</b>
      <small>{t('awardBestLine', { n: score(topDeal.points, true), deal: topDeal.n })}</small>
    </section>
  {/if}

  <div class="actions on-cloth">
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    {#if isHost}
      <button class="btn primary block" type="button" onclick={(e) => act('rematch', undefined, e)}>{t('again')}</button>
      <button class="btn paper block" type="button" onclick={(e) => act('rematch', { lobby: true }, e)}>{t('toLobby')}</button>
    {:else}
      <p class="wait">{t('waitAgain', { name: hostName })}</p>
    {/if}
    <button class="btn quiet" type="button" onclick={(e) => onleave(e)}>{t('leaveGame')}</button>
  </div>
</div>

<style>
  .final {
    display: flex;
    flex-direction: column;
    gap: 14px;
    max-width: 460px;
    margin: 10px auto 0;
  }
  .head {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 24px 20px 20px;
    text-align: center;
  }
  .early {
    color: var(--bad);
  }
  .crown {
    display: flex;
    gap: 6px;
  }
  h1 {
    margin: 0;
    font-size: 30px;
    line-height: 1.1;
    text-wrap: balance;
  }
  .sub {
    margin: 0;
    font-size: 14px;
    color: var(--mute);
  }
  .standings {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
    margin: 6px 0 0;
    padding: 0;
    list-style: none;
    text-align: left;
  }
  .standings li {
    display: grid;
    grid-template-columns: 22px 8px auto minmax(0, 1fr) 56px;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
    border-radius: 999px;
  }
  .standings li.me {
    background: var(--paper-2);
  }
  .rank {
    font-size: 16px;
    color: var(--mute);
    text-align: center;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .who {
    overflow: hidden;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .standings b {
    font-size: 19px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .chart {
    width: 100%;
    height: auto;
    margin-top: 6px;
    overflow: visible;
  }
  .chart polyline {
    fill: none;
    stroke-width: 2;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .chart .zero {
    stroke: var(--line);
    stroke-dasharray: 3 4;
  }
  .award {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 16px 16px 14px;
  }
  .award b {
    font: 700 17px/1.2 var(--display);
  }
  .award small {
    font-size: 12px;
    color: var(--mute);
  }
  .actions {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }
  .wait {
    margin: 0;
    color: var(--on-cloth-2);
  }
</style>
