// Headless Chrome through Puppeteer, opened on a served page.
import puppeteer from 'puppeteer'

export async function openPage (url, { width = 1920, height = 1080, scale = 1 } = {}) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--font-render-hinting=none', '--disable-lcd-text', '--hide-scrollbars']
  })
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) errors.push(message.text())
  })
  page.on('response', (response) => {
    const path = new URL(response.url()).pathname
    // timings.json is optional until `ambar voice` runs
    if (response.status() >= 400 && path !== '/favicon.ico' && !path.endsWith('/voice/timings.json')) errors.push(`${response.status()} ${path}`)
  })
  await page.setViewport({ width, height, deviceScaleFactor: scale })
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 120000 })
  await page.evaluate(() => document.fonts.ready)
  return { browser, page, errors }
}

/** Waits for a composition to call video() and returns its settings */
export async function waitForComposition (page, errors) {
  try {
    await page.waitForFunction(() => window.AMBAR?.ready === true, { timeout: 60000 })
  } catch {
    const reason = errors.length ? `\n  ${errors.join('\n  ')}` : ''
    throw new Error(`The composition never became ready (did it call video()?)${reason}`)
  }
  return page.evaluate(() => {
    const { width, height, fps, duration, cues } = window.AMBAR
    return { width, height, fps, duration, cues }
  })
}
