// The virtual clock `ambar capture` injects into every page it records
// (page.evaluateOnNewDocument(installClock, options)). Frozen, the page's time
// only moves when capture calls window.__ambarClock.step(ms): due timers fire
// in timestamp order (ties by id, intervals re-armed), requestAnimationFrame
// callbacks run once, CSS and Web Animations are set to the same virtual time,
// videos are stepped, a caret is drawn on that time too, and the step resolves
// once the frame is painted. Two runs of the same flow give the same pixels.
//
// CSS animations do not go through timers, so the clock drives them itself:
// every animation it sees is paused and its currentTime set from the virtual
// time it was born at; when it reaches its end, finish() fires the usual
// transitionend / animationend. The recorder also sets the page's animation
// rate to 0 over CDP, so nothing runs ahead on the compositor before the
// clock sees it. This is exact and needs no timing guesses (a slowed-down
// playbackRate would depend on how fast the machine is). GIFs still play in
// real time.
//
// Not frozen (shots and the real-time fallback), it only sets Date to `now`.
// This function is serialized into the page: it must not use anything from
// the module around it.
export function installClock ({ now = null, frozen = true, caret = 'virtual', css = '' } = {}) {
  if (window.__ambarClock) return
  const RealDate = Date
  const real = {
    now: performance.now.bind(performance),
    setTimeout: window.setTimeout.bind(window),
    raf: window.requestAnimationFrame.bind(window)
  }
  const start = now == null ? RealDate.now() : typeof now === 'number' ? now : new RealDate(now).getTime()

  // virtual ms since the session started; a new document of the same tab carries it on
  let vt = 0
  try { vt = Number(sessionStorage.getItem('ambar:vt')) || 0 } catch {}
  const realStart = real.now()
  const clock = () => (frozen ? vt : vt + real.now() - realStart)

  // Date: a subclass whose "now" is start + virtual time
  class VirtualDate extends RealDate {
    constructor (...args) { if (args.length) super(...args); else super(start + clock()) }
    static now () { return start + clock() }
    static [Symbol.hasInstance] (x) { return x instanceof RealDate }
  }
  window.Date = new Proxy(VirtualDate, { apply: () => new VirtualDate().toString() })

  // the style capture keeps in the page: redaction, no native caret, no smooth scrolling
  const keepStyle = () => {
    const rules = css + (frozen ? '* { scroll-behavior: auto !important; }' : '') + (caret !== 'native' && frozen ? '* { caret-color: transparent !important; }' : '')
    if (!rules || !document.documentElement || document.getElementById('ambar-capture-style')) return
    const style = document.createElement('style')
    style.id = 'ambar-capture-style'
    style.textContent = rules
    ;(document.head ?? document.documentElement).append(style)
  }
  new MutationObserver(keepStyle).observe(document, { childList: true })
  document.addEventListener('DOMContentLoaded', keepStyle)
  keepStyle()

  if (!frozen) {
    window.__ambarClock = { frozen: false, keepStyle, now: clock }
    return
  }

  // timers
  const timers = new Map()
  let nextId = 1
  let nesting = 0
  const add = (fn, ms, args, repeat) => {
    const id = nextId++
    let delay = Math.max(0, Number(ms) || 0)
    if (nesting >= 5) delay = Math.max(4, delay) // like browsers: deep chains of 0 ms timers still let time move
    if (repeat) delay = Math.max(1, delay)
    timers.set(id, { at: vt + delay, fn, args, every: repeat ? delay : null, nesting: nesting + 1 })
    return id
  }
  window.setTimeout = (fn, ms, ...args) => add(fn, ms, args, false)
  window.setInterval = (fn, ms, ...args) => add(fn, ms, args, true)
  window.clearTimeout = window.clearInterval = (id) => { timers.delete(id) }
  window.requestIdleCallback = (fn) => add(() => fn({ didTimeout: false, timeRemaining: () => 50 }), 1, [], false)
  window.cancelIdleCallback = window.clearTimeout

  let frames = new Map()
  window.requestAnimationFrame = (fn) => { const id = nextId++; frames.set(id, fn); return id }
  window.cancelAnimationFrame = (id) => { frames.delete(id) }
  performance.now = () => vt

  const run = (fn, args) => {
    try { typeof fn === 'function' ? fn(...args) : (0, eval)(String(fn)) } catch (error) { console.error(error) }
  }
  const fire = (until) => {
    for (let count = 0; count < 100000; count++) {
      let id = null
      let next = null
      for (const [key, timer] of timers) {
        if (timer.at <= until && (!next || timer.at < next.at || (timer.at === next.at && key < id))) { id = key; next = timer }
      }
      if (!next) return
      vt = Math.max(vt, next.at)
      if (next.every != null) next.at += next.every
      else timers.delete(id)
      nesting = next.nesting
      run(next.fn, next.args)
      nesting = 0
    }
    console.error('ambar clock: more than 100000 timers in one frame')
  }
  const flushFrames = () => {
    const due = frames
    frames = new Map()
    for (const fn of due.values()) run(fn, [vt])
  }

  // smooth scrolling asked for by the app runs on virtual time (350 ms, eased)
  const scrolling = new WeakMap()
  const smoothScroll = (target, original, options, relative) => {
    const win = target === window
    const el = win ? document.scrollingElement : target
    const from = [el.scrollLeft, el.scrollTop]
    const to = [
      options.left == null ? from[0] : (relative ? from[0] : 0) + options.left,
      options.top == null ? from[1] : (relative ? from[1] : 0) + options.top
    ]
    const begin = vt
    const token = {}
    scrolling.set(el, token)
    const tick = () => {
      if (scrolling.get(el) !== token) return
      const k = Math.min(1, (vt - begin) / 350)
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2
      original.call(target, { left: from[0] + (to[0] - from[0]) * e, top: from[1] + (to[1] - from[1]) * e, behavior: 'instant' })
      if (k < 1) window.requestAnimationFrame(tick)
    }
    window.requestAnimationFrame(tick)
  }
  for (const [owner, name, relative] of [[Element.prototype, 'scrollTo', false], [Element.prototype, 'scroll', false], [Element.prototype, 'scrollBy', true], [window, 'scrollTo', false], [window, 'scroll', false], [window, 'scrollBy', true]]) {
    const original = owner[name]
    owner[name] = function (...args) {
      if (args[0] && typeof args[0] === 'object' && args[0].behavior === 'smooth') return smoothScroll(this, original, args[0], relative)
      return original.apply(this, args)
    }
  }
  const intoView = Element.prototype.scrollIntoView
  Element.prototype.scrollIntoView = function (options) {
    return intoView.call(this, options && typeof options === 'object' ? { ...options, behavior: 'instant' } : options)
  }

  // CSS transitions, CSS animations and element.animate(): paused, then set from virtual time
  const animations = new WeakMap()
  const driveAnimations = () => {
    if (!document.getAnimations) return
    for (const a of document.getAnimations()) {
      if (a.timeline && a.timeline !== document.timeline) continue // scroll-driven: follows the scroll already
      let s = animations.get(a)
      if (!s) {
        s = a.playState === 'paused' || a.playState === 'finished' ? { skip: true } : { birth: vt, base: a.playbackRate < 0 ? (a.currentTime ?? 0) : 0 }
        animations.set(a, s)
        if (!s.skip) a.pause()
      }
      if (s.skip || s.done) continue
      const time = s.base + (vt - s.birth) * a.playbackRate
      const end = a.effect?.getComputedTiming().endTime ?? Infinity
      if ((a.playbackRate > 0 && time >= end) || (a.playbackRate < 0 && time <= 0)) {
        s.done = true
        a.finish()
      } else a.currentTime = time
    }
  }

  // videos and audio: paused and stepped frame by frame
  const media = new WeakSet()
  const driveMedia = async (ms) => {
    const seeks = []
    for (const m of document.querySelectorAll('video, audio')) {
      if (!m.paused) { m.pause(); media.add(m) }
      if (!media.has(m) || m.ended) continue
      let next = m.currentTime + ms / 1000
      if (m.loop && m.duration) next %= m.duration
      seeks.push(new Promise((resolve) => { m.addEventListener('seeked', resolve, { once: true }); real.setTimeout(resolve, 1000) }))
      m.currentTime = next
    }
    await Promise.all(seeks)
  }

  // a caret that blinks on virtual time (the native one blinks on real time)
  let caretEl = null
  let caretKey = ''
  let caretSince = 0
  const drawCaret = () => {
    const el = document.activeElement
    const typing = el && el.selectionStart != null && el.selectionStart === el.selectionEnd &&
      (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && /^(text|search|email|url|tel|password|number)$/.test(el.type)))
    if (!caretEl) {
      caretEl = document.createElement('div')
      caretEl.setAttribute('aria-hidden', 'true')
      caretEl.style.cssText = 'position:fixed;z-index:2147483647;width:2px;border-radius:1px;pointer-events:none;display:none'
    }
    if (!caretEl.isConnected) document.documentElement.append(caretEl)
    if (!typing) { caretEl.style.display = 'none'; return }
    const key = `${el.value}|${el.selectionStart}`
    if (key !== caretKey) { caretKey = key; caretSince = vt }
    // where the caret sits: a hidden copy of the field with the text up to the caret
    const cs = getComputedStyle(el)
    const mirror = document.createElement('div')
    for (const p of ['boxSizing', 'width', 'paddingLeft', 'paddingRight', 'paddingTop', 'borderLeftWidth', 'borderTopWidth', 'borderStyle', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'textTransform', 'textIndent', 'textAlign', 'lineHeight', 'wordSpacing', 'tabSize']) mirror.style[p] = cs[p]
    mirror.style.position = 'absolute'
    mirror.style.visibility = 'hidden'
    mirror.style.left = '-9999px'
    mirror.style.top = '0'
    mirror.style.whiteSpace = el.tagName === 'TEXTAREA' ? 'pre-wrap' : 'pre'
    mirror.style.overflowWrap = el.tagName === 'TEXTAREA' ? 'break-word' : 'normal'
    const before = el.value.slice(0, el.selectionStart)
    mirror.textContent = el.type === 'password' ? '•'.repeat(before.length) : before
    const mark = document.createElement('span')
    mark.textContent = '​'
    mirror.append(mark)
    document.documentElement.append(mirror)
    const r = el.getBoundingClientRect()
    const size = parseFloat(cs.fontSize)
    const height = Math.round(size * 1.2)
    const x = r.left + el.clientLeft + mark.offsetLeft - el.scrollLeft
    const y = el.tagName === 'TEXTAREA' ? r.top + el.clientTop + mark.offsetTop - el.scrollTop + (mark.offsetHeight - height) / 2 : r.top + r.height / 2 - height / 2
    mirror.remove()
    const on = Math.floor((vt - caretSince) / 530) % 2 === 0
    const color = cs.getPropertyValue('--ambar-caret') || (cs.caretColor && cs.caretColor !== 'transparent' && cs.caretColor !== 'rgba(0, 0, 0, 0)' ? cs.caretColor : cs.color)
    Object.assign(caretEl.style, { display: on ? 'block' : 'none', left: `${x}px`, top: `${y}px`, height: `${height}px`, background: color })
  }

  // scrolls the browser animates itself (snap after a drag, fling, wheel) run in
  // real time: a step waits until they have come to rest
  let lastScroll = -Infinity
  window.addEventListener('scroll', () => { lastScroll = real.now() }, { capture: true, passive: true })
  const scrollRest = async () => {
    const begin = real.now()
    await new Promise((resolve) => real.raf(resolve)) // scroll events go out with a rendering update
    while (real.now() - lastScroll < 70 && real.now() - begin < 2000) await new Promise((resolve) => real.raf(resolve))
  }

  const turn = () => new Promise((resolve) => real.setTimeout(resolve, 0))
  const settle = async () => { for (let i = 0; i < 3; i++) await turn() }
  const paint = () => new Promise((resolve) => real.raf(() => real.setTimeout(resolve, 0)))

  window.__ambarClock = {
    frozen: true,
    keepStyle,
    now: () => vt,
    pending: () => timers.size,
    /** Moves virtual time by ms and resolves once that frame is painted */
    async step (ms) {
      keepStyle()
      await settle() // network responses and other real tasks land before time moves
      await scrollRest()
      const until = vt + ms
      fire(until)
      vt = until
      flushFrames()
      await settle() // renders the frameworks scheduled from those callbacks
      driveAnimations()
      await driveMedia(ms)
      if (caret === 'virtual') drawCaret()
      else if (caretEl) caretEl.style.display = 'none'
      try { sessionStorage.setItem('ambar:vt', String(vt)) } catch {}
      await paint()
      return vt
    }
  }
}
