// Image helpers for stills and long pages, on tools already required (ffmpeg)
// or optional (cwebp): PNG dimensions, stitching tiles, WebP derivatives and
// 256-colour PNGs for dark line art.
import { copyFileSync, openSync, readSync, closeSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { run } from './ffmpeg.js'
import { has } from './pdf.js'

/** Width and height of a PNG, from its IHDR chunk (a Buffer or a path) */
export function pngSize (input) {
  let head = input
  if (!Buffer.isBuffer(input)) {
    head = Buffer.alloc(24)
    const fd = openSync(input, 'r')
    readSync(fd, head, 0, 24, 0)
    closeSync(fd)
  }
  if (head.toString('latin1', 1, 4) !== 'PNG') throw new Error('not a PNG')
  return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) }
}

/**
 * Joins images into one: 'v' stacks them top to bottom (same width), 'h' side
 * by side (same height). trim drops that many pixels from the start of the
 * last tile (a last tile shot over the end of the previous one).
 */
export async function stitch (files, out, { direction = 'v', trim = 0 } = {}) {
  if (files.length === 1 && !trim) return copyFileSync(files[0], out)
  const n = files.length
  const inputs = files.flatMap((f) => ['-i', f])
  const last = `[${n - 1}:v]`
  const cut = direction === 'v' ? `crop=iw:ih-${trim}:0:${trim}` : `crop=iw-${trim}:ih:${trim}:0`
  const chain = trim ? `${last}${cut}[last];` : ''
  const labels = files.map((_, i) => (i === n - 1 && trim ? '[last]' : `[${i}:v]`)).join('')
  const stack = n === 1 ? `${labels}null` : `${labels}${direction === 'v' ? 'vstack' : 'hstack'}=inputs=${n}`
  await run([...inputs, '-filter_complex', `${chain}${stack}[out]`, '-map', '[out]', '-frames:v', '1', '-update', '1', out])
}

/** A WebP next to an image with cwebp (resized to width). False when cwebp is missing. */
export function webp (src, out, { width = 0, quality = 82 } = {}) {
  if (!has('cwebp')) return false
  const args = ['-quiet', '-q', String(quality)]
  if (width) args.push('-resize', String(width), '0')
  const result = spawnSync('cwebp', [...args, src, '-o', out], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`cwebp failed: ${result.stderr.trim()}`)
  return true
}

/** A 256-colour PNG without dithering: small and crisp for line art on dark */
export function quantize (src, out) {
  return run(['-i', src, '-filter_complex', 'split[a][b];[a]palettegen=max_colors=256:stats_mode=full[p];[b][p]paletteuse=dither=none', '-frames:v', '1', '-update', '1', out])
}
