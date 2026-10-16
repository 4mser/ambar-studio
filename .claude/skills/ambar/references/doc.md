# Documents

`ambar new <dir> --doc` gives `doc.html`. Every `<section class="page">` is an A4 page (210×297 mm) printed exactly as designed; `ambar doc doc.html` exports the PDF, `--png` adds an image per page (`--scale`, default 2). Other starting points: `templates/proposal` (a quote: cover sheet + flowing pages with a page counter) and `templates/infographic` (one long page).

## Paper and layout

- `--paper a4 | letter | a5` (or `<html data-paper="letter">`): A4 210×297 mm, US Letter 8.5×11 in (816×1056 px), A5 148×210 mm. Sheets take the size from `--paper-w` / `--paper-h`.
- **Sheets** (`<section class="page">`): one fixed page each, edge-to-edge colour, you place the content. AMBAR reports any sheet whose content leaves it or does not fit a box (`overflow: hidden` clips silently), and warns when the PDF has more pages than sheets.
- **Flow** (`<main class="flow">`): content runs over as many pages as it needs. Margins, running footers and `page / pages` counters go in the document's own `@page` rule with margin boxes (`@bottom-right { content: counter(page) " / " counter(pages) }`); sheets keep `@page sheet { margin: 0 }`. Table headers repeat on every page; rows do not split. Use it for quotes, proposals and reports: real multipage A4, never one giant page.
- **Long page** (`ambar doc page.html --long [--width 1600] [--png] [--scale 2]`): the whole page as one PDF page `width × content height`, and with `--png` one tall PNG shot in 3000 px tiles and stitched (a single shot would pass Chrome's texture limit). Right for an infographic meant to scroll; wrap it in `<article class="page long">`. Avoid `position: fixed` and `vh` units on long pages.

## Shape

- Reports, one-pagers, proposals, certificates. Start with the conclusion; the reader of a report may only read page 1.
- Cover or header with title, date and author. Footer with the document name and `n / total`.
- Body 10–11 pt, headings 16 pt, tables 9–10 pt. Never under 9 px rendered.
- Pages do not flow on their own yet: you place content per page. When a section does not fit, move it to the next `.page` and update the footers. `ambar check` reports text cut off by the page.

## PDF hygiene

`ambar doc` and `ambar slides` audit the page before printing and scan the PDF after; fix every warning:

- **Static fonts only.** A variable font (the macOS system font included) is embedded as Type 3 glyphs, which print soft and do not search. Load `/@ambar/runtime/fonts.css` (Inter 400–800, Plex Mono 400–500, one file per weight) or another static font, one file per weight.
- **Never ask for a weight the font does not have.** Chrome fakes the bold, and a faked bold is Type 3 too. AMBAR names the element that asks.
- **No stroked text in print.** An SVG halo (`paint-order: stroke`) is Type 3 in a PDF: for print, put a paper-coloured shape behind the label (the infographic template swaps halos for shapes when the URL has `?print`, which `ambar doc` adds).
- **No shadows in anything printed.** `box-shadow`, `text-shadow` and `drop-shadow` render as grey or black blocks in Quartz and Preview. Keep them inside `@media screen`; AMBAR strips them from print and says where they were.
- **Canvases:** `getContext('2d', { alpha: false })` and clear to the paper colour, drawn after `document.fonts.ready`; otherwise each canvas becomes a soft mask (`/SMask`). Pages with a canvas print at 1.5x.
- **Phone layouts:** `@media screen and (max-width: …)`. A bare `@media (max-width: …)` is evaluated against the page box when printing.
- **Verify** with `pdffonts out/<doc>.pdf` (no `Type 3` rows) and, on macOS, look at the page through Quartz (`sips -s format png out/<doc>.pdf --out p.png`), which is what Preview and Mail show.

## Markup

```html
<section class="page">
  <div class="kicker">01 · Overview</div>
  <h1>Title</h1>
  <p>…</p>
  <div class="footer"><span>Report name</span><span>01 / 03</span></div>
</section>
```

Base styles live in `doc.css` (`.page`, `.kicker`, `h1`, `h2`, `p`, `li`, `.footer`); add a `<style>` block for tables, cards and charts. Dark covers use a page-level background.

## Check

`ambar check doc.html --json`, then Read `out/check/<name>/sheet.png`. Look for pages that end half empty before a page full to the edge, widowed headings at the bottom of a page and tables split badly.
