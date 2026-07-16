# Plunge Design Guide — the rules for every page, old and new

Compiled 2026-07-14 by auditing every page type and stylesheet. Private
working doc. **Purpose: any new page — a city, a service, a podcast page,
anything off the wall — gets built from these patterns and needs ZERO
formatting refinement for the basics.**

Quick start: **copy `_generator/page-skeleton.html`**, follow its checklist
comment, and pull components from §4 below. Done.

---

## 1. Design tokens — never hardcode these values

Everything lives as CSS variables in `docs/css/styles.css` `:root`. USE THE
VARIABLES; if a value isn't a variable, you're probably doing it wrong.

| Token | Value | Use |
|---|---|---|
| `--bg-dark` | #3a3a3a | THE page background. Every section sits on it. |
| `--blue` | rgb(58,100,158) | Header/footer/nav chrome (the "30%") |
| `--blue-dark` | rgb(38,72,120) | Card + frame backgrounds |
| `--orange` | rgb(235,149,74) | THE accent (the "10%"): CTAs, links, highlights, card accents |
| `--orange-dark` | rgb(210,122,45) | Orange hover states |
| `--white` | #ffffff | Headings, key text |
| `--font-heading` / `--font-body` | 'Courier New', monospace | EVERYTHING. The typewriter look IS the brand. |
| `--space-xs/sm/md/lg/xl` | .4 / .875 / 1.5 / 2.5 / 4.5 rem | All margins/paddings/gaps |
| `--radius / -lg / -xl` | 6 / 14 / 20 px | Corner rounding (cards + photos use `-lg`) |
| `--shadow-sm / -md` | soft / softer-bigger | Card resting / hover |
| `--ease` | all .25s ease | The one transition |

Text on dark follows a dimming hierarchy: headings `var(--white)` → body
`rgba(255,255,255,.88)` → secondary `.82` → captions/hints `.55–.65` →
placeholder text `.45–.6`.

## 2. Anatomy of every page (the chrome)

Every page, no exceptions, is this sandwich — all of it already in
`page-skeleton.html`:

```
<head>: meta/viewport · description · title ("Page | Plunge, A Plumbing Co. LLC")
        favicons + site.webmanifest + theme-color #264878
        canonical (yourwebsite.com placeholder + TODO comment, until launch)
        stylesheets IN ORDER: vendor/fontawesome/css/all.min.css (SELF-HOSTED,
        never a CDN) → css/styles.css → css/city.css → css/blog.css.
        HAND-BUILT pages load ALL FOUR, always — the hero, card, checklist,
        and photo-frame components are spread across them, and loading all
        four is what guarantees "zero design refinement" on a new page.
<body>: #nav-overlay → <header class="site-header"> → <nav id="city-nav"> drawer
        → your content sections → <footer class="site-footer">
        → <script src="js/script.js"> → the footer-year inline script
```

**Relative-path depth table** — the #1 new-page mistake. Prefix every
internal href/src/link by folder depth:

| Page lives in | Prefix | Example |
|---|---|---|
| `docs/` | *(none)* | `css/styles.css`, `cities/mesa.html` |
| `docs/cities/`, `docs/blog/` | `../` | `../css/styles.css` |
| `docs/services/<city>/` | `../../` | `../../css/styles.css` |

(The site checkup verifies every link on every build, so a wrong prefix
gets caught — but get it right the first time from this table.)

## 3. Section scaffolding

- Wrap each band of content: `<section class="something-section">` with
  `background: var(--bg-dark)` and `padding: var(--space-xl) 0` (first
  section after the header often uses `var(--space-xl) 0 var(--space-lg)`).
  Inside it, ONE `<div class="container">` (90% width, max 1180px, centered).
- Centered section heading: `<h2 class="section-title">` +
  `<p class="section-subtitle">`. Left-aligned variant: `section-title--left`.
- Page h1 (hero style): font-heading, 800 weight,
  `clamp(2.2rem, 6vw, 3.8rem)`, tight line-height (see `.blog-hero-title`).
- Breadcrumb (every non-home page):
  `<nav class="city-breadcrumb" aria-label="Breadcrumb">` —
  `<a>Home</a> <span>/</span> … <span aria-current="page">Here</span>`.
- Two-column hero (text + media): `.blog-hero-grid` pattern — grid
  `1.1fr 1fr`, gap `--space-lg`, media right, collapses to one column at
  820px. Use it for any text-beside-media header (that's how the blog hero
  and city heroes work).

## 4. Component library (copy these, don't invent)

### Cards — the site's signature container
`.blog-card` is the canonical recipe (Get In Touch + the booking fallback
box use the same language):
- `background: var(--blue-dark)` · `border-radius: var(--radius-lg)`
- **accent = `border-top: 4px solid var(--orange)` + `border-left: 4px
  solid var(--orange)`** (top+left only — never a 4-sided border)
- `box-shadow: var(--shadow-sm)`; hover: `translateY(-3px)` + `--shadow-md`
- Whole-card link: one `<a class="...-link">` filling the card,
  `padding: var(--space-md)`; title turns orange on card hover.

### Buttons
- `.btn .btn-call` / `.btn .btn-book` — solid orange, white text, FA icon +
  label (`<i class="fa fa-phone" aria-hidden="true"></i> Call Now`), hover
  `--orange-dark`. Group them in `<div class="hero-cta-group">`.
- Buttons always carry TEXT, never icon-only (survives icon-font failure).

### The orange arrow link (used everywhere)
`inline-flex; align-items:center; gap:.4rem; font-heading 700; .9–.95rem;
color: var(--orange)` with `<i class="fa fa-arrow-right">` at `.8rem` that
nudges `translateX(3px)` on hover; link text turns white on hover.
Existing classes to reuse: `.blog-card-more`, `.blog-archive-viewall`,
`.about-gallery-link`, and `.blog-back` (the ← back variant).

### Checklist lists (services list / blog archive)
3-column grid (`gap: 0.15rem 1.5rem`), each `<li>`: flex, `gap:.6rem`,
`padding:.55rem 0`, separator `border-bottom: 1px solid
rgba(255,255,255,.1)`, links inherit color + hover orange. Leading glyph:
`✓` via `::before` (services) or an inline SVG icon (blog's book-and-pen).
Collapses 3→1 (services) or 3→2→1 at 900/640 (blog full lists).

### Chips
`.related-chip` (service pages): small rounded label-links for related items.

### Notice / fallback box
`.booking-js-fallback` recipe: blue-dark card, top+left orange accent,
`--radius-lg`, centered text `1.05rem/1.7`, orange FA icon before a bold
first line, big orange link. Tone: "We're still here to help." Use this for
any "something's unavailable" message.

## 5. Media frames (the placeholder→real framework)

**Golden rule: placeholder and real content occupy the EXACT same box, so
turning content on causes no layout shift.**

- **Video slot**: `.video-placeholder` → `.video-embed` — 16:9,
  `max-width:720px`, blue-dark, dashed 2px `rgba(255,255,255,.3)` border on
  the placeholder, `--radius-lg`, play icon + "Video coming soon".
  Real embed = youtube-**nocookie**.com iframe, `loading="lazy"`.
  (Generated pages: set `youtubeId` in cities.json / `BLOG_YOUTUBE_ID`.)
- **Photo frame** (blog): `.blog-photo-frame` — 4:3, same dashed style,
  image icon + "Picture coming soon"; real `<img>` fills the identical box
  (`object-fit: cover`). Caption: `.78rem` italic `rgba(255,255,255,.55)`.
- **Magazine float figures** (blog posts): `.blog-figure--right/--left` —
  46% width / max 420px, `clear: both`, alternate sides down the text,
  full-width stacked on mobile (760px).
- **Plain photo** (About team photo): `border-radius: var(--radius-lg)`
  ONLY — **no border, no shadow** (owner's call). Caption below: centered,
  font-heading 700, `.9rem`, `rgba(255,255,255,.65)`.
- **Gallery/carousel**: `.ba-*` family (viewport/track/slide/pair/photo,
  controls row, dots). **CAROUSEL PHOTOS ARE THE EXCEPTION to the framing
  rules (owner decision, July 2026): FRAMELESS** — no matting, no
  background box; the photo displays whole at its own native aspect ratio
  with only corner rounding + the soft shadow. This applies ONLY to the
  moving galleries; every other photo on the site keeps its standard
  frame treatment above. Empty carousel slots DO keep the dashed
  placeholder box (nothing else gives them shape). Photos get a
  `.ba-badge` label. Arrows live in the `.ba-controls` row BELOW the
  photos (never overlaying them), flanking the caption + dots. REMEMBER:
  the homepage ships a STATIC first slide (failsafe C2) — arrows ship
  `hidden`, JS reveals.
- **Images themselves**: resize before adding — max 1600px wide, JPEG
  quality ~82 (`sips -Z 1600 -s format jpeg -s formatOptions 82 in --out out`),
  saved under `docs/images/<area>/`. Always `loading="lazy"` (except
  above-the-fold), `decoding="async"`, and a full-sentence `alt`.
  **Phone photos that LOOK sideways in a raw viewer usually aren't** —
  they carry an EXIF rotation flag that browsers honor automatically.
  Do NOT manually rotate; resize only, and judge orientation in a BROWSER
  (learned the hard way, July 2026).

## 6. Iconography

- Font Awesome 6.5.0 Free, **SELF-HOSTED** at `docs/vendor/fontawesome/`
  — never link a CDN (catalog B1). Decorative icons get
  `aria-hidden="true"`; icon-only controls need an `aria-label`.
- Inline SVGs (paw print, book-and-pen) use `currentColor` so CSS colors
  them — copy the SVG markup from any template.
- Emoticons in copy are TEXT (`:(`), never emoji (owner preference).

## 7. Responsive rules

Mobile-collapse breakpoints in use — pick the one matching your pattern:
- **900px**: 3-col grids → 2 (or major grids collapse)
- **820px**: two-column heroes → stacked
- **760px**: floats un-float, go full width
- **700/640px**: 2-col grids → 1; small-phone tweaks at 400px
Test at 375px width (iPhone) — everything must stack cleanly, no
horizontal scroll. Touch targets ≥ ~44px on `pointer: coarse`.

## 8. Rules of the road (non-negotiables)

1. **Generated pages are never hand-edited** (docs/services/, docs/cities/
   except index, docs/blog/). Edit `_generator/` sources + re-run. A new
   REPEATED page type deserves a template + generator loop, not hand copies.
2. **One-off pages** (like pippin.html) are hand-built from
   `page-skeleton.html` and live in `docs/` root or a sensible folder.
3. **Copy rules apply to every word** (see memory `copy-claims-rules` +
   the build lint): no concrete time promises; no specific place names
   (regional OK); no crime+place in one sentence; no recurrence imagery or
   "slow"; brand name is always "Plunge, A Plumbing Co. LLC" (capital A).
4. **Progressive enhancement**: JS may ENHANCE a page but the page must
   work (or fail to a useful phone-number state) without it. Placeholder →
   real swaps must not shift layout.
5. **Every internal link is relative** (see the depth table) — never
   absolute paths, never the github.io or future domain hardcoded.
6. **After ANY change: run `python3 _generator/generate.py` and read the
   last line.** `SITE CHECKUP: PASSED ✓` or don't upload. If you edited
   script.js, `node --check docs/js/script.js` too.
7. New pages that should be findable get linked from the nav drawer,
   footer Quick Links, or a parent page — orphan pages help nobody.
8. `docs/` is public. Private notes stay in `_generator/`.

## 9. Voice quick-reference (for any new copy)

Service pages: Corner Coach (grit/thoroughness; boxing = one light touch
max) or Desert Sage Grandpa (warm desert wisdom) — split by family, see
memory `brand-voices`. Blog: plain helpful voice. Everything: patient,
first-time-right, neighborly. Keywords: pull unclaimed ones from
`_generator/seo-keywords.json`, topic-matched, 2–4 per page, never stuffed.
