// ambar slides: a deck (one <section class="slide"> per slide) → one PDF with
// a page per slide, plus a PNG of every slide.
import { mkdirSync } from 'node:fs'
import { basename, extname, join, relative } from 'node:path'
import { serve } from '../lib/server.js'
import { openPage } from '../lib/browser.js'
import { done, step } from '../lib/log.js'

export async function slides (project, { png = true, scale = 1 } = {}) {
  const name = basename(project.entry, extname(project.entry))
  const server = await serve(project.dir)
  const { browser, page, errors } = await openPage(`${server.url}/${project.entry}?print`, { scale })
  try {
    await page.waitForFunction(() => window.AMBAR_DECK?.ready === true, { timeout: 30000 })
  } catch {
    throw new Error(`The deck never became ready (does it load /@ambar/runtime/slides.js?)\n  ${errors.join('\n  ')}`)
  }
  const { width, height, count } = await page.evaluate(() => window.AMBAR_DECK)
  step('Slides', `${count} slides · ${width}×${height}`)

  const outDir = join(project.dir, 'out')
  mkdirSync(outDir, { recursive: true })
  const pdf = join(outDir, `${name}.pdf`)
  await page.pdf({ path: pdf, width: `${width}px`, height: `${height}px`, printBackground: true, preferCSSPageSize: true })
  done('PDF', relative(process.cwd(), pdf))

  if (png) {
    const pngDir = join(outDir, name)
    mkdirSync(pngDir, { recursive: true })
    await page.setViewport({ width, height, deviceScaleFactor: scale })
    const sections = await page.$$('.slide')
    for (let i = 0; i < sections.length; i++) {
      await sections[i].screenshot({ path: join(pngDir, `${String(i + 1).padStart(2, '0')}.png`) })
    }
    done('PNG', `${relative(process.cwd(), pngDir)}/ (${sections.length})`)
  }
  await browser.close()
  await server.close()
}
