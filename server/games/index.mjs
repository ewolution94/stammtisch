// The games at the table: each one's rule module (server/games/<id>.mjs) and its bot. The rooms
// (server/rooms.mjs) play any of them the same way, through the match (server/core/match.mjs).

import * as maumau from './maumau.mjs';
import * as doppelkopf from './doppelkopf.mjs';
import * as skat from './skat.mjs';
import { botMove as maumauBot } from '../bots/maumau.mjs';
import { botMove as doppelkopfBot } from '../bots/doppelkopf.mjs';
import { botMove as skatBot } from '../bots/skat.mjs';

/**
 * @typedef {{ module: any, bot: (state: any, seat: number) => Record<string, unknown>, tricks: boolean }} GameDef
 *   tricks: the game takes tricks (a pause and a sweep after each one)
 */

/** @type {Readonly<Record<string, GameDef>>} */
export const GAMES = Object.freeze({
  maumau: { module: maumau, bot: maumauBot, tricks: false },
  doppelkopf: { module: doppelkopf, bot: doppelkopfBot, tricks: true },
  skat: { module: skat, bot: skatBot, tricks: true },
});

export const GAME_IDS = Object.freeze(Object.keys(GAMES));

/** How many may sit at the table for a game (more than play: the dealer sits out). */
export const tableRange = (id) => GAMES[id].module.TABLE ?? GAMES[id].module.PLAYERS;
