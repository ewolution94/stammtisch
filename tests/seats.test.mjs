// Round the table (src/lib/table.ts → seatSpot, seatSpots; Stichle's, the user's pick B, 2026-10-15):
// each other player's place card on the rail where they sit, the far rail shared left to right.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { angleOf, seatSpot, seatSpots } from '../src/lib/table.ts';

test('each seat on the rail it faces: the far rail for three, the corners and across for four, the side rails from five', () => {
  const spots = (n) => Array.from({ length: n - 1 }, (_, i) => seatSpot(angleOf(i + 1, 0, n)));
  assert.deepEqual(spots(2).map((p) => [p.x, p.y, p.side]), [[0, -1, false]], 'two: straight across');
  assert.deepEqual(spots(3).map((p) => [p.side, p.y]), [[false, -1], [false, -1]]);
  assert.ok(spots(3)[0].x < -0.5 && spots(3)[1].x > 0.5);
  assert.deepEqual(spots(4).map((p) => [p.x, p.y]), [[-1, -1], [0, -1], [1, -1]]);
  assert.deepEqual(spots(5).map((p) => p.side), [true, false, false, true]);
  assert.deepEqual(spots(6).map((p) => p.side), [true, false, false, false, true]);
});

test('the far rail is shared left to right in whatever order play goes round; the side cards stay on the cloth', () => {
  const w = 340, h = 480;
  const forward = seatSpots([1, 2, 3, 4, 5], 0, 6, w, h);
  const backward = seatSpots([5, 4, 3, 2, 1], 0, 6, w, h);
  const at = (list) => Object.fromEntries(list.map((s) => [s.seat, [s.x, s.y]]));
  assert.deepEqual(at(backward), at(forward), 'the same places, whichever way round');
  const far = forward.filter((s) => !s.side).sort((a, b) => a.x - b.x);
  assert.deepEqual(far.map((s) => s.seat), [2, 3, 4], 'left to right as they sit');
  assert.ok(far.every((s) => s.narrow), 'three across a phone: narrow cards');
  // At most 12 px past the cloth (and half a pixel of rounding): the cloth sits 16 px inside the screen.
  for (const s of forward) assert.ok(s.x - s.w / 2 >= -12.5 && s.x + s.w / 2 <= w + 12.5, `seat ${s.seat} stays on the screen`);
  const sides = forward.filter((s) => s.side);
  assert.ok(sides.every((s) => s.y >= Math.floor(h * 0.28) && s.y <= Math.ceil(h * 0.7)), 'clear of the corner cards');
});

// The desktop table (Stichle's spread): the flat hand and the table's size.
const { deskScale, FLAT, flatLayout } = await import('../src/lib/table.ts');

test('the flat hand: whole cards side by side while they fit, then an even overlap; one box height', () => {
  const few = flatLayout(['a', 'b', 'c'], 1000);
  assert.equal(few.cw, FLAT.max);
  assert.equal(few.places.get('b').x - few.places.get('a').x, FLAT.max + FLAT.gap);
  const many = flatLayout(Array.from({ length: 20 }, (_, i) => `c${i}`), 1000);
  assert.equal(many.cw, FLAT.min);
  assert.ok(many.places.get('c1').x - many.places.get('c0').x < FLAT.min);
  assert.equal(few.height, many.height);
  const raised = flatLayout(['a', 'b'], 1000, { raise: new Set(['b']) });
  assert.equal(raised.places.get('a').y - raised.places.get('b').y, FLAT.raise);
  const big = flatLayout(['a', 'b', 'c'], 2000, { scale: 1.5 });
  assert.equal(big.cw, FLAT.max * 1.5);
  assert.equal(big.height, Math.round((FLAT.top + FLAT.max * 1.4 + FLAT.bottom) * 1.5));
});

test("the desktop table's size: a laptop as it is, a big window bigger, never past the window", () => {
  assert.equal(deskScale(1440, 820), 1);
  assert.equal(deskScale(3440, 1320), 1.47);
  assert.equal(deskScale(1500, 1400), 1);
  assert.equal(deskScale(5120, 2700), 1.6);
  assert.equal(deskScale(3440, 1320, '1.25'), 1.25);
  assert.equal(deskScale(1440, 820, '1.5'), 1.11);
});
