// Checks that run inside the page before a still, a slide or a page is shot.
// Every function here is passed to page.evaluate(), so each one must be
// self-contained (no closures over this module).
//
// overflowGuard: content that leaves the frame, and boxes whose content does
// not fit (overflow:hidden clips silently). Decoration marked data-bleed (and
// anything under data-check="skip") may cross edges.
// printAudit: what makes a PDF print badly: shadows, variable fonts, faked
// weights, canvases with alpha, width media queries without `screen`.
// printIssues (Node side) prints what they found.
import { amber, dim, red } from './log.js'

/** Prints review issues: ✗ errors, ! warnings, · notes */
export function printIssues (list, width = 10) {
  for (const i of list) {
    const mark = i.level === 'error' ? red('✗') : i.level === 'warn' ? amber('!') : dim('·')
    console.log(`  ${mark} ${dim(String(i.where ?? '').padEnd(width))} ${i.message}`)
  }
}

/**
 * frame: { left, top, right, bottom } in CSS px (defaults to the root's box);
 * selector + index: audit one .slide / .page; seams: x positions where a
 * panorama is cut, text must not straddle them.
 */
export function overflowGuard ({ selector = null, index = 0, frame = null, seams = [] } = {}) {
  const root = selector ? document.querySelectorAll(selector)[index] : document.body
  if (!root) return [{ level: 'error', message: `no ${selector} number ${index + 1}` }]
  const f = frame ?? root.getBoundingClientRect()
  const tol = 1
  const issues = []
  const skipped = (el) => Boolean(el.closest('[data-bleed], [data-check="skip"]'))
  const visible = (el) => {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const s = getComputedStyle(n)
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.05) return false
    }
    return true
  }
  const label = (el) => {
    const text = (el.textContent || '').trim().replace(/\s+/g, ' ')
    const cls = typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/)[0]}` : ''
    const name = `<${el.tagName.toLowerCase()}${cls}>`
    return text ? `${name} "${text.length > 40 ? text.slice(0, 39) + '…' : text}"` : name
  }
  const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
  const isContent = (el) => {
    if (['SCRIPT', 'STYLE', 'TEMPLATE'].includes(el.tagName)) return false
    if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') return false
    if (el.tagName.toLowerCase() === 'svg' && el.parentElement?.closest('svg')) return false
    return ownText(el) || ['IMG', 'CANVAS', 'VIDEO', 'PICTURE'].includes(el.tagName) || el.tagName.toLowerCase() === 'svg' || el.hasAttribute('data-keep')
  }
  // Text is measured by its line boxes, not its block (a wide block with short text is fine)
  const rectOf = (el) => {
    if (!ownText(el) || el.closest('svg')) return el.getBoundingClientRect()
    const range = document.createRange()
    range.selectNodeContents(el)
    const r = range.getBoundingClientRect()
    return r.width || r.height ? r : el.getBoundingClientRect()
  }
  const outside = (r, b) => {
    const by = { left: b.left - r.left, right: r.right - b.right, top: b.top - r.top, bottom: r.bottom - b.bottom }
    const side = Object.entries(by).filter(([, d]) => d > tol).sort((a, b) => b[1] - a[1])[0]
    return side ? `${Math.round(side[1])} px past the ${side[0]}` : null
  }
  const content = []
  for (const el of root.querySelectorAll('*')) {
    if (skipped(el) || !isContent(el) || !visible(el)) continue
    const r = rectOf(el)
    if (r.width < 1 || r.height < 1) continue
    content.push({ el, r })
    const off = outside(r, f)
    if (off) issues.push({ level: 'error', message: `${label(el)} leaves the frame (${off})` })
    if (ownText(el)) {
      for (const x of seams) {
        if (r.left < x - tol && r.right > x + tol) issues.push({ level: 'error', message: `${label(el)} is cut between two frames at x ${Math.round(x - f.left)}` })
      }
    }
  }
  // Boxes that clip, or visibly hold, content that does not fit
  for (const box of [root, ...root.querySelectorAll('*')]) {
    if (skipped(box) || !visible(box) || box.closest('svg')) continue
    const s = getComputedStyle(box)
    const clips = /hidden|clip/.test(s.overflowX + s.overflowY)
    const drawn = s.backgroundColor !== 'rgba(0, 0, 0, 0)' || s.backgroundImage !== 'none' || parseFloat(s.borderTopWidth) > 0 || parseFloat(s.borderLeftWidth) > 0
    if (!clips && !drawn) continue
    if (box.scrollHeight <= box.clientHeight + tol && box.scrollWidth <= box.clientWidth + tol && !clips) continue
    if (box === root) continue // the frame itself: covered above
    const b = box.getBoundingClientRect()
    const spilled = content.filter(({ el, r }) => el !== box && box.contains(el) && outside(r, b))
    if (spilled.length) {
      const what = clips ? 'clips' : 'does not hold'
      issues.push({ level: 'error', message: `${label(box).replace(/ ".*$/, '')} ${what} ${label(spilled[0].el)} (${outside(spilled[0].r, b)})${clips ? ': overflow:hidden clips silently' : ''}${spilled.length > 1 ? ` and ${spilled.length - 1} more` : ''}` })
    } else if (clips && ownText(box) && (box.scrollHeight > box.clientHeight + tol || box.scrollWidth > box.clientWidth + tol)) {
      issues.push({ level: 'error', message: `${label(box)} does not fit its box: overflow clips the text` })
    }
  }
  const seen = new Set()
  return issues.filter((i) => !seen.has(i.message) && seen.add(i.message))
}

/** Run with print media emulated, before page.pdf() */
export function printAudit () {
  const issues = []
  const warn = (message) => issues.push({ level: 'warn', message })
  const name = (el) => {
    const cls = typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/).join('.')}` : ''
    return `${el.tagName.toLowerCase()}${cls}`
  }

  // Shadows: Quartz and Preview draw them as grey or black blocks
  const shadowed = []
  for (const el of document.querySelectorAll('*')) {
    const s = getComputedStyle(el)
    if (s.boxShadow !== 'none' || s.textShadow !== 'none') shadowed.push(name(el))
    if (/drop-shadow/.test(s.filter)) warn(`${name(el)} has a drop-shadow filter: it prints as a raster block; keep it inside @media screen`)
  }
  const shadows = [...new Set(shadowed)]

  // Fonts: a variable font (a weight range) is embedded as Type 3 glyphs
  const faces = new Map()
  for (const face of document.fonts) {
    if (face.status !== 'loaded') continue
    const family = face.family.replace(/^["']|["']$/g, '')
    if (/\d\s+\d/.test(face.weight)) warn(`"${family}" is a variable font (weights ${face.weight}): Chrome embeds it as Type 3. Use one static file per weight (runtime/fonts.css)`)
    const weights = faces.get(family) ?? new Set()
    for (const w of face.weight.split(/\s+/)) weights.add(w === 'normal' ? 400 : w === 'bold' ? 700 : Number(w))
    faces.set(family, weights)
  }
  // A weight the family does not have gets faked (synthetic bold → Type 3)
  const faked = new Map()
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent.trim()) continue
    const el = n.parentElement
    const s = getComputedStyle(el)
    const family = s.fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '')
    const weights = faces.get(family)
    if (!weights || weights.size > 8) continue
    const want = Number(s.fontWeight)
    const near = [...weights].sort((a, b) => Math.abs(a - want) - Math.abs(b - want))[0]
    if (want >= 600 && near < 600) faked.set(`${family}/${want}`, `"${family}" has no weight ${want} (nearest ${near}), asked by ${name(el)}: Chrome fakes the bold and prints it as Type 3`)
    else if (!weights.has(want) && Math.abs(near - want) >= 100) faked.set(`${family}/${want}`, `"${family}" has no weight ${want}, asked by ${name(el)}: it falls back to ${near}`)
  }
  faked.forEach((message) => warn(message))

  // Stroked text (an SVG halo, -webkit-text-stroke) is embedded as Type 3 too
  const stroked = new Set()
  for (const el of document.querySelectorAll('text, tspan, body *:not(svg *)')) {
    if (!el.textContent.trim()) continue
    const s = getComputedStyle(el)
    const svgStroke = el instanceof SVGElement && s.stroke !== 'none' && parseFloat(s.strokeWidth) > 0 && Number(s.strokeOpacity) > 0
    if (svgStroke || parseFloat(s.webkitTextStrokeWidth) > 0) stroked.add(name(el))
  }
  if (stroked.size) warn(`stroked text (${[...stroked].slice(0, 3).join(', ')}${stroked.size > 3 ? '…' : ''}) prints as Type 3: for print, put a paper-coloured shape behind the label instead of a halo`)

  // Canvases with alpha get a soft mask (/SMask) per canvas in the PDF
  const canvases = [...document.querySelectorAll('canvas')]
  for (const c of canvases) {
    let attrs = null
    try { attrs = c.getContext('2d')?.getContextAttributes?.() } catch {}
    if (attrs?.alpha) warn(`${name(c)} has an alpha channel: use getContext('2d', { alpha: false }) and clear it to the paper colour, or it becomes an /SMask`)
  }

  // Width media queries without `screen` are evaluated against the page box when printing
  const bare = new Set()
  const walk = (rules) => {
    for (const rule of rules) {
      if (rule.media && rule.cssRules) {
        const text = rule.media.mediaText
        if (/(width|height|orientation|aspect-ratio)/.test(text) && !/\b(screen|print)\b/.test(text)) bare.add(text)
        walk(rule.cssRules)
      } else if (rule.cssRules) walk(rule.cssRules)
    }
  }
  for (const sheet of document.styleSheets) {
    try { walk(sheet.cssRules) } catch {}
  }
  for (const text of bare) warn(`@media ${text} also applies when printing (against the page box): write @media screen and ${text}`)

  return { issues, shadows, canvases: canvases.length }
}
