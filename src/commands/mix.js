// ambar mix: narration on its cues, music that ducks under the voice, and
// sound effects, into out/mix.wav.
//
// The music can be lined up so a hit in the track lands on a moment of the
// story (`hit` + `at`), cut dead or stopped like tape at a moment (`stop`),
// and it ducks under the voice with an envelope follower (fast attack, slow
// release). Effects are synthesized or read from files; files land on their
// loudest point, so the transient falls exactly on the animation event.
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { decodeAudio } from '../lib/ffmpeg.js'
import { writeWav } from '../lib/wav.js'
import { EFFECTS, RATE } from '../lib/sfx.js'
import { resolveTime } from '../lib/timeline.js'
import { follow, softClip, toMono, transient } from '../lib/audio.js'
import { done, step } from '../lib/log.js'
import { ROOT } from '../lib/server.js'

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

/**
 * Where the track starts in the video and from which second of the file.
 * With `hit` (a second of the track) and `at` (a time or cue in the video),
 * the track is offset so that hit lands on at. Music should start at frame 0:
 * if the hit is too early for that, the track starts later and we say so.
 */
export function musicPlacement (music, cues = {}) {
  let from = music.start ?? 0
  let delay = 0
  if (music.hit !== undefined && music.at !== undefined) {
    const at = resolveTime(music.at, cues)
    from = music.hit - at
    if (from < 0) { delay = -from; from = 0 }
  }
  return { from, delay }
}

/**
 * Speed of the track at video time t for a tape stop at `at` over `length`:
 * 1 before, slowing to 0 with an ease, silent after.
 */
export function tapeSpeed (t, at, length = 0.45) {
  if (t < at) return 1
  if (t >= at + length) return 0
  return Math.pow(1 - (t - at) / length, 1.4)
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
    const { from, delay } = musicPlacement(m, cues)
    if (delay > 0.05) console.log(`  the track starts ${delay.toFixed(2)} s into the video to line up its hit: music usually reads better from frame 0`)
    // "@ambar/music/inspired.mp3" is a track of AMBAR's own library (music/)
    const file = m.file.startsWith('@ambar/') ? join(ROOT, m.file.slice('@ambar/'.length)) : resolve(dir, m.file)
    const samples = decodeAudio(file, { rate: RATE, start: from, duration: duration + 2 })
    const duck = follow(speaking, RATE, { attack: m.attack ?? 0.035, release: m.release ?? 0.4 })
    const fadeIn = Math.round((m.fadeIn ?? 0.6) * RATE)
    const fadeOut = Math.round((m.fadeOut ?? 2.5) * RATE)
    const stop = m.stop ? { at: resolveTime(m.stop.at ?? m.stop, cues), style: m.stop.style ?? 'cut', length: m.stop.length ?? 0.45 } : null
    const start = Math.round(delay * RATE)
    let pos = 0 // read position in the track (frames), advances by the tape speed
    for (let i = start; i < frames; i++) {
      const t = i / RATE
      let speed = 1
      let g = (m.gain ?? 0.6) * (1 - (config.duck ?? 0.55) * Math.min(1, duck[i] * 1.2))
      if (i - start < fadeIn) g *= Math.pow((i - start) / fadeIn, 2)
      if (i > frames - fadeOut) g *= Math.pow((frames - i) / fadeOut, 1.5)
      if (stop) {
        if (stop.style === 'tape') speed = tapeSpeed(t, stop.at, stop.length)
        else g *= t < stop.at ? 1 : Math.max(0, 1 - (t - stop.at) / 0.03) // a dead cut, 30 ms so it does not click
        if (speed === 0 || (stop.style !== 'tape' && t > stop.at + 0.03)) break
      }
      const f = Math.floor(pos)
      const k = pos - f
      if (f * 2 + 3 >= samples.length) break
      music[i * 2] = (samples[f * 2] * (1 - k) + samples[f * 2 + 2] * k) * g
      music[i * 2 + 1] = (samples[f * 2 + 1] * (1 - k) + samples[f * 2 + 3] * k) * g
      pos += speed
    }
  }

  // Sound effects: synthesized by name, or a file placed on its loudest point
  const effects = new Float32Array(frames * 2)
  for (const sfx of config.sfx ?? []) {
    const { type, file, at, gain = 0.2, repeat = 1, every = 0.2, align = 'peak', ...params } = sfx
    let make
    let lead = 0
    if (file) {
      const mono = toMono(decodeAudio(resolve(dir, file), { rate: RATE }))
      lead = align === 'peak' ? transient(mono) / RATE : 0
      make = () => mono
    } else {
      if (!EFFECTS[type]) throw new Error(`Unknown sound effect "${type}" (${Object.keys(EFFECTS).join(', ')}) — or give a "file"`)
      make = (k) => EFFECTS[type]({ ...params, seed: (params.seed ?? 7) + k })
    }
    for (let k = 0; k < repeat; k++) place(effects, make(k), resolveTime(at, cues) + k * every - lead, gain, true)
  }

  const bus = new Float32Array(frames * 2)
  for (let i = 0; i < bus.length; i++) bus[i] = voice[i] + music[i] + effects[i] * 0.9
  softClip(bus)
  let peak = 0
  for (const v of bus) peak = Math.max(peak, Math.abs(v))
  if (peak > 0) for (let i = 0; i < bus.length; i++) bus[i] *= 0.9 / peak

  mkdirSync(outDir, { recursive: true })
  const out = join(outDir, 'mix.wav')
  writeWav(out, bus, { rate: RATE })
  done('Mix', out.replace(`${dir}/`, ''))
  return out
}
