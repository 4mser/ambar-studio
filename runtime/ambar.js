// AMBAR runtime. A composition is a page whose picture is a pure function of
// time: video({ setup, render }) registers render(t), and the renderer, the
// studio and the live preview all call it with any t, in any order.
//
// Everything above video() is plain math with no DOM, so it can be unit
// tested in Node.

// ── time ──────────────────────────────────────────────────────────────────

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
export const lerp = (a, b, k) => a + (b - a) * k

/** 0 → 1 while t goes from a to a + d */
export const progress = (t, a, d) => (d <= 0 ? (t >= a ? 1 : 0) : clamp((t - a) / d))

export const ease = {
  linear: (x) => x,
  in: (x) => x * x * x,
  out: (x) => 1 - Math.pow(1 - x, 3),
  inOut: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  outExpo: (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  inOutSine: (x) => -(Math.cos(Math.PI * x) - 1) / 2,
  outBack: (x) => {
    const c1 = 1.70158
    const c3 = c1 + 1
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2)
  },
  /** Critically damped-ish spring that settles at 1 */
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

/** Spans rise into place one after another from a, and drop away before b */
export function rise (spans, t, a, b = Infinity, step = 0.07, distance = 28) {
  spans.forEach((span, i) => {
    const k = ease.out(progress(t, a + i * step, 0.6))
    const o = Number.isFinite(b) ? ease.inOut(progress(t, b - 0.4, 0.4)) : 0
    css(span, {
      opacity: k * (1 - o),
      transform: `translateY(${(1 - k) * distance - o * distance * 0.55}px)`,
      filter: `blur(${(1 - k) * 8}px)`
    })
  })
}

/** An element fades up into place at a and away before b */
export function fadeUp (el, t, a, b = Infinity, distance = 30) {
  const k = ease.out(progress(t, a, 0.6))
  const o = Number.isFinite(b) ? ease.inOut(progress(t, b - 0.4, 0.4)) : 0
  return css(el, { opacity: k * (1 - o), transform: `translateY(${(1 - k) * distance}px)` })
}

/** Types text into el from a, at `rate` characters per second */
export function type (el, text, t, a, rate = 28) {
  const n = Math.floor(clamp((t - a) * rate, 0, text.length))
  el.textContent = text.slice(0, n)
  return n === text.length
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
 *   width, height, fps   output size and frame rate (1920×1080 @ 30 by default)
 *   duration             seconds; defaults to the narration end plus `tail`
 *   setup(ctx)           builds the DOM once; ctx = { stage, width, height, cues }
 *   render(t, ctx)       draws the frame at t; must depend on t only
 */
export async function video ({ width = 1920, height = 1080, fps = 30, duration, tail = 1.6, setup, render } = {}) {
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
  const ctx = { stage, width, height, fps, duration: total, cues: state.cues, mode }
  await setup?.(ctx)
  await document.fonts?.ready

  const frame = (t) => render(clamp(t, 0, total), ctx)
  window.AMBAR = { ready: true, width, height, fps, duration: total, cues: state.cues, render: frame, mode }

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
