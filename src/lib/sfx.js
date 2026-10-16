// Sound effects synthesized from noise and sine waves: no samples, no
// licenses, and the same seed always gives the same sound. Mono Float32Array
// normalized to ±1.

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

export const EFFECTS = { whoosh, tap, tick, impact, riser }
