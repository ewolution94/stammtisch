<!--
  The Mau-Mau table: the others across the far side (how many cards each holds, "Mau!" when said),
  the draw pile and the discard pile in the middle (what's wished, what a 7 makes the next draw),
  your hand at the bottom. Play a card by flicking it or tapping it twice, as in every game here; an
  Unter asks for the suit to wish first. Draw by tapping the pile; a drawn card that fits may go
  straight on, or be kept. Before your second-to-last card, tap "Mau!".
-->
<script lang="ts">
  import { ApiError, type MauDeal, type View } from '../lib/api';
  import { SUITS, sign, INKS, TINT, parse, type Suit } from '../lib/deck';
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
  const deal = $derived(game.deal as MauDeal | null);
  const n = $derived(game.dealSeats.length);
  const mine = $derived(game.seat);
  const home = $derived(mine >= 0 ? mine : 0);
  const playerAt = (seat: number) => view.players.find((p) => p.id === game.seats[game.dealSeats[seat]]);
  const nameAt = (seat: number) => (seat === mine ? t('you') : (playerAt(seat)?.name ?? '?'));
  const tableName = (tableSeat: number) => (game.dealSeats[mine] === tableSeat ? t('you') : (view.players.find((p) => p.id === game.seats[tableSeat])?.name ?? '?'));
  /** The others in the order play goes from you (this deal's direction). */
  const others = $derived(Array.from({ length: n - 1 }, (_, i) => (home + (deal?.dir ?? 1) * (1 + i) + n * 4) % n));
  const myTurn = $derived(Boolean(deal && mine >= 0 && game.phase === 'deal' && deal.phase === 'play' && deal.turn === mine));
  const rules = $derived(deal?.rules ?? view.rules.maumau);

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

  // "Mau!", said before the second-to-last card: it goes with that card's move.
  let mau = $state(false);
  $effect(() => {
    if (!deal || deal.hand?.length !== 2) mau = false;
  });
  const mauDue = $derived(Boolean(rules.mau && myTurn && deal?.hand?.length === 2));

  // An Unter asks which suit to wish before it's played.
  let wishing: string | null = $state(null);
  $effect(() => {
    if (!myTurn) wishing = null;
  });
  const wishes = (card: string) => Boolean(rules.jack) && parse(card)?.r === 'J' && (deal?.hand?.length ?? 0) > 1;

  function play(card: string, wish?: Suit) {
    const m: Record<string, unknown> = { type: 'play', card };
    if (wish) m.wish = wish;
    if (mau) m.mau = true;
    return move(m);
  }

  let pileEl: HTMLDivElement | undefined = $state();
  function target(card: string) {
    if (!pileEl) return null;
    const r = pileEl.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, rot: Number(twist(card, deal?.piled ?? 0)), width: r.width };
  }

  function refused() {
    if (!myTurn) return say(t('notYourTurn'));
    if (deal?.penalty) return say(t('mauPenaltyHint', { n: deal.penalty }));
    if (deal?.drawn) return say(t('mauDrawnHint'));
    say(deal?.wish ? t('mauWishHint', { suit: suitName(deal.wish) }) : t('mauFitHint'));
  }

  let inspecting: string | null = $state(null);
  function inspect(card: string) {
    askTilt();
    inspecting = card;
  }

  let sheetOpen = $state(false);
  let settingsOpen = $state(false);

  // What just happened at the table, said once: skipped, reversed, a forgotten "Mau!", a reshuffle.
  let lastEvent = 0;
  $effect(() => {
    const events = game.events;
    const fresh = events.filter((e) => e.n > lastEvent);
    if (!fresh.length) return;
    const first = lastEvent === 0;
    lastEvent = events[events.length - 1].n;
    if (first) return;
    for (const e of fresh) {
      const me = typeof e.seat === 'number' && game.seats[e.seat] === view.me;
      if (e.type === 'skip' && typeof e.seat === 'number') say(me ? t('mauSkippedYou') : t('mauSkipped', { name: tableName(e.seat) }), 2200);
      else if (e.type === 'reverse') say(t('mauReversed'), 2000);
      else if (e.type === 'forgot' && typeof e.seat === 'number') say(me ? t('mauForgotYou') : t('mauForgot', { name: tableName(e.seat) }), 2600);
      else if (e.type === 'reshuffle') say(t('mauReshuffle'), 2000);
      else if (e.type === 'draw' && e.penalty && typeof e.seat === 'number') say(me ? t('mauDrewPenaltyYou', { n: Number(e.count) }) : t('mauDrewPenalty', { name: tableName(e.seat), n: Number(e.count) }), 2200);
    }
  });

  const status = $derived.by(() => {
    if (!deal || game.phase !== 'deal' || deal.phase !== 'play') return '';
    if (myTurn) {
      if (deal.drawn) return t('mauDrawnYou');
      if (deal.penalty) return t('mauPenaltyYou', { n: deal.penalty });
      if (deal.again) return t('mauAgainYou');
      return deal.playable.length ? t('mauYou') : t('mauDrawYou');
    }
    return t('mauOther', { name: nameAt(deal.turn) });
  });

  const top = $derived(deal?.pile.at(-1) ?? null);
  const dealNo = $derived(dealNumber(game));
  const sub = $derived.by(() => {
    if (!deal) return '';
    if (deal.penalty) return t('mauPenaltyTop', { n: deal.penalty });
    if (deal.wish) return t('mauWishTop', { suit: suitName(deal.wish) });
    return '';
  });
  const signSvg = (s: Suit) => `<svg viewBox="-1.15 -1.15 2.3 2.3" aria-hidden="true">${sign(s, 0, 0, 1, INKS.umber[s], TINT[s])}</svg>`;
</script>

<div class="table">
  <TableTop {game} title={t('game_maumau')} {sub} {dealNo} onsheet={() => (sheetOpen = true)} onsettings={() => (settingsOpen = true)} />

  <div class="felt cloth">
    <div class="seats" style:--count={others.length}>
      {#each others as seat, i (seat)}
        <div class="far" style:--lift="{Math.round((1 - Math.sin(((i + 1) / (others.length + 1)) * Math.PI)) * 14)}px">
          <SeatChip
            {room}
            player={playerAt(seat)}
            compact
            line={deal ? cardsText(deal.counts[seat]) : ''}
            tags={[...(deal?.said[seat] ? [{ text: 'Mau!', tone: 'gold' as const }] : []), ...(deal?.skipped === seat ? [{ text: t('mauSkipTag') }] : [])]}
            total={game.match.totals[game.dealSeats[seat]] ?? 0}
            dealer={deal?.dealer === seat}
            active={game.phase === 'deal' && deal?.turn === seat && deal?.phase === 'play'}
            gone={game.gone[game.dealSeats[seat]]}
            endsAt={game.endsAt}
          />
          <span class="held" aria-hidden="true">
            {#each { length: Math.min(deal?.counts[seat] ?? 0, 9) } as _, k (k)}<i style:--k={k - (Math.min(deal?.counts[seat] ?? 0, 9) - 1) / 2}></i>{/each}
          </span>
        </div>
      {/each}
    </div>

    <div class="middle">
      <button
        class="stock"
        type="button"
        disabled={!myTurn || Boolean(deal?.drawn)}
        onclick={(e) => void move({ type: 'draw' }, e).catch(() => {})}
        aria-label={t('mauDrawBtn', { n: deal?.stock ?? 0 })}
      >
        {#each { length: Math.min(4, Math.max(1, Math.ceil((deal?.stock ?? 0) / 6))) } as _, k (k)}
          <span class="back" style:translate="{k * -1.5}px {k * -1.5}px"><Card back /></span>
        {/each}
        <span class="count">{deal?.stock ?? 0}</span>
      </button>
      <div class="pile" bind:this={pileEl}>
        {#each deal?.pile ?? [] as card, i (`${(deal?.piled ?? 0) - (deal?.pile.length ?? 0) + i}`)}
          <span class="laid" style:rotate="{twist(card, (deal?.piled ?? 0) - (deal?.pile.length ?? 0) + i)}deg" style:z-index={i}><Card id={card} /></span>
        {/each}
        {#if deal?.wish}<span class="wish" aria-label={t('mauWishTop', { suit: suitName(deal.wish) })}>{@html signSvg(deal.wish)}</span>{/if}
        {#if deal?.penalty}<span class="penalty">+{deal.penalty}</span>{/if}
      </div>
    </div>
    <p class="dir" aria-hidden="true">{deal?.dir === -1 ? '↺' : '↻'}</p>
  </div>

  <div class="dock">
    {#if error}
      <p class="toast" role="alert">{error}</p>
    {:else if status}
      <p class="status" class:mine={myTurn} aria-live="polite">{status}</p>
    {/if}

    {#if wishing}
      <div class="panel sheet">
        <span class="label">{t('mauWishAsk')}</span>
        <div class="suits">
          {#each SUITS as s (s)}
            <button class="btn suitbtn" type="button" onclick={() => { const card = wishing!; wishing = null; void play(card, s).catch(() => {}); }}>
              <span class="mark">{@html signSvg(s)}</span>{suitName(s)}
            </button>
          {/each}
        </div>
        <button class="btn quiet small" type="button" onclick={() => (wishing = null)}>{t('back')}</button>
      </div>
    {/if}

    <div class="actions">
      {#if myTurn && deal?.drawn}
        <button class="btn paper small" type="button" onclick={(e) => void move({ type: 'pass' }, e).catch(() => {})}>{t('mauKeep')}</button>
      {:else if myTurn && deal}
        <button class="btn paper small" type="button" onclick={(e) => void move({ type: 'draw' }, e).catch(() => {})}>{deal.penalty ? t('mauDrawN', { n: deal.penalty }) : t('mauDraw')}</button>
      {/if}
      {#if mauDue}
        <button class="btn mau" class:on={mau} type="button" aria-pressed={mau} onclick={() => (mau = !mau)}>Mau!</button>
      {/if}
    </div>

    <div class="mine">
      {#if mine >= 0}
        <SeatChip {room} player={playerAt(mine)} me line={deal ? cardsText(deal.hand?.length ?? 0) : ''} tags={deal?.said[mine] ? [{ text: 'Mau!', tone: 'gold' }] : []} total={game.match.totals[game.dealSeats[mine]] ?? 0} dealer={deal?.dealer === mine} active={myTurn} endsAt={game.endsAt} />
      {/if}
    </div>

    {#if mine >= 0 && deal?.hand}
      <Hand
        cards={deal.hand}
        legal={deal.playable}
        canPlay={myTurn}
        onplay={(card) => play(card)}
        {target}
        oninspect={inspect}
        onrefuse={refused}
        intercept={(card) => (wishes(card) ? ((wishing = card), true) : false)}
        marked={deal.drawn}
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
    position: relative;
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
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: clamp(18px, 8vw, 48px);
  }
  .stock,
  .pile {
    position: relative;
    width: clamp(72px, 24vw, 108px);
    aspect-ratio: 5 / 7;
  }
  .stock {
    padding: 0;
    border: 0;
    background: none;
    -webkit-tap-highlight-color: transparent;
  }
  .stock:disabled {
    cursor: default;
  }
  .stock:not(:disabled) .back:last-of-type :global(.face) {
    box-shadow: 0 0 0 2px var(--gold-hi), 0 0 18px 2px rgb(243 220 148 / 0.5);
  }
  .back,
  .laid {
    position: absolute;
    inset: 0;
  }
  .laid {
    animation: lay 0.3s cubic-bezier(0.2, 0.9, 0.3, 1.2) backwards;
  }
  .laid:not(:last-of-type) {
    filter: brightness(0.9);
  }
  @keyframes lay {
    from {
      scale: 1.15;
      opacity: 0;
    }
  }
  .count {
    position: absolute;
    right: -8px;
    bottom: -8px;
    min-width: 26px;
    padding: 3px 6px;
    border-radius: 999px;
    background: var(--paper);
    color: var(--ink);
    font: 700 13px/1 var(--display);
    text-align: center;
    box-shadow: 0 4px 8px -4px rgb(0 0 0 / 0.7);
  }
  .wish,
  .penalty {
    position: absolute;
    z-index: 20;
    top: -12px;
    right: -12px;
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--paper);
    box-shadow: 0 0 0 2px var(--gold), 0 6px 12px -6px rgb(0 0 0 / 0.8);
  }
  .wish :global(svg) {
    width: 24px;
    height: 24px;
  }
  .penalty {
    color: var(--bad);
    font: 800 16px/1 var(--display);
  }
  .dir {
    position: absolute;
    left: 14px;
    bottom: 34px;
    margin: 0;
    font-size: 22px;
    color: var(--on-cloth-2);
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
    animation: rise 0.28s cubic-bezier(0.2, 0.9, 0.3, 1.1) both;
  }
  @keyframes rise {
    from {
      translate: 0 14px;
      opacity: 0;
    }
  }
  .suits {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .suitbtn {
    justify-content: flex-start;
    gap: 10px;
  }
  .suitbtn .mark :global(svg) {
    display: block;
    width: 20px;
    height: 20px;
  }
  .actions {
    display: flex;
    justify-content: center;
    gap: 8px;
    min-height: 36px;
  }
  .mau {
    min-height: 36px;
    border-color: var(--gold);
    background: transparent;
    color: var(--gold-hi);
    font: 800 16px/1 var(--display);
  }
  .mau.on {
    background: linear-gradient(var(--gold-hi), var(--gold));
    color: var(--ink);
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
