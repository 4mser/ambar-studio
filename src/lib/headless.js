// One headless Chrome, many pages. Unlike openPage() in browser.js, a page here
// is ready when it says so (or when its fonts and images are done), never on
// network idle, and values can be injected before any of its scripts run.
import puppeteer from 'puppeteer'

export function launch () {
  return puppeteer.launch({
    headless: true,
    args: ['--font-render-hinting=none', '--disable-lcd-text', '--hide-scrollbars']
  })
}

/**
 * Opens url in a new page. inject: { name: value } set on window before the
 * page's own scripts run; media: 'print' | 'screen' to emulate.
 */
export async function open (browser, url, { width = 1280, height = 800, scale = 1, inject = null, media = null } = {}) {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) errors.push(message.text())
  })
  page.on('response', (response) => {
    const path = new URL(response.url()).pathname
    // items.json is optional: a still previews without it
    if (response.status() >= 400 && path !== '/favicon.ico' && !path.endsWith('/items.json')) errors.push(`${response.status()} ${path}`)
  })
  await page.setViewport({ width, height, deviceScaleFactor: scale })
  if (inject) await page.evaluateOnNewDocument((values) => Object.assign(window, values), inject)
  if (media) await page.emulateMediaType(media)
  await page.goto(url, { waitUntil: 'load', timeout: 120000 })
  return { page, errors }
}

/** For pages without a ready flag: fonts loaded, images decoded, two frames painted */
export function settle (page) {
  return page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all([...document.images].map((img) => { img.loading = 'eager'; return img.decode().catch(() => {}) }))
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  })
}

/** Adds a <style> to the page (after everything else, so it wins ties) */
export function addStyle (page, css) {
  return page.evaluate((text) => {
    const style = document.createElement('style')
    style.dataset.ambar = ''
    style.textContent = text
    document.head.append(style)
  }, css)
}
