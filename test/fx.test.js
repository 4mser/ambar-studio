// Tests for the pure parts of fx.js and charts.js: particles are
// deterministic and behave at their ends, point sets have the right shape,
// and the chart geometry is correct.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dust, burst, confetti, fountain, rings, trail, morph, sample, crossfade } from '../runtime/fx.js'
import { scalePoints, pathOf, lengthOf, pointAt } from '../runtime/charts.js'

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`)

test('particles are deterministic: same index and t, same particle', () => {
  for (const t of [0, 0.4, 1.3, 7.9]) {
    for (let i = 0; i < 20; i++) {
      assert.deepEqual(dust(i, t, { seed: 2 }), dust(i, t, { seed: 2 }))
      assert.deepEqual(burst(i, t, { at: 0.2 }), burst(i, t, { at: 0.2 }))
      assert.deepEqual(confetti(i, t, { at: 0.1 }), confetti(i, t, { at: 0.1 }))
      assert.deepEqual(fountain(i, t, { from: 0 }), fountain(i, t, { from: 0 }))
    }
  }
  assert.notDeepEqual(dust(3, 1, { seed: 1 }), dust(3, 1, { seed: 2 }))
})

test('dust stays in the frame; burst and confetti are invisible before and after', () => {
  for (let i = 0; i < 50; i++) {
    const d = dust(i, i * 3.3, { w: 1080, h: 1350 })
    assert.ok(d.y >= 0 && d.y < 1350 && d.alpha >= 0 && d.alpha <= 1)
  }
  assert.equal(burst(0, 0.5, { at: 1 }).alpha, 0)
  assert.equal(burst(0, 3, { at: 1 }).alpha, 0)
  const mid = burst(0, 1.3, { at: 1, x: 100, y: 100, radius: 200 })
  assert.ok(mid.alpha > 0 && Math.hypot(mid.x - 100, mid.y - 100) <= 200)
  assert.equal(confetti(0, 0, { at: 1 }).alpha, 0)
  const c = confetti(0, 1.5, { at: 1, x: 500, y: 500 })
  assert.ok(c.alpha > 0 && c.flip >= -1 && c.flip <= 1)
  assert.equal(fountain(0, 1, { from: 2 }).alpha, 0)
})

test('rings expand and fade; trail shrinks and fades out after its end', () => {
  const r = rings(1.5, 1)
  assert.equal(r.length, 3)
  assert.ok(r[0].r > r[1].r && r[0].alpha > 0)
  assert.ok(rings(0.5, 1).every((x) => x.alpha === 0))
  const path = (t) => ({ x: t * 100, y: 0 })
  const tr = trail(path, 2, 10, 0.04)
  assert.equal(tr.length, 10)
  assert.ok(tr[0].r > tr[9].r && tr[0].alpha > tr[9].alpha)
  near(tr[1].x, 196)
  assert.ok(trail(path, 5, 10, 0.04, { end: 4 }).every((p) => p.alpha === 0))
  assert.equal(trail((t) => [t, 0], 1).length, 10)
})

test('morph starts on the first set, lands on the second and arcs on the way', () => {
  const from = sample.circle(0, 0, 100, 12)
  const to = sample.line([500, 0], [700, 0], 12)
  const start = morph(from, to, 0, 1, 1.2, 3)
  const end = morph(from, to, 5, 1, 1.2, 3)
  start.forEach((p, i) => { near(p.x, from[i][0]); near(p.y, from[i][1]) })
  end.forEach((p, i) => { near(p.x, to[i][0]); near(p.y, to[i][1]) })
  const mid = morph(from, to, 1.6, 1, 1.2, 3)
  assert.ok(new Set(mid.map((p) => p.p.toFixed(3))).size > 1, 'particles are staggered')
  assert.deepEqual(mid, morph(from, to, 1.6, 1, 1.2, 3))
  assert.equal(morph(from.slice(0, 3), to, 0, 1).length, 12)
})

test('sample point sets', () => {
  const line = sample.line([0, 0], [10, 0], 6)
  assert.deepEqual(line.map((p) => p[0]), [0, 2, 4, 6, 8, 10])
  const rect = sample.rect(0, 0, 10, 10, 8)
  assert.equal(rect.length, 8)
  assert.deepEqual(rect[2], [10, 0])
  assert.equal(sample.grid(0, 0, 100, 100, 4, 3).length, 12)
  for (const [x, y] of sample.disc(0, 0, 50, 40, 1)) assert.ok(Math.hypot(x, y) <= 50)
  assert.deepEqual(crossfade(0, 1), [1, 0])
  assert.deepEqual(crossfade(2, 1), [0, 1])
})

test('chart geometry', () => {
  const pts = scalePoints([0, 5, 10], { x: 10, y: 20, width: 100, height: 50 })
  assert.deepEqual(pts, [[10, 70], [60, 45], [110, 20]])
  assert.equal(pathOf([[0, 0], [3, 4]]), 'M0.00 0.00 L3.00 4.00')
  assert.equal(lengthOf([[0, 0], [3, 4], [3, 10]]), 11)
  assert.deepEqual(pointAt([[0, 0], [10, 0], [10, 10]], 0.75), [10, 5])
  assert.deepEqual(pointAt([[0, 0], [10, 0]], 2), [10, 0])
})
