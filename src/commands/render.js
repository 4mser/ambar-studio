// ambar render: steps through every frame of a composition in headless
// Chrome and encodes them with ffmpeg. Also renders single frames and GIFs.
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { serve } from '../lib/server.js'
import { openPage, waitForComposition } from '../lib/browser.js'
import { assertFfmpeg, imageEncoder, run } from '../lib/ffmpeg.js'
import { voice } from './voice.js'
import { mix } from './mix.js'
import { done, progress, seconds, step } from '../lib/log.js'

async function openComposition (project) {
  const server = await serve(project.dir)
  const { browser, page, errors } = await openPage(`${server.url}/${project.entry}?render`)
  const comp = await waitForComposition(page, errors)
  await page.setViewport({ width: comp.width, height: comp.height, deviceScaleFactor: 1 })
  const close = async () => { await browser.close(); await server.close() }
  return { page, comp, close }
}

const drawAt = (page, t) => page.evaluate((time) => window.AMBAR.render(time), t)

/** --frames 0,1.5,3 → out/frames/t-1.50.png */
export async function renderFrames (project, times) {
  const { page, comp, close } = await openComposition(project)
  const dir = join(project.outDir, 'frames')
  mkdirSync(dir, { recursive: true })
  const list = times.length ? times : [0, comp.duration / 4, comp.duration / 2, (comp.duration * 3) / 4]
  for (const t of list) {
    await drawAt(page, t)
    const file = join(dir, `t-${t.toFixed(2)}.png`)
    await page.screenshot({ path: file })
    done('Frame', relative(process.cwd(), file))
  }
  await close()
}

/** --gif out.gif | out.webp: a looping animation for READMEs and docs */
export async function renderGif (project, file, { from = 0, to, fps = 15, width = 960 } = {}) {
  assertFfmpeg()
  const { page, comp, close } = await openComposition(project)
  const end = Math.min(to ?? comp.duration, comp.duration)
  const total = Math.max(1, Math.round((end - from) * fps))
  step('Animation', `${total} frames · ${fps} fps · ${width}px`)
  mkdirSync(dirname(file), { recursive: true })
  // .webp → animated WebP (far smaller for gradients); anything else → palette GIF
  const webp = file.toLowerCase().endsWith('.webp')
  const encoder = imageEncoder([
    '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
    ...(webp
      ? ['-vf', `scale=${width}:-1:flags=lanczos`, '-c:v', 'libwebp', '-quality', '82', '-compression_level', '6', '-loop', '0', file]
      : ['-vf', `scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=200:stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle`, '-loop', '0', file])
  ])
  const tick = progress('frames', total)
  for (let f = 0; f < total; f++) {
    await drawAt(page, from + f / fps)
    await encoder.write(await page.screenshot({ type: 'png' }))
    tick(f + 1)
  }
  await encoder.end()
  await close()
  done('Animation', relative(process.cwd(), file))
}

export async function render (project, { fps, audio = true } = {}) {
  assertFfmpeg()
  const started = Date.now()
  const hasSound = audio && ((project.config.lines ?? []).length || project.config.music || (project.config.sfx ?? []).length)
  if (hasSound) await voice(project)

  const { page, comp, close } = await openComposition(project)
  const rate = fps ?? comp.fps
  const total = Math.round(comp.duration * rate)
  step('Render', `${comp.width}×${comp.height} · ${rate} fps · ${comp.duration.toFixed(2)} s · ${total} frames`)

  mkdirSync(dirname(project.output), { recursive: true })
  const silent = hasSound ? `${project.output}.video.mp4` : project.output
  const encoder = imageEncoder([
    '-f', 'image2pipe', '-framerate', String(rate), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', silent
  ])
  const tick = progress('frames', total)
  for (let f = 0; f < total; f++) {
    await drawAt(page, f / rate)
    await encoder.write(await page.screenshot({ type: 'jpeg', quality: 95 }))
    tick(f + 1)
  }
  await encoder.end()
  await close()

  if (hasSound) {
    const wav = await mix(project, comp.duration)
    await run([
      '-i', silent, '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
      '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '192k', '-shortest', `${project.output}.tmp.mp4`
    ])
    renameSync(`${project.output}.tmp.mp4`, project.output)
    rmSync(silent, { force: true })
  }
  done('Video', `${relative(process.cwd(), project.output)} · ${comp.duration.toFixed(2)} s long · rendered in ${seconds(Date.now() - started)}`)
  return existsSync(project.output) ? project.output : null
}
