// AMBAR effects. Stateless particles (each one is a pure function of its
// index and t, so nothing is simulated), point-set sampling, and the few
// approved DOM effects: light sweeps on cuts, circle reveals, flashes, zooms
// into a node, the blur "appear from nothing", clean crossfades, grain and
// a motion blur picked by speed. The DOM helpers build what they need once
// and only move attributes per frame.
import { clamp, css, ease, hash, lerp, noise1, progress } from './ambar.js'

const TAU = Math.PI * 2
const outQuint = (x) => 1 - Math.pow(1 - x, 5)
const rnd = (seed, i, k) => hash(seed * 1013.7 + i * 17.31 + k * 3.97)

// ── particles, pure ──────────────────────────────────────────────────────

/**
 * Dust floating up through the light, wrapping around the frame:
 * { x, y, r, alpha } for particle i.
 */
export function dust (i, t, { w = 1920, h = 1080, speed = 1, seed = 0, size = 3 } = {}) {
  const v = speed * (10 + rnd(seed, i, 1) * 22)
  const x = rnd(seed, i, 2) * w + 18 * noise1(t * 0.25 + i, seed + i * 0.01)
  const y = (((rnd(seed, i, 3) * h - t * v) % h) + h) % h
  const r = size * (0.5 + rnd(seed, i, 4))
  const alpha = (0.12 + 0.38 * rnd(seed, i, 5)) * (0.65 + 0.35 * Math.sin(t * (0.8 + rnd(seed, i, 6)) + i))
  return { x, y, r, alpha }
}

/**
 * A burst from (x, y) at `at`: particles fly out with a quint ease-out and
 * fade over `duration`. { x, y, r, alpha }, alpha 0 before and after.
 */
export function burst (i, t, { at = 0, count = 24, radius = 220, seed = 0, duration = 0.9, x = 0, y = 0, size = 5 } = {}) {
  const p = progress(t, at, duration)
  if (t < at || p >= 1) return { x, y, r: 0, alpha: 0 }
  const angle = (TAU * i) / count + (rnd(seed, i, 1) - 0.5) * (TAU / count)
  const dist = radius * (0.55 + 0.45 * rnd(seed, i, 2)) * outQuint(p)
  return {
    x: x + Math.cos(angle) * dist,
    y: y + Math.sin(angle) * dist,
    r: size * (0.6 + 0.6 * rnd(seed, i, 3)) * (1 - 0.6 * p),
    alpha: 1 - ease.in(p)
  }
}

function ballistic (i, tau, { x, y, seed, speed, spread, angle, gravity, spin, life }) {
  const a = angle + (rnd(seed, i, 1) - 0.5) * spread
  const v = speed * (0.6 + 0.4 * rnd(seed, i, 2))
  const drag = 1 - 0.25 * clamp(tau / life)
  const px = x + Math.cos(a) * v * tau * drag
  const py = y + Math.sin(a) * v * tau + 0.5 * gravity * tau * tau
  const turn = spin * (0.5 + rnd(seed, i, 3)) * tau
  return {
    x: px,
    y: py,
    rotate: (rnd(seed, i, 4) * 360 + turn * 57.3) % 360,
    flip: Math.cos(turn * 1.7 + rnd(seed, i, 5) * TAU),
    alpha: 1 - ease.in(clamp(tau / life)),
    hue: rnd(seed, i, 6)
  }
}

/**
 * Confetti thrown once at `at` from (x, y): ballistic flight with a flip.
 * { x, y, rotate, flip (scaleY, -1..1), alpha, hue (0..1, pick a color) }.
 */
export function confetti (i, t, { at = 0, x = 960, y = 540, seed = 0, speed = 900, spread = 1.4, angle = -Math.PI / 2, gravity = 1400, spin = 6, life = 2.2 } = {}) {
  const tau = t - at
  if (tau < 0 || tau > life) return { x, y, rotate: 0, flip: 1, alpha: 0, hue: rnd(seed, i, 6) }
  return ballistic(i, tau, { x, y, seed, speed, spread, angle, gravity, spin, life })
}

/**
 * A fountain from (x, y) emitting between `from` and `to`: each particle
 * relaunches every `life` seconds at its own phase. Same fields as confetti.
 */
export function fountain (i, t, { from = 0, to = Infinity, x = 960, y = 900, seed = 0, speed = 760, spread = 0.5, angle = -Math.PI / 2, gravity = 1500, spin = 5, life = 1.6 } = {}) {
  const offset = rnd(seed, i, 7) * life
  const launches = Math.floor((t - from - offset) / life)
  const launch = from + offset + launches * life
  const tau = t - launch
  if (t < from + offset || launch > to) return { x, y, rotate: 0, flip: 1, alpha: 0, hue: rnd(seed, i, 6) }
  return ballistic(i + launches * 101, tau, { x, y, seed, speed, spread, angle, gravity, spin, life })
}

/** Expanding rings from a hit at `at`: [{ r, alpha, width }] per ring */
export function rings (t, at, { count = 3, gap = 0.16, duration = 1.1, radius = 240, width = 3 } = {}) {
  return Array.from({ length: count }, (_, i) => {
    const p = progress(t, at + i * gap, duration)
    const on = t >= at + i * gap && p < 1
    return { r: radius * ease.out(p), alpha: on ? (1 - p) * (1 - i * 0.22) : 0, width: width * (1 - 0.5 * p) }
  })
}

/**
 * A trail behind a moving point: n delayed samples of pathFn ({ x, y } or
 * [x, y]) `dt` apart, shrinking and fading. After `end` the whole trail fades
 * out over `fade` seconds (exits stay minimal). [{ x, y, r, alpha }].
 */
export function trail (pathFn, t, n = 10, dt = 0.04, { radius = 6, alpha = 0.35, end = Infinity, fade = 0.9 } = {}) {
  const out = 1 - ease.out(progress(t, end, fade))
  return Array.from({ length: n }, (_, k) => {
    const p = pathFn(t - k * dt)
    const [x, y] = Array.isArray(p) ? p : [p.x, p.y]
    const f = 1 - k / n
    return { x, y, r: radius * (0.35 + 0.65 * f), alpha: alpha * f * out }
  })
}

/**
 * Particles flying from one point set to another on quadratic Béziers: each
 * waits its own stagger, then arcs sideways and lands. Points are [x, y].
 * Returns [{ x, y, p }] with p the particle's own progress 0 → 1.
 */
export function morph (from, to, t, a, d = 1.2, seed = 0, { arc = 0.35, stagger = 0.4 } = {}) {
  const n = Math.max(from.length, to.length)
  const own = d * (1 - stagger)
  return Array.from({ length: n }, (_, i) => {
    const [x0, y0] = from[i % from.length]
    const [x1, y1] = to[i % to.length]
    const p = ease.inOut(progress(t, a + rnd(seed, i, 1) * d * stagger, own))
    const dx = x1 - x0
    const dy = y1 - y0
    const bend = arc * (rnd(seed, i, 2) - 0.5) * 2
    const cx = (x0 + x1) / 2 - dy * bend
    const cy = (y0 + y1) / 2 + dx * bend
    const q = 1 - p
    return { x: q * q * x0 + 2 * q * p * cx + p * p * x1, y: q * q * y0 + 2 * q * p * cy + p * p * y1, p }
  })
}

// ── point sets ───────────────────────────────────────────────────────────

/** Point sets for morph() and particles, as [x, y] lists */
export const sample = {
  /** n points evenly spaced along a polyline (closed: back to the start) */
  polyline (points, n, closed = false) {
    const pts = closed ? [...points, points[0]] : points
    const lengths = [0]
    for (let i = 1; i < pts.length; i++) lengths.push(lengths[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
    const total = lengths[lengths.length - 1]
    return Array.from({ length: n }, (_, k) => {
      const s = closed ? (total * k) / n : n > 1 ? (total * k) / (n - 1) : 0
      let i = 1
      while (i < lengths.length - 1 && lengths[i] < s) i++
      const seg = lengths[i] - lengths[i - 1]
      const f = seg ? (s - lengths[i - 1]) / seg : 0
      return [lerp(pts[i - 1][0], pts[i][0], f), lerp(pts[i - 1][1], pts[i][1], f)]
    })
  },
  line: (a, b, n) => sample.polyline([a, b], n),
  circle: (cx, cy, r, n, start = -Math.PI / 2) => Array.from({ length: n }, (_, i) => [cx + r * Math.cos(start + (TAU * i) / n), cy + r * Math.sin(start + (TAU * i) / n)]),
  rect: (x, y, w, h, n) => sample.polyline([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], n, true),
  grid: (x, y, w, h, cols, rows) => Array.from({ length: cols * rows }, (_, i) => [x + (w * ((i % cols) + 0.5)) / cols, y + (h * (Math.floor(i / cols) + 0.5)) / rows]),
  /** Points scattered in a disc, seeded */
  disc: (cx, cy, r, n, seed = 0) => Array.from({ length: n }, (_, i) => {
    const a = rnd(seed, i, 1) * TAU
    const d = r * Math.sqrt(rnd(seed, i, 2))
    return [cx + Math.cos(a) * d, cy + Math.sin(a) * d]
  }),
  /** Points on the ink of a text (browser only): { x, y } is the center */
  text (text, { x = 960, y = 540, font = '800 220px system-ui, sans-serif', step = 9, max = 900 } = {}) {
    const canvas = document.createElement('canvas')
    const g = canvas.getContext('2d')
    g.font = font
    const w = Math.ceil(g.measureText(text).width) + 20
    const h = Math.ceil(parseFloat(font.match(/(\d+)px/)?.[1] ?? 100) * 1.4)
    canvas.width = w
    canvas.height = h
    g.font = font
    g.textBaseline = 'middle'
    g.fillText(text, 10, h / 2)
    const data = g.getImageData(0, 0, w, h).data
    const pts = []
    for (let py = 0; py < h; py += step) for (let px = 0; px < w; px += step) if (data[(py * w + px) * 4 + 3] > 128) pts.push([x - w / 2 + px, y - h / 2 + py])
    if (pts.length <= max) return pts
    return Array.from({ length: max }, (_, i) => pts[Math.floor((i * pts.length) / max)])
  }
}

// ── transitions and effects, DOM ─────────────────────────────────────────

/**
 * A soft white band crossing el on each cut: over `duration` seconds it
 * travels left to right, skewed, with opacity sin(pπ). el is a full-stage
 * overlay; the band is built once inside it.
 */
export function lightSweep (el, t, cuts, { duration = 1, width = 0.32, skew = -18, alpha = 0.55 } = {}) {
  let band = el.firstElementChild
  if (!band || !band.classList.contains('fx-band')) {
    css(el, { overflow: 'hidden', pointerEvents: 'none' })
    band = document.createElement('div')
    band.className = 'fx-band'
    css(band, { position: 'absolute', top: '-10%', bottom: '-10%', left: '0', width: `${width * 100}%`, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.9), transparent)', mixBlendMode: 'screen' })
    el.prepend(band)
  }
  const cut = cuts.filter((c) => t >= c && t < c + duration).pop()
  if (cut === undefined) return css(band, { opacity: 0 })
  const p = (t - cut) / duration
  return css(band, {
    opacity: alpha * Math.sin(p * Math.PI),
    transform: `translateX(${lerp(-width * 1.4, 1 + width * 0.4, ease.inOut(p)) * el.offsetWidth}px) skewX(${skew}deg)`
  })
}

/** Reveals el through a growing circle from (x, y) between a and a + d */
export function circleReveal (el, t, a, d = 0.65, { x = '50%', y = '50%' } = {}) {
  const k = ease.inOut(progress(t, a, d))
  return css(el, { clipPath: k >= 1 ? 'none' : `circle(${(k * 150).toFixed(3)}% at ${x} ${y})`, visibility: k > 0 ? 'visible' : 'hidden' })
}

/** Gaussian flash: el's opacity peaks at `alpha` at time `at` */
export function flash (el, t, at, { width = 0.08, alpha = 0.6 } = {}) {
  const o = alpha * Math.exp(-Math.pow((t - at) / width, 2))
  return css(el, { opacity: o < 0.002 ? 0 : o })
}

/**
 * Flies the camera into a node: el scales 1 → `scale` around `origin`
 * (accelerating) and fades out over the second half, between a and b.
 */
export function zoomThrough (el, t, a, b, { origin = '50% 50%', scale = 5 } = {}) {
  const p = progress(t, a, b - a)
  const k = ease.in(p)
  return css(el, { transformOrigin: origin, transform: `scale(${lerp(1, scale, k)})`, opacity: 1 - ease.inOut(progress(p, 0.4, 0.6)) })
}

/**
 * The approved "appear from nothing": blur 28 → 0, scale 1.12 → 1 and
 * opacity 0 → 1 from a. With `until`, fades away (no blur) before it.
 */
export function appear (el, t, a, { duration = 0.5, blur = 28, scale = 1.12, until = Infinity, exit = 0.3 } = {}) {
  const k = ease.out(progress(t, a, duration))
  const o = Number.isFinite(until) ? ease.inOut(progress(t, until - exit, exit)) : 0
  return css(el, { opacity: k * (1 - o), filter: k >= 1 ? 'none' : `blur(${((1 - k) * blur).toFixed(2)}px)`, transform: `scale(${lerp(scale, 1, k)})` })
}

/** Opacities [outgoing, incoming] of a clean crossfade at `at` over d seconds */
export function crossfade (t, at, d = 0.5) {
  const k = ease.inOut(progress(t, at, d))
  return [1 - k, k]
}

/**
 * Scenes that replace each other with clean crossfades (no blur, no zoom):
 * list = [[el, start], …] in order.
 *   mode 'over'      opaque scenes: the incoming one fades in on top while the
 *                    outgoing one stays opaque underneath (no dip to black)
 *   mode 'through'   transparent layers over a shared background: the
 *                    outgoing fades out, then the incoming fades in, so their
 *                    contents never overlap. The cut is at `start`.
 */
export function scenes (t, list, fade = 0.5, { mode = 'over' } = {}) {
  list.forEach(([el, start], i) => {
    const next = list[i + 1]?.[1] ?? Infinity
    let opacity
    if (mode === 'through') {
      const half = fade / 2
      opacity = (i === 0 ? 1 : ease.out(progress(t, start, half))) * (1 - ease.inOut(progress(t, next - half, half)))
      if (t < start || t >= next) opacity = 0
    } else {
      opacity = t >= start && t < next + fade ? (i === 0 ? 1 : ease.inOut(progress(t, start, fade))) : 0
    }
    css(el, { opacity, visibility: opacity > 0 ? 'visible' : 'hidden', zIndex: i + 1 })
  })
}

/** Moves a .grain layer to a new random offset 24 times a second */
export function grain (el, t, { fps = 24, range = 120 } = {}) {
  const f = Math.floor(t * fps)
  return css(el, { transform: `translate(${((hash(f) - 0.5) * range).toFixed(1)}px, ${((hash(f + 0.5) - 0.5) * range).toFixed(1)}px)` })
}

const BLURS = [[4, 0], [12, 2], [30, 5], [Infinity, 9]]

/**
 * Directional motion blur by speed (px per frame): picks a preset SVG filter,
 * injected into the page once, along the dominant axis. Returns the level 0–3.
 */
export function motionBlur (el, vx, vy = 0) {
  if (!document.getElementById('fx-motion-blur')) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.id = 'fx-motion-blur'
    svg.setAttribute('width', '0')
    svg.setAttribute('height', '0')
    svg.style.position = 'absolute'
    svg.innerHTML = BLURS.slice(1).map(([, s], i) => `<filter id="fx-mb-x${i + 1}" x="-20%" y="-5%" width="140%" height="110%"><feGaussianBlur stdDeviation="${s} 0"/></filter><filter id="fx-mb-y${i + 1}" x="-5%" y="-20%" width="110%" height="140%"><feGaussianBlur stdDeviation="0 ${s}"/></filter>`).join('')
    document.body.append(svg)
  }
  const speed = Math.hypot(vx, vy)
  const level = BLURS.findIndex(([max]) => speed < max)
  el.style.filter = level === 0 ? 'none' : `url(#fx-mb-${Math.abs(vx) >= Math.abs(vy) ? 'x' : 'y'}${level})`
  return level
}
