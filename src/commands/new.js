// ambar new <dir> [--deck | --doc]: scaffolds a project from a template.
import { cpSync, existsSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { ROOT } from '../lib/server.js'
import { done, dim } from '../lib/log.js'

export function scaffold (target, kind = 'video') {
  const dir = resolve(target)
  if (existsSync(dir) && readdirSync(dir).length) throw new Error(`${dir} already exists and is not empty`)
  cpSync(join(ROOT, 'templates', kind), dir, { recursive: true })
  const rel = relative(process.cwd(), dir) || '.'
  const next = {
    video: `ambar studio ${rel}   ${dim('# edit and preview')}\n  ambar render ${rel}   ${dim('# → out/*.mp4')}`,
    deck: `open ${rel}/deck.html    ${dim('# present')}\n  ambar slides ${rel}/deck.html`,
    doc: `open ${rel}/doc.html     ${dim('# preview')}\n  ambar doc ${rel}/doc.html`
  }[kind]
  done(`New ${kind}`, rel)
  console.log(`\n  ${next}\n`)
}
