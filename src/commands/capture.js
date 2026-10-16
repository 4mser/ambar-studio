// ambar capture: walks through a web app with Puppeteer, following the steps in
// capture.json, and saves a screenshot per step plus the position of every
// element you name, so a screencast can point at them. Anything matching
// `redact` is blurred in the browser before the screenshot is taken: private
// data never reaches the PNG.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import puppeteer from 'puppeteer'
import { serve } from '../lib/server.js'
import { done, step } from '../lib/log.js'

const REDACT_CSS = (selectors) => `${selectors.join(',')} { filter: blur(7px) !important; }`

async function boxesOf (page, boxes = {}) {
  const out = {}
  for (const [key, selector] of Object.entries(boxes)) {
    const handle = await page.$(selector)
    if (!handle) throw new Error(`capture: "${selector}" (${key}) was not found on the page`)
    const b = await handle.boundingBox()
    out[key] = { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }
  }
  return out
}

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
  if (action.waitFor) return page.waitForSelector(action.waitFor, { timeout: 15000 })
  throw new Error(`capture: unknown action ${JSON.stringify(action)}`)
}

export async function capture (project, { config = 'capture.json' } = {}) {
  const file = join(project.dir, config)
  if (!existsSync(file)) throw new Error(`No ${config} in ${project.dir}`)
  const spec = JSON.parse(readFileSync(file, 'utf8'))
  const viewport = { width: 1440, height: 900, scale: 2, ...(spec.viewport ?? {}) }
  const outDir = join(project.dir, spec.out ?? 'captures')
  mkdirSync(outDir, { recursive: true })

  const server = /^https?:\/\//.test(spec.url) ? null : await serve(project.dir)
  const url = server ? `${server.url}/${spec.url}` : spec.url
  const browser = await puppeteer.launch({ headless: true, args: ['--font-render-hinting=none', '--hide-scrollbars'] })
  const page = await browser.newPage()
  await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: viewport.scale })
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 })
  if (spec.redact?.length) await page.addStyleTag({ content: REDACT_CSS(spec.redact) })

  step('Capture', `${spec.shots.length} shots · ${viewport.width}×${viewport.height} @${viewport.scale}x`)
  const shots = {}
  for (const shot of spec.shots) {
    for (const action of shot.actions ?? []) await act(page, action)
    // re-apply after navigations; a no-op otherwise
    if (spec.redact?.length) await page.addStyleTag({ content: REDACT_CSS(spec.redact) })
    await page.evaluate(() => document.fonts.ready)
    const png = join(outDir, `${shot.name}.png`)
    await page.screenshot({ path: png })
    shots[shot.name] = { file: `${relative(project.dir, outDir)}/${shot.name}.png`, boxes: await boxesOf(page, shot.boxes) }
    console.log(`  shot ${shot.name} · ${Object.keys(shots[shot.name].boxes).length} boxes`)
  }
  writeFileSync(join(outDir, 'shots.json'), JSON.stringify({ viewport, shots }, null, 2))
  await browser.close()
  await server?.close()
  done('Capture', `${relative(process.cwd(), outDir)}/shots.json`)
}
