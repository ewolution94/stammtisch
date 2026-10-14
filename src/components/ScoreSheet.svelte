<!--
  The score sheet, like the paper one on every Stammtisch: a column per player, a row per deal with
  what it was (a solo, Skat's game, who went out) and each player's points, the totals underneath.
-->
<script lang="ts">
  import type { DealRecord, View } from '../lib/api';
  import { contractName, skatGame } from '../lib/games';
  import { score, t } from '../lib/i18n.svelte';

  let { open, view, onclose }: { open: boolean; view: View; onclose: () => void } = $props();

  const game = $derived(view.game);
  const names = $derived(game ? game.seats.map((id) => view.players.find((p) => p.id === id)?.name ?? '?') : []);

  let shown = $state(false);
  $effect(() => {
    if (open) shown = true;
  });

  /** A deal in a few words. */
  function what(h: DealRecord) {
    const s = h.summary as Record<string, any>;
    if (s.kind === 'void') return t('sheetVoid');
    if (s.kind === 'maumau') return names[s.winner] ?? '';
    if (s.kind === 'doppelkopf') {
      const c = contractName({ kind: s.contract, solo: s.solo, duty: false, alone: false, trump: null, soloist: null });
      const w = s.winner ? (s.winner === 're' ? 'Re' : 'Kontra') : '—';
      return `${c} · ${w} ${s.augen?.re ?? ''}`;
    }
    if (s.kind === 'skat') return `${names[s.declarer] ?? ''}: ${skatGame({ game: s.game, hand: s.hand, schneider: false, schwarz: false, ouvert: false })} ${s.won ? '✓' : '✗'}`;
    if (s.kind === 'ramsch') return 'Ramsch';
    if (s.kind === 'durak') return s.loser === null ? t('durakDrawShort') : `Durak: ${names[s.loser] ?? ''}`;
    return '';
  }
</script>

<ewo-sheet {open} label={t('scoreSheet')} oncancel={onclose} onclose={() => ((shown = false), onclose())}>
  <span slot="heading">{t('scoreSheet')}</span>
  {#if shown && game}
    <div class="wrap">
      <table>
        <thead>
          <tr>
            <th class="n">#</th>
            <th class="w">{t('sheetDeal')}</th>
            {#each names as name, i (i)}<th class="p">{name}</th>{/each}
          </tr>
        </thead>
        <tbody>
          {#each game.match.history as h (h.n)}
            <tr class:void={!h.counts}>
              <td class="n">{h.n}</td>
              <td class="w">{what(h)}{#if h.factor > 1} ×{h.factor}{/if}</td>
              {#each names as _, i (i)}<td class="p" class:out={!h.seats.includes(i)}>{h.seats.includes(i) || h.points[i] ? score(h.points[i] ?? 0) : '·'}</td>{/each}
            </tr>
          {:else}
            <tr><td colspan={names.length + 2} class="empty">{t('sheetEmpty')}</td></tr>
          {/each}
        </tbody>
        <tfoot>
          <tr>
            <td class="n"></td>
            <th class="w">{t('sheetTotal')}</th>
            {#each game.match.totals as total, i (i)}<td class="p display">{score(total)}</td>{/each}
          </tr>
        </tfoot>
      </table>
    </div>
  {/if}
</ewo-sheet>

<style>
  .wrap {
    overflow-x: auto;
    padding-bottom: 12px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    font-variant-numeric: lining-nums tabular-nums;
  }
  th,
  td {
    padding: 6px 6px;
    border-bottom: 1px solid var(--line);
    text-align: right;
    white-space: nowrap;
  }
  thead th {
    font: 600 11px/1.2 var(--ewo-sans);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--mute);
  }
  .n {
    width: 26px;
    color: var(--mute);
    text-align: left;
  }
  .w {
    max-width: 150px;
    overflow: hidden;
    text-align: left;
    text-overflow: ellipsis;
  }
  .p {
    min-width: 46px;
  }
  .out {
    color: var(--mute);
  }
  tr.void td {
    color: var(--mute);
  }
  tfoot td,
  tfoot th {
    border-bottom: 0;
    border-top: 2px solid var(--ink);
    font-size: 16px;
  }
  .empty {
    text-align: center;
    color: var(--mute);
  }
</style>
