// AMBAR motion: the pieces of the house motion language that are plain math.
// A replayable simulation, a beat grid, time remapping, a camera that frames
// boxes in straight lines without showing the stage edge, slow breathing,
// impact zooms that never oscillate, handheld drift and path smoothing.
// Everything is a pure function of t (sim replays itself to get there), so
// it is tested in Node and safe to call from render(t) in any order.
import { clamp, ease, lerp, noise1, progress, seeded } from './ambar.js'

export { remap, seeded, noise1 } from './ambar.js'

// ── simulation ───────────────────────────────────────────────────────────

/**
 * A stateful simulation that still renders any frame in any order.
 *   reset(rng)                 builds the initial state (return it, or keep your own)
 *   step(dt, state, rng)       advances one fixed step (may return a new state)
 *   draw(state, t)             optional; its result is what at(t) returns
 *   dt, fps, warmup, seed      fixed step, frame rate, seconds simulated before t = 0, PRNG seed
 * Returns at(t): steps forward to the frame for t, and replays from reset
 * when t goes backwards, so sequential renders are cheap and seeks exact.
 */
export function sim ({ reset, step, draw, dt = 1 / 60, fps = 30, warmup = 0, seed = 1 }) {
  let done = -1
  let state
  let rng
  const restart = () => {
    rng = seeded(seed)
    state = reset?.(rng)
    done = 0
  }
  return function at (t) {
    const target = Math.max(0, Math.round((warmup + Math.round(t * fps) / fps) / dt))
    if (done < 0 || target < done) restart()
    while (done < target) {
      const next = step(dt, state, rng)
      if (next !== undefined) state = next
      done++
    }
    return draw ? draw(state, t) : state
  }
}

// ── music ────────────────────────────────────────────────────────────────

/**
 * A beat grid for cutting to music.
 *   at(n)          time of beat n          bar(n)        time of bar n
 *   index(t)       beat number at t        barIndex(t)   bar number at t
 *   phase(t)       0 → 1 within the beat   nearest(t)    time of the closest beat
 *   pulse(t, decay = .12)   1 on each beat, decaying exponentially (no ringing)
 */
export function beats ({ bpm, downbeat = 0, perBar = 4 }) {
  const spb = 60 / bpm
  const at = (n) => downbeat + n * spb
  const index = (t) => Math.floor((t - downbeat) / spb + 1e-9)
  return {
    bpm,
    spb,
    perBar,
    at,
    index,
    bar: (n) => at(n * perBar),
    barIndex: (t) => Math.floor((t - downbeat) / (spb * perBar) + 1e-9),
    phase: (t) => {
      const x = (t - downbeat) / spb + 1e-9
      return clamp(x - Math.floor(x))
    },
    nearest: (t) => at(Math.round((t - downbeat) / spb)),
    pulse: (t, decay = 0.12) => (t < downbeat ? 0 : Math.exp(-Math.max(0, t - at(index(t))) / decay))
  }
}

/**
 * Acts measured in bars, placed one after another from `startBar`:
 * acts(grid, [['intro', 2], ['body', 4]]) → { intro: { start, end, from, to, bars }, … }
 */
export function acts (grid, list, startBar = 0) {
  const out = {}
  let bar = startBar
  for (const [id, bars] of list) {
    out[id] = { start: grid.bar(bar), end: grid.bar(bar + bars), from: bar, to: bar + bars, bars }
    bar += bars
  }
  return out
}

// ── camera ───────────────────────────────────────────────────────────────

/**
 * Layout box { x, y, w, h } of an element relative to `root` (the stage by
 * default), unaffected by transforms. SVG elements use getBBox().
 */
export function boxOf (el, root = null) {
  if (!el || typeof el !== 'object') return el
  if ('w' in el && 'h' in el) return el
  if (typeof el.getBBox === 'function' && el.ownerSVGElement) {
    const b = el.getBBox()
    return { x: b.x, y: b.y, w: b.width, h: b.height }
  }
  let x = 0
  let y = 0
  for (let n = el; n && n !== root && n.id !== 'stage'; n = n.offsetParent) {
    x += n.offsetLeft
    y += n.offsetTop
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight }
}

/**
 * One camera key → its final framing { scale, x, y }, where x, y translate
 * the world layer (transform-origin at its center, the CSS default).
 * Keys: [time, scale, cx, cy] puts stage point (cx, cy) in the middle;
 * [time, box | element, maxScale = 1.3] fits the box (filling `fill` of the
 * frame); elements are measured relative to `root`, the layer the camera moves.
 * With clamp, scale ≥ 1 and the edge of the layer never shows.
 */
export function framing (key, { width = 1920, height = 1080, clamp: bound = true, fill = 0.8, root = null } = {}) {
  let scale
  let cx
  let cy
  if (typeof key[1] === 'number') {
    [, scale, cx = width / 2, cy = height / 2] = key
  } else {
    const box = boxOf(key[1], root)
    const max = key[2] ?? 1.3
    scale = Math.min(max, (fill * width) / box.w, (fill * height) / box.h)
    cx = box.x + box.w / 2
    cy = box.y + box.h / 2
  }
  if (bound) scale = Math.max(1, scale)
  let x = (width / 2 - cx) * scale
  let y = (height / 2 - cy) * scale
  if (bound) {
    const mx = (width / 2) * (scale - 1)
    const my = (height / 2) * (scale - 1)
    x = clamp(x, -mx, mx)
    y = clamp(y, -my, my)
  }
  return { scale, x, y }
}

const shotOf = ({ scale, x, y }, width, height) => ({
  scale,
  x,
  y,
  cx: width / 2 - x / scale,
  cy: height / 2 - y / scale,
  transform: `translate(${x.toFixed(3)}px, ${y.toFixed(3)}px) scale(${scale.toFixed(5)})`
})

/**
 * The camera at t. Each key becomes its final clamped framing first, then the
 * camera moves between neighbouring framings in a straight line (ease.inOut),
 * so a move between two keys never reverses on any axis and never shows the
 * edge. width and height are the size of the layer the transform goes on
 * (the stage by default). Returns { scale, x, y, cx, cy, transform }.
 */
export function camera (t, keys, { width = 1920, height = 1080, clamp: bound = true, fill = 0.8, root = null, easing = ease.inOut } = {}) {
  if (!keys.length) return shotOf({ scale: 1, x: 0, y: 0 }, width, height)
  const frames = keys.map((key) => [key[0], framing(key, { width, height, clamp: bound, fill, root })])
  if (t <= frames[0][0]) return shotOf(frames[0][1], width, height)
  const last = frames[frames.length - 1]
  if (t >= last[0]) return shotOf(last[1], width, height)
  let i = 0
  while (t > frames[i + 1][0]) i++
  const [ta, a] = frames[i]
  const [tb, b] = frames[i + 1]
  const k = easing(progress(t, ta, tb - ta))
  return shotOf({ scale: lerp(a.scale, b.scale, k), x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) }, width, height)
}

/**
 * A slow push and drift for still shots: scale 1 + .018 sin(.23t) + .012
 * sin(.11t + 1.3) and a drift of 9 × 6 px, all times `amount`. With cover
 * (default) a small base zoom keeps the edge out of frame.
 */
export function breathe (t, amount = 1, { cover = true } = {}) {
  const scale = 1 + amount * ((cover ? 0.042 : 0) + 0.018 * Math.sin(t * 0.23) + 0.012 * Math.sin(t * 0.11 + 1.3))
  const x = amount * 9 * Math.sin(t * 0.17)
  const y = amount * 6 * Math.cos(t * 0.13 + 0.5)
  return { scale, x, y, transform: `translate(${x.toFixed(3)}px, ${y.toFixed(3)}px) scale(${scale.toFixed(5)})` }
}

/**
 * Impact zoom: a scale factor that rises to 1 + strength in `attack` seconds
 * at each hit and decays exponentially, never below 1 and never oscillating.
 */
export function punch (t, hits, strength = 0.05, { attack = 0.06, decay = 0.28 } = {}) {
  let z = 0
  for (const at of hits) {
    if (t < at) continue
    z += strength * ease.out(progress(t, at, attack)) * Math.exp(-Math.max(0, t - at - attack) / decay)
  }
  return 1 + z
}

/**
 * Handheld drift from smooth noise: { x, y, rotate, transform } in px and
 * degrees. Put it on a layer zoomed ≥ 1.02 so the edge stays hidden.
 */
export function handheld (t, seed = 0, amount = 1) {
  const x = amount * (5 * noise1(t * 0.9, seed) + 1.6 * noise1(t * 2.3, seed + 0.1))
  const y = amount * (4 * noise1(t * 0.8, seed + 0.2) + 1.2 * noise1(t * 2.1, seed + 0.3))
  const rotate = amount * 0.18 * noise1(t * 0.6, seed + 0.4)
  return { x, y, rotate, transform: `translate(${x.toFixed(3)}px, ${y.toFixed(3)}px) rotate(${rotate.toFixed(4)}deg)` }
}

/**
 * Direction reversals in a series of samples, for QA (a camera move should
 * have none). Numbers → a count; arrays → a count per index; objects → a
 * count per numeric key. Changes under eps are ignored.
 */
export function reversals (samples, eps = 1e-6) {
  const axis = (values) => {
    let dir = 0
    let n = 0
    for (let i = 1; i < values.length; i++) {
      const d = values[i] - values[i - 1]
      if (Math.abs(d) <= eps) continue
      const s = Math.sign(d)
      if (dir && s !== dir) n++
      dir = s
    }
    return n
  }
  if (!samples.length) return 0
  const first = samples[0]
  if (typeof first === 'number') return axis(samples)
  if (Array.isArray(first)) return first.map((_, j) => axis(samples.map((s) => s[j])))
  const out = {}
  for (const key of Object.keys(first)) if (typeof first[key] === 'number') out[key] = axis(samples.map((s) => s[key]))
  return out
}

// ── paths ────────────────────────────────────────────────────────────────

/**
 * Gaussian-averages a keyframed position over time so moves start and stop
 * like a fluid. fn(t) returns a number, an array or an object of numbers.
 */
export function smoothPath (fn, t, { sigma = 0.22, span = 0.54, step = 0.09 } = {}) {
  const n = Math.max(0, Math.round(span / step))
  let total = 0
  let acc = null
  for (let k = -n; k <= n; k++) {
    const o = k * step
    const w = Math.exp(-(o * o) / (2 * sigma * sigma))
    const v = fn(t + o)
    total += w
    if (typeof v === 'number') acc = (acc ?? 0) + v * w
    else if (Array.isArray(v)) {
      acc = acc ?? v.map(() => 0)
      v.forEach((x, j) => { acc[j] += x * w })
    } else {
      acc = acc ?? {}
      for (const key in v) acc[key] = (acc[key] ?? 0) + v[key] * w
    }
  }
  if (typeof acc === 'number') return acc / total
  if (Array.isArray(acc)) return acc.map((x) => x / total)
  for (const key in acc) acc[key] /= total
  return acc
}
