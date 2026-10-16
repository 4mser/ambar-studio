// ambar skill: links the ambar skill and the ambar-producer agent into
// ~/.claude, so Claude Code can make AMBAR pieces from any folder. Links, not
// copies: pulling the repo updates them. --remove takes them away again.
import { existsSync, lstatSync, mkdirSync, readlinkSync, symlinkSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { ROOT } from '../lib/server.js'
import { dim, done, warn } from '../lib/log.js'

const LINKS = [
  [join(ROOT, '.claude', 'skills', 'ambar'), ['skills', 'ambar']],
  [join(ROOT, '.claude', 'agents', 'ambar-producer.md'), ['agents', 'ambar-producer.md']]
]

const linked = (path) => { try { return lstatSync(path).isSymbolicLink() } catch { return false } }

export function skill ({ remove = false, home = join(homedir(), '.claude') } = {}) {
  for (const [source, parts] of LINKS) {
    const target = join(home, ...parts)
    if (remove) {
      if (linked(target) && readlinkSync(target) === source) { unlinkSync(target); done('Removed', target) }
      continue
    }
    if (linked(target)) {
      if (readlinkSync(target) === source) { done('Already linked', target); continue }
      unlinkSync(target)
    } else if (existsSync(target)) {
      warn(`${target} exists and is not a link to AMBAR; left as is`)
      continue
    }
    mkdirSync(dirname(target), { recursive: true })
    symlinkSync(source, target)
    done('Linked', `${target} ${dim('→')} ${source}`)
  }
  if (!remove) console.log(`\n  ${dim('In Claude Code: "make a 30-second video about…" or /ambar')}\n`)
}
