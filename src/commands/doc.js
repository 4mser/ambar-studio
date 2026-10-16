// ambar doc: an HTML document → PDF, plus an optional PNG of every page.
// Sheets (<section class="page">) and flowing content (<main class="flow">)
// print on A4, Letter or A5. With --long the whole page becomes one long PDF
// page (an infographic meant to scroll) and, with --png, one tall PNG shot in
// 3000 px tiles and stitched, since a single shot would pass Chrome's texture
// limit. Every PDF is audited before (shadows, fonts, canvases, overflowing
// sheets) and scanned after (Type 3 fonts, soft masks, page count).
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { basename, extname, join, relative } from 'node:path'
import { serve } from '../lib/server.js'
import { addStyle, launch, open, settle } from '../lib/headless.js'
import { overflowGuard, printIssues } from '../lib/audit.js'
import { paper as paperSize, pdfReport, preparePrint, usesCanvas } from '../lib/pdf.js'
import { pngSize, stitch } from '../lib/image.js'
import { done, step } from '../lib/log.js'

export const TILE = 3000

// A long page grows with its content, at the width it is exported at
const unbound = (W) => `:root { --long-w: ${W}px; } html, body { height: auto !important; min-height: 0 !important; overflow: visible !important; }`

/**
 * Options: png, scale (PNG pixel ratio), paper ('a4' | 'letter' | 'a5'),
 * long, width (long page width in CSS px), quiet.
 * Returns { ok, pdf, png | pngs, pages, issues }.
 */
export async function doc (project, opts = {}) {
  const server = await serve(project.dir)
  const browser = await launch()
  try {
    return opts.long ? await longPage(project, server, browser, opts) : await sheets(project, server, browser, opts)
  } finally {
    await browser.close()
    await server.close()
  }
}

function finish (result, quiet) {
  result.ok = !result.issues.some((i) => i.level === 'error')
  if (!quiet) printIssues(result.issues)
  return result
}

async function sheets (project, server, browser, { png = false, scale = 2, paper, quiet = false }) {
  const name = basename(project.entry, extname(project.entry))
  const html = readFileSync(join(project.dir, project.entry), 'utf8')
  const canvas = usesCanvas(html)
  const url = `${server.url}/${project.entry}?print`
  const declared = html.match(/<html[^>]*\sdata-paper=["']?(\w+)/i)?.[1]
  const sheet = paperSize(paper ?? declared ?? 'a4')
  const [pw, ph] = sheet.px
  const issues = []

  // PDF: at 1.5x when canvases are drawn (sharp enough, a fraction of the size)
  const { page, errors } = await open(browser, url, { width: pw, height: ph, scale: canvas ? 1.5 : 2 })
  await page.evaluate((p) => { document.documentElement.dataset.paper = p }, sheet.name)
  await settle(page)
  const prep = await preparePrint(page)
  await addStyle(page, `@page { size: ${sheet.width} ${sheet.height}; }`)
  const { count, flow } = await page.evaluate(() => ({ count: document.querySelectorAll('.page').length, flow: Boolean(document.querySelector('.flow')) }))
  for (let i = 0; i < count; i++) {
    for (const issue of await page.evaluate(overflowGuard, { selector: '.page', index: i })) issues.push({ ...issue, where: `page ${i + 1}` })
  }
  for (const issue of prep.issues) issues.push({ ...issue, where: 'print' })
  for (const e of errors) issues.push({ level: 'error', where: 'page', message: e })

  const outDir = join(project.dir, 'out')
  mkdirSync(outDir, { recursive: true })
  const pdf = join(outDir, `${name}.pdf`)
  await page.pdf({ path: pdf, printBackground: true, preferCSSPageSize: true })
  await page.close()
  const report = pdfReport(pdf, { expectPages: flow || !count ? null : count })
  for (const issue of report.issues) issues.push({ ...issue, where: 'pdf' })
  if (!quiet) done('PDF', `${relative(process.cwd(), pdf)} ${`· ${report.pages} page${report.pages === 1 ? '' : 's'} · ${sheet.name}`}`)

  const result = { pdf, pages: report.pages, issues, pngs: [] }
  if (png) {
    if (flow) issues.push({ level: 'info', where: 'png', message: 'flowing content has no PNG per page; only .page sheets are shot' })
    const pngDir = join(outDir, name)
    rmSync(pngDir, { recursive: true, force: true })
    mkdirSync(pngDir, { recursive: true })
    const shot = await open(browser, url, { width: pw, height: ph, scale, media: 'print' })
    await shot.page.evaluate((p) => { document.documentElement.dataset.paper = p }, sheet.name)
    await settle(shot.page)
    // One sheet at a time, alone at the top left, at whole pixels: no clipping
    for (let i = 0; i < count; i++) {
      await shot.page.evaluate((index, w, h) => {
        document.querySelectorAll('.page').forEach((p, j) => {
          p.style.display = j === index ? '' : 'none'
          Object.assign(p.style, { margin: '0', width: `${w}px`, height: `${h}px` })
        })
        document.body.style.margin = '0'
        scrollTo(0, 0)
      }, i, pw, ph)
      const file = join(pngDir, `${String(i + 1).padStart(2, '0')}.png`)
      await shot.page.screenshot({ path: file })
      result.pngs.push(file)
    }
    await shot.page.close()
    if (!quiet) done('PNG', `${relative(process.cwd(), pngDir)}/ (${count})`)
  }
  return finish(result, quiet)
}

async function longPage (project, server, browser, { png = false, scale = 2, width = 1600, quiet = false }) {
  const name = basename(project.entry, extname(project.entry))
  const html = readFileSync(join(project.dir, project.entry), 'utf8')
  const W = Math.round(Number(width) || 1600)
  // ?print for the PDF (a page may swap screen-only effects), none for the PNG
  const url = `${server.url}/${project.entry}`
  const issues = []
  const outDir = join(project.dir, 'out')
  mkdirSync(outDir, { recursive: true })

  const { page, errors } = await open(browser, `${url}?print`, { width: W, height: 1000, scale: usesCanvas(html) ? 1.5 : 2, media: 'screen' })
  await addStyle(page, unbound(W))
  await settle(page)
  const prep = await preparePrint(page, { media: 'screen' })
  const H = await page.evaluate(() => Math.ceil(Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)))
  if (!quiet) step('Long page', `${W} × ${H} px`)
  await addStyle(page, `@page { size: ${W}px ${H}px; margin: 0; }`)
  for (const issue of prep.issues) issues.push({ ...issue, where: 'print' })
  for (const e of errors) issues.push({ level: 'error', where: 'page', message: e })
  const sticky = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((el) => /fixed|sticky/.test(getComputedStyle(el).position)).length)
  if (sticky) issues.push({ level: 'warn', where: 'page', message: `${sticky} fixed or sticky element${sticky > 1 ? 's' : ''}: on a long page they print once at the top (and repeat in every PNG tile)` })
  if (H * 0.75 > 14400) issues.push({ level: 'warn', where: 'pdf', message: `the page is ${Math.round(H * 0.75 / 72)} in tall: Acrobat stops at 200 in (Preview and browsers open it)` })

  const pdf = join(outDir, `${name}.pdf`)
  await page.pdf({ path: pdf, width: `${W}px`, height: `${H}px`, printBackground: true, pageRanges: '1', margin: { top: 0, right: 0, bottom: 0, left: 0 } })
  await page.close()
  const report = pdfReport(pdf, { expectPages: 1 })
  for (const issue of report.issues) issues.push({ ...issue, where: 'pdf' })
  if (!quiet) done('PDF', `${relative(process.cwd(), pdf)} · one page ${W}×${H}`)
  const result = { pdf, pages: report.pages, width: W, height: H, issues }

  if (png) {
    const file = join(outDir, `${name}.png`)
    result.png = await longPng(browser, url, file, { W, H, scale })
    const size = pngSize(file)
    if (!quiet) done('PNG', `${relative(process.cwd(), file)} · ${size.width}×${size.height} (${Math.ceil(H / TILE)} tile${H > TILE ? 's' : ''})`)
  }
  return finish(result, quiet)
}

// Tiles of TILE CSS px shot by scrolling a viewport of that height; the last
// one is shot flush with the bottom and its overlap trimmed when stitching.
async function longPng (browser, url, file, { W, H, scale }) {
  const tileH = Math.min(TILE, H)
  const { page } = await open(browser, url, { width: W, height: tileH, scale, media: 'screen' })
  await addStyle(page, unbound(W))
  await settle(page)
  const dir = `${file}.tiles`
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const tiles = []
  let trim = 0
  for (let y = 0; y < H; y += TILE) {
    const top = Math.min(y, H - tileH)
    trim = Math.round((y - top) * scale)
    const at = await page.evaluate((t) => new Promise((r) => { scrollTo(0, t); requestAnimationFrame(() => requestAnimationFrame(() => r(scrollY))) }), top)
    if (Math.abs(at - top) > 0.5) throw new Error(`could not scroll the page to ${top} px (it stops at ${at}): does it set a fixed height?`)
    const tile = join(dir, `${String(tiles.length).padStart(3, '0')}.png`)
    await page.screenshot({ path: tile })
    tiles.push(tile)
  }
  await page.close()
  await stitch(tiles, file, { direction: 'v', trim })
  rmSync(dir, { recursive: true, force: true })
  return file
}
