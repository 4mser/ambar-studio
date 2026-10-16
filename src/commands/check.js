// ambar check: the review an agent (or a person) runs before calling a piece
// done. It opens a video, deck or document the way the renderer does and
// reports what can be checked by machine: page errors and missing files,
// text that runs off the frame, is clipped, overlaps other text or is too
// small to read, labels inside diagrams crossed by lines or covered by shapes, narration cues the scene asks for but ambar.json lacks, and
// whether render(t) really depends on t alone. It also writes a contact sheet
// of the sampled frames, slides or pages, so the result can be looked at.
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join, relative } from 'node:path'
import { serve } from '../lib/server.js'
import { openPage, waitForComposition } from '../lib/browser.js'
import { resolveTime } from '../lib/timeline.js'
import { amber, bold, dim, done, green, red, step } from '../lib/log.js'

/** What kind of piece an entry file is, from the runtime it loads */
export function kindOf (html) {
  if (html.includes('runtime/slides.js')) return 'deck'
  if (html.includes('runtime/doc.css')) return 'doc'
  return 'video'
}

/** Moments worth looking at: the middle of every narration line, or quarters */
export function sampleTimes (duration, cues = {}) {
  const list = Object.values(cues).map((c) => c.start + Math.min(c.duration * 0.6, c.duration - 0.1))
  if (!list.length) list.push(duration * 0.25, duration * 0.5, duration * 0.75)
  list.push(Math.max(0, duration - 0.4))
  return [...new Set(list.map((t) => Math.round(Math.min(Math.max(t, 0), duration) * 100) / 100))].sort((a, b) => a - b)
}

/** cue('id') calls in the project's own sources */
export function cuesUsed (dir, entry) {
  const ids = new Set()
  const files = [join(dir, entry)]
  for (const name of readdirSync(dir)) {
    if (extname(name) === '.js' && statSync(join(dir, name)).isFile()) files.push(join(dir, name))
  }
  for (const file of files) {
    for (const m of readFileSync(file, 'utf8').matchAll(/\bcue\(\s*['"]([\w-]+)['"]/g)) ids.add(m[1])
  }
  return ids
}

// Runs in the page. Looks at every visible piece of text inside `root`.
function auditLayout ({ rootSelector, index, minFont, balance = false }) {
  // Text inside diagrams (SVG <text>): another text on top of it, a line or an
  // arrow crossing it, or a shape drawn over it. HTML text is audited below; a
  // diagram's labels used to slip through because they live inside <svg>.
  function auditSvgText (root, visible, label) {
    const found = []
    const pad = (r, k) => ({ left: r.left + k, right: r.right - k, top: r.top + k, bottom: r.bottom - k })
    const area = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
    const within = (a, b) => a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1
    const before = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    const soft = (el) => el.closest('[data-glow], [data-check="skip"]') || Number(getComputedStyle(el).opacity) < 0.35 || el.hasAttribute('filter')
    const texts = [...root.querySelectorAll('svg text')].filter((t) => visible(t) && t.textContent.trim()).map((el) => ({ el, r: pad(el.getBoundingClientRect(), 1.5) }))
    if (!texts.length) return found
    // a halo (paint-order: stroke) keeps a line drawn underneath from crossing the letters
    const haloed = (t) => getComputedStyle(t).paintOrder.startsWith('stroke') && parseFloat(getComputedStyle(t).strokeWidth) >= 3
    const shapes = [...root.querySelectorAll('svg path, svg line, svg polyline, svg polygon, svg rect, svg circle, svg ellipse')].filter((s) => visible(s) && !soft(s))
    for (let i = 0; i < texts.length; i++) {
      const a = texts[i]
      for (let j = i + 1; j < texts.length; j++) {
        if (area(a.r, texts[j].r) > 6) found.push({ level: 'warn', message: `${label(a.el)} overlaps ${label(texts[j].el)} inside a diagram` })
      }
      for (const s of shapes) {
        const box = s.getBoundingClientRect()
        const grown = { left: box.left - 3, right: box.right + 3, top: box.top - 3, bottom: box.bottom + 3 }
        if (area(a.r, grown) <= 4) continue
        const st = getComputedStyle(s)
        const filled = st.fill !== 'none' && Number(st.fillOpacity) > 0.3
        const stroked = st.stroke !== 'none' && parseFloat(st.strokeWidth) > 0
        const over = before(a.el, s)
        if (filled && over && box.width > 4 && box.height > 4) {
          found.push({ level: 'warn', message: `${label(a.el)} is covered by a shape drawn on top of it` })
          continue
        }
        if (!stroked || (filled && within(a.r, box))) continue
        if (!over && haloed(a.el)) continue
        // a backing shape between the line and the text (a pill, a card) hides the line
        if (!over && shapes.some((c) => before(s, c) && before(c, a.el) && getComputedStyle(c).fill !== 'none' && within(a.r, c.getBoundingClientRect()))) continue
        let hits = 0
        try {
          const len = s.getTotalLength()
          const m = s.getScreenCTM()
          for (let d = 0; d <= len && hits < 2; d += 2) {
            const p = s.getPointAtLength(d)
            const x = p.x * m.a + p.y * m.c + m.e
            const y = p.x * m.b + p.y * m.d + m.f
            if (x > a.r.left && x < a.r.right && y > a.r.top && y < a.r.bottom) hits++
          }
        } catch {}
        if (hits > 1) found.push({ level: 'warn', message: `a ${s.tagName} crosses ${label(a.el)} inside a diagram` })
      }
    }
    return found
  }

  const root = rootSelector ? document.querySelectorAll(rootSelector)[index] : document.getElementById('stage')
  const frame = root.getBoundingClientRect()
  const issues = []
  const visible = (el) => {
    for (let n = el; n && n !== root.parentElement; n = n.parentElement) {
      const s = getComputedStyle(n)
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.05) return false
    }
    return true
  }
  const label = (el) => {
    const text = el.textContent.trim().replace(/\s+/g, ' ')
    return `"${text.length > 48 ? text.slice(0, 47) + '…' : text}"`
  }
  const texts = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
  for (let el = walker.currentNode; el; el = walker.nextNode()) {
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
    if (!own || ['SCRIPT', 'STYLE'].includes(el.tagName) || el.closest('svg, [data-check="skip"]') || !visible(el)) continue
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) continue
    const inside = r.right > frame.left && r.left < frame.right && r.bottom > frame.top && r.top < frame.bottom
    if (!inside) continue // fully off-frame: on its way in or out
    texts.push({ el, r })
    const tol = 2
    if (r.left < frame.left - tol || r.right > frame.right + tol || r.top < frame.top - tol || r.bottom > frame.bottom + tol) {
      issues.push({ level: 'error', message: `${label(el)} runs off the frame` })
      continue
    }
    for (let a = el.parentElement; a && a !== root.parentElement; a = a.parentElement) {
      const s = getComputedStyle(a)
      if (!/hidden|clip/.test(s.overflow + s.overflowX + s.overflowY)) continue
      const b = a.getBoundingClientRect()
      if (r.left < b.left - tol || r.right > b.right + tol || r.top < b.top - tol || r.bottom > b.bottom + tol) {
        issues.push({ level: 'error', message: `${label(el)} is cut off by its container` })
        break
      }
    }
    if (el.scrollWidth > el.clientWidth + 1 && /hidden|clip/.test(getComputedStyle(el).overflow)) {
      issues.push({ level: 'error', message: `${label(el)} does not fit its box` })
    }
    const size = parseFloat(getComputedStyle(el).fontSize) * (r.height / (el.offsetHeight || r.height))
    if (size < minFont) issues.push({ level: 'warn', message: `${label(el)} is ${size.toFixed(1)}px, under ${minFont}px` })
  }
  // Composition: where the content sits in the frame (videos and slides)
  if (balance) {
    const area = frame.width * frame.height
    let box = null
    for (const el of root.querySelectorAll('*')) {
      if (el.closest('[data-check="skip"], [data-glow]') || !visible(el)) continue
      const s = getComputedStyle(el)
      if (el instanceof SVGElement && (Number(el.getAttribute('opacity') ?? 1) < 0.5 || el.hasAttribute('filter'))) continue // soft light
      const ink = texts.some((x) => x.el === el) || ['IMG', 'CANVAS', 'VIDEO', 'path', 'circle', 'rect', 'ellipse', 'polygon', 'image'].includes(el.tagName) ||
        s.backgroundColor !== 'rgba(0, 0, 0, 0)' || s.backgroundImage !== 'none' || parseFloat(s.borderTopWidth) > 0
      if (!ink) continue
      const r = el.getBoundingClientRect()
      if (r.width * r.height > area * 0.85 || r.width < 2 || r.height < 2) continue // backgrounds and hairlines
      const l = Math.max(r.left, frame.left); const tp = Math.max(r.top, frame.top)
      const rt = Math.min(r.right, frame.right); const bt = Math.min(r.bottom, frame.bottom)
      if (rt <= l || bt <= tp) continue
      box = box ? { l: Math.min(box.l, l), t: Math.min(box.t, tp), r: Math.max(box.r, rt), b: Math.max(box.b, bt) } : { l, t: tp, r: rt, b: bt }
    }
    if (box) {
      const top = (box.t - frame.top) / frame.height
      const bottom = (frame.bottom - box.b) / frame.height
      const cx = ((box.l + box.r) / 2 - frame.left) / frame.width
      const cover = ((box.r - box.l) * (box.b - box.t)) / area
      const pct = (x) => `${Math.round(x * 100)}%`
      if (cover < 0.3) issues.push({ level: 'warn', message: `content covers only ${pct(cover)} of the frame: scale it up or add to it` })
      else if (balance === 'strict' && Math.abs(top - bottom) > 0.1 && Math.max(top, bottom) > 0.25) {
        issues.push({ level: 'warn', message: `the ${bottom > top ? 'bottom' : 'top'} ${pct(Math.max(top, bottom))} of the frame is empty while the ${bottom > top ? 'top' : 'bottom'} margin is ${pct(Math.min(top, bottom))}: center the content or fill the space` })
      } else if (Math.abs(cx - 0.5) > 0.2) issues.push({ level: 'warn', message: `content sits to the ${cx < 0.5 ? 'left' : 'right'} of the frame (center at ${pct(cx)} of the width)` })
    }
  }
  issues.push(...auditSvgText(root, visible, label))
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i]
      const b = texts[j]
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue
      // line by line: an inline element that wraps has one box per line
      const hit = [...a.el.getClientRects()].some((ra) => [...b.el.getClientRects()].some((rb) => {
        const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left)
        const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top)
        return w > 0 && h > 0 && w * h > Math.min(ra.width * ra.height, rb.width * rb.height) * 0.2
      }))
      if (hit) issues.push({ level: 'warn', message: `${label(a.el)} overlaps ${label(b.el)}` })
    }
  }
  return issues
}

const jpeg = (buffer) => `data:image/jpeg;base64,${buffer.toString('base64')}`

async function contactSheet (browser, tiles, file, { columns, width }) {
  const page = await browser.newPage()
  await page.setViewport({ width: columns * width + (columns + 1) * 16, height: 400 })
  await page.setContent(`<style>
    body { margin: 0; padding: 16px; background: #120a03; font: 600 15px ui-monospace, Menlo, monospace; color: #ffd27a; }
    .grid { display: grid; grid-template-columns: repeat(${columns}, ${width}px); gap: 16px; }
    figure { margin: 0; } img { width: 100%; display: block; border-radius: 6px; }
    figcaption { margin-top: 6px; } figcaption b { color: #ff6b5b; }
  </style><div class="grid">${tiles.map((t) => `<figure><img src="${t.src}"><figcaption>${t.label}${t.problems ? ` <b>· ${t.problems} issue${t.problems > 1 ? 's' : ''}</b>` : ''}</figcaption></figure>`).join('')}</div>`, { waitUntil: 'load' })
  await page.screenshot({ path: file, fullPage: true })
  await page.close()
}

async function checkVideo (project, server, report, dir, at) {
  const { browser, page, errors } = await openPage(`${server.url}/${project.entry}?render`)
  const comp = await waitForComposition(page, errors)
  await page.setViewport({ width: comp.width, height: comp.height, deviceScaleFactor: 1 })
  report.duration = comp.duration

  // narration against the scene
  const lines = project.config.lines ?? []
  const ids = new Set(lines.map((l) => l.id))
  for (const id of cuesUsed(project.dir, project.entry)) {
    if (!ids.has(id)) report.add('warn', 'cues', `cue('${id}') has no line in ambar.json, so it uses its fallback time`)
  }
  if (lines.length && !Object.keys(comp.cues).length) report.add('warn', 'voice', 'no voice/timings.json yet: run `ambar voice` so scenes follow the narration')
  for (const sfx of project.config.sfx ?? []) {
    try { if (Object.keys(comp.cues).length) resolveTime(sfx.at, comp.cues) } catch (e) { report.add('error', 'sfx', e.message) }
  }

  const draw = (t) => page.evaluate((time) => window.AMBAR.render(time), t)
  const times = at.length ? at : sampleTimes(comp.duration, comp.cues)

  // render(t) must depend on t only: the same t after other frames gives the same picture
  if (times.length > 1) {
    const [a, b] = [times[0], times[times.length - 1]]
    await draw(a); const first = await page.screenshot({ type: 'png' })
    await draw(b); await draw(a / 2); await draw(a)
    const again = await page.screenshot({ type: 'png' })
    if (!first.equals(again)) report.add('error', `t=${a.toFixed(2)}`, 'the frame changes when drawn again after other frames: render(t) keeps state or uses CSS transitions, timers or randomness')
  }

  const tiles = []
  for (const t of times) {
    await draw(t)
    const where = `t=${t.toFixed(2)}`
    const before = report.issues.length
    for (const i of await page.evaluate(auditLayout, { minFont: Math.round(comp.height / 72), balance: 'strict' })) report.add(i.level, where, i.message)
    const file = join(dir, `t-${t.toFixed(2)}.png`)
    await page.screenshot({ path: file })
    tiles.push({ src: jpeg(await page.screenshot({ type: 'jpeg', quality: 72 })), label: where, problems: report.issues.length - before })
    report.frames.push(relative(process.cwd(), file))
  }
  for (const e of errors) report.add('error', 'page', e)
  await contactSheet(browser, tiles, join(dir, 'sheet.png'), { columns: tiles.length > 4 ? 3 : 2, width: 620 })
  await browser.close()
}

async function checkPages (project, server, report, dir, kind) {
  const isDeck = kind === 'deck'
  const viewport = isDeck ? {} : { width: 794, height: 1123 }
  const { browser, page, errors } = await openPage(`${server.url}/${project.entry}?print`, viewport)
  if (isDeck) {
    await page.waitForFunction(() => window.AMBAR_DECK?.ready === true, { timeout: 30000 }).catch(() => report.add('error', 'deck', 'the deck never became ready (does it load /@ambar/runtime/slides.js?)'))
    const { width, height } = await page.evaluate(() => window.AMBAR_DECK ?? { width: 1920, height: 1080 })
    await page.setViewport({ width, height })
  }
  const selector = isDeck ? '.slide' : '.page'
  const count = await page.$$eval(selector, (els) => els.length)
  if (!count) report.add('error', kind, `no ${selector} elements found`)
  const tiles = []
  const sections = await page.$$(selector)
  for (let index = 0; index < count; index++) {
    const where = `${isDeck ? 'slide' : 'page'} ${index + 1}`
    const before = report.issues.length
    for (const i of await page.evaluate(auditLayout, { rootSelector: selector, index, minFont: isDeck ? 18 : 9, balance: isDeck })) report.add(i.level, where, i.message)
    const file = join(dir, `${String(index + 1).padStart(2, '0')}.png`)
    await sections[index].screenshot({ path: file })
    tiles.push({ src: jpeg(await sections[index].screenshot({ type: 'jpeg', quality: 72 })), label: where, problems: report.issues.length - before })
    report.frames.push(relative(process.cwd(), file))
  }
  for (const e of errors) report.add('error', 'page', e)
  await contactSheet(browser, tiles, join(dir, 'sheet.png'), isDeck ? { columns: Math.min(3, tiles.length), width: 520 } : { columns: Math.min(4, tiles.length), width: 380 })
  await browser.close()
}

export async function check (project, { json = false, at = [] } = {}) {
  const kind = kindOf(readFileSync(join(project.dir, project.entry), 'utf8'))
  const name = basename(project.entry, extname(project.entry))
  const dir = join(project.outDir, 'check', kind === 'video' ? '' : name)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })

  const report = {
    kind,
    project: relative(process.cwd(), join(project.dir, project.entry)) || project.entry,
    issues: [],
    frames: [],
    add (level, where, message) {
      if (!this.issues.some((i) => i.where === where && i.message === message)) this.issues.push({ level, where, message })
    }
  }
  if (!json) step('Check', `${report.project} · ${kind}`)
  const server = await serve(project.dir)
  try {
    if (kind === 'video') await checkVideo(project, server, report, dir, at)
    else await checkPages(project, server, report, dir, kind)
  } finally {
    await server.close()
  }
  report.sheet = relative(process.cwd(), join(dir, 'sheet.png'))
  const errors = report.issues.filter((i) => i.level === 'error').length
  const warnings = report.issues.length - errors
  const result = { kind, project: report.project, ok: errors === 0, errors, warnings, issues: report.issues, sheet: report.sheet, frames: report.frames, duration: report.duration }
  writeFileSync(join(dir, 'report.json'), JSON.stringify(result, null, 2))

  if (json) console.log(JSON.stringify(result, null, 2))
  else {
    for (const i of report.issues) console.log(`  ${i.level === 'error' ? red('✗') : amber('!')} ${dim(i.where.padEnd(10))} ${i.message}`)
    const summary = `${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}`
    if (errors) console.log(`${red('✗')} ${bold(summary)}`)
    else done(errors || warnings ? summary : green('no issues'), '')
    console.log(`  ${dim('sheet')} ${report.sheet}`)
  }
  return result
}
