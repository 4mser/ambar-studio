import { test } from 'node:test'
import assert from 'node:assert/strict'
import { capPauses, cutByPauses, envelope, estimateWords, follow, softClip, transient } from '../src/lib/audio.js'
import { compareWords, geminiPrompt, spoken, tokens, voiceFor } from '../src/commands/voice.js'

const RATE = 8000

/** A "voice": a 220 Hz tone with a soft envelope, `seconds` long */
const tone = (seconds) => {
  const out = new Float32Array(Math.round(seconds * RATE))
  for (let i = 0; i < out.length; i++) out[i] = 0.6 * Math.sin((2 * Math.PI * 220 * i) / RATE) * Math.min(1, i / 80, (out.length - i) / 80)
  return out
}
const silence = (seconds) => new Float32Array(Math.round(seconds * RATE))
const join = (...parts) => {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) { out.set(p, at); at += p.length }
  return out
}

test('one take is cut into its lines at the longest pauses', () => {
  // three phrases; the middle one has a short breath inside that must NOT be a cut
  const take = join(silence(0.3), tone(1), silence(2), tone(0.6), silence(0.25), tone(0.6), silence(2.2), tone(0.8), silence(0.4))
  const pieces = cutByPauses(take, RATE, 3)
  assert.equal(pieces.length, 3)
  const seconds = pieces.map((p) => (p.end - p.start) / RATE)
  assert.ok(Math.abs(seconds[0] - 1.15) < 0.06, `first ${seconds[0]}`)
  assert.ok(Math.abs(seconds[1] - 1.6) < 0.06, `second keeps its breath: ${seconds[1]}`)
  assert.ok(Math.abs(seconds[2] - 0.95) < 0.06, `third ${seconds[2]}`)
  assert.throws(() => cutByPauses(take, RATE, 5), /expected 5/)
})

test('long pauses inside a line are shortened, short ones are kept', () => {
  const line = join(tone(0.5), silence(1.4), tone(0.5), silence(0.2), tone(0.5))
  const out = capPauses(line, RATE, { max: 0.3 })
  const expected = 0.5 + 0.3 + 0.5 + 0.2 + 0.5 - 0.01
  assert.ok(Math.abs(out.length / RATE - expected) < 0.05, `${out.length / RATE} ≈ ${expected}`)
  assert.equal(capPauses(tone(1), RATE).length, RATE)
})

test('the envelope is silent in silence and about 1 while speaking', () => {
  const env = envelope(join(silence(1), tone(1), silence(1)), RATE, { fps: 30 })
  assert.equal(env.length, 90)
  assert.ok(env[10] < 0.05)
  assert.ok(env[50] > 0.8 && env[50] < 1.25)
  assert.ok(env[70] < env[50] && env[70] > 0, 'it falls slowly after the voice stops')
})

test('words are spread over the voiced time in order', () => {
  const env = envelope(join(silence(0.5), tone(2), silence(0.5)), RATE, { fps: 30 })
  const words = estimateWords('Hola, este es un ejemplo largo', env, 30)
  assert.equal(words.length, 6)
  for (let i = 0; i < words.length; i++) {
    assert.ok(words[i][1] <= words[i][2])
    if (i) assert.ok(words[i][1] >= words[i - 1][1])
  }
  assert.ok(words[0][1] >= 0.45 && words[5][2] <= 2.75)
  for (let i = 1; i < words.length; i++) assert.ok(words[i][1] >= words[i - 1][2] - 1e-9, 'words do not overlap')
  assert.ok(words[5][2] - words[5][1] > words[3][2] - words[3][1], 'a longer word gets more time')
})

test('the follower rises fast and falls slowly', () => {
  const activity = new Float32Array(RATE).fill(1, 0, RATE / 2)
  const f = follow(activity, RATE, { attack: 0.03, release: 0.4 })
  assert.ok(f[Math.round(0.1 * RATE)] > 0.95)
  assert.ok(f[Math.round(0.6 * RATE)] > 0.7, 'still high 100 ms after the voice stops')
  assert.ok(f[RATE - 1] < f[Math.round(0.6 * RATE)])
})

test('transient finds the hit and softClip keeps the master under 1', () => {
  const hit = join(silence(0.2), new Float32Array([0.2, 0.9, -0.95, 0.4]), silence(0.1))
  assert.equal(transient(hit), Math.round(0.2 * RATE) + 2)
  const bus = softClip(new Float32Array([0, 0.5, 2, -3]))
  for (const v of bus) assert.ok(Math.abs(v) < 1)
  assert.ok(bus[1] > 0.44 && bus[1] < 0.5, 'quiet signals keep their level')
})

test('voices per character, pronunciation and prompts', () => {
  const config = { voice: { provider: 'gemini', name: 'Sulafat', style: 'A warm narrator' }, voices: { sol: { name: 'Leda', style: 'A cheerful little mascot' } } }
  assert.equal(voiceFor(config, { id: 'a' }).name, 'Sulafat')
  assert.equal(voiceFor(config, { id: 'b', speaker: 'sol' }).name, 'Leda')
  assert.equal(voiceFor(config, { id: 'b', speaker: 'sol' }).provider, 'gemini')
  assert.throws(() => voiceFor(config, { id: 'c', speaker: 'nadie' }), /no entry in "voices"/)
  assert.equal(spoken({ text: 'NGINX te espera…', say: 'Engine X te espera...' }), 'Engine X te espera.')
  const prompt = geminiPrompt(config.voice, 'Hola.', { tone: 'whispering' })
  assert.match(prompt, /A warm narrator\. Tone of this line: whispering\./)
  assert.match(prompt, /natural, relaxed conversational pace/)
  assert.match(prompt, /word for word/)
  assert.ok(prompt.endsWith('\n\nHola.'))
  assert.equal(geminiPrompt({ ...config.voice, model: 'gemini-3.1-flash-tts-preview' }, 'Hola.'), 'Hola.', '3.x models read instructions aloud')
  assert.match(geminiPrompt(config.voice, 'a\n\nb', { take: true }), /silence of about two seconds/)
})

test('a transcript is compared word by word with the script', () => {
  assert.deepEqual(tokens('¡Hola, Cómo estás!'), ['hola', 'como', 'estas'])
  assert.deepEqual(compareWords('Abre el panel de ventas', 'Abre el el panel de ventas'), { missing: [], extra: ['el'] })
  assert.deepEqual(compareWords('Abre el panel de ventas', 'Abre el panel'), { missing: ['de', 'ventas'], extra: [] })
})

test('music lines its hit up with a moment of the video', async () => {
  const { musicPlacement, tapeSpeed } = await import('../src/commands/mix.js')
  const cues = { reveal: { start: 6, duration: 2, end: 8 } }
  assert.deepEqual(musicPlacement({ hit: 15.25, at: 'reveal' }, cues), { from: 9.25, delay: 0 })
  assert.deepEqual(musicPlacement({ hit: 2, at: 5 }, cues), { from: 0, delay: 3 })
  assert.deepEqual(musicPlacement({ start: 4 }, cues), { from: 4, delay: 0 })
  assert.equal(tapeSpeed(1, 2), 1)
  assert.ok(tapeSpeed(2.2, 2) < 1 && tapeSpeed(2.2, 2) > 0)
  assert.equal(tapeSpeed(2.5, 2), 0)
})
