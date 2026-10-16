# Brief

Rules for this project. AMBAR (and Claude, through the `ambar` skill) reads this file before writing anything and follows it over the defaults. Delete what does not apply.

## Piece

- **What:** a proposal or quote, A4 (`--paper letter` for US clients): a cover sheet, then sections that flow over as many pages as they need
- **Client:** <name, and the person who signs>
- **Goal:** <the decision the client should make>
- **Prices:** <the real figures, with currency and taxes>. Every `[amount]` in the template is replaced by a figure from this brief, never invented.

## Language and voice

- **Language:** <English | neutral Spanish with "tú" | …>
- **Tone:** <plain and direct | formal>

## Brand

- **Colors:** light paper by default | <your tokens>
- **Fonts:** static only (Inter and Plex Mono from runtime/fonts.css), and only the weights they ship.
- **Logo:** <path to an SVG in this folder, or none>

## Format rules (keep unless the user says otherwise)

- Real A4 pages, never one long page. The footer of every flowing page carries the document name and `page / pages` (`@page` margin boxes).
- Tables repeat their header on each page and never split a row.
- No shadows, no variable fonts: the PDF must show no Type 3 fonts and no soft masks.

## Words

- **Always say:** <names as they must be written>
- **Never say:** <words or promises to avoid>

## Files

- `ambar doc proposal.html` → `out/proposal.pdf`. `--png` adds an image of the cover sheet.
