// Who takes a trick so far, by the game's own rules: the server's pure modules, imported on the page
// (as Stichle's TrickOverview does), with only what the seat sees: Doppelkopf's contract as it's
// public, the Schweinchen once shown, the Dulle's house rule and the last trick; Skat's game.
import { ranking as dokoRanking } from '../../server/games/doppelkopf.mjs';
import { ranking as skatRanking } from '../../server/games/skat.mjs';
import { trickWinner } from '../../server/core/tricks.mjs';
import type { DokoDeal, Played, SkatDeal } from './api';

type Ranking = { cls(id: string): string; rank(id: string): number };

/** The ranking a deal is played with, as the page knows it. */
export function rankingOf(deal: DokoDeal | SkatDeal): Ranking | null {
  if (deal.game === 'doppelkopf') {
    const c = deal.contract;
    const trump = c ? c.trump : 'd';
    return dokoRanking(trump, { pigs: deal.pigs !== null, dulle: String(deal.rules.dulle ?? 'first') });
  }
  return deal.contract ? skatRanking(deal.contract.game) : null;
}

/** The index of the card taking `cards` so far, and the class led ('trump' or a suit). */
export function leading(deal: DokoDeal | SkatDeal, cards: readonly Played[]) {
  const r = rankingOf(deal);
  if (!r || !cards.length) return { best: -1, led: null as string | null };
  const done = deal.won.reduce((n: number, w: number) => n + w, 0);
  const last = deal.game === 'doppelkopf' && done + 1 === deal.size;
  return { best: trickWinner(cards, r, { last }), led: r.cls(cards[0].card) };
}
