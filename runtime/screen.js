// AMBAR screencasts: product tutorials over real captures of an app.
// `ambar capture` writes captures/shots.json; screencast() puts those shots
// inside a device frame and gives you a camera, a cursor, clicks, typing, a
// spotlight and callouts. Everything is a pure function of t, like any scene.
import { clamp, css, ease, keys, lerp, progress, span } from './ambar.js'

const fit = (box, pad = 0) => ({ x: box.x - pad, y: box.y - pad, w: box.w + pad * 2, h: box.h + pad * 2 })
const center = (box) => [box.x + box.w / 2, box.y + box.h / 2]

export async function loadShots (url = 'captures/shots.json') {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error(`No ${url}. Run: ambar capture <project>`)
  return response.json()
}

/**
 * Builds a device with the shots inside.
 *   parent        element to put the device in (usually #stage)
 *   data          the content of shots.json
 *   device        'laptop' | 'browser' | 'phone' | 'none'
 *   width         rendered width of the screen, in stage px
 *   url           address shown by the browser frame
 */
export function screencast (parent, data, { device = 'laptop', width = 1240, url = 'app.example.com' } = {}) {
  const vw = data.viewport.width
  const vh = data.viewport.height
  const scale = width / vw

  const root = document.createElement('div')
  root.className = `sc-device sc-${device}`
  root.innerHTML = `
    <div class="sc-body">
      ${device === 'browser' || device === 'laptop' ? `<div class="sc-chrome" data-check="skip"><i></i><i></i><i></i><span>${url}</span></div>` : ''}
      <div class="sc-screen"><div class="sc-content">
        <div class="sc-shots"></div>
        <div class="sc-dim"></div>
        <div class="sc-overlay"></div>
        <div class="sc-cursor"><svg viewBox="0 0 24 24"><path d="M4 2l15 11.2-6.6.9 3.9 7.6-3 1.5-3.9-7.7L4 20z"/></svg></div>
      </div></div>
    </div>
    ${device === 'laptop' ? '<div class="sc-base"></div>' : ''}`
  parent.append(root)

  const screen = root.querySelector('.sc-screen')
  const content = root.querySelector('.sc-content')
  css(screen, { width: `${width}px`, height: `${vh * scale}px` })
  css(content, { width: `${vw}px`, height: `${vh}px` })

  const shots = {}
  for (const [name, shot] of Object.entries(data.shots)) {
    const img = document.createElement('img')
    img.src = shot.file
    img.className = 'sc-shot'
    css(img, { width: `${vw}px`, height: `${vh}px`, opacity: 0 })
    root.querySelector('.sc-shots').append(img)
    shots[name] = img
  }

  const overlay = root.querySelector('.sc-overlay')
  const cursorEl = root.querySelector('.sc-cursor')
  const dim = root.querySelector('.sc-dim')
  const made = new Map()
  const piece = (key, className) => {
    if (!made.has(key)) {
      const el = document.createElement('div')
      el.className = className
      overlay.append(el)
      made.set(key, el)
    }
    return made.get(key)
  }

  /** "shot.box" → { x, y, w, h } in screen px; a box object passes through */
  const box = (ref) => {
    if (typeof ref !== 'string') return ref
    const [shot, key] = ref.split('.')
    const b = data.shots[shot]?.boxes?.[key]
    if (!b) throw new Error(`No box "${ref}" in shots.json`)
    return b
  }
  const point = (ref) => (Array.isArray(ref) ? ref : center(box(ref)))

  let zoom = 1

  return {
    root,
    box,
    images: shots,

    /** Which shot is on screen: [[time, name], ...]; each one fades in over the previous */
    show (t, timeline, fade = 0.35) {
      let active = 0
      timeline.forEach(([at], i) => { if (t >= at) active = i })
      for (const img of Object.values(shots)) img.style.opacity = 0
      const [at, name] = timeline[active]
      const below = timeline[active - 1]?.[1]
      if (below && shots[below]) shots[below].style.opacity = 1
      if (shots[name]) {
        shots[name].style.opacity = active === 0 ? 1 : ease.inOut(progress(t, at, fade))
        shots[name].style.zIndex = 2
        if (below && shots[below]) shots[below].style.zIndex = 1
      }
    },

    /** Camera keyframes [[time, zoom, x, y]]: (x, y) is the point kept in the middle */
    camera (t, frames) {
      const [z, x, y] = keys(t, frames.map(([at, zz, target]) => [at, zz, ...point(target)]))
      zoom = z
      const tx = clamp(vw / 2 - x * z, vw - vw * z, 0)
      const ty = clamp(vh / 2 - y * z, vh - vh * z, 0)
      css(content, { transform: `translate(${tx * scale}px, ${ty * scale}px) scale(${z * scale})` })
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
    }
  }
}
