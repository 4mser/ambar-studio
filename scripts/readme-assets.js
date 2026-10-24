// Renders every image in the README with AMBAR itself: npm run readme-assets
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import puppeteer from 'puppeteer'
import { loadProject } from '../src/lib/project.js'
import { renderFrames, renderGif } from '../src/commands/render.js'
import { voice } from '../src/commands/voice.js'
import { mix } from '../src/commands/mix.js'
import { slides } from '../src/commands/slides.js'
import { doc } from '../src/commands/doc.js'
import { capture } from '../src/commands/capture.js'
import { check } from '../src/commands/check.js'
import { stills } from '../src/commands/stills.js'
import { copyFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { serve, ROOT } from '../src/lib/server.js'
import { run } from '../src/lib/ffmpeg.js'
import { done, step } from '../src/lib/log.js'

const ASSETS = join(ROOT, 'docs', 'assets')
mkdirSync(ASSETS, { recursive: true })
const ex = (name) => join(ROOT, 'examples', name)

// 1 · animated hero
step('Hero')
await renderGif(loadProject(ex('hero')), join(ASSETS, 'hero.gif'), { fps: 12, width: 960 })

// 2 · the launch video, one still per scene
step('Launch scenes')
const launch = loadProject(ex('launch'))
await voice(launch)
const scenes = [1.9, 6.4, 11.4, 16.9]
rmSync(join(launch.outDir, 'frames'), { recursive: true, force: true })
await renderFrames(launch, scenes)
const frame = (t) => join(launch.outDir, 'frames', `t-${t.toFixed(2)}.png`)
await run([
  ...scenes.slice(0, 4).flatMap((t) => ['-i', frame(t)]),
  '-filter_complex', '[0]scale=800:-1[a];[1]scale=800:-1[b];[2]scale=800:-1[c];[3]scale=800:-1[d];[a][b]hstack[t];[c][d]hstack[u];[t][u]vstack',
  join(ASSETS, 'launch-scenes.png')
])

// 3 · deck contact sheet
step('Deck')
const deck = loadProject(join(ex('deck'), 'deck.html'))
await slides(deck)
const slide = (n) => join(deck.dir, 'out', 'deck', `${String(n).padStart(2, '0')}.png`)
await run([
  ...[1, 2, 3, 4, 5, 6].flatMap((n) => ['-i', slide(n)]),
  '-filter_complex', '[0]scale=640:-1[a];[1]scale=640:-1[b];[2]scale=640:-1[c];[3]scale=640:-1[d];[4]scale=640:-1[e];[5]scale=640:-1[f];[a][b][c]hstack=3[t];[d][e][f]hstack=3[u];[t][u]vstack',
  join(ASSETS, 'deck.png')
])

// 4 · report pages side by side
step('Report')
const report = loadProject(join(ex('report'), 'report.html'))
await doc(report, { png: true })
const page = (n) => join(report.dir, 'out', 'report', `0${n}.png`)
await run(['-i', page(1), '-i', page(2), '-filter_complex', '[0]scale=800:1131[a];[1]scale=800:1131[b];[a][b]hstack', join(ASSETS, 'report.png')])

// 5 · the tutorial, four moments over the captures
step('Tutorial')
const tutorial = loadProject(ex('tutorial'))
await capture(tutorial)
await voice(tutorial)
const moments = [7.33, 14.93, 19.5, 23.38]
rmSync(join(tutorial.outDir, 'frames'), { recursive: true, force: true })
await renderFrames(tutorial, moments)
const still = (t) => join(tutorial.outDir, 'frames', `t-${t.toFixed(2)}.png`)
await run([
  ...moments.flatMap((t) => ['-i', still(t)]),
  '-filter_complex', '[0]scale=800:-1[a];[1]scale=800:-1[b];[2]scale=800:-1[c];[3]scale=800:-1[d];[a][b]hstack[t];[c][d]hstack[u];[t][u]vstack',
  join(ASSETS, 'tutorial.png')
])

// 6 · the contact sheet ambar check writes for the tutorial
step('Check')
await check(tutorial)
copyFileSync(join(tutorial.outDir, 'check', 'sheet.png'), join(ASSETS, 'check.png'))

// 7 · the motion example (4:5): settle, camera, charts, particles
step('Motion')
const motionProject = loadProject(ex('motion'))
const beats = [2.3, 6.46, 10.42, 14.42]
rmSync(join(motionProject.outDir, 'frames'), { recursive: true, force: true })
await renderFrames(motionProject, beats)
await run([
  ...beats.flatMap((t) => ['-i', join(motionProject.outDir, 'frames', `t-${t.toFixed(2)}.png`)]),
  '-filter_complex', '[0]scale=480:-1[a];[1]scale=480:-1[b];[2]scale=480:-1[c];[3]scale=480:-1[d];[a][b][c][d]hstack=4',
  join(ASSETS, 'motion.png')
])

// 8 · still templates: a carousel and store screenshots, as contact sheets
step('Stills')
for (const [name, size] of [['carousel', 'post'], ['store', 'ios']]) {
  const tpl = loadProject(join(ROOT, 'templates', name, `${name}.html`))
  await stills(tpl, { sheet: true, quiet: true })
  copyFileSync(join(tpl.outDir, name, `sheet-${size}.png`), join(ASSETS, `${name}.png`))
}

// 9 · the studio, on the launch video
step('Studio')
const server = await serve(launch.dir)
const browser = await puppeteer.launch({ headless: true })
const tab = await browser.newPage()
await tab.setViewport({ width: 1600, height: 1000 })
await tab.goto(`${server.url}/@ambar/studio/`, { waitUntil: 'networkidle2', timeout: 60000 })
await tab.waitForFunction(() => document.getElementById('meta').textContent.includes('fps'))
await tab.evaluate(() => { const r = document.getElementById('scrub'); r.value = 11.4; r.dispatchEvent(new Event('input')) })
await tab.click('#safe')
await new Promise((r) => setTimeout(r, 400))
await tab.screenshot({ path: join(ASSETS, 'studio.png') })
await browser.close()
await server.close()

done('README assets', 'docs/assets/')
