// AMBAR launch video. Every scene hangs off a narration cue, so changing a
// line of ambar.json moves its scene with it. The fallbacks keep the timing
// sensible before `ambar voice` has run.
import {
  video, cue, words, letters, rise, fadeUp, span, keys, ease, progress, hash, mascot, css, $
} from '/@ambar/runtime/ambar.js'

const CODE = [
  ['<span class="k">video</span>({', 'video({'],
  ['  <span class="f">render</span> (t) {', '  render (t) {'],
  ['    title.style.opacity =', '    title.style.opacity ='],
  ['      <span class="f">span</span>(t, <span class="k">1</span>, <span class="k">4</span>)', '      span(t, 1, 4)'],
  ['    <span class="c">// same t → same frame</span>', '    // same t → same frame'],
  ['  }', '  }'],
  ['})', '})']
]

const CARDS = [
  ['01', 'Deterministic', 'Chrome steps through every frame. No timing drift, ever.'],
  ['02', 'Voice-synced', 'Each line of narration is a cue that scenes hang from.'],
  ['03', 'One command', 'Voice, mix, frames and encode: ambar render.']
]

const OUTPUTS = [['MP4', 'Video', '1920×1080 · 30 fps'], ['PDF', 'Slides', 'one page per slide'], ['A4', 'Documents', 'print-exact']]

const T = {}

video({
  setup ({ stage }) {
    T.t1 = letters($('#t1'), 'AMBAR')
    T.t2 = words($('#t2'), 'Every frame is a {function} of {time}.')
    T.t3 = words($('#t3'), 'The narration {drives} the timeline.')
    T.t4 = words($('#t4'), 'Video, slides and documents.')
    T.t5 = words($('#t5'), 'Write it once. {Render} it anywhere.')

    $('#src').innerHTML = CODE.map(([html], i) => `<div class="ln" data-i="${i}">${html}</div>`).join('')
    T.lines = [...$('#src').children]

    $('#cards').innerHTML = CARDS.map(([n, h, p]) => `<div class="card glass"><b>${n}</b><h3>${h}</h3><p>${p}</p></div>`).join('')
    T.cards = [...$('#cards').children]

    $('#outputs').innerHTML = OUTPUTS.map(([ext, name, note]) => `<div class="out"><div class="file glass">${ext}</div><span>${name}</span><em>${note}</em></div>`).join('')
    T.outs = [...$('#outputs').children]
  },

  render (t, { duration }) {
    const hello = cue('hello', 1.4, 1.2)
    const time = cue('time', 3.4, 4.6)
    const sync = cue('sync', 8.8, 4.6)
    const outputs = cue('outputs', 14.1, 3.2)
    const outro = cue('outro', 18.0, 2.2)

    // Scene windows: each scene lives from its cue until the next one starts
    const s1 = [0, time.start - 0.3]
    const s2 = [time.start - 0.3, sync.start - 0.3]
    const s3 = [sync.start - 0.3, outputs.start - 0.3]
    const s4 = [outputs.start - 0.3, outro.start - 0.3]
    const s5 = [outro.start - 0.3, duration]

    // Background: slow drifting light
    const [ox, oy] = keys(t, [[0, 300, 120], [s2[0], 1100, -80], [s3[0], 520, 280], [s4[0], 1200, 300], [s5[0], 510, 120], [duration, 520, 90]])
    css($('#orb1'), { transform: `translate(${ox}px, ${oy}px)` })
    css($('#orb2'), { transform: `translate(${1400 - ox * 0.7}px, ${520 - oy * 0.5}px)` })
    css($('#grain'), { '--grain-x': `${(t * 41) % 24}px`, '--grain-y': `${(t * 67) % 24}px` })
    css($('#barFill'), { width: `${(t / duration) * 100}%` })

    // ÁMBAR: drops in, moves to the side for the scenes, comes back to wave
    const [mx, my, mr] = keys(t, [
      [0, 960, -260, 210], [0.35, 960, 400, 210], [s1[1] - 0.4, 960, 400, 210],
      [s2[0] + 0.4, 170, 925, 92], [s5[0], 170, 925, 92], [s5[0] + 0.9, 960, 420, 230], [duration, 960, 420, 230]
    ], ease.inOut)
    const landing = progress(t, 0.35, 0.5)
    const squash = landing > 0 && landing < 1 ? Math.sin(landing * Math.PI) * (1 - landing) * 2.2 : 0
    const happy = t < s1[1] || t > s5[0] + 0.6 || (t > sync.start && t < sync.end)
    $('#m').innerHTML = mascot({
      x: mx, y: my, R: mr, t,
      expr: happy ? 'feliz' : 'normal',
      estira: squash,
      habla: [hello, time, sync, outputs, outro].some((c) => t > c.start && t < c.end) ? 0.6 + 0.4 * Math.sin(t * 18) : 0,
      mira: t > s2[0] && t < s5[0] ? [0.9, -0.4] : [0, 0],
      parpadeo: Math.max(0, 1 - Math.abs((t % 3.7) - 0.1) / 0.09),
      chispas: span(t, s1[0] + 0.6, s1[1]) + span(t, s5[0] + 1, duration) * 0.8
    })

    // 1 · hello
    fadeUp($('#k1'), t, hello.start - 0.6, s1[1])
    rise(T.t1, t, hello.start - 0.3, s1[1], 0.07, 60)
    css($('#s1'), { transform: `translateY(${210 + (1 - ease.out(progress(t, 0.3, 1))) * 40}px)` })

    // 2 · time: title on the left, the code types itself on the right
    css($('#s2'), { opacity: span(t, s2[0], s2[1]) })
    $('#s2').querySelector('.kicker').style.opacity = 1
    rise(T.t2, t, s2[0] + 0.1, s2[1])
    const codeIn = span(t, s2[0] + 0.3, s2[1])
    css($('#code'), { opacity: codeIn, transform: `translateY(${(1 - codeIn) * 40}px) rotate(${(1 - codeIn) * 2}deg)` })
    T.lines.forEach((line, i) => {
      const a = time.start + 0.5 + i * 0.42
      css(line, { opacity: ease.out(progress(t, a, 0.3)), transform: `translateX(${(1 - ease.out(progress(t, a, 0.4))) * -24}px)` })
    })

    // 3 · sync: three cards rise one after another
    css($('#s3'), { opacity: span(t, s3[0], s3[1]) })
    $('#s3').querySelector('.kicker').style.opacity = 1
    rise(T.t3, t, s3[0] + 0.1, s3[1])
    T.cards.forEach((card, i) => {
      const k = ease.settle(progress(t, sync.start + 0.3 + i * 0.35, 0.7))
      const o = 1 - ease.inOut(progress(t, s3[1] - 0.45, 0.45))
      css(card, { opacity: Math.min(1, k) * o, transform: `translateY(${(1 - k) * 80}px) scale(${0.94 + 0.06 * k})` })
    })

    // 4 · outputs
    css($('#s4'), { opacity: span(t, s4[0], s4[1]) })
    $('#s4').querySelector('.kicker').style.opacity = 1
    rise(T.t4, t, s4[0] + 0.1, s4[1])
    T.outs.forEach((out, i) => {
      const a = outputs.start + 0.4 + i * 0.5
      const k = ease.settle(progress(t, a, 0.6))
      const o = 1 - ease.inOut(progress(t, s4[1] - 0.45, 0.45))
      const float = Math.sin(t * 1.4 + i * 1.3) * 8
      css(out, { opacity: Math.min(1, k) * o, transform: `translateY(${(1 - k) * 70 + float}px) rotate(${(i - 1) * (1 - k) * 6}deg)` })
    })

    // 5 · outro: the command types itself
    css($('#s5'), { opacity: span(t, s5[0], duration + 1) })
    rise(T.t5, t, outro.start - 0.1)
    fadeUp($('#cmd'), t, outro.start + 0.5)
    const text = 'ambar render ./my-video'
    const n = Math.floor(Math.max(0, Math.min(text.length, (t - outro.start - 0.8) * 22)))
    $('#cmdText').textContent = text.slice(0, n)
    css($('#caret'), { opacity: n < text.length || Math.floor(t * 2) % 2 === 0 ? 1 : 0 })

    // tiny dust particles in the light, deterministic
    if (!T.dust) {
      T.dust = Array.from({ length: 26 }, (_, i) => {
        const d = document.createElement('div')
        css(d, { position: 'absolute', width: '6px', height: '6px', borderRadius: '50%', background: '#FFD27A', filter: 'blur(1px)' })
        $('#stage').insertBefore(d, $('#grain'))
        return d
      })
    }
    T.dust.forEach((d, i) => {
      const x = hash(i) * 1920
      const y = (hash(i + 99) * 1080 - t * (12 + hash(i + 7) * 20)) % 1080
      css(d, { left: `${x}px`, top: `${(y + 1080) % 1080}px`, opacity: 0.15 + 0.35 * hash(i + 3) * (0.6 + 0.4 * Math.sin(t * 2 + i)) })
    })
  }
})
