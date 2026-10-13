// The hand's card keys (src/lib/table.ts): Doppelkopf has every card twice, and a card that stays in
// the hand must keep its key when its twin is played, or the hand thinks the card still in the air.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { idOfKey, keyed, rekey } from '../src/lib/table.ts';

const keys = (list) => list.map((c) => c.key);

test('the twin that stays keeps its own key when the other one is played', () => {
  const held = keyed(['c-Q', 'h-K', 'h-K', 'd-A']);
  assert.deepEqual(keys(held), ['c-Q', 'h-K', 'h-K~1', 'd-A']);
  // The first König is in the air: the server's hand has one König left, and it's the second one.
  assert.deepEqual(keys(rekey(['c-Q', 'h-K', 'd-A'], held, 'h-K')), ['c-Q', 'h-K~1', 'd-A']);
  assert.deepEqual(keys(rekey(['c-Q', 'h-K', 'd-A'], held, 'h-K~1')), ['c-Q', 'h-K', 'd-A']);
});

test('nothing in the air, or the play refused: every key stays where it was', () => {
  const held = keyed(['c-Q', 'h-K', 'h-K']);
  assert.deepEqual(keys(rekey(['c-Q', 'h-K', 'h-K'], held)), keys(held));
  // The server said no: both Könige are still held, so the one in the air keeps its key too.
  assert.deepEqual(keys(rekey(['c-Q', 'h-K', 'h-K'], held, 'h-K')), keys(held));
});

test('a card that arrives never takes a key that was held a moment ago', () => {
  let held = keyed(['h-K', 'h-K']);
  held = rekey(['h-K'], held, 'h-K');
  assert.deepEqual(keys(held), ['h-K~1']);
  // A König comes back while the played one is still in the air: a new key, not the flying one's.
  const back = rekey(['h-K', 'h-K'], held, 'h-K');
  assert.deepEqual(keys(back), ['h-K~1', 'h-K~2']);
  // Once it has landed, its key is free again.
  assert.deepEqual(keys(rekey(['h-K', 'h-K'], held)), ['h-K~1', 'h-K']);
});

test('keys stay unique and stand for their card through a whole hand', () => {
  let held = keyed(['c-10', 'c-10', 'c-Q', 'c-Q', 's-J', 'h-A', 'h-A', 'd-9']);
  const order = ['c-Q', 'c-10', 'h-A', 'c-10', 'd-9', 'c-Q', 'h-A', 's-J'];
  for (const id of order) {
    const flying = held.find((c) => c.id === id).key;
    const cards = held.map((c) => c.id);
    cards.splice(cards.indexOf(id), 1);
    held = rekey(cards, held, flying);
    assert.ok(!keys(held).includes(flying), `${flying} is gone`);
    assert.equal(new Set(keys(held)).size, held.length);
    for (const c of held) assert.equal(idOfKey(c.key), c.id);
  }
  assert.equal(held.length, 0);
});
