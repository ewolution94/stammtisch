<!-- A room you have a seat in: the lobby, the game's table (Mau-Mau's, or the trick games'), or its end. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { api, type Config } from '../lib/api';
  import { t } from '../lib/i18n.svelte';
  import type { Room } from '../lib/room.svelte';
  import { actAt } from '../lib/waits';
  import Final from './Final.svelte';
  import Lobby from './Lobby.svelte';
  import DurakTable from './DurakTable.svelte';
  import MauTable from './MauTable.svelte';
  import Sounds from './Sounds.svelte';
  import TrickTable from './TrickTable.svelte';

  let { room, onleave, onrejoin }: { room: Room; onleave: () => void; onrejoin: () => void } = $props();

  let config: Config | null = $state.raw(null);
  const view = $derived(room.view);

  onMount(() => {
    api.config().then((c) => (config = c), () => {});
  });

  // Removed from the room (kicked, or dropped from the lobby): ask for a name again.
  $effect(() => {
    if (view && view.phase !== 'gone' && view.me === null) onrejoin();
  });

  async function leave(from?: Event) {
    try {
      await actAt(room, 'leave', undefined, from);
    } catch {
      // gone either way
    }
    onleave();
  }
</script>

<Sounds {room} />

{#if !view}
  <p class="label wait">{t(room.wasLive ? 'reconnecting' : 'connecting')}</p>
{:else if view.phase === 'gone'}
  <div class="gone sheet">
    <p class="display">{t('gone')}</p>
    <button class="btn" type="button" onclick={onleave}>{t('home')}</button>
  </div>
{:else if view.phase === 'lobby'}
  <Lobby {room} {view} {config} />
  <button class="btn quiet leave on-cloth" type="button" onclick={(e) => leave(e)}>{t('leaveGame')}</button>
{:else if view.phase === 'final' && view.game}
  <Final {room} {view} onleave={leave} />
{:else if view.game?.id === 'maumau'}
  <MauTable {room} {view} onleave={leave} />
{:else if view.game?.id === 'durak'}
  <DurakTable {room} {view} onleave={leave} />
{:else if view.game}
  <TrickTable {room} {view} onleave={leave} />
{/if}

<style>
  .wait {
    text-align: center;
    margin-top: 40px;
  }
  .gone {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    max-width: 420px;
    margin: 40px auto 0;
    padding: 28px;
    text-align: center;
  }
  .gone .display {
    margin: 0;
    font-size: 26px;
  }
  .leave {
    display: flex;
    margin: 18px auto 0;
  }
</style>
