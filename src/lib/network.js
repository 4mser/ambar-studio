// The network guard of `ambar capture`. Every request goes through it:
//   - writes (anything but GET, HEAD and OPTIONS) never leave the browser: they
//     get a mocked response or an empty 200, unless their URL starts with one of
//     `allowWrites`, which may only name a local demo server (localhost)
//   - `mock` answers matching requests from a file or an inline body
//   - `hold` keeps matching requests waiting until a recording releases them,
//     to film a loading state on cue
// It also counts requests in flight, so a frozen recording can wait for the
// network before it moves time: responses land on a predictable frame.
import { existsSync, readFileSync } from 'node:fs'
import { extname, resolve } from 'node:path'

const READS = new Set(['GET', 'HEAD', 'OPTIONS'])
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])
const TYPES = { '.json': 'application/json', '.html': 'text/html', '.txt': 'text/plain', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' }
// requests that may stay open for good: not waited for
const STREAMS = new Set(['eventsource', 'websocket', 'media', 'ping', 'cspviolationreport'])

/** Checks a `network` section and turns it into matchers; throws on unsafe settings */
export function networkRules (network = {}, dir = '.') {
  if (network.block && network.block !== 'non-get') throw new Error(`capture: network.block can only be "non-get" (writes never reach a real system)`)
  for (const prefix of network.allowWrites ?? []) {
    let host
    try { host = new URL(prefix).hostname } catch { throw new Error(`capture: network.allowWrites "${prefix}" is not a URL`) }
    if (!LOOPBACK.has(host)) throw new Error(`capture: network.allowWrites may only name a local demo server (localhost), not ${host}`)
  }
  const mocks = (network.mock ?? []).map((m) => {
    if (!m.url) throw new Error('capture: every network.mock needs a "url" pattern')
    let body = m.body
    let type = m.contentType
    if (m.file) {
      const file = resolve(dir, m.file)
      if (!existsSync(file)) throw new Error(`capture: mock file ${m.file} not found`)
      body = readFileSync(file)
      type ??= TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream'
    } else if (body !== undefined && typeof body !== 'string') {
      body = JSON.stringify(body)
      type ??= 'application/json'
    }
    return { pattern: new RegExp(m.url), method: m.method?.toUpperCase(), status: m.status ?? 200, body: body ?? '', type: type ?? 'application/json', headers: m.headers ?? {} }
  })
  return {
    mocks,
    hold: (network.hold ?? []).map((source) => ({ source, pattern: new RegExp(source) })),
    allowWrites: network.allowWrites ?? [],
    ignore: (network.ignore ?? []).map((s) => new RegExp(s))
  }
}

/** Short form of a URL for logs and meta: no query string (it may carry tokens), no origin for the app's own */
const shorten = (origin) => (url) => {
  try { const u = new URL(url); return (u.origin === origin ? '' : u.origin) + u.pathname } catch { return url.slice(0, 120) }
}

export async function guardNetwork (page, rules, origin = null) {
  const short = shorten(origin)
  const inflight = new Map() // request → real start time
  const held = [] // { request, rule }
  const blocked = []
  const mocked = []

  const cors = (request) => {
    const origin = request.headers().origin
    return origin ? { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true' } : { 'access-control-allow-origin': '*' }
  }

  const answer = (request) => {
    const method = request.method()
    const url = request.url()
    const mock = rules.mocks.find((m) => (!m.method || m.method === method) && m.pattern.test(url))
    if (mock) {
      mocked.push(`${method} ${short(url)}`)
      return request.respond({ status: mock.status, contentType: mock.type, headers: { ...cors(request), ...mock.headers }, body: mock.body })
    }
    if (!READS.has(method) && !rules.allowWrites.some((p) => url.startsWith(p))) {
      blocked.push(`${method} ${short(url)}`)
      return request.respond({ status: 200, contentType: 'application/json', headers: cors(request), body: '{}' })
    }
    return request.continue()
  }

  await page.setRequestInterception(true)
  page.on('request', (request) => {
    if (request.isInterceptResolutionHandled()) return
    const url = request.url()
    if (url.startsWith('data:') || url.startsWith('blob:')) return request.continue()
    const rule = rules.hold.find((h) => h.pattern.test(url))
    if (rule) { held.push({ request, rule }); return }
    if (!STREAMS.has(request.resourceType()) && !rules.ignore.some((p) => p.test(url))) inflight.set(request, Date.now())
    answer(request).catch(() => {})
  })
  const finish = (request) => inflight.delete(request)
  page.on('requestfinished', finish)
  page.on('requestfailed', finish)

  const slow = new Set()
  return {
    blocked,
    mocked,
    /** Lets held requests through: a pattern from `hold`, any URL regex, or true for all */
    release (which = true) {
      const matches = (h) => which === true || h.rule.source === which || new RegExp(which).test(h.request.url())
      for (const h of held.filter(matches)) {
        held.splice(held.indexOf(h), 1)
        inflight.set(h.request, Date.now())
        answer(h.request).catch(() => {})
      }
    },
    /** Resolves when nothing is loading (held requests do not count) */
    async idle ({ patience = 4000 } = {}) {
      for (;;) {
        const now = Date.now()
        const waiting = [...inflight].filter(([request, since]) => {
          if (now - since < patience) return true
          if (!slow.has(request.url())) { slow.add(request.url()); console.warn(`  ! ${short(request.url())} is still loading after ${patience / 1000} s: not waiting for it`) }
          return false
        })
        if (!waiting.length) return
        await new Promise((resolve) => setTimeout(resolve, 5))
      }
    },
    held: () => held.length
  }
}
