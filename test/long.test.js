import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadProject } from '../src/lib/project.js'
import { doc, TILE } from '../src/commands/doc.js'
import { scanPdf } from '../src/lib/pdf.js'
import { pngSize } from '../src/lib/image.js'

test('a long page exports as one PDF page and one PNG of its full height', { timeout: 90000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ambar-long-'))
  try {
    // 7000 px: two full tiles and a short last one
    const H = TILE * 2 + 1000
    const bands = Array.from({ length: 7 }, (_, i) => `<div style="height:1000px; background:hsl(${i * 40} 70% 60%)"><h2 style="font-size:40px">Band ${i + 1}</h2></div>`).join('')
    writeFileSync(join(dir, 'tall.html'), `<!doctype html>
<link rel="stylesheet" href="/@ambar/runtime/ambar.css"><link rel="stylesheet" href="/@ambar/runtime/fonts.css">
<style>body { margin: 0; background: #fffaf2; color: #2b1a0b }</style>${bands}`)
    const result = await doc(loadProject(join(dir, 'tall.html')), { long: true, width: 400, png: true, scale: 1, quiet: true })
    assert.equal(result.height, H)
    const scan = scanPdf(result.pdf)
    assert.equal(scan.pages, 1)
    assert.deepEqual(scan.size, { width: 400 * 0.75, height: H * 0.75 })
    assert.deepEqual(pngSize(result.png), { width: 400, height: H })
    assert.ok(!existsSync(`${result.png}.tiles`), 'tiles are cleaned up')
    assert.ok(result.ok)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
