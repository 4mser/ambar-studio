import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chapterAt, wordsSpoken } from '../runtime/player.js'
import { playerData } from '../src/commands/embed.js'

const cues = { a: { start: 1, duration: 2, end: 3 }, b: { start: 4, duration: 4, end: 8 } }

test('playerData makes one chapter per line, or uses the chapters given, starting at 0', () => {
  const lines = [{ id: 'a', text: 'Hola mundo' }, { id: 'b', text: 'Uno dos tres cuatro', chapter: 'Dos' }]
  const auto = playerData({ lines }, cues, 10)
  assert.deepEqual(auto.chapters, [{ title: '', start: 0 }, { title: 'Dos', start: 4 }])
  assert.deepEqual(auto.captions[1], { text: 'Uno dos tres cuatro', start: 4, end: 8 })
  const given = playerData({ lines, chapters: [{ title: 'Inicio', at: 'a' }, { title: 'Fin', at: 'b.end-1' }] }, cues, 10)
  assert.deepEqual(given.chapters, [{ title: 'Inicio', start: 0 }, { title: 'Fin', start: 7 }])
})

test('chapterAt and wordsSpoken follow the time', () => {
  const chapters = [{ start: 0 }, { start: 4 }, { start: 9 }]
  assert.equal(chapterAt(chapters, 3.9), 0)
  assert.equal(chapterAt(chapters, 4), 1)
  assert.equal(chapterAt(chapters, 30), 2)
  const caption = { text: 'uno dos tres cuatro', start: 4, end: 8 }
  assert.equal(wordsSpoken(caption, 3), 0)
  assert.equal(wordsSpoken(caption, 5), 1)
  assert.equal(wordsSpoken(caption, 6.5), 3)
  assert.equal(wordsSpoken(caption, 9), 4)
})
