// A product tutorial over real captures of the Harbor demo app
// (ambar capture examples/tutorial). The camera, the cursor, the typing and
// the spotlights all hang off the narration cues of ambar.json.
import { video, cue, css, ease, fadeUp, keys, progress, span, mascot, words, rise, $ } from '/@ambar/runtime/ambar.js'
import { loadShots, screencast } from '/@ambar/runtime/screen.js'

const STEPS = ['Sign in', 'Find your board', 'Create a task', 'Check it']
let sc, title

video({
  async setup ({ stage }) {
    const shots = await loadShots()
    sc = screencast(stage, shots, { device: 'laptop', width: 1180, url: 'harbor.example/board' })
    css(sc.root, { left: '640px', top: '128px' })
    await Promise.all(Object.values(sc.images).map((img) => img.decode()))

    $('#steps').innerHTML = STEPS.map((s, i) => `<div class="step"><b>${i + 1}</b><span>${s}</span></div>`).join('')
    title = words($('#title'), 'Create your {first} task')
  },

  render (t, { duration }) {
    const intro = cue('intro', 1.2, 3)
    const signin = cue('signin', 4.8, 3.4)
    const board = cue('board', 12.0, 4)
    const create = cue('create', 16.6, 3)
    const done = cue('done', 23.3, 3.4)

    // Which shot is on screen
    const showDialog = create.start + 0.9
    const showSaved = create.start + 4.2
    sc.show(t, [[0, 'login'], [signin.start + 4.6, 'board'], [showDialog, 'dialog'], [showSaved, 'saved']])

    // Camera: [time, zoom, target]; targets are "shot.box" or [x, y] in app px
    sc.camera(t, [
      [0, 1, [720, 450]],
      [signin.start, 1, [720, 450]],
      [signin.start + 0.6, 1.55, 'login.card'],
      [signin.start + 4.4, 1.55, 'login.card'],
      [signin.start + 5.0, 1, [720, 450]],
      [board.start + 0.4, 1, [720, 450]],
      [board.start + 1.0, 1.35, [820, 300]],
      [create.start, 1.35, [820, 300]],
      [create.start + 0.5, 1.6, 'board.add'],
      [showDialog + 0.2, 1.6, 'dialog.dialog'],
      [showSaved, 1.6, 'dialog.dialog'],
      [showSaved + 0.7, 1.3, 'saved.task'],
      [duration, 1.3, 'saved.task']
    ])

    // Cursor and clicks
    const clicks = [signin.start + 0.9, signin.start + 2.9, signin.start + 4.4, create.start + 0.7, create.start + 1.6, create.start + 3.9]
    sc.cursor(t, [
      [signin.start + 0.2, [1100, 760]],
      [signin.start + 0.85, 'login.email'],
      [signin.start + 2.4, 'login.email'],
      [signin.start + 2.85, 'login.password'],
      [signin.start + 3.9, 'login.password'],
      [signin.start + 4.35, 'login.signin'],
      [create.start, [900, 300]],
      [create.start + 0.65, 'board.add'],
      [create.start + 1.0, 'board.add'],
      [create.start + 1.55, 'dialog.title'],
      [create.start + 3.4, 'dialog.title'],
      [create.start + 3.85, 'dialog.save'],
      [create.start + 4.3, [1180, 520]]
    ], clicks)

    // Typing over the empty fields of the captures
    sc.type(t, { box: 'login.email', text: 'alex@harbor.example', at: signin.start + 1.1, until: signin.start + 4.6 })
    sc.type(t, { box: 'login.password', text: 'correct horse', at: signin.start + 3.0, until: signin.start + 4.6, mask: true })
    sc.type(t, { box: 'dialog.title', text: 'Ship the new landing page', at: create.start + 1.8, rate: 18, until: showSaved })

    // Spotlights and callouts
    sc.clear()
    sc.spotlight(t, { box: 'board.list', from: board.start + 1.0, to: board.start + 3.0 })
    sc.spotlight(t, { box: 'board.user', from: board.start + 3.0, to: create.start - 0.2, pad: 8 })
    sc.callout(t, { box: 'board.user', text: 'Private data is blurred', from: board.start + 3.2, to: create.start - 0.2, side: 'bottom' })
    sc.spotlight(t, { box: 'saved.task', from: done.start + 0.4, to: duration + 1 })
    sc.callout(t, { box: 'saved.task', text: 'Your new task', from: done.start + 0.6, to: duration + 1, side: 'bottom' })

    // Device enters, lesson text and steps on the left
    const enter = ease.out(progress(t, 0.1, 1.1))
    css(sc.root, { opacity: enter, transform: `translateY(${(1 - enter) * 60}px) scale(${0.96 + 0.04 * enter})` })
    fadeUp($('#lesson .kicker'), t, 0.3)
    rise(title, t, 0.5)
    const active = [signin, board, create, done].filter((c) => t >= c.start - 0.2).length - 1
    $('#steps').querySelectorAll('.step').forEach((step, i) => {
      fadeUp(step, t, 1 + i * 0.12)
      const on = i === active
      const past = i < active
      step.style.color = on ? '#FFF4E0' : past ? 'rgba(255,244,224,.62)' : 'rgba(255,244,224,.38)'
      css(step.querySelector('b'), {
        background: on ? '#F2A324' : past ? 'rgba(242,163,36,.22)' : 'transparent',
        color: on ? '#2b1503' : past ? '#FFD27A' : 'rgba(255,244,224,.5)',
        borderColor: on || past ? '#F2A324' : 'rgba(255,210,122,.25)'
      })
      step.querySelector('b').textContent = past ? '✓' : String(i + 1)
    })

    // ÁMBAR keeps an eye on the screen from the corner
    const talking = [intro, signin, board, create, done].some((c) => t > c.start && t < c.end)
    $('#m').innerHTML = mascot({
      x: 230, y: 880, R: 90, t,
      expr: t > done.start ? 'feliz' : 'normal',
      mira: [0.9, -0.3],
      habla: talking ? 0.5 + 0.5 * Math.sin(t * 17) : 0,
      parpadeo: Math.max(0, 1 - Math.abs((t % 4.1) - 0.1) / 0.09),
      chispas: span(t, done.start + 0.3, duration + 1) * 0.8
    })
    css($('#barFill'), { width: `${(t / duration) * 100}%` })
  }
})
