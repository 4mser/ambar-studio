# Resources: free music, sound, voices, fonts, images and libraries

Where to get material for a piece, and what each license asks of you. Licenses were checked on the official pages in October 2026; anything marked **unverified** could not be confirmed there. Licenses change: read the license on the asset's own page before you download, and keep a note of it.

## Rules

- **The license is per file**, not per site. OpenGameArt, Freesound, Free Music Archive, ccMixter and Wikimedia Commons mix licenses on the same site; the asset page decides.
- **Prefer CC0 and public domain.** Then CC BY (credit). Avoid NC (non-commercial), ND (no derivatives: a video with the track in it is a derivative) and SA (your piece inherits the license) unless the user accepts the terms.
- **Write it down.** Every file you add from outside goes into `CREDITS.md` in the project folder: file, title, author, source URL, license, date downloaded. Generated credits come from that file.
- **"May commit" below means the raw file in a git repo.** "Public" means a repo anyone can clone, which counts as redistribution. Licenses that forbid standalone redistribution (Pixabay, Sonniss, unDraw packs, Pexels) allow the finished piece but not the raw file in a public repo. In doubt, keep raw assets out of git and list where to download them.
- **No recognisable people, brands or logos from stock in anything commercial** unless the user owns the rights. Stock licenses cover the photographer's copyright, not the person or the trademark in it.
- House rules still apply: real produced music only, no vocals under narration, no emojis, real icons only.

## 1. Music beds

| Source | License | What it asks | May commit | Use it for |
|---|---|---|---|---|
| [Incompetech](https://incompetech.com/music/royalty-free/) (Kevin MacLeod) | CC BY 4.0 (paid Standard License removes the credit) | Credit in the exact format below | Yes, with `CREDITS.md` | Produced cinematic, corporate and electronic beds with no vocals |
| [Free Music Archive](https://freemusicarchive.org/) | Per track: CC0, CC BY, BY-SA, BY-NC, BY-ND, BY-NC-SA, BY-NC-ND, or FMA-Limited | BY: title, author, source, license. FMA-Limited forbids video use | CC0 / CC BY: yes. Others: no | Modern electronic and lo-fi beds; filter by CC0 or CC BY |
| [Pixabay Music](https://pixabay.com/music/) | Pixabay Content License | No credit. No standalone sale or distribution of the file | Private repo only | Quick, polished commercial-style beds |
| [OpenGameArt](https://opengameart.org/) | Per asset: CC0, CC BY, CC BY-SA, OGA-BY, GPL | Follow the asset's notice. Previews are all rights reserved unless noted | CC0: yes. CC BY / OGA-BY: yes, with credit | Loops and game-style beds; filter by CC0 |
| [Musopen](https://musopen.org/) | Public domain recordings of classical works (**unverified**: the site blocked checks; secondhand copies of its FAQ ask for credit and no resale) | Credit "Musopen" as a courtesy | Yes, if the recording page says public domain | Classical music for formal or documentary pieces |
| [ccMixter](https://ccmixter.org/) | Per track; site describes Noncommercial and Sampling licenses (**unverified** which tracks are plain CC BY) | Read each track; Sampling tracks cannot be used in advertising | Only plain CC BY or CC0 tracks | Remixes; many have vocals, so check before using under narration |

- **YouTube Audio Library** ([help page](https://support.google.com/youtube/answer/3376882)): Google says only that tracks are "copyright-safe" and won't be claimed through Content ID, and that CC tracks need a credit in the video description. It does not say whether the standard tracks may be used off YouTube. Use them for YouTube uploads only, and do not commit them.
- **Content ID**: a CC or royalty-free track can still be claimed on YouTube by a third party who registered it. Keep the source page and license so the claim can be disputed. Kevin MacLeod's FAQ suggests using the track's ISRC for this.
- Pick tracks without vocals or vocal chops. A track you cannot verify the license of is not used.

## 2. Sound effects

| Source | License | What it asks | May commit | Use it for |
|---|---|---|---|---|
| [Freesound](https://freesound.org/search/) | Per sound: CC0, CC BY 4.0, CC BY-NC 4.0 (old sounds: Sampling+) | BY: title, author, URL, license per sound. Filter by CC0 to skip credits | CC0: yes. CC BY: yes, with credit | Foley, ambiences, real stamps and paper |
| [Kenney audio](https://kenney.nl/assets/category:Audio) | CC0 1.0 | Nothing; "Kenney" credit appreciated | Yes | Interface clicks, switches, UI sounds |
| [Sonniss GDC bundles](https://sonniss.com/gameaudiogdc) | Sonniss GDC license v2.0 (27 Aug 2026) | No credit. Commercial use allowed. No supplying the sounds as sounds to anyone, modified or not. No AI training | No (team-only private repo at most) | Film-quality impacts, whooshes, risers |
| [BBC Sound Effects](https://sound-effects.bbcrewind.co.uk/) | BBC RemArc licence: personal, educational and research use; commercial use needs a paid licence | Per BBC terms (full text **unverified**: the site needs JavaScript) | No | Personal or classroom pieces only; never client or product work |

- AMBAR's synthesized effects (`audio.md`) need no license at all. Reach for a file only when the synthesized set cannot do it.

## 3. Voices

| Tool | License | Spanish | Use it for |
|---|---|---|---|
| [Piper](https://github.com/OHF-Voice/piper1-gpl) (`piper1-gpl`) | GPL-3.0 code. Old `rhasspy/piper` was MIT, archived Oct 2025 | `es_ES`, `es_MX`, `es_AR` voices in [piper-voices](https://huggingface.co/rhasspy/piper-voices); each voice has its own `MODEL_CARD` license (`es_MX/ald`: Unlicense dataset; `es_MX/claude`: Apache-2.0 dataset) | Offline drafts and long scratch reads; quality below Gemini |
| [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) | Apache-2.0 weights | `ef_dora` (F), `em_alex` (M), `em_santa` (M); its own docs warn non-English support may be thin | Offline English narration; test Spanish before trusting it |
| [whisper.cpp](https://github.com/ggml-org/whisper.cpp) | MIT; Whisper weights MIT ([openai/whisper](https://github.com/openai/whisper)) | Spanish supported by the multilingual models | Transcribing takes to verify every word; `-ml 1` gives word timestamps (experimental). Runs on Metal on Apple Silicon |

- Running GPL Piper as a separate command does not change AMBAR's own license; bundling its code inside AMBAR would.
- Read the voice's `MODEL_CARD` before publishing with it. Some Piper voices come from datasets with restrictive terms.
- A local voice never replaces `ambar voice --verify` and a person listening.

## 4. Fonts

| Source | License | May commit | Use it for |
|---|---|---|---|
| [Google Fonts](https://fonts.google.com/) | Per family: mostly SIL OFL 1.1, some Apache-2.0 or Ubuntu Font License | Yes, with the family's license file next to it | Choosing a family |
| [Fontsource](https://fontsource.org/) | Same as the family (`@fontsource/inter`: OFL-1.1) | Yes, with the license file | Self-hosted woff2, one file per weight: `@fontsource/<family>/400.css` |
| AMBAR bundled (`runtime/fonts/`) | OFL 1.1 (`runtime/fonts/OFL.txt`) | Already committed | Inter 400–800 and IBM Plex Mono 400–500 |

- **Static weights for anything printed.** Use `@fontsource/<family>` (static), not `@fontsource-variable/<family>`: a variable font becomes Type 3 glyphs in the PDF (`doc.md`). Ship only the weights you use.
- OFL fonts may be embedded in PDFs and videos and bundled; you may not sell the font file on its own or reuse a reserved font name for a modified version.

## 5. Icons and illustrations

| Source | License | What it asks | May commit | Use it for |
|---|---|---|---|---|
| [Lucide](https://lucide.dev/license) | ISC; Feather-derived icons MIT | Keep the copyright notice with copies of the icon files | Yes, with the notice | Interface icons (house default, `craft.md`) |
| [Simple Icons](https://simpleicons.org/) | CC0-1.0 (the brands themselves stay trademarks) | Follow each brand's guidelines | Yes | Brand logos (house default) |
| [Phosphor](https://phosphoricons.com/) | MIT | Keep the notice | Yes | Six weights incl. duotone, when Lucide lacks a glyph |
| [Tabler Icons](https://tabler.io/icons) | MIT | Keep the notice | Yes | Large set (5,000+) with the same stroke style as Lucide |
| [Heroicons](https://heroicons.com/) | MIT | Keep the notice | Yes | Tailwind-style apps, to match their own icons |
| [Material Symbols](https://fonts.google.com/icons) | Apache-2.0 | Keep the notice; credit appreciated | Yes | Android and Google-style app tutorials |
| [Open Peeps](https://www.openpeeps.com/) | CC0 | Nothing | Yes | Hand-drawn people for explainers |
| [unDraw](https://undraw.co/license) | unDraw license (custom, not open source) | No credit. No packs, no competing service, no scraping, no AI training or fine-tuning | Only the few a piece uses, never a set | Flat scene illustrations |

- Mix one icon family per piece. Use the SVG as published; change color and size only. Leave a comment with the source.

## 6. Photos and stock video

| Source | License | Restrictions | May commit | Use it for |
|---|---|---|---|---|
| [Unsplash](https://unsplash.com/license) | Unsplash License | No selling without significant modification; no compiling into a similar service. Credit optional ("Photo by X on Unsplash") | Private repo only | Editorial and lifestyle photos |
| [Pexels](https://www.pexels.com/license/) | Pexels License | No identifiable people in a bad light; no implied endorsement by people or brands; no selling unaltered; no redistribution on stock or wallpaper sites; not as a trademark | Private repo only | Photos and stock video clips |
| [Pixabay](https://pixabay.com/service/license-summary/) | Pixabay Content License | No standalone sale or distribution; no commercial use of recognisable trademarks; no misleading use; not as a trademark | Private repo only | Photos, video, vectors |
| [NASA](https://www.nasa.gov/nasa-brand-center/images-and-media/) | Generally not copyrighted in the US | Credit NASA. Insignia and logos are protected. No implied endorsement. No likeness of current astronauts or employees in promotion. Some images are third-party | Yes, if not third-party | Space, Earth and science imagery |
| [Wikimedia Commons](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia) | Per file (PD, CC0, CC BY, CC BY-SA…) | Credit the creator (not the uploader), name and link the license; personality and trademark rights apply separately | Per file license | Historical photos, maps, real places |

- Pixabay's terms forbid scraping for machine learning; download by hand.

## 7. Libraries inside a scene

`render(t)` depends on `t` only (`SKILL.md`). Build once in `setup`, set state from `t` every frame, and never let a library run its own clock. Serve the library from the project folder (vendored ESM file or `node_modules`); a CDN that is down breaks the render.

| Library | License | Drive it from `t` | Avoid |
|---|---|---|---|
| [d3](https://d3js.org/) | ISC | Scales, shapes, `d3.interpolate*` and layouts; compute `progress(t)` and set attributes yourself | `d3-transition`, `d3-timer`, `d3-force` simulations left running (precompute ticks in `setup`) |
| [three.js](https://threejs.org/) | MIT | Set camera, object transforms and uniforms from `t`, then `renderer.render(scene, camera)` inside `render(t)` | `setAnimationLoop`, `THREE.Clock`, `AnimationMixer.update(delta)` (use `mixer.setTime(t)`). Check WebGL works in headless Chrome first |
| [lottie-web](https://github.com/airbnb/lottie-web) | MIT | `autoplay: false`, `loop: false`, then `anim.goToAndStop(frame, true)` with `frame = t * fps` of the file | `play()`, `setSpeed`, autoplay |
| [matter.js](https://brm.io/matter-js/) | MIT | Only stepped deterministically: in `setup` run `Engine.update(engine, 1000 / 60)` for the whole duration and store positions; `render(t)` reads the stored frame | `Runner`, `Render.run`, variable deltas, stepping inside `render(t)` |
| [Rough.js](https://roughjs.com/) | MIT | Pass a fixed `seed` in options; draw in `setup`, reveal with stroke-dashoffset from `t` | Redrawing without `seed` (it uses `Math.random`) |
| [KaTeX](https://katex.org/) | MIT | `katex.render` once in `setup`; animate opacity and transforms from `t` | Rendering before fonts load: wait for `document.fonts.ready` |
| [Shiki](https://shiki.style/) | MIT | `codeToHtml` once in `setup` (async, await it); reveal lines from `t` | Highlighting per frame |
| [Prism](https://prismjs.com/) | MIT | `Prism.highlightElement` once in `setup` | Auto-highlight on load racing the first frame |
| [Chart.js](https://www.chartjs.org/) | MIT | `animation: false`, set data from `t`, then `chart.update('none')` | Its built-in animations (they run on `requestAnimationFrame`) |

- AMBAR's own `runtime/charts.js` is the first choice for charts: already deterministic and on brand.
- Nothing in a scene may use `Math.random`, `Date`, `performance.now`, `requestAnimationFrame`, `setTimeout`, CSS transitions or CSS animations. Seeded noise comes from `hash`, `seeded` and `noise1`. `ambar check` reports violations.

## 8. What AMBAR itself uses

| Tool | License | Note |
|---|---|---|
| [Puppeteer](https://pptr.dev/) | Apache-2.0 | The only npm dependency; drives headless Chrome |
| [FFmpeg](https://ffmpeg.org/legal.html) | LGPL 2.1 or later; GPL 2 or later when built with GPL parts such as libx264 | Called as an external command, not bundled. Homebrew's build includes GPL parts |
| Inter, IBM Plex Mono | OFL 1.1 | Bundled in `runtime/fonts/` with `OFL.txt` |
| Lucide, Simple Icons | ISC / CC0-1.0 | Icon sources named in `craft.md` |

FFmpeg's legal page says nothing about the media it outputs; the license applies to FFmpeg as software.

## Credits

CC BY needs title, author, source and license wherever the work is seen. Generate both forms from `CREDITS.md`.

Kevin MacLeod's format (from the Incompetech FAQ), in the video description:

```
Music: "Title" Kevin MacLeod (incompetech.com)
Licensed under Creative Commons: By Attribution 4.0
https://creativecommons.org/licenses/by/4.0/
```

Several sources in a description:

```
Music: "Title" by Artist (source URL), CC BY 4.0
Sound: "Sound name" by user (freesound.org/s/12345), CC BY 4.0
License: https://creativecommons.org/licenses/by/4.0/
```

On a site, in the footer or on a credits page linked from it:

```html
<footer>
  Music: “Title” by <a href="https://incompetech.com">Kevin MacLeod</a>,
  licensed under <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>.
</footer>
```

- A video with no description field (an ad, a file sent by mail) carries the credit in its end card, readable for at least two seconds.
- CC0, Pixabay, Unsplash, Pexels, Kenney and Open Peeps need no credit; add it when there is room.
