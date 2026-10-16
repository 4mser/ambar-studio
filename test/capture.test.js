import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadProject } from '../src/lib/project.js'
import { capture } from '../src/commands/capture.js'

test('capture walks the app and records a box per named element', { timeout: 60000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ambar-capture-'))
  try {
    cpSync(new URL('../examples/tutorial/app', import.meta.url), join(dir, 'app'), { recursive: true })
    writeFileSync(join(dir, 'index.html'), '<!doctype html>')
    writeFileSync(join(dir, 'capture.json'), JSON.stringify({
      url: 'app/index.html',
      viewport: { width: 800, height: 600, scale: 1 },
      redact: ['[data-private]'],
      shots: [
        { name: 'login', boxes: { email: '#email' } },
        { name: 'board', actions: [{ click: '#signin' }, { waitFor: '#list' }], boxes: { list: '#list' } }
      ]
    }))
    await capture(loadProject(dir))
    const { viewport, shots } = JSON.parse(readFileSync(join(dir, 'captures', 'shots.json'), 'utf8'))
    assert.equal(viewport.width, 800)
    assert.deepEqual(Object.keys(shots), ['login', 'board'])
    assert.equal(shots.login.file, 'captures/login.png')
    for (const box of [shots.login.boxes.email, shots.board.boxes.list]) assert.ok(box.w > 0 && box.h > 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
