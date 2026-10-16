// AMBAR family: ÁMBAR and two characters made with the kit, Sol (orbs) and Mint (a coin),
// introduce themselves in a 4:5 post. Everything they do is a function of time: arrivals
// with a trail, mood crossfades, gaze that turns to camera before each line, irregular
// blinks and a mouth driven by the voice envelope of the line.
import { video, cue, words, rise, fadeUp, span, ease, progress, css, $ } from '/@ambar/runtime/ambar.js'

const { character, ambar, blinks, blinkAt, moods, dominant, gazeAt, arrive, trail, envelopeAt } = window.AmbarKit

// Two made-up members of the family: same gel and eyes, their own palette and features
const sol = character({
  name: 'Sol',
  palette: { edge: '#8CF5E6', mid: '#22B8A7', deep: '#0B5E57', core: '#032623', eye: '#C9FFF6', halo: '#2FD3BF', light: '#D4FFF8', accent: '#7FE9FF' },
  accessory: 'orbs'
})
const mint = character({
  name: 'Mint',
  palette: { edge: '#B6F59A', mid: '#4CC25A', deep: '#1C6A2A', core: '#08290F', eye: '#E2FFD2', halo: '#5BDB6A', light: '#E6FFDB', accent: '#C8F57F' },
  lobes: [[-62, 0.15, 0.2], [-118, 0.15, 0.2]],
  lashes: false,
  blush: true,
  accessory: 'coin'
})

const CAST = {
  ambar: { draw: ambar, name: 'Ámbar', color: '#FFC861', light: '#FFE7B3', home: [540, 540], R: 118 },
  sol: { draw: sol, name: 'Sol', color: '#8CF5E6', light: '#D4FFF8', home: [280, 905], R: 88, from: [-240, 640], at: 0.3 },
  mint: { draw: mint, name: 'Mint', color: '#B6F59A', light: '#E6FFDB', home: [800, 905], R: 88, from: [1320, 640], at: 0.9 }
}
const WHO = Object.keys(CAST)
const ARRIVAL = 1.5

const S = { envelope: null, text: {}, blinks: {} }

/** Where a character is at t: home, or on its way there */
function place (who, t) {
  const c = CAST[who]
  if (!c.from) return { x: c.home[0], y: c.home[1], velocity: [0, 0] }
  return arrive(t, c.from, c.home, c.at, ARRIVAL)
}

/** The arrival path of a character, for its trail */
const pathOf = (who) => (u) => {
  const q = place(who, u)
  return [q.x, q.y]
}

/** 0 → 1 from a, critically damped: settles without overshoot */
const pop = (t, a) => {
  const k = progress(t, a, 1)
  return 1 - Math.exp(-7 * k) * (1 + 7 * k)
}

/** Gaze keys: whoever speaks looks to camera 0.9 s before the line, the others look at them */
function gazeKeys (who, L) {
  const beats = [[0, 'sol'], [1.2, 'mint'], [L.ambar.start - 0.9, 'ambar'], [L.sol.start - 0.9, 'sol'], [L.mint.start - 0.9, 'mint'], [L.mint.end + 0.5, 'camera']]
  const dir = (focus) => {
    if (focus === who || focus === 'camera') return [0, 0]
    const [x0, y0] = CAST[who].home
    const [x1, y1] = CAST[focus].home
    const d = Math.hypot(x1 - x0, y1 - y0)
    return [(x1 - x0) / d, ((y1 - y0) / d) * 0.6]
  }
  const keys = []
  let prev = dir(beats[0][1])
  for (const [time, focus] of beats) {
    const next = dir(focus)
    keys.push([time, ...prev], [time + 0.35, ...next])
    prev = next
  }
  return keys
}

/** Mood keys per character, hung from the narration */
function moodKeys (who, L, reveal) {
  if (who === 'ambar') {
    return [[0, 'dormida'], [0.7, 'sorprendida'], [1.6, 'normal'], [L.ambar.start - 0.4, 'feliz'], [L.ambar.end + 0.3, 'normal'],
      [reveal.orbs, 'sorprendida'], [reveal.orbs + 1.1, 'feliz'], [L.sol.end + 0.4, 'normal'], [reveal.coin + 0.2, 'feliz']]
  }
  const c = CAST[who]
  const line = L[who]
  const keys = [[0, 'gota'], [c.at + ARRIVAL - 0.3, 'normal'], [line.start - 0.3, 'feliz'], [line.end + 0.4, 'normal'], [L.mint.end + 0.3, 'feliz']]
  if (who === 'mint') keys.splice(3, 0, [reveal.coin, 'sorprendida'], [reveal.coin + 0.9, 'feliz'])
  return keys
}

video({
  width: 1080,
  height: 1350,
  async setup ({ duration }) {
    S.title = words($('#title'), 'One kit, a {family}.')
    const config = await (await fetch('ambar.json')).json()
    for (const line of config.lines) S.text[line.id] = line.text
    try {
      S.envelope = await (await fetch('voice/envelope.json')).json()
    } catch {}
    WHO.forEach((who, i) => { S.blinks[who] = blinks(i + 3, duration + 1) })
  },

  render (t, { duration }) {
    const L = { ambar: cue('ambar', 2.2, 3.4), sol: cue('sol', 6.6, 3.2), mint: cue('mint', 10.8, 3.6) }
    const reveal = { orbs: L.sol.start + 0.9, coin: L.mint.start + 1.2 }

    css($('#grain'), { '--grain-x': `${(t * 41) % 24}px`, '--grain-y': `${(t * 67) % 24}px` })
    fadeUp($('#kicker'), t, 0.2)
    rise(S.title, t, 0.35)

    let cast = ''
    let trails = ''
    for (const who of WHO) {
      const c = CAST[who]
      const p = place(who, t)
      const weights = moods(t, moodKeys(who, L, reveal))
      const gaze = gazeAt(t, gazeKeys(who, L))
      const options = {
        x: p.x,
        y: p.y + Math.sin(t * 1.3 + c.home[0]) * 5,
        R: c.R,
        t,
        weights,
        expression: dominant(weights),
        velocity: p.velocity,
        gaze,
        turn: [gaze[0] * 0.12, 0],
        blink: blinkAt(t, S.blinks[who]),
        talk: envelopeAt(t, S.envelope, who, L[who].start),
        sparkle: span(t, L.mint.end + 0.4, duration + 1) * 0.8
      }
      // Sol's orbs grow in as it names them; Mint's coin pops when it is mentioned
      if (who === 'sol') Object.assign(options, { orbs: 6 * ease.out(progress(t, reveal.orbs, 1.6)), aperture: 0.4 + 0.45 * ease.out(progress(t, reveal.orbs, 2)) })
      if (who === 'mint') options.coin = { scale: pop(t, reveal.coin) }
      if (c.from) trails += trail(pathOf(who), t, { from: c.at, to: c.at + ARRIVAL, color: c.light })
      cast += c.draw(options)
      css($(`#glow-${who}`), { left: `${p.x}px`, top: `${p.y}px`, opacity: c.from ? ease.out(progress(t, c.at + 0.6, 1)) : 1 })
    }
    $('#trails').innerHTML = trails
    $('#cast').innerHTML = cast

    // Caption: who is speaking, as a small figure of them, and the line
    const speaking = WHO.find((who) => t > L[who].start - 0.2 && t < L[who].end + 0.45)
    const caption = $('#caption')
    if (speaking) {
      const c = CAST[speaking]
      const k = Math.min(ease.out(progress(t, L[speaking].start - 0.2, 0.3)), 1 - ease.inOut(progress(t, L[speaking].end + 0.15, 0.3)))
      css(caption, { opacity: k })
      if (caption.dataset.who !== speaking) {
        caption.dataset.who = speaking
        $('#who').textContent = c.name
        $('#who').style.color = c.color
        $('#line').textContent = S.text[speaking] ?? ''
      }
      const weights = moods(t, moodKeys(speaking, L, reveal))
      $('#figure').innerHTML = c.draw.figure({
        R: 26, t, weights, expression: dominant(weights),
        blink: blinkAt(t, S.blinks[speaking]),
        talk: envelopeAt(t, S.envelope, speaking, L[speaking].start),
        orbs: speaking === 'sol' ? 6 * ease.out(progress(t, reveal.orbs, 1.6)) : undefined,
        coin: speaking === 'mint' ? { scale: pop(t, reveal.coin) } : undefined
      })
    } else css(caption, { opacity: 0 })

    // Close: the call that makes a new member of the family
    const close = ease.out(progress(t, L.mint.end + 0.7, 0.6))
    css($('#code'), { opacity: close, transform: `translateX(-50%) translateY(${(1 - close) * 24}px)` })
  }
})
