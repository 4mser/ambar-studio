// A video project is a folder with an index.html (the composition) and an
// optional ambar.json (narration, music, sound effects, output).
import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

export const DEFAULTS = {
  title: '',
  output: 'out/{name}.mp4',
  voice: { provider: 'say', name: 'Samantha', speed: 1 },
  voices: {},
  lead: 0.8,
  gap: 0.55,
  tail: 1.6,
  lines: [],
  music: null,
  sfx: [],
  duck: 0.55,
  loudness: -14,
  cover: null
}

export function loadProject (input = '.') {
  let dir = resolve(input)
  let entry = 'index.html'
  if (existsSync(dir) && statSync(dir).isFile()) {
    entry = basename(dir)
    dir = dirname(dir)
  }
  if (!existsSync(join(dir, entry))) {
    throw new Error(`No ${entry} in ${dir}. A project is a folder with an index.html.`)
  }
  const configPath = join(dir, 'ambar.json')
  const raw = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) : {}
  const config = {
    ...DEFAULTS,
    ...raw,
    voice: { ...DEFAULTS.voice, ...(raw.voice ?? {}) }
  }
  const name = basename(dir)
  return {
    dir,
    entry,
    name,
    config,
    configPath,
    voiceDir: join(dir, 'voice'),
    outDir: join(dir, 'out'),
    output: resolve(dir, config.output.replace('{name}', name))
  }
}
