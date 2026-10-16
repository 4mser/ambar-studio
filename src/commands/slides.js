// ambar slides: a deck (one <section class="slide"> per slide) → one PDF with
// a page per slide, plus a PNG of every slide. Before printing, every slide is
// checked for content that leaves it or does not fit its box, and the print is
// audited (shadows, fonts, canvases); after, the PDF is scanned for Type 3
// fonts, soft masks and a page count that differs from the slide count.
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { basename, extname, join, relative } from 'node:path'
import { serve } from '../lib/server.js'
import { launch, open, settle } from '../lib/headless.js'
import { overflowGuard, printIssues } from '../lib/audit.js'
import { pdfReport, preparePrint, usesCanvas } from '../lib/pdf.js'
import { done, step } from '../lib/log.js'

async function openDeck (browser, url, opts) {
  const { page, errors } = await open(browser, url, opts)
  try {
    await page.waitForFunction(() => window.AMBAR_DECK?.ready === true, { timeout: 30000 })
  } catch {
    throw new Error(`The deck never became ready (does it load /@ambar/runtime/slides.js?)\n  ${errors.join('\n  ')}`)
  }
  await settle(page)
  return { page, errors, deck: await page.evaluate(() => window.AMBAR_DECK) }
}

/** Options: png (default true), scale (PNG pixel ratio), quiet. Returns { ok, pdf, pngs, pages, issues }. */
export async function slides (project, { png = true, scale = 1, quiet = false } = {}) {
  const name = basename(project.entry, extname(project.entry))
  const html = readFileSync(join(project.dir, project.entry), 'utf8')
  const server = await serve(project.dir)
  const browser = await launch()
  const issues = []
  try {
    const target = `${server.url}/${project.entry}?print`
    // PDF: at 1.5x when canvases are drawn (sharp enough, a fraction of the size)
    const { page, errors, deck } = await openDeck(browser, target, { width: 1920, height: 1080, scale: usesCanvas(html) ? 1.5 : 1 })
    const { width, height, count } = deck
    if (!quiet) step('Slides', `${count} slides · ${width}×${height}`)
    await page.setViewport({ width, height, deviceScaleFactor: usesCanvas(html) ? 1.5 : 1 })
    const prep = await preparePrint(page)
    for (let i = 0; i < count; i++) {
      for (const issue of await page.evaluate(overflowGuard, { selector: '.slide', index: i })) issues.push({ ...issue, where: `slide ${i + 1}` })
    }
    for (const issue of prep.issues) issues.push({ ...issue, where: 'print' })
    for (const e of errors) issues.push({ level: 'error', where: 'page', message: e })

    const outDir = join(project.dir, 'out')
    mkdirSync(outDir, { recursive: true })
    const pdf = join(outDir, `${name}.pdf`)
    await page.pdf({ path: pdf, width: `${width}px`, height: `${height}px`, printBackground: true, preferCSSPageSize: true })
    await page.close()
    const report = pdfReport(pdf, { expectPages: count })
    for (const issue of report.issues) issues.push({ ...issue, where: 'pdf' })
    if (!quiet) done('PDF', relative(process.cwd(), pdf))

    const pngs = []
    if (png) {
      const pngDir = join(outDir, name)
      rmSync(pngDir, { recursive: true, force: true })
      mkdirSync(pngDir, { recursive: true })
      const shot = await openDeck(browser, target, { width, height, scale })
      // One slide at a time, alone in a viewport of its exact size: no clipping
      for (let i = 0; i < count; i++) {
        await shot.page.evaluate((index) => {
          document.querySelectorAll('.slide').forEach((s, j) => { s.style.display = j === index ? '' : 'none' })
          scrollTo(0, 0)
        }, i)
        const file = join(pngDir, `${String(i + 1).padStart(2, '0')}.png`)
        await shot.page.screenshot({ path: file })
        pngs.push(file)
      }
      await shot.page.close()
      if (!quiet) done('PNG', `${relative(process.cwd(), pngDir)}/ (${count})`)
    }
    const result = { pdf, pngs, pages: report.pages, issues, ok: !issues.some((i) => i.level === 'error') }
    if (!quiet) printIssues(issues)
    return result
  } finally {
    await browser.close()
    await server.close()
  }
}
