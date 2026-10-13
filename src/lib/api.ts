// The server's shapes (server/rooms.mjs → view, and each game module's view of a deal) and the calls
// that change them. Adapted from Stichle's.

import type { Avatar } from './avatar';
import type { Suit } from './deck';

export type Phase = 'lobby' | 'play' | 'final' | 'gone';
export type ClockChoice = 'off' | 'relaxed' | 'quick';
export type GameId = 'maumau' | 'doppelkopf' | 'skat' | 'durak';
/** The games, in the order the user chose them (2026-10-13). */
export const GAMES: GameId[] = ['maumau', 'doppelkopf', 'skat', 'durak'];
/** A card id, the French way whatever the deck shows: "h-10", "c-Q" (an Eichel-Ober), "d-A". */
export type CardId = string;

export interface Settings {
  game: GameId;
  clock: ClockChoice;
  rounds: number;
}

export type Rules = Record<string, boolean | string | number>;

export interface Player {
  id: string;
  name: string;
  avatar: Avatar;
  online: boolean;
  bot: boolean;
}

export interface Played {
  seat: number;
  card: CardId;
}

export interface Trick {
  lead: number;
  cards: Played[];
}

// ---- the games' own views of a deal (server/games/*.mjs → view) ---------------------------------

export interface MauDeal {
  game: 'maumau';
  rules: Rules;
  phase: 'play' | 'done';
  players: number;
  dealer: number;
  turn: number;
  dir: 1 | -1;
  pile: CardId[];
  piled: number;
  stock: number;
  counts: number[];
  wish: Suit | null;
  penalty: number;
  again: boolean;
  skipped: number | null;
  said: boolean[];
  choosing: boolean;
  hand: CardId[] | null;
  drawn: CardId | null;
  playable: CardId[];
  winner: number | null;
  points: number[] | null;
  hands: CardId[][] | null;
}

export type DokoParty = 're' | 'kontra';
export interface DokoContract {
  kind: 'normal' | 'wedding' | 'silent' | 'solo' | 'poverty';
  trump: string | null;
  soloist: number | null;
  solo: string | null;
  duty: boolean;
  alone: boolean;
}
export interface DokoResult {
  void?: 'throw' | 'poverty';
  seat?: number;
  winner: DokoParty | null;
  augen: Record<DokoParty, number>;
  tricks: Record<DokoParty, number>;
  calls: Record<DokoParty, number>;
  value: number;
  items: { key: string; party: DokoParty | null; by?: DokoParty }[];
  extras: { key: string; party: DokoParty; trick?: number }[];
  solo: boolean;
  duty: boolean;
  contract: DokoContract;
  parties: DokoParty[];
  points: number[];
}
export interface DokoDeal {
  game: 'doppelkopf';
  rules: Rules;
  phase: 'reserve' | 'poverty-give' | 'poverty-offer' | 'poverty-return' | 'play' | 'done';
  players: 4;
  dealer: number;
  first: number;
  size: number;
  turn: number;
  forced: number | null;
  reserve: ('healthy' | 'reserved' | null)[];
  contract: DokoContract | null;
  wedding: { seat: number; partner: number | null; trick: number | null } | null;
  poverty: { seat: number; trumps: number; offered: number[]; taker: number | null; back: number | null } | null;
  parties: (DokoParty | null)[];
  party: DokoParty | null;
  calls: Record<DokoParty, number>;
  announcements: { seat: number; party: DokoParty; level: number }[];
  options: number[];
  trick: Trick;
  last: (Trick & { winner: number; augen: number }) | null;
  won: number[];
  counts: number[];
  hand: CardId[] | null;
  legal: CardId[];
  declared: { kind: string; solo?: string } | null;
  /** Your reservations to choose from, when it's your turn to say one. */
  choices: { type: 'reserve'; kind: string; solo?: string }[];
  pigs: number | null;
  result: DokoResult | null;
}

export interface SkatContract {
  game: 'd' | 'h' | 's' | 'c' | 'grand' | 'null' | 'ramsch';
  hand: boolean;
  schneider: boolean;
  schwarz: boolean;
  ouvert: boolean;
}
export interface SkatResult {
  void?: 'passed';
  ramsch?: boolean;
  won: boolean;
  value: number;
  overbid: boolean;
  factor: number;
  declarer: number;
  bid: number;
  contract: SkatContract;
  augen?: number | number[];
  matadors?: { mit: boolean; n: number };
  schneider?: boolean;
  schwarz?: boolean;
  mult?: number;
  null?: number;
  tricks?: number[];
  jungfrau?: number;
  durchmarsch?: number;
  points: number[];
}
export interface SkatDeal {
  game: 'skat';
  rules: Rules;
  phase: 'bid' | 'skat' | 'discard' | 'declare' | 'play' | 'done';
  players: 3;
  dealer: number;
  positions: number[];
  turn: number;
  bidding: { stage: 1 | 2 | 3; sayer: number; listener: number | null; awaiting: 'say' | 'answer'; out: boolean[]; said: { seat: number; value: number | null }[] };
  bid: number;
  declarer: number | null;
  took: boolean;
  contract: SkatContract | null;
  doubled: 0 | 1 | 2;
  open: CardId[] | null;
  trick: Trick;
  last: (Trick & { winner: number; augen: number }) | null;
  won: number[];
  counts: number[];
  hand: CardId[] | null;
  put: CardId[] | null;
  moves: Record<string, unknown>[];
  legal: CardId[];
  skat: CardId[] | null;
  result: SkatResult | null;
}

export interface DurakPair {
  attack: CardId;
  by: number;
  defense: CardId | null;
}
export interface DurakDeal {
  game: 'durak';
  rules: Rules;
  phase: 'play' | 'done';
  players: number;
  dealer: number;
  turn: number;
  attacker: number;
  defender: number;
  trumpCard: CardId;
  trump: Suit;
  stock: number;
  discard: number;
  out: number[];
  table: DurakPair[];
  taking: boolean;
  passed: boolean[];
  limit: number;
  bout: number;
  counts: number[];
  hand: CardId[] | null;
  moves: { type: string; card?: CardId; at?: number }[];
  lastBout: { n: number; pairs: DurakPair[]; took: boolean; defender: number } | null;
  loser: number | null;
  result: { loser: number | null; out: number[]; points: number[]; hands: CardId[][] } | null;
}

export type Deal = MauDeal | DokoDeal | SkatDeal | DurakDeal;

export interface Summary {
  kind: string;
  [k: string]: unknown;
}

export interface DealRecord {
  n: number;
  dealer: number;
  /** The table seats that played, in the game's seat order. */
  seats: number[];
  /** Points by table seat. */
  points: number[];
  factor: number;
  counts: boolean;
  result: any;
  summary: Summary;
  players?: string[];
}

export interface TableEvent {
  n: number;
  type: string;
  /** A table seat. */
  seat?: number;
  [k: string]: unknown;
}

export type Ended = 'done' | 'stopped' | 'left';

export interface Game {
  n: number;
  id: GameId;
  /** Player ids round the table. */
  seats: string[];
  gone: boolean[];
  /** The table seats playing this deal, in the game's seat order (the dealer's left first). */
  dealSeats: number[];
  /** Your seat in the deal (a game seat), or -1: watching or sitting this deal out. */
  seat: number;
  /** deal: the cards are out · scored: the deal's result · final: the game is over */
  phase: 'deal' | 'scored' | 'final';
  deal: Deal | null;
  /** The game seats the deal waits for. */
  waiting: number[];
  lastTrick: { cards: Played[]; winner: number; n: number } | null;
  holdUntil: number;
  events: TableEvent[];
  match: {
    rounds: number;
    deals: number;
    counted: number;
    /** The dealer, a table seat. */
    dealer: number;
    /** Points by table seat. */
    totals: number[];
    /** A Bock round's factor for the coming deal. */
    factor: number;
    owes: boolean[] | null;
    history: DealRecord[];
  };
  last: DealRecord | null;
  ready: string[];
  readyBy: number | null;
  endsAt: number | null;
  startedAt: number;
  endedAt: number | null;
  ended: Ended | null;
  stoppedBy: string | null;
}

export interface View {
  code: string;
  phase: Phase;
  version: number;
  host: string;
  me: string | null;
  settings: Settings;
  rules: Record<GameId, Rules>;
  notice: string | null;
  /** The players at the table, in seat order. */
  order: string[];
  players: Player[];
  game: Game | null;
  now: number;
}

export interface Seat {
  code: string;
  player: string;
  token: string;
}

export interface Config {
  clocks: ClockChoice[];
  moveSeconds: Record<string, number>;
  rounds: number[];
  seats: number;
  games: Record<GameId, { table: { min: number; max: number }; players: { min: number; max: number }; rules: Rules }>;
}

/**
 * A refusal from the server ("no-room", "follow" …), a network failure ("offline"), the server or
 * Cloudflare in trouble ("busy": a 5xx without the game's own answer) or no answer in time
 * ("timeout": Folio's track() gave up). The last three are worth "Try again" (waits.ts).
 */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status = 0,
    readonly detail: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { ...init, cache: 'no-store' });
  } catch {
    // Given up on (the signal from track()), or the network: Safari says "Load failed", Chrome
    // "Failed to fetch", so classify by type (learnings/ios-and-webkit.md).
    throw new ApiError(init.signal?.aborted ? 'timeout' : 'offline');
  }
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const { error, ...detail } = body ?? {};
    throw new ApiError(error ?? (response.status >= 500 ? 'busy' : `http-${response.status}`), response.status, detail);
  }
  return body as T;
}

const post = (body: unknown, token?: string, signal?: AbortSignal): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(token ? { 'x-stammtisch-token': token } : {}) },
  body: JSON.stringify(body ?? {}),
  signal,
});

/**
 * A deploy restarts the server and ends every room; for a few seconds a create or join can fail.
 * One quiet retry, then the error (learnings/projects/vollmond.md). Safe for create and join: they
 * carry a key, so a retry gets the seat a first try may have made. Not once the page gave up.
 */
async function again<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (signal?.aborted || !(error instanceof ApiError) || (error.code !== 'offline' && error.status < 500)) throw error;
    await new Promise((r) => setTimeout(r, 1500));
    if (signal?.aborted) throw error;
    return fn();
  }
}

export const api = {
  config: () => again(() => request<Config>('/api/config')),
  create: (name: string, avatar: Avatar, key?: string, signal?: AbortSignal, game?: GameId) =>
    again(() => request<Seat>('/api/rooms', post({ name, avatar, key, game }, undefined, signal)), signal),
  info: (code: string) => request<{ code: string; phase: Phase; game: GameId; players: number; full: boolean }>(`/api/rooms/${code}`),
  join: (code: string, name: string, avatar: Avatar | null, token?: string, key?: string, signal?: AbortSignal) =>
    again(() => request<Seat>(`/api/rooms/${code}/join`, post({ name, avatar, token, key }, undefined, signal)), signal),
  act: (seat: Seat, action: string, body?: unknown, signal?: AbortSignal) => request<void>(`/api/rooms/${seat.code}/${action}`, post(body, seat.token, signal)),
};

/** Room codes: four consonants (server/rooms.mjs → CODE). */
export const CODE = /^[BCDFGHJKLMNPQRSTVWXZ]{4}$/;
