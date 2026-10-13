<!--
  The start: who you are (a seal and your name), then a new table, or a table by its code. The game
  is picked at the table, in the lobby. How to play: the table's guide and each game's (Guide.svelte);
  the table's opens once on a device's first visit. From Stichle's Home.svelte.
-->
<script lang="ts">
  import { api, ApiError, CODE, GAMES, type Seat } from '../lib/api';
  import type { Avatar } from '../lib/avatar';
  import { errorText, t } from '../lib/i18n.svelte';
  import { saveAvatar, savedAvatar, savedName } from '../lib/session';
  import { newKey, waitAt } from '../lib/waits';
  import AvatarMaker from './AvatarMaker.svelte';
  import { firstVisit } from '../../vendor/ewo/elements/guide.js';
  import type { GuideId } from '../lib/guides';
  import { ui } from '../lib/ui.svelte';

  // A device's first visit opens how the table works, once (Folio's firstVisit: never again, and
  // never when storage is unavailable).
  $effect(() => {
    if (firstVisit('stammtisch:guide')) ui.guide = 'table';
  });
  const guides: GuideId[] = ['table', ...GAMES];

  let {
    oncreate,
    onjoin,
  }: { oncreate: (seat: Seat, name: string, signal: AbortSignal) => Promise<void>; onjoin: (code: string) => void } = $props();

  let name = $state(savedName());
  let avatar: Avatar = $state(savedAvatar());
  let code = $state('');
  let error = $state('');
  let key = newKey();

  const cleanCode = $derived(code.trim().toUpperCase());

  function changeAvatar(next: Avatar) {
    avatar = next;
    saveAvatar(next);
  }

  async function create(event: SubmitEvent) {
    event.preventDefault();
    if (!name.trim()) {
      error = errorText('name');
      return;
    }
    error = '';
    const who = name.trim();
    try {
      await waitAt(event, async (signal) => oncreate(await api.create(who, avatar, key, signal), who, signal), t('wait_create'));
      key = newKey();
    } catch (e) {
      error = errorText(e instanceof ApiError ? e.code : 'other');
    }
  }

  function join(event: SubmitEvent) {
    event.preventDefault();
    if (CODE.test(cleanCode)) onjoin(cleanCode);
  }
</script>

<div class="home">
  <p class="games on-cloth">Mau-Mau · Doppelkopf · Skat · Durak</p>
  <form class="sheet card" onsubmit={create}>
    <h1 class="display">{t('whoAreYou')}</h1>
    <AvatarMaker {avatar} onchange={changeAvatar} />
    <label class="field">
      <span class="label">{t('yourName')}</span>
      <input class="input" bind:value={name} maxlength="16" autocomplete="nickname" placeholder={t('namePlaceholder')} />
    </label>
    <button class="btn primary block" type="submit">{t('newGame')}</button>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  </form>

  <form class="join on-cloth" onsubmit={join}>
    <span class="label">{t('joinWithCode')}</span>
    <div class="row">
      <input
        class="input code"
        bind:value={code}
        maxlength="4"
        autocapitalize="characters"
        autocomplete="off"
        spellcheck="false"
        placeholder={t('codePlaceholder')}
        aria-label={t('code')}
      />
      <button class="btn paper" type="submit" disabled={!CODE.test(cleanCode)}>{t('join')}</button>
    </div>
  </form>

  <nav class="guides on-cloth" aria-label={t('guide')}>
    <span class="label">{t('guide')}</span>
    <div class="chips">
      {#each guides as g (g)}
        <button class="btn paper small" type="button" onclick={() => (ui.guide = g)}>{g === 'table' ? t('guideTableShort') : t(`game_${g}`)}</button>
      {/each}
    </div>
  </nav>
</div>

<style>
  .home {
    display: flex;
    flex-direction: column;
    gap: 22px;
    max-width: 440px;
    margin: 14px auto 0;
  }
  .games {
    margin: 0;
    text-align: center;
    font: 700 15px/1.2 var(--display);
    letter-spacing: 0.04em;
    color: var(--gold-hi);
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 26px 22px 22px;
  }
  h1 {
    margin: 0;
    font-size: 30px;
    line-height: 1.1;
    text-align: center;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .join {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 0 4px;
  }
  .row {
    display: flex;
    gap: 10px;
  }
  .code {
    flex: 1;
    min-width: 0;
    font-family: var(--ewo-mono);
    letter-spacing: 0.3em;
    text-transform: uppercase;
  }
  .guides {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 0 4px;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
</style>
