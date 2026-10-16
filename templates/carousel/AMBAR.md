# Brief

Rules for this project. AMBAR (and Claude, through the `ambar` skill) reads this file before writing anything and follows it over the defaults. Delete what does not apply.

## Piece

- **What:** Instagram carousel, 6 slides at 1080×1350 (4:5): a cover, 4 content slides and a closer
- **Goal:** <what the reader should know or do after the last slide>
- **Audience:** <who, and what they already know>
- **Where it goes:** <Instagram, LinkedIn document post…>

## Language and voice

- **Language:** <English | neutral Spanish with "tú" | …>
- **Tone:** <plain and direct | warm | formal>

## Brand

- **Colors:** <AMBAR palette | your tokens, e.g. --brand: #0057ff>
- **Fonts:** <Inter from runtime/fonts.css | a static font you have the right to use>
- **Logo:** <path to an SVG in this folder>. Small on the cover, large on the closer, nowhere else.

## Format rules (keep unless the user says otherwise)

- One fixed grid on every slide: label + `02/06` counter, title, content filling the height, footer.
- Each slide names its topic in the label and ends with the question the next slide answers.
- 15–20 words per slide, title included. Only the cover says "swipe".
- The background runs across all six slides (panorama): a swipe reads as one picture.

## Words

- **Always say:** <product names as they must be written>
- **Never say:** <words or claims to avoid>

## Facts

Sources the piece may rely on: <links, files>. Anything not here or in those sources stays out.

## Files

- `items.json`: one entry per slide (`kind`: `cover`, `closer` or a content slide with `icon`, `title`, `text`, `next`).
- `ambar stills carousel.html --sheet` → `out/carousel/post/01-cover.png …` plus `out/carousel/panorama-post.png` and a contact sheet.
