import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import puppeteer from 'puppeteer'
import { loadProject } from '../src/lib/project.js'
import { capture } from '../src/commands/capture.js'
import { installClock } from '../src/lib/clock.js'
import { networkRules } from '../src/lib/network.js'

const APP = new URL('../examples/tutorial/app', import.meta.url)

/** A project folder with the Harbor demo app and the given capture.json */
function project (spec, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'ambar-record-'))
  cpSync(APP, join(dir, 'app'), { recursive: true })
  writeFileSync(join(dir, 'index.html'), '<!doctype html>')
  writeFileSync(join(dir, 'capture.json'), JSON.stringify(spec))
  for (const [name, text] of Object.entries(extra)) writeFileSync(join(dir, name), text)
  return dir
}
const meta = (dir, name) => JSON.parse(readFileSync(join(dir, 'captures', name, 'meta.json'), 'utf8'))
const frames = (dir, name) => readdirSync(join(dir, 'captures', name)).filter((f) => f.endsWith('.jpg')).sort()

// sign in: click the email field, type, press Sign in; the board shows 700 ms later (a timer)
const SIGN_IN = {
  name: 'signin',
  seconds: 1.5,
  settle: 0.2,
  actions: [
    { at: 0.1, click: '#email' },
    { at: 0.2, type: 'a@b.co', every: 1 },
    { at: 0.5, click: 'text=Sign in' },
    { at: 1.1, mark: 'waiting', boxes: { list: '#list' } },
    { at: 1.3, mark: 'board', boxes: { list: '#list' } }
  ]
}
const SMALL = { url: 'app/index.html', viewport: { width: 640, height: 420 }, scale: 1, now: '2026-03-14T10:00:00', timezone: 'UTC' }

test('the virtual clock fires timers in order and stays frozen between steps', { timeout: 60000 }, async () => {
  const browser = await puppeteer.launch({ headless: true })
  try {
    const page = await browser.newPage()
    await page.evaluateOnNewDocument(installClock, { now: '2026-03-14T10:00:00Z' })
    await page.goto('data:text/html,<p>clock</p>')
    await page.evaluate(() => {
      window.log = []
      setTimeout(() => log.push('b30'), 30)
      setTimeout(() => log.push('a10'), 10)
      setTimeout(() => log.push('c30'), 30)
      const id = setInterval(() => { log.push(`i${performance.now()}`); if (performance.now() >= 40) clearInterval(id) }, 20)
      requestAnimationFrame((t) => log.push(`raf${t}`))
      window.t0 = performance.now()
      window.d0 = Date.now()
    })
    await new Promise((resolve) => setTimeout(resolve, 150))
    const frozen = await page.evaluate(() => ({ log: [...log], dt: performance.now() - t0, dd: Date.now() - d0 }))
    assert.deepEqual(frozen, { log: [], dt: 0, dd: 0 })

    await page.evaluate(() => window.__ambarClock.step(25))
    assert.deepEqual(await page.evaluate(() => log), ['a10', 'i20', 'raf25'])
    await page.evaluate(() => window.__ambarClock.step(25))
    assert.deepEqual(await page.evaluate(() => log), ['a10', 'i20', 'raf25', 'b30', 'c30', 'i40'])
    await page.evaluate(() => window.__ambarClock.step(100))
    assert.equal(await page.evaluate(() => log.length), 6, 'a cleared interval does not fire again')
    assert.equal(await page.evaluate(() => new Date().toISOString()), '2026-03-14T10:00:00.150Z')
  } finally {
    await browser.close()
  }
})

test('a recording has one frame per 1/fps, its taps and the boxes of each mark', { timeout: 120000 }, async () => {
  const dir = project({ ...SMALL, recordings: [SIGN_IN] })
  try {
    await capture(loadProject(dir))
    const m = meta(dir, 'signin')
    assert.equal(m.frames, 45)
    assert.equal(frames(dir, 'signin').length, 45)
    assert.equal(frames(dir, 'signin')[0], '0001.jpg')
    assert.deepEqual(m.taps.map(([t]) => t), [0.1, 0.5])
    for (const [, x, y] of m.taps) assert.ok(x > 0 && x < 640 && y > 0 && y < 420)
    assert.deepEqual(m.marks, [[1.1, 'waiting'], [1.3, 'board']])
    // the 700 ms sign-in timer runs on virtual time: still waiting at 1.1 s, the board is there at 1.3 s
    assert.equal(m.boxes.waiting.boxes.list.w, 0)
    assert.ok(m.boxes.board.boxes.list.w > 0)
    assert.ok(m.firstChange > 0 && m.firstChange <= 0.2)
    const clips = JSON.parse(readFileSync(join(dir, 'captures', 'clips.json'), 'utf8'))
    assert.deepEqual(Object.keys(clips.clips), ['signin'])
    assert.equal(clips.viewport.width, 640)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('two recordings of the same flow are pixel-identical', { timeout: 120000 }, async () => {
  const flow = { ...SIGN_IN, seconds: 1.8, actions: [...SIGN_IN.actions.slice(0, 3), { at: 1.4, click: '#add' }] }
  const dir = project({ ...SMALL, recordings: [{ ...flow, name: 'one' }, { ...flow, name: 'two' }] })
  try {
    await capture(loadProject(dir))
    const one = frames(dir, 'one')
    assert.deepEqual(one, frames(dir, 'two'))
    const different = one.filter((f) => !readFileSync(join(dir, 'captures', 'one', f)).equals(readFileSync(join(dir, 'captures', 'two', f))))
    assert.deepEqual(different, [])
    // and the clip really moves: the spinner, the board and the dialog are all in it
    const unique = new Set(one.map((f) => readFileSync(join(dir, 'captures', 'one', f)).toString('base64')))
    assert.ok(unique.size > 10, `only ${unique.size} distinct frames`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('writes never leave the browser, and held responses wait for their cue', { timeout: 120000 }, async () => {
  const dir = project({}, {
    'slow.html': `<!doctype html><body style="margin:0;font:40px sans-serif"><p id="status">Loading…</p><script>
      fetch('data.json').then((r) => r.json()).then((d) => { document.getElementById('status').textContent = d.text })
    </script>`,
    'data.json': JSON.stringify({ text: 'Ready' })
  })
  // our own server: it counts every request that is not a read
  const writes = []
  const server = createServer((req, res) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) writes.push(`${req.method} ${req.url}`)
    const path = new URL(req.url, 'http://x').pathname
    try {
      const body = readFileSync(join(dir, path))
      res.writeHead(200, { 'content-type': path.endsWith('.html') ? 'text/html' : path.endsWith('.json') ? 'application/json' : 'text/plain' })
      res.end(body)
    } catch {
      res.writeHead(404)
      res.end()
    }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    writeFileSync(join(dir, 'capture.json'), JSON.stringify({
      ...SMALL,
      url: `${base}/app/index.html`,
      network: { hold: ['data\\.json'] },
      recordings: [
        { ...SIGN_IN, name: 'save', seconds: 2.4, actions: [...SIGN_IN.actions.slice(0, 3), { at: 1.4, click: '#add' }, { at: 1.6, type: 'Test', every: 1 }, { at: 2, click: '#save' }] },
        { name: 'held', url: `${base}/slow.html`, seconds: 1, settle: 0.2, actions: [{ at: 0.5, release: 'data\\.json' }] }
      ]
    }))
    await capture(loadProject(dir))
    assert.deepEqual(writes, [])
    assert.deepEqual(meta(dir, 'save').blocked, ['POST /app/api/tasks'])
    const held = meta(dir, 'held')
    assert.ok(held.firstChange >= 0.5 && held.firstChange <= 0.6, `the response landed at ${held.firstChange} s`)
  } finally {
    await new Promise((resolve) => server.close(resolve))
    rmSync(dir, { recursive: true, force: true })
  }
})

test('network rules only allow writes to a local demo server', () => {
  assert.throws(() => networkRules({ allowWrites: ['https://api.example.com/'] }), /local demo server/)
  assert.throws(() => networkRules({ block: 'none' }), /non-get/)
  assert.equal(networkRules({ allowWrites: ['http://localhost:8141/'] }).allowWrites.length, 1)
})
