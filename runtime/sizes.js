// Named output sizes for stills: social posts, stories, store screenshots,
// link previews, icons and covers. Each one has its pixel size (the size the
// platform asks for, rendered at scale 1), the margins that stay safe from the
// platform's own chrome or crops, and a default capture scale. DOM-free, so the
// renderer (Node) and the page runtime (browser) share it.

const edges = (top, right = top, bottom = top, left = right) => ({ top, right, bottom, left })

export const SIZES = {
  post: { width: 1080, height: 1350, safe: edges(64), aliases: ['instagram', 'ig', 'carousel', 'portrait', '4:5'], note: 'Instagram post or carousel slide, 4:5. The default.' },
  square: { width: 1080, height: 1080, safe: edges(64), aliases: ['1:1'], note: 'Square post.' },
  story: { width: 1080, height: 1920, safe: edges(250, 64, 400, 64), aliases: ['reel', 'stories', 'tiktok', 'vertical', '9:16'], note: 'Story or reel cover. The top 250 px and the bottom 400 px sit under the app\'s own buttons.' },
  sheet: { width: 1200, height: 1500, safe: edges(72), aliases: ['social', 'lamina'], note: 'Social sheet, 4:5 at 1200 wide.' },
  og: { width: 1200, height: 630, scale: 2, safe: edges(48, 64), aliases: ['opengraph', 'whatsapp', 'twitter', 'x', 'link'], note: 'Link preview (Open Graph). Captured @2x, published 1200 wide; WhatsApp crops the sides, keep the message centred.' },
  linkedin: { width: 1200, height: 627, scale: 2, safe: edges(48, 64), aliases: ['li'], note: 'LinkedIn shared image.' },
  ios: { width: 1320, height: 2868, safe: edges(96, 80), aliases: ['ios69', 'appstore', 'app-store', 'iphone'], note: 'App Store screenshot, iPhone 6.9".' },
  ios65: { width: 1242, height: 2688, safe: edges(90, 76), aliases: ['iphone65'], note: 'App Store screenshot, iPhone 6.5".' },
  play: { width: 1080, height: 1920, safe: edges(80, 64), aliases: ['android', 'playstore', 'google-play', 'gplay'], note: 'Google Play phone screenshot.' },
  feature: { width: 1024, height: 500, safe: edges(48, 64), aliases: ['play-feature', 'feature-graphic'], note: 'Google Play feature graphic. Keep text out of the centre if the listing has a video (the play button covers it).' },
  icon: { width: 1024, height: 1024, safe: edges(102), aliases: ['app-icon', 'icon1024'], note: 'App icon, 1024. Stores round the corners: keep the mark inside the central 80%.' },
  icon512: { width: 512, height: 512, safe: edges(51), aliases: ['play-icon'], note: 'Google Play icon, 512.' },
  fbcover: { width: 1640, height: 624, safe: edges(0, 265), aliases: ['facebook', 'facebook-cover', 'fb'], note: 'Facebook cover. Phones show only x 265–1375.' }
}

/** Looks a size up by name or alias ("ig", "appstore"…), or parses "1200x900" */
export function resolveSize (name) {
  const key = String(name).trim().toLowerCase()
  if (SIZES[key]) return { name: key, scale: 1, ...SIZES[key] }
  for (const [id, size] of Object.entries(SIZES)) {
    if (size.aliases.includes(key)) return { name: id, scale: 1, ...size }
  }
  const custom = key.match(/^(\d+)\s*[x×]\s*(\d+)$/)
  if (custom) {
    const [width, height] = [Number(custom[1]), Number(custom[2])]
    const m = Math.round(Math.min(width, height) * 0.05)
    return { name: `${width}x${height}`, width, height, scale: 1, safe: edges(m), aliases: [], note: 'Custom size.' }
  }
  const known = Object.keys(SIZES).join(', ')
  throw new Error(`Unknown size "${name}". Use one of: ${known}, or WIDTHxHEIGHT.`)
}

/** "post,story" or ['post', 'story'] → resolved sizes, without duplicates */
export function resolveSizes (list) {
  const names = Array.isArray(list) ? list : String(list).split(',')
  const seen = new Map()
  for (const n of names.map((x) => x.trim()).filter(Boolean)) {
    const size = resolveSize(n)
    seen.set(size.name, size)
  }
  return [...seen.values()]
}
