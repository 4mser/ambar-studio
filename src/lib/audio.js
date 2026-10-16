// Audio analysis and editing on plain sample arrays: cutting one long take
// into lines, shortening long pauses, the loudness envelope that makes a
// mascot talk, an envelope follower for ducking, and where a sound effect
// hits. Pure functions, no I/O, so they are tested in Node.

/** Interleaved stereo → mono (average of both channels) */
export function toMono (stereo) {
  const out = new Float32Array(stereo.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = (stereo[i * 2] + stereo[i * 2 + 1]) / 2
  return out
}

/** Mono → interleaved stereo */
export function toStereo (mono) {
  const out = new Float32Array(mono.length * 2)
  for (let i = 0; i < mono.length; i++) out[i * 2] = out[i * 2 + 1] = mono[i]
  return out
}

/** Peak of |x| per window of `win` samples */
function windowPeaks (mono, win) {
  const n = Math.ceil(mono.length / win)
  const out = new Float32Array(n)
  for (let w = 0; w < n; w++) {
    let p = 0
    const end = Math.min(mono.length, (w + 1) * win)
    for (let i = w * win; i < end; i++) p = Math.max(p, Math.abs(mono[i]))
    out[w] = p
  }
  return out
}

/** Runs of quiet windows between voiced ones: [{ from, to }] in windows */
function silences (peaks, threshold) {
  const runs = []
  let start = -1
  let seenVoice = false
  for (let w = 0; w < peaks.length; w++) {
    const quiet = peaks[w] <= threshold
    if (quiet && start < 0 && seenVoice) start = w
    if (!quiet) {
      if (start >= 0) runs.push({ from: start, to: w })
      start = -1
      seenVoice = true
    }
  }
  return runs
}

/**
 * Cuts one take that reads `count` lines (with long pauses between them) into
 * `count` pieces. The count - 1 longest interior silences are the cuts; each
 * cut sits in the middle of its silence. Every piece is then trimmed to its
 * voice with a little air: 30 ms before, 120 ms after, so no consonant or last
 * syllable is lost.
 * Returns [{ start, end }] in samples.
 */
export function cutByPauses (mono, rate, count, { window = 0.02, threshold = 0.02 } = {}) {
  const win = Math.max(1, Math.round(window * rate))
  const peaks = windowPeaks(mono, win)
  let max = 0
  for (const p of peaks) max = Math.max(max, p)
  const limit = max * threshold
  const runs = silences(peaks, limit).sort((a, b) => (b.to - b.from) - (a.to - a.from)).slice(0, Math.max(0, count - 1))
  if (runs.length < count - 1) throw new Error(`The take has ${runs.length + 1} phrases separated by pauses, expected ${count}. Record it again or ask for longer pauses.`)
  const edges = [0, ...runs.sort((a, b) => a.from - b.from).map((r) => Math.round(((r.from + r.to) / 2) * win)), mono.length]
  const pieces = []
  for (let k = 0; k < count; k++) {
    let a = edges[k]
    let b = edges[k + 1]
    while (a < b && Math.abs(mono[a]) <= limit) a++
    while (b > a && Math.abs(mono[b - 1]) <= limit) b--
    pieces.push({ start: Math.max(edges[k], a - Math.round(0.03 * rate)), end: Math.min(edges[k + 1], b + Math.round(0.12 * rate)) })
  }
  return pieces
}

/**
 * Shortens every interior pause longer than `max` seconds down to `max`,
 * with a short crossfade at each join. Live voices tend to leave pauses of a
 * second or more inside a sentence, which makes a video feel slow.
 */
export function capPauses (mono, rate, { max = 0.32, window = 0.02, threshold = 0.02, fade = 0.01 } = {}) {
  const win = Math.max(1, Math.round(window * rate))
  const peaks = windowPeaks(mono, win)
  let peak = 0
  for (const p of peaks) peak = Math.max(peak, p)
  const keep = Math.round(max * rate)
  const xf = Math.max(1, Math.round(fade * rate))
  const cuts = silences(peaks, peak * threshold)
    .map((r) => ({ a: r.from * win, b: Math.min(mono.length, r.to * win) }))
    .filter((r) => r.b - r.a > keep + xf * 2)
  if (!cuts.length) return mono
  const parts = []
  let from = 0
  for (const { a, b } of cuts) {
    const mid = Math.round(keep / 2)
    parts.push([from, a + mid])
    from = b - (keep - mid)
  }
  parts.push([from, mono.length])
  const total = parts.reduce((n, [a, b]) => n + (b - a), 0) - xf * (parts.length - 1)
  const out = new Float32Array(total)
  let w = 0
  parts.forEach(([a, b], k) => {
    if (k === 0) {
      out.set(mono.subarray(a, b), 0)
      w = b - a
      return
    }
    // the first `xf` samples of each part fade over the last `xf` already written
    const at = w - xf
    for (let j = 0; j < xf; j++) {
      const g = j / xf
      out[at + j] = out[at + j] * (1 - g) + mono[a + j] * g
    }
    out.set(mono.subarray(a + xf, b), w)
    w += b - a - xf
  })
  return out
}

/**
 * Loudness envelope at `fps`, smoothed with a fast attack and a slow
 * release and normalized to its 95th percentile: 0 is silence, about 1 is
 * normal speech. Feeds a mascot's `habla` (talking) and subtitle timing.
 */
export function envelope (mono, rate, { fps = 30, attack = 0.55, release = 0.18 } = {}) {
  const hop = Math.max(1, Math.round(rate / fps))
  const n = Math.ceil(mono.length / hop)
  const rms = new Float32Array(n)
  for (let f = 0; f < n; f++) {
    let s = 0
    const end = Math.min(mono.length, (f + 1) * hop)
    for (let i = f * hop; i < end; i++) s += mono[i] * mono[i]
    rms[f] = Math.sqrt(s / Math.max(1, end - f * hop))
  }
  const sorted = [...rms].sort((a, b) => a - b)
  const ref = sorted[Math.floor(sorted.length * 0.95)] || 1e-9
  const out = []
  let v = 0
  for (const x of rms) {
    const target = Math.min(1.2, x / ref)
    v += (target - v) * (target > v ? attack : release)
    out.push(Math.round(v * 1000) / 1000)
  }
  return out
}

/**
 * Splits a line's words over the time the voice actually sounds, in
 * proportion to their length. Not a forced alignment, but close enough to
 * highlight the word being said in a subtitle.
 * Returns [[word, start, end]] in seconds from the start of the line.
 */
export function estimateWords (text, env, fps, { threshold = 0.3 } = {}) {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const voiced = []
  for (let f = 0; f < env.length; f++) if (env[f] > threshold) voiced.push(f)
  if (!voiced.length) return words.map((w) => [w, 0, 0])
  // the frames where the voice sounds, shared out by word length: each word
  // starts where the previous one ends, so they never overlap
  const weight = words.map((w) => w.replace(/[^\p{L}\p{N}]/gu, '').length + 1)
  const total = weight.reduce((a, b) => a + b, 0)
  const at = (share) => voiced[Math.min(voiced.length - 1, Math.floor(share * voiced.length))]
  const sec = (frame) => Math.round((frame / fps) * 1000) / 1000
  const out = []
  let acc = 0
  for (let i = 0; i < words.length; i++) {
    const a = at(acc / total)
    acc += weight[i]
    const b = i === words.length - 1 ? voiced[voiced.length - 1] + 1 : at(acc / total)
    out.push([words[i], sec(a), sec(Math.max(a, b))])
  }
  return out
}

/**
 * Envelope follower over a 0..1 activity signal, per sample: rises in
 * `attack` seconds, falls in `release`. The music ducks by this.
 */
export function follow (activity, rate, { attack = 0.035, release = 0.4 } = {}) {
  const up = 1 - Math.exp(-1 / (attack * rate))
  const down = 1 - Math.exp(-1 / (release * rate))
  const out = new Float32Array(activity.length)
  let v = 0
  for (let i = 0; i < activity.length; i++) {
    const x = activity[i]
    v += (x - v) * (x > v ? up : down)
    out[i] = v
  }
  return out
}

/** Index of the loudest sample: where a sound effect hits */
export function transient (mono) {
  let at = 0
  let peak = 0
  for (let i = 0; i < mono.length; i++) {
    const v = Math.abs(mono[i])
    if (v > peak) { peak = v; at = i }
  }
  return at
}

/** Gentle tanh saturation: unity gain for quiet signals, never above 1/drive */
export function softClip (bus, drive = 1.1) {
  for (let i = 0; i < bus.length; i++) bus[i] = Math.tanh(bus[i] * drive) / drive
  return bus
}
