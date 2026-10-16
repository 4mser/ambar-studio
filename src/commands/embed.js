// ambar embed: exports a video project as a folder any static host can serve,
// so the composition plays live on a web page instead of as an MP4. The folder
// carries the project, the parts of AMBAR it uses (under _ambar/), the mix as
// AAC and player.json with the chapters and captions. Open index.html?player
// (usually in an iframe) to get the web player; plain index.html previews.
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import { serve, ROOT } from '../lib/server.js'
import { openPage, waitForComposition } from '../lib/browser.js'
import { assertFfmpeg, run } from '../lib/ffmpeg.js'
import { resolveTime } from '../lib/timeline.js'
import { voice } from './voice.js'
import { mix } from './mix.js'
import { done, step } from '../lib/log.js'

const SKIP = new Set(['out', 'node_modules', '.git', '.DS_Store'])
const TEXT = new Set(['.html', '.js', '.mjs', '.css'])

/** Chapters from ambar.json ([{ title, at }]) or one per narration line */
export function playerData (config, cues, duration) {
  const lines = (config.lines ?? []).filter((l) => cues[l.id])
  const chapters = (config.chapters ?? lines.map((l) => ({ title: l.chapter ?? '', at: l.id })))
    .map((c) => ({ title: c.title ?? '', start: Math.max(0, resolveTime(c.at ?? 0, cues)) }))
    .sort((a, b) => a.start - b.start)
  if (chapters.length) chapters[0].start = 0
  const captions = lines.map((l) => ({ text: l.caption ?? l.text, start: cues[l.id].start, end: cues[l.id].end }))
  return { duration, chapters, captions }
}

/** Copies the project, pointing /@ambar/ imports at the bundled copy */
function copyProject (from, to, base = from) {
  for (const name of readdirSync(from)) {
    if (SKIP.has(name)) continue
    const src = join(from, name)
    const dest = join(to, name)
    if (statSync(src).isDirectory()) {
      if (name === 'voice') { mkdirSync(dest, { recursive: true }); cpSync(join(src, 'timings.json'), join(dest, 'timings.json')); continue }
      mkdirSync(dest, { recursive: true })
      copyProject(src, dest, base)
      continue
    }
    if (TEXT.has(extname(name))) {
      const depth = relative(base, from).split('/').filter(Boolean).length
      const prefix = depth ? '../'.repeat(depth) : './'
      writeFileSync(dest, readFileSync(src, 'utf8').replaceAll('/@ambar/', `${prefix}_ambar/`))
    } else cpSync(src, dest)
  }
}

export async function embed (project, { out } = {}) {
  assertFfmpeg()
  const target = resolve(out ?? join(project.outDir, 'web'))
  const config = project.config
  step('Embed', relative(process.cwd(), target) || '.')

  const timings = (config.lines ?? []).length ? await voice(project) : { cues: {} }
  const server = await serve(project.dir)
  const { browser, page, errors } = await openPage(`${server.url}/${project.entry}?render`)
  const { duration } = await waitForComposition(page, errors)
  await browser.close()
  await server.close()

  rmSync(target, { recursive: true, force: true })
  mkdirSync(target, { recursive: true })
  copyProject(project.dir, target)
  for (const part of ['runtime', 'mascot']) cpSync(join(ROOT, part), join(target, '_ambar', part), { recursive: true })

  const data = playerData(config, timings.cues ?? {}, duration)
  data.speaker = config.player?.speaker ?? ''
  if (config.player?.hint) data.hint = config.player.hint
  const hasSound = (config.lines ?? []).length || config.music || (config.sfx ?? []).length
  if (hasSound) {
    const wav = await mix(project, duration)
    await run(['-i', wav, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', join(target, 'audio.m4a')])
    data.audio = 'audio.m4a'
  }
  writeFileSync(join(target, 'player.json'), JSON.stringify(data, null, 2))
  done('Embed', `${relative(process.cwd(), join(target, project.entry))}?player · ${data.chapters.length} chapters · ${duration.toFixed(1)} s`)
  return target
}

