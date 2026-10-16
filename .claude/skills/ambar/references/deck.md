# Decks

`ambar new <dir> --deck` gives `deck.html`. Every `<section class="slide">` is a 1920×1080 slide. Open the file in a browser to present (arrows, space, `F` fullscreen); `ambar slides deck.html` exports a PDF and a PNG per slide.

## Shape

- One idea per slide. The title states the idea as a sentence ("Costs fell 18% after the move"), not a topic ("Costs").
- 10 to 15 slides for a 20-minute talk. Opening slide, an agenda only if there are more than 12 slides, a closing slide with the ask or the next step.
- Body text 32 px or more, never under 18 px. No more than 5 bullets, no more than 2 lines each. If a slide needs more, split it.
- Numbers get a source line in small text on the slide.

## Markup

```html
<section class="slide">
  <div class="kicker">02 · Results</div>
  <h1>Costs fell <span class="accent">18%</span> after the move.</h1>
  <p>Six months, same traffic, half the servers.</p>
  <div class="brand">AMBAR</div><div data-number></div>
</section>
```

Classes from `slides.css`: `.kicker`, `h1`, `h2`, `p`, `.accent`, `.brand`, `[data-number]` (filled with `02 / 12`). Add a `<style>` block for layouts (grids, charts, image + text). Charts are inline SVG, drawn by you from the data, with the values labeled.

## PDF hygiene

`ambar slides` checks every slide before printing (content that leaves the slide or does not fit its box is an error) and scans the PDF after (Type 3 fonts, soft masks, a page per slide). The rules are the documents' (`references/doc.md`): static fonts in the weights they ship (`/@ambar/runtime/fonts.css`), no shadows in print (`.glass` shadows are stripped and noted), canvases with `{ alpha: false }`, phone layouts under `@media screen and (…)`. Slide PNGs are shot one slide at a time in a viewport of the slide's exact size (`--scale 2` for @2x).

## Check

`ambar check deck.html --json`, then Read `out/check/deck/sheet.png`. Look for slides that are walls of text, titles that wrap to three lines, and inconsistent spacing between slides.
