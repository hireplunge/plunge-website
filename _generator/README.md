# Service Landing Page Generator

This folder builds the per-city, per-service SEO landing pages that live in
`docs/services/<city>/<service>.html` (e.g.
`docs/services/mesa/drain-cleaning.html`).

## 🔒 Publish-folder structure (restructure DONE, July 2026)

**The rule: `docs/` is the public website — the ONLY folder that gets
published. Everything outside `docs/` (this folder, `.claude/`, planning
files) is private and must stay outside.** Anything placed inside `docs/`
becomes publicly downloadable on the live site.

How it's enforced per host:

- **Netlify (production, when connected):** `netlify.toml` at the repo root
  sets `publish = "docs"` — Netlify reads it automatically, so this cannot
  be forgotten or mis-clicked on Netlify day.
- **GitHub Pages (test environment):** repo Settings > Pages > serve from
  the **/docs** folder. ⚠️ ONE-TIME MANUAL STEP the owner must do on
  github.com after uploading the restructured folder — until then the test
  site shows the old structure. When uploading, also DELETE the old
  top-level site files/folders from the repo (index.html, pippin.html,
  cities/, services/, css/, js/, images/, favicon.ico, site.webmanifest)
  so only `docs/`, `_generator/`, `netlify.toml` etc. remain.

Background ("Website Folder Review" report, Finding 2, July 2026): GitHub
Pages' Jekyll build auto-excludes `_underscore` folders, but Netlify has no
such rule — deployed unrestructured, the templates, generator script,
`cities.json`/`services.json` internal notes, and `.claude/` would all have
been publicly downloadable at hireplunge.com. The restructure closed that.

Also: the GitHub repository IS public (confirmed by owner, July 2026), so
this folder is browsable by anyone on github.com today regardless.
DECIDED: flip the repo to private at Netlify cutover (Netlify's free tier
deploys from private repos; the github.io test URL stops working at that
point — Netlify deploy previews take over the testing role).

## How it works

| File            | What it is                                                        |
|-----------------|-------------------------------------------------------------------|
| `services.json` | One entry per service: name, page copy, FAQs, related services    |
| `cities.json`   | One entry per city: name + city-specific local paragraphs         |
| `template.html` | The master page layout every landing page is stamped from         |
| `generate.py`   | The script that combines the three files above into finished pages|

## To regenerate all pages

```
python3 _generator/generate.py
```

Run from the project root. It rebuilds every page in `docs/services/`
from scratch. **Never edit the files in `docs/services/` by hand** — your changes
will be overwritten on the next run. Edit the JSON/template here instead,
then re-run.

## To add a city

City pages are now GENERATED too (from `city-template.html`), so adding a
city is just data + one command:

1. Add an entry to `cities.json` — copy an existing entry as a starting
   point. Give it `slug`, `name`, `state`, `cityPage` (`<slug>.html`),
   `noteTitle`, and `notePs`.
2. Write a REAL, distinct local note (`notePs`) for the city — this is the
   main thing keeping the pages from reading as cookie-cutter clones, which
   Google demotes. Ground it in true facts: which part of the Valley it's
   in, its relationship to our Mesa base, general housing-stock era, the
   shared hard water. Follow the copy rules (see project memory
   copy-claims-rules): NO specific neighborhood/street/landmark names, NO
   response-time/speed promises; regional terms (East Valley, the Valley,
   Arizona) are fine.
3. Run `python3 _generator/generate.py`. It writes both the city hub page
   (`docs/cities/<slug>.html`, with a checklist auto-linked to that city's
   service pages) AND all its service landing pages. No hand-editing of
   checklists — the hub checklist is derived from `services.json`.

Note: the older hand-built city drafts in `docs/cities/` that AREN'T in
`cities.json` yet (e.g. apache-junction, glendale, etc.) still show the old
plain 36-item checklist; adding them to `cities.json` + regenerating brings
them up to match. `docs/cities/city-template.html` (the old hand template)
was deleted — this generator template replaces it.

## To add / rename a service

1. Edit `services.json` (slug, name, copy, FAQs, related list).
2. Run the generator. If you renamed a slug, delete the old .html files
   from each `docs/services/<city>/` folder and update the city-page checklist
   links.

## Videos (YouTube)

Each city hub page has a video slot. Out of the box it shows a "Video coming
soon" placeholder; drop in a YouTube ID and it becomes a real embedded video
in the **exact same spot and size** — no layout shift, nothing else changes.

To add a video to a city:

1. Grab the video's ID — the 11 characters after `v=` in a YouTube URL
   (`https://www.youtube.com/watch?v=`**`dQw4w9WgXcQ`**), or the last part of
   a `youtu.be/` link.
2. In `cities.json`, paste it into that city's `youtubeId` field:
   `"youtubeId": "dQw4w9WgXcQ"`. (Every city has this field, empty by
   default.)
3. Run `python3 _generator/generate.py`. Done.

To remove a video, set `youtubeId` back to `""` and regenerate — it returns
to the placeholder.

Notes: the embed is privacy-friendly (`youtube-nocookie.com` — no tracking
cookies until a visitor actually plays it) and lazy-loaded (it only loads if
someone scrolls to it, so it doesn't slow the page). The reusable
`.video-embed` CSS lives in `docs/css/city.css`, so this same pattern can be
dropped onto any other page in the future if a video slot is added elsewhere.

## Netlify launch plan (decided July 2026)

Decisions locked during the July 2026 Cowork planning round (reports in
the owner's Downloads: "Website Hosting Options," "Your Hosting Questions,
Answered," "Website Folder Review," "Choosing Your Blog Platform"):

- **Production host: Netlify**, serving hireplunge.com from the domain
  root. GitHub stays as the repository / backup / test environment ONLY —
  GitHub Pages' terms don't allow hosting a commercial business site, and
  it can't run the booking backend anyway.
- **Booking: keep our custom form** (not ServiceTitan's hosted widget).
  Backend = a Netlify Function at `/api/book-servicetitan` (the address
  the form already posts to), with ServiceTitan credentials stored as
  Netlify environment variables. Blocked on obtaining ServiceTitan API
  credentials; until built, the form fails gracefully to the call-us
  message, which is safe to launch with.

### Pre-launch checklist, in order

1. ✅ **Publish-folder restructure — DONE (July 2026).** Site lives in
   `docs/`; `netlify.toml` enforces the publish dir on Netlify. Remaining
   sub-step for the owner: on github.com, set Pages > serve from /docs and
   delete the old top-level site files when uploading (see the structure
   section at the top of this file).
2. Booking interim — DECIDED (July 2026): no stopgap. The form keeps its
   graceful "please call us" failure until the ServiceTitan Netlify
   Function is built with real credentials. (Netlify Forms lead-capture
   was offered and declined.)
3. Replace every `yourwebsite.com` placeholder (canonicals + schema in
   `template.html`, city pages, index.html) with `https://hireplunge.com`
   and regenerate.
4. Generate `sitemap.xml` covering city + service (+ blog) pages; submit
   in Google Search Console once the domain is connected.
5. Deploy to Netlify, connect hireplunge.com, enforce HTTPS, add a
   `_headers` security-headers file (per the hosting report).
6. Verify the Google Maps API key is completely locked down in Google
   Cloud console (referrer allowlist = our real domains only; API
   restrictions = Maps JavaScript + Places only). Detailed comment sits
   above the Maps `<script>` tag in `index.html`.
7. Build the blog (below) when ready — it slots into this generator
   without structural changes.

## Blog (file-based at /blog) — STARTED July 2026

Supersedes both the earlier "external platform" placeholder links AND the
Substack idea. Per "Choosing Your Blog Platform" (July 2026): Substack and
Medium cannot live at hireplunge.com/blog, so posts there would build
*their* domain authority, not ours — disqualifying for an SEO-first blog.

**Built so far (design draft):** the blog index (`docs/blog/index.html`) and
one page per post (`docs/blog/<slug>.html`), generated from
`blog-posts.json` + `blog-index-template.html` + `blog-post-template.html`,
styled by `docs/css/blog.css`. Currently seeded with 5 PLACEHOLDER posts and
a placeholder intro paragraph (for design review). Posts show newest-first.

### To add or edit a blog post

1. Edit `_generator/blog-posts.json`. Each post is:
   `{ "slug", "title", "date" (YYYY-MM-DD), "author", "excerpt", "body": [paragraphs] }`.
2. Run `python3 _generator/generate.py`. The index re-sorts newest-first
   automatically and a page is (re)built for each post.
   (Note: `build_blog()` does NOT rmtree docs/blog/, so if you RENAME or
   DELETE a post's slug, remove the stale `docs/blog/<old-slug>.html` by hand.)

### Still TODO on the blog (not built yet)

- ✅ **Links wired (July 2026):** nav "Blog" + footer "Read Our Blog" now point
  at the internal `/blog/` index — `blog/` from root pages, `../blog/` one
  level deep, `../../blog/` from service pages — with `target="_blank"` dropped.
  (The old external placeholder link is fully gone from every page.)
- **Scheduling** (future dates + build skip + Netlify build-hook trigger),
  **sitemap.xml**, and **RSS** — all still to add (see below).

### Original plan notes (still the direction)

- Each post = a small text file (title, date, meta description, body) in
  the repo; a post template turns it into a static page at
  `/blog/<post-slug>.html`, plus a blog index at `/blog/`, sitemap
  entries, and an RSS feed.
- **Scheduling**: posts carry future publish dates; the build skips
  not-yet-due posts. A scheduled trigger pings a Netlify build hook so
  each post appears automatically when its date arrives — drip-releasing
  a batch (better for SEO than dumping it all at once). $0, no new
  accounts, no logins on the site.
- **Workflow**: staff draft in Word/Google Docs → every batch, hand the
  drafts to a Claude session ("publish these weekly starting Monday") →
  Claude formats pages with full SEO trimmings, sets dates, pushes once.
- The nav "Blog" + footer "Read Our Blog" links point at the internal
  `/blog/` index (done July 2026).
- Later, optional: import the best indexed posts into a free Medium
  publication for extra reach (Medium's import tool sets the canonical
  back to our original — no SEO cost). Substack's only future role would
  be emailing excerpts that LINK to hireplunge.com/blog, never full posts.

## Parked features — revisit when the owner is ready

Both were intentionally removed from the service pages earlier; the owner
wants them back later, done deliberately (not as an afterthought):

1. **Collapsed FAQ** — a slim FAQ per service, 2–3 Q&A each, as
   `<details>` accordions (one visible line until tapped, so the page stays
   short). Purpose: gets quoted by AI search (Gemini/AI Overviews) and can
   earn Google FAQ rich results. Would live in `template.html` + a `faqs`
   field in `services.json`, plus FAQPage schema. Must obey the copy rules
   (no specific time/response-speed promises — see project memory).
2. **Trimmed trust-signals block** — a compact strip near the top, especially
   the ROC license # (332623515), "Licensed & Insured", 24/7 availability.
   A fuller version existed before and was cut for length; bring back a
   slimmer one.
