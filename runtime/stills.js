// AMBAR stills: one template, many images. A still page calls
// still({ setup(ctx) }) and fills itself from ctx.item (one entry of the data
// file) at ctx.width × ctx.height. `ambar stills` injects window.AMBAR_STILL
// before the page loads and waits for the ready flag this helper raises once
// fonts are loaded and every image is decoded. Opened in a browser on its own,
// the page reads ?item=, ?size= and ?data= instead, so it can be previewed
// (?guides draws the safe zone; arrow keys step through the items).
// normalizeItems() is DOM-free and shared with the renderer.
import { resolveSize } from './sizes.js'

/** Any data file shape → [{ id, ... }]: an array, or { items: [...] } */
export function normalizeItems (data) {
  const list = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : data ? [data] : []
  if (!list.length) return [{ id: '01' }]
  return list.map((item, i) => {
    const obj = item && typeof item === 'object' ? item : { value: item }
    return { ...obj, id: String(obj.id ?? String(i + 1).padStart(2, '0')) }
  })
}

const meta = (name) => document.querySelector(`meta[name="ambar:${name}"]`)?.content

async function previewContext (data) {
  const q = new URLSearchParams(location.search)
  const size = resolveSize(q.get('size') ?? meta('sizes')?.split(',')[0] ?? 'post')
  let items = normalizeItems(null)
  const sources = [q.get('data'), data, meta('data'), 'items.json'].filter(Boolean)
  for (const src of sources) {
    const res = await fetch(src).catch(() => null)
    if (res?.ok) { items = normalizeItems(await res.json()); break }
  }
  const index = Math.max(0, items.findIndex((i) => i.id === q.get('item')))
  return { item: items[index], items, index, count: items.length, size: size.name, width: size.width, height: size.height, safe: size.safe, scale: 1, preview: true }
}

function applyFrame (ctx) {
  const root = document.documentElement
  root.dataset.still = ctx.size
  const set = (k, v) => root.style.setProperty(k, `${v}px`)
  set('--w', ctx.width)
  set('--h', ctx.height)
  for (const [edge, value] of Object.entries(ctx.safe ?? {})) set(`--safe-${edge}`, value)
  // --k: the frame's width over 1080, to scale a layout drawn at 1080 wide
  root.style.setProperty('--k', String(ctx.width / 1080))
  root.style.setProperty('--count', String(ctx.panorama ? ctx.panorama.count : 1))
  root.style.setProperty('--index', String(ctx.index))
  if (ctx.panorama) root.dataset.panorama = String(ctx.panorama.count)
}

// Safe zone outlines, for the browser preview only
function drawGuides (ctx) {
  const frames = ctx.panorama ? ctx.panorama.count : 1
  for (let i = 0; i < frames; i++) {
    const g = document.createElement('div')
    g.dataset.check = 'skip'
    g.className = 'ambar-guide'
    const s = ctx.safe
    Object.assign(g.style, {
      position: 'absolute', zIndex: 9999, pointerEvents: 'none', outline: '2px dashed rgba(255, 64, 64, 0.9)',
      left: `${i * ctx.width + s.left}px`, top: `${s.top}px`, width: `${ctx.width - s.left - s.right}px`, height: `${ctx.height - s.top - s.bottom}px`
    })
    document.body.append(g)
  }
}

// Fit the frame into the browser window while previewing
function fitPreview (ctx) {
  const fit = () => {
    const w = ctx.width * (ctx.panorama ? ctx.panorama.count : 1)
    const k = Math.min(1, innerWidth / w, innerHeight / ctx.height)
    document.body.style.transformOrigin = '0 0'
    document.body.style.transform = `scale(${k})`
  }
  addEventListener('resize', fit)
  fit()
  addEventListener('keydown', (e) => {
    if (ctx.panorama || !['ArrowRight', 'ArrowLeft'].includes(e.key)) return
    const next = ctx.items[(ctx.index + (e.key === 'ArrowRight' ? 1 : ctx.count - 1)) % ctx.count]
    const q = new URLSearchParams(location.search)
    q.set('item', next.id)
    location.search = q.toString()
  })
}

/** Waits for every image (and CSS background image) to be decoded */
async function decodeImages (errors) {
  const jobs = []
  for (const img of document.images) {
    img.loading = 'eager'
    jobs.push(img.decode().catch(() => errors.push(`image failed to load: ${img.getAttribute('src')}`)))
  }
  const urls = new Set()
  for (const el of document.querySelectorAll('*')) {
    for (const pseudo of [null, '::before', '::after']) {
      for (const m of getComputedStyle(el, pseudo).backgroundImage.matchAll(/url\("?(.*?)"?\)/g)) {
        if (!m[1].startsWith('data:')) urls.add(m[1])
      }
    }
  }
  for (const url of urls) {
    const img = new Image()
    img.src = url
    jobs.push(img.decode().catch(() => errors.push(`background image failed to load: ${url}`)))
  }
  await Promise.all(jobs)
}

const frame = () => new Promise((r) => requestAnimationFrame(() => r()))

/**
 * Declares a still template.
 * fonts: font specs to load before layout, e.g. ['800 96px Inter'];
 * setup(ctx): fills the page from ctx.item (may be async);
 * panorama: { count } lays `count` frames side by side in one wide page that
 * the renderer slices, so a background or a drawing runs across the set.
 */
export async function still ({ fonts = [], setup, panorama = null, data } = {}) {
  const injected = window.AMBAR_STILL?.injected ? window.AMBAR_STILL : null
  const ctx = injected ?? await previewContext(data)
  const errors = []
  if (panorama) ctx.panorama = { count: Number(panorama.count ?? ctx.items.length) }
  ctx.frames = ctx.panorama ? ctx.panorama.count : 1
  window.AMBAR_STILL = ctx
  applyFrame(ctx)
  try {
    await Promise.all(fonts.map((spec) => document.fonts.load(spec).then((faces) => {
      if (!faces.length) errors.push(`font not found: ${spec}`)
    })))
    if (setup) await setup(ctx)
    await document.fonts.ready
    await decodeImages(errors)
  } catch (error) {
    errors.push(`setup failed: ${error.message}`)
  }
  if (ctx.preview) {
    if (new URLSearchParams(location.search).has('guides')) drawGuides(ctx)
    fitPreview(ctx)
  }
  await frame()
  await frame()
  ctx.errors = errors
  ctx.ready = true
  return ctx
}
