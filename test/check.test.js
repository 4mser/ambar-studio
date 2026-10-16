import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadProject } from '../src/lib/project.js'
import { check, kindOf, sampleTimes } from '../src/commands/check.js'

test('kindOf tells videos, decks and documents apart', () => {
  assert.equal(kindOf('<script src="/@ambar/runtime/slides.js">'), 'deck')
  assert.equal(kindOf('<link href="/@ambar/runtime/doc.css">'), 'doc')
  assert.equal(kindOf('<script type="module">video({})</script>'), 'video')
})

test('sampleTimes looks inside every narration line and near the end', () => {
  const times = sampleTimes(10, { a: { start: 1, duration: 2, end: 3 }, b: { start: 5, duration: 1, end: 6 } })
  assert.deepEqual(times, [2.2, 5.6, 9.6])
  assert.deepEqual(sampleTimes(8), [2, 4, 6, 7.6])
})

test('check catches text off the frame, a missing cue and a render that keeps state', { timeout: 60000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ambar-check-'))
  try {
    writeFileSync(join(dir, 'ambar.json'), JSON.stringify({ lines: [{ id: 'hello', text: 'Hello' }] }))
    writeFileSync(join(dir, 'index.html'), `<!doctype html>
<link rel="stylesheet" href="/@ambar/runtime/ambar.css">
<div id="stage"><h1 id="off" style="position:absolute;left:1700px;top:400px;font-size:90px;white-space:nowrap">Far too wide</h1></div>
<script type="module">
  import { video, cue, $ } from '/@ambar/runtime/ambar.js'
  let frames = 0
  video({ duration: 4, render (t) {
    cue('goodbye', 2)
    $('#off').style.opacity = 1
    $('#stage').style.background = 'rgb(' + (frames++ % 255) + ',0,0)'
  } })
</script>`)
    const result = await check(loadProject(dir), { json: true })
    const messages = result.issues.map((i) => i.message).join('\n')
    assert.equal(result.ok, false)
    assert.match(messages, /"Far too wide" runs off the frame/)
    assert.match(messages, /cue\('goodbye'\) has no line/)
    assert.match(messages, /render\(t\) keeps state/)
    assert.match(messages, /content covers only/)
    assert.ok(existsSync(join(dir, 'out', 'check', 'sheet.png')))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
