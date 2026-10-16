// ambar capture: walks through a web app with Puppeteer, following capture.json.
//   shots       a still per step plus the position of every element you name
//               → captures/<shot>.png + captures/shots.json
//   recordings  the app in motion, frame by frame on a virtual clock, with
//               scripted taps, typing, scrolls and drags
//               → captures/<name>/0001.jpg… + meta.json, and captures/clips.json
// Anything matching `redact` is blurred in the browser before a frame is
// taken: private data never reaches an image. Writes never leave the browser
// (see src/lib/network.js), and every page gets a fixed `now` and time zone.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import puppeteer from 'puppeteer'
import { serve } from '../lib/server.js'
import { networkRules } from '../lib/network.js'
import { preparePage, record } from '../lib/record.js'
import { dim, done, step } from '../lib/log.js'

const LAUNCH = ['--font-render-hinting=none', '--disable-lcd-text', '--hide-scrollbars', '--disable-smooth-scrolling']
const LOOPBACK = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//

async function act (page, action) {
  if (action.goto) return page.goto(new URL(action.goto, page.url()).href, { waitUntil: 'networkidle0' })
  if (action.click) return page.click(action.click)
  if (action.hover) return page.hover(action.hover)
  if (action.type) {
    await page.click(action.type, { clickCount: 3 })
    return page.type(action.type, String(action.text ?? ''))
  }
  if (action.scroll) return page.evaluate((y) => window.scrollTo(0, y), action.scroll)
  if (action.wait) return new Promise((r) => setTimeout(r, action.wait))
  if (action.waitFor) return page.waitForSelector(action.waitFor, { visible: true, timeout: 15000 })
  throw new Error(`capture: unknown action ${JSON.stringify(action)}`)
}

async function boxesOf (page, boxes = {}, fullPage = false) {
  const out = {}
  const dy = fullPage ? await page.evaluate(() => Math.round(scrollY)) : 0
  for (const [key, selector] of Object.entries(boxes)) {
    const handle = await page.$(selector)
    if (!handle) throw new Error(`capture: "${selector}" (${key}) was not found on the page`)
    const b = await handle.boundingBox()
    if (!b) throw new Error(`capture: "${selector}" (${key}) is not visible`)
    out[key] = { x: Math.round(b.x), y: Math.round(b.y) + dy, w: Math.round(b.width), h: Math.round(b.height) }
  }
  return out
}

/** The settings of one page or recording: capture.json defaults, then its own */
export function settingsFor (spec, own = {}, { dir, base }) {
  const o = { ...spec, ...own }
  const viewport = { width: 1440, height: 900, ...(spec.viewport ?? {}), ...(own.viewport ?? {}) }
  const target = /^https?:\/\//.test(o.url) ? o.url : `${base}/${o.url}`
  return {
    ...o,
    target,
    viewport,
    scale: own.scale ?? own.viewport?.scale ?? spec.scale ?? viewport.scale ?? 2,
    fps: o.fps ?? 30,
    quality: o.quality ?? 90,
    safeArea: o.safeArea === false ? null : o.safeArea ?? (viewport.mobile ? { top: 47, bottom: 34 } : null),
    redact: [...(spec.redact ?? []), ...(own === spec ? [] : own.redact ?? [])],
    rules: networkRules({ ...(spec.network ?? {}), ...(own.network ?? {}), hold: [...(spec.network?.hold ?? []), ...(own.network?.hold ?? [])] }, dir)
  }
}

async function captureShots (browser, spec, { dir, base, outDir }) {
  const o = settingsFor(spec, spec, { dir, base })
  const { context, page } = await preparePage(browser, o, { frozen: false })
  await page.goto(o.target, { waitUntil: 'networkidle0', timeout: 60000 })
  step('Capture', `${spec.shots.length} shots · ${o.viewport.width}×${o.viewport.height} @${o.scale}x`)
  const shots = {}
  for (const shot of spec.shots) {
    for (const action of shot.actions ?? []) await act(page, action)
    await page.evaluate(() => { window.__ambarClock?.keepStyle(); return document.fonts.ready })
    const png = join(outDir, `${shot.name}.png`)
    await page.screenshot({ path: png, fullPage: Boolean(shot.fullPage) })
    shots[shot.name] = { file: `${relative(dir, outDir)}/${shot.name}.png`, boxes: await boxesOf(page, shot.boxes, shot.fullPage) }
    if (shot.fullPage) shots[shot.name].height = await page.evaluate(() => document.documentElement.scrollHeight)
    console.log(`  shot ${shot.name} · ${Object.keys(shots[shot.name].boxes).length} boxes`)
  }
  const { width, height } = o.viewport
  writeFileSync(join(outDir, 'shots.json'), JSON.stringify({ viewport: { width, height, scale: o.scale }, shots }, null, 2))
  await context.close()
  done('Capture', `${relative(process.cwd(), outDir)}/shots.json`)
}

export async function capture (project, { config = 'capture.json', only = null } = {}) {
  const file = join(project.dir, config)
  if (!existsSync(file)) throw new Error(`No ${config} in ${project.dir}`)
  const spec = JSON.parse(readFileSync(file, 'utf8'))
  const outDir = join(project.dir, spec.out ?? 'captures')
  mkdirSync(outDir, { recursive: true })
  const wanted = only ? new Set(String(only).split(',').map((s) => s.trim()).filter(Boolean)) : null
  const recordings = (spec.recordings ?? []).filter((r) => !wanted || wanted.has(r.name))
  if (wanted) for (const name of wanted) if (!recordings.some((r) => r.name === name)) throw new Error(`capture: no recording named "${name}" in ${config}`)
  for (const r of recordings) {
    if (!r.name || !/^[\w-]+$/.test(r.name)) throw new Error(`capture: every recording needs a "name" made of letters, digits, - or _ (got ${JSON.stringify(r.name)})`)
    if (!(r.seconds > 0)) throw new Error(`capture: recording "${r.name}" needs "seconds"`)
  }

  const urls = [spec.url, ...recordings.map((r) => r.url)].filter(Boolean)
  if (!urls.length) throw new Error(`capture: ${config} needs a "url"`)
  for (const u of urls) {
    if (/^https?:\/\//.test(u) && !LOOPBACK.test(u)) console.log(dim(`  capturing ${new URL(u).host}: a demo or staging environment only, never production`))
  }
  const server = urls.some((u) => !/^https?:\/\//.test(u)) ? await serve(project.dir) : null
  const launch = (extra = []) => puppeteer.launch({ headless: true, args: [...LAUNCH, ...extra] })
  const browser = await launch()
  try {
    if (spec.shots?.length && !wanted) await captureShots(browser, spec, { dir: project.dir, base: server?.url, outDir })

    if (recordings.length) {
      const index = join(outDir, 'clips.json')
      const previous = existsSync(index) ? JSON.parse(readFileSync(index, 'utf8')).clips ?? {} : {}
      const names = new Set((spec.recordings ?? []).map((r) => r.name))
      const clips = Object.fromEntries(Object.entries(previous).filter(([name]) => names.has(name)))
      for (const r of recordings) {
        const o = { ...settingsFor(spec, r, { dir: project.dir, base: server?.url }), name: r.name, dirRel: relative(project.dir, outDir) }
        step('Record', `${r.name} · ${r.seconds} s · ${o.viewport.width}×${o.viewport.height} @${o.scale}x · ${o.fps} fps${o.mode === 'realtime' ? ' · real time' : ''}`)
        const meta = await record(browser, o, { outDir, launch })
        clips[r.name] = meta
        const blocked = meta.blocked.length ? ` · ${meta.blocked.length} write${meta.blocked.length > 1 ? 's' : ''} blocked` : ''
        console.log(`  ${meta.frames} frames · ${meta.taps.length} taps · first change at ${meta.firstChange ?? '—'} s${blocked}`)
      }
      const first = clips[(spec.recordings ?? [])[0]?.name] ?? Object.values(clips)[0]
      writeFileSync(index, JSON.stringify({ viewport: first.viewport, scale: first.scale, clips }, null, 2))
      done('Record', `${relative(process.cwd(), index)}`)
    }
  } finally {
    await browser.close()
    await server?.close()
  }
}
