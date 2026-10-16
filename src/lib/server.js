// Local static server. The project folder is served at "/" and AMBAR's own
// files (runtime, studio, mascot) at "/@ambar/", so a composition imports
// "/@ambar/runtime/ambar.js" no matter where the project lives.
import { createServer } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)))

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
}

/** The file for a URL path inside base, or null if it escapes base */
function within (base, urlPath) {
  const file = normalize(join(base, decodeURIComponent(urlPath)))
  return file === base || file.startsWith(base + sep) ? file : null
}

export function serve (projectDir, { port = 0 } = {}) {
  const base = resolve(projectDir)
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost')
    let file = url.pathname.startsWith('/@ambar/')
      ? within(ROOT, url.pathname.slice('/@ambar'.length))
      : within(base, url.pathname)
    if (file && existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
    if (!file || !existsSync(file)) {
      res.writeHead(404, { 'content-type': 'text/plain' })
      return res.end('not found')
    }
    const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream'
    const size = statSync(file).size
    // Range requests: audio and video elements need them to seek
    const range = req.headers.range?.match(/^bytes=(\d*)-(\d*)$/)
    if (range) {
      const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]))
      const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
      if (start >= size || start > end) {
        res.writeHead(416, { 'content-range': `bytes */${size}` })
        return res.end()
      }
      res.writeHead(206, {
        'content-type': type,
        'content-range': `bytes ${start}-${end}/${size}`,
        'content-length': end - start + 1,
        'accept-ranges': 'bytes',
        'cache-control': 'no-store'
      })
      return createReadStream(file, { start, end }).pipe(res)
    }
    res.writeHead(200, { 'content-type': type, 'content-length': size, 'accept-ranges': 'bytes', 'cache-control': 'no-store' })
    createReadStream(file).pipe(res)
  })
  return new Promise((ok, fail) => {
    server.once('error', fail)
    server.listen(port, '127.0.0.1', () => {
      const { port: bound } = server.address()
      ok({ url: `http://127.0.0.1:${bound}`, port: bound, close: () => new Promise((r) => server.close(r)) })
    })
  })
}
