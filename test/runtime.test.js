import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clamp, lerp, progress, ease, span, keys, count, hash, cue } from '../runtime/ambar.js'

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`)

test('progress goes 0 → 1 over its window and clamps outside', () => {
  assert.equal(progress(0, 1, 2), 0)
  assert.equal(progress(2, 1, 2), 0.5)
  assert.equal(progress(9, 1, 2), 1)
  assert.equal(progress(1, 1, 0), 1)
})

test('every easing starts at 0 and ends at 1', () => {
  for (const [name, fn] of Object.entries(ease)) {
    near(fn(0), 0, 1e-6)
    near(fn(1), 1, 1e-6)
    assert.ok(Number.isFinite(fn(0.37)), name)
  }
})

test('span eases in, holds, and eases out before b', () => {
  assert.equal(span(0, 1, 5), 0)
  assert.equal(span(3, 1, 5), 1)
  assert.equal(span(5, 1, 5), 0)
  assert.ok(span(1.2, 1, 5) > 0 && span(1.2, 1, 5) < 1)
})

test('keys interpolates between neighbours and holds at the ends', () => {
  const frames = [[0, 0, 100], [2, 10, 200]]
  assert.deepEqual(keys(-1, frames), [0, 100])
  assert.deepEqual(keys(5, frames), [10, 200])
  const [x, y] = keys(1, frames, ease.linear)
  near(x, 5)
  near(y, 150)
})

test('the same t always gives the same values (determinism)', () => {
  for (const t of [0, 0.3, 1.7, 12.25]) {
    assert.equal(count(t, 0, 2, 0, 100), count(t, 0, 2, 0, 100))
    assert.equal(hash(t), hash(t))
  }
  assert.ok(hash(1) >= 0 && hash(1) < 1)
})

test('cue falls back when there is no narration yet', () => {
  assert.deepEqual(cue('missing', 2, 1), { start: 2, duration: 1, end: 3 })
})

test('clamp and lerp', () => {
  assert.equal(clamp(2), 1)
  assert.equal(clamp(-1), 0)
  assert.equal(lerp(10, 20, 0.25), 12.5)
})
