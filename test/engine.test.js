import { test } from 'node:test'
import assert from 'node:assert/strict'
import { layoutCues, resolveTime } from '../src/lib/timeline.js'
import { EFFECTS, RATE } from '../src/lib/sfx.js'
import { encodeWav } from '../src/lib/wav.js'

test('cues follow each other with the gap, and honour pause and at', () => {
  const { cues, end } = layoutCues(
    [{ id: 'a' }, { id: 'b', pause: 1 }, { id: 'c', at: 20 }],
    { a: 2, b: 3, c: 1 },
    { lead: 0.5, gap: 0.5 }
  )
  assert.deepEqual(cues.a, { start: 0.5, duration: 2, end: 2.5 })
  assert.deepEqual(cues.b, { start: 4, duration: 3, end: 7 })
  assert.deepEqual(cues.c, { start: 20, duration: 1, end: 21 })
  assert.equal(end, 21)
})

test('times can be written relative to cues', () => {
  const cues = { intro: { start: 2, duration: 3, end: 5 } }
  assert.equal(resolveTime(1.5, cues), 1.5)
  assert.equal(resolveTime('intro', cues), 2)
  assert.equal(resolveTime('intro+0.4', cues), 2.4)
  assert.equal(resolveTime('intro - 0.5', cues), 1.5)
  assert.equal(resolveTime('intro.end+1', cues), 6)
  assert.throws(() => resolveTime('nope', cues), /Unknown cue/)
})

test('every effect is deterministic, normalized and finite', () => {
  for (const [name, make] of Object.entries(EFFECTS)) {
    const a = make({ seed: 3 })
    const b = make({ seed: 3 })
    assert.deepEqual(a, b, `${name} is deterministic`)
    let peak = 0
    for (const v of a) {
      assert.ok(Number.isFinite(v), `${name} has finite samples`)
      peak = Math.max(peak, Math.abs(v))
    }
    assert.ok(Math.abs(peak - 1) < 1e-6, `${name} peaks at 1`)
    assert.ok(a.length > RATE * 0.01, `${name} has sound`)
  }
})

test('the WAV writer produces a valid 16-bit stereo header', () => {
  const wav = encodeWav(new Float32Array([0, 0, 0.5, -0.5, 1, -1]), { rate: 48000 })
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF')
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE')
  assert.equal(wav.readUInt16LE(22), 2)
  assert.equal(wav.readUInt32LE(24), 48000)
  assert.equal(wav.readUInt32LE(40), 12)
  assert.equal(wav.readInt16LE(44 + 8), 32767)
  assert.equal(wav.readInt16LE(44 + 10), -32768)
})

test('a take is cut where the text says, not only at the longest pauses', async () => {
  const { pickCuts } = await import('../src/lib/audio.js')
  // three lines of 10, 10 and 20 words over 400 windows; the middle line has a long inner pause
  const runs = [{ from: 95, to: 105 }, { from: 140, to: 175 }, { from: 195, to: 205 }]
  const cuts = pickCuts(runs, 400, [10, 10, 20], 3)
  assert.deepEqual(cuts, [{ from: 95, to: 105 }, { from: 195, to: 205 }])
})
