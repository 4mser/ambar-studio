// AMBAR screencasts: product tutorials over real captures of an app.
// `ambar capture` writes captures/shots.json (stills) and captures/clips.json
// (the app recorded in motion). screencast() puts them inside a device frame
// and gives you a camera, a cursor, clicks, typing, a spotlight, callouts,
// rings, a phone camera, pop-out cards and recorded clips with their taps.
// Everything is a pure function of t, like any scene.
import { clamp, css, ease, keys, lerp, progress, span } from './ambar.js'

const fit = (box, pad = 0) => ({ x: box.x - pad, y: box.y - pad, w: box.w + pad * 2, h: box.h + pad * 2 })
const center = (box) => [box.x + box.w / 2, box.y + box.h / 2]
const frameFile = (meta, i) => `${meta.dir}/${String(i + 1).padStart(4, '0')}.jpg`

// Images that change source while a frame is drawn are decoded before the
// renderer takes its screenshot: every change pushes its decode() here, and
// render awaits window.AMBAR_PENDING after each render(t).
window.AMBAR_PENDING = window.AMBAR_PENDING ?? []
const pending = (img) => { window.AMBAR_PENDING.push(img.decode().catch(() => {})) }

// Until the renderer awaits AMBAR_PENDING itself, render(t) returns a promise
// for them, which page.evaluate waits for. Harmless once it does.
if (!Object.getOwnPropertyDescriptor(window, 'AMBAR')?.set) {
  let current = window.AMBAR
  Object.defineProperty(window, 'AMBAR', {
    configurable: true,
    get: () => current,
    set (value) {
      if (value && typeof value.render === 'function' && !value.render.awaitsImages) {
        const draw = value.render
        value.render = (t) => {
          const out = draw(t)
          const list = window.AMBAR_PENDING.splice(0)
          return list.length ? Promise.all(list).then(() => out) : out
        }
        value.render.awaitsImages = true
      }
      current = value
    }
  })
}

export async function loadShots (url = 'captures/shots.json') {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error(`No ${url}. Run: ambar capture <project>`)
  return response.json()
}

/** The recorded clips: { viewport, scale, clips: { name: meta } } */
export async function loadClips (url = 'captures/clips.json') {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error(`No ${url}. Add "recordings" to capture.json and run: ambar capture <project>`)
  return response.json()
}

const STATUS_ICONS = `<svg viewBox="0 0 17 11" width="18" height="12"><rect x="0" y="7" width="3" height="4" rx="1"/><rect x="4.5" y="5" width="3" height="6" rx="1"/><rect x="9" y="2.5" width="3" height="8.5" rx="1"/><rect x="13.5" y="0" width="3" height="11" rx="1"/></svg>
  <svg viewBox="0 0 15 11" width="16" height="12"><path d="M7.5 2.2c2.3 0 4.4.9 6 2.4l1.1-1.2A10.2 10.2 0 0 0 7.5.5 10.2 10.2 0 0 0 .4 3.4l1.1 1.2c1.6-1.5 3.7-2.4 6-2.4zm0 3.4c1.4 0 2.6.5 3.6 1.4l1.1-1.2a6.9 6.9 0 0 0-9.4 0l1.1 1.2c1-.9 2.2-1.4 3.6-1.4zM7.5 9 9 7.5a2.2 2.2 0 0 0-3 0z"/></svg>
  <svg viewBox="0 0 25 12" width="27" height="13"><rect x=".5" y=".5" width="21" height="11" rx="3.2" fill="none" stroke="currentColor" opacity=".45"/><rect x="2" y="2" width="15" height="8" rx="2"/><rect x="22.6" y="4" width="1.6" height="4" rx=".8" opacity=".45"/></svg>`

/**
 * Builds a device with the shots and clips inside.
 *   parent        element to put the device in (usually #stage)
 *   data          shots.json, clips.json, or both: { ...shots, clips: clips.clips }
 *   device        'laptop' | 'browser' | 'phone' | 'none'
 *   width         rendered width of the screen, in stage px
 *   url           address shown by the browser frame
 *   status        phone only: a time ('9:41') draws a status bar and a home indicator
 *   statusColor   colour of the status bar and the home indicator
 */
export function screencast (parent, data, { device = 'laptop', width = 1240, url = 'app.example.com', status = null, statusColor = '#111' } = {}) {
  const vw = data.viewport.width
  const vh = data.viewport.height
  const scale = width / vw
  const clips = data.clips ?? {}

  const root = document.createElement('div')
  root.className = `sc-device sc-${device}`
  root.innerHTML = `
    <div class="sc-cam">
      <div class="sc-body">
        ${device === 'browser' || device === 'laptop' ? `<div class="sc-chrome" data-check="skip"><i></i><i></i><i></i><span>${url}</span></div>` : ''}
        <div class="sc-screen"><div class="sc-content"><div class="sc-page">
          <div class="sc-shots"></div>
          <div class="sc-dim"></div>
          <div class="sc-overlay"></div>
          <div class="sc-cursor"><svg viewBox="0 0 24 24"><path d="M4 2l15 11.2-6.6.9 3.9 7.6-3 1.5-3.9-7.7L4 20z"/></svg></div>
        </div></div>
        ${device === 'phone' && status ? `<div class="sc-status" data-check="skip" style="color:${statusColor}"><span>${status}</span><span class="sc-icons">${STATUS_ICONS}</span></div><div class="sc-home" style="background:${statusColor}"></div>` : ''}
        </div>
      </div>
      ${device === 'laptop' ? '<div class="sc-base"></div>' : ''}
    </div>`
  parent.append(root)

  const cam = root.querySelector('.sc-cam')
  const body = root.querySelector('.sc-body')
  const screen = root.querySelector('.sc-screen')
  const content = root.querySelector('.sc-content')
  const page = root.querySelector('.sc-page')
  css(screen, { width: `${width}px`, height: `${vh * scale}px` })
  screen.style.setProperty('--k', scale)
  css(content, { width: `${vw}px`, height: `${vh}px` })

  const layers = {}
  const images = {}
  for (const [name, shot] of Object.entries(data.shots ?? {})) {
    const img = document.createElement('img')
    img.src = shot.file
    img.className = 'sc-shot'
    css(img, { width: `${vw}px`, height: `${shot.height ?? vh}px`, opacity: 0 })
    root.querySelector('.sc-shots').append(img)
    layers[name] = img
    images[name] = img
  }
  const clipEls = {}
  for (const [name, meta] of Object.entries(clips)) {
    const cw = meta.viewport.width
    const ch = meta.viewport.height
    const layer = document.createElement('div')
    layer.className = 'sc-clip'
    layer.innerHTML = `<img class="sc-shot" alt=""><svg class="sc-taps" viewBox="0 0 ${cw} ${ch}" width="${cw}" height="${ch}"></svg>`
    css(layer, { width: `${cw}px`, height: `${ch}px`, transform: `scale(${vw / cw})`, opacity: 0, display: 'none' })
    const img = layer.querySelector('img')
    css(img, { width: `${cw}px`, height: `${ch}px` })
    img.src = frameFile(meta, 0)
    root.querySelector('.sc-shots').append(layer)
    layers[name] = layer
    images[name] = img
    clipEls[name] = { layer, img, taps: layer.querySelector('svg'), meta }
  }

  const overlay = root.querySelector('.sc-overlay')
  const cursorEl = root.querySelector('.sc-cursor')
  const dim = root.querySelector('.sc-dim')
  const made = new Map()
  const piece = (key, className, into = overlay) => {
    if (!made.has(key)) {
      const el = document.createElement('div')
      el.className = className
      into.append(el)
      made.set(key, el)
    }
    return made.get(key)
  }

  /**
   * "shot.box" or "clip.mark.box" → { x, y, w, h } in app px; a box object passes through.
   * Clip boxes are the ones measured at a `mark` action of the recording.
   */
  const box = (ref) => {
    if (typeof ref !== 'string') return ref
    const parts = ref.split('.')
    const b = parts.length === 3 ? clips[parts[0]]?.boxes?.[parts[1]]?.boxes?.[parts[2]] : data.shots?.[parts[0]]?.boxes?.[parts[1]]
    if (!b) throw new Error(`No box "${ref}" in ${parts.length === 3 ? 'clips.json' : 'shots.json'}`)
    return b
  }
  const point = (ref) => (Array.isArray(ref) ? ref : center(box(ref)))

  let zoom = 1
  let showing = false // show() picks the layer on screen; without it, the last clip() does
  const lifts = new Map()

  // a clip loads its frame only while it is on screen, whichever of show() and
  // clip() runs first: hidden clips do not churn images (or the renderer)
  const syncClip = (name) => {
    const { img, layer, want } = clipEls[name]
    if (!want || layer.style.display === 'none' || img.getAttribute('src') === want) return
    img.setAttribute('src', want)
    pending(img)
  }

  // finger presses and drags from the recording, at clip time c
  const drawTouches = (meta, c) => {
    const taps = (meta.taps ?? []).map(([t0, x, y]) => {
      const f = (c - t0 + 0.35) / 0.95
      if (f <= 0 || f >= 1) return ''
      const down = Math.min(1, f / 0.37)
      const wave = f > 0.37 ? (f - 0.37) / 0.63 : 0
      return `<circle cx="${x}" cy="${y}" r="${lerp(30, 19, ease.out(down))}" fill="rgba(255,255,255,${0.28 * (1 - wave)})" stroke="rgba(255,255,255,.9)" stroke-width="2" opacity="${(1 - wave) * Math.min(1, f * 6)}"/>` +
        `<circle cx="${x}" cy="${y}" r="${19 + wave * 46}" fill="none" stroke="#f2a324" stroke-width="2.5" opacity="${wave > 0 ? 1 - wave : 0}"/>`
    })
    const drags = (meta.drags ?? []).map(([t0, x0, y0, t1, x1, y1]) => {
      const k = span(c, t0 - 0.15, t1 + 0.3, 0.15, 0.25)
      if (k <= 0) return ''
      const m = ease.inOut(progress(c, t0, t1 - t0))
      return `<circle cx="${lerp(x0, x1, m)}" cy="${lerp(y0, y1, m)}" r="19" fill="rgba(255,255,255,.28)" stroke="rgba(255,255,255,.9)" stroke-width="2" opacity="${k}"/>`
    })
    return taps.join('') + drags.join('')
  }

  return {
    root,
    box,
    images,
    layers,
    /** The meta of every clip: fps, frames, taps, drags, marks, boxes, firstChange */
    clips,

    /** Resolves when every shot and the first frame of every clip are decoded (await it in setup) */
    ready () { return Promise.all(Object.values(images).map((img) => img.decode().catch(() => {}))) },

    /** Which shot or clip is on screen: [[time, name], ...]; each one fades in over the previous */
    show (t, timeline, fade = 0.35) {
      showing = true
      let active = 0
      timeline.forEach(([at], i) => { if (t >= at) active = i })
      for (const el of Object.values(layers)) { el.style.opacity = 0; el.style.zIndex = 0; el.style.display = 'none' }
      const [at, name] = timeline[active]
      const below = timeline[active - 1]?.[1]
      if (below && layers[below]) { layers[below].style.opacity = 1; layers[below].style.zIndex = 1; layers[below].style.display = '' }
      if (layers[name]) {
        layers[name].style.opacity = active === 0 ? 1 : ease.inOut(progress(t, at, fade))
        layers[name].style.display = ''
        layers[name].style.zIndex = 2
      }
      for (const key of Object.keys(clipEls)) syncClip(key)
    },

    /**
     * Shows the frame of a recorded clip at scene time tc (seconds since the clip
     * started in the scene) and draws its taps. Returns the clip time.
     *   rate      playback speed; 1.25–1.35 makes an app feel agile
     *   from      clip second the scene starts at (e.g. meta.firstChange - 0.2)
     *   hold      after the end, keep the last frame (false hides the clip)
     *   pingpong  after the end, play backwards
     *   taps      draw the recorded taps and drags
     *   opacity   set the clip's opacity (otherwise show() decides)
     */
    clip (name, tc, { rate = 1, from = 0, hold = true, pingpong = false, taps = true, opacity } = {}) {
      const c0 = clipEls[name]
      if (!c0) throw new Error(`No clip "${name}" in clips.json`)
      const { meta, layer } = c0
      const end = (meta.frames - 1) / meta.fps
      let c = from + Math.max(0, tc) * rate
      if (pingpong && c > end) c = Math.max(0, end - ((c - end) % (2 * end || 1)))
      const i = clamp(Math.round(c * meta.fps), 0, meta.frames - 1)
      c0.want = frameFile(meta, i)
      layer.style.visibility = !hold && !pingpong && c > end + 0.5 / meta.fps ? 'hidden' : 'visible'
      if (opacity !== undefined) css(layer, { opacity, display: opacity > 0 ? '' : 'none' })
      else if (!showing) {
        for (const other of Object.values(clipEls)) css(other.layer, { opacity: 0, display: 'none' })
        css(layer, { opacity: 1, display: '' })
      }
      syncClip(name)
      c0.taps.innerHTML = taps ? drawTouches(meta, c) : ''
      return c
    },

    /** Camera keyframes [[time, zoom, x, y]]: (x, y) is the point kept in the middle */
    camera (t, frames) {
      const [z, x, y] = keys(t, frames.map(([at, zz, target]) => [at, zz, ...point(target)]))
      zoom = z
      const tx = clamp(vw / 2 - x * z, vw - vw * z, 0)
      const ty = clamp(vh / 2 - y * z, vh - vh * z, 0)
      css(content, { transform: `translate(${tx * scale}px, ${ty * scale}px) scale(${z * scale})` })
    },

    /** Scrolls a tall shot inside the screen: keyframes [[time, y]] in app px */
    scroll (t, frames) {
      const [y] = keys(t, frames)
      css(page, { transform: `translateY(${-y}px)` })
    },

    /**
     * The whole device as seen by a camera: keyframes [[time, { ax, ay, s, dx, dy }]].
     * With s > 1 it zooms toward the app point (ax, ay), which stays where it is
     * (plus dx, dy stage px). The final framings are interpolated in a straight
     * line. s is capped at 1.3 so the phone never leaves the frame.
     */
    frame (t, frames) {
      const ox = body.offsetLeft + screen.offsetLeft
      const oy = body.offsetTop + screen.offsetTop
      const framing = ({ ax = vw / 2, ay = vh / 2, s = 1, dx = 0, dy = 0 }) => {
        const z = Math.min(1.3, s)
        const px = ox + ax * scale
        const py = oy + ay * scale
        return [px * (1 - z) + dx, py * (1 - z) + dy, z]
      }
      const [x, y, s] = keys(t, frames.map(([at, f]) => [at, ...framing(f)]))
      css(cam, { transform: `translate(${x}px, ${y}px) scale(${s})` })
    },

    /** Cursor keyframes [[time, target]] and click times; it stays the same size on screen */
    cursor (t, frames, clicks = []) {
      const [x, y] = keys(t, frames.map(([at, target]) => [at, ...point(target)]), ease.inOutSine)
      const pressed = clicks.some((c) => t >= c && t < c + 0.14)
      css(cursorEl, {
        left: `${x}px`,
        top: `${y}px`,
        opacity: frames.length ? span(t, frames[0][0] - 0.3, frames[frames.length - 1][0] + 0.8, 0.3, 0.3) : 0,
        transform: `scale(${(pressed ? 0.82 : 1) / (zoom * scale)})`
      })
      clicks.forEach((c, i) => {
        const ring = piece(`click${i}`, 'sc-click')
        const k = progress(t, c, 0.5)
        const [cx, cy] = keys(c, frames.map(([at, target]) => [at, ...point(target)]), ease.inOutSine)
        css(ring, {
          left: `${cx}px`,
          top: `${cy}px`,
          opacity: t >= c && k < 1 ? 0.9 * (1 - k) : 0,
          transform: `translate(-50%, -50%) scale(${(0.3 + k * 1.4) / (zoom * scale)})`
        })
      })
    },

    /** Text typed into a field (over its empty capture), from `at` at `rate` chars/s */
    type (t, { box: ref, text, at, rate = 16, until = Infinity, mask = false }) {
      const b = box(ref)
      const el = piece(`type:${ref}`, 'sc-type')
      const n = Math.floor(clamp((t - at) * rate, 0, text.length))
      const shown = mask ? '•'.repeat(n) : text.slice(0, n)
      const caret = t >= at && t < until && (n < text.length || Math.floor(t * 2) % 2 === 0)
      el.innerHTML = `${shown.replace(/</g, '&lt;')}<i style="opacity:${caret ? 1 : 0}"></i>`
      css(el, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px`, opacity: t >= at && t < until ? 1 : 0 })
    },

    /** Dims everything except a box between from and to */
    spotlight (t, { box: ref, from, to, pad = 10, radius = 14 }) {
      const k = span(t, from, to, 0.4, 0.4)
      if (k <= 0) return
      const b = fit(box(ref), pad)
      css(dim, {
        left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px`,
        borderRadius: `${radius}px`, opacity: k,
        boxShadow: `0 0 0 4000px rgba(8, 4, 1, ${0.62 * k}), 0 0 0 3px rgba(242, 163, 36, ${k})`
      })
    },

    /** Clears the spotlight; call once per frame before spotlight() */
    clear () { css(dim, { opacity: 0 }) },

    /** A highlight ring around a measured box, with 8–10 px of air, between from and to */
    ring (t, { box: ref, from, to, pad = 9, radius = 14 }) {
      const b = fit(box(ref), pad)
      const el = piece(`ring:${typeof ref === 'string' ? ref : JSON.stringify(ref)}`, 'sc-ring')
      const k = span(t, from, to, 0.35, 0.35)
      css(el, {
        left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px`,
        borderRadius: `${radius}px`, borderWidth: `${3 / (zoom * scale)}px`,
        opacity: k, transform: `scale(${lerp(1.06, 1, ease.out(k))})`
      })
    },

    /** A label that points at a box */
    callout (t, { box: ref, text, from, to, side = 'right', gap = 18 }) {
      const b = box(ref)
      const el = piece(`callout:${ref}:${text}`, `sc-callout sc-${side}`)
      el.textContent = text
      const k = span(t, from, to, 0.45, 0.35)
      const x = side === 'right' ? b.x + b.w + gap : side === 'left' ? b.x - gap : b.x + b.w / 2
      const y = side === 'bottom' ? b.y + b.h + gap : side === 'top' ? b.y - gap : b.y + b.h / 2
      css(el, {
        left: `${x}px`,
        top: `${y}px`,
        opacity: k,
        transform: `${{ right: 'translate(0, -50%)', left: 'translate(-100%, -50%)', bottom: 'translate(-50%, 0)', top: 'translate(-50%, -100%)' }[side]} scale(${lerp(0.9, 1, k) / zoom})`
      })
    },

    /**
     * A pop-out card: an exact crop of what the screen shows lifts out of the
     * device to (x, y) with the given width (stage px, in the device's parent),
     * while the screen blurs and darkens a little; it goes back at `until`.
     *   layer   the shot or clip to crop (its current frame)
     *   box     the area to crop: a box ref or { x, y, w, h } in app px
     */
    popout (t, { layer, box: ref, at, until = Infinity, x, y, width, radius = 18, duration = 0.6 }) {
      const key = `${layer}:${typeof ref === 'string' ? ref : JSON.stringify(ref)}:${at}`
      const b = box(ref)
      const src = images[layer]
      if (!src) throw new Error(`No shot or clip "${layer}" to pop out`)
      const k = ease.inOut(progress(t, at, duration)) * (1 - ease.inOut(progress(t, until, duration)))
      lifts.set(key, k)
      const lift = Math.max(...lifts.values())
      css(screen, { filter: lift > 0 ? `blur(${2.5 * lift}px) brightness(${1 - 0.16 * lift})` : '' })

      const probe = piece(`probe:${key}`, 'sc-probe')
      css(probe, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` })
      const card = piece(`card:${key}`, 'sc-popout', root.parentElement)
      if (!card.firstChild) card.append(document.createElement('img'))
      const img = card.firstChild
      if (k <= 0) { card.style.display = 'none'; return }
      if (img.getAttribute('src') !== src.getAttribute('src')) { img.setAttribute('src', src.getAttribute('src')); pending(img) }
      // where the crop sits now, in the parent's own px (the stage may be scaled in preview)
      const host = root.parentElement
      const hr = host.getBoundingClientRect()
      const unit = host.offsetWidth / hr.width || 1
      const pr = probe.getBoundingClientRect()
      const start = { x: (pr.left - hr.left) * unit, y: (pr.top - hr.top) * unit, w: pr.width * unit }
      const w = lerp(start.w, width, k)
      const f = w / b.w
      const layerW = clips[layer]?.viewport.width ?? vw
      const layerH = clips[layer]?.viewport.height ?? data.shots?.[layer]?.height ?? vh
      const s = layerW / vw
      css(card, {
        display: 'block', left: `${lerp(start.x, x, k)}px`, top: `${lerp(start.y, y, k)}px`, width: `${w}px`, height: `${b.h * f}px`,
        borderRadius: `${radius * k}px`,
        boxShadow: `0 ${40 * k}px ${90 * k}px -${20 * k}px rgba(0, 0, 0, ${0.6 * k}), 0 0 0 1px rgba(255, 255, 255, ${0.08 * k})`
      })
      css(img, { width: `${(layerW / s) * f}px`, height: `${(layerH / s) * f}px`, left: `${-b.x * f}px`, top: `${-b.y * f}px` })
    }
  }
}
