<!--
  The host's sheet for one player: seat them at the table or send them to watch, or take them out of
  the room (a bot: remove it). It stays open while the move waits at the tapped button
  (src/lib/waits.ts), and shows why when it fails.
-->
<script lang="ts">
  import type { Player } from '../lib/api';
  import { t } from '../lib/i18n.svelte';

  let {
    player,
    seated,
    full,
    onseat,
    onremove,
    onclose,
    error = '',
  }: {
    player: Player | null;
    seated: boolean;
    full: boolean;
    onseat: (seated: boolean, from: Event) => void;
    onremove: (from: Event) => void;
    onclose: () => void;
    /** Why the last move failed. */
    error?: string;
  } = $props();

  let shown: Player | null = $state(null);
  $effect(() => {
    if (player) shown = player;
  });
</script>

<ewo-sheet open={Boolean(player)} label={t('playerActions')} oncancel={onclose} onclose={() => ((shown = null), onclose())}>
  <span slot="heading">{shown?.name ?? t('playerActions')}</span>
  {#if shown}
    <div class="menu">
      {#if !shown.bot}
        {#if seated}
          <button class="btn block" type="button" onclick={(e) => onseat(false, e)}>{t('makeWatch')}</button>
        {:else}
          <button class="btn block" type="button" disabled={full} onclick={(e) => onseat(true, e)}>{t('makeSit')}</button>
        {/if}
      {/if}
      <button class="btn quiet block danger" type="button" onclick={(e) => onremove(e)}>{shown.bot ? t('removeBot') : t('kick')}</button>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
    </div>
  {/if}
</ewo-sheet>

<style>
  .menu {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-bottom: 8px;
  }
  .danger {
    color: var(--bad);
  }
</style>
