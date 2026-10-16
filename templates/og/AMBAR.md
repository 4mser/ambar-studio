# Brief

Rules for this project. AMBAR (and Claude, through the `ambar` skill) reads this file before writing anything and follows it over the defaults. Delete what does not apply.

## Piece

- **What:** link preview cards (Open Graph), 1200×630, one per page of the site
- **Site:** <URL>
- **Where they show:** <WhatsApp, LinkedIn, X, Slack…>

## Language and voice

- **Language:** <English | neutral Spanish with "tú" | …>

## Brand

- **Colors:** <AMBAR palette | your tokens>; the motif uses the product's real colour.
- **Fonts:** <Inter from runtime/fonts.css | a static font you have the right to use>

## Format rules (keep unless the user says otherwise)

- Dark background: it reads well in WhatsApp's light and dark chats.
- The motif fades into every edge; the message sits in the middle band because WhatsApp crops the sides.
- A title of 4–8 words with one highlighted phrase (`{like this}` in `items.json`), and the site's address.
- Rendered @2x (2400×1260) and published at 1200 wide: `--webp` writes the WebP, or `--format png8` a 256-colour PNG for line art. WhatsApp previews should weigh 80–150 KB. No JPEG: it rings around thin lines on near-black.

## Words

- **Always say:** <product names as they must be written>
- **Never say:** <words or claims to avoid>

## Files

- `items.json`: per page `id`, `kicker`, `title`, `url`.
- `ambar stills og.html --webp` → `out/og/og/01-home.png` + `01-home.webp`. Add `--sizes og,linkedin` for LinkedIn (1200×627).
