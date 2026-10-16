# Brief

Rules for this project. AMBAR (and Claude, through the `ambar` skill) reads this file before writing anything and follows it over the defaults. Delete what does not apply.

## Piece

- **What:** a long infographic, one page 1600 px wide that scrolls: numbered sections, each with a short text and a diagram
- **Goal:** <what the reader should understand at the end>
- **Audience:** <who, and what they already know>
- **Where it goes:** <a site, a LinkedIn document post, a PDF sent by email…>

## Language and voice

- **Language:** <English | neutral Spanish with "tú" | …>
- **Tone:** <plain and direct | warm | formal>

## Brand

- **Colors:** light paper by default (`--paper` tokens in doc.css) with the AMBAR amber accents | <your tokens>
- **Fonts:** static only (Inter and Plex Mono from runtime/fonts.css), and only the weights they ship: 400–800 and 400–500.

## Format rules (keep unless the user says otherwise)

- One idea per section: a numbered header, two lines of text, one diagram.
- Diagrams are inline SVG drawn from the facts, with every value labelled. Labels that sit on a line get a halo (`class="halo"`); for the PDF the template turns halos into paper-coloured shapes, because stroked text prints as Type 3.
- No shadows, no variable fonts, no canvas with transparency: it prints as one long PDF page.

## Facts

Sources the piece may rely on: <links, files>. Anything not here or in those sources stays out.

## Files

- `ambar doc infographic.html --long --png` → `out/infographic.pdf` (one page, 1600 px wide) and `out/infographic.png` (@2x, stitched from 3000 px tiles). `--width 1080` for a narrower page.
