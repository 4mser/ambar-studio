// ambar voice: one WAV per narration line, cached by its text and voice, and
// voice/timings.json with the cue of every line.
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { decodeAudio, run } from '../lib/ffmpeg.js'
import { writeWav } from '../lib/wav.js'
import { layoutCues } from '../lib/timeline.js'
import { done, step, dim } from '../lib/log.js'

const RATE = 48000
const GEMINI_MODEL = 'gemini-2.5-flash-preview-tts'

const fingerprint = (voice, text) =>
  createHash('sha1').update(JSON.stringify({ voice, text })).digest('hex').slice(0, 16)

/** macOS `say`: offline, no key, good enough for drafts */
async function sayProvider (text, voice, file) {
  const raw = join(tmpdir(), `ambar-${process.pid}-${Date.now()}.aiff`)
  const rate = Math.round(175 * (voice.speed ?? 1))
  const result = spawnSync('say', ['-v', voice.name ?? 'Samantha', '-r', String(rate), '-o', raw, text], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`say failed: ${result.stderr || 'is this macOS?'}`)
  await run(['-i', raw, '-ac', '2', '-ar', String(RATE), file])
  rmSync(raw, { force: true })
}

/** Gemini text-to-speech. Reads AMBAR_GEMINI_API_KEY, never any other key. */
async function geminiProvider (text, voice, file) {
  const key = process.env.AMBAR_GEMINI_API_KEY
  if (!key) throw new Error('Set AMBAR_GEMINI_API_KEY to use the gemini voice provider.')
  const prompt = voice.style ? `${voice.style}: ${text}` : text
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${voice.model ?? GEMINI_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice.name ?? 'Kore' } } }
        }
      })
    }
  )
  if (!response.ok) throw new Error(`Gemini TTS answered ${response.status}: ${(await response.text()).slice(0, 200)}`)
  const json = await response.json()
  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)
  if (!part) throw new Error('Gemini TTS returned no audio')
  const pcm = Buffer.from(part.inlineData.data, 'base64')
  const rate = Number(String(part.inlineData.mimeType).match(/rate=(\d+)/)?.[1] ?? 24000)
  await run(['-f', 's16le', '-ar', String(rate), '-ac', '1', '-i', 'pipe:0', '-ac', '2', '-ar', String(RATE), file], {
    input: (stdin) => stdin.end(pcm)
  })
}

const PROVIDERS = { say: sayProvider, gemini: geminiProvider }

/** Cuts leading and trailing silence, keeping a few ms of air */
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

export async function voice (project, { force = false } = {}) {
  const { config, voiceDir } = project
  const lines = config.lines ?? []
  mkdirSync(voiceDir, { recursive: true })
  if (!lines.length) {
    const empty = { cues: {}, end: 0 }
    writeFileSync(join(voiceDir, 'timings.json'), JSON.stringify(empty, null, 2))
    return empty
  }

  const provider = PROVIDERS[config.voice.provider]
  if (!provider) throw new Error(`Unknown voice provider "${config.voice.provider}" (use say or gemini)`)

  const manifestPath = join(voiceDir, 'manifest.json')
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {}
  const durations = {}
  step('Voice', `${config.voice.provider} · ${config.voice.name}`)

  for (const line of lines) {
    if (!line.id || !line.text) throw new Error('Every narration line needs an id and a text')
    const file = join(voiceDir, `${line.id}.wav`)
    const key = fingerprint(config.voice, line.text)
    if (force || manifest[line.id] !== key || !existsSync(file)) {
      await provider(line.text, config.voice, file)
      writeWav(file, trim(decodeAudio(file, { rate: RATE })), { rate: RATE })
      manifest[line.id] = key
      console.log(`  ${dim('rec')} ${line.id} ${dim(`«${line.text}»`)}`)
    }
    durations[line.id] = decodeAudio(file, { rate: RATE }).length / 2 / RATE
  }

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  const timings = layoutCues(lines, durations, { lead: config.lead, gap: config.gap })
  writeFileSync(join(voiceDir, 'timings.json'), JSON.stringify(timings, null, 2))
  done('Voice', `${lines.length} lines · narration ends at ${timings.end.toFixed(2)} s`)
  return timings
}
