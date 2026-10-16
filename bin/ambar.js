#!/usr/bin/env node
// AMBAR command line.
import { loadProject } from '../src/lib/project.js'
import { render, renderFrames, renderGif } from '../src/commands/render.js'
import { voice, verifyVoice } from '../src/commands/voice.js'
import { mix } from '../src/commands/mix.js'
import { slides } from '../src/commands/slides.js'
import { doc } from '../src/commands/doc.js'
import { stills, previewStills } from '../src/commands/stills.js'
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
      --query v                         render a variant (?v) → out/<name>-v.mp4 (also for check)
      --fps <n>                         override the composition frame rate
      --no-audio                        picture only
      --cover <s>                       also <name>-cover.mp4 with the frame at <s> first (feed thumbnail)
      --frames 0,1.5,3                  PNG stills at those seconds → out/frames/
      --gif <file> [--from s] [--to s] [--gif-fps 15] [--width 960]
    ambar voice <project> [--force]     record narration lines → voice/*.wav + timings + envelope
      --recut                           cut the saved takes again without recording
      --verify                          transcribe every line and compare it with the script
    ambar mix <project>                 narration, music and effects → out/mix.wav
    ambar capture <project> [--only a,b]  stills, element boxes and recordings of the app in motion (capture.json)
    ambar embed <project> [--out dir]   the composition as a live web player (index.html?player)

  ${bold('Review')}
    ambar check <project | deck.html | doc.html> [--json] [--at 1,4.5]
                                        errors, text off-frame or clipped, overlaps,
                                        cues, determinism → out/check/sheet.png

  ${bold('Slides and documents')}
    ambar slides <deck.html> [--no-png] [--scale 2]   → out/<deck>.pdf + PNGs
    ambar doc <doc.html> [--png] [--paper a4|letter|a5] → out/<doc>.pdf (checked: fonts, shadows, pages)
      --long [--width 1600]             one long PDF page (+ a stitched PNG with --png), for infographics

  ${bold('Still images')}
    ambar stills <template.html>        every item × size → out/<template>/<size>/NN-<id>.png
      --data items.json --sizes post,story,ios,play,og   --scale 2   --format png|jpg|webp|png8
      --webp  --sheet  --only <id>  --serve

  ${bold('Start something new')}
    ambar new <dir> [--deck | --doc]    a template plus an AMBAR.md brief
      --carousel --store --og --infographic --proposal

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
const str = (x) => (typeof x === 'string' ? x : undefined)

async function main () {
  const args = parse(process.argv.slice(2))
  const [command, target] = args._
  if (!command || command === 'help' || args.help) return console.log(HELP)

  if (command === 'skill') return skill({ remove: Boolean(args.remove) })

  if (command === 'new') {
    const kind = ['deck', 'doc', 'carousel', 'store', 'og', 'infographic', 'proposal'].find((k) => args[k]) ?? 'video'
    if (!target) throw new Error('Usage: ambar new <dir> [--deck | --doc | --carousel | --store | --og | --infographic | --proposal]')
    return scaffold(target, kind)
  }

  const project = loadProject(target ?? '.')
  // --query v: a variant of the same composition (for instance a vertical cut
  // read from location.search); renders go to out/<name>-v.mp4
  if (typeof args.query === 'string') {
    project.query = `&${args.query}`
    project.output = project.output.replace(/(\.\w+)$/, `-${args.query.replace(/\W+/g, '-')}$1`)
  }
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
      return render(project, { fps: num(args.fps), audio: args.audio !== false, cover: num(args.cover) })
    case 'check': {
      const at = typeof args.at === 'string' ? args.at.split(',').map(Number) : []
      const result = await check(project, { json: Boolean(args.json), at })
      if (!result.ok) process.exitCode = 1
      return
    }
    case 'embed':
      return embed(project, { out: typeof args.out === 'string' ? args.out : undefined })
    case 'capture':
      return capture(project, { config: typeof args.config === 'string' ? args.config : 'capture.json', only: str(args.only) })
    case 'voice': {
      if (args.verify) {
        const problems = await verifyVoice(project)
        if (problems.length) process.exitCode = 1
        return
      }
      return voice(project, { force: Boolean(args.force), recut: Boolean(args.recut) })
    }
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
    case 'slides': {
      const r = await slides(project, { png: args.png !== false, scale: num(args.scale) ?? 1 })
      if (r && !r.ok) process.exitCode = 1
      return
    }
    case 'doc': {
      const r = await doc(project, { png: Boolean(args.png), scale: num(args.scale) ?? 2, paper: str(args.paper), long: Boolean(args.long), width: num(args.width) ?? 1600 })
      if (r && !r.ok) process.exitCode = 1
      return
    }
    case 'stills': {
      if (args.serve) return previewStills(project, { sizes: str(args.sizes), port: num(args.port) }) // keeps running
      const r = await stills(project, {
        data: str(args.data), sizes: str(args.sizes), scale: num(args.scale), format: str(args.format) ?? 'png',
        sheet: Boolean(args.sheet), only: str(args.only) ?? null, webp: Boolean(args.webp)
      })
      if (!r.ok) process.exitCode = 1
      return
    }
    default:
      console.log(HELP)
      throw new Error(`Unknown command "${command}"`)
  }
}

main().catch((error) => {
  fail(error.message)
  process.exit(1)
})
