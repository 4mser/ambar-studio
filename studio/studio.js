// AMBAR Studio: drives the composition's render(t) from a timeline. The
// composition runs in an iframe in studio mode; the narration cues come from
// the composition itself, and out/mix.wav (if rendered) plays in sync.
const $ = (id) => document.getElementById(id)
const params = new URLSearchParams(location.search)
const entry = params.get('entry') ?? 'index.html'

const comp = $('comp')
const audio = $('audio')
let amber = null
let t = 0
let playing = false
let last = 0

comp.src = `/${entry}?studio`
audio.src = '/out/mix.wav'
audio.onerror = () => audio.removeAttribute('src')

const fmt = (x) => x.toFixed(2)

function fit () {
  if (!amber) return
  const box = $('viewport').getBoundingClientRect()
  const scale = Math.min((box.width - 64) / amber.width, (box.height - 64) / amber.height)
  Object.assign($('frame').style, {
    width: `${amber.width}px`,
    height: `${amber.height}px`,
    transform: `scale(${scale})`,
    left: `${(box.width - amber.width * scale) / 2}px`,
    top: `${(box.height - amber.height * scale) / 2}px`
  })
}

function seek (time, { syncAudio = true } = {}) {
  t = Math.min(amber.duration, Math.max(0, time))
  amber.render(t)
  $('time').textContent = fmt(t)
  $('frameNo').textContent = `f ${Math.round(t * amber.fps)}`
  $('scrub').value = t
  if (syncAudio && audio.getAttribute('src')) audio.currentTime = t
}

function setPlaying (value) {
  playing = value
  $('play').textContent = playing ? '❚❚' : '▶'
  last = performance.now()
  if (audio.getAttribute('src')) {
    audio.playbackRate = Number($('speed').value)
    if (playing) { audio.currentTime = t; audio.play().catch(() => {}) } else audio.pause()
  }
}

function loop (now) {
  if (playing && amber) {
    let next = t + ((now - last) / 1000) * Number($('speed').value)
    if (next >= amber.duration) next = 0
    seek(next, { syncAudio: next === 0 })
  }
  last = now
  requestAnimationFrame(loop)
}

function drawCues () {
  const box = $('cues')
  box.innerHTML = ''
  for (const [id, cue] of Object.entries(amber.cues ?? {})) {
    const el = document.createElement('div')
    el.className = 'cue'
    el.textContent = id
    el.title = `${id} · ${fmt(cue.start)}–${fmt(cue.end)} s`
    el.style.left = `${(cue.start / amber.duration) * 100}%`
    el.style.width = `${Math.max(0.6, (cue.duration / amber.duration) * 100)}%`
    el.onclick = () => seek(cue.start)
    box.append(el)
  }
}

comp.addEventListener('load', () => {
  const wait = () => {
    amber = comp.contentWindow.AMBAR
    if (!amber?.ready) return setTimeout(wait, 50)
    $('meta').textContent = `${entry} · ${amber.width}×${amber.height} · ${amber.fps} fps · ${fmt(amber.duration)} s`
    $('total').textContent = `/ ${fmt(amber.duration)} s`
    $('scrub').max = amber.duration
    drawCues()
    fit()
    seek(0)
  }
  wait()
})

$('play').onclick = () => setPlaying(!playing)
$('back').onclick = () => { setPlaying(false); seek(t - 1 / amber.fps) }
$('next').onclick = () => { setPlaying(false); seek(t + 1 / amber.fps) }
$('scrub').oninput = (e) => { setPlaying(false); seek(Number(e.target.value)) }
$('speed').onchange = () => { audio.playbackRate = Number($('speed').value) }
$('safe').onclick = () => { $('safe').classList.toggle('on'); $('safeAreas').classList.toggle('on') }
addEventListener('resize', fit)
addEventListener('keydown', (e) => {
  if (!amber) return
  if (e.code === 'Space') { e.preventDefault(); setPlaying(!playing) }
  if (e.code === 'ArrowLeft') { setPlaying(false); seek(t - (e.shiftKey ? 1 : 1 / amber.fps)) }
  if (e.code === 'ArrowRight') { setPlaying(false); seek(t + (e.shiftKey ? 1 : 1 / amber.fps)) }
  if (e.code === 'Home') seek(0)
  if (e.code === 'KeyS') $('safe').click()
})
requestAnimationFrame(loop)
