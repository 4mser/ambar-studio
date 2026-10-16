// ÁMBAR in mascot/ambar.js: expression blending, voice, ids and the
// pure helpers that drive the mascot from time (blinks, moods, gaze, paths, trails, envelopes).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

await import('../mascot/ambar.js')
const kit = globalThis.AmbarKit
const { ambar, blinks, blinkAt, moods, gazeAt, smoothPath, arrive, trail, envelopeAt } = kit

const ids = (svg) => [...svg.matchAll(/id="([^"]+)"/g)].map((m) => m[1])
const meanRadius = (points, cx, cy) => points.reduce((s, [x, y]) => s + Math.hypot(x - cx, y - cy), 0) / points.length

test('blending any two expressions never jumps: < 1 px per 0.5% weight step at R = 100', () => {
  const names = Object.keys(kit.SHAPES)
  for (const t of [0, 1.3, 4.7]) {
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        let prev = null
        let worst = 0
        for (let s = 0; s <= 200; s++) {
          const w = s / 200
          const P = ambar.outline({ x: 0, y: 0, R: 100, t, weights: { [names[i]]: 1 - w, [names[j]]: w } })
          if (prev) for (let k = 0; k < P.length; k++) worst = Math.max(worst, Math.hypot(P[k][0] - prev[k][0], P[k][1] - prev[k][1]))
          prev = P
        }
        assert.ok(worst < 1, `${names[i]} → ${names[j]} at t=${t} jumps ${worst.toFixed(2)} px`)
      }
    }
  }
})

test('talking moves the rim but keeps the size: mean radius within 2%', () => {
  for (const expression of Object.keys(kit.SHAPES)) {
    for (const t of [0.2, 1.1, 2.9, 6.4]) {
      const cy = Math.sin(t * 1.6) * 3
      const quiet = meanRadius(ambar.outline({ x: 0, y: 0, R: 100, t, expression }), 0, cy)
      for (const talk of [0.4, 0.8, 1.2]) {
        const loud = meanRadius(ambar.outline({ x: 0, y: 0, R: 100, t, expression, talk }), 0, cy)
        assert.ok(Math.abs(loud / quiet - 1) < 0.02, `${expression} t=${t} talk=${talk}: ${((loud / quiet - 1) * 100).toFixed(2)}%`)
      }
    }
  }
})

test('ÁMBAR output is stable: same options, same string, ids included', () => {
  const o = { x: 330, y: 300, R: 150, t: 4.9, expr: 'feliz', pesos: { feliz: 0.7, normal: 0.3 }, mira: [0.3, -0.2], parpadeo: 0.2, chispas: 0.6 }
  assert.equal(ambar(o), ambar({ ...o }))
  assert.equal(globalThis.mascotaAmbar, ambar)
  // golden digests: a change here changes how ÁMBAR looks in every existing video
  const digest = (s) => createHash('sha1').update(s).digest('hex').slice(0, 12)
  assert.equal(digest(ambar(o)), 'd844edb792c0')
  assert.equal(digest(ambar({ x: 960, y: 540, R: 120, t: 0, expr: 'sorprendida' })), 'd13c72308a43')
  assert.equal(digest(ambar({ x: 200, y: 200, R: 80, t: 2, expression: 'sad', talk: 0.7 })), 'f883e9625a24')
})

test('ids carry the prefix and name their content', () => {
  const o = { x: 100, y: 100, R: 60, t: 1 }
  const svg = ambar(o)
  for (const id of ids(svg)) assert.ok(id.startsWith(ambar.prefix + '_'), id)
  assert.notEqual(ids(ambar({ ...o, t: 2 }))[0], ids(svg)[0], 'different frames, different ids')
})

test('English and Spanish options draw the same mascot', () => {
  const es = ambar({ x: 50, y: 60, R: 40, t: 3, expr: 'pensativa', mira: [0.5, 0], parpadeo: 0.3, habla: 0.5, chispas: 0.4, estira: 0.2, vel: [300, 0], op: 0.8 })
  const en = ambar({ x: 50, y: 60, R: 40, t: 3, expression: 'thinking', gaze: [0.5, 0], blink: 0.3, talk: 0.5, sparkle: 0.4, stretch: 0.2, velocity: [300, 0], opacity: 0.8 })
  assert.equal(es, en)
})

test('sadness tints toward blue by at most 0.18, and keeps a tear', () => {
  const sad = ambar({ x: 0, y: 0, R: 100, t: 0.6, expression: 'triste', sad: 1 })
  const fill = sad.match(/<stop offset=".72" stop-color="(#[0-9a-f]{6})"/)[1]
  const [r, , b] = [1, 3, 5].map((i) => parseInt(fill.slice(i, i + 2), 16))
  assert.ok(r > b, `the body stays amber (${fill})`)
  assert.match(sad, /fill="#CFE3FF"/)
  assert.throws(() => ambar({ x: 0, y: 0, R: 10, expression: 'grumpy' }), /unknown expression/)
})

test('a head turn slides the eyes around a sphere and hides the far one', () => {
  const eyes = (svg) => (svg.match(/<g color="#fff" fill="#fff">([\s\S]*?)<\/g><\/g>|<g color="#fff" fill="#fff">([\s\S]*)$/) ?? [''])[0]
  const count = (svg) => (eyes(svg).match(/<rect /g) ?? []).length
  assert.equal(count(ambar({ x: 0, y: 0, R: 100, t: 0, turn: [0, 0] })), 2)
  assert.equal(count(ambar({ x: 0, y: 0, R: 100, t: 0, turn: [1.3, 0] })), 1)
  assert.equal(count(ambar({ x: 0, y: 0, R: 100, t: 0, turn: [Math.PI, 0] })), 0)
})

test('figure() is a small standalone svg without halo', () => {
  const svg = ambar.figure({ t: 1 })
  assert.match(svg, /^<svg class="figure"[^>]*width="84.0"/)
  assert.doesNotMatch(svg, /data-glow/)
})

test('blinks: deterministic, irregular, 2.1–3.7 s apart, sometimes double', () => {
  const a = blinks(3, 120)
  assert.deepEqual(a, blinks(3, 120))
  assert.notDeepEqual(a, blinks(4, 120))
  let doubles = 0
  let last = null
  const gaps = new Set()
  for (let i = 0; i < a.length; i++) {
    if (last !== null && Math.abs(a[i] - last - 0.22) < 1e-9) { doubles++; continue }
    if (last !== null) {
      const primary = a[i - 1] - last < 0.3 && i > 1 && Math.abs(a[i - 1] - a[i - 2] - 0.22) < 1e-9 ? a[i - 2] : a[i - 1]
      const gap = a[i] - primary
      assert.ok(gap >= 2.1 - 1e-9 && gap <= 3.7 + 1e-9, `gap ${gap}`)
      gaps.add(gap.toFixed(2))
    }
    last = a[i]
  }
  assert.ok(doubles > 0, 'some blinks are double')
  assert.ok(gaps.size > 5, 'the rhythm is irregular')
  assert.equal(blinkAt(a[0] - 0.01, a), 0)
  assert.ok(Math.abs(blinkAt(a[0] + 0.065, a) - 1) < 1e-9)
  assert.equal(blinkAt(a[0] + 0.14, a), 0)
})

test('moods: weights add up to 1, cross-fade in 0.55 s and never jump, even when interrupted', () => {
  const keys = [[0, 'normal'], [2, 'happy'], [2.3, 'thinking'], [5, 'sad']]
  let prev = null
  for (let t = -1; t < 8; t += 1 / 300) {
    const w = moods(t, keys)
    const sum = Object.values(w).reduce((a, b) => a + b, 0)
    assert.ok(Math.abs(sum - 1) < 1e-9, `sum ${sum} at ${t}`)
    if (prev) for (const k of new Set([...Object.keys(w), ...Object.keys(prev)])) assert.ok(Math.abs((w[k] ?? 0) - (prev[k] ?? 0)) < 0.02, `${k} jumps at ${t}`)
    prev = w
  }
  assert.deepEqual(moods(1, keys), { normal: 1 })
  assert.deepEqual(moods(5.6, keys), { triste: 1 })
  assert.equal(kit.dominant(moods(2.29, keys)), 'feliz')
})

test('gaze is exaggerated ×2.4 by default and eased along straight lines', () => {
  const keys = [[0, 0, 0], [1, 1, -0.5]]
  assert.deepEqual(gazeAt(-1, keys), [0, 0])
  assert.deepEqual(gazeAt(2, keys), [2.4, -1.2])
  assert.deepEqual(gazeAt(2, keys, { exaggerate: 1 }), [1, -0.5])
  const [x, y] = gazeAt(0.5, keys)
  assert.ok(Math.abs(y / x + 0.5) < 1e-9, 'stays on the line')
})

test('smoothPath keeps still and straight paths, arrive lands, trails fade', () => {
  const still = smoothPath(() => [5, 7], 3)
  assert.ok(Math.abs(still[0] - 5) < 1e-9 && Math.abs(still[1] - 7) < 1e-9)
  const p = smoothPath((u) => ({ x: 10 * u, y: 1 }), 2)
  assert.ok(Math.abs(p.x - 20) < 1e-9 && Math.abs(p.y - 1) < 1e-9)
  const end = arrive(10, [0, 0], [400, 100], 1, 1.2)
  assert.ok(Math.abs(end.x - 400) < 1e-9 && Math.abs(end.y - 100) < 1e-9)
  assert.deepEqual(end.velocity.map((v) => Math.abs(v) < 1e-6), [true, true])
  assert.ok(arrive(1.6, [0, 0], [400, 0], 1, 1.2).velocity[0] > 100)
  const path = (u) => [u * 300, 0]
  const dots = trail(path, 2, { from: 1 })
  const n = (dots.match(/<circle /g) ?? []).length
  assert.ok(n >= 8 && n <= 10, `${n} dots`)
  assert.equal(trail(path, 2, { from: 1, to: 1.05 }), '')
  assert.equal(trail(path, 2, { from: 1 }), trail(path, 2, { from: 1 }))
})

test('envelopeAt reads a line of a voice envelope and is 0 outside it', () => {
  const env = { fps: 30, lines: { hi: [0, 0.2, 0.8, 1, 0.9, 0.4, 0.1, 0] } }
  assert.equal(envelopeAt(0.5, env, 'hi', 1), 0)
  assert.equal(envelopeAt(5, env, 'hi', 1), 0)
  assert.equal(envelopeAt(1.1, env, 'nope', 1), 0)
  const v = envelopeAt(1 + 3 / 30, env, 'hi', 1)
  assert.ok(v > 0.4 && v <= 1.2, `${v}`)
})
