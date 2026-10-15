// The ranks against each other (Stichle's tools/ladder.mjs): whole deals of one game with every rank
// at one table (and a random player, for scale), the seats turning each deal so every rank sits
// everywhere; what each rank scored on average, and how long the master thinks. Doppelkopf is played
// in pairs instead (two of one rank against two of the next, the partners changing with the deal):
// with four ranks at one table, whose partner a deal gave you outweighs how well you play.
//
//   node tools/ladder.mjs doppelkopf [deals]     doppelkopf | skat | durak | maumau, 200 deals by default
//   STAMMTISCH_MASTER_MS=60 node tools/ladder.mjs skat 400     a quicker master, for a quicker ladder
//
// A deal's points are the game's own (Doppelkopf's points, Skat's score, Durak −1 for the Durak,
// Mau-Mau a point for going out). No rule in the ranks reads another hand; this only plays them.
import { GAMES } from '../server/games/index.mjs';

const game = process.argv[2] ?? 'doppelkopf';
const DEALS = Number(process.argv[3] ?? 200);
const def = GAMES[game];
if (!def) throw new Error(`no game ${game}`);
const M = def.module;

/** The table: every rank this game has, and a random player. */
const RANKS = { doppelkopf: ['random', 'apprentice', 'journeyman', 'master'], skat: ['apprentice', 'journeyman', 'master'], durak: ['apprentice', 'journeyman', 'master'], maumau: ['random', 'apprentice', 'journeyman'] }[game];
/** The house rules played: the usual table's. */
const RULES = { doppelkopf: {}, skat: { kontra: true }, durak: {}, maumau: {} }[game];

let seed = 20261015;
const randomInt = (n) => {
  seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
  return seed % n;
};
/** A random legal move (no announcement, no Kontra: those only raise the stakes). */
function randomMove(s, seat) {
  const all = M.moves(s, seat).filter((m) => m.type !== 'announce' && m.type !== 'kontra' && m.type !== 're');
  const reserve = all.find((m) => m.type === 'reserve' && m.kind === 'healthy');
  return reserve ?? all[randomInt(all.length)];
}

const times = [];
const started = Date.now();
/** The tables: every rank together, or (Doppelkopf) each rank with the next, two and two. */
const TABLES = game === 'doppelkopf' ? RANKS.slice(1).map((r, i) => [RANKS[i], r, RANKS[i], r]) : [RANKS];
console.log(`${game}, ${DEALS} deals a table:`);
for (const table of TABLES) {
  const ranks = [...new Set(table)];
  const sum = Object.fromEntries(ranks.map((r) => [r, 0]));
  const n = table.length;
  for (let d = 0; d < DEALS; d++) {
    // Seat i plays table[(i + d) mod n]: every rank sits at every seat in turn.
    const lv = table.map((_, i) => table[(i + d) % n]);
    const s = game === 'doppelkopf' || game === 'skat' ? M.deal({ dealer: d % n, rules: RULES, randomInt }) : M.deal({ players: n, dealer: d % n, rules: RULES, randomInt });
    for (let steps = 0; s.phase !== 'done'; steps++) {
      if (steps > 3000) throw new Error(`deal ${d} doesn't end`);
      const seat = s.turn;
      const t0 = performance.now();
      const move = lv[seat] === 'random' ? randomMove(s, seat) : def.bot(s, seat, { level: lv[seat], temper: 'steady' });
      if (lv[seat] === 'master') times.push(performance.now() - t0);
      M.act(s, seat, move, { randomInt });
    }
    const points = s.result?.points ?? [];
    points.forEach((p, seat) => (sum[lv[seat]] += p));
  }
  // Each rank's average a deal and a seat.
  const seats = (r) => table.filter((x) => x === r).length;
  console.log(`  ${ranks.map((r) => `${r} ${(sum[r] / DEALS / seats(r)).toFixed(2)}`).join('   ')}`);
}
times.sort((a, b) => a - b);
const at = (q) => (times.length ? times[Math.min(times.length - 1, Math.floor(times.length * q))].toFixed(0) : '-');
console.log(`  (${((Date.now() - started) / 1000).toFixed(0)} s)`);
if (times.length) console.log(`  master: ${times.length} moves, median ${at(0.5)} ms, 90 % ${at(0.9)} ms, slowest ${at(1)} ms`);
