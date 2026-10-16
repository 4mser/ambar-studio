// Tests for captions: block planning (sizes, punctuation breaks, timings,
// joins), word and block opacity, and the talking amplitude window.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planCaptions, activeCaption, captionOpacity, wordOpacity, talk } from '../runtime/captions.js'

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`)

/** A cue with evenly timed words from `start`, 0.3 s each */
function cueOf (text, start, extra = {}) {
  const words = text.split(' ').map((w, i) => [w, start + i * 0.3, start + i * 0.3 + 0.25])
  return { text, start, end: words[words.length - 1][2], words, ...extra }
}

test('blocks hold at most two lines of at most maxChars', () => {
  const text = 'Cada cuadro es una función del tiempo, así que cualquier momento se dibuja exactamente igual en cualquier orden y tantas veces como quieras sin sorpresas.'
  const plan = planCaptions({ intro: cueOf(text, 1) }, { maxChars: 36 })
  assert.ok(plan.length >= 3)
  for (const block of plan) {
    assert.ok(block.lines.length <= 2)
    for (const line of block.lines) assert.ok(line.map((w) => w.text).join(' ').length <= 36, line.map((w) => w.text).join(' '))
  }
  assert.equal(plan.flatMap((b) => b.lines.flat().map((w) => w.text)).join(' '), text, 'no word lost or reordered')
})

test('a block that is already 45% full breaks at punctuation', () => {
  const plan = planCaptions([cueOf('Primero eliges el período del cierre, después revisas los pendientes.', 0, { id: 'a' })], { maxChars: 36 })
  assert.equal(plan[0].lines.flat().at(-1).text, 'cierre,')
  const short = planCaptions([cueOf('Hola, mundo.', 0, { id: 'b' })], { maxChars: 36 })
  assert.equal(short.length, 1, 'a short block does not break at its first comma')
})

test('timings: lead, fades, joins and speaker', () => {
  const plan = planCaptions({
    a: cueOf('Uno dos tres.', 1, { speaker: 'ambar' }),
    b: cueOf('Cuatro cinco.', 6, { speaker: 'nico' })
  })
  const [a, b] = plan
  near(a.start, 1 - 0.15)
  near(a.end, a.last + 0.2)
  assert.equal(a.speaker, 'ambar')
  assert.equal(b.speaker, 'nico')
  assert.equal(captionOpacity(a, a.start), 0)
  assert.equal(captionOpacity(a, a.start + 0.2), 1)
  assert.equal(captionOpacity(a, a.end), 0)
  assert.equal(activeCaption(plan, 1.5), a)
  assert.equal(activeCaption(plan, 5), null)
  assert.equal(activeCaption(plan, 6.1), b)
  const word = a.lines[0][0]
  near(wordOpacity(word, word.start - 1), 0.3)
  near(wordOpacity(word, word.start + 0.05), 0.65)
  near(wordOpacity(word, word.start + 0.1), 1)
})

test('blocks that nearly touch swap in place without fading', () => {
  const long = 'uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince dieciséis'
  const plan = planCaptions([cueOf(long, 0, { id: 'a' })], { maxChars: 20 })
  assert.ok(plan.length >= 2)
  assert.equal(plan[0].joinNext, true)
  assert.equal(plan[1].joinPrev, true)
  near(plan[0].end, plan[1].start)
  assert.equal(captionOpacity(plan[1], plan[1].start), 1)
})

test('cues without words spread their text over the cue', () => {
  const plan = planCaptions({ a: { text: 'Hola mundo otra vez', start: 2, end: 4 } })
  const words = plan[0].lines.flat()
  near(words[0].start, 2)
  near(words.at(-1).end, 4)
  assert.equal(words.length, 4)
})

test('talk smooths the envelope with a 7-tap triangular window, only for the speaker', () => {
  const values = Array.from({ length: 30 }, (_, i) => (i === 10 ? 1.2 : 0))
  const envelope = { fps: 10, lines: { a: values, b: values } }
  const cues = { a: { start: 1, end: 4, speaker: 'ambar' }, b: { start: 5, end: 8, speaker: 'nico' } }
  near(talk(2, envelope, cues), (4 * 1.2 / 16) * 0.9)
  near(talk(2.1, envelope, cues), (3 * 1.2 / 16) * 0.9)
  near(talk(2.4, envelope, cues), 0)
  near(talk(2, envelope, cues, 'ambar'), (4 * 1.2 / 16) * 0.9)
  assert.equal(talk(2, envelope, cues, 'nico'), 0)
  assert.ok(talk(6, envelope, cues, 'nico') > 0)
  assert.equal(talk(4.5, envelope, cues), 0)
  assert.equal(talk(2, null, cues), 0)
  const loud = { fps: 10, lines: { a: Array(30).fill(1.2) } }
  assert.equal(talk(2, loud, cues), 1, 'clamped to 1')
})
