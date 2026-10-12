<!--
  The top of every table: the game, which deal of how many, what's being played (a contract, a bid),
  the calls so far, a Bock round's ×2; then the score sheet and the settings.
-->
<script lang="ts">
  import type { Game } from '../lib/api';
  import { t } from '../lib/i18n.svelte';

  let {
    game,
    title,
    sub = '',
    extra = '',
    dealNo,
    onsheet,
    onsettings,
  }: { game: Game; title: string; sub?: string; extra?: string; dealNo: number; onsheet: () => void; onsettings: () => void } = $props();
</script>

<header class="top">
  <div class="what">
    <span class="label on-cloth">{title} · {t('dealOf', { n: dealNo, of: game.match.deals })}{#if game.match.factor > 1}<b class="bock">Bock ×{game.match.factor}</b>{/if}</span>
    {#if sub}<span class="sub display">{sub}</span>{/if}
    {#if extra}<span class="extra">{extra}</span>{/if}
  </div>
  <div class="tools">
    <button class="tool" type="button" onclick={onsheet} aria-label={t('scoreSheet')}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3.5" width="14" height="17" rx="1.5" /><path d="M8.5 8h7M8.5 12h7M8.5 16h4" /></svg>
    </button>
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <ewo-settings-button onclick={onsettings}></ewo-settings-button>
  </div>
</header>

<style>
  .top {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 54px;
    padding-bottom: 10px;
    border-bottom: 1px solid rgb(236 230 214 / 0.12);
  }
  .what {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .sub {
    overflow: hidden;
    font-size: 18px;
    line-height: 1.15;
    color: var(--on-cloth);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .extra {
    font: 600 12px/1.2 var(--ewo-sans);
    color: var(--gold-hi);
  }
  .bock {
    margin-left: 8px;
    padding: 1px 6px;
    border-radius: 999px;
    background: var(--gold);
    color: var(--ink);
    letter-spacing: 0.04em;
  }
  .tools {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
    --ewo-fg: var(--on-cloth);
    --ewo-fg-2: var(--on-cloth);
    --ewo-fill-2: rgb(255 255 255 / 0.1);
  }
  .tool {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: none;
    color: var(--on-cloth);
  }
  .tool svg {
    width: 22px;
    height: 22px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
