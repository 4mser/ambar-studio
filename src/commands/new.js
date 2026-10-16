// ambar new <dir> [--deck | --doc | --carousel | --store | --og | --infographic
// | --proposal]: scaffolds a project from a template, with an AMBAR.md brief.
import { cpSync, existsSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { ROOT } from '../lib/server.js'
import { done, dim } from '../lib/log.js'

export function scaffold (target, kind = 'video') {
  const dir = resolve(target)
  if (existsSync(dir) && readdirSync(dir).length) throw new Error(`${dir} already exists and is not empty`)
  cpSync(join(ROOT, 'templates', kind), dir, { recursive: true })
  // the brief: the project's own rules, read by the ambar skill before anything else
  // templates that bring their own brief keep it
  if (!existsSync(join(dir, 'AMBAR.md'))) cpSync(join(ROOT, 'templates', 'brief', 'AMBAR.md'), join(dir, 'AMBAR.md'))
  const rel = relative(process.cwd(), dir) || '.'
  const next = {
    video: `ambar studio ${rel}   ${dim('# edit and preview')}\n  ambar render ${rel}   ${dim('# → out/*.mp4')}`,
    deck: `open ${rel}/deck.html    ${dim('# present')}\n  ambar slides ${rel}/deck.html`,
    doc: `open ${rel}/doc.html     ${dim('# preview')}\n  ambar doc ${rel}/doc.html`,
    carousel: `ambar stills ${rel}/carousel.html --sheet`,
    store: `ambar stills ${rel}/store.html --sheet`,
    og: `ambar stills ${rel}/og.html`,
    infographic: `ambar doc ${rel}/infographic.html --long --png`,
    proposal: `ambar doc ${rel}/proposal.html`
  }[kind]
  done(`New ${kind}`, rel)
  console.log(`\n  ${next}\n`)
}
