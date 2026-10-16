// ambar mix: narration on its cues, music that ducks under the voice, and
// synthesized sound effects, into out/mix.wav.
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { decodeAudio } from '../lib/ffmpeg.js'
import { writeWav } from '../lib/wav.js'
import { EFFECTS, RATE } from '../lib/sfx.js'
import { resolveTime } from '../lib/timeline.js'
import { done, step } from '../lib/log.js'

/** Adds interleaved stereo (or mono, to both channels) at `at` seconds */
function place (bus, samples, at, gain = 1, mono = false) {
  const start = Math.round(at * RATE) * 2
  if (mono) {
    for (let i = 0; i < samples.length; i++) {
      const j = start + i * 2
      if (j < 0 || j + 1 >= bus.length) continue
      bus[j] += samples[i] * gain
      bus[j + 1] += samples[i] * gain
    }
    return
  }
  for (let i = 0; i < samples.length; i++) {
    const j = start + i
    if (j >= 0 && j < bus.length) bus[j] += samples[i] * gain
  }
}

/** Moving average of a 0/1 activity track (prefix sums: O(n)) */
function smooth (activity, window) {
  const prefix = new Float64Array(activity.length + 1)
  for (let i = 0; i < activity.length; i++) prefix[i + 1] = prefix[i] + activity[i]
  const half = Math.floor(window / 2)
  const out = new Float32Array(activity.length)
  for (let i = 0; i < activity.length; i++) {
    const a = Math.max(0, i - half)
    const b = Math.min(activity.length, i + half)
    out[i] = (prefix[b] - prefix[a]) / Math.max(1, b - a)
  }
  return out
}

export async function mix (project, duration) {
  const { config, voiceDir, outDir, dir } = project
  const frames = Math.ceil(duration * RATE)
  const timingsPath = join(voiceDir, 'timings.json')
  const timings = existsSync(timingsPath) ? JSON.parse(readFileSync(timingsPath, 'utf8')) : { cues: {} }
  const cues = timings.cues ?? {}
  step('Mix', `${duration.toFixed(1)} s`)

  // Narration, and where it speaks (for ducking)
  const voice = new Float32Array(frames * 2)
  const speaking = new Float32Array(frames)
  for (const line of config.lines ?? []) {
    const cue = cues[line.id]
    const file = join(voiceDir, `${line.id}.wav`)
    if (!cue || !existsSync(file)) continue
    const samples = decodeAudio(file, { rate: RATE })
    place(voice, samples, cue.start, line.gain ?? 1)
    const a = Math.round(cue.start * RATE)
    speaking.fill(1, Math.max(0, a), Math.min(frames, a + samples.length / 2))
  }

  // Music under the voice
  const music = new Float32Array(frames * 2)
  if (config.music?.file) {
    const m = config.music
    const samples = decodeAudio(resolve(dir, m.file), { rate: RATE, start: m.start ?? 0, duration: duration + 1 })
    const duck = smooth(speaking, Math.round(0.25 * RATE))
    const fadeIn = Math.round((m.fadeIn ?? 1.2) * RATE)
    const fadeOut = Math.round((m.fadeOut ?? 2.5) * RATE)
    for (let i = 0; i < frames && i * 2 + 1 < samples.length; i++) {
      let g = (m.gain ?? 0.6) * (1 - (config.duck ?? 0.55) * Math.min(1, duck[i] * 1.4))
      if (i < fadeIn) g *= i / fadeIn
      if (i > frames - fadeOut) g *= Math.pow((frames - i) / fadeOut, 1.3)
      music[i * 2] = samples[i * 2] * g
      music[i * 2 + 1] = samples[i * 2 + 1] * g
    }
  }

  // Sound effects
  const effects = new Float32Array(frames * 2)
  for (const sfx of config.sfx ?? []) {
    const make = EFFECTS[sfx.type]
    if (!make) throw new Error(`Unknown sound effect "${sfx.type}" (${Object.keys(EFFECTS).join(', ')})`)
    const { type, at, gain = 0.2, repeat = 1, every = 0.2, ...params } = sfx
    for (let k = 0; k < repeat; k++) {
      place(effects, make({ ...params, seed: (params.seed ?? 7) + k }), resolveTime(at, cues) + k * every, gain, true)
    }
  }

  const bus = new Float32Array(frames * 2)
  for (let i = 0; i < bus.length; i++) bus[i] = voice[i] + music[i] + effects[i] * 0.9
  let peak = 0
  for (const v of bus) peak = Math.max(peak, Math.abs(v))
  if (peak > 0.97) for (let i = 0; i < bus.length; i++) bus[i] *= 0.97 / peak

  mkdirSync(outDir, { recursive: true })
  const file = join(outDir, 'mix.wav')
  writeWav(file, bus, { rate: RATE })
  done('Mix', file.replace(`${dir}/`, ''))
  return file
}
