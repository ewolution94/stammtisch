// The rooms: tables with a code, seats, the host, the lobby's settings, and the game being played.
// No I/O: the HTTP layer (server/api.mjs) calls these functions and streams each player their own
// view; tests drive it with a fake clock. Adapted from Stichle's server/game.mjs (rooms, seats, the
// clock per move, bots, the host's seat moving on), for several games: each game's rules are a pure
// module (server/games/), played deal after deal by the match (server/core/match.mjs).
//
// A room lives in memory only. A restart (a deploy) ends every game, and an empty room is forgotten
// after half an hour.
//
// Phases: lobby → play (game.phase: deal → scored → the next deal …) → final.
//
// Hands never leak: every stream is built for its page (view below), from the game module's own
// view for that seat (a seat that sits this deal out, and anyone watching, see what a watcher sees).

import { randomBytes, randomInt as cryptoInt } from 'node:crypto';
import { RuleError } from './core/cards.mjs';
import { activeSeats, createMatch, endDeal, isOver, nextDeal } from './core/match.mjs';
import { cleanAvatar, randomAvatar } from './avatar.mjs';
import { GAMES, GAME_IDS, tableRange } from './games/index.mjs';

export class GameError extends Error {
  /** @param {string} code  @param {number} [status]  @param {Record<string, unknown>} [detail] */
  constructor(code, status = 400, detail = undefined) {
    super(code);
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

/** Room codes have no vowels, so no code spells a word. */
const CODE_LETTERS = 'BCDFGHJKLMNPQRSTVWXZ';
export const CODE = /^[BCDFGHJKLMNPQRSTVWXZ]{4}$/;

/** A clock per move: off, relaxed (60 s) or quick (25 s). When it runs out, the bot moves for you. */
export const CLOCKS = Object.freeze(['off', 'relaxed', 'quick']);
export const MOVE_SECONDS = Object.freeze({ relaxed: 60, quick: 25 });
/** How many times the deal goes round the table. */
export const ROUNDS = Object.freeze([1, 2, 3, 4, 6]);

/** Every game's house rules at their defaults (the user's picks, 2026-10-13). */
const defaultRules = () => Object.fromEntries(GAME_IDS.map((id) => [id, { ...GAMES[id].module.RULES }]));

export const DEFAULT_SETTINGS = Object.freeze({ game: 'doppelkopf', clock: 'off', rounds: 1 });

export const LIMITS = {
  rooms: 200,
  players: 20,
  /** At the table: the most any game seats (Mau-Mau, Doppelkopf's six with two sitting out). */
  seats: 6,
  name: 16,
  roomsPer10Min: 40,
};

/**
 * How long a finished trick stays in the middle before the next card may come: it rests, the winner
 * shows, the cards gather, then it sweeps off (src/lib/table.ts → trickPhase; Stichle's, after the
 * user's first game on the phone: "it feels very rushed").
 */
export const TRICK_PAUSE = 2600;
/** Bots lead the next trick only once the last one has swept off the table. */
const AFTER_SWEEP = 600;
/** A finished Mau-Mau deal: the last card's moment before the result. */
const DONE_PAUSE = 1100;
/** The deal's result waits this long for everyone's "next", then the next deal comes anyway. */
export const DEAL_WAIT = 30_000;
/** A deal that wasn't played (everyone passed, thrown in): a short word, then the next. */
const VOID_WAIT = 3500;
/** A seated player who's gone (closed the page) for this long on their move: the bot moves for them. */
export const AWAY_MS = 12_000;

const HOST_GRACE = 15_000;
const LOBBY_GRACE = 60_000;
const EMPTY_TTL = 30 * 60_000;
/** A game with no human online for this long ends, so bots never play on for no one. */
const UNWATCHED_MS = 2 * 60_000;
const IDLE_TTL = 4 * 60 * 60_000;
/** Bots think for a moment: between these many milliseconds. */
const BOT_THINK = [800, 1700];
/** How many of the table's last events each view carries (who played, drew, said "Mau!" …). */
const EVENTS_KEPT = 16;

const BOT_NAMES = ['Robo Rita', 'Bot Bernd', 'Karo Klaus', 'Trumpf Tina', 'Kreuz Kurt', 'Dulle Doris'];

/**
 * @typedef {{ now(): number, setTimeout(fn: () => void, ms: number): any, clearTimeout(handle: any): void }} Clock
 * @typedef {{ player: string | null, send(event: string, data: string): void }} Subscriber
 */

const realClock = { now: Date.now, setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h) };

/**
 * @param {{ clock?: Clock, randomInt?: (n: number) => number }} [options]
 *   randomInt deals the cards and picks the first dealer (tests pass a seeded one)
 */
export function createRooms({ clock = realClock, randomInt = (n) => cryptoInt(n) } = {}) {
  /** @type {Map<string, any>} */
  const rooms = new Map();
  const created = [];
  const random = () => randomInt(1_000_000) / 1_000_000;

  // ---- helpers ------------------------------------------------------------------------------

  function room(code) {
    const r = rooms.get(String(code ?? '').toUpperCase());
    if (!r) throw new GameError('no-room', 404);
    return r;
  }

  // A page's retry is the same request: "New table" and a join carry a key the page keeps for
  // every try of the same tap, so a retry after the page gave up returns the seat the first try made
  // (development/plans/waiting-states.md). Kept for a minute.
  /** @type {Map<string, { seat: { code: string, player: string, token: string }, at: number }>} */
  const keyed = new Map();
  const KEY = /^[A-Za-z0-9-]{8,64}$/;
  const KEY_TTL = 60_000;

  function keyedSeat(key, code = null) {
    if (typeof key !== 'string' || !KEY.test(key)) return null;
    const t = clock.now();
    for (const [k, v] of keyed) if (t - v.at > KEY_TTL) keyed.delete(k);
    const hit = keyed.get(key);
    if (!hit || (code && hit.seat.code !== code)) return null;
    const p = rooms.get(hit.seat.code)?.players.get(hit.seat.player);
    return p && !p.left ? { ...hit.seat } : null;
  }

  function remember(key, seat) {
    if (typeof key === 'string' && KEY.test(key)) keyed.set(key, { seat, at: clock.now() });
    return seat;
  }

  function within(stamps, windowMs, limit) {
    const t = clock.now();
    while (stamps.length && stamps[0] <= t - windowMs) stamps.shift();
    if (stamps.length >= limit) return false;
    stamps.push(t);
    return true;
  }

  function newCode() {
    for (let i = 0; i < 100; i++) {
      let code = '';
      for (let j = 0; j < 4; j++) code += CODE_LETTERS[cryptoInt(CODE_LETTERS.length)];
      if (!rooms.has(code)) return code;
    }
    throw new GameError('busy', 503);
  }

  function player(r, token) {
    if (typeof token !== 'string' || !token) throw new GameError('no-player', 401);
    for (const p of r.players.values()) if (p.token === token && !p.left && !p.bot) return p;
    throw new GameError('no-player', 401);
  }

  function requireHost(r, p) {
    if (r.host !== p.id) throw new GameError('not-host', 403);
  }

  function requirePhase(r, ...phases) {
    if (!phases.includes(r.phase)) throw new GameError('wrong-phase', 409);
  }

  /** Players who are still in the room, in the order they joined. */
  const present = (r) => [...r.players.values()].filter((p) => !p.left);
  const isOnline = (p) => p.bot || p.online > 0;
  /** The players at the table, in seat order (the lobby's order; fixed once a game starts). */
  const seated = (r) => r.order.map((id) => r.players.get(id)).filter((p) => p && !p.left);

  function addPlayer(r, rawName, rawAvatar, bot = false) {
    if (present(r).length >= LIMITS.players) throw new GameError('room-full', 409);
    const base = cleanName(rawName);
    if (!base) throw new GameError('name');
    const taken = new Set(present(r).map((p) => p.name.toLowerCase()));
    let name = base;
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base} ${n}`;
    const p = {
      id: randomBytes(6).toString('base64url'),
      token: bot ? '' : randomBytes(18).toString('base64url'),
      name,
      avatar: cleanAvatar(rawAvatar, random),
      bot,
      joined: clock.now(),
      online: 0,
      offlineSince: clock.now(),
      left: false,
    };
    r.players.set(p.id, p);
    // A free chair in the lobby is yours; past six, or once the cards are out, you watch.
    if (r.phase === 'lobby' && seated(r).length < LIMITS.seats) r.order.push(p.id);
    return p;
  }

  function touch(r) {
    r.touched = clock.now();
    r.version++;
    broadcast(r);
  }

  function later(r, ms, fn) {
    const handle = clock.setTimeout(() => {
      r.timers.delete(handle);
      if (rooms.get(r.code) === r) fn();
    }, ms);
    r.timers.add(handle);
    return handle;
  }

  function clearTimers(r) {
    for (const handle of r.timers) clock.clearTimeout(handle);
    r.timers.clear();
  }

  /** A refusal from the rules, as the game's own error. */
  function rule(fn) {
    try {
      return fn();
    } catch (error) {
      if (error instanceof RuleError) throw new GameError(error.code, 409);
      throw error;
    }
  }

  // ---- the game -----------------------------------------------------------------------------

  function startGame(r) {
    const players = seated(r);
    const id = r.settings.game;
    const range = tableRange(id);
    if (players.length < range.min) throw new GameError('too-few', 409, { min: range.min });
    if (players.length > range.max) throw new GameError('too-many', 409, { max: range.max });
    const def = GAMES[id];
    const match = rule(() => createMatch(def.module, { table: players.length, rules: r.rules[id], rounds: r.settings.rounds, dealer: randomInt(players.length) }));
    r.game = {
      n: ++r.games,
      id,
      seats: players.map((p) => p.id),
      match,
      state: null,
      /** The table seats playing this deal, in the game's seat order (dealer's left first). */
      dealSeats: [],
      phase: 'deal',
      lastTrick: null,
      holdUntil: 0,
      ready: [],
      readyBy: 0,
      endsAt: null,
      /** The table's last events (public: a draw says how many, never which). */
      events: [],
      seq: 0,
      /** The last deal's record, for its result screen. */
      last: null,
      /** A move counter: a timer set for one move does nothing once the game has moved on. */
      move: 0,
      startedAt: clock.now(),
      endedAt: null,
      ended: null,
      stoppedBy: null,
    };
    r.phase = 'play';
    r.notice = null;
    deal(r);
  }

  function deal(r) {
    const g = r.game;
    const def = GAMES[g.id];
    g.state = nextDeal(def.module, g.match, randomInt);
    g.dealSeats = [...g.match.seats];
    g.phase = 'deal';
    g.lastTrick = null;
    g.holdUntil = 0;
    g.ready = [];
    note(g, [{ type: 'deal', dealer: g.match.dealer }]);
    moved(r);
  }

  /** Keeps the table's last events, each with its number, its seats as table seats. */
  function note(g, events) {
    for (const e of events) {
      const out = { ...e, n: ++g.seq };
      if (typeof e.seat === 'number' && g.dealSeats.length) out.seat = g.dealSeats[e.seat];
      g.events.push(out);
    }
    if (g.events.length > EVENTS_KEPT) g.events.splice(0, g.events.length - EVENTS_KEPT);
  }

  /** Whose move the deal waits for, as the game's seats. */
  const waiting = (s) => (s && s.phase !== 'done' ? [s.turn] : []);

  /** After every move: the clock for the next one, and the bots. */
  function moved(r) {
    const g = r.game;
    g.move++;
    g.endsAt = null;
    const s = g.state;
    if (g.phase === 'deal' && s && s.phase !== 'done') {
      const seconds = MOVE_SECONDS[r.settings.clock];
      if (seconds) {
        const move = g.move;
        g.endsAt = clock.now() + seconds * 1000 + Math.max(0, g.holdUntil - clock.now());
        later(r, g.endsAt - clock.now() + 300, () => g.move === move && r.phase === 'play' && autoMove(r));
      }
    }
    touch(r);
    botsPlay(r);
  }

  /** The bot's move for the seat in turn (the bot's own, or for someone whose clock ran out). */
  function autoMove(r, only = null) {
    const g = r.game;
    const s = g.state;
    if (g.phase !== 'deal' || !s || s.phase === 'done') return;
    const seat = s.turn;
    if (only !== null && seat !== only) return;
    const wait = g.holdUntil - clock.now();
    if (wait > 0) {
      const move = g.move;
      later(r, wait + 50, () => g.move === move && autoMove(r, only));
      return;
    }
    const def = GAMES[g.id];
    playMove(r, seat, def.bot(s, seat));
  }

  /** A move in the deal, by the game's seat `seat` (the server checks the rules). */
  function playMove(r, seat, move) {
    const g = r.game;
    const def = GAMES[g.id];
    const s = g.state;
    if (!move || typeof move !== 'object' || typeof move.type !== 'string') throw new GameError('move');
    if (move.type === 'play' && clock.now() < g.holdUntil) throw new GameError('wait', 409);
    const before = s.tricks?.length ?? 0;
    const events = rule(() => def.module.act(s, seat, move, { randomInt }));
    note(g, events);
    if (s.tricks && s.tricks.length > before) {
      const t = s.tricks[s.tricks.length - 1];
      g.lastTrick = { cards: t.cards.map((p) => ({ ...p })), winner: t.winner, n: s.tricks.length };
      g.holdUntil = clock.now() + TRICK_PAUSE;
    }
    if (s.phase === 'done') {
      const n = g.match.history.length;
      const pause = s.result?.void ? 600 : def.tricks ? TRICK_PAUSE + AFTER_SWEEP : DONE_PAUSE;
      later(r, pause, () => r.phase === 'play' && g.phase === 'deal' && g.match.history.length === n && settle(r));
    }
    moved(r);
  }

  /** The deal is over: its points go on the list, and its result shows until everyone is ready. */
  function settle(r) {
    const g = r.game;
    const def = GAMES[g.id];
    const record = endDeal(def.module, g.match);
    g.last = { ...record, players: record.seats.map((t) => g.seats[t]) };
    g.state = null;
    g.phase = 'scored';
    g.ready = [];
    const wait = record.result?.void ? VOID_WAIT : DEAL_WAIT;
    g.readyBy = clock.now() + wait;
    const n = g.match.history.length;
    later(r, wait, () => r.phase === 'play' && g.phase === 'scored' && g.match.history.length === n && onward(r));
    moved(r);
    if (!record.result?.void) readyCheck(r);
  }

  /** Everyone at the table who's here has tapped "next" (bots and the absent count as ready). */
  function readyCheck(r) {
    const g = r.game;
    if (g.phase !== 'scored') return;
    const waitingFor = g.seats.map((id) => r.players.get(id)).filter((p) => p && !p.left && !p.bot && p.online > 0 && !g.ready.includes(p.id));
    if (!waitingFor.length) onward(r);
  }

  function onward(r) {
    const g = r.game;
    if (isOver(GAMES[g.id].module, g.match)) return finish(r, 'done');
    deal(r);
  }

  function finish(r, reason) {
    const g = r.game;
    clearTimers(r);
    g.ended = reason;
    g.endedAt = clock.now();
    g.endsAt = null;
    g.phase = 'final';
    r.phase = 'final';
    r.unwatchedSince = null;
    touch(r);
  }

  // ---- bots and the absent ------------------------------------------------------------------

  const think = () => BOT_THINK[0] + randomInt(BOT_THINK[1] - BOT_THINK[0]);

  /** If it's a bot's move, or the move of someone who's gone: it happens in a moment. */
  function botsPlay(r) {
    const g = r.game;
    if (r.phase !== 'play' || !g) return;
    if (g.phase === 'scored') return readyCheck(r);
    const s = g.state;
    if (!s || s.phase === 'done') return;
    const move = g.move;
    const still = () => r.phase === 'play' && g.move === move;
    for (const seat of waiting(s)) {
      const p = r.players.get(g.seats[g.dealSeats[seat]]);
      if (!p || p.bot) {
        const wait = Math.max(think(), g.holdUntil - clock.now() + AFTER_SWEEP);
        later(r, wait, () => still() && autoMove(r, seat));
      } else if (p.left || p.online === 0) {
        const gone = p.left ? 0 : AWAY_MS - Math.min(AWAY_MS, clock.now() - (p.offlineSince ?? clock.now()));
        later(r, Math.max(gone, think(), g.holdUntil - clock.now() + AFTER_SWEEP), () => still() && (p.left || p.online === 0) && autoMove(r, seat));
      }
    }
  }

  // ---- what each page gets ------------------------------------------------------------------

  /** @param {any} r  @param {any | null} viewer  the player whose page this is; null for a watcher */
  function view(r, viewer) {
    const me = viewer && !viewer.left ? viewer : null;
    return {
      code: r.code,
      phase: r.phase,
      version: r.version,
      host: r.host,
      me: me?.id ?? null,
      settings: { ...r.settings },
      rules: r.rules,
      notice: r.notice,
      order: seated(r).map((p) => p.id),
      players: present(r).map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, online: isOnline(p), bot: p.bot })),
      game: r.game ? gameView(r, r.game, me) : null,
      now: clock.now(),
    };
  }

  function gameView(r, g, me) {
    const def = GAMES[g.id];
    const m = g.match;
    const tableSeat = me ? g.seats.indexOf(me.id) : -1;
    const seat = tableSeat >= 0 ? g.dealSeats.indexOf(tableSeat) : -1;
    const s = g.state;
    return {
      n: g.n,
      id: g.id,
      /** Player ids round the table. */
      seats: g.seats,
      gone: g.seats.map((id) => Boolean(r.players.get(id)?.left)),
      /** The table seats playing this deal, in the game's seat order; your game seat, or -1. */
      dealSeats: g.dealSeats,
      seat,
      phase: g.phase,
      /** The deal as your seat may see it (the game module's own view). */
      deal: s ? def.module.view(s, seat >= 0 ? seat : null) : null,
      waiting: g.phase === 'deal' ? waiting(s) : [],
      lastTrick: g.lastTrick,
      holdUntil: g.holdUntil,
      events: g.events,
      match: {
        rounds: m.rounds,
        deals: m.rounds * m.table,
        counted: m.counted,
        dealer: m.dealer,
        totals: m.totals,
        factor: def.module.match?.multiplier?.(m) ?? 1,
        owes: m.extra.owes ?? null,
        history: m.history.map((h) => ({ n: h.n, dealer: h.dealer, seats: h.seats, points: h.points, factor: h.factor, counts: h.counts, summary: summarize(g.id, h) })),
      },
      last: g.last ? { ...g.last, summary: summarize(g.id, g.last) } : null,
      ready: g.ready,
      readyBy: g.phase === 'scored' ? g.readyBy : null,
      endsAt: g.endsAt,
      startedAt: g.startedAt,
      endedAt: g.endedAt,
      ended: g.ended,
      stoppedBy: g.stoppedBy,
    };
  }

  function broadcast(r) {
    for (const s of r.subscribers) {
      const p = s.player ? r.players.get(s.player) : null;
      s.send('view', JSON.stringify(view(r, p)));
    }
  }

  // ---- host and housekeeping ----------------------------------------------------------------

  function handOver(r) {
    const host = r.players.get(r.host);
    if (host && !host.left && host.online > 0) return;
    const next = present(r).find((p) => !p.bot && p.online > 0);
    if (next && next.id !== r.host) {
      r.host = next.id;
      touch(r);
    }
  }

  function removePlayer(r, p) {
    if (r.phase === 'lobby') {
      r.players.delete(p.id);
      r.order = r.order.filter((id) => id !== p.id);
    } else p.left = true;
    p.online = 0;
    const people = present(r).filter((q) => !q.bot);
    if (!people.length) {
      clearTimers(r);
      rooms.delete(r.code);
      for (const s of r.subscribers) s.send('view', JSON.stringify({ code: r.code, phase: 'gone' }));
      return;
    }
    if (r.host === p.id) r.host = (people.find((q) => q.online > 0) ?? people[0]).id;
    touch(r);
    // A seat whose player left is played by the bot from now on.
    botsPlay(r);
  }

  /** At the table or watching; a full table refuses one more. */
  function setSeated(r, p, wanted) {
    const at = r.order.includes(p.id);
    if (wanted && !at) {
      if (seated(r).length >= LIMITS.seats) throw new GameError('table-full', 409);
      r.order.push(p.id);
    } else if (!wanted && at) {
      r.order = r.order.filter((id) => id !== p.id);
    }
  }

  return {
    get size() {
      return rooms.size;
    },

    /** @param {{ name: unknown, avatar?: unknown, key?: unknown, game?: unknown }} body */
    create({ name, avatar, key, game }) {
      const again = keyedSeat(key);
      if (again) return again;
      if (!cleanName(name)) throw new GameError('name');
      if (rooms.size >= LIMITS.rooms || !within(created, 10 * 60_000, LIMITS.roomsPer10Min)) throw new GameError('busy', 429);
      const code = newCode();
      const r = {
        code,
        created: clock.now(),
        touched: clock.now(),
        /** Since when no human has been online during a game (null while someone is). */
        unwatchedSince: null,
        version: 0,
        host: '',
        players: new Map(),
        /** The table's seats, in order around it. */
        order: [],
        settings: { ...DEFAULT_SETTINGS, ...(GAME_IDS.includes(/** @type {string} */ (game)) ? { game } : {}) },
        /** Each game's house rules, kept per game so switching games loses nothing. */
        rules: defaultRules(),
        phase: 'lobby',
        game: null,
        games: 0,
        notice: null,
        timers: new Set(),
        subscribers: new Set(),
      };
      rooms.set(code, r);
      const p = addPlayer(r, name, avatar);
      r.host = p.id;
      return remember(key, { code, player: p.id, token: p.token });
    },

    /** A quick look before joining: does the room exist, and is it open? */
    info(code) {
      const r = rooms.get(String(code ?? '').toUpperCase());
      if (!r) return null;
      return { code: r.code, phase: r.phase, game: r.settings.game, players: present(r).length, full: present(r).length >= LIMITS.players };
    },

    /**
     * Joins, or comes back: a known token gets the same seat again. A token alone that no longer
     * fits (kicked, or dropped from the lobby) is refused. `key`: a retried join gets the same seat.
     * @param {{ name?: unknown, avatar?: unknown, token?: unknown, key?: unknown }} body
     */
    join(code, { name, avatar, token, key }) {
      const r = room(code);
      const again = keyedSeat(key, r.code);
      if (again) return again;
      if (typeof token === 'string' && token) {
        for (const p of r.players.values()) {
          if (p.token === token && !p.left && !p.bot) return { code: r.code, player: p.id, token: p.token };
        }
        if (!cleanName(name)) throw new GameError('no-player', 401);
      }
      const p = addPlayer(r, name, avatar);
      touch(r);
      return remember(key, { code: r.code, player: p.id, token: p.token });
    },

    view(code, playerId = null) {
      const r = room(code);
      return view(r, playerId ? (r.players.get(playerId) ?? null) : null);
    },

    /**
     * Streams the room to one page: its view now and after every change ('view'). Returns the
     * unsubscribe function.
     * @param {(event: string, data: string) => void} send
     */
    subscribe(code, playerId, send) {
      const r = room(code);
      const p = r.players.get(String(playerId ?? ''));
      const me = p && !p.left && !p.bot ? p : null;
      /** @type {Subscriber} */
      const sub = { player: me?.id ?? null, send };
      r.subscribers.add(sub);
      if (me) {
        me.online++;
        me.offlineSince = null;
      }
      send('view', JSON.stringify(view(r, me)));
      if (me && me.online === 1) touch(r);
      return () => {
        if (!r.subscribers.delete(sub)) return;
        if (me && !me.left) {
          me.online = Math.max(0, me.online - 1);
          if (me.online === 0) {
            me.offlineSince = clock.now();
            touch(r);
            botsPlay(r);
          }
        }
      };
    },

    /**
     * A player's action. Throws GameError for anything not allowed right now.
     * @param {string} code  @param {unknown} token  @param {string} action  @param {any} body
     */
    act(code, token, action, body = {}) {
      const r = room(code);
      const p = player(r, token);
      r.touched = clock.now();
      const g = r.game;

      switch (action) {
        case 'settings': {
          requireHost(r, p);
          requirePhase(r, 'lobby', 'final');
          const next = mergeSettings(r.settings, r.rules, body);
          r.settings = next.settings;
          r.rules = next.rules;
          touch(r);
          return;
        }
        case 'sit': {
          requirePhase(r, 'lobby', 'final');
          setSeated(r, p, body?.seated !== false);
          touch(r);
          return;
        }
        case 'move': {
          // In a game: a move in the deal (the game's own, checked by its rules). In the lobby:
          // the host seats anyone, or sends them to watch.
          if (r.phase === 'play') {
            if (g.phase !== 'deal' || !g.state) throw new GameError('wrong-phase', 409);
            const tableSeat = g.seats.indexOf(p.id);
            const seat = tableSeat >= 0 ? g.dealSeats.indexOf(tableSeat) : -1;
            if (seat < 0) throw new GameError('not-playing', 409);
            playMove(r, seat, body?.move);
            return;
          }
          requireHost(r, p);
          requirePhase(r, 'lobby', 'final');
          const target = r.players.get(String(body?.player ?? ''));
          if (!target || target.left) throw new GameError('no-player', 404);
          setSeated(r, target, body?.seated !== false);
          touch(r);
          return;
        }
        case 'shuffle': {
          requireHost(r, p);
          requirePhase(r, 'lobby', 'final');
          const order = [...r.order];
          for (let i = order.length - 1; i > 0; i--) {
            const j = randomInt(i + 1);
            [order[i], order[j]] = [order[j], order[i]];
          }
          r.order = order;
          touch(r);
          return;
        }
        case 'start': {
          requireHost(r, p);
          requirePhase(r, 'lobby');
          startGame(r);
          return;
        }
        case 'next': {
          requirePhase(r, 'play');
          if (g.phase !== 'scored') throw new GameError('wrong-phase', 409);
          if (!g.ready.includes(p.id)) g.ready.push(p.id);
          touch(r);
          readyCheck(r);
          return;
        }
        case 'stop': {
          requireHost(r, p);
          requirePhase(r, 'play');
          g.stoppedBy = p.id;
          finish(r, 'stopped');
          return;
        }
        case 'rematch': {
          // Again: the same table straight into a new game, or back to the lobby to change it.
          requireHost(r, p);
          requirePhase(r, 'final');
          clearTimers(r);
          for (const q of [...r.players.values()]) {
            if (!q.left) continue;
            r.players.delete(q.id);
            r.order = r.order.filter((id) => id !== q.id);
          }
          r.game = null;
          r.notice = null;
          r.phase = 'lobby';
          if (body?.lobby) {
            touch(r);
            return;
          }
          try {
            startGame(r);
          } catch (error) {
            touch(r);
            throw error;
          }
          return;
        }
        case 'bot': {
          requireHost(r, p);
          requirePhase(r, 'lobby', 'final');
          const bots = present(r).filter((q) => q.bot);
          if (body?.add) {
            if (seated(r).length >= LIMITS.seats) throw new GameError('table-full', 409);
            const used = new Set(bots.map((b) => b.name));
            const name = BOT_NAMES.find((n) => !used.has(n)) ?? BOT_NAMES[0];
            const bot = addPlayer(r, name, randomAvatar(random), true);
            if (!r.order.includes(bot.id)) r.order.push(bot.id);
            touch(r);
          } else {
            const target = body?.player ? r.players.get(String(body.player)) : bots.at(-1);
            if (target?.bot) {
              r.players.delete(target.id);
              r.order = r.order.filter((id) => id !== target.id);
              touch(r);
            }
          }
          return;
        }
        case 'avatar': {
          p.avatar = cleanAvatar(body?.avatar, random);
          touch(r);
          return;
        }
        case 'kick': {
          requireHost(r, p);
          const target = r.players.get(String(body?.player ?? ''));
          if (!target || target.left || target.id === p.id) throw new GameError('no-player', 404);
          removePlayer(r, target);
          return;
        }
        case 'leave': {
          removePlayer(r, p);
          return;
        }
        default:
          throw new GameError('unknown-action', 404);
      }
    },

    /**
     * Housekeeping, every few seconds: hand the host's seat on, drop people who closed the page in
     * the lobby, end a game nobody is watching, forget empty rooms, and catch a lost clock.
     */
    tick() {
      const now = clock.now();
      for (const r of rooms.values()) {
        const online = present(r).filter((p) => !p.bot && p.online > 0);
        if ((!online.length && now - r.touched > EMPTY_TTL) || now - r.touched > IDLE_TTL) {
          clearTimers(r);
          for (const s of r.subscribers) s.send('view', JSON.stringify({ code: r.code, phase: 'gone' }));
          rooms.delete(r.code);
          continue;
        }
        if (r.phase === 'play') {
          if (online.length) r.unwatchedSince = null;
          else {
            r.unwatchedSince ??= now;
            if (now - r.unwatchedSince >= UNWATCHED_MS) {
              r.unwatchedSince = null;
              finish(r, 'left');
              continue;
            }
          }
          const g = r.game;
          if (g.endsAt && now >= g.endsAt + 2000) autoMove(r);
        }
        const host = r.players.get(r.host);
        if (host && host.online === 0 && host.offlineSince !== null && now - host.offlineSince >= HOST_GRACE) handOver(r);
        if (r.phase === 'lobby') {
          for (const p of present(r)) {
            if (!p.bot && p.id !== r.host && p.online === 0 && p.offlineSince !== null && now - p.offlineSince >= LOBBY_GRACE) removePlayer(r, p);
          }
        }
      }
    },

    /** Stops every timer (shutdown, tests). */
    close() {
      for (const r of rooms.values()) {
        clearTimers(r);
        r.subscribers.clear();
      }
      rooms.clear();
    },
  };
}

/**
 * A finished deal in a line, for the score sheet: who won what (game seats mapped to table seats
 * by the page through `seats`).
 */
export function summarize(id, record) {
  const r = record.result ?? {};
  if (r.void) return { kind: 'void', why: r.void };
  if (id === 'maumau') {
    const winner = record.points.findIndex((p, s) => record.seats.includes(s) && p === Math.max(...record.seats.map((t) => record.points[t])));
    return { kind: 'maumau', winner };
  }
  if (id === 'doppelkopf') {
    return {
      kind: 'doppelkopf',
      contract: r.contract?.kind ?? null,
      solo: r.contract?.solo ?? null,
      soloist: r.contract?.soloist != null ? record.seats[r.contract.soloist] : null,
      winner: r.winner,
      value: r.value,
      augen: r.augen,
      re: r.parties ? r.parties.flatMap((p, i) => (p === 're' ? [record.seats[i]] : [])) : [],
    };
  }
  if (id === 'skat') {
    if (r.ramsch) return { kind: 'ramsch', loser: r.points.findIndex((p) => p < 0) >= 0 ? record.seats[r.points.findIndex((p) => p < 0)] : null };
    return { kind: 'skat', declarer: record.seats[r.declarer], game: r.contract?.game ?? null, hand: r.contract?.hand ?? false, won: r.won, value: r.value, augen: r.augen ?? null, overbid: r.overbid };
  }
  if (id === 'durak') return { kind: 'durak', loser: r.loser != null ? record.seats[r.loser] : null };
  return { kind: id };
}

/**
 * A display name: printable, single-spaced, at most LIMITS.name characters (graphemes, so an emoji
 * counts as one). Empty when nothing usable is left.
 */
export function cleanName(raw) {
  return cleanText(raw, LIMITS.name);
}

/** Printable, single-spaced text of at most `max` graphemes. */
export function cleanText(raw, max) {
  if (typeof raw !== 'string') return '';
  const text = raw
    .slice(0, max * 8)
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Co}\p{Cn}]|(?!‍)\p{Cf}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  const graphemes = [...new Intl.Segmenter('de', { granularity: 'grapheme' }).segment(text)].map((s) => s.segment);
  return graphemes.slice(0, max).join('').trim();
}

/**
 * The settings and house rules with a host's changes applied; anything invalid is ignored.
 * body: { game?, clock?, rounds?, rules?: { [game]: { …a rule: value } } }
 */
export function mergeSettings(settings, rules, body) {
  const next = { ...settings };
  if (GAME_IDS.includes(body?.game)) next.game = body.game;
  if (CLOCKS.includes(body?.clock)) next.clock = body.clock;
  if (ROUNDS.includes(body?.rounds)) next.rounds = body.rounds;
  const out = { ...rules };
  if (body?.rules && typeof body.rules === 'object') {
    for (const id of GAME_IDS) {
      const patch = body.rules[id];
      if (!patch || typeof patch !== 'object') continue;
      try {
        out[id] = { ...GAMES[id].module.cleanRules({ ...rules[id], ...patch }) };
      } catch {
        // an invalid value: the rules stay as they were
      }
    }
  }
  return { settings: next, rules: out };
}
