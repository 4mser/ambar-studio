// AMBAR slides: every <section class="slide"> is a fixed-size slide.
// In the browser it is a presenter (arrows, space, F for fullscreen, the
// number of the slide in the URL hash); with ?print it lays every slide out as
// a page for `ambar slides`.
export function deck ({ width = 1920, height = 1080 } = {}) {
  const root = document.documentElement
  const slides = [...document.querySelectorAll('.slide')]
  root.style.setProperty('--slide-w', `${width}px`)
  root.style.setProperty('--slide-h', `${height}px`)
  slides.forEach((slide, i) => {
    slide.dataset.index = String(i + 1)
    const number = slide.querySelector('[data-number]')
    if (number) number.textContent = `${String(i + 1).padStart(2, '0')} / ${String(slides.length).padStart(2, '0')}`
  })

  if (new URLSearchParams(location.search).has('print')) {
    root.dataset.mode = 'print'
    const style = document.createElement('style')
    style.textContent = `@page { size: ${width}px ${height}px; margin: 0 }`
    document.head.append(style)
    window.AMBAR_DECK = { ready: true, width, height, count: slides.length }
    return
  }

  root.dataset.mode = 'present'
  let current = Math.min(slides.length, Math.max(1, Number(location.hash.slice(1)) || 1))
  const show = (n) => {
    current = Math.min(slides.length, Math.max(1, n))
    slides.forEach((slide, i) => slide.classList.toggle('is-current', i === current - 1))
    history.replaceState(null, '', `#${current}`)
  }
  const fit = () => {
    const scale = Math.min(innerWidth / width, innerHeight / height)
    root.style.setProperty('--slide-scale', String(scale))
  }
  addEventListener('resize', fit)
  addEventListener('keydown', (e) => {
    if (['ArrowRight', 'ArrowDown', 'PageDown', 'Space'].includes(e.code)) { e.preventDefault(); show(current + 1) }
    if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.code)) { e.preventDefault(); show(current - 1) }
    if (e.code === 'Home') show(1)
    if (e.code === 'End') show(slides.length)
    if (e.code === 'KeyF') document.fullscreenElement ? document.exitFullscreen() : root.requestFullscreen()
  })
  addEventListener('click', (e) => show(current + (e.clientX > innerWidth / 3 ? 1 : -1)))
  fit()
  show(current)
  window.AMBAR_DECK = { ready: true, width, height, count: slides.length }
}
