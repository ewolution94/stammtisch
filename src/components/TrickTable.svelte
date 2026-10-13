<!--
  The table for the trick games (Doppelkopf, Skat), filling the screen like a real one seen from your
  chair: the game and the deal along the top, the other players across the far side (in the order
  play goes: your left, the top, your right), the trick in the middle, and your seat and hand at the
  bottom. What it's your turn to decide opens just above your hand (DokoPanel, SkatPanel); playing is
  done with the cards themselves (Hand.svelte). From Stichle's Table.svelte.
-->
<script lang="ts">
  import { ApiError, type DokoDeal, type SkatDeal, type View } from '../lib/api';
  import { callName, contractName, dealNumber, skatGame, tricksText } from '../lib/games';
  import { errorText, t } from '../lib/i18n.svelte';
  import type { Room } from '../lib/room.svelte';
  import { angleOf, idOfKey, keyed, slotOffset, trickCardWidth, trickPhase, twist, TRICK_REVEAL } from '../lib/table';
  import { actAt } from '../lib/waits';
  import { askTilt } from '../lib/tilt';
  import Card from './Card.svelte';
  import DealEnd from './DealEnd.svelte';
  import DokoPanel from './DokoPanel.svelte';
  import Hand from './Hand.svelte';
  import Inspect from './Inspect.svelte';
  import ScoreSheet from './ScoreSheet.svelte';
  import SeatChip from './SeatChip.svelte';
  import Settings from './Settings.svelte';
  import SkatPanel from './SkatPanel.svelte';
  import TableTop from './TableTop.svelte';
  import Trick from './Trick.svelte';

  let { room, view, onleave }: { room: Room; view: View; onleave: (from?: Event) => Promise<void> } = $props();

  const game = $derived(view.game!);
  const deal = $derived(game.deal as DokoDeal | SkatDeal | null);
  const doko = $derived(deal?.game === 'doppelkopf' ? (deal as DokoDeal) : null);
  const skat = $derived(deal?.game === 'skat' ? (deal as SkatDeal) : null);
  const n = $derived(game.dealSeats.length || (game.id === 'skat' ? 3 : 4));
  const mine = $derived(game.seat);
  const home = $derived(mine >= 0 ? mine : 0);
  /** The player in a deal's seat. */
  const playerAt = (seat: number) => view.players.find((p) => p.id === game.seats[game.dealSeats[seat]]);
  const nameAt = (seat: number) => (seat === mine ? t('you') : (playerAt(seat)?.name ?? '?'));
  const others = $derived(Array.from({ length: n - 1 }, (_, i) => (home + 1 + i) % n));
  /** With more at the table than play: who sits this deal out. */
  const sittingOut = $derived(game.seats.map((_, t) => t).filter((t) => !game.dealSeats.includes(t)));
  const myTurn = $derived(mine >= 0 && game.phase === 'deal' && game.waiting.includes(mine));

  // A finished trick holds the table for a moment: no card until it's cleared. The page wakes when its
  // winner shows (the status names them then, not before) and when the hold is over.
  let now = $state(Date.now());
  $effect(() => {
    const wait = room.left(game.holdUntil);
    if (wait <= 0) return;
    const timers = [wait - TRICK_REVEAL, wait].filter((ms) => ms > 0).map((ms) => setTimeout(() => (now = Date.now()), ms + 30));
    return () => timers.forEach(clearTimeout);
  });
  const holding = $derived(room.left(game.holdUntil, now) > 0);
  const revealed = $derived(trickPhase(room.left(game.holdUntil, now)) !== 'rest');
  const canPlay = $derived(Boolean(deal && myTurn && deal.phase === 'play' && !holding));

  // Picking cards: the Skat's two to put back, poverty's three to give and to give back.
  const picking = $derived.by(() => {
    if (!deal || !myTurn) return 0;
    if (skat?.phase === 'discard') return 2;
    if (doko?.phase === 'poverty-give' || doko?.phase === 'poverty-return') return 3;
    return 0;
  });
  let picked: string[] = $state([]);
  $effect(() => {
    if (!picking) picked = [];
  });
  const pickedIds = $derived(picked.map(idOfKey));
  function toggle(key: string) {
    if (picked.includes(key)) picked = picked.filter((k) => k !== key);
    else if (picked.length < picking) picked = [...picked, key];
  }

  let trickEl: HTMLDivElement | undefined = $state();
  let trickW = $state(320);
  let trickH = $state(260);

  /** Where your card lands: your slot on the pile. */
  function target(card: string) {
    if (!trickEl || mine < 0) return null;
    const r = trickEl.getBoundingClientRect();
    const width = trickCardWidth(r.width, r.height);
    const { dx, dy } = slotOffset(angleOf(mine, mine, n), width);
    return { x: r.left + r.width / 2 + dx, y: r.top + r.height / 2 + dy, rot: Number(twist(card, mine)), width };
  }

  let error = $state('');
  let errorTimer = 0;
  function say(text: string) {
    error = text;
    clearTimeout(errorTimer);
    errorTimer = window.setTimeout(() => (error = ''), 2600);
  }

  async function move(m: Record<string, unknown>, from?: Event) {
    try {
      await actAt(room, 'move', { move: m }, from);
    } catch (e) {
      say(errorText(e instanceof ApiError ? e.code : 'other'));
      throw e;
    }
  }

  // A move the server took is done at once: its panel goes, even if the room's update (which moves
  // the turn on) is a moment behind the answer (learnings/projects/stichle.md → decide()).
  const moveKey = $derived(`${game.n}:${game.match.history.length}:${deal?.phase}:${deal?.turn}:${doko?.announcements.length ?? 0}:${skat?.bidding.said.length ?? 0}:${skat?.doubled ?? 0}`);
  let sent = $state('');
  async function decide(m: Record<string, unknown>, from: Event) {
    const key = moveKey;
    await move(m, from);
    sent = key;
  }
  const deciding = $derived(sent !== moveKey);
  /** Your bid, reservation, Skat or declaration is open: it floats over the table and says what's asked. */
  const panelOpen = $derived(Boolean(deal && deciding && myTurn && ((doko && doko.phase !== 'play') || (skat && skat.phase !== 'play'))));

  function refused(card: string) {
    if (!myTurn) return say(t('notYourTurn'));
    if (holding) return;
    if (deal && !deal.legal.includes(card)) say(t('mustFollow'));
  }

  let inspecting: string | null = $state(null);
  function inspect(card: string) {
    askTilt();
    inspecting = card;
  }

  let sheetOpen = $state(false);
  let settingsOpen = $state(false);

  /** The deal's contract, along the top. */
  const contract = $derived.by(() => {
    if (doko) {
      if (!doko.contract) return t('dokoReserving');
      const c = doko.contract;
      const who = c.kind === 'solo' || c.kind === 'wedding' ? ` · ${nameAt(c.soloist ?? 0)}` : c.kind === 'poverty' && doko.poverty ? ` · ${nameAt(doko.poverty.seat)}` : '';
      return contractName(c) + who;
    }
    if (skat) {
      if (skat.contract) return skat.contract.game === 'ramsch' ? 'Ramsch' : `${skatGame(skat.contract)} · ${nameAt(skat.declarer ?? 0)}`;
      if (skat.declarer !== null) return skat.declarer === mine ? t('skatDeclarerYou', { bid: skat.bid }) : t('skatDeclarer', { name: nameAt(skat.declarer), bid: skat.bid });
      return skat.bid ? t('skatBidding', { bid: skat.bid }) : t('skatBiddingStart');
    }
    return '';
  });

  /** The announcements so far, along the top. */
  const calls = $derived.by(() => {
    if (doko) {
      const parts: string[] = [];
      for (const party of ['re', 'kontra'] as const) if (doko.calls[party] >= 0) parts.push(callName(party, doko.calls[party]) + (doko.calls[party] > 0 ? ` (${party === 're' ? 'Re' : 'Kontra'})` : ''));
      return parts.join(' · ');
    }
    if (skat?.doubled) return skat.doubled === 2 ? 'Kontra · Re' : 'Kontra';
    return '';
  });

  /** A seat's line and tags. */
  function seatInfo(seat: number) {
    const tags: { text: string; tone?: 're' | 'kontra' | 'gold' | 'plain' }[] = [];
    let line = deal ? tricksText(deal.won[seat] ?? 0) : '';
    if (doko) {
      if (doko.phase === 'reserve' && doko.reserve[seat]) tags.push({ text: doko.reserve[seat] === 'healthy' ? t('dokoHealthyTag') : t('dokoReservedTag'), tone: 'plain' });
      const party = doko.parties[seat];
      const said = doko.announcements.filter((a) => a.seat === seat).map((a) => a.level);
      if (party) tags.push({ text: said.length ? callName(party, Math.max(...said)) : party === 're' ? 'Re' : 'Kontra', tone: party });
      if (doko.pigs === seat) tags.push({ text: t('pigs'), tone: 'gold' });
    }
    if (skat) {
      if (skat.phase === 'bid') {
        const said = [...skat.bidding.said].reverse().find((s) => s.seat === seat);
        if (skat.bidding.out[seat]) tags.push({ text: t('skatPassTag'), tone: 'plain' });
        else if (said) tags.push({ text: said.value === null ? t('skatHoldTag') : String(said.value), tone: 'gold' });
        line = [t('skat_pos0'), t('skat_pos1'), t('skat_pos2')][skat.positions.indexOf(seat)] ?? '';
      } else if (skat.declarer === seat && skat.contract?.game !== 'ramsch') tags.push({ text: skat.contract ? skatGame(skat.contract) : String(skat.bid), tone: 'gold' });
    }
    return { line, tags };
  }

  const status = $derived.by(() => {
    if (!deal || game.phase !== 'deal') return '';
    const turnName = nameAt(deal.turn);
    if (doko) {
      if (doko.phase === 'reserve') return myTurn ? '' : t('dokoReserveOther', { name: turnName });
      if (doko.phase === 'poverty-give') return myTurn ? '' : t('povertyGiveOther', { name: turnName });
      if (doko.phase === 'poverty-offer') return myTurn ? '' : t('povertyOfferOther', { name: turnName });
      if (doko.phase === 'poverty-return') return myTurn ? '' : t('povertyReturnOther', { name: turnName });
    }
    if (skat) {
      if (skat.phase === 'bid') return myTurn ? '' : t('skatBidOther', { name: turnName });
      if (skat.phase === 'skat') return myTurn ? '' : t('skatSkatOther', { name: turnName });
      if (skat.phase === 'discard') return myTurn ? '' : t('skatDiscardOther', { name: turnName });
      if (skat.phase === 'declare') return myTurn ? '' : t('skatDeclareOther', { name: turnName });
    }
    if (deal.phase === 'play') {
      if (holding && game.lastTrick) {
        // The table rests a moment after the last card; the winner is named once it shows.
        if (!revealed) return '';
        const w = game.lastTrick.winner;
        return w === mine ? t('trickYou') : t('trickOther', { name: nameAt(w) });
      }
      if (myTurn) return deal.trick.cards.length ? t('playYou') : t('leadYou');
      return deal.trick.cards.length ? t('playOther', { name: turnName }) : t('leadOther', { name: turnName });
    }
    return '';
  });

  const dealNo = $derived(dealNumber(game));
</script>

<div class="table">
  <TableTop {game} title={t(`game_${game.id}`)} sub={contract} extra={calls} {dealNo} onsheet={() => (sheetOpen = true)} onsettings={() => (settingsOpen = true)} />

  <div class="felt cloth">
    {#if sittingOut.length}
      <p class="out">{t('sitsOut', { names: sittingOut.map((s) => view.players.find((p) => p.id === game.seats[s])?.name ?? '?').join(', ') })}</p>
    {/if}
    <div class="seats" style:--count={others.length}>
      {#each others as seat, i (seat)}
        {@const info = seatInfo(seat)}
        <div class="far" style:--lift="{Math.round((1 - Math.sin(((i + 1) / (others.length + 1)) * Math.PI)) * 14)}px">
          <SeatChip {room} player={playerAt(seat)} compact line={info.line} tags={info.tags} total={game.match.totals[game.dealSeats[seat]] ?? 0} dealer={deal?.dealer === seat} active={game.phase === 'deal' && game.waiting.includes(seat)} gone={game.gone[game.dealSeats[seat]]} endsAt={game.endsAt} />
          <span class="held" aria-label={t('cardsLeft', { n: deal?.counts[seat] ?? 0 })}>
            {#each { length: Math.min(deal?.counts[seat] ?? 0, 8) } as _, k (k)}<i style:--k={k - (Math.min(deal?.counts[seat] ?? 0, 8) - 1) / 2}></i>{/each}
          </span>
        </div>
      {/each}
    </div>

    {#if skat?.open && skat.declarer !== null && skat.declarer !== mine}
      <div class="open" aria-label={t('skatOpen', { name: nameAt(skat.declarer) })}>
        {#each keyed(skat.open) as c (c.key)}<span class="mini"><Card id={c.id} /></span>{/each}
      </div>
    {/if}

    <div class="middle" bind:this={trickEl}>
      {#if deal}
        <Trick {room} trick={deal.trick} last={game.lastTrick} holdUntil={game.holdUntil} {mine} {n} bind:width={trickW} bind:height={trickH} />
      {/if}
    </div>
  </div>

  <div class="dock">
    {#if error}
      <p class="toast" role="alert">{error}</p>
    {:else if status && !panelOpen}
      <p class="status" class:mine={myTurn} aria-live="polite">{status}</p>
    {/if}

    {#if deal && deciding && doko}
      <DokoPanel deal={doko} {mine} {myTurn} picked={pickedIds} {decide} name={nameAt} />
    {:else if deal && deciding && skat}
      <SkatPanel deal={skat} {mine} {myTurn} picked={pickedIds} {decide} name={nameAt} />
    {/if}

    <div class="mine">
      {#if mine >= 0}
        {@const info = seatInfo(mine)}
        <SeatChip {room} player={playerAt(mine)} me line={info.line} tags={info.tags} total={game.match.totals[game.dealSeats[mine]] ?? 0} dealer={deal?.dealer === mine} active={myTurn} endsAt={game.endsAt} />
      {/if}
    </div>

    <!-- Between deals the hand is empty but keeps its box, so the table doesn't move. -->
    {#if mine >= 0}
      <Hand
        cards={deal?.hand ?? []}
        legal={deal?.legal ?? []}
        {canPlay}
        onplay={(card) => move({ type: 'play', card })}
        {target}
        oninspect={inspect}
        onrefuse={refused}
        select={picking ? { picked, ontoggle: toggle } : null}
      />
    {:else}
      <p class="watching">{mine < 0 && game.dealSeats.length ? t('sittingOut') : t('watchingGame')}</p>
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
  .out {
    margin: -6px 0 6px;
    text-align: center;
    font: 600 12px/1.3 var(--ewo-sans);
    color: var(--on-cloth-2);
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
  /* An Ouvert declarer's hand, open on the table. */
  .open {
    display: flex;
    justify-content: center;
    gap: 2px;
    margin-bottom: 4px;
  }
  .open .mini {
    width: 30px;
    margin-left: -8px;
  }
  .middle {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
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
    color: #ffc9bd;
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
