// ambar voice: records the narration and writes the timeline every scene and
// the mixer follow.
//
//   voice/<id>.wav         one file per line, trimmed, with long pauses shortened
//   voice/timings.json     the cue of every line, with its speaker, text and words
//   voice/envelope.json    how loud each line is, frame by frame (mascots talk with it)
//
// Lines can belong to different characters (`speaker`), each with its own
// voice. In "take" mode every character reads all of its lines in ONE take,
// which is then cut at the pauses: lines recorded one by one tend to sound like
// different people.
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { decodeAudio, run } from '../lib/ffmpeg.js'
import { writeWav } from '../lib/wav.js'
import { layoutCues } from '../lib/timeline.js'
import { capPauses, cutByPauses, envelope, estimateWords, toMono, toStereo } from '../lib/audio.js'
import { amber, done, step, dim } from '../lib/log.js'

const RATE = 48000
const FPS = 30
const GEMINI_MODEL = 'gemini-2.5-flash-preview-tts'
/** Appended to every Gemini prompt: read, do not perform or comment */
const EXACT = 'Read the text exactly, word for word, only once, without adding, removing or commenting anything, and without greeting or answering.'
/** The pace that sounded right in production; slow, "emotional" or "epic" read as robotic */
const PACE = 'Speak at a natural, relaxed conversational pace, like chatting with close friends, never slow or robotic.'

/** The voice of a line: the project voice, overridden by its speaker's */
export function voiceFor (config, line) {
  const own = line.speaker ? config.voices?.[line.speaker] : null
  if (line.speaker && !own) throw new Error(`Line "${line.id}" is spoken by "${line.speaker}", who has no entry in "voices"`)
  return { ...config.voice, ...(own ?? {}) }
}

/** What the voice says: `say` overrides the written text (pronunciation fixes stay out of subtitles) */
export function spoken (line) {
  const text = line.say ?? line.text
  // "…" hangs some TTS models or returns silence
  return text.replace(/…|\.{3}/g, '.').replace(/\s+/g, ' ').trim()
}

const fingerprint = (data) => createHash('sha1').update(JSON.stringify(data)).digest('hex').slice(0, 16)

/** Builds the Gemini prompt. 3.x TTS models read any instruction aloud, so they get the text alone. */
export function geminiPrompt (voice, text, { tone, take = false } = {}) {
  const model = [].concat(voice.model ?? GEMINI_MODEL)[0]
  if (/gemini-3/.test(model)) return text
  const parts = []
  if (voice.style) parts.push(voice.style.trim().replace(/\.?$/, '.'))
  if (tone) parts.push(`Tone of this line: ${tone.trim().replace(/\.?$/, '.')}`)
  if (voice.pace !== false) parts.push(PACE)
  parts.push(EXACT)
  if (take) parts.push('There are several lines, one per paragraph. Read them in order and leave a silence of about two seconds between one line and the next. Do not read anything else.')
  return `${parts.join(' ')}\n\n${text}`
}

/** macOS `say`: offline, no key, good enough for drafts */
async function sayProvider (text, voice, file) {
  const raw = join(tmpdir(), `ambar-${process.pid}-${Date.now()}.aiff`)
  const rate = Math.round(175 * (voice.speed ?? 1))
  const result = spawnSync('say', ['-v', voice.name ?? 'Samantha', '-r', String(rate), '-o', raw, text], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`say failed: ${result.stderr || 'is this macOS?'}`)
  await run(['-i', raw, '-ac', '2', '-ar', String(RATE), file])
  rmSync(raw, { force: true })
}

/** `say` reads a whole take with 2-second silences between lines */
async function sayTake (lines, voice, file) {
  await sayProvider(lines.map(spoken).join(' [[slnc 2000]] '), voice, file)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * The Gemini key: AMBAR_GEMINI_API_KEY, or else the macOS Keychain item
 * "ambar-gemini", so the key never has to sit in a file or a shell history.
 * Never any other key.
 */
function geminiKey () {
  if (process.env.AMBAR_GEMINI_API_KEY) return process.env.AMBAR_GEMINI_API_KEY
  if (process.platform === 'darwin') {
    const found = spawnSync('security', ['find-generic-password', '-s', 'ambar-gemini', '-w'], { encoding: 'utf8' })
    if (found.status === 0 && found.stdout.trim()) return found.stdout.trim()
  }
  throw new Error('No Gemini key. Set AMBAR_GEMINI_API_KEY, or on macOS store it once with:\n  security add-generic-password -a "$USER" -s ambar-gemini -w')
}

/** Gemini text-to-speech, with model fallback and retries */
async function geminiSpeak (prompt, voice, file) {
  const key = geminiKey()
  const models = [].concat(voice.model ?? GEMINI_MODEL)
  let last
  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const speechConfig = { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice.name ?? 'Kore' } } }
      if (voice.language) speechConfig.languageCode = voice.language
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig } })
      })
      if (response.ok) {
        const json = await response.json()
        const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)
        const pcm = part ? Buffer.from(part.inlineData.data, 'base64') : Buffer.alloc(0)
        const rate = Number(String(part?.inlineData?.mimeType).match(/rate=(\d+)/)?.[1] ?? 24000)
        if (pcm.length >= rate * 2 * 0.3) {
          await run(['-f', 's16le', '-ar', String(rate), '-ac', '1', '-i', 'pipe:0', '-ac', '2', '-ar', String(RATE), file], { input: (stdin) => stdin.end(pcm) })
          return
        }
        last = new Error(`${model} returned no audio`)
      } else {
        last = new Error(`Gemini TTS (${model}) answered ${response.status}: ${(await response.text()).slice(0, 200)}`)
        // quota or a bad request: the next model, not another attempt
        if (response.status === 429 || response.status === 400 || response.status === 404) break
      }
      await sleep(1500 * (attempt + 1))
    }
  }
  throw last
}

const PROVIDERS = {
  say: { line: (line, voice, file) => sayProvider(spoken(line), voice, file), take: sayTake },
  gemini: {
    line: (line, voice, file) => geminiSpeak(geminiPrompt(voice, spoken(line), { tone: line.tone }), voice, file),
    take: (lines, voice, file) => geminiSpeak(geminiPrompt(voice, lines.map(spoken).join('\n\n'), { take: true }), voice, file)
  }
}

/** Cuts leading and trailing silence, keeping a few ms of air (stereo in, stereo out) */
function trim (samples, threshold = 0.015) {
  const frames = samples.length / 2
  let peak = 0
  for (const v of samples) peak = Math.max(peak, Math.abs(v))
  const limit = peak * threshold * 2
  const loud = (i) => Math.abs(samples[i * 2]) + Math.abs(samples[i * 2 + 1]) > limit
  let a = 0
  while (a < frames && !loud(a)) a++
  let b = frames - 1
  while (b > a && !loud(b)) b--
  a = Math.max(0, a - Math.round(0.01 * RATE))
  b = Math.min(frames - 1, b + Math.round(0.12 * RATE))
  return samples.slice(a * 2, (b + 1) * 2)
}

/** Short fades at both ends: some takes stop dead after the last word */
function edges (mono) {
  const fin = Math.min(mono.length, Math.round(0.008 * RATE))
  const fout = Math.min(mono.length, Math.round(0.06 * RATE))
  for (let i = 0; i < fin; i++) mono[i] *= i / fin
  for (let i = 0; i < fout; i++) mono[mono.length - 1 - i] *= i / fout
  return mono
}

/** Final shape of a recorded line: trimmed, pauses capped, tempo, faded edges */
async function finish (file, voice) {
  let mono = toMono(trim(decodeAudio(file, { rate: RATE })))
  if (voice.maxPause !== null && voice.maxPause !== false) mono = capPauses(mono, RATE, { max: voice.maxPause ?? 0.32 })
  writeWav(file, toStereo(edges(mono)), { rate: RATE })
  const tempo = voice.tempo ?? 1
  if (Math.abs(tempo - 1) > 0.001) {
    if (tempo < 0.5 || tempo > 1.25) throw new Error(`tempo ${tempo} is out of range: keep it between 0.5 and 1.25 (1.15 at most sounds natural)`)
    const sped = `${file}.tempo.wav`
    await run(['-i', file, '-filter:a', `atempo=${tempo}`, '-ar', String(RATE), sped])
    writeWav(file, decodeAudio(sped, { rate: RATE }), { rate: RATE })
    rmSync(sped, { force: true })
  }
}

/** Groups lines for take mode: one take per speaker, in script order */
function takes (lines) {
  const groups = new Map()
  for (const line of lines) {
    const key = line.speaker ?? ''
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(line)
  }
  return [...groups.entries()]
}

export async function voice (project, { force = false, recut = false } = {}) {
  const { config, voiceDir } = project
  const lines = config.lines ?? []
  mkdirSync(voiceDir, { recursive: true })
  if (!lines.length) {
    const empty = { cues: {}, end: 0 }
    writeFileSync(join(voiceDir, 'timings.json'), JSON.stringify(empty, null, 2))
    return empty
  }
  for (const line of lines) {
    if (!line.id || !line.text) throw new Error('Every narration line needs an id and a text')
    if (/…|\.{3}/.test(line.say ?? line.text)) console.log(`  ${amber('!')} ${line.id}: "…" is read as a period (it can hang the voice)`)
  }

  const manifestPath = join(voiceDir, 'manifest.json')
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {}
  const mode = config.voice.mode ?? 'lines'
  step('Voice', `${config.voice.provider} · ${mode === 'take' ? 'one take per character' : 'line by line'}`)

  if (mode === 'take') {
    for (const [speaker, group] of takes(lines)) {
      const v = voiceFor(config, group[0])
      const provider = PROVIDERS[v.provider]
      if (!provider) throw new Error(`Unknown voice provider "${v.provider}" (use say or gemini)`)
      const key = fingerprint({ v, lines: group.map((l) => [l.id, spoken(l)]) })
      const takeFile = join(voiceDir, `take${speaker ? `-${speaker}` : ''}.wav`)
      const stale = force || group.some((l) => manifest[l.id] !== key || !existsSync(join(voiceDir, `${l.id}.wav`)))
      if (!stale && !recut) continue
      if (stale && !(recut && existsSync(takeFile))) {
        await provider.take(group, v, takeFile)
        console.log(`  ${dim('rec')} ${speaker || 'narrator'} ${dim(`· ${group.length} lines in one take`)}`)
      }
      const mono = toMono(decodeAudio(takeFile, { rate: RATE }))
      const pieces = cutByPauses(mono, RATE, group.length, { weights: group.map((l) => spoken(l).split(/\s+/).filter(Boolean).length) })
      group.forEach((line, k) => {
        writeWav(join(voiceDir, `${line.id}.wav`), toStereo(mono.slice(pieces[k].start, pieces[k].end)), { rate: RATE })
        manifest[line.id] = key
      })
      for (const line of group) await finish(join(voiceDir, `${line.id}.wav`), v)
    }
  } else {
    for (const line of lines) {
      const v = voiceFor(config, line)
      const provider = PROVIDERS[v.provider]
      if (!provider) throw new Error(`Unknown voice provider "${v.provider}" (use say or gemini)`)
      const file = join(voiceDir, `${line.id}.wav`)
      const key = fingerprint({ v, text: spoken(line), tone: line.tone })
      if (force || manifest[line.id] !== key || !existsSync(file)) {
        await provider.line(line, v, file)
        await finish(file, v)
        manifest[line.id] = key
        console.log(`  ${dim('rec')} ${line.id} ${dim(`«${spoken(line)}»`)}`)
      }
    }
  }

  // Durations, loudness envelope and estimated word timings from the final files
  const durations = {}
  const env = {}
  const words = {}
  for (const line of lines) {
    const mono = toMono(decodeAudio(join(voiceDir, `${line.id}.wav`), { rate: RATE }))
    durations[line.id] = mono.length / RATE
    env[line.id] = envelope(mono, RATE, { fps: FPS })
    // the words the viewer reads: `caption` replaces the text on screen (pronunciation lives in `say`)
    words[line.id] = estimateWords(line.caption ?? line.text, env[line.id], FPS)
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  const timings = layoutCues(lines, durations, { lead: config.lead, gap: config.gap })
  for (const line of lines) {
    const cue = timings.cues[line.id]
    cue.text = line.caption ?? line.text
    if (line.speaker) cue.speaker = line.speaker
    cue.words = words[line.id].map(([w, a, b]) => [w, round(cue.start + a), round(cue.start + b)])
  }
  writeFileSync(join(voiceDir, 'timings.json'), JSON.stringify(timings, null, 2))
  writeFileSync(join(voiceDir, 'envelope.json'), JSON.stringify({ fps: FPS, lines: env }))
  done('Voice', `${lines.length} lines · narration ends at ${timings.end.toFixed(2)} s`)
  return timings
}

const round = (x) => Math.round(x * 1000) / 1000

/** Words of a text, lowercased, without accents or punctuation */
export function tokens (text) {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean)
}

/** Words missing from and added to `heard`, compared to `expected` (LCS) */
export function compareWords (expected, heard) {
  const a = tokens(expected)
  const b = tokens(heard)
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const missing = []
  const extra = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++ } else if (dp[i + 1][j] >= dp[i][j + 1]) missing.push(a[i++])
    else extra.push(b[j++])
  }
  missing.push(...a.slice(i))
  extra.push(...b.slice(j))
  return { missing, extra }
}

/**
 * ambar voice --verify: transcribes every recorded line with Gemini, keeping
 * repetitions and stutters, and compares it with what the line should say.
 * A clean duration is not enough: live voices repeat words, swallow the last
 * syllable or switch accent.
 */
export async function verifyVoice (project) {
  const key = geminiKey()
  const { config, voiceDir } = project
  const problems = []
  step('Verify', `${(config.lines ?? []).length} lines`)
  for (const line of config.lines ?? []) {
    const file = join(voiceDir, `${line.id}.wav`)
    if (!existsSync(file)) { problems.push(`${line.id}: not recorded yet`); continue }
    const mp3 = `${file}.verify.mp3`
    await run(['-i', file, '-ac', '1', '-b:a', '64k', mp3])
    const audio = readFileSync(mp3).toString('base64')
    rmSync(mp3, { force: true })
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [
          { inlineData: { mimeType: 'audio/mpeg', data: audio } },
          { text: 'Transcribe this audio LITERALLY in its own language. Keep every repetition, stutter, extra word or instruction read aloud. Reply with the transcript only.' }
        ] }]
      })
    })
    if (!response.ok) throw new Error(`Gemini answered ${response.status}: ${(await response.text()).slice(0, 200)}`)
    const heard = (await response.json()).candidates?.[0]?.content?.parts?.map((p) => p.text).join(' ') ?? ''
    const { missing, extra } = compareWords(spoken(line), heard)
    const seconds = toMono(decodeAudio(file, { rate: RATE })).length / RATE
    const rate = tokens(spoken(line)).length / seconds
    const notes = []
    if (missing.length) notes.push(`missing: ${missing.join(' ')}`)
    if (extra.length) notes.push(`extra: ${extra.join(' ')}`)
    if (rate < 1.8) notes.push(`slow: ${rate.toFixed(1)} words/s`)
    console.log(`  ${notes.length ? amber('!') : dim('ok')} ${line.id} ${dim(`«${heard.trim()}»`)}`)
    for (const n of notes) problems.push(`${line.id}: ${n}`)
  }
  if (problems.length) {
    for (const p of problems) console.log(`  ${amber('!')} ${p}`)
    console.log('  Re-record with `ambar voice --force` or fix the line, then listen to it.')
  } else done('Verify', 'every line says what the script says')
  return problems
}
