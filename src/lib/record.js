// Records a web app in motion for `ambar capture`. Each recording opens in a
// fresh browser context (clean storage and cookies), on a mobile or desktop
// viewport, with the network guard and the virtual clock installed. Time only
// moves one frame at a time: before each frame the scripted actions due on it
// run (taps, clicks, typing, scrolls, drags, wheel, keys, marks), then the
// clock steps 1/fps, then the frame is saved as captures/<name>/0001.jpg…
// Every touch is logged with its time and place in meta.json so a scene can
// draw the finger exactly where and when it happened.
//
// mode "realtime" is the fallback for apps the clock cannot drive: the app
// runs on real time, frames come from the CDP screencast at device resolution
// and are resampled to the frame rate (a still screen sends no frames, so the
// last one is held). It is not deterministic.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { installClock } from './clock.js'
import { guardNetwork } from './network.js'

const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2)
const round = (x, d = 3) => Math.round(x * 10 ** d) / 10 ** d
export const REDACT_CSS = (selectors = []) => (selectors.length ? `${selectors.join(',')} { filter: blur(7px) !important; }` : '')

// Runs in the page. Everything a recording asks of the DOM, in one function
// so it can be sent with page.evaluate.
function inPage (op, arg) {
  const norm = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
  const visible = (el) => {
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) return false
    for (let n = el; n; n = n.parentElement) {
      const s = getComputedStyle(n)
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false
    }
    return true
  }
  // a CSS selector, or text=Label: the innermost visible element with that text
  const find = (target) => {
    if (!target.startsWith('text=')) return [...document.querySelectorAll(target)].find(visible) ?? document.querySelector(target)
    const text = norm(target.slice(5))
    const all = [...document.querySelectorAll('body *')].filter((el) => !['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(el.tagName) && norm(el.textContent).includes(text))
    const leaves = all.filter((el) => visible(el) && !all.some((o) => o !== el && el.contains(o) && visible(o)))
    const inView = (el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth }
    const exact = leaves.filter((el) => norm(el.textContent) === text)
    const pick = (list) => list.find(inView) ?? list[0]
    return pick(exact) ?? pick(leaves) ??
      [...document.querySelectorAll('[aria-label], [placeholder], input[type=submit], input[type=button]')].find((el) => visible(el) && [el.getAttribute('aria-label'), el.getAttribute('placeholder'), el.value].some((v) => norm(v) === text))
  }
  const need = (target) => {
    const el = find(target)
    if (!el) throw new Error(`"${target}" was not found on the page`)
    return el
  }
  const box = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } }

  if (op === 'point') {
    const el = need(arg)
    const r = el.getBoundingClientRect()
    if (r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth) el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' })
    const b = el.getBoundingClientRect()
    return [Math.round(b.x + b.width / 2), Math.round(b.y + b.height / 2)]
  }
  if (op === 'boxes') {
    const out = {}
    for (const [key, target] of Object.entries(arg.boxes)) {
      const el = find(target)
      if (!el) throw new Error(`"${target}" (${key}) was not found on the page`)
      const b = box(el)
      out[key] = { ...b, y: b.y + (arg.page ? Math.round(scrollY) : 0) }
    }
    return out
  }
  if (op === 'focus') { need(arg).focus(); return true }
  if (op === 'click') { need(arg).click(); return true }
  if (op === 'clickWaiter') {
    // a real tap becomes a click a moment later: the recording waits for it
    window.__ambarClicked = new Promise((resolve) => addEventListener('click', () => resolve(true), { once: true, capture: true }))
    return true
  }
  if (op === 'scroller') {
    // the element to scroll: the one named, or the largest that can scroll on that axis
    const { id, axis, target } = arg
    const y = axis !== 'x'
    let el = target ? need(target) : null
    if (!el) {
      const can = (e) => {
        const s = getComputedStyle(e)
        return y ? /(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 1 : /(auto|scroll)/.test(s.overflowX) && e.scrollWidth > e.clientWidth + 1
      }
      const list = [...document.querySelectorAll('body *')].filter((e) => can(e) && visible(e))
      const root = document.scrollingElement
      if (y ? root.scrollHeight > root.clientHeight + 1 : root.scrollWidth > root.clientWidth + 1) list.push(root)
      list.sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)
      el = list[0]
    }
    if (!el) throw new Error(`nothing on the page can scroll ${y ? 'vertically' : 'horizontally'}`)
    el.style.scrollSnapType = 'none'
    el.style.scrollBehavior = 'auto'
    window.__ambarScrollers = window.__ambarScrollers ?? {}
    window.__ambarScrollers[id] = el
    const max = y ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth
    return { from: y ? el.scrollTop : el.scrollLeft, max }
  }
  if (op === 'scrollTo') {
    const el = window.__ambarScrollers?.[arg.id]
    if (el) el[arg.axis === 'x' ? 'scrollLeft' : 'scrollTop'] = Math.round(arg.value * devicePixelRatio) / devicePixelRatio // whole device pixels
    return true
  }
  throw new Error(`unknown op ${op}`)
}

/** Opens a fresh context and page set up for capturing; shared with still shots */
export async function preparePage (browser, o, { frozen }) {
  const context = await browser.createBrowserContext()
  const page = await context.newPage()
  const vp = o.viewport
  const touch = vp.touch ?? Boolean(vp.mobile)
  await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: o.scale, isMobile: Boolean(vp.mobile), hasTouch: touch })
  if (o.timezone) await page.emulateTimezone(o.timezone)
  const cdp = await page.createCDPSession()
  if (o.safeArea) {
    try {
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, bottom: 0, left: 0, right: 0, ...o.safeArea } })
    } catch (error) {
      console.warn(`  ! this Chrome cannot emulate safe areas (${error.message.split('\n')[0]})`)
    }
  }
  const net = await guardNetwork(page, o.rules, new URL(o.target).origin)
  page.on('pageerror', (error) => console.warn(`  ! page error: ${error.message.split('\n')[0]}`))
  await page.evaluateOnNewDocument(installClock, { now: o.now ?? null, frozen, caret: o.caret ?? 'virtual', css: REDACT_CSS(o.redact) })

  // seeded storage, once per context and only on the app's own origin
  const origin = new URL(o.target).origin
  const storage = o.storage ?? {}
  const seeded = storage.local || storage.session ? storage : { local: storage }
  const asText = (obj = {}) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]))
  if (Object.keys(seeded.local ?? {}).length || Object.keys(seeded.session ?? {}).length) {
    await page.evaluateOnNewDocument((app, local, session) => {
      if (location.origin !== app) return
      try {
        if (sessionStorage.getItem('ambar:seeded')) return
        for (const [k, v] of Object.entries(local)) localStorage.setItem(k, v)
        for (const [k, v] of Object.entries(session)) sessionStorage.setItem(k, v)
        sessionStorage.setItem('ambar:seeded', '1')
      } catch {}
    }, origin, asText(seeded.local), asText(seeded.session))
  }
  if (o.cookies?.length) await page.setCookie(...o.cookies.map((c) => ({ url: c.domain ? undefined : o.target, ...c })))
  return { context, page, net, cdp, touch }
}

/** One clock step in every frame of the page; survives a navigation in between */
async function stepClock (page, net, ms) {
  await net.idle()
  const step = (frame) => frame.evaluate((t) => (window.__ambarClock?.frozen ? window.__ambarClock.step(t) : null), ms)
  const children = page.frames().filter((f) => f !== page.mainFrame()).map((f) => step(f).catch(() => null))
  try {
    await step(page.mainFrame())
  } catch (error) {
    if (!/context|detached|navigat|Target closed/i.test(error.message)) throw error
    await page.waitForFunction(() => window.__ambarClock, { timeout: 60000 })
    await step(page.mainFrame())
  }
  await Promise.all(children)
}

/** The actions of a recording, each on the frame it starts */
export function plan (actions = [], fps) {
  return actions.map((a, index) => {
    if (typeof a.at !== 'number') throw new Error(`capture: every action needs "at" (seconds): ${JSON.stringify(a)}`)
    return { ...a, index, frame: Math.round(a.at * fps) }
  })
}

// Starts an action on frame `frame`; returns a per-frame function for the ones
// that last (typing, scroll, drag, wheel), which returns true when done.
async function begin (a, s) {
  const { page, fps, net } = s
  const t = round(a.frame / fps)
  const point = async (target) => (Array.isArray(target) ? target : page.evaluate(inPage, 'point', target))
  const pressAt = async (x, y, touch) => {
    if (touch) {
      await page.evaluate(inPage, 'clickWaiter')
      await page.touchscreen.tap(x, y)
      // the click a tap turns into arrives on its own; wait for it so it lands on this frame
      await Promise.race([page.evaluate(() => window.__ambarClicked).catch(() => {}), new Promise((resolve) => setTimeout(resolve, 1000))])
    } else await page.mouse.click(x, y)
  }

  if (a.tap !== undefined || a.click !== undefined) {
    const target = a.tap ?? a.click
    const [x, y] = await point(target)
    if (a.dom && !Array.isArray(target)) await page.evaluate(inPage, 'click', target)
    else await pressAt(x, y, a.tap !== undefined && s.touch)
    s.taps.push([t, x, y])
    return null
  }
  if (a.hover !== undefined) {
    const [x, y] = await point(a.hover)
    await page.mouse.move(x, y)
    return null
  }
  if (a.focus !== undefined) { await page.evaluate(inPage, 'focus', a.focus); return null }
  if (a.key !== undefined) {
    await page.keyboard.press(a.key)
    s.keys.push([t, a.key])
    return null
  }
  if (a.release !== undefined) { net.release(a.release); return null }
  if (a.goto !== undefined) {
    await page.goto(new URL(a.goto, page.url()).href, { waitUntil: 'load', timeout: 120000 })
    return null
  }
  if (a.mark !== undefined) {
    s.marks.push([t, a.mark])
    if (a.boxes) s.measure.push({ label: a.mark, t, boxes: a.boxes })
    return null
  }
  if (a.type !== undefined) {
    if (a.into) await page.evaluate(inPage, 'focus', a.into)
    const text = String(a.type)
    const every = Math.max(1, a.every ?? 2)
    return async (frame) => {
      const k = frame - a.frame
      if (k % every === 0 && k / every < text.length) await page.keyboard.type(text[k / every])
      return k / every >= text.length - 1
    }
  }
  if (a.scroll !== undefined) {
    const o = typeof a.scroll === 'number' ? { to: a.scroll } : a.scroll
    const axis = o.axis ?? 'y'
    const { from, max } = await page.evaluate(inPage, 'scroller', { id: a.index, axis, target: o.in ?? null })
    const to = Math.max(0, Math.min(max, o.to === 'end' ? max : o.to ?? from + (o.by ?? 0)))
    const n = Math.max(1, Math.round((o.duration ?? 0.8) * fps))
    return async (frame) => {
      const k = Math.min(1, (frame - a.frame + 1) / n)
      await page.evaluate(inPage, 'scrollTo', { id: a.index, axis, value: from + (to - from) * easeInOut(k) })
      return k >= 1
    }
  }
  if (a.drag !== undefined || a.swipe !== undefined) {
    const o = a.drag ?? a.swipe
    const [x0, y0] = await point(o.from)
    const [x1, y1] = o.to ? await point(o.to) : [x0 + (o.by?.[0] ?? 0), y0 + (o.by?.[1] ?? 0)]
    const n = Math.max(1, Math.round((o.duration ?? 0.5) * fps))
    s.drags.push([t, x0, y0, round((a.frame + n) / fps), x1, y1])
    return async (frame) => {
      const k = Math.min(1, (frame - a.frame) / n)
      const x = x0 + (x1 - x0) * easeInOut(k)
      const y = y0 + (y1 - y0) * easeInOut(k)
      if (s.touch) {
        if (k === 0) await page.touchscreen.touchStart(x, y)
        else await page.touchscreen.touchMove(x, y)
        if (k >= 1) await page.touchscreen.touchEnd()
      } else {
        await page.mouse.move(x, y)
        if (k === 0) await page.mouse.down()
        if (k >= 1) await page.mouse.up()
      }
      // a release can start a snap or a fling, which the browser runs in real time: let it begin,
      // so the clock's step waits for it to come to rest (it lands on the next frame)
      if (k >= 1) await new Promise((resolve) => setTimeout(resolve, 150))
      return k >= 1
    }
  }
  if (a.wheel !== undefined) {
    const o = a.wheel
    const [x, y] = o.over ? await point(o.over) : [s.viewport.width / 2, s.viewport.height / 2]
    await page.mouse.move(x, y)
    const n = Math.max(1, Math.round((o.duration ?? 0.5) * fps))
    let done = [0, 0]
    return async (frame) => {
      const k = easeInOut(Math.min(1, (frame - a.frame + 1) / n))
      const next = [(o.dx ?? 0) * k, (o.dy ?? 0) * k]
      await page.mouse.wheel({ deltaX: next[0] - done[0], deltaY: next[1] - done[1] })
      done = next
      return frame - a.frame + 1 >= n
    }
  }
  throw new Error(`capture: unknown action ${JSON.stringify(a)}`)
}

/** Records one clip; returns its meta (also written to captures/<name>/meta.json) */
export async function record (browser, o, { outDir, launch = null }) {
  const fps = o.fps
  const total = Math.round(o.seconds * fps)
  const frameMs = 1000 / fps
  const frozen = o.mode !== 'realtime'
  const dir = join(outDir, o.name)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })

  if (o.reset) {
    const response = await fetch(o.reset, { method: 'POST', signal: AbortSignal.timeout(30000) })
    if (!response.ok) throw new Error(`capture: reset ${o.reset} answered ${response.status}`)
  }

  // the screencast sends frames at the device resolution only when the whole browser runs at that scale
  const own = !frozen && launch ? await launch([`--force-device-scale-factor=${o.scale}`]) : null
  const { context, page, net, cdp, touch } = await preparePage(own ?? browser, o, { frozen })
  if (frozen) {
    // the page's animation clock stands still in real time too: the virtual clock sets every animation
    await cdp.send('Animation.enable')
    await cdp.send('Animation.setPlaybackRate', { playbackRate: 0 })
  }
  const state = () => ({ page, net, fps, touch, viewport: o.viewport, taps: [], drags: [], keys: [], marks: [], measure: [], boxes: {} })
  const s = state()
  // runs the actions due on each frame and the ones still going
  const runner = (list, into, phase) => {
    const actions = plan(list, fps)
    const running = []
    const step = async (frame) => {
      for (const a of actions.filter((x) => x.frame === frame)) {
        try {
          const each = await begin(a, into)
          if (each) running.push(each)
        } catch (error) {
          throw new Error(`capture: recording "${o.name}"${phase} at ${a.at} s: ${error.message}`)
        }
      }
      for (const each of [...running]) {
        if (await each(frame)) running.splice(running.indexOf(each), 1)
      }
    }
    step.finished = (frame) => !running.length && actions.every((a) => a.frame < frame)
    return step
  }
  const act = runner(o.actions, s, '')
  const measure = async () => {
    for (const m of s.measure.splice(0)) s.boxes[m.label] = { t: m.t, boxes: await page.evaluate(inPage, 'boxes', { boxes: m.boxes }) }
  }
  const name = (i) => join(dir, `${String(i + 1).padStart(4, '0')}.jpg`)
  let first = null
  let firstChange = null
  const changed = (buffer, i) => {
    if (!first) first = buffer
    else if (firstChange == null && !buffer.equals(first)) firstChange = round(i / fps)
  }

  await page.goto(o.target, { waitUntil: 'load', timeout: 120000 })
  if (frozen) {
    // loading also runs on virtual time, so the state at frame 0 is the same on every run
    for (let i = 0; i < Math.round((o.settle ?? 1) * fps); i++) await stepClock(page, net, frameMs)
    // `prepare`: actions that bring the app to where the clip starts, not filmed
    if (o.prepare?.length) {
      const before = runner(o.prepare, state(), ' (prepare)')
      let i = 0
      for (; !before.finished(i); i++) {
        if (i > 600 * fps) throw new Error(`capture: recording "${o.name}": prepare never finished`)
        await before(i)
        await stepClock(page, net, frameMs)
      }
      for (let j = 0; j < Math.round((o.settle ?? 1) * fps); j++) await stepClock(page, net, frameMs)
    }
    await page.evaluate(() => document.fonts.ready)
    await stepClock(page, net, frameMs)
    for (let i = 0; i < total; i++) {
      await act(i)
      await stepClock(page, net, frameMs)
      const jpg = await page.screenshot({ type: 'jpeg', quality: o.quality, captureBeyondViewport: false })
      writeFileSync(name(i), jpg)
      changed(jpg, i)
      await measure()
    }
  } else {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
    await net.idle()
    await sleep((o.settle ?? 1) * 1000)
    if (o.prepare?.length) {
      const before = runner(o.prepare, state(), ' (prepare)')
      for (let i = 0; !before.finished(i); i++) {
        await before(i)
        await sleep(frameMs)
      }
      await sleep((o.settle ?? 1) * 1000)
    }
    await page.evaluate(() => document.fonts.ready)
    const shots = []
    cdp.on('Page.screencastFrame', (e) => {
      shots.push({ t: e.metadata.timestamp, data: Buffer.from(e.data, 'base64') })
      cdp.send('Page.screencastFrameAck', { sessionId: e.sessionId }).catch(() => {})
    })
    const start = Date.now() / 1000
    shots.push({ t: start, data: await page.screenshot({ type: 'jpeg', quality: o.quality, captureBeyondViewport: false }) })
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: o.quality, maxWidth: o.viewport.width * o.scale, maxHeight: o.viewport.height * o.scale, everyNthFrame: 1 })
    for (let i = 0; i < total; i++) {
      const wait = start + i / fps - Date.now() / 1000
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait * 1000))
      await page.evaluate(() => window.__ambarClock?.keepStyle())
      await act(i)
      await measure()
    }
    const end = start + total / fps
    const wait = end - Date.now() / 1000
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait * 1000))
    await cdp.send('Page.stopScreencast')
    shots.sort((a, b) => a.t - b.t)
    let j = 0
    for (let i = 0; i < total; i++) {
      while (j + 1 < shots.length && shots[j + 1].t <= start + i / fps) j++
      writeFileSync(name(i), shots[j].data)
      changed(shots[j].data, i)
    }
  }
  await context.close()
  await own?.close()

  const meta = {
    name: o.name,
    mode: frozen ? 'virtual' : 'realtime',
    fps,
    frames: total,
    seconds: round(total / fps),
    dir: `${o.dirRel}/${o.name}`,
    viewport: { width: o.viewport.width, height: o.viewport.height, mobile: Boolean(o.viewport.mobile) },
    scale: o.scale,
    safeArea: o.safeArea || null,
    now: o.now ?? null,
    timezone: o.timezone ?? null,
    firstChange,
    taps: s.taps,
    drags: s.drags,
    keys: s.keys,
    marks: s.marks,
    boxes: s.boxes,
    blocked: net.blocked,
    mocked: net.mocked
  }
  writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 2))
  return meta
}
