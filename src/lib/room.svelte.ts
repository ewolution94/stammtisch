// The live room: the server's view of it, pushed over Server-Sent Events, and the moves you send.
//
// EventSource gives up for good after one error page (Cloudflare's 502 during a deploy), so it
// reconnects itself, with backoff, and right away when the tab comes back or the network returns
// (learnings/node-server.md).

import { api, type Seat, type View } from './api';

const BACKOFF = [1000, 2000, 4000, 8000, 15000];


/** One stream, either a player's (with a seat) or the big screen's (code only). */
export class Room {
  /** Replaced whole on every message, so it stays raw (no deep proxy to compare against). */
  view: View | null = $state.raw(null);
  /** The stream is open. */
  live = $state(false);
  /** It has been open before: a closed stream now is a reconnect, not the first connect. */
  wasLive = $state(false);
  /** Server clock minus ours, for the countdown. */
  offset = $state(0);

  #source: EventSource | null = null;
  #attempt = 0;
  #timer = 0;
  #closed = false;
  #ready = new Set<() => void>();

  constructor(
    readonly code: string,
    readonly seat: Seat | null = null,
  ) {}

  connect() {
    this.#closed = false;
    addEventListener('online', this.#wake);
    document.addEventListener('visibilitychange', this.#wake);
    this.#open();
  }

  close() {
    this.#closed = true;
    clearTimeout(this.#timer);
    this.#source?.close();
    this.#source = null;
    this.live = false;
    removeEventListener('online', this.#wake);
    document.removeEventListener('visibilitychange', this.#wake);
  }

  /** A move; throws ApiError with the server's reason. `signal`: from track(), which may give up. */
  act(action: string, body?: unknown, signal?: AbortSignal) {
    if (!this.seat) return Promise.reject(new Error('no seat'));
    return api.act(this.seat, action, body, signal);
  }

  /** Resolves with the first view (the room is ready to show); rejects when `signal` gives up. */
  ready(signal?: AbortSignal) {
    if (this.view) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const done = () => {
        this.#ready.delete(done);
        resolve();
      };
      this.#ready.add(done);
      signal?.addEventListener(
        'abort',
        () => {
          this.#ready.delete(done);
          reject(signal.reason);
        },
        { once: true },
      );
    });
  }

  /** Milliseconds left until a server timestamp. */
  left(at: number, now = Date.now()) {
    return Math.max(0, at - (now + this.offset));
  }

  #open() {
    clearTimeout(this.#timer);
    this.#source?.close();
    const query = this.seat ? `?p=${encodeURIComponent(this.seat.player)}` : '';
    const source = new EventSource(`/api/rooms/${this.code}/events${query}`);
    this.#source = source;
    source.onopen = () => {
      this.#attempt = 0;
      this.live = true;
      this.wasLive = true;
    };
    source.addEventListener('view', (event) => {
      const view = parse<View>(event);
      if (!view) return;
      if (typeof view.now === 'number') this.offset = view.now - Date.now();
      this.view = view;
      for (const done of [...this.#ready]) done();
      if (view.phase === 'gone') this.close();
    });
    source.onerror = () => {
      source.close();
      if (this.#source !== source) return;
      this.#source = null;
      this.live = false;
      if (this.#closed) return;
      const wait = BACKOFF[Math.min(this.#attempt++, BACKOFF.length - 1)];
      this.#timer = window.setTimeout(() => this.#open(), wait);
    };
  }

  #wake = () => {
    if (this.#closed || this.live || document.visibilityState === 'hidden') return;
    this.#attempt = 0;
    this.#open();
  };
}

function parse<T>(event: Event): T | null {
  try {
    return JSON.parse((event as MessageEvent).data) as T;
  } catch {
    return null;
  }
}
