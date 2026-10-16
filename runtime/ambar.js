// AMBAR runtime. A composition is a page whose picture is a pure function of
// time: video({ setup, render }) registers render(t), and the renderer, the
// studio and the live preview all call it with any t, in any order.
//
// Everything above video() is plain math with no DOM at import time, so it
// can be unit tested in Node. Motion, effects, captions and charts live in
// motion.js, fx.js, captions.js and charts.js next to this file.

// ── time ──────────────────────────────────────────────────────────────────

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
export const lerp = (a, b, k) => a + (b - a) * k

/** 0 → 1 while t goes from a to a + d */
export const progress = (t, a, d) => (d <= 0 ? (t >= a ? 1 : 0) : clamp((t - a) / d))

const SETTLE_END = 1 - Math.exp(-7) * 8

export const ease = {
  linear: (x) => x,
  in: (x) => x * x * x,
  out: (x) => 1 - Math.pow(1 - x, 3),
  inOut: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  outQuart: (x) => 1 - Math.pow(1 - x, 4),
  outExpo: (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  inOutSine: (x) => -(Math.cos(Math.PI * x) - 1) / 2,
  /** Critically damped spring: fast start, no overshoot, exactly 1 at x = 1 */
  settle: (x) => (x >= 1 ? 1 : x <= 0 ? 0 : (1 - Math.exp(-7 * x) * (1 + 7 * x)) / SETTLE_END),
  /**
   * Overshoots past 1 before settling. Kept for old scenes only: the house
   * style has no bounce. Use ease.out, ease.outQuart or ease.settle.
   * @deprecated
   */
  outBack: (x) => {
    const c1 = 1.70158
    const c3 = c1 + 1
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2)
  },
  /**
   * Oscillating spring that overshoots 1. Kept for old scenes only: the
   * house style has no elastic motion. Use ease.settle.
   * @deprecated
   */
  spring: (x) => (x >= 1 ? 1 : 1 - Math.exp(-6 * x) * Math.cos(10 * x))
}

/**
 * Visibility of something on screen from a to b: eases in over `fadeIn`,
 * holds at 1, eases out over `fadeOut` before b.
 */
export function span (t, a, b, fadeIn = 0.45, fadeOut = 0.45) {
  return Math.min(ease.out(progress(t, a, fadeIn)), 1 - ease.inOut(progress(t, b - fadeOut, fadeOut)))
}

/**
 * Keyframes [[time, ...values], ...] → the values at t, eased between
 * neighbours. Before the first key: the first; after the last: the last.
 */
export function keys (t, frames, easing = ease.inOut) {
  if (!frames.length) return []
  if (t <= frames[0][0]) return frames[0].slice(1)
  const last = frames[frames.length - 1]
  if (t >= last[0]) return last.slice(1)
  let i = 0
  while (t > frames[i + 1][0]) i++
  const a = frames[i]
  const b = frames[i + 1]
  const k = easing(progress(t, a[0], b[0] - a[0]))
  return a.slice(1).map((v, j) => lerp(v, b[j + 1], k))
}

/** The start time of the i-th item in a staggered group */
export const stagger = (start, i, step = 0.07) => start + i * step

/** A number that counts from `from` to `to` between a and a + d */
export const count = (t, a, d, from, to, easing = ease.outExpo) => lerp(from, to, easing(progress(t, a, d)))

/** Deterministic pseudo-random in [0, 1) for a seed (handy for particles) */
export function hash (seed) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

function hashString (text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

/**
 * A seeded pseudo-random generator (mulberry32): seeded(7) returns a function
 * that gives the same sequence in [0, 1) every time. Strings are hashed.
 */
export function seeded (seed = 1) {
  let a = typeof seed === 'string' ? hashString(seed) : Math.floor(seed * 2654435761) >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let x = a
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

/** Integer lattice hash in [0, 1), the corners of noise1 */
function lattice (i, seed) {
  let x = Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(Math.round(seed * 1000) | 0, 0x165667b1)
  x = Math.imul(x ^ (x >>> 15), 0x85ebca6b)
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35)
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296
}

/**
 * Smooth 1D value noise in [-1, 1]: a new random value per unit of t, eased
 * between them with no corners. noise1(t * 0.4, 3) drifts slowly.
 */
export function noise1 (t, seed = 0) {
  const i = Math.floor(t)
  const f = t - i
  const k = f * f * f * (f * (f * 6 - 15) + 10)
  return lerp(lattice(i, seed), lattice(i + 1, seed), k) * 2 - 1
}

/**
 * Piecewise linear time remap. pairs = [[tReal, tDesign], …] sorted by tReal.
 * Between pairs design time runs at the slope they set; outside them it runs
 * at normal speed. remap(t, [[0, 0], [2, 1], [3, 4]]) goes slow, then fast.
 */
export function remap (t, pairs) {
  if (!pairs.length) return t
  const first = pairs[0]
  const last = pairs[pairs.length - 1]
  if (t <= first[0]) return first[1] + (t - first[0])
  if (t >= last[0]) return last[1] + (t - last[0])
  let i = 0
  while (t > pairs[i + 1][0]) i++
  const [a, da] = pairs[i]
  const [b, db] = pairs[i + 1]
  return b === a ? db : lerp(da, db, (t - a) / (b - a))
}

// ── formats ──────────────────────────────────────────────────────────────

/** Output sizes by name, for video({ format }) */
export const FORMATS = {
  landscape: { width: 1920, height: 1080 },
  post: { width: 1080, height: 1350 },
  reel: { width: 1080, height: 1920 },
  story: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
  card: { width: 1200, height: 630 }
}

// Insets keep text off the edges and away from the platform's own UI; zones
// are the bands where titles, content and captions sit (y is the anchor line).
const SAFE = {
  landscape: { top: 54, right: 96, bottom: 54, left: 96, zones: { title: { top: 54, bottom: 300, y: 150 }, content: { top: 300, bottom: 860 }, captions: { top: 880, bottom: 1026, y: 950 } } },
  post: { top: 140, right: 72, bottom: 20, left: 72, zones: { title: { top: 140, bottom: 380, y: 200 }, content: { top: 400, bottom: 1150 }, captions: { top: 1200, bottom: 1330, y: 1280 } } },
  reel: { top: 270, right: 72, bottom: 220, left: 72, zones: { title: { top: 270, bottom: 520, y: 330 }, content: { top: 540, bottom: 1480 }, captions: { top: 1500, bottom: 1700, y: 1580 } } },
  story: { top: 250, right: 72, bottom: 400, left: 72, zones: { title: { top: 250, bottom: 500, y: 320 }, content: { top: 520, bottom: 1380 }, captions: { top: 1400, bottom: 1520, y: 1450 } } },
  square: { top: 60, right: 60, bottom: 60, left: 60, zones: { title: { top: 60, bottom: 260, y: 130 }, content: { top: 270, bottom: 880 }, captions: { top: 900, bottom: 1020, y: 960 } } },
  card: { top: 40, right: 60, bottom: 40, left: 60, zones: { title: { top: 40, bottom: 220, y: 110 }, content: { top: 230, bottom: 590 }, captions: { top: 520, bottom: 590, y: 555 } } }
}

/**
 * The safe area of a format (a FORMATS name, or { width, height } for a
 * custom size, which gets 5% insets): { top, right, bottom, left, zones }.
 */
export function safeArea (format = 'landscape') {
  if (typeof format === 'string') {
    if (!SAFE[format]) throw new Error(`Unknown format "${format}". Use one of: ${Object.keys(FORMATS).join(', ')}`)
    return JSON.parse(JSON.stringify(SAFE[format]))
  }
  const { width, height } = format
  const x = Math.round(width * 0.05)
  const y = Math.round(height * 0.05)
  return {
    top: y,
    right: x,
    bottom: y,
    left: x,
    zones: {
      title: { top: y, bottom: Math.round(height * 0.26), y: Math.round(height * 0.14) },
      content: { top: Math.round(height * 0.27), bottom: Math.round(height * 0.8) },
      captions: { top: Math.round(height * 0.82), bottom: height - y, y: Math.round(height * 0.88) }
    }
  }
}

/** The FORMATS name of a size ('reel' for 1080×1920), or 'custom' */
export function formatOf (width, height) {
  return Object.keys(FORMATS).find((k) => FORMATS[k].width === width && FORMATS[k].height === height) ?? 'custom'
}

// ── numbers and text, pure ───────────────────────────────────────────────

/**
 * A number as text for the screen: formatNumber(1234.5, { decimals: 1 }) is
 * '1.234,5' in es-CL. Options: locale, decimals (0), prefix, suffix.
 */
export function formatNumber (n, { locale = 'es-CL', decimals = 0, prefix = '', suffix = '' } = {}) {
  const text = new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n)
  return `${prefix}${text}${suffix}`
}

/** count() as formatted text: counter(t, a, .65, 0, 1200, { prefix: '$' }) */
export const counter = (t, a, d, from, to, { easing = ease.outExpo, ...format } = {}) =>
  formatNumber(count(t, a, d, from, to, easing), format)

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+<>/'

/**
 * Text that decodes left to right between a and a + d: settled letters on
 * the left, `width` changing glyphs at the front, nothing after them yet.
 */
export function scrambleText (text, t, a, d, glyphs = GLYPHS, width = 6) {
  if (t < a) return ''
  const p = progress(t, a, d)
  if (p >= 1) return text
  const chars = [...text]
  const settled = Math.floor(p * chars.length)
  const frame = Math.floor(t * 24)
  let out = chars.slice(0, settled).join('')
  for (let i = settled; i < Math.min(chars.length, settled + width); i++) {
    out += chars[i] === ' ' ? ' ' : glyphs[Math.floor(hash(i * 31.7 + frame * 7.13) * glyphs.length)]
  }
  return out
}

// ── narration cues ───────────────────────────────────────────────────────

const state = { cues: {} }

/**
 * A narration cue from voice/timings.json, written by `ambar voice`. The
 * fallback keeps the composition working before any voice exists.
 */
export function cue (id, fallbackStart = 0, fallbackDuration = 2) {
  return state.cues[id] ?? { start: fallbackStart, duration: fallbackDuration, end: fallbackStart + fallbackDuration }
}

// ── DOM helpers ──────────────────────────────────────────────────────────

export const $ = (selector, root = document) => root.querySelector(selector)
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)]

export function css (el, styles) {
  for (const key in styles) el.style[key] = styles[key]
  return el
}

/** Splits text into word spans. Words written as {word} get the .hl class. */
export function words (el, text) {
  el.innerHTML = text
    .split(' ')
    .map((word) => {
      const highlighted = word.startsWith('{')
      return `<span class="w${highlighted ? ' hl' : ''}">${word.replace(/[{}]/g, '')}</span>`
    })
    .join(' ')
  return [...el.children]
}

/** Splits text into letter spans */
export function letters (el, text) {
  el.innerHTML = [...text].map((c) => `<span class="w">${c === ' ' ? '&nbsp;' : c}</span>`).join('')
  return [...el.children]
}

/**
 * Spans rise into place one after another from a, and drop away before b.
 * options: duration (0.6), blur (8 px at the start), exit (0.4 s before b),
 * exitStep (stagger of the exit, last span first; 0 = all leave together).
 */
export function rise (spans, t, a, b = Infinity, step = 0.07, distance = 28, { duration = 0.6, blur = 8, exit = 0.4, exitStep = 0 } = {}) {
  spans.forEach((span, i) => {
    const k = ease.out(progress(t, a + i * step, duration))
    const o = Number.isFinite(b) ? ease.inOut(progress(t, b - exit - (spans.length - 1 - i) * exitStep, exit)) : 0
    css(span, {
      opacity: k * (1 - o),
      transform: `translateY(${(1 - k) * distance - o * distance * 0.55}px)`,
      filter: `blur(${(1 - k) * blur}px)`
    })
  })
}

/** An element fades up into place at a and away before b */
export function fadeUp (el, t, a, b = Infinity, distance = 30) {
  const k = ease.out(progress(t, a, 0.6))
  const o = Number.isFinite(b) ? ease.inOut(progress(t, b - 0.4, 0.4)) : 0
  return css(el, { opacity: k * (1 - o), transform: `translateY(${(1 - k) * distance}px)` })
}

/**
 * Lines revealed through a mask: each slides up from translateY(112%) with a
 * quartic ease-out, `step` apart. Builds the masks once (again only if the
 * lines change). options: duration (0.6), until (fade out 0.25 s before it).
 */
export function revealLines (container, lines, t, a, step = 0.09, { duration = 0.6, until = Infinity } = {}) {
  const key = lines.join('\n')
  if (container.dataset.lines !== key) {
    container.dataset.lines = key
    container.innerHTML = lines.map((line) => `<span class="ln-mask" style="display:block;overflow:hidden;padding-bottom:.1em;margin-bottom:-.1em"><span class="ln" style="display:block">${line}</span></span>`).join('')
  }
  const out = Number.isFinite(until) ? ease.inOut(progress(t, until - 0.25, 0.25)) : 0
  container.querySelectorAll('.ln').forEach((el, i) => {
    const k = ease.outQuart(progress(t, a + i * step, duration))
    css(el, { transform: `translateY(${(1 - k) * 112}%)`, opacity: 1 - out })
  })
  return container
}

/** scrambleText() written into el: a left-to-right decode */
export function scramble (el, text, t, a, d = 0.8, glyphs = GLYPHS) {
  el.textContent = scrambleText(text, t, a, d, glyphs)
  return el
}

/**
 * Types text into el from a, at `rate` characters per second. With
 * { cursor: true } (or a cursor character) a caret follows the text: solid
 * while typing, blinking every `blink` seconds once done.
 */
export function type (el, text, t, a, rate = 28, { cursor = false, blink = 0.53 } = {}) {
  const n = Math.floor(clamp((t - a) * rate, 0, text.length))
  const done = n === text.length
  let caret = ''
  if (cursor && t >= a) {
    const on = !done || Math.floor((t - a - text.length / rate) / blink) % 2 === 0
    caret = on ? (cursor === true ? '▍' : cursor) : ' '
  }
  el.textContent = text.slice(0, n) + caret
  return done
}

/** ÁMBAR, the mascot. Needs <script src="/@ambar/mascot/ambar.js">. */
export function mascot (options) {
  if (typeof window.mascotaAmbar !== 'function') {
    throw new Error('Load the mascot first: <script src="/@ambar/mascot/ambar.js"></script>')
  }
  return window.mascotaAmbar(options)
}

// ── the composition ─────────────────────────────────────────────────────

/**
 * Registers a composition.
 *   format               'landscape' | 'post' | 'reel' | 'story' | 'square' | 'card'
 *   width, height, fps   size (overrides format; 1920×1080 by default) and frame rate (30)
 *   duration             seconds; defaults to the narration end plus `tail`
 *   setup(ctx)           builds the DOM once; ctx = { stage, width, height, format, safe, cues }
 *   render(t, ctx)       draws the frame at t; must depend on t only
 */
export async function video ({ format, width, height, fps = 30, duration, tail = 1.6, setup, render } = {}) {
  if (format && !FORMATS[format]) throw new Error(`Unknown format "${format}". Use one of: ${Object.keys(FORMATS).join(', ')}`)
  const base = FORMATS[format ?? 'landscape']
  width = width ?? base.width
  height = height ?? base.height
  format = format && width === base.width && height === base.height ? format : formatOf(width, height)
  const safe = safeArea(format === 'custom' ? { width, height } : format)

  const params = new URLSearchParams(location.search)
  const mode = params.has('render') ? 'render' : params.has('studio') ? 'studio' : params.has('player') ? 'player' : 'preview'
  document.documentElement.dataset.mode = mode

  let stage = document.getElementById('stage')
  if (!stage) {
    stage = document.createElement('div')
    stage.id = 'stage'
    document.body.prepend(stage)
  }
  css(stage, { width: `${width}px`, height: `${height}px` })

  let end = 0
  try {
    const response = await fetch('voice/timings.json', { cache: 'no-store' })
    if (response.ok) {
      const timings = await response.json()
      state.cues = timings.cues ?? {}
      end = timings.end ?? 0
    }
  } catch {}

  const total = duration ?? (end ? end + tail : 10)
  const ctx = { stage, width, height, format, safe, fps, duration: total, cues: state.cues, mode }
  await setup?.(ctx)
  await document.fonts?.ready

  const frame = (t) => render(clamp(t, 0, total), ctx)
  window.AMBAR = { ready: true, width, height, format, fps, duration: total, cues: state.cues, render: frame, mode }

  if (mode === 'render') {
    frame(0)
    return
  }

  // Player: a web video player with chapters, sound and captions (player.js)
  if (mode === 'player') {
    const { mountPlayer } = await import('./player.js')
    return mountPlayer({ stage, width, height, duration: total, frame })
  }

  // Studio and preview: fit the stage to the window
  const fit = () => {
    const scale = Math.min(innerWidth / width, innerHeight / height)
    css(stage, {
      transform: `scale(${scale})`,
      left: `${(innerWidth - width * scale) / 2}px`,
      top: `${(innerHeight - height * scale) / 2}px`
    })
  }
  addEventListener('resize', fit)
  fit()
  frame(0)
  if (mode === 'studio') return

  // Preview: plays in a loop; click or space to pause
  let playing = true
  let t = 0
  let last = performance.now()
  const toggle = () => { playing = !playing; last = performance.now() }
  addEventListener('click', toggle)
  addEventListener('keydown', (e) => { if (e.code === 'Space') { e.preventDefault(); toggle() } })
  const loop = (now) => {
    if (playing) {
      t = (t + (now - last) / 1000) % total
      frame(t)
    }
    last = now
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}
