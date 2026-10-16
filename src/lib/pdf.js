// PDF hygiene: paper sizes, a stylesheet that keeps shadows out of print, and
// a scan of the written file for what prints badly: Type 3 fonts (variable or
// faked fonts), soft masks (/SMask) and a page count that does not match the
// sheets. Uses poppler's pdffonts when it is installed, and reads the PDF
// bytes otherwise (inflating object streams with zlib).
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { inflateSync } from 'node:zlib'
import { printAudit } from './audit.js'
import { addStyle } from './headless.js'

/** CSS size and the viewport (CSS px at 96 dpi) of each paper */
export const PAPER = {
  a4: { width: '210mm', height: '297mm', px: [794, 1123] },
  letter: { width: '8.5in', height: '11in', px: [816, 1056] },
  a5: { width: '148mm', height: '210mm', px: [559, 794] }
}

export function paper (name = 'a4') {
  const p = PAPER[String(name).toLowerCase()]
  if (!p) throw new Error(`Unknown paper "${name}". Use one of: ${Object.keys(PAPER).join(', ')}.`)
  return { name: String(name).toLowerCase(), ...p }
}

/** Removes every shadow from what is printed (Quartz draws them as blocks) */
export const NO_SHADOWS = '*, *::before, *::after { box-shadow: none !important; text-shadow: none !important; }'

const tools = new Map()
/** True when a command line tool is on PATH */
export function has (tool) {
  if (!tools.has(tool)) tools.set(tool, spawnSync('which', [tool], { stdio: 'ignore' }).status === 0)
  return tools.get(tool)
}

/** The PDF's text: its own bytes plus every compressed object stream */
function pdfText (bytes) {
  let text = bytes.toString('latin1')
  const extra = []
  const re = /\/Type\s*\/ObjStm[\s\S]*?stream\r?\n/g
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const start = m.index + m[0].length
    const end = text.indexOf('endstream', start)
    try { extra.push(inflateSync(bytes.subarray(start, end)).toString('latin1')) } catch {}
  }
  if (extra.length) text += '\n' + extra.join('\n')
  return text
}

/** Counts pages, Type 3 fonts and soft masks in a PDF (a Buffer or a path) */
export function scanPdf (input) {
  const bytes = Buffer.isBuffer(input) ? input : readFileSync(input)
  const text = pdfText(bytes)
  const pages = (text.match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length
  const type3 = (text.match(/\/Subtype\s*\/Type3\b/g) ?? []).length
  const smask = (text.match(/\/SMask(?!\s*\/None)/g) ?? []).length
  // the first page's size in points (1 CSS px = 0.75 pt)
  const box = text.match(/\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/)
  const size = box ? { width: Number(box[3]) - Number(box[1]), height: Number(box[4]) - Number(box[2]) } : null
  return { pages, type3, smask, size }
}

/** Type 3 font names from `pdffonts`, or null when it is not installed */
export function type3Fonts (file) {
  if (!has('pdffonts')) return null
  const out = spawnSync('pdffonts', [file], { encoding: 'utf8' })
  if (out.status !== 0) return null
  const names = new Set()
  for (const line of out.stdout.split('\n')) {
    // name (no spaces) · type (may have spaces) · encoding · emb sub uni · object ID
    if (/\sType 3\s/.test(line)) names.add(line.split(/\s+/)[0].replace(/^[A-Z]{6}\+/, '').split('_')[0])
  }
  return [...names]
}

/** Warnings for a written PDF. expectPages: the number of sheets the page has */
export function pdfReport (file, { expectPages = null } = {}) {
  const scan = scanPdf(file)
  const issues = []
  const fonts = type3Fonts(file)
  const count = fonts ? fonts.length : scan.type3
  if (count) {
    const names = fonts?.length ? ` (${fonts.slice(0, 4).join(', ')}${fonts.length > 4 ? '…' : ''})` : ''
    const system = fonts?.some((n) => /SFNS|SFPro|SF-Pro/i.test(n)) ? ' The macOS system font is variable: load runtime/fonts.css or another static font.' : ''
    issues.push({ level: 'warn', message: `${count} Type 3 font${count > 1 ? 's' : ''}${names}: a variable or faked font, drawn as Type 3 glyphs that print soft and do not search in some viewers.${system}` })
  }
  if (scan.smask) issues.push({ level: 'warn', message: `${scan.smask} soft mask${scan.smask > 1 ? 's' : ''} (/SMask): transparency in a canvas, an image or an effect, which some viewers flatten badly. Canvases: getContext('2d', { alpha: false })` })
  if (expectPages !== null && scan.pages !== expectPages) {
    issues.push({ level: 'warn', message: `the PDF has ${scan.pages} page${scan.pages === 1 ? '' : 's'} for ${expectPages} sheet${expectPages === 1 ? '' : 's'}: something spills onto an extra page or a sheet is not sized to the paper` })
  }
  return { ...scan, type3Fonts: fonts, issues }
}

/**
 * Before page.pdf(): emulates the media that will be printed, audits it
 * (printAudit) and strips every shadow. Returns { issues, canvases }; the
 * shadows removed are reported at level 'info'.
 */
export async function preparePrint (page, { media = 'print' } = {}) {
  await page.emulateMediaType(media)
  const audit = await page.evaluate(printAudit)
  await addStyle(page, NO_SHADOWS)
  const issues = [...audit.issues]
  if (audit.shadows.length) {
    const list = audit.shadows.slice(0, 3).join(', ') + (audit.shadows.length > 3 ? '…' : '')
    issues.push({ level: 'info', message: `shadows removed from print on ${list}: keep them inside @media screen` })
  }
  return { issues, canvases: audit.canvases }
}

/** True when a page's source draws on a canvas (its PDF then renders at 1.5x) */
export const usesCanvas = (html) => /<canvas\b|createElement\(\s*['"]canvas['"]|OffscreenCanvas/i.test(html)
