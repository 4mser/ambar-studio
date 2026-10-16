// AMBAR web player: plays a composition live on a web page, the way a video
// player would, without rendering an MP4. Opened with ?player (usually inside
// an iframe written by `ambar embed`). It reads player.json for the audio,
// the chapters and the captions, and draws render(t) on every animation frame.
//
//   · starts muted and playing; the sound button unmutes (a hint shows once)
//   · a segmented bar with one segment per chapter, clickable
//   · captions in a pill with the mascot, word by word as the voice speaks
//   · keys: space pause, ← → chapters, M sound, F fullscreen
//   · touch: tap the right or left third for the next or previous chapter,
//     hold to pause
//   · pauses itself when less than a third of it is on screen

const SOUND_HINT = 'ambar-player-sound-hint'

const el = (tag, className, html = '') => {
  const node = document.createElement(tag)
  node.className = className
  node.innerHTML = html
  return node
}

const ICONS = {
  muted: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6" fill="none"/></svg>',
  sound: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 8.5a5 5 0 0 1 0 7M19.5 6a8.5 8.5 0 0 1 0 12" fill="none"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l12.5-7.5z"/></svg>',
  full: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" fill="none"/></svg>'
}

/** Which chapter a time falls in */
export function chapterAt (chapters, t) {
  let index = 0
  for (let i = 0; i < chapters.length; i++) if (t >= chapters[i].start) index = i
  return index
}

/** How many words of a caption have been spoken at t */
export function wordsSpoken (caption, t) {
  const words = caption.text.split(/\s+/)
  const k = (t - caption.start) / Math.max(0.1, caption.end - caption.start)
  return Math.max(0, Math.min(words.length, Math.ceil(k * words.length)))
}

export async function mountPlayer ({ stage, width, height, duration, frame }) {
  const config = await fetch('player.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
  const chapters = config.chapters?.length ? config.chapters : [{ title: '', start: 0 }]
  const captions = config.captions ?? []
  const total = config.duration ?? duration
  chapters.forEach((c, i) => { c.end = chapters[i + 1]?.start ?? total })

  document.documentElement.dataset.mode = 'player'
  const css = document.createElement('link')
  css.rel = 'stylesheet'
  css.href = new URL('./player.css', import.meta.url).href
  const styled = new Promise((resolve) => { css.onload = css.onerror = resolve })
  document.head.append(css)
  const root = el('div', 'ap')
  const shell = el('div', 'ap-shell')
  stage.replaceWith(root)
  root.append(shell)
  shell.append(stage)

  const bar = el('div', 'ap-bar')
  const segments = chapters.map((c, i) => {
    const seg = el('button', 'ap-seg', '<i></i>')
    seg.title = c.title
    seg.setAttribute('aria-label', `${i + 1}. ${c.title}`)
    seg.onclick = (e) => { e.stopPropagation(); seek(c.start) }
    bar.append(seg)
    return seg
  })
  const label = el('div', 'ap-label')
  const hint = el('button', 'ap-hint', config.hint ?? 'Activa el sonido')
  const soundBtn = el('button', 'ap-btn', ICONS.muted)
  const pauseBtn = el('button', 'ap-btn', ICONS.pause)
  const fullBtn = el('button', 'ap-btn', ICONS.full)
  soundBtn.setAttribute('aria-label', 'Sonido')
  pauseBtn.setAttribute('aria-label', 'Pausa')
  fullBtn.setAttribute('aria-label', 'Pantalla completa')
  const controls = el('div', 'ap-controls')
  controls.append(hint, soundBtn, pauseBtn, fullBtn)
  const top = el('div', 'ap-top')
  top.append(bar, controls)

  const caption = el('div', 'ap-caption')
  const avatar = el('div', 'ap-avatar', '<svg viewBox="0 0 64 64"><g></g></svg>')
  const speaker = el('b', 'ap-speaker', config.speaker ?? '')
  const words = el('span', 'ap-words')
  caption.append(avatar, speaker, words)
  shell.append(top, label, caption)

  // ── clock: the audio element when there is one, the frame clock otherwise
  const audio = config.audio ? new Audio(config.audio) : null
  if (audio) { audio.muted = true; audio.preload = 'auto' }
  let t = 0
  let playing = true
  let userPaused = false
  let visible = true
  let last = performance.now()

  const play = () => {
    playing = true
    last = performance.now()
    pauseBtn.innerHTML = ICONS.pause
    if (audio) { audio.currentTime = t; audio.play().catch(() => {}) }
  }
  const pause = () => {
    playing = false
    pauseBtn.innerHTML = ICONS.play
    audio?.pause()
  }
  const seek = (time) => {
    t = Math.max(0, Math.min(total - 0.001, time))
    if (audio) audio.currentTime = t
    draw()
  }
  const setMuted = (muted) => {
    if (!audio) return
    audio.muted = muted
    soundBtn.innerHTML = muted ? ICONS.muted : ICONS.sound
    hint.hidden = true
    try { localStorage.setItem(SOUND_HINT, '1') } catch {}
    if (!muted && playing) { audio.currentTime = t; audio.play().catch(() => {}) }
  }
  try { if (localStorage.getItem(SOUND_HINT)) hint.hidden = true } catch {}
  if (!audio) { soundBtn.hidden = true; hint.hidden = true }

  const fit = () => {
    const box = root.getBoundingClientRect()
    const scale = Math.min(box.width / width, box.height / height)
    shell.style.width = `${width * scale}px`
    shell.style.height = `${height * scale}px`
    shell.style.fontSize = `${Math.max(9, Math.min(16, (width * scale) / 80))}px` // controls scale with the frame
    stage.style.transform = `scale(${scale})`
    stage.style.left = stage.style.top = '0px'
  }
  await styled // sizes are only right once player.css applies
  new ResizeObserver(fit).observe(root)
  fit()

  let lastCaption = -1
  function draw () {
    frame(t)
    const index = chapterAt(chapters, t)
    segments.forEach((seg, i) => {
      const c = chapters[i]
      const k = i < index ? 1 : i > index ? 0 : (t - c.start) / Math.max(0.1, c.end - c.start)
      seg.firstChild.style.transform = `scaleX(${Math.max(0, Math.min(1, k))})`
      seg.classList.toggle('on', i === index)
    })
    label.textContent = config.label !== false && chapters[index].title ? `${String(index + 1).padStart(2, '0')} · ${chapters[index].title}` : ''
    const ci = captions.findIndex((c) => t >= c.start - 0.15 && t <= c.end + 0.5)
    caption.classList.toggle('on', ci >= 0)
    if (ci >= 0) {
      const c = captions[ci]
      if (ci !== lastCaption) {
        words.innerHTML = c.text.split(/\s+/).map((w) => `<i>${w}</i>`).join(' ')
        lastCaption = ci
      }
      const n = wordsSpoken(c, t)
      words.querySelectorAll('i').forEach((w, i) => w.classList.toggle('said', i < n))
      if (typeof window.mascotaAmbar === 'function') {
        const talking = t < c.end ? 0.5 + 0.5 * Math.sin(t * 17) : 0
        avatar.querySelector('g').innerHTML = window.mascotaAmbar({ x: 32, y: 34, R: 17, t, expr: 'normal', habla: talking, mira: [0.3, 0] })
      }
    }
  }

  const loop = (now) => {
    if (playing && visible) {
      if (audio && !audio.paused && !audio.muted) t = audio.currentTime
      else t += (now - last) / 1000
      if (t >= total) { t = 0; if (audio) audio.currentTime = 0 }
      draw()
    }
    last = now
    requestAnimationFrame(loop)
  }

  // ── input
  soundBtn.onclick = hint.onclick = (e) => { e.stopPropagation(); setMuted(!audio.muted) }
  pauseBtn.onclick = (e) => { e.stopPropagation(); userPaused = playing; playing ? pause() : play() }
  fullBtn.onclick = (e) => {
    e.stopPropagation()
    if (document.fullscreenElement) document.exitFullscreen()
    else (root.requestFullscreen ?? root.webkitRequestFullscreen)?.call(root)
  }
  const go = (step) => seek(chapters[Math.max(0, Math.min(chapters.length - 1, chapterAt(chapters, t) + step))].start)
  addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); pauseBtn.click() }
    if (e.code === 'ArrowRight') go(1)
    if (e.code === 'ArrowLeft') go(-1)
    if (e.code === 'KeyM') soundBtn.click()
    if (e.code === 'KeyF') fullBtn.click()
  })
  let pressed = 0
  shell.addEventListener('pointerdown', () => { pressed = performance.now() })
  shell.addEventListener('pointerup', (e) => {
    if (performance.now() - pressed > 350) return // a hold, not a tap
    const x = e.clientX / innerWidth
    if (x > 0.66) go(1)
    else if (x < 0.33) go(-1)
    else pauseBtn.click()
  })
  shell.addEventListener('contextmenu', (e) => e.preventDefault())
  let holding = null
  shell.addEventListener('pointerdown', () => { holding = setTimeout(() => { if (playing) { pause(); holding = 'paused' } }, 350) })
  shell.addEventListener('pointerup', () => { if (holding === 'paused') play(); else clearTimeout(holding); holding = null })

  // pause when mostly off screen (works inside an iframe too)
  new IntersectionObserver(([entry]) => {
    visible = entry.intersectionRatio >= 0.35
    if (!visible) audio?.pause()
    else if (playing && !userPaused) play()
  }, { threshold: [0, 0.35, 1] }).observe(document.documentElement)

  draw()
  play()
  requestAnimationFrame(loop)
}
