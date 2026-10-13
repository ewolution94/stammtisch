// What the page says about each game's state: suit and card names in the German deck's words, the
// Doppelkopf contracts and announcements, the Skat games and bids. German first, English beside it.

import type { DokoContract, DokoParty, Game, SkatContract } from './api';
import { WORDS, type Suit } from './deck';
import { i18n, t } from './i18n.svelte';

export const suitName = (s: Suit) => WORDS[i18n.lang].suit[s];

/** The Skat bids: every value a game can be worth, from 18 (server/games/skat.mjs → BIDS). */
export const BIDS: number[] = (() => {
  const set = new Set<number>([23, 35, 46, 59]);
  for (const [base, top] of [[9, 18], [10, 18], [11, 18], [12, 18], [24, 11]]) for (let m = 2; m <= top; m++) set.add(base * m);
  return [...set].filter((v) => v >= 18).sort((a, b) => a - b);
})();

/** A Doppelkopf solo's name: Obersolo, Eichelsolo …, Fleischlos. */
export function soloName(solo: string | null | undefined) {
  if (!solo) return '';
  if (solo === 'Q') return t('solo_Q');
  if (solo === 'J') return t('solo_J');
  if (solo === 'A') return t('solo_A');
  return t('solo_suit', { suit: suitName(solo as Suit) });
}

/** A Doppelkopf contract as the table knows it. */
export function contractName(c: DokoContract | null) {
  if (!c) return '';
  if (c.kind === 'solo') return c.duty ? `${soloName(c.solo)} · ${t('duty')}` : soloName(c.solo);
  if (c.kind === 'wedding') return c.alone ? t('wedding_alone') : t('wedding');
  if (c.kind === 'silent') return t('silent');
  if (c.kind === 'poverty') return t('poverty');
  return t('normal');
}

/** Re or Kontra, and keine 90 / 60 / 30 / schwarz. */
export function callName(party: DokoParty, level: number) {
  if (level <= 0) return party === 're' ? 'Re' : 'Kontra';
  return t(`call_${level}` as 'call_1');
}

/** A Skat game's name: Eichel, Grand, Null Ouvert Hand … */
export function skatGame(c: Pick<SkatContract, 'game' | 'hand' | 'schneider' | 'schwarz' | 'ouvert'> | null) {
  if (!c) return '';
  const base = c.game === 'grand' ? 'Grand' : c.game === 'null' ? 'Null' : c.game === 'ramsch' ? 'Ramsch' : suitName(c.game as Suit);
  const parts = [base];
  if (c.ouvert) parts.push('Ouvert');
  if (c.hand && c.game !== 'ramsch') parts.push('Hand');
  if (c.schwarz && !c.ouvert) parts.push(t('skat_schwarzAnn'));
  else if (c.schneider && !c.ouvert) parts.push(t('skat_schneiderAnn'));
  return parts.join(' ');
}

/** "3 Stiche", "1 Stich". */
export const tricksText = (n: number) => (n === 1 ? t('trickOne') : t('tricksN', { n }));
/** "5 Karten", "1 Karte". */
export const cardsText = (n: number) => (n === 1 ? t('cardOne') : t('cardsN', { n }));

/** The deal the bar names: the one in play, or, while its result is up, the one just scored. */
export function dealNumber(game: Game) {
  const { counted, deals, history } = game.match;
  const scored = game.phase !== 'deal' && history[history.length - 1]?.counts;
  return Math.min(scored ? counted : counted + 1, deals);
}
