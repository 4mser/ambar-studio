# Brief

Rules for this project. AMBAR (and Claude, through the `ambar` skill) reads this file before writing anything and follows it over the defaults. Delete what does not apply.

## Piece

- **What:** store screenshots, 5 per store: App Store iPhone 6.9" (1320×2868, size `ios`) and Google Play phone (1080×1920, size `play`). Add `ios65` for 6.5".
- **App:** <name> · <staging URL to capture, never production>
- **Goal:** <the one reason to install it>
- **Audience:** <who, and what they already know>

## Language and voice

- **Language:** <English | neutral Spanish with "tú" | …> (one folder per locale: copy `items.json` to `items.es.json` and pass `--data`)
- **Tone:** <plain and direct | warm>

## Brand

- **Colors:** <AMBAR palette | your tokens>; the phone shows the app's real colours.
- **Fonts:** <Inter from runtime/fonts.css | a static font you have the right to use>

## Format rules (keep unless the user says otherwise)

- The first three screenshots carry the hook and the differentiator: most people never scroll past them.
- Two short lines of headline per screenshot.
- The phone screen is a real capture (`"screen": "screens/01.png"`, from `ambar capture`) or a rebuilt view of the app; never an invented screen.
- Floating cards are rebuilt components with fixed padding, never crops of a screenshot, and stay inside the safe margin.

## Words

- **Always say:** <product names as they must be written>
- **Never say:** <claims the store would reject: "best", "#1", prices that change>

## Privacy

- **Blur:** <names, emails, amounts tied to a person> in every capture.

## Files

- `items.json`: per screenshot `kicker`, `headline` (two lines), `screen` or `view`, and `card` (`icon`, `label`, `value`, `note`, `side`, `y`).
- `ambar stills store.html --sheet` → `out/store/ios/01-board.png …`, `out/store/play/…`.
