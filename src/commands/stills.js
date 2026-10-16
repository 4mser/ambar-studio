// ambar stills: one HTML template → an image per item × size. Items come from
// a data file, sizes from the named SIZES table (post, story, ios, play, og…).
// Each shot is a fresh page at exactly the frame size (no clipping), raised by
// the page's own ready flag (runtime/stills.js), checked by the overflow guard
// and written to out/<template>/<size>/NN-<id>.<ext>. A template that declares
// a panorama is rendered once as one wide page and sliced into its frames.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, extname, join, relative, resolve } from 'node:path'
import { serve } from '../lib/server.js'
import { launch, open } from '../lib/headless.js'
import { overflowGuard, printIssues } from '../lib/audit.js'
import { quantize, stitch, webp } from '../lib/image.js'
import { run } from '../lib/ffmpeg.js'
import { has } from '../lib/pdf.js'
import { dim, done, step, warn } from '../lib/log.js'
import { SIZES, resolveSize, resolveSizes } from '../../runtime/sizes.js'
import { normalizeItems } from '../../runtime/stills.js'

export { SIZES, resolveSize, resolveSizes, normalizeItems }

const FORMATS = { png: 'png', png8: 'png', jpg: 'jpg', jpeg: 'jpg', webp: 'webp' }

/** <meta name="ambar:NAME" content="…"> in a template's source */
export function metaOf (html, name) {
  const tag = html.match(new RegExp(`<meta[^>]+name=["']ambar:${name}["'][^>]*>`, 'i'))?.[0]
  return tag?.match(/content=["']([^"']*)["']/i)?.[1] ?? null
}

/** The items a template renders: --data, then <meta name="ambar:data">, <name>.json, items.json */
export function loadItems (project, data) {
  const html = readFileSync(join(project.dir, project.entry), 'utf8')
  const name = basename(project.entry, extname(project.entry))
  const candidates = data
    ? [resolve(data)]
    : [metaOf(html, 'data'), `${name}.json`, 'items.json'].filter(Boolean).map((f) => join(project.dir, f))
  const file = candidates.find((f) => existsSync(f))
  if (data && !file) throw new Error(`No data file at ${data}`)
  return { file, items: normalizeItems(file ? JSON.parse(readFileSync(file, 'utf8')) : null) }
}

/** The page URL for one item at one size */
export function stillUrl (base, entry, item, size) {
  return `${base}/${entry}?item=${encodeURIComponent(item.id)}&size=${encodeURIComponent(size.name)}`
}

/** What a template sees as window.AMBAR_STILL before it loads */
export function stillContext (items, index, size, scale) {
  return {
    injected: true,
    item: items[index],
    items,
    index,
    count: items.length,
    size: size.name,
    width: size.width,
    height: size.height,
    safe: size.safe,
    scale
  }
}

const safeId = (id) => String(id).replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'item'
const fileName = (index, id, ext) => `${String(index + 1).padStart(2, '0')}-${safeId(id)}.${ext}`

async function shoot (page, file, format) {
  if (format === 'jpg') return page.screenshot({ path: file, type: 'jpeg', quality: 92 })
  if (format === 'webp' && !has('cwebp')) return page.screenshot({ path: file, type: 'webp', quality: 90 })
  const png = format === 'png' ? file : file.replace(/\.\w+$/, '.tmp.png')
  await page.screenshot({ path: png, type: 'png' })
  if (format === 'png8') { await quantize(png, file); rmSync(png) }
  if (format === 'webp') { webp(png, file, { quality: 90 }); rmSync(png) }
}

async function contactSheet (browser, tiles, file, size) {
  const landscape = size.width > size.height
  const columns = Math.min(tiles.length, landscape ? 3 : 6)
  const w = landscape ? 560 : 300
  const page = await browser.newPage()
  await page.setViewport({ width: columns * w + (columns + 1) * 20, height: 300 })
  const img = (f) => `data:image/${f.endsWith('.jpg') ? 'jpeg' : extname(f).slice(1)};base64,${readFileSync(f).toString('base64')}`
  await page.setContent(`<style>
    body { margin: 0; padding: 20px; background: #120a03; font: 600 14px ui-monospace, Menlo, monospace; color: #ffd27a; }
    .grid { display: grid; grid-template-columns: repeat(${columns}, ${w}px); gap: 20px; }
    figure { margin: 0; } img { width: 100%; display: block; border-radius: 6px; }
    figcaption { margin-top: 8px; } b { color: #ff6b5b; }
  </style><div class="grid">${tiles.map((t) => `<figure><img src="${img(t.file)}"><figcaption>${t.label}${t.problems ? ` <b>· ${t.problems} issue${t.problems > 1 ? 's' : ''}</b>` : ''}</figcaption></figure>`).join('')}</div>`, { waitUntil: 'load' })
  await page.screenshot({ path: file, fullPage: true })
  await page.close()
}

async function waitReady (page, errors) {
  try {
    await page.waitForFunction(() => window.AMBAR_STILL?.ready === true, { timeout: 30000 })
  } catch {
    throw new Error(`The still never became ready (does it call still() from /@ambar/runtime/stills.js?)${errors.length ? `\n  ${errors.join('\n  ')}` : ''}`)
  }
  return page.evaluate(() => ({ panorama: window.AMBAR_STILL.panorama ?? null, errors: window.AMBAR_STILL.errors ?? [] }))
}

/** Serves the template's folder and prints a preview URL per size (keeps running) */
export async function previewStills (project, { sizes, port = 0 } = {}) {
  const html = readFileSync(join(project.dir, project.entry), 'utf8')
  const list = resolveSizes(sizes ?? metaOf(html, 'sizes') ?? 'post')
  const { items } = loadItems(project)
  const server = await serve(project.dir, { port })
  step('Preview', 'arrow keys step through the items · &guides outlines the safe zone')
  for (const size of list) console.log(`  ${size.name.padEnd(9)} ${stillUrl(server.url, project.entry, items[0], size)}&guides`)
  return server
}

/**
 * Renders every item × size. Options: data (path), sizes ('post,story' or a
 * list), scale, format (png | jpg | webp | png8), sheet, only (an item id),
 * webp (also write a WebP at the size's width next to each image).
 * Returns { ok, files, issues }.
 */
export async function stills (project, { data, sizes, scale, format = 'png', sheet = false, only = null, webp: derive = false, quiet = false } = {}) {
  const ext = FORMATS[String(format).toLowerCase()]
  if (!ext) throw new Error(`Unknown format "${format}". Use png, jpg, webp or png8.`)
  const kind = String(format).toLowerCase() === 'jpeg' ? 'jpg' : String(format).toLowerCase()
  const html = readFileSync(join(project.dir, project.entry), 'utf8')
  const name = basename(project.entry, extname(project.entry))
  const list = resolveSizes(sizes ?? metaOf(html, 'sizes') ?? 'post')
  const { file: dataFile, items } = loadItems(project, data)
  if (only !== null && !items.some((i) => i.id === String(only))) throw new Error(`No item with id "${only}"`)
  if (!quiet) step('Stills', `${name} · ${items.length} item${items.length > 1 ? 's' : ''}${dataFile ? ` from ${relative(process.cwd(), dataFile)}` : ''} × ${list.map((s) => s.name).join(', ')}`)
  if (derive && !has('cwebp') && !quiet) warn('cwebp is not installed: no WebP derivatives (brew install webp)')

  const outRoot = join(project.outDir, name)
  const report = { ok: true, files: [], issues: [] }
  const add = (level, where, message) => report.issues.push({ level, where, message })
  const server = await serve(project.dir)
  const browser = await launch()
  try {
    for (const size of list) {
      const k = Number(scale ?? size.scale ?? 1)
      const dir = join(outRoot, size.name)
      if (only === null) rmSync(dir, { recursive: true, force: true })
      mkdirSync(dir, { recursive: true })
      const tiles = []
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (only !== null && item.id !== String(only)) continue
        const { page, errors } = await open(browser, stillUrl(server.url, project.entry, item, size), {
          width: size.width, height: size.height, scale: k, inject: { AMBAR_STILL: stillContext(items, i, size, k) }
        })
        const state = await waitReady(page, errors)
        if (state.panorama) {
          await panorama(page, { items, size, dir, ext, kind, only, tiles, add, errors: [...errors, ...state.errors], out: join(outRoot, `panorama-${size.name}.png`), count: state.panorama.count, files: report.files })
          await page.close()
          break
        }
        const where = `${size.name} ${item.id}`
        const before = report.issues.length
        for (const e of [...errors, ...state.errors]) add('error', where, e)
        for (const issue of await page.evaluate(overflowGuard, { frame: { left: 0, top: 0, right: size.width, bottom: size.height } })) add(issue.level, where, issue.message)
        const file = join(dir, fileName(i, item.id, ext))
        await shoot(page, file, kind)
        report.files.push(file)
        tiles.push({ file, label: `${String(i + 1).padStart(2, '0')} · ${item.id}`, problems: report.issues.length - before })
        await page.close()
      }
      if (derive && ext !== 'webp' && has('cwebp')) {
        for (const t of tiles) webp(t.file, t.file.replace(/\.\w+$/, '.webp'), { width: size.width })
      }
      if (sheet && tiles.length) await contactSheet(browser, tiles, join(outRoot, `sheet-${size.name}.png`), size)
      if (!quiet) done(size.name, `${relative(process.cwd(), dir)}/ (${tiles.length}) ${dim(`${size.width}×${size.height} @${k}x`)}`)
    }
  } finally {
    await browser.close()
    await server.close()
  }
  report.ok = !report.issues.some((i) => i.level === 'error')
  if (!quiet) {
    printIssues(report.issues, 14)
    if (sheet) console.log(`  ${dim('sheet')} ${relative(process.cwd(), outRoot)}/sheet-<size>.png`)
  }
  writeFileSync(join(outRoot, 'report.json'), JSON.stringify(report, null, 2))
  return report
}

// One wide page (count frames side by side) shot frame by frame: the viewport
// stays the size of one frame and the page scrolls by a frame width.
async function panorama (page, { items, size, dir, ext, kind, only, tiles, add, errors, out, count, files }) {
  const W = size.width
  for (const e of errors) add('error', `${size.name} panorama`, e)
  const seams = Array.from({ length: count - 1 }, (_, i) => (i + 1) * W)
  for (const issue of await page.evaluate(overflowGuard, { frame: { left: 0, top: 0, right: W * count, bottom: size.height }, seams })) add(issue.level, `${size.name} panorama`, issue.message)
  // slices are shot into a scratch folder, then kept, converted or dropped
  const tmp = join(dir, '.slices')
  mkdirSync(tmp, { recursive: true })
  const pngs = []
  for (let i = 0; i < count; i++) {
    const id = items[i]?.id ?? String(i + 1).padStart(2, '0')
    await page.evaluate((x) => new Promise((r) => {
      window.scrollTo(x, 0)
      // a page that cannot scroll is moved instead
      if (Math.abs(window.scrollX - x) > 0.5) document.body.style.transform = `translateX(${-x}px)`
      requestAnimationFrame(() => requestAnimationFrame(r))
    }), i * W)
    const png = join(tmp, fileName(i, id, 'png'))
    await page.screenshot({ path: png, type: 'png' })
    pngs.push(png)
  }
  await stitch(pngs, out, { direction: 'h' })
  for (let i = 0; i < count; i++) {
    const id = items[i]?.id ?? String(i + 1).padStart(2, '0')
    const file = join(dir, fileName(i, id, ext))
    if (only !== null && id !== String(only)) continue
    if (kind === 'jpg') await run1(pngs[i], file)
    else if (kind === 'png8') await quantize(pngs[i], file)
    else if (kind === 'webp') { if (!webp(pngs[i], file, { quality: 90 })) await run1(pngs[i], file) }
    else renameSync(pngs[i], file)
    files.push(file)
    tiles.push({ file, label: `${String(i + 1).padStart(2, '0')} · ${id}`, problems: 0 })
  }
  rmSync(tmp, { recursive: true, force: true })
}

// PNG → JPEG or WebP with ffmpeg (panorama slices are shot as PNG)
function run1 (src, out) {
  return run(['-i', src, ...(out.endsWith('.jpg') ? ['-q:v', '2'] : []), '-frames:v', '1', '-update', '1', out])
}
