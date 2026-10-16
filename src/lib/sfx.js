// Sound effects synthesized from noise and sine waves: no samples, no
// licenses, and the same seed always gives the same sound. All of them are
// non-tonal or low thumps: bells, pings and chimes read as cheap in a piece.
// Mono Float32Array normalized to ±1.

export const RATE = 48000

/** Small deterministic PRNG (mulberry32) */
export function random (seed = 1) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const noise = (seconds, seed) => {
  const next = random(seed)
  const out = new Float32Array(Math.round(seconds * RATE))
  for (let i = 0; i < out.length; i++) out[i] = next() * 2 - 1
  return out
}

const normalize = (x) => {
  let peak = 0
  for (const v of x) peak = Math.max(peak, Math.abs(v))
  if (peak > 0) for (let i = 0; i < x.length; i++) x[i] /= peak
  return x
}

/** State-variable band-pass whose centre sweeps from f0 to f1 (geometric) */
function sweep (x, f0, f1, q = 1.2) {
  const out = new Float32Array(x.length)
  let low = 0
  let band = 0
  for (let i = 0; i < x.length; i++) {
    const fc = f0 * Math.pow(f1 / f0, i / Math.max(1, x.length - 1))
    const f = 2 * Math.sin((Math.PI * Math.min(fc, RATE / 6)) / RATE)
    const high = x[i] - low - band / q
    band += f * high
    low += f * band
    out[i] = band
  }
  return out
}

/** One-pole band-ish filter: high-pass then low-pass */
function band (x, lo, hi) {
  const out = new Float32Array(x.length)
  const aHi = Math.exp((-2 * Math.PI * lo) / RATE)
  const aLo = Math.exp((-2 * Math.PI * hi) / RATE)
  let hpPrevIn = 0
  let hpPrevOut = 0
  let lp = 0
  for (let i = 0; i < x.length; i++) {
    const hp = aHi * (hpPrevOut + x[i] - hpPrevIn)
    hpPrevIn = x[i]
    hpPrevOut = hp
    lp = (1 - aLo) * hp + aLo * lp
    out[i] = lp
  }
  return out
}

const decay = (i, tau) => Math.exp(-i / RATE / tau)

/** Air moving past: filtered noise that rises and falls */
export function whoosh ({ duration = 0.6, from = 300, to = 4000, seed = 7 } = {}) {
  const x = sweep(noise(duration, seed), from, to)
  for (let i = 0; i < x.length; i++) x[i] *= Math.pow(Math.sin((Math.PI * i) / x.length), 1.6)
  return normalize(x)
}

/** A soft UI tap: a short click with a tiny tone */
export function tap ({ pitch = 1700, seed = 11 } = {}) {
  const n = Math.round(0.035 * RATE)
  const click = band(noise(0.035, seed), 2500, 7000)
  const x = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    x[i] = click[i] * decay(i, 0.003) * 0.6 + Math.sin((2 * Math.PI * pitch * i) / RATE) * decay(i, 0.007)
  }
  return normalize(x)
}

/** A bright tick, good for counters and letters landing */
export function tick ({ pitch = 2600, duration = 0.022, seed = 13 } = {}) {
  const x = band(noise(duration, seed), pitch * 0.7, pitch * 1.6)
  for (let i = 0; i < x.length; i++) x[i] *= decay(i, 0.004)
  return normalize(x)
}

/** A deep impact: a falling sine thump with a little noise on top */
export function impact ({ duration = 1.4, from = 62, to = 34, seed = 17 } = {}) {
  const n = Math.round(duration * RATE)
  const hiss = band(noise(duration, seed), 20, 2500)
  const x = new Float32Array(n)
  let phase = 0
  for (let i = 0; i < n; i++) {
    const t = i / RATE
    phase += (2 * Math.PI * (to + (from - to) * Math.exp(-t * 6))) / RATE
    x[i] = Math.tanh((Math.sin(phase) * Math.exp(-t * 2.8) + hiss[i] * Math.exp(-t * 28) * 0.7) * 1.8)
  }
  return normalize(x)
}

/** Tension that builds up to a cut */
export function riser ({ duration = 1, seed = 19 } = {}) {
  const x = sweep(noise(duration, seed), 250, 7000)
  for (let i = 0; i < x.length; i++) x[i] *= Math.pow(i / x.length, 2.2) * 0.8
  return normalize(x)
}

/** A heartbeat: a low double thump (lub-dub) repeated every `period` seconds */
export function heartbeat ({ beats = 2, period = 0.82, seed = 23 } = {}) {
  const n = Math.round((beats * period + 0.4) * RATE)
  const x = new Float32Array(n)
  const thump = (at, gain) => {
    const a = Math.round(at * RATE)
    for (let i = 0; i < Math.round(0.25 * RATE) && a + i < n; i++) x[a + i] += Math.sin((2 * Math.PI * 52 * i) / RATE) * decay(i, 0.045) * gain
  }
  for (let k = 0; k < beats; k++) { thump(k * period, 1); thump(k * period + 0.22, 0.7) }
  const air = band(noise(n / RATE, seed), 30, 200)
  for (let i = 0; i < n; i++) x[i] = Math.tanh((x[i] + air[i] * 0.04) * 1.4)
  return normalize(x)
}

/** A low tension drone that slowly breathes, for suspense under a scene */
export function drone ({ duration = 4, seed = 29 } = {}) {
  const n = Math.round(duration * RATE)
  const rumble = band(noise(duration, seed), 25, 180)
  const x = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / RATE
    const am = 0.75 + 0.25 * Math.sin(2 * Math.PI * 0.23 * t)
    const tones = Math.sin(2 * Math.PI * 49 * t) + 0.6 * Math.sin(2 * Math.PI * 73.5 * t) + 0.35 * Math.sin(2 * Math.PI * 98.3 * t)
    const edge = Math.min(1, t / 0.8, (duration - t) / 0.8)
    x[i] = (tones * 0.6 + rumble[i] * 0.8) * am * edge
  }
  return normalize(x)
}

/** A crowd clapping: many short band-passed claps per second */
export function applause ({ duration = 2.5, density = 90, seed = 31 } = {}) {
  const n = Math.round(duration * RATE)
  const x = new Float32Array(n)
  const next = random(seed)
  const clap = band(noise(0.03, seed + 1), 900, 5000)
  const count = Math.round(duration * density)
  for (let k = 0; k < count; k++) {
    const at = Math.round(next() * (n - clap.length))
    const gain = 0.4 + next() * 0.6
    for (let i = 0; i < clap.length; i++) x[at + i] += clap[i] * decay(i, 0.008) * gain
  }
  for (let i = 0; i < n; i++) x[i] *= Math.min(1, i / (0.25 * RATE), (n - i) / (0.6 * RATE))
  return normalize(x)
}

/** A soft pop for something appearing: a quick downward blip, no ring */
export function pop ({ seed = 37 } = {}) {
  const n = Math.round(0.09 * RATE)
  const air = band(noise(0.09, seed), 400, 3000)
  const x = new Float32Array(n)
  let phase = 0
  for (let i = 0; i < n; i++) {
    phase += (2 * Math.PI * (300 + 600 * Math.exp(-i / RATE / 0.012))) / RATE
    x[i] = Math.sin(phase) * decay(i, 0.018) * 0.7 + air[i] * decay(i, 0.006) * 0.4
  }
  return normalize(x)
}

/** A dry click, like a switch: noise only, no tone */
export function click ({ seed = 41 } = {}) {
  const x = band(noise(0.018, seed), 1800, 9000)
  for (let i = 0; i < x.length; i++) x[i] *= decay(i, 0.0025)
  return normalize(x)
}

/** A kick drum: a pitch-dropping thump, for hits on the beat */
export function kick ({ seed = 43 } = {}) {
  const n = Math.round(0.4 * RATE)
  const x = new Float32Array(n)
  const snap = band(noise(0.4, seed), 1000, 6000)
  let phase = 0
  for (let i = 0; i < n; i++) {
    const t = i / RATE
    phase += (2 * Math.PI * (45 + 105 * Math.exp(-t / 0.03))) / RATE
    x[i] = Math.tanh((Math.sin(phase) * Math.exp(-t / 0.16) + snap[i] * Math.exp(-t / 0.004) * 0.5) * 1.6)
  }
  return normalize(x)
}

/** A digital glitch: gated, bit-crushed noise bursts */
export function glitch ({ duration = 0.35, seed = 47 } = {}) {
  const n = Math.round(duration * RATE)
  const next = random(seed)
  const src = band(noise(duration, seed + 2), 200, 8000)
  const x = new Float32Array(n)
  let gate = 1
  let hold = 0
  let step = 1
  for (let i = 0; i < n; i++) {
    if (--hold <= 0) { gate = next() > 0.35 ? 1 : 0; hold = Math.round((0.008 + next() * 0.03) * RATE); step = 1 + Math.floor(next() * 12) }
    const v = src[i - (i % step)]
    x[i] = Math.round(v * 6) / 6 * gate
  }
  return normalize(x)
}

export const EFFECTS = { whoosh, tap, tick, impact, riser, heartbeat, drone, applause, pop, click, kick, glitch }
