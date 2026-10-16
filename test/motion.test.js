// Tests for the motion library: easing without overshoot, seeded randomness,
// noise, time remapping, formats, the replayable simulation, the beat grid,
// the camera, breathing, impact zooms and path smoothing.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ease, seeded, noise1, remap, FORMATS, safeArea, formatOf, formatNumber, counter, scrambleText, keys } from '../runtime/ambar.js'
import { sim, beats, acts, camera, framing, breathe, punch, handheld, reversals, smoothPath } from '../runtime/motion.js'

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`)
const range = (n, f) => Array.from({ length: n }, (_, i) => f(i))

test('settle and outQuart rise monotonically to exactly 1 without overshoot', () => {
  for (const fn of [ease.settle, ease.outQuart, ease.out]) {
    const samples = range(1001, (i) => fn(i / 1000))
    assert.ok(Math.max(...samples) <= 1, 'never above 1')
    assert.equal(fn(1), 1)
    near(fn(0), 0)
    for (let i = 1; i < samples.length; i++) assert.ok(samples[i] >= samples[i - 1] - 1e-12)
  }
  assert.ok(ease.settle(0.5) > 0.8, 'settle moves fast early')
  assert.ok(Math.max(...range(1001, (i) => ease.outBack(i / 1000))) > 1, 'outBack still overshoots (legacy)')
})

test('seeded gives the same sequence for the same seed and differs across seeds', () => {
  const a = seeded(7)
  const b = seeded(7)
  const c = seeded(8)
  const sa = range(50, () => a())
  assert.deepEqual(sa, range(50, () => b()))
  assert.notDeepEqual(sa, range(50, () => c()))
  assert.ok(sa.every((x) => x >= 0 && x < 1))
  assert.equal(seeded('intro')(), seeded('intro')())
})

test('noise1 is smooth, bounded and deterministic', () => {
  let max = 0
  for (let i = 0; i < 2000; i++) {
    const t = i * 0.01
    const v = noise1(t, 3)
    assert.ok(v >= -1 && v <= 1)
    assert.equal(v, noise1(t, 3))
    if (i) max = Math.max(max, Math.abs(v - noise1(t - 0.01, 3)))
  }
  assert.ok(max < 0.05, `no jumps (${max})`)
  assert.notEqual(noise1(1.5, 1), noise1(1.5, 2))
})

test('remap is piecewise linear and runs at normal speed outside the pairs', () => {
  const pairs = [[0, 0], [2, 1], [3, 4]]
  near(remap(1, pairs), 0.5)
  near(remap(2.5, pairs), 2.5)
  near(remap(5, pairs), 6)
  near(remap(-1, pairs), -1)
  assert.equal(remap(4, []), 4)
})

test('FORMATS, formatOf and safeArea', () => {
  assert.deepEqual(FORMATS.post, { width: 1080, height: 1350 })
  assert.deepEqual(FORMATS.card, { width: 1200, height: 630 })
  assert.equal(formatOf(1920, 1080), 'landscape')
  assert.equal(formatOf(1000, 1000), 'custom')
  const land = safeArea('landscape')
  assert.deepEqual([land.top, land.right, land.bottom, land.left], [54, 96, 54, 96])
  const post = safeArea('post')
  assert.equal(post.zones.title.y, 200)
  assert.deepEqual([post.zones.content.top, post.zones.content.bottom], [400, 1150])
  assert.equal(post.zones.captions.y, 1280)
  const story = safeArea('story')
  assert.ok(story.top >= 250 && story.bottom >= 380)
  const reel = safeArea('reel')
  assert.ok(reel.top >= 270 && FORMATS.reel.height - reel.bottom <= 1700)
  for (const name of Object.keys(FORMATS)) {
    const s = safeArea(name)
    const { height } = FORMATS[name]
    assert.ok(s.zones.captions.bottom <= height - s.bottom + 1e-9, name)
    assert.ok(s.zones.title.top >= s.top, name)
  }
  safeArea('post').zones.title.y = 0
  assert.equal(safeArea('post').zones.title.y, 200, 'returns a copy')
  assert.deepEqual(safeArea({ width: 1000, height: 600 }).top, 30)
  assert.throws(() => safeArea('poster'))
})

test('formatNumber and counter', () => {
  assert.equal(formatNumber(1234567), '1.234.567')
  assert.equal(formatNumber(1234.5, { decimals: 1, prefix: '$', suffix: ' CLP' }), '$1.234,5 CLP')
  assert.equal(formatNumber(1234.5, { locale: 'en-US', decimals: 2 }), '1,234.50')
  assert.equal(counter(0, 1, 1, 0, 5000), '0')
  assert.equal(counter(9, 1, 1, 0, 5000), '5.000')
})

test('scrambleText decodes left to right and depends on t only', () => {
  assert.equal(scrambleText('HELLO WORLD', 0, 1, 1), '')
  assert.equal(scrambleText('HELLO WORLD', 3, 1, 1), 'HELLO WORLD')
  const mid = scrambleText('HELLO WORLD', 1.5, 1, 1)
  assert.ok(mid.startsWith('HELLO'.slice(0, 5)))
  assert.equal(mid, scrambleText('HELLO WORLD', 1.5, 1, 1))
})

test('sim replays identically in any order', () => {
  const make = () => sim({
    seed: 4,
    warmup: 0.5,
    reset: (rng) => ({ x: rng() * 10, v: 0 }),
    step: (dt, s, rng) => { s.v += (rng() - 0.5) * dt * 50; s.x += s.v * dt },
    draw: (s) => s.x
  })
  const seq = make()
  const forward = range(60, (i) => seq(i / 30))
  const shuffled = make()
  const order = range(60, (i) => (i * 37) % 60)
  const values = {}
  for (const i of order) values[i] = shuffled(i / 30)
  for (let i = 0; i < 60; i++) assert.equal(values[i], forward[i], `frame ${i}`)
  assert.equal(seq(1), forward[30], 'seeking back replays')
  assert.equal(seq(1.0001), forward[30], 't snaps to its frame')
})

test('beats math', () => {
  const g = beats({ bpm: 120, downbeat: 0.5 })
  near(g.at(4), 2.5)
  near(g.bar(1), 2.5)
  assert.equal(g.index(2.5), 4)
  assert.equal(g.index(2.49), 3)
  assert.equal(g.barIndex(2.6), 1)
  near(g.phase(0.75), 0.5)
  near(g.nearest(0.9), 1)
  assert.equal(g.pulse(0.2), 0)
  near(g.pulse(1), 1)
  near(g.pulse(1.12), Math.exp(-1))
  assert.ok(g.pulse(1.2) < g.pulse(1.1), 'decays without ringing')
  const a = acts(g, [['intro', 2], ['body', 4]])
  near(a.intro.start, 0.5)
  near(a.intro.end, 4.5)
  near(a.body.start, 4.5)
  near(a.body.end, 12.5)
  assert.equal(a.body.from, 2)
})

test('camera never shows the edge when clamped and never reverses between two keys', () => {
  const W = 1920
  const H = 1080
  const keyframes = [[0, 1, 960, 540], [2, { x: 1700, y: 60, w: 300, h: 200 }, 1.3], [4, 1.25, 100, 1000]]
  const samples = range(401, (i) => camera(i / 100, keyframes))
  for (const s of samples) {
    assert.ok(s.scale >= 1 && s.scale <= 1.3 + 1e-9)
    const mx = (W / 2) * (s.scale - 1) + 1e-6
    const my = (H / 2) * (s.scale - 1) + 1e-6
    assert.ok(Math.abs(s.x) <= mx && Math.abs(s.y) <= my, `edge shows at scale ${s.scale}`)
  }
  for (const [from, to] of [[0, 200], [200, 400]]) {
    const part = samples.slice(from, to + 1)
    assert.deepEqual(reversals(part.map((s) => [s.scale, s.x, s.y, s.cx, s.cy])), [0, 0, 0, 0, 0])
  }
  const f = framing([0, 1.2, 0, 0])
  near(f.x, (W / 2) * 0.2)
  near(f.y, (H / 2) * 0.2)
  assert.equal(framing([0, 0.5, 960, 540]).scale, 1)
  assert.equal(framing([0, 0.5, 960, 540], { clamp: false }).scale, 0.5)
  assert.match(camera(1, keyframes).transform, /^translate\(.+px, .+px\) scale\(.+\)$/)
})

test('reversals counts direction changes per axis', () => {
  assert.equal(reversals([0, 1, 2, 3]), 0)
  assert.equal(reversals([0, 1, 1, 0, 2]), 2)
  assert.deepEqual(reversals([[0, 0], [1, 1], [2, 0]]), [0, 1])
  assert.deepEqual(reversals([{ x: 0, y: 0, k: 'a' }, { x: 1, y: 2 }, { x: 0, y: 3 }]), { x: 1, y: 0 })
  assert.equal(reversals([0, 1, 1 + 1e-9, 2], 1e-6), 0)
})

test('breathe keeps the edge hidden, punch decays without oscillating', () => {
  for (let i = 0; i < 3000; i++) {
    const b = breathe(i * 0.1)
    assert.ok(Math.abs(b.x) <= 960 * (b.scale - 1) && Math.abs(b.y) <= 540 * (b.scale - 1))
  }
  const hits = [1]
  assert.equal(punch(0.5, hits), 1)
  const after = range(200, (i) => punch(1.06 + i * 0.01, hits))
  for (let i = 1; i < after.length; i++) assert.ok(after[i] <= after[i - 1] && after[i] >= 1)
  near(punch(1.06, hits, 0.05), 1.05)
  const h = handheld(2, 1)
  assert.deepEqual(h, handheld(2, 1))
  assert.ok(Math.abs(h.x) < 8 && Math.abs(h.rotate) < 0.2)
})

test('smoothPath is continuous, keeps still positions and does not overshoot', () => {
  const path = (t) => keys(t, [[0, 0, 0], [1, 100, 50], [2, 100, 50]], ease.linear)
  let last = smoothPath(path, 0)
  for (let i = 1; i <= 300; i++) {
    const p = smoothPath(path, i / 100)
    assert.ok(Math.abs(p[0] - last[0]) < 1.5 && Math.abs(p[1] - last[1]) < 1)
    assert.ok(p[0] <= 100 + 1e-9)
    last = p
  }
  near(smoothPath(path, 3)[0], 100)
  near(smoothPath((t) => 5, 1), 5)
  const o = smoothPath((t) => ({ x: t, y: 2 }), 1)
  near(o.x, 1)
  near(o.y, 2)
})
