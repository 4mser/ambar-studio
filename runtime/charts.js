// AMBAR charts: flat SVG charts in one accent hue that draw themselves over
// time. Each helper builds its shapes once inside the given <svg> (again only
// if the data changes) and then only moves attributes per frame. The
// geometry helpers at the top are pure and tested in Node.
import { ease, lerp, progress } from './ambar.js'

const NS = 'http://www.w3.org/2000/svg'
const ACCENT = '#f2a324'
const MUTED = 'rgba(255, 244, 224, 0.22)'
const TRACK = 'rgba(255, 244, 224, 0.12)'

// ── geometry, pure ───────────────────────────────────────────────────────

/** Values → [x, y] points inside a box (y grows down; max at the top) */
export function scalePoints (values, { x = 0, y = 0, width = 100, height = 100, min = Math.min(0, ...values), max = Math.max(...values) } = {}) {
  const range = max - min || 1
  return values.map((v, i) => [x + (values.length > 1 ? (width * i) / (values.length - 1) : width / 2), y + height - ((v - min) / range) * height])
}

/** Points → an SVG path `d` */
export const pathOf = (points) => points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ')

/** Length of a polyline */
export function lengthOf (points) {
  let n = 0
  for (let i = 1; i < points.length; i++) n += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])
  return n
}

/** The point at fraction k (0..1) of a polyline's length */
export function pointAt (points, k) {
  const target = lengthOf(points) * Math.min(1, Math.max(0, k))
  let run = 0
  for (let i = 1; i < points.length; i++) {
    const seg = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])
    if (run + seg >= target && seg > 0) {
      const f = (target - run) / seg
      return [lerp(points[i - 1][0], points[i][0], f), lerp(points[i - 1][1], points[i][1], f)]
    }
    run += seg
  }
  return points[points.length - 1]
}

// ── building once ────────────────────────────────────────────────────────

const built = new WeakMap()
let uid = 0

function el (parent, tag, attrs = {}) {
  const node = document.createElementNS(NS, tag)
  for (const k in attrs) node.setAttribute(k, attrs[k])
  parent.append(node)
  return node
}

const set = (node, attrs) => { for (const k in attrs) node.setAttribute(k, attrs[k]) }

/** The chart `kind` built inside svg for these data, built on first use */
function once (svg, kind, data, options, build) {
  if (!built.has(svg)) built.set(svg, new Map())
  const charts = built.get(svg)
  const key = options.id ?? kind
  const sig = JSON.stringify([data, options.x, options.y, options.width, options.height, options.r])
  let chart = charts.get(key)
  if (!chart || chart.sig !== sig) {
    chart?.root.remove()
    const root = el(svg, 'g', { class: `ch-${kind}` })
    chart = { sig, root, ...build(root) }
    charts.set(key, chart)
  }
  return chart
}

/** The drawing box: options, or the svg's viewBox minus `pad` */
function boxOf (svg, { x, y, width, height, pad = 24 }) {
  const vb = svg.viewBox?.baseVal
  const w = vb?.width || svg.clientWidth || 600
  const h = vb?.height || svg.clientHeight || 300
  return { x: x ?? (vb?.x ?? 0) + pad, y: y ?? (vb?.y ?? 0) + pad, width: width ?? w - pad * 2, height: height ?? h - pad * 2 }
}

// ── charts ───────────────────────────────────────────────────────────────

/**
 * A line that draws itself from a to a + d, with a faint area under it and
 * a dot at its head. options: color, area (true), dot (true), strokeWidth
 * (4), min, max, x, y, width, height, pad, id.
 */
export function line (svg, data, t, a, d = 1.2, options = {}) {
  const { color = ACCENT, area = true, dot = true, strokeWidth = 4, min, max } = options
  const box = boxOf(svg, options)
  const c = once(svg, 'line', data, options, (root) => {
    const points = scalePoints(data, { ...box, min, max })
    const length = lengthOf(points)
    const id = `ch-clip-${++uid}`
    const clip = el(el(root, 'defs'), 'clipPath', { id })
    const rect = el(clip, 'rect', { x: box.x, y: box.y - strokeWidth, width: 0, height: box.height + strokeWidth * 2 })
    const fill = area ? el(root, 'path', { d: `${pathOf(points)} L${box.x + box.width} ${box.y + box.height} L${box.x} ${box.y + box.height} Z`, fill: color, 'fill-opacity': 0.12, 'clip-path': `url(#${id})` }) : null
    const stroke = el(root, 'path', { d: pathOf(points), fill: 'none', stroke: color, 'stroke-width': strokeWidth, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-dasharray': length, 'stroke-dashoffset': length })
    const head = dot ? el(root, 'circle', { r: strokeWidth * 1.8, fill: color, opacity: 0 }) : null
    return { points, length, rect, fill, stroke, head }
  })
  const k = ease.inOut(progress(t, a, d))
  const [hx, hy] = pointAt(c.points, k)
  set(c.stroke, { 'stroke-dashoffset': (c.length * (1 - k)).toFixed(2) })
  set(c.rect, { width: Math.max(0, hx - box.x).toFixed(2) })
  if (c.head) set(c.head, { cx: hx.toFixed(2), cy: hy.toFixed(2), opacity: ease.out(progress(t, a, 0.2)) })
  return k
}

/** A sparkline: a thin line with a head dot and no area */
export const sparkline = (svg, data, t, a, d = 1, options = {}) => line(svg, data, t, a, d, { strokeWidth: 3, area: false, pad: 8, id: 'spark', ...options })

/**
 * Bars that grow one after another (`stagger` apart, each over d). With
 * highlight ('peak' or an index) that bar takes the accent and the rest are
 * muted, and its label (label(value) → text) fades in once it is grown.
 */
export function bars (svg, data, t, a, d = 0.65, options = {}) {
  const { color = ACCENT, muted = MUTED, stagger = 0.05, highlight = null, label = (v) => String(v), gap = 0.3, radius = 6, fontSize = 28, max = Math.max(...data) } = options
  const box = boxOf(svg, { pad: 24, ...options })
  const peak = highlight === 'peak' ? data.indexOf(Math.max(...data)) : highlight
  const c = once(svg, 'bars', data, options, (root) => {
    const slot = box.width / data.length
    const rects = data.map((_, i) => el(root, 'rect', { x: (box.x + slot * i + (slot * gap) / 2).toFixed(2), width: (slot * (1 - gap)).toFixed(2), rx: radius, y: box.y + box.height, height: 0, fill: peak === null || peak === i ? color : muted }))
    const text = peak !== null ? el(root, 'text', { x: box.x + slot * (peak + 0.5), 'text-anchor': 'middle', fill: color, 'font-size': fontSize, 'font-weight': 700, opacity: 0 }) : null
    if (text) text.textContent = label(data[peak])
    return { rects, text }
  })
  const base = box.y + box.height
  const room = box.height - (c.text ? fontSize * 1.6 : 0)
  data.forEach((v, i) => {
    const k = ease.out(progress(t, a + i * stagger, d))
    const h = (v / (max || 1)) * room * k
    set(c.rects[i], { y: (base - h).toFixed(2), height: Math.max(0, h).toFixed(2) })
  })
  if (c.text) {
    const top = base - (data[peak] / (max || 1)) * room
    set(c.text, { y: (top - fontSize * 0.5).toFixed(2), opacity: ease.out(progress(t, a + peak * stagger + d, 0.26)) })
  }
}

/**
 * A progress ring filled to `value` (0..1) from a to a + d. options: cx, cy,
 * r, width (14), color, track, comet (a dot riding the head while it fills).
 */
export function ring (svg, value, t, a, d = 0.65, options = {}) {
  const box = boxOf(svg, { pad: 0, ...options })
  const { cx = box.x + box.width / 2, cy = box.y + box.height / 2, width = 14, color = ACCENT, track = TRACK, comet = false } = options
  const r = options.r ?? Math.min(box.width, box.height) / 2 - width
  const C = 2 * Math.PI * r
  const c = once(svg, 'ring', value, { ...options, r }, (root) => ({
    track: el(root, 'circle', { cx, cy, r, fill: 'none', stroke: track, 'stroke-width': width }),
    arc: el(root, 'circle', { cx, cy, r, fill: 'none', stroke: color, 'stroke-width': width, 'stroke-linecap': 'round', 'stroke-dasharray': C.toFixed(2), 'stroke-dashoffset': C.toFixed(2), transform: `rotate(-90 ${cx} ${cy})` }),
    head: comet ? el(root, 'circle', { r: width * 0.85, fill: '#fff4e0', opacity: 0 }) : null
  }))
  const k = ease.out(progress(t, a, d))
  const v = value * k
  set(c.arc, { 'stroke-dashoffset': (C * (1 - v)).toFixed(2), opacity: k > 0 ? 1 : 0 })
  if (c.head) {
    const angle = -Math.PI / 2 + v * Math.PI * 2
    set(c.head, { cx: (cx + Math.cos(angle) * r).toFixed(2), cy: (cy + Math.sin(angle) * r).toFixed(2), opacity: k > 0 && k < 1 ? 1 : k >= 1 ? 1 - progress(t, a + d, 0.3) : 0 })
  }
  return v
}

/**
 * A heat grid (rows of values 0..1) whose cells fill diagonally from the top
 * left between a and a + d. options: gap (4), radius (3), color, x, y, width, height.
 */
export function heat (svg, grid, t, a, d = 1, options = {}) {
  const { gap = 4, radius = 3, color = ACCENT } = options
  const box = boxOf(svg, options)
  const rows = grid.length
  const cols = Math.max(...grid.map((r) => r.length))
  const c = once(svg, 'heat', grid, options, (root) => {
    const w = (box.width - gap * (cols - 1)) / cols
    const h = (box.height - gap * (rows - 1)) / rows
    return { cells: grid.flatMap((row, j) => row.map((_, i) => el(root, 'rect', { x: (box.x + i * (w + gap)).toFixed(2), y: (box.y + j * (h + gap)).toFixed(2), width: w.toFixed(2), height: h.toFixed(2), rx: radius, fill: color, 'fill-opacity': 0 }))) }
  })
  let n = 0
  const diag = Math.max(1, rows + cols - 2)
  grid.forEach((row, j) => row.forEach((v, i) => {
    const k = ease.out(progress(t, a + ((i + j) / diag) * d * 0.6, d * 0.4))
    set(c.cells[n++], { 'fill-opacity': ((0.06 + 0.94 * v) * k).toFixed(3) })
  }))
}
