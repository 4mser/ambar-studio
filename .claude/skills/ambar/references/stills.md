# Stills: social posts, store screenshots, link previews

`ambar stills <template.html>` renders one HTML template into an image per item × size: a 6-slide carousel, 5 store screenshots in two sizes, an OG card per page of a site. Starting points: `templates/carousel`, `templates/store`, `templates/og` (each with its own `AMBAR.md`).

## Command

```bash
ambar stills carousel.html                         # sizes and data from the template
ambar stills store.html --sizes ios,ios65,play     # several sizes in one run
ambar stills og.html --data pages.json --webp      # + a WebP at the published width
ambar stills card.html --only launch --scale 2     # one item, @2x
ambar stills og.html --format png8                 # 256-colour PNG (line art on dark)
ambar stills card.html --sheet                     # + a contact sheet per size (review only)
```

Output: `out/<template>/<size>/NN-<id>.png` (NN = position in the data), `out/<template>/sheet-<size>.png` with `--sheet`, `out/<template>/panorama-<size>.png` for panoramas, and `out/<template>/report.json`. The command fails (exit 1) when any image has an error; the files are still written so you can look at them.

Flags: `--data <file>` · `--sizes a,b` · `--scale <n>` (default: the size's own, 1 except `og`/`linkedin` at 2) · `--format png|jpg|webp|png8` · `--webp` (WebP derivative resized to the size's width, needs `cwebp`) · `--sheet` · `--only <id>` · `--serve` (preview in a browser).

## Sizes

| Name | Pixels | Safe zone (top right bottom left) | Aliases |
|---|---|---|---|
| `post` (default) | 1080×1350 | 64 | instagram, ig, carousel, portrait, 4:5 |
| `square` | 1080×1080 | 64 | 1:1 |
| `story` | 1080×1920 | 250 64 400 64 | reel, stories, tiktok, vertical, 9:16 |
| `sheet` | 1200×1500 | 72 | social, lamina |
| `og` | 1200×630 @2x | 48 64 | opengraph, whatsapp, twitter, x, link |
| `linkedin` | 1200×627 @2x | 48 64 | li |
| `ios` | 1320×2868 | 96 80 | ios69, appstore, iphone |
| `ios65` | 1242×2688 | 90 76 | iphone65 |
| `play` | 1080×1920 | 80 64 | android, playstore, google-play |
| `feature` | 1024×500 | 48 64 | play-feature, feature-graphic |
| `icon` | 1024×1024 | 102 | app-icon |
| `icon512` | 512×512 | 51 | play-icon |
| `fbcover` | 1640×624 | 0 265 | facebook, fb (phones show only x 265–1375) |

Any `WIDTHxHEIGHT` works too (5% safe margin). The table lives in `runtime/sizes.js`.

## Writing a template

```html
<meta name="ambar:sizes" content="ios,play">        <!-- default sizes -->
<meta name="ambar:data" content="items.json">       <!-- default data -->
<link rel="stylesheet" href="/@ambar/runtime/ambar.css">
<link rel="stylesheet" href="/@ambar/runtime/fonts.css">
<link rel="stylesheet" href="/@ambar/runtime/stills.css">
<div class="frame"><div class="safe"><h1 id="title"></h1></div></div>
<script type="module">
  import { still } from '/@ambar/runtime/stills.js'
  still({
    fonts: ['800 84px Inter'],                 // loaded before layout
    setup (ctx) {                              // may be async
      document.getElementById('title').textContent = ctx.item.title
    }
  })
</script>
```

- Data: a JSON array (or `{ "items": [...] }`); each item gets an `id` (its own, or `01`, `02`…). Without `--data`, AMBAR looks for the `ambar:data` meta, `<template>.json`, then `items.json`.
- `ctx`: `item`, `items`, `index`, `count`, `size` (name), `width`, `height`, `safe` ({ top, right, bottom, left }), `scale`. The same values arrive as `?item=<id>&size=<name>` and as `window.AMBAR_STILL`, injected before the page loads.
- CSS variables set on `<html>`: `--w`, `--h`, `--k` (width / 1080, to scale a layout drawn at 1080 wide: `calc(84px * var(--k))`), `--safe-top/right/bottom/left`, `--index`, `--count`. `.frame` is one frame; `.safe` is a box inside the safe zone.
- Ready: `still()` waits for the listed fonts, `setup`, `document.fonts.ready` and every `<img>` and CSS background image to decode, then raises `AMBAR_STILL.ready`. The renderer waits for that flag, never for network idle. A failed image or font is an error.
- Preview: `ambar stills <template> --serve` prints a URL per size (`?item=<id>&size=<name>&guides`); `&guides` outlines the safe zone, arrow keys step through the items. It keeps running; start it only when the user wants to look.

## Continuous sets

A swipe that reads as one image:

- **Pan by index:** a `.pan` layer `--pan-count` frames wide, shifted left by `index × width`. Each item renders separately (`templates/store`).
- **Panorama:** `still({ panorama: {} })` (or `{ count: 6 }`) lays all frames side by side in one page (`count × width`), `setup` draws them all from `ctx.items`, and AMBAR shoots it frame by frame (`templates/carousel`). Use it when a drawing crosses from one frame into the next. Text must not straddle a seam: the overflow guard reports it.

## Overflow guard

Before every shot, AMBAR checks the frame: text, images, SVGs and `[data-keep]` boxes that leave the frame are errors, and so is any box that clips or spills its content (`overflow: hidden` clips silently, so a card whose text does not fit is reported, not cropped). Decoration meant to cross edges carries `data-bleed`; `data-check="skip"` excludes an element entirely.

## House rules

- Sizes: shoot at the platform's own pixel size (scale 1) for stores and posts; link previews @2x, published at 1200 wide (`--webp`).
- Post-processing: WebP at quality 82 for the web; 256-colour PNG (`--format png8`) for dark line art; never JPEG for thin lines on near-black (it rings). WhatsApp previews: 80–150 KB.
- Light by default for documents; dark works for OG cards on WhatsApp. No gradient text, no emojis, real Lucide icons, nested radius = inner radius + padding.
- **Carousels:** one fixed grid on every slide (label + `02/06` counter, title, content filling the height, footer). "Swipe" only on the cover. Logo small on slide 1, large on the closer, nowhere else. Each slide names its topic and ends with the question the next one answers. 15–20 words per slide.
- **Store screenshots:** the first three carry the hook and the differentiator. Two short lines of headline per screenshot. The phone shows a real capture (`ambar capture`) or a rebuilt view of the app. Floating cards are rebuilt components with fixed padding, never crops, clamped to the safe margin.
- **OG cards:** the motif fades into the edges, the message stays in the middle band (WhatsApp crops the sides), the product's real colour.
- **Stories:** keep the top 250 px and the bottom 400 px free of anything that must be read.
- **Facebook cover:** everything important between x 265 and 1375.

## Check

`ambar stills <template> --sheet`, then Read `out/<template>/sheet-<size>.png` and look at it: the same grid on every slide, headlines of two lines, nothing near the edges, cards inside the frame. Open single images for detail. Fix every error the command prints.
