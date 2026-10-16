// ffmpeg helpers: run a command, decode any audio file to float samples.
import { spawn, spawnSync } from 'node:child_process'

export function assertFfmpeg () {
  const probe = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' })
  if (probe.status !== 0) {
    throw new Error('ffmpeg was not found. Install it (macOS: brew install ffmpeg) and try again.')
  }
}

export function run (args, { input } = {}) {
  return new Promise((ok, fail) => {
    const child = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
      stdio: [input ? 'pipe' : 'ignore', 'ignore', 'pipe']
    })
    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', fail)
    child.on('close', (code) => (code === 0 ? ok() : fail(new Error(`ffmpeg failed (${code}): ${stderr.trim()}`))))
    if (input) input(child.stdin)
  })
}

/** Starts an encoder that reads images from stdin. Returns write() and end(). */
export function imageEncoder (args) {
  const child = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    stdio: ['pipe', 'ignore', 'pipe']
  })
  let stderr = ''
  let exited = null
  child.stderr.on('data', (chunk) => { stderr += chunk })
  // If ffmpeg stops early, writes fail with EPIPE: report ffmpeg's own error instead
  child.stdin.on('error', () => {})
  const closed = new Promise((ok, fail) => {
    child.on('error', fail)
    child.on('close', (code) => {
      exited = code === 0 ? null : new Error(`ffmpeg failed (${code}): ${stderr.trim()}`)
      return exited ? fail(exited) : ok()
    })
  })
  closed.catch(() => {})
  return {
    write: (buffer) => {
      if (exited) throw exited
      if (child.stdin.write(buffer)) return null
      // Wait for the pipe to drain, or for ffmpeg to exit (then report its error)
      return Promise.race([new Promise((r) => child.stdin.once('drain', r)), closed.then(() => {}, (e) => { throw e })])
    },
    end: () => { child.stdin.end(); return closed }
  }
}

/** Any audio file → interleaved stereo Float32Array at the given rate */
export function decodeAudio (file, { rate = 48000, start = 0, duration } = {}) {
  const args = ['-hide_banner', '-loglevel', 'error']
  if (start) args.push('-ss', String(start))
  if (duration) args.push('-t', String(duration))
  args.push('-i', file, '-f', 'f32le', '-ac', '2', '-ar', String(rate), '-')
  const result = spawnSync('ffmpeg', args, { maxBuffer: 1024 * 1024 * 1024 })
  if (result.status !== 0) throw new Error(`Could not read ${file}: ${String(result.stderr).trim()}`)
  const bytes = result.stdout
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4).slice()
}
