<!--
  The lobby: the table's code, link and QR code; which game (Mau-Mau, Doppelkopf, Skat); the chairs in
  the order play will go round; who's watching; and the host's settings: how many rounds, the clock,
  and the game's house rules. A setting answers the tap at once and the server's echo takes over once
  it agrees (learnings/ui-preferences.md → "A control answers the tap"). From Stichle's Lobby.svelte.
-->
<script lang="ts">
  import { ui } from '../lib/ui.svelte';
  import { ApiError, GAMES, levelIn, levelsFor, type Config, type GameId, type Level, type Player, type Rules, type Settings, type View } from '../lib/api';
  import type { Avatar as AvatarValue } from '../lib/avatar';
  import { errorText, t, type Key } from '../lib/i18n.svelte';
  import type { Room } from '../lib/room.svelte';
  import { saveAvatar } from '../lib/session';
  import { actAt } from '../lib/waits';
  import Avatar from './Avatar.svelte';
  import AvatarMaker from './AvatarMaker.svelte';
  import BotRank from './BotRank.svelte';
  import PlayerMenu from './PlayerMenu.svelte';
  import Qr from './Qr.svelte';

  let { room, view, config }: { room: Room; view: View; config: Config | null } = $props();

  const MAX = $derived(config?.seats ?? 6);
  const SECONDS = $derived(config?.moveSeconds ?? { relaxed: 60, quick: 25 });
  const ROUNDS = $derived(config?.rounds ?? [1, 2, 3, 4, 6]);
  const TABLE: Record<GameId, { min: number; max: number }> = { maumau: { min: 2, max: 6 }, doppelkopf: { min: 4, max: 6 }, skat: { min: 3, max: 4 }, durak: { min: 2, max: 6 } };

  /**
   * Each game's house rules as the lobby shows them: a switch for on/off, a segmented choice
   * otherwise. `needs`: only shown while that rule is on.
   */
  type RuleRow = { key: string; kind: 'flag' } | { key: string; kind: 'choice'; values: (string | number)[] };
  const RULES: Record<GameId, (RuleRow & { needs?: string })[]> = {
    maumau: [
      { key: 'seven', kind: 'flag' },
      { key: 'sevenStack', kind: 'flag', needs: 'seven' },
      { key: 'eight', kind: 'flag' },
      { key: 'jack', kind: 'flag' },
      { key: 'jackOnJack', kind: 'flag', needs: 'jack' },
      { key: 'ace', kind: 'flag' },
      { key: 'nine', kind: 'flag' },
      { key: 'mau', kind: 'flag' },
      { key: 'hand', kind: 'choice', values: [4, 5, 6, 7] },
      { key: 'scoring', kind: 'choice', values: ['tally', 'points'] },
    ],
    doppelkopf: [
      { key: 'nines', kind: 'flag' },
      { key: 'dulle', kind: 'choice', values: ['first', 'second', 'second-not-last'] },
      { key: 'schweinchen', kind: 'flag' },
      { key: 'poverty', kind: 'flag' },
      { key: 'throw', kind: 'flag' },
      { key: 'duty', kind: 'flag' },
      { key: 'bock', kind: 'flag' },
    ],
    skat: [
      { key: 'scoring', kind: 'choice', values: ['plain', 'list'] },
      { key: 'ramsch', kind: 'flag' },
      { key: 'kontra', kind: 'flag' },
      { key: 'bock', kind: 'flag' },
    ],
    durak: [
      { key: 'transfer', kind: 'flag' },
      { key: 'throwIn', kind: 'choice', values: ['all', 'neighbours'] },
      { key: 'firstFive', kind: 'flag' },
    ],
  };

  let pending: Partial<Settings> = $state({});
  let pendingRules: Partial<Record<GameId, Rules>> = $state({});
  let sending = false;
  let error = $state('');
  let copied = $state(false);
  let qrOpen = $state(false);
  let rulesOpen = $state(false);
  let menuFor: string | null = $state(null);
  let avatarOpen = $state(false);
  let avatarShown = $state(false);
  let myAvatar: AvatarValue | null = $state(null);
  $effect(() => {
    if (avatarOpen) avatarShown = true;
  });

  const isHost = $derived(view.me === view.host);
  const settings: Settings = $derived({ ...view.settings, ...pending });
  const game = $derived(settings.game);
  const rules: Rules = $derived({ ...view.rules[game], ...(pendingRules[game] ?? {}) });
  const hostName = $derived(view.players.find((p) => p.id === view.host)?.name ?? '');
  const link = $derived(`${location.origin}/${view.code}`);
  const seated = $derived(view.order.map((id) => view.players.find((p) => p.id === id)).filter((p): p is Player => Boolean(p)));
  const watching = $derived(view.players.filter((p) => !view.order.includes(p.id)));
  const amSeated = $derived(view.me !== null && view.order.includes(view.me));
  const menuPlayer = $derived(view.players.find((p) => p.id === menuFor) ?? null);
  const range = $derived(config?.games[game]?.table ?? TABLE[game]);
  const blocker = $derived(seated.length < range.min ? t('needPlayers', { n: range.min - seated.length }) : seated.length > range.max ? t('tooManyFor', { max: range.max }) : '');
  const changed = $derived(RULES[game].filter((r) => rules[r.key] !== config?.games[game]?.rules[r.key]).length);

  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

  // The server agrees: its value takes over.
  $effect(() => {
    const server = view.settings;
    const left = Object.fromEntries(Object.entries(pending).filter(([k, v]) => !same(server[k as keyof Settings], v)));
    if (Object.keys(left).length !== Object.keys(pending).length) pending = left;
    let rulesLeft = false;
    const next: Partial<Record<GameId, Rules>> = {};
    for (const [g, patch] of Object.entries(pendingRules) as [GameId, Rules][]) {
      const rest = Object.fromEntries(Object.entries(patch).filter(([k, v]) => !same(view.rules[g]?.[k], v)));
      if (Object.keys(rest).length) next[g] = rest;
      if (Object.keys(rest).length !== Object.keys(patch).length) rulesLeft = true;
    }
    if (rulesLeft) pendingRules = next;
  });

  function change(patch: Partial<Settings>) {
    if (!isHost) return;
    pending = { ...pending, ...patch };
    void flush();
  }

  function changeRule(key: string, value: boolean | string | number) {
    if (!isHost) return;
    pendingRules = { ...pendingRules, [game]: { ...(pendingRules[game] ?? {}), [key]: value } };
    void flush();
  }

  async function flush() {
    if (sending) return;
    const body: Record<string, unknown> = { ...pending };
    const r = Object.fromEntries(Object.entries(pendingRules).filter(([, v]) => v && Object.keys(v).length));
    if (Object.keys(r).length) body.rules = r;
    if (!Object.keys(body).length) return;
    sending = true;
    error = '';
    try {
      await room.act('settings', body);
    } catch (e) {
      pending = {};
      pendingRules = {};
      error = errorText(e instanceof ApiError ? e.code : 'other');
    } finally {
      sending = false;
    }
    const now: Record<string, unknown> = { ...pending };
    if (Object.keys(pendingRules).length) now.rules = pendingRules;
    if (Object.keys(now).length && !same(now, body)) void flush();
  }

  async function act(action: string, body?: unknown, from?: Event) {
    error = '';
    try {
      await actAt(room, action, body, from);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : 'other';
      error = e instanceof ApiError && code === 'too-few' ? t('needPlayers', { n: range.min - seated.length }) : errorText(code);
    }
  }

  let menuError = $state('');
  async function fromMenu(action: string, body: unknown, from: Event) {
    menuError = '';
    try {
      await actAt(room, action, body, from);
      menuFor = null;
    } catch (e) {
      menuError = errorText(e instanceof ApiError ? e.code : 'other');
    }
  }

  /** One bot's own rank, from its sheet: the sheet stays open to show it. */
  async function levelFromMenu(level: Level, from: Event) {
    menuError = '';
    try {
      await actAt(room, 'bot', { player: menuFor, level }, from);
    } catch (e) {
      menuError = errorText(e instanceof ApiError ? e.code : 'other');
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      copied = true;
      setTimeout(() => (copied = false), 1600);
    } catch {
      // The link is on the page to select by hand.
    }
  }

  function tapPlayer(p: Player) {
    if (p.id === view.me) {
      myAvatar = p.avatar;
      avatarOpen = true;
    } else if (isHost) menuFor = p.id;
  }

  function changeAvatar(next: AvatarValue) {
    myAvatar = next;
    saveAvatar(next);
    void act('avatar', { avatar: next });
  }

  const ruleLabel = (k: string) => t(`rule_${game}_${k}` as Key);
  const ruleHint = (k: string) => t(`ruleHint_${game}_${k}` as Key);
  const valueLabel = (k: string, v: string | number) => (typeof v === 'number' ? String(v) : t(`rule_${game}_${k}_${v}` as Key));
</script>

{#snippet playerRow(p: Player, chair: number | null)}
  {@const tappable = p.id === view.me || isHost}
  <svelte:element
    this={tappable ? 'button' : 'div'}
    class="player"
    class:me={p.id === view.me}
    class:away={!p.online}
    type={tappable ? 'button' : undefined}
    onclick={tappable ? () => tapPlayer(p) : undefined}
    role={tappable ? undefined : 'listitem'}
  >
    {#if chair !== null}<span class="chair display">{chair}</span>{/if}
    <Avatar avatar={p.avatar} size={30} />
    <span class="name">{p.name}</span>
    {#if p.id === view.me}<small>{t('you')}</small>{/if}
    {#if p.id === view.host}<small>{t('host')}</small>{/if}
    {#if p.bot}{@const level = levelIn(game, p.level)}<small class="rank"><span class="sr-only">{t('bot')}: </span><BotRank {level} decorative />{t(`level_${level}`)}</small>{:else if !p.online}<small>{t('away')}</small>{/if}
  </svelte:element>
{/snippet}

<div class="lobby">
  <section class="sheet roomcard">
    <span class="label">{t('table')}</span>
    <div class="coderow">
      <span class="code display pressed">{view.code}</span>
      <div class="links">
        <button class="btn small" type="button" onclick={copy}>{copied ? t('copied') : t('copyLink')}</button>
        <button class="btn small" type="button" aria-expanded={qrOpen} onclick={() => (qrOpen = !qrOpen)}>{t('showQr')}</button>
      </div>
    </div>
    <span class="url">{link}</span>
    {#if qrOpen}<div class="qr"><Qr url={link} /></div>{/if}
  </section>

  <section class="sheet pick" aria-label={t('whichGame')}>
    <h2 class="display">{t('whichGame')}</h2>
    <div class="games" role="radiogroup" aria-label={t('whichGame')}>
      {#each GAMES as g (g)}
        <button class="game" type="button" role="radio" aria-checked={game === g} disabled={!isHost && game !== g} onclick={() => change({ game: g })}>
          <b class="display">{t(`game_${g}`)}</b>
          <small>{t(`gamePlayers_${g}`)}</small>
        </button>
      {/each}
    </div>
    <p class="hint">{t(`gameHint_${game}`)}</p>
    <button class="btn quiet small howto" type="button" onclick={() => (ui.guide = game)}>{t('guideOf', { game: t(`game_${game}`) })}</button>
  </section>

  <section class="sheet seats">
    <div class="seathead">
      <h2 class="display">{t('atTheTable')}</h2>
      <span class="label">{seated.length}/{MAX}</span>
    </div>
    <div class="chairs" role="list">
      {#each seated as p, i (p.id)}{@render playerRow(p, i + 1)}{/each}
      {#each { length: Math.max(0, Math.min(MAX, Math.max(range.min, seated.length + 1)) - seated.length) } as _, i (i)}
        <div class="empty" role="listitem"><span class="chair display">{seated.length + i + 1}</span>{t('freeChair')}</div>
      {/each}
    </div>
    <p class="hint">{t('orderHint')}</p>
    <div class="row">
      {#if amSeated}
        <button class="btn small quiet" type="button" onclick={(e) => act('sit', { seated: false }, e)}>{t('watch')}</button>
      {:else if seated.length < MAX}
        <button class="btn small" type="button" onclick={(e) => act('sit', { seated: true }, e)}>{t('sitDown')}</button>
      {/if}
      {#if isHost}
        <button class="btn small" type="button" disabled={seated.length < 2} onclick={(e) => act('shuffle', undefined, e)}>{t('shuffle')}</button>
        <button class="btn small" type="button" disabled={seated.length >= MAX} onclick={(e) => act('bot', { add: true }, e)}>{t('addBot')}</button>
      {/if}
    </div>
    {#if watching.length}
      <span class="label">{t('watching')}</span>
      <div class="chairs" role="list">
        {#each watching as p (p.id)}{@render playerRow(p, null)}{/each}
      </div>
    {/if}
  </section>

  <section class="sheet setup" aria-label={t('settings')}>
    <!-- The bots' rank (the user, 2026-10-14): every bot's, the stand-ins', and each new one's. -->
    <div class="setting">
      <span class="label">{t('botsSetting')}</span>
      {#if isHost}
        <ewo-segmented stretch value={levelIn(game, settings.bots)} label={t('botsSetting')} onchange={(e) => change({ bots: e.detail.value as Level })}>
          {#each levelsFor(game) as level (level)}<option value={level}>{t(`level_${level}`)}</option>{/each}
        </ewo-segmented>
      {:else}
        <b>{t(`level_${levelIn(game, settings.bots)}`)}</b>
      {/if}
      <span class="hint">{isHost ? t('botsHint') : t('botsHintGuest')}</span>
    </div>
    <div class="setting">
      <span class="label">{t('rounds')}</span>
      {#if isHost}
        <ewo-segmented stretch value={String(settings.rounds)} label={t('rounds')} onchange={(e) => change({ rounds: Number(e.detail.value) })}>
          {#each ROUNDS as r (r)}<option value={String(r)}>{r}</option>{/each}
        </ewo-segmented>
      {:else}
        <b>{settings.rounds}</b>
      {/if}
      <span class="hint">{t('roundsHint', { n: settings.rounds * Math.max(range.min, Math.min(range.max, seated.length)) })}</span>
    </div>
    <div class="setting">
      <span class="label">{t('clock')}</span>
      {#if isHost}
        <ewo-segmented stretch value={settings.clock} label={t('clock')} onchange={(e) => change({ clock: e.detail.value as Settings['clock'] })}>
          <option value="off">{t('clock_off')}</option>
          <option value="relaxed">{SECONDS.relaxed} s</option>
          <option value="quick">{SECONDS.quick} s</option>
        </ewo-segmented>
      {:else}
        <b>{settings.clock === 'off' ? t('clock_off') : `${SECONDS[settings.clock]} s`}</b>
      {/if}
      <span class="hint">{settings.clock === 'off' ? t('clockHintOff') : t('clockHint')}</span>
    </div>

    <button class="rulesbtn" type="button" aria-expanded={rulesOpen} onclick={() => (rulesOpen = !rulesOpen)}>
      <span><b>{t('houseRules')}</b><small>{changed ? t('rulesChanged', { n: changed }) : t('rulesDefault')}</small></span>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d={rulesOpen ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} /></svg>
    </button>
    {#if rulesOpen}
      <div class="rules">
        {#each RULES[game].filter((r) => !r.needs || rules[r.needs]) as r (r.key)}
          <div class="rule" class:choice={r.kind === 'choice'}>
            <span class="name"><b>{ruleLabel(r.key)}</b><small>{ruleHint(r.key)}</small></span>
            {#if r.kind === 'flag'}
              {#if isHost}
                <ewo-switch checked={Boolean(rules[r.key])} aria-label={ruleLabel(r.key)} onchange={(e) => changeRule(r.key, e.detail.checked)}></ewo-switch>
              {:else}
                <b class="state">{rules[r.key] ? t('on') : t('off')}</b>
              {/if}
            {:else if isHost}
              <ewo-segmented stretch value={String(rules[r.key])} label={ruleLabel(r.key)} onchange={(e) => changeRule(r.key, typeof r.values[0] === 'number' ? Number(e.detail.value) : e.detail.value)}>
                {#each r.values as v (v)}<option value={String(v)}>{valueLabel(r.key, v)}</option>{/each}
              </ewo-segmented>
            {:else}
              <b class="state">{valueLabel(r.key, rules[r.key] as string | number)}</b>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <div class="go on-cloth">
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    {#if isHost}
      {#if blocker}<p class="hint center">{blocker}</p>{/if}
      <button class="btn primary block" type="button" disabled={Boolean(blocker)} onclick={(e) => act('start', undefined, e)}>{t('deal')}</button>
    {:else}
      <p class="hint center">{t('waitHost', { name: hostName })}</p>
    {/if}
  </div>
</div>

<PlayerMenu
  player={menuPlayer}
  seated={menuPlayer ? view.order.includes(menuPlayer.id) : false}
  full={seated.length >= MAX}
  onseat={(on, e) => void fromMenu('move', { player: menuFor, seated: on }, e)}
  onremove={(e) => {
    const p = menuPlayer;
    if (p) void fromMenu(p.bot ? 'bot' : 'kick', p.bot ? { add: false, player: p.id } : { player: p.id }, e);
  }}
  onlevel={(level, e) => void levelFromMenu(level, e)}
  levels={levelsFor(game)}
  onclose={() => ((menuFor = null), (menuError = ''))}
  error={menuError}
/>

<ewo-sheet open={avatarOpen} label={t('changeAvatar')} oncancel={() => (avatarOpen = false)} onclose={() => ((avatarShown = false), (avatarOpen = false))}>
  <span slot="heading">{t('changeAvatar')}</span>
  {#if avatarShown && myAvatar}
    <div class="menu">
      <AvatarMaker avatar={myAvatar} onchange={changeAvatar} />
      <button class="btn primary block" type="button" onclick={() => (avatarOpen = false)}>{t('done')}</button>
    </div>
  {/if}
</ewo-sheet>

<style>
  .lobby {
    display: grid;
    gap: 14px;
    max-width: 520px;
    margin: 8px auto 0;
  }
  .roomcard,
  .seats,
  .setup,
  .pick {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 20px 20px 18px;
  }
  .howto {
    align-self: flex-start;
    padding-inline: 2px;
    text-decoration: underline;
    text-decoration-color: var(--line);
    text-underline-offset: 4px;
  }
  .coderow {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .code {
    font-size: 44px;
    line-height: 1;
    letter-spacing: 0.08em;
  }
  .links {
    display: flex;
    gap: 6px;
  }
  .url {
    overflow-wrap: anywhere;
    font: 500 12px/1.4 var(--ewo-mono);
    color: var(--mute);
  }
  .qr {
    width: min(220px, 70%);
    margin: 4px auto 0;
  }
  h2 {
    margin: 0;
    font-size: 22px;
  }
  .games {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  @media (min-width: 560px) {
    .games {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }
  .game {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    min-height: 72px;
    padding: 10px 6px;
    border: 1.5px solid var(--line);
    border-radius: 12px;
    background: var(--paper);
    color: var(--ink);
    text-align: center;
    -webkit-tap-highlight-color: transparent;
  }
  .game b {
    max-width: 100%;
    font-size: clamp(14px, 4vw, 17px);
    line-height: 1.1;
    overflow-wrap: anywhere;
  }
  .game small {
    font-size: 12px;
    color: var(--mute);
  }
  .game[aria-checked='true'] {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--paper);
    box-shadow: inset 0 0 0 2px var(--accent), inset 0 0 0 3px var(--gold);
  }
  .game[aria-checked='true'] small {
    color: rgb(255 255 255 / 0.8);
  }
  .game:disabled {
    opacity: 0.55;
  }
  .seathead {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }
  .chairs {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .player,
  .empty {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    padding: 4px 10px 4px 4px;
    border: 0;
    border-radius: 999px;
    background: none;
    color: var(--ink);
    font: 600 15px/1.2 var(--ewo-sans);
    text-align: left;
  }
  button.player:hover {
    background: var(--paper-2);
  }
  .player.me {
    background: var(--paper-2);
  }
  .player.away {
    opacity: 0.6;
  }
  .player .name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .player small {
    padding: 2px 7px;
    border-radius: 999px;
    background: var(--paper-2);
    font: 600 11px/1.2 var(--ewo-sans);
    color: var(--mute);
  }
  .player small.rank {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .player.me small {
    background: var(--paper);
  }
  .chair {
    width: 22px;
    font-size: 15px;
    text-align: center;
    color: var(--mute);
  }
  .empty {
    color: var(--mute);
    font-weight: 500;
    box-shadow: inset 0 0 0 1.5px var(--line);
    border-radius: 999px;
    opacity: 0.8;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .hint {
    margin: 0;
    font-size: 13px;
    color: var(--mute);
  }
  .on-cloth .hint {
    color: var(--on-cloth-2);
  }
  .center {
    text-align: center;
  }
  .setting {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .rulesbtn {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    margin-top: 4px;
    padding: 12px 14px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--paper-2);
    color: var(--ink);
    text-align: left;
  }
  .rulesbtn span {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .rulesbtn b {
    font: 700 16px/1.2 var(--display);
    font-variant-numeric: lining-nums;
  }
  .rulesbtn small {
    font-size: 12px;
    color: var(--mute);
  }
  .rulesbtn svg {
    flex: none;
    width: 20px;
    height: 20px;
    fill: none;
    stroke: var(--mute);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .rules {
    display: flex;
    flex-direction: column;
  }
  .rule {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 10px 2px;
    border-bottom: 1px solid var(--line);
  }
  .rule.choice {
    flex-direction: column;
    align-items: stretch;
  }
  .rule .name {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    font-size: 14px;
  }
  .rule .name small {
    font-size: 12px;
    color: var(--mute);
  }
  .state {
    font-size: 14px;
  }
  .go {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .menu {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding-bottom: 8px;
  }
</style>
