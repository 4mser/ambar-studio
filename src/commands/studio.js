// ambar studio: serves the project and opens the timeline studio.
import { spawn } from 'node:child_process'
import { serve } from '../lib/server.js'
import { amber, dim } from '../lib/log.js'

export async function studio (project, { port = 4747, open = true } = {}) {
  let server
  try {
    server = await serve(project.dir, { port })
  } catch {
    server = await serve(project.dir) // that port is busy: any free one
  }
  const url = `${server.url}/@ambar/studio/?entry=${encodeURIComponent(project.entry)}`
  console.log(`\n  ${amber('◆ AMBAR Studio')}  ${url}`)
  console.log(`  ${dim('space play · ←/→ frame · shift ←/→ second · S safe areas · ctrl+c to stop')}\n`)
  if (open && process.platform === 'darwin') spawn('open', [url], { stdio: 'ignore', detached: true }).unref()
  if (open && process.platform === 'win32') spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true }).unref()
  if (open && process.platform === 'linux') spawn('xdg-open', [url], { stdio: 'ignore', detached: true }).unref()
  await new Promise(() => {}) // serve until interrupted
}
