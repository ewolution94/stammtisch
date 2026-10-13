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
  import { twist } from '../lib/table';
  import { actAt } from '../lib/waits';
  import { askTilt } from '../lib/tilt';
  import Card from './Card.svelte';
  import DealEnd from './DealEnd.svelte';
  import Hand from './Hand.svelte';
  import Inspect from './Inspect.svelte';
  import ScoreSheet from './ScoreSheet.svelte';
  import SeatChip from './SeatChip.svelte';
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

  // The bout's end, a moment longer: beaten off, or taken up.
  let shownBout = $state(0);
  let showUntil = $state(0);
  let now = $state(Date.now());
  $effect(() => {
    const b = deal?.lastBout;
    if (b && b.n !== shownBout) {
      shownBout = b.n;
      showUntil = Date.now() + 1300;
      const timer = setTimeout(() => (now = Date.now()), 1350);
      return () => clearTimeout(timer);
    }
  });
  const ending = $derived(Boolean(deal?.lastBout && !deal.table.length && now < showUntil && deal.lastBout.n === shownBout));
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

<div class="table">
  <TableTop {game} title={t('game_durak')} {sub} {dealNo} onsheet={() => (sheetOpen = true)} onsettings={() => (settingsOpen = true)} />

  <div class="felt cloth">
    <div class="seats" style:--count={others.length}>
      {#each others as seat, i (seat)}
        <div class="far" style:--lift="{Math.round((1 - Math.sin(((i + 1) / (others.length + 1)) * Math.PI)) * 14)}px">
          <SeatChip {room} player={playerAt(seat)} compact line={deal ? cardsText(deal.counts[seat]) : ''} tags={seatTags(seat)} total={game.match.totals[game.dealSeats[seat]] ?? 0} dealer={deal?.dealer === seat} active={game.phase === 'deal' && deal?.turn === seat && deal?.phase === 'play'} gone={game.gone[game.dealSeats[seat]]} endsAt={game.endsAt} />
          <span class="held" aria-hidden="true">
            {#each { length: Math.min(deal?.counts[seat] ?? 0, 9) } as _, k (k)}<i style:--k={k - (Math.min(deal?.counts[seat] ?? 0, 9) - 1) / 2}></i>{/each}
          </span>
        </div>
      {/each}
    </div>

    <div class="middle">
      <div class="stock" aria-label={t('durakStock', { n: deal?.stock ?? 0 })}>
        {#if deal && (deal.stock > 0 || deal.trumpCard)}
          <span class="trumpcard" class:last={deal.stock <= 1}><Card id={deal.trumpCard} /></span>
          {#if deal.stock > 1}<span class="back"><Card back /></span>{/if}
          <span class="count">{deal.stock}</span>
        {/if}
      </div>
      <div class="bout" class:ending class:took={ending && deal?.lastBout?.took}>
        {#each pairs as pair, i (i)}
          <div class="pair">
            <span class="atk" style:rotate="{twist(pair.attack, i)}deg"><Card id={pair.attack} /></span>
            {#if pair.defense}<span class="def" style:rotate="{Number(twist(pair.defense, i + 7)) + 14}deg"><Card id={pair.defense} /></span>{/if}
          </div>
        {/each}
      </div>
    </div>
  </div>

  <div class="dock">
    {#if error}
      <p class="toast" role="alert">{error}</p>
    {:else if status}
      <p class="status" class:mine={myTurn || can('attack')} aria-live="polite">{status}</p>
    {/if}

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

    <div class="actions">
      {#if can('take')}<button class="btn paper small" type="button" onclick={(e) => void move({ type: 'take' }, e).catch(() => {})}>{t('durakTake')}</button>{/if}
      {#if can('pass')}<button class="btn paper small" type="button" onclick={(e) => void move({ type: 'pass' }, e).catch(() => {})}>{t('durakDone')}</button>{/if}
    </div>

    <div class="mine">
      {#if mine >= 0}
        <SeatChip {room} player={playerAt(mine)} me line={deal ? cardsText(deal.hand?.length ?? 0) : ''} tags={seatTags(mine)} total={game.match.totals[game.dealSeats[mine]] ?? 0} dealer={deal?.dealer === mine} active={myTurn} endsAt={game.endsAt} />
      {/if}
    </div>

    {#if mine >= 0 && deal?.hand}
      <Hand
        cards={deal.hand}
        {legal}
        canPlay={legal.length > 0}
        onplay={(card) => lay(card)}
        target={() => null}
        oninspect={inspect}
        onrefuse={refused}
        intercept={(card) => (both(card) ? ((choosing = card), true) : false)}
      />
    {:else}
      <p class="watching">{t('watchingGame')}</p>
    {/if}
  </div>

  {#if game.phase === 'scored'}
    <DealEnd {room} {view} />
  {/if}
</div>

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
  .cloth {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    margin: 22px 6px -30px;
    padding: 18px 12px 34px;
  }
  .seats {
    display: grid;
    grid-template-columns: repeat(var(--count), minmax(0, 1fr));
    gap: 6px;
    padding-bottom: 14px;
  }
  .far {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    min-width: 0;
    translate: 0 var(--lift);
  }
  .far :global(.seat) {
    width: 100%;
    max-width: 120px;
  }
  .held {
    position: relative;
    height: 16px;
    width: 40px;
  }
  .held i {
    position: absolute;
    left: calc(50% - 5px);
    bottom: 0;
    width: 10px;
    height: 14px;
    border-radius: 1.5px;
    background: var(--back-ground);
    box-shadow: 0 0 0 1px var(--back-line), inset 0 0 0 2px rgb(255 255 255 / 0.08);
    transform-origin: 50% 120%;
    rotate: calc(var(--k) * 9deg);
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
    text-align: center;
  }
  /* The bout: up to six attacks, each with the card that beat it laid across. */
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
  .status,
  .toast {
    align-self: center;
    max-width: 100%;
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
  .panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-self: center;
    width: 100%;
    max-width: 440px;
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
  .watching {
    margin: 10px 0 18px;
    text-align: center;
    color: var(--on-cloth-2);
  }
</style>
