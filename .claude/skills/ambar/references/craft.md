# Craft

House rules learned producing real pieces: videos, reels, carousels, store pages, ads, decks and reports. Each rule carries the reason it exists, because the reason tells you how to apply it to a case the rule does not name. The brief (`AMBAR.md`) overrides any of them.

Motion, mascots, audio, stills and documents have their own references (`motion.md`, `mascots.md`, `audio.md`, `stills.md`, `doc.md`); this file is everything else.

## Process

- **One test piece first.** Before a series, make one piece and get it approved. Five reels made at once shared the same flaws five times.
- **Validate a new direction with a short test** (about 8 s) before the full piece.
- **A reference from the client is a spec.** Copy its structure and level of finish with the client's brand; do not invent your own look on top of it.
- **"Improve it" means polish inside the same system**: same theme, same composition, same characters. A "better" piece in a new direction is a different piece.
- **"Fix this" means only this.** Change the one thing asked. When fixing voices, do not touch the script.
- **An approved system is reused**: palette, motion language, layout chassis. Pull frames from the approved piece and copy its language before making anything new for that brand.
- **After a rejection, if the taste is hard to read, show two or three concrete directions side by side** instead of iterating blind. If that fails too, ask for reference videos.
- **Keep the list of rejected options** (names, accessories, effects) in the brief and never offer them again.
- **Copy edits**: one strategic change, length within about ±20%. Offer more as options.
- **Look before you build**: an approved version of a render or simulation may already exist in the project.

## Truth

- Print the source on screen for any external statistic ("Toast + Resy, 2026").
- Label illustrative numbers on screen: EXAMPLE, DEMO DATA, ILLUSTRATIVE SCENARIO.
- Check every product claim against the real product. Do not show screens or features that do not exist, are switched off or are not released.
- Never use empty states in promotional material ("You have no movements yet" argues against the post).
- Never fake native screenshots (chat apps, notes, testimonials).
- Do not invent promotions, discounts or customers.
- Keep the same numbers on every screen of one piece, and compare like with like (this Tuesday against last Tuesday).
- Do not disparage an identifiable competitor or claim it lacks something it has.
- Sell the capability, not the implementation detail ("detects at 3 AM" is a detail nobody asked for).
- Images: CC0 or public domain for ads. Credit CC BY music in the post description and small on screen.
- Demo people are fictional; rename admin accounts that show up in captures; spread demo dates realistically.

## Copy for media

- Every frame or slide names its topic in plain words. Look at any slide on its own: if you cannot tell what it is about, it is not ready.
- Start from something the viewer has lived through; give the technical name after the example.
- The headline states the finding or says what you are looking at. It never promises an answer it does not give.
- Spoken vocabulary; cut words nobody says out loud.
- A hook makes a concrete promise and announces the explanation ("here's how, step by step"). A bare problem is not a hook.
- Each line moves the story one step; state the conclusion once.
- Every scene has voice, and every feature shown is named in the voice.
- Show cause and effect: what you say on one side, what it does on the other.
- Show a form filling in one view instead of field by field.
- A list of integrations ends with "and many more"; a closed last item reads as the complete list.
- Closers have no generic slogan: a follow call to action, or a hook to the next piece of the series.
- A sales hero does not accuse; it acknowledges what the reader already does well.
- Posts from the brand's own account do not explain who the brand is. Follow the brand's caption format, at most five hashtags, and "link in bio" on Instagram.
- Post descriptions sell the piece; they are not a changelog.

## Formats

| Piece | Size | Notes |
|---|---|---|
| Social video, post, carousel | 1080×1350 (4:5) | the default for social: it takes the most of the feed |
| Reel / story | 1080×1920 | stories keep ~250 px top and 380–400 px bottom free; ads start titles at y≈270; long story reels center the content |
| Landscape video | 1920×1080 | site, YouTube, decks |
| OG link card | 1200×630 | rendered @2x; a real screenshot of the product beats a logo |
| Store screenshots | 1320×2868 (iOS 6.9"), 1080×1920 (Play) | plus the Play feature graphic 1024×500 |
| Facebook cover | 1640×624 | phones only show x 265–1375 |

- Product explainers run about 40 s with a full arc (hook → problem → feature → what you can do → close). 20 s is too short to explain anything; 80 s leaves questions.
- Minimum text on a 1080-wide piece: about 24 px.
- Feeds use frame 0 as the thumbnail: render with `--cover` at a frame where the hook has settled.

## Layout

- **Nothing touches anything.** Give every element its zone. In 4:5: title y≈200, content 400–1150, captions ≈1280.
- Dark scenes enter only after the previous one has fully left (about 0.4 s); light scenes cross over about 0.3 s so no frame is empty.
- The closer never enters while the product is still on screen: product out, a breath, then the logo.
- Big numbers need air: 25–45 px above, ~40 px below; the unit on the same line, to the right.
- No orphans: the item count is a multiple of the columns. One centered line beats wrapped pills (the last pill always strands).
- Multi-column feature rows keep titles on one line so the columns stay level.
- Fill the canvas: a gradient plus a few loose blocks reads empty. Add a row of icons, center the CTA, kill dead air.
- Veils and gradients run to the canvas edge; a visible seam reads as a bug.
- Nested rounded shapes: outer radius = inner radius + padding.
- Text over a busy background gets a local radial shade under it. Labels and stats live in a header bar, not floating over a simulation.
- Floating cards and labels stay inside the frame and inside their figure's margin: clamp them, never place them by eye.
- Headlines: three lines at most.
- Beside a device mockup put only the title and the steps; do not repeat what the screen shows. To kill empty space, lift the real card out of the screen and grow it beside the text.
- Product groups: scale by real-world height, tallest in the center, side items one step back.
- Ration the logo: carousels small on the first slide and large on the closer; videos a single watermark, off at the closer.

## Typography and color

- **No gradient text.** Highlight a word in a solid brand color. (If a gradient is ever required, one gradient per line, measured after fonts load, with right padding: Chrome drops the last glyph.)
- One accent hue family. Never two competing accents, never two brand colors blended into one gradient. Ordinal states are a ramp of one hue.
- The highlight color must separate from the base text, and the emphasis face must weigh more than the text around it.
- Take the brand color from the logo, not from scraped CSS; on dark, use a brighter tint of the same hue. Use the real primary on fills, with white text and icons.
- Footers and fine print stay readable: 40% grey on black does not exist.
- Light by default for documents, carousels and product pieces; dark only where the brand is dark.
- Soft brand interfaces avoid hard dark fills: selection is a pastel tint plus a colored border.
- Data visuals: flat surfaces, one thin border, no glow or gradient on cards, large numbers in a light weight, color by function. Display type and gradients belong to covers.
- No emojis in graphics; use icons. Money with a currency symbol and K/M suffix. Real separators (" · "), never runs of spaces.
- When an accent changes, update every derived token too.

## Icons and imagery

- **Never draw icon paths by hand.** Use the real glyph: Lucide for interface icons, Simple Icons for brand logos (fill, not stroke). Leave a comment with the source.
- Real partner and service logos from their assets, never approximations.
- Icon chips: a stroke icon on a white chip, or a white icon on a brand chip.
- The full logo lockup, in the variant made for that background, never cropped, never on a background of its own color.
- A real miniature QR where a QR goes, never a black square.
- Photos at original resolution, never cropped out of a small screenshot. Anything featured must have a photo.
- "Handmade" looks (kraft, marker, tape) read amateur. So do polygonal SVG landscapes and mirror-floor reflections: use a studio backdrop, one soft key light, contact shadows.
- No decorative line ornaments (rings, arcs, mountain outlines) in backgrounds: soft glows and fine grain.
- Faceless pictogram people: circle head, capsule body, no hair; protagonists in brand colors, background people muted.

## Carousels

- One story across the slides. Continuity from an image or shape bleeding across the cut, or a progress bar; never a sentence split across slides.
- The cover gives a reason to stay: a full-bleed real photo and one big gesture, or a real case. Title on a gradient is not enough.
- 15–20 words per slide, one strong visual anchor. Split-screen contrasts work.
- A fixed grid on every slide: label and counter (02/06), title, content filling the height, footer. "Swipe" only on the cover.
- Each slide ends with the question the next one answers. Each carousel has its own color journey.
- A phone that crosses a cut is split evenly. Slides whose figure builds over time go out as video.

## Ads

- Show the contact itself (the WhatsApp number, large), not "message us".
- The CTA is a solid bar in the channel's color with centered content.
- Two or three visual chassis per batch so it does not look repetitive. Deliver the ad texts (primary text, title, description) with the images.
- Patterns that read as AI-made: an uppercase label above every headline, arrows in buttons, dark plus one accent by default, kits of cards, a highlighted word in another color everywhere. Use each on purpose or not at all.

## Verification

- **Measure, don't eyeball.** `ambar check` finds text off the frame, clipped, overlapping, too small, labels crossed or covered inside diagrams, and non-determinism. Then read the contact sheet.
- Before the final render of a video, sample frames every 0.4–0.6 s; text on screen for less than 1.5 s, cut for longer than a transition, or covering a device's own text is a bug.
- Measure motion: camera direction reversals, frame-to-frame continuity of shapes, rings placed from pixel boxes.
- Read the full rendered text of any piece built from a cloned template: it carries the previous client's names and numbers.
- Pieces that imitate an app: check them at 320, 360, 390 and 430 px wide and in light and dark themes.
- Headless pitfalls: a background tab can freeze `requestAnimationFrame`, observers and timers, so never judge animation there; compose only after `document.fonts.ready`; assert that every asset loaded (a broken relative path looks like a design choice); a syntax error leaves the page without `render`.
