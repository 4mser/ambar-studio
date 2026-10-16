#!/usr/bin/env node
// AMBAR command line.
import { loadProject } from '../src/lib/project.js'
import { render, renderFrames, renderGif } from '../src/commands/render.js'
import { voice } from '../src/commands/voice.js'
import { mix } from '../src/commands/mix.js'
import { slides } from '../src/commands/slides.js'
import { doc } from '../src/commands/doc.js'
import { studio } from '../src/commands/studio.js'
import { scaffold } from '../src/commands/new.js'
import { capture } from '../src/commands/capture.js'
import { check } from '../src/commands/check.js'
import { skill } from '../src/commands/skill.js'
import { embed } from '../src/commands/embed.js'
import { serve } from '../src/lib/server.js'
import { openPage, waitForComposition } from '../src/lib/browser.js'
import { amber, bold, dim, fail } from '../src/lib/log.js'
import { resolve } from 'node:path'

const HELP = `
  ${amber('◆')} ${bold('AMBAR Studio')} ${dim('· video, slides and documents from HTML')}

  ${bold('Video')}
    ambar studio <project>              timeline studio in the browser
    ambar render <project>              narration + mix + frames → out/<name>.mp4
      --fps <n>                         override the composition frame rate
      --no-audio                        picture only
      --frames 0,1.5,3                  PNG stills at those seconds → out/frames/
      --gif <file> [--from s] [--to s] [--gif-fps 15] [--width 960]
    ambar voice <project> [--force]     record narration lines → voice/*.wav + timings
    ambar mix <project>                 narration, music and effects → out/mix.wav
    ambar capture <project>             screenshots + element boxes of an app (capture.json)
    ambar embed <project> [--out dir]   the composition as a live web player (index.html?player)

  ${bold('Review')}
    ambar check <project | deck.html | doc.html> [--json] [--at 1,4.5]
                                        errors, text off-frame or clipped, overlaps,
                                        cues, determinism → out/check/sheet.png

  ${bold('Slides and documents')}
    ambar slides <deck.html> [--no-png] [--scale 2]   → out/<deck>.pdf + PNGs
    ambar doc <doc.html> [--png]                      → out/<doc>.pdf

  ${bold('Start something new')}
    ambar new <dir> [--deck | --doc]    a template plus an AMBAR.md brief

  ${bold('With Claude')}
    ambar skill [--remove]              link the ambar skill and agent into ~/.claude
`

function parse (argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) { args._.push(a); continue }
    const key = a.slice(2)
    if (key.startsWith('no-')) { args[key.slice(3)] = false; continue }
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) args[key] = true
    else { args[key] = next; i++ }
  }
  return args
}

const num = (x) => (x === undefined || x === true ? undefined : Number(x))

async function main () {
  const args = parse(process.argv.slice(2))
  const [command, target] = args._
  if (!command || command === 'help' || args.help) return console.log(HELP)

  if (command === 'skill') return skill({ remove: Boolean(args.remove) })

  if (command === 'new') {
    if (!target) throw new Error('Usage: ambar new <dir> [--deck | --doc]')
    return scaffold(target, args.deck ? 'deck' : args.doc ? 'doc' : 'video')
  }

  const project = loadProject(target ?? '.')
  switch (command) {
    case 'studio':
      return studio(project, { port: num(args.port), open: args.open !== false })
    case 'render':
      if (args.frames) {
        const times = args.frames === true ? [] : String(args.frames).split(',').map(Number)
        return renderFrames(project, times)
      }
      if (args.gif) {
        const file = args.gif === true ? resolve(project.outDir, `${project.name}.gif`) : resolve(args.gif)
        return renderGif(project, file, { from: num(args.from) ?? 0, to: num(args.to), fps: num(args['gif-fps']) ?? 15, width: num(args.width) ?? 960 })
      }
      return render(project, { fps: num(args.fps), audio: args.audio !== false })
    case 'check': {
      const at = typeof args.at === 'string' ? args.at.split(',').map(Number) : []
      const result = await check(project, { json: Boolean(args.json), at })
      if (!result.ok) process.exitCode = 1
      return
    }
    case 'embed':
      return embed(project, { out: typeof args.out === 'string' ? args.out : undefined })
    case 'capture':
      return capture(project, { config: typeof args.config === 'string' ? args.config : 'capture.json' })
    case 'voice':
      return voice(project, { force: Boolean(args.force) })
    case 'mix': {
      await voice(project)
      // the mix needs the composition's length
      const server = await serve(project.dir)
      const { browser, page, errors } = await openPage(`${server.url}/${project.entry}?render`)
      const { duration } = await waitForComposition(page, errors)
      await browser.close()
      await server.close()
      return mix(project, duration)
    }
    case 'slides':
      return slides(project, { png: args.png !== false, scale: num(args.scale) ?? 1 })
    case 'doc':
      return doc(project, { png: Boolean(args.png) })
    default:
      console.log(HELP)
      throw new Error(`Unknown command "${command}"`)
  }
}

main().catch((error) => {
  fail(error.message)
  process.exit(1)
})
