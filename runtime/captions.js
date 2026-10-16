// AMBAR captions: subtitles timed to each spoken word, and a talking
// amplitude for mouths. planCaptions() turns narration cues (with per-word
// timings from voice/timings.json) into blocks of at most two lines; the DOM
// helper draws the active block as a pill with an optional speaker figure.
// talk() reads voice/envelope.json so a character's mouth follows its lines.
import { clamp, css, ease, progress } from './ambar.js'

const PUNCTUATION = /[.,;:!?…)»"”]$/

/** Words of a cue: its own `words`, or the text spread over the cue by length */
function wordsOf (cue) {
  if (cue.words?.length) return cue.words.map(([text, start, end]) => ({ text, start, end }))
  const parts = String(cue.text ?? '').split(/\s+/).filter(Boolean)
  const total = parts.reduce((n, w) => n + w.length + 1, 0)
  const span = (cue.end ?? cue.start + (cue.duration ?? 0)) - cue.start
  let at = cue.start
  return parts.map((text) => {
    const d = (span * (text.length + 1)) / total
    const word = { text, start: at, end: at + d }
    at += d
    return word
  })
}

/**
 * Subtitle blocks from narration cues ({ id: cue } or [cue]), each cue with
 * `text`, `start`, `end` and ideally `words: [[word, start, end], …]` in
 * absolute seconds, plus an optional `speaker`.
 *   maxChars    per line (36 suits 4:5; ~42 for 16:9)
 *   maxLines    per block (2)
 *   breakAt     once a block is this full (.45), it ends at punctuation
 *   lead        a block appears this long before its first word (.15)
 *   fade        fade in and out time (.2); blocks closer than `join` swap without fading
 * → [{ id, speaker, lines: [[{ text, start, end }]], start, end, first, last, joinPrev, joinNext }]
 */
export function planCaptions (cues, { maxChars = 36, maxLines = 2, breakAt = 0.45, lead = 0.15, fade = 0.2, join = 0.3 } = {}) {
  const list = Array.isArray(cues) ? cues : Object.entries(cues).map(([id, c]) => ({ id, ...c }))
  const ordered = list
    .map((c) => ({ ...c, words: wordsOf(c) }))
    .filter((c) => c.words.length)
    .sort((a, b) => a.words[0].start - b.words[0].start)

  const blocks = []
  for (const c of ordered) {
    let block = null
    let line = null
    const open = () => {
      line = []
      block = { id: c.id, speaker: c.speaker ?? null, lines: [line], chars: 0 }
      blocks.push(block)
    }
    open()
    c.words.forEach((word, i) => {
      const width = line.reduce((n, w) => n + w.text.length + 1, 0) + word.text.length
      const previous = c.words[i - 1]
      const full = block.chars / (maxChars * maxLines) > breakAt
      if (previous && full && PUNCTUATION.test(previous.text)) open()
      else if (line.length && width > maxChars) {
        if (block.lines.length < maxLines) {
          line = []
          block.lines.push(line)
        } else open()
      }
      line.push(word)
      block.chars += word.text.length + (line.length > 1 ? 1 : 0)
    })
  }

  const plan = blocks.map((b) => {
    const words = b.lines.flat()
    const first = words[0].start
    const last = words[words.length - 1].end
    return { id: b.id, speaker: b.speaker, lines: b.lines, first, last, start: first - lead, end: last + fade, joinPrev: false, joinNext: false }
  })
  // Blocks that nearly touch swap text in place instead of fading out and in
  plan.forEach((b, i) => {
    const next = plan[i + 1]
    if (next && next.start - b.end < join) {
      b.end = next.start
      b.joinNext = true
      next.joinPrev = true
    }
  })
  return plan
}

/** The block on screen at t, or null */
export function activeCaption (plan, t) {
  for (let i = plan.length - 1; i >= 0; i--) if (t >= plan[i].start && t < plan[i].end) return plan[i]
  return null
}

/** Opacity of a block at t: fades in over `fade` from its start, out over `fade` to its end */
export function captionOpacity (block, t, fade = 0.2) {
  if (!block || t < block.start || t >= block.end) return 0
  const fadeIn = block.joinPrev ? 1 : ease.out(progress(t, block.start, fade))
  const fadeOut = block.joinNext ? 1 : 1 - ease.inOut(progress(t, block.end - fade, fade))
  return Math.min(fadeIn, fadeOut)
}

/** Opacity of a word at t: 0.3 until it is spoken, then 1 over 0.1 s */
export const wordOpacity = (word, t) => 0.3 + 0.7 * progress(t, word.start, 0.1)

const STYLE = `
.cap { position: absolute; left: 0; right: 0; display: flex; justify-content: center; pointer-events: none; }
.cap-pill { display: inline-flex; align-items: center; gap: .55em; max-width: 92%; padding: .38em .8em; border-radius: 1em;
  background: rgba(14, 8, 3, .78); color: #fff4e0; font: 600 40px/1.25 var(--font, system-ui, sans-serif); text-align: center; }
.cap-fig { width: 1.9em; height: 1.9em; flex: none; }
.cap-fig:empty { display: none; }
.cap-fig svg { width: 100%; height: 100%; display: block; }
.cap-body { display: flex; flex-direction: column; align-items: center; }
.cap-who { font-size: .5em; letter-spacing: .08em; text-transform: uppercase; opacity: .85; }
.cap-who:empty { display: none; }
.cap-line { display: block; white-space: nowrap; }
`

/**
 * Draws the active caption block into el (position el yourself, e.g. at
 * ctx.safe.zones.captions.y). Builds its DOM once and re-fills the words only
 * when the block changes.
 *   figure(speaker, t)   optional: an SVG string for the speaker, or null
 *   colors               { speaker: '#hex' } for the speaker's name
 *   names                { speaker: 'Shown name' }
 */
export function captions (el, t, plan, { figure, colors = {}, names = {}, fade = 0.2 } = {}) {
  if (!document.getElementById('cap-style')) {
    const style = document.createElement('style')
    style.id = 'cap-style'
    style.textContent = STYLE
    document.head.prepend(style)
  }
  if (!el.querySelector('.cap-pill')) {
    el.classList.add('cap')
    el.innerHTML = '<div class="cap-pill"><span class="cap-fig"></span><div class="cap-body"><span class="cap-who"></span><div class="cap-text"></div></div></div>'
  }
  const block = activeCaption(plan, t)
  const opacity = captionOpacity(block, t, fade)
  el.style.opacity = opacity
  if (!block) return null
  const index = plan.indexOf(block)
  const text = el.querySelector('.cap-text')
  if (el.dataset.block !== String(index)) {
    el.dataset.block = index
    text.innerHTML = block.lines.map((line) => `<span class="cap-line">${line.map((w) => `<span class="cap-w">${w.text}</span>`).join(' ')}</span>`).join('')
    const who = el.querySelector('.cap-who')
    who.textContent = block.speaker ? names[block.speaker] ?? block.speaker : ''
    who.style.color = colors[block.speaker] ?? ''
  }
  const spans = text.querySelectorAll('.cap-w')
  block.lines.flat().forEach((word, i) => { spans[i].style.opacity = wordOpacity(word, t) })
  const fig = el.querySelector('.cap-fig')
  const svg = figure && block.speaker ? figure(block.speaker, t) : null
  if (svg) fig.innerHTML = svg
  else if (fig.innerHTML) fig.innerHTML = ''
  return block
}

// ── talking ──────────────────────────────────────────────────────────────

/** voice/envelope.json ({ fps, lines: { id: [0..1.2 values] } }), or null if missing */
export async function loadEnvelope (url = 'voice/envelope.json') {
  try {
    const response = await fetch(url, { cache: 'no-store' })
    return response.ok ? await response.json() : null
  } catch {
    return null
  }
}

const WINDOW = [1, 2, 3, 4, 3, 2, 1]

/**
 * How loud a speaker is at t, 0..1, for a mouth: the envelope of the line
 * playing at t, smoothed with a 7-tap triangular window and scaled by 0.9.
 * With `speaker`, only cues whose `speaker` matches count. 0 when silent.
 */
export function talk (t, envelope, cues, speaker) {
  if (!envelope?.lines) return 0
  const list = Array.isArray(cues) ? cues : Object.entries(cues ?? {}).map(([id, c]) => ({ id, ...c }))
  const line = list.find((c) => t >= c.start && t < (c.end ?? c.start + c.duration) && (speaker === undefined || c.speaker === speaker))
  const values = line && envelope.lines[line.id]
  if (!values) return 0
  const center = Math.round((t - line.start) * (envelope.fps ?? 30))
  let sum = 0
  WINDOW.forEach((w, k) => { sum += w * (values[center + k - 3] ?? 0) })
  return clamp((sum / 16) * 0.9)
}
