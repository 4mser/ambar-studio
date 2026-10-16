// AMBAR motion example: a 4:5 post that walks through the motion library.
// A settle curve that never overshoots, one straight camera move, charts
// that draw themselves, and particles flying into a word, with word-timed
// captions under it all. Every shape is built once in setup; render(t) only
// moves attributes.
import { video, cue, $, css, ease, revealLines, scramble, counter } from '/@ambar/runtime/ambar.js'
import { camera, breathe, punch } from '/@ambar/runtime/motion.js'
import { appear, scenes, lightSweep, grain, dust, morph, sample, motionBlur } from '/@ambar/runtime/fx.js'
import { line, bars, ring } from '/@ambar/runtime/charts.js'
import { planCaptions, captions } from '/@ambar/runtime/captions.js'

const NS = 'http://www.w3.org/2000/svg'
const SETTLE = Array.from({ length: 41 }, (_, i) => ease.settle(i / 40))
const WEEK = [42, 48, 45, 61, 58, 74, 69, 83]
const DAYS = [12, 18, 15, 27, 22, 9, 14]
const S = {}

const dots = (svg, n, r, fill) => Array.from({ length: n }, () => {
  const c = document.createElementNS(NS, 'circle')
  c.setAttribute('r', r)
  c.setAttribute('fill', fill)
  svg.append(c)
  return c
})

video({
  format: 'post',

  setup ({ cues }) {
    S.plan = planCaptions(cues, { maxChars: 36 })
    S.dust = dots($('#dust'), 22, 2.5, '#ffd27a')

    // a 3 × 2 board; only the detail tile carries text
    $('#cam').innerHTML = Array.from({ length: 6 }, (_, i) => {
      const x = 33 + (i % 3) * 301
      const y = 48 + Math.floor(i / 3) * 316
      const detail = i === 4
      return `<div class="tile${detail ? ' detail' : ''}" style="left:${x}px;top:${y}px">${detail ? '<b>The<br>detail</b>' : ''}<i style="top:150px;width:${60 + (i * 37) % 40}%"></i><i style="top:190px;width:${40 + (i * 23) % 35}%"></i></div>`
    }).join('')
    S.detail = $('#cam .detail')

    // particles: a ring that becomes a word
    S.to = sample.text('AMBAR', { x: 540, y: 770, font: '800 230px system-ui, sans-serif', step: 9, max: 520 })
    S.from = sample.circle(540, 770, 250, S.to.length)
    S.swarm = dots($('#swarm'), S.to.length, 3.6, '#f2a324')
  },

  render (t, { safe }) {
    const intro = cue('intro', 0.8, 2.5)
    const cam = cue('camera', 3.9, 4.3)
    const charts = cue('charts', 8.8, 2.7)
    const shape = cue('shape', 12.2, 3.7)
    const cuts = [cam.start - 0.3, charts.start - 0.3, shape.start - 0.3]

    // background: breathing light, dust, grain
    css($('#orb'), { transform: breathe(t, 2).transform })
    S.dust.forEach((c, i) => {
      const p = dust(i, t, { w: 1080, h: 1350, seed: 4 })
      c.setAttribute('cx', p.x.toFixed(1))
      c.setAttribute('cy', p.y.toFixed(1))
      c.setAttribute('opacity', p.alpha.toFixed(3))
    })
    grain($('#grain'), t)

    // scenes: transparent layers, so the outgoing one leaves before the next arrives
    scenes(t, [[$('#s1'), 0], [$('#s2'), cuts[0]], [$('#s3'), cuts[1]], [$('#s4'), cuts[2]]], 0.5, { mode: 'through' })
    lightSweep($('#sweep'), t, cuts, { alpha: 0.18 })

    // 1 · settle
    scramble($('#k1'), 'EASE.SETTLE', t, intro.start - 0.6, 0.6)
    revealLines($('#t1'), ['Motion that settles'], t, intro.start - 0.5)
    appear($('#card'), t, intro.start - 0.2)
    line($('#curve'), SETTLE, t, intro.start + 0.3, 1.2, { min: 0, max: 1 })

    // 2 · camera: one move, straight, into the detail
    scramble($('#k2'), 'MOTION.CAMERA', t, cuts[0] + 0.1, 0.6)
    revealLines($('#t2'), ['One move per shot'], t, cuts[0] + 0.15)
    const keys = [[cam.start + 0.6, 1, 468, 340], [cam.start + 3, S.detail, 1.3]]
    const shot = camera(t, keys, { width: 936, height: 680, root: $('#cam') })
    const before = camera(t - 1 / 30, keys, { width: 936, height: 680, root: $('#cam') })
    css($('#cam'), { transform: shot.transform })
    motionBlur($('#cam'), shot.x - before.x, shot.y - before.y)

    // 3 · charts
    scramble($('#k3'), 'CHARTS', t, cuts[1] + 0.1, 0.5)
    revealLines($('#t3'), ['Charts that draw'], t, cuts[1] + 0.15)
    line($('#chart'), WEEK, t, charts.start, 1.3, { x: 10, y: 20, width: 916, height: 260 })
    bars($('#chart'), DAYS, t, charts.start + 0.5, 0.65, { x: 0, y: 360, width: 540, height: 340, highlight: 'peak', label: (v) => `${v} h` })
    ring($('#chart'), 0.72, t, charts.start + 0.8, 0.9, { cx: 760, cy: 540, r: 140, comet: true })
    $('#pct').textContent = counter(t, charts.start + 0.8, 0.9, 0, 72, { easing: ease.out, suffix: '%' })

    // 4 · shape: the ring of particles flies into the word, one soft hit on landing
    scramble($('#k4'), 'FX.MORPH', t, cuts[2] + 0.1, 0.5)
    revealLines($('#t4'), ['Into a new shape'], t, cuts[2] + 0.15)
    const land = shape.start + 0.4 + 1.6
    morph(S.from, S.to, t, shape.start + 0.4, 1.6, 7).forEach((p, i) => {
      S.swarm[i].setAttribute('cx', p.x.toFixed(1))
      S.swarm[i].setAttribute('cy', p.y.toFixed(1))
    })
    css($('#swarm'), { transform: `scale(${punch(t, [land], 0.04)})`, opacity: Math.min(1, (t - cuts[2]) / 0.3) })

    // captions in the post's subtitle zone
    css($('#caps'), { top: `${safe.zones.captions.top}px`, height: `${safe.zones.captions.bottom - safe.zones.captions.top}px` })
    captions($('#caps'), t, S.plan)
  }
})
