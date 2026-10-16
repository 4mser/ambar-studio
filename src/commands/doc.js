// ambar doc: an HTML document (one <section class="page"> per A4 page) →
// PDF, plus an optional PNG of every page.
import { mkdirSync } from 'node:fs'
import { basename, extname, join, relative } from 'node:path'
import { serve } from '../lib/server.js'
import { openPage } from '../lib/browser.js'
import { done } from '../lib/log.js'

export async function doc (project, { png = false } = {}) {
  const name = basename(project.entry, extname(project.entry))
  const server = await serve(project.dir)
  const { browser, page } = await openPage(`${server.url}/${project.entry}?print`, { width: 794, height: 1123, scale: 2 })
  const outDir = join(project.dir, 'out')
  mkdirSync(outDir, { recursive: true })
  const pdf = join(outDir, `${name}.pdf`)
  await page.pdf({ path: pdf, format: 'A4', printBackground: true, preferCSSPageSize: true })
  done('PDF', relative(process.cwd(), pdf))

  if (png) {
    const pngDir = join(outDir, name)
    mkdirSync(pngDir, { recursive: true })
    const pages = await page.$$('.page')
    for (let i = 0; i < pages.length; i++) {
      await pages[i].screenshot({ path: join(pngDir, `${String(i + 1).padStart(2, '0')}.png`) })
    }
    done('PNG', `${relative(process.cwd(), pngDir)}/ (${pages.length})`)
  }
  await browser.close()
  await server.close()
}
