import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { paper, pdfReport, scanPdf, usesCanvas } from '../src/lib/pdf.js'
import { loadProject } from '../src/lib/project.js'
import { doc } from '../src/commands/doc.js'
import { slides } from '../src/commands/slides.js'

// A tiny PDF, written by hand: two pages, one Type 3 font, one soft mask
function fixture ({ type3 = true, smask = true, compressed = false } = {}) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> /ExtGState << /G1 6 0 R >> >> >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>',
    `<< /Type /Font /Subtype /${type3 ? 'Type3' : 'TrueType'} /Name /F1 >>`,
    `<< /Type /ExtGState /SMask ${smask ? '7 0 R' : '/None'} >>`
  ]
  let body = '%PDF-1.4\n'
  if (compressed) {
    // fonts and states hidden in a compressed object stream, as some writers do
    const inner = deflateSync(Buffer.from(objects.slice(4).join('\n')))
    objects.length = 4
    body += objects.map((o, i) => `${i + 1} 0 obj\n${o}\nendobj\n`).join('')
    return Buffer.concat([Buffer.from(`${body}9 0 obj\n<< /Type /ObjStm /N 2 /Filter /FlateDecode /Length ${inner.length} >>\nstream\n`, 'latin1'), inner, Buffer.from('\nendstream\nendobj\n%%EOF\n', 'latin1')])
  }
  body += objects.map((o, i) => `${i + 1} 0 obj\n${o}\nendobj\n`).join('')
  return Buffer.from(`${body}%%EOF\n`, 'latin1')
}

test('scanPdf counts pages, Type 3 fonts and soft masks', () => {
  assert.deepEqual(scanPdf(fixture()), { pages: 2, type3: 1, smask: 1, size: { width: 612, height: 792 } })
  const clean = scanPdf(fixture({ type3: false, smask: false }))
  assert.equal(clean.type3, 0)
  assert.equal(clean.smask, 0, '/SMask /None is not a mask')
})

test('scanPdf reads compressed object streams', () => {
  const scan = scanPdf(fixture({ compressed: true }))
  assert.equal(scan.type3, 1)
  assert.equal(scan.smask, 1)
})

test('pdfReport warns on Type 3, soft masks and a page count that does not match', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ambar-pdf-'))
  try {
    const file = join(dir, 'f.pdf')
    writeFileSync(file, fixture())
    const messages = pdfReport(file, { expectPages: 3 }).issues.map((i) => i.message).join('\n')
    assert.match(messages, /Type 3/)
    assert.match(messages, /soft mask/)
    assert.match(messages, /2 pages for 3 sheets/)
    writeFileSync(file, fixture({ type3: false, smask: false }))
    assert.deepEqual(pdfReport(file, { expectPages: 2 }).issues, [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('paper sizes and canvas detection', () => {
  assert.deepEqual(paper('letter').px, [816, 1056])
  assert.equal(paper('A5').width, '148mm')
  assert.throws(() => paper('tabloid'), /Unknown paper/)
  assert.ok(usesCanvas('<canvas id="c"></canvas>'))
  assert.ok(usesCanvas("document.createElement('canvas')"))
  assert.ok(!usesCanvas('<p>no</p>'))
})

const STATIC = '<link rel="stylesheet" href="/@ambar/runtime/ambar.css"><link rel="stylesheet" href="/@ambar/runtime/fonts.css"><link rel="stylesheet" href="/@ambar/runtime/doc.css">'

test('doc: static fonts print clean on the paper asked for; a halo and a clipped page are reported', { timeout: 90000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ambar-doc-'))
  try {
    writeFileSync(join(dir, 'clean.html'), `<!doctype html>${STATIC}
<section class="page"><h1>Clean</h1><p>Static fonts, no shadows.</p></section>
<section class="page"><h2>Two</h2><p style="box-shadow: 0 4px 20px #000">A shadow removed for print.</p></section>`)
    const clean = await doc(loadProject(join(dir, 'clean.html')), { paper: 'letter', quiet: true })
    const scan = scanPdf(clean.pdf)
    assert.equal(scan.pages, 2)
    assert.equal(scan.type3, 0)
    assert.equal(scan.smask, 0)
    assert.deepEqual(scan.size, { width: 612, height: 792 })
    assert.ok(clean.ok)
    assert.ok(clean.issues.some((i) => i.level === 'info' && /shadows removed/.test(i.message)))

    writeFileSync(join(dir, 'dirty.html'), `<!doctype html>${STATIC}
<section class="page">
  <svg viewBox="0 0 400 100" width="400" height="100"><text x="10" y="50" font-size="20" stroke="#fff" stroke-width="6" paint-order="stroke">Halo label</text></svg>
  <p style="font-family: 'Plex Mono'; font-weight: 700">Faked bold</p>
  <div style="height: 30px; overflow: hidden; width: 200px"><p>One two three four five six seven eight nine ten eleven twelve</p></div>
</section>`)
    const dirty = await doc(loadProject(join(dir, 'dirty.html')), { quiet: true })
    const messages = dirty.issues.map((i) => i.message).join('\n')
    assert.equal(dirty.ok, false)
    assert.match(messages, /stroked text/)
    assert.match(messages, /"Plex Mono" has no weight 700/)
    assert.match(messages, /clips <p> "One two three/)
    assert.match(messages, /Type 3/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('slides: a slide whose content leaves it is an error, and the PDF has a page per slide', { timeout: 90000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ambar-slides-'))
  try {
    writeFileSync(join(dir, 'deck.html'), `<!doctype html>
<link rel="stylesheet" href="/@ambar/runtime/ambar.css"><link rel="stylesheet" href="/@ambar/runtime/fonts.css"><link rel="stylesheet" href="/@ambar/runtime/slides.css">
<section class="slide"><h1>Fine</h1></section>
<section class="slide"><h1 style="position:absolute; left:1500px; white-space:nowrap">Too far right</h1></section>
<script type="module">import { deck } from '/@ambar/runtime/slides.js'; deck({ width: 1920, height: 1080 })</script>`)
    const result = await slides(loadProject(join(dir, 'deck.html')), { png: true, quiet: true })
    assert.equal(scanPdf(result.pdf).pages, 2)
    assert.equal(result.pngs.length, 2)
    assert.equal(result.ok, false)
    assert.ok(result.issues.some((i) => i.where === 'slide 2' && /"Too far right" leaves the frame/.test(i.message)))
    assert.ok(!result.issues.some((i) => i.where === 'slide 1'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
