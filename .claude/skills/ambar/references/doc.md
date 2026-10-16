# Documents

`ambar new <dir> --doc` gives `doc.html`. Every `<section class="page">` is an A4 page (210×297 mm) printed exactly as designed; `ambar doc doc.html` exports the PDF, `--png` adds an image per page.

## Shape

- Reports, one-pagers, proposals, certificates. Start with the conclusion; the reader of a report may only read page 1.
- Cover or header with title, date and author. Footer with the document name and `n / total`.
- Body 10–11 pt, headings 16 pt, tables 9–10 pt. Never under 9 px rendered.
- Pages do not flow on their own yet: you place content per page. When a section does not fit, move it to the next `.page` and update the footers. `ambar check` reports text cut off by the page.

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
