<!--
  The Durak table: the others across the far side (cards held, who attacks, who defends, who's out),
  the stock with the trump card turned under it, and the bout in the middle: each attack with the card
  that beat it laid across. Play by flicking or tapping a card twice, as everywhere here: the attacker
  leads, everyone may throw in a card of a rank on the table, the defender's card beats the first
  open attack it can (or, with the house rule, passes the attack on). The defender may take the table;
  an attacker says it's done. The bout's end stays a moment: beaten off, or taken up.
-->
<script lang="ts">
  import { ApiError, type DurakDeal, type View } from '../lib/api';
  import { cardsText, dealNumber, suitName } from '../lib/games';
  import { errorText, t } from '../lib/i18n.svelte';
  import type { Room } from '../lib/room.svelte';
  import { seatSpots, twist } from '../lib/table';
  import { prefs } from '../lib/prefs.svelte';
  import { screen, tableScale } from '../lib/desk.svelte';
  import { actAt } from '../lib/waits';
  import { askTilt } from '../lib/tilt';
  import Card from './Card.svelte';
  import DealEnd from './DealEnd.svelte';
  import Hand from './Hand.svelte';
  import Inspect from './Inspect.svelte';
  import ScoreSheet from './ScoreSheet.svelte';
  import SeatChip from './SeatChip.svelte';
  import RailSeats from './RailSeats.svelte';
  import SeatBoard from './SeatBoard.svelte';
  import DeskTable from './DeskTable.svelte';
  import Settings from './Settings.svelte';
  import TableTop from './TableTop.svelte';

  let { room, view, onleave }: { room: Room; view: View; onleave: (from?: Event) => Promise<void> } = $props();

  const game = $derived(view.game!);
  const deal = $derived(game.deal as DurakDeal | null);
  const n = $derived(game.dealSeats.length);
  const mine = $derived(game.seat);
  const home = $derived(mine >= 0 ? mine : 0);
  const playerAt = (seat: number) => view.players.find((p) => p.id === game.seats[game.dealSeats[seat]]);
  const nameAt = (seat: number) => (seat === mine ? t('you') : (playerAt(seat)?.name ?? '?'));
  const others = $derived(Array.from({ length: n - 1 }, (_, i) => (home + 1 + i) % n));
  // Where the other players' place cards are (Settings → Players; the user, 2026-10-15, as in
  // Stichle): round the table, each on the rail where they sit (the default), or on a board above
  // the cloth, everyone in playing order, you last.
  const onBoard = $derived(prefs.seats === 'board');
  let clothW = $state(360);
  let clothH = $state(480);
  const spots = $derived(seatSpots(others, mine, n, clothW, clothH));
  // The desktop table (DeskTable.svelte, from 1100 × 740 up) and its size.
  const scale = $derived(tableScale());
  const moves = $derived(deal?.moves ?? []);
  const defending = $derived(Boolean(deal && mine === deal.defender));
  /** Every card you may lay now: attack, throw in, beat, pass on. */
  const legal = $derived([...new Set(moves.filter((m) => m.card).map((m) => m.card as string))]);
  const can = (type: string) => moves.some((m) => m.type === type);
  const myTurn = $derived(Boolean(deal && game.phase === 'deal' && deal.phase === 'play' && deal.turn === mine));

  let error = $state('');
  let errorTimer = 0;
  function say(text: string, ms = 2600) {
    error = text;
    clearTimeout(errorTimer);
    errorTimer = window.setTimeout(() => (error = ''), ms);
  }

  async function move(m: Record<string, unknown>, from?: Event) {
    try {
      await actAt(room, 'move', { move: m }, from);
    } catch (e) {
      say(errorText(e instanceof ApiError ? e.code : 'other'));
      throw e;
    }
  }

  /** A card laid: what it does follows from who you are and what's on the table. */
  function lay(card: string) {
    const beat = moves.find((m) => m.type === 'beat' && m.card === card);
    const transfer = moves.find((m) => m.type === 'transfer' && m.card === card);
    if (beat) return move({ type: 'beat', card, at: beat.at });
    if (transfer) return move({ type: 'transfer', card });
    return move({ type: 'attack', card });
  }

  // A card that could beat or pass the attack on: ask which.
  let choosing: string | null = $state(null);
  const both = (card: string) => moves.some((m) => m.type === 'beat' && m.card === card) && moves.some((m) => m.type === 'transfer' && m.card === card);
  // The moment gone (the table changed, the clock played): the question goes too.
  $effect(() => {
    if (choosing && !both(choosing)) choosing = null;
  });

  function refused() {
    if (!deal) return;
    if (defending) return say(t('durakBeatHint', { suit: suitName(deal.trump) }));
    say(deal.table.length ? t('durakThrowHint') : t('notYourTurn'));
  }

  let inspecting: string | null = $state(null);
  function inspect(card: string) {
    askTilt();
    inspecting = card;
  }
  let sheetOpen = $state(false);
  let settingsOpen = $state(false);

  // The bout's end, a moment longer: beaten off, or taken up. The timer's effect depends on the
  // bout's number alone and reads nothing it writes: one that read its own guard re-ran, cleared its
  // timer and never set it again, so "Bito" and the last bout stayed on the empty table (Workspace's
  // audit, 2026-10-13). Every view reads the clock again too.
  let showUntil = $state(0);
  let now = $state(Date.now());
  const boutN = $derived(deal?.lastBout?.n ?? 0);
  $effect(() => {
    if (!boutN) return;
    showUntil = Date.now() + 1300;
    now = Date.now();
    const timer = setTimeout(() => (now = Date.now()), 1350);
    return () => clearTimeout(timer);
  });
  $effect(() => {
    void deal;
    now = Date.now();
  });
  const ending = $derived(Boolean(deal?.lastBout && !deal.table.length && now < showUntil));
  const pairs = $derived(deal ? (deal.table.length || !ending ? deal.table : (deal.lastBout?.pairs ?? [])) : []);

  const status = $derived.by(() => {
    if (!deal || game.phase !== 'deal' || deal.phase !== 'play') return '';
    if (ending && deal.lastBout) return deal.lastBout.took ? (deal.lastBout.defender === mine ? t('durakTookYou') : t('durakTook', { name: nameAt(deal.lastBout.defender) })) : t('durakBito');
    if (defending) {
      if (deal.taking) return t('durakTakingYou');
      return deal.table.some((p) => !p.defense) ? t('durakDefendYou') : t('durakDefendedYou');
    }
    if (!deal.table.length) return deal.attacker === mine ? t('durakLeadYou') : t('durakLeadOther', { name: nameAt(deal.attacker) });
    if (deal.taking) return t('durakTakingOther', { name: nameAt(deal.defender) });
    return can('attack') ? t('durakThrowYou') : t('durakDefendOther', { name: nameAt(deal.defender) });
  });

  const dealNo = $derived(dealNumber(game));
  const sub = $derived(deal ? `${t('trumpIs', { suit: suitName(deal.trump) })} · ${t('durakStock', { n: deal.stock })}` : '');

  function seatTags(seat: number) {
    const tags: { text: string; tone?: 're' | 'kontra' | 'gold' | 'plain' }[] = [];
    if (!deal) return tags;
    if (deal.out.includes(seat)) tags.push({ text: t('durakOutTag'), tone: 'gold' });
    else if (seat === deal.defender) tags.push({ text: deal.taking ? t('durakTakesTag') : t('durakDefendsTag'), tone: 'kontra' });
    else if (seat === deal.attacker) tags.push({ text: t('durakAttacksTag'), tone: 're' });
    if (deal.passed[seat] && seat !== deal.defender) tags.push({ text: t('durakDoneTag'), tone: 'plain' });
    return tags;
  }
</script>

<!-- A seat's place card, in the shape its place asks for: round the table, narrow, or on the board. -->
{#snippet chipOf(seat: number, shape: '' | 'narrow' | 'board')}
  {@const me = mine >= 0 && seat === mine}
  <SeatChip
    {room}
    player={playerAt(seat)}
    {me}
    narrow={shape === 'narrow'}
    board={shape === 'board'}
    line={deal ? cardsText(me ? (deal.hand?.length ?? 0) : deal.counts[seat]) : ''}
    tags={seatTags(seat)}
    total={game.match.totals[game.dealSeats[seat]] ?? 0}
    dealer={deal?.dealer === seat}
    active={me ? myTurn : game.phase === 'deal' && deal?.turn === seat && deal?.phase === 'play'}
    gone={!me && game.gone[game.dealSeats[seat]]}
    endsAt={game.endsAt}
  />
{/snippet}

{#snippet bar()}
  <TableTop {game} title={t('game_durak')} {sub} {dealNo} onsheet={() => (sheetOpen = true)} onsettings={() => (settingsOpen = true)} />
{/snippet}

{#snippet stockOf()}
  <div class="stock" aria-label={t('durakStock', { n: deal?.stock ?? 0 })}>
    {#if deal && (deal.stock > 0 || deal.trumpCard)}
      <span class="trumpcard" class:last={deal.stock <= 1}><Card id={deal.trumpCard} /></span>
      {#if deal.stock > 1}<span class="back"><Card back /></span>{/if}
      <span class="count">{deal.stock}</span>
    {/if}
  </div>
{/snippet}

{#snippet boutOf()}
  <div class="bout" class:ending class:took={ending && deal?.lastBout?.took}>
    {#each pairs as pair, i (i)}
      <div class="pair">
        <span class="atk" style:rotate="{twist(pair.attack, i)}deg"><Card id={pair.attack} /></span>
        {#if pair.defense}<span class="def" style:rotate="{Number(twist(pair.defense, i + 7)) + 14}deg"><Card id={pair.defense} /></span>{/if}
      </div>
    {/each}
  </div>
{/snippet}

{#snippet notice()}
  {#if error}
    <p class="toast" role="alert">{error}</p>
  {:else if status && !choosing}
    <p class="status" class:mine={myTurn || can('attack')} aria-live="polite">{status}</p>
  {/if}
{/snippet}

{#snippet choosingPanel()}
  {#if choosing}
    <div class="panel sheet">
      <span class="label">{t('durakBeatOrPass')}</span>
      <div class="pair2">
        <button class="btn primary" type="button" onclick={() => { const c = choosing!; choosing = null; void lay(c).catch(() => {}); }}>{t('durakBeat')}</button>
        <button class="btn" type="button" onclick={() => { const c = choosing!; choosing = null; void move({ type: 'transfer', card: c }).catch(() => {}); }}>{t('durakPassOn')}</button>
      </div>
      <button class="btn ghost small" type="button" onclick={() => (choosing = null)}>{t('back')}</button>
    </div>
  {/if}
{/snippet}

{#snippet actions()}
  <div class="actions">
    {#if can('take')}<button class="btn paper small" type="button" onclick={(e) => void move({ type: 'take' }, e).catch(() => {})}>{t('durakTake')}</button>{/if}
    {#if can('pass')}<button class="btn paper small" type="button" onclick={(e) => void move({ type: 'pass' }, e).catch(() => {})}>{t('durakDone')}</button>{/if}
  </div>
{/snippet}

{#snippet handOf(flat: boolean, hotkeys: boolean, size: number)}
  <!-- Between deals the hand is empty but keeps its box, so the table doesn't move. -->
  {#if mine >= 0}
    <Hand
      cards={deal?.hand ?? []}
      {legal}
      canPlay={legal.length > 0}
      onplay={(card) => lay(card)}
      target={() => null}
      oninspect={inspect}
      onrefuse={refused}
      intercept={(card) => (both(card) ? ((choosing = card), true) : false)}
      {flat}
      {hotkeys}
      scale={size}
    />
  {:else}
    <p class="watching">{t('watchingGame')}</p>
  {/if}
{/snippet}

{#if screen.desk}
  <DeskTable {n} {mine} {home} {others} {onBoard} {scale} held={(seat) => deal?.counts[seat] ?? 0} max={9} top={bar}>
    {#snippet chip(seat, shape)}{@render chipOf(seat, shape === 'board' ? 'board' : '')}{/snippet}
    {#snippet left()}<div class="desk-stock">{@render stockOf()}</div>{/snippet}
    {#snippet middle()}<div class="middle big">{@render boutOf()}</div>{/snippet}
    {#snippet right()}
      <!-- What went off ("bito"), face down: everyone saw it go. -->
      {#if deal && deal.discard > 0}
        <div class="desk-off" aria-label={t('durakOff', { n: deal.discard })}>
          <span class="offpile">
            <span class="back b1"><Card back /></span>
            <span class="back b2"><Card back /></span>
          </span>
          <span class="desk-tag">{t('durakOffTag', { n: deal.discard })}</span>
        </div>
      {/if}
    {/snippet}
    {#snippet float()}
      {@render notice()}
      {@render choosingPanel()}
    {/snippet}
    {#snippet beside()}{@render actions()}{/snippet}
    {#snippet hand()}{@render handOf(prefs.hand === 'flat', true, scale)}{/snippet}
  </DeskTable>
{:else}
<div class="table">
  {@render bar()}

  {#if onBoard}
    <SeatBoard order={[...others, home]}>{#snippet chip(seat)}{@render chipOf(seat, 'board')}{/snippet}</SeatBoard>
  {/if}

  <div class="felt cloth" class:boarded={onBoard} bind:clientWidth={clothW} bind:clientHeight={clothH}>
    {#if !onBoard}
      <RailSeats {spots} held={(seat) => deal?.counts[seat] ?? 0} max={9}>
        {#snippet chip(spot)}{@render chipOf(spot.seat, spot.narrow ? 'narrow' : '')}{/snippet}
      </RailSeats>
    {/if}

    <div class="middle">
      {@render stockOf()}
      {@render boutOf()}
    </div>
  </div>

  <div class="dock" class:bare={onBoard}>
    {@render notice()}

    {@render choosingPanel()}

    {@render actions()}

    <div class="mine">
      {#if !onBoard && n > 0}{@render chipOf(home, '')}{/if}
    </div>

    {@render handOf(false, false, 1)}
  </div>
</div>
{/if}

{#if game.phase === 'scored'}
  <DealEnd {room} {view} />
{/if}

<Inspect card={inspecting} onclose={() => (inspecting = null)} />
<ScoreSheet open={sheetOpen} {view} onclose={() => (sheetOpen = false)} />
<Settings open={settingsOpen} onclose={() => (settingsOpen = false)} {room} {onleave} />

<style>
  .table {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    padding: calc(env(safe-area-inset-top, 0px) + 8px) 10px calc(env(safe-area-inset-bottom, 0px) + 6px);
    overflow: hidden;
    color: var(--on-cloth);
  }
  @media (min-width: 720px) {
    .table {
      padding-inline: max(16px, calc((100vw - 640px) / 2));
    }
  }
  /* The cloth: from under the bar to your seat, which sits on its near edge. Round the table the
     others' cards sit on its rail, the far ones over its top edge: the play's room starts under them. */
  .cloth {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    margin: 22px 6px -30px;
    padding: 50px 12px 34px;
  }
  /* On the board the cloth holds nobody's card: only the play, and room for it. */
  .cloth.boarded {
    margin: 12px 6px 8px;
    padding: 16px 12px;
  }
  .middle {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  /* The stock at the side: the trump card across under it, a little of it showing. */
  .stock {
    position: relative;
    flex: none;
    width: 60px;
    aspect-ratio: 5 / 7;
    /* The trump card's end sticks out to the right: room for it, so the bout never covers it. */
    margin-inline-end: 30px;
  }
  .trumpcard {
    position: absolute;
    inset: 0;
    rotate: 90deg;
    translate: 18px 0;
  }
  .trumpcard.last {
    rotate: 0deg;
    translate: 0 0;
  }
  .back {
    position: absolute;
    inset: 0;
  }
  .count {
    position: absolute;
    left: -6px;
    bottom: -10px;
    min-width: 24px;
    padding: 3px 6px;
    border-radius: 999px;
    background: var(--paper);
    color: var(--ink);
    font: 700 12px/1 var(--display);
    font-variant-numeric: lining-nums;
    text-align: center;
  }
  /* The bout: up to six attacks, each with the card that beat it laid across. */
  /* The desktop table: the stock with its trump at the left, the bout in the middle, grown with the
     table's size (no vw there), what went off at the right. */
  .desk-stock {
    display: grid;
    place-items: center;
    width: 140px;
  }
  .desk-stock .stock {
    width: 92px;
    margin-inline-end: 44px;
  }
  .desk-stock .trumpcard {
    translate: 28px 0;
  }
  .middle.big {
    justify-content: center;
  }
  .middle.big .pair {
    width: calc(104px * var(--scale, 1));
  }
  .middle.big .bout {
    gap: calc(28px * var(--scale, 1)) calc(18px * var(--scale, 1));
    max-width: calc(520px * var(--scale, 1));
  }
  .desk-off {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }
  .offpile {
    position: relative;
    display: block;
    width: 110px;
    height: 120px;
  }
  .offpile .back {
    width: 80px;
    filter: drop-shadow(0 6px 8px rgb(0 0 0 / 0.45));
  }
  .offpile .b1 {
    left: 14px;
    top: 6px;
    rotate: 12deg;
  }
  .offpile .b2 {
    left: 18px;
    rotate: -6deg;
  }
  .desk-tag {
    font: 650 11px/1.3 var(--ewo-sans);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--on-cloth-2);
    text-align: center;
  }
  :global(.desk-float) .panel {
    left: 50%;
    right: auto;
    width: min(440px, 100%);
    translate: -50% 0;
  }
  .bout {
    flex: 1 1 auto;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px 8px;
    align-content: center;
    justify-items: center;
    min-width: 0;
    transition: opacity 0.5s ease-in, translate 0.5s ease-in;
  }
  .bout.ending {
    opacity: 0.5;
  }
  .pair {
    position: relative;
    width: min(64px, 100%);
    aspect-ratio: 5 / 7;
  }
  .atk,
  .def {
    position: absolute;
    inset: 0;
    animation: lay 0.3s cubic-bezier(0.2, 0.9, 0.3, 1.2) backwards;
  }
  .def {
    translate: 8px 12px;
  }
  @keyframes lay {
    from {
      scale: 1.15;
      opacity: 0;
    }
  }
  .dock {
    position: relative;
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  /* The status floats on the table's near edge, above your place card: it comes and goes without
     moving anything, so the table keeps its size. */
  .status,
  .toast {
    position: absolute;
    z-index: 6;
    left: 50%;
    bottom: calc(100% + 6px);
    translate: -50% 0;
    width: max-content;
    max-width: calc(100% - 24px);
    margin: 0;
    padding: 4px 12px;
    border-radius: 999px;
    background: rgb(10 18 13 / 0.7);
    font: 600 14px/1.3 var(--ewo-sans);
    text-align: center;
    color: var(--on-cloth-2);
  }
  .status.mine {
    color: var(--gold-hi);
  }
  .toast {
    color: #ffe0b0;
  }
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
  }
  .pair2 {
    display: flex;
    gap: 8px;
  }
  .pair2 .btn {
    flex: 1;
  }
  .actions {
    display: flex;
    justify-content: center;
    gap: 8px;
    min-height: 36px;
  }
  .mine {
    display: flex;
    justify-content: center;
  }
  /* On the board your card is up there too: the dock keeps your hand, the status a little higher. */
  .bare .mine {
    min-height: 8px;
  }
  .bare .status,
  .bare .toast {
    bottom: calc(100% + 20px);
  }
  .watching {
    margin: 10px 0 18px;
    text-align: center;
    color: var(--on-cloth-2);
  }
</style>
