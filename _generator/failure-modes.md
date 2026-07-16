# Plunge Website — Failure-Mode Catalog & Failsafe Plan

Compiled 2026-07-14 by scanning every page type, `js/script.js`, the
generator pipeline, and all external dependencies. Private working doc
(lives in `_generator/`, never published).

**How to read this:** each item lists what breaks → why → what happens
today → the recommended failsafe. Severity = how badly it hurts a customer
trying to reach us, not how likely it is.

Legend: 🔴 critical (bookings/calls lost) · 🟠 major (feature dead, workaround
exists) · 🟡 minor (cosmetic/recoverable) · ✅ already failsafed

---

## A. The booking form

### ✅ A1. JavaScript fails → form unusable — FIXED 2026-07-14 (watchdog)
- **The risk:** a syntax error in `script.js` (one parse error kills the
  whole file), an ad-blocker/proxy blocking it, or a broken cached copy —
  Step 2 (name/address/submit) is JS-revealed, so the form dead-ended
  silently after Step 1.
- **What's built (three layers, all verified in-browser):**
  1. **Ready beacon:** the LAST line of script.js sets
     `window.__plungeBookingReady = true` — it only runs if the entire
     file parsed.
  2. **Inline watchdog** in index.html (self-contained, dies with nothing):
     ~2s after page load, if the beacon is missing it hides the form and
     reveals a styled call-us box (`#booking-js-fallback`, phone number
     front and center).
  3. **`<noscript>`** twin: JS-off browsers see the same call-us box
     instead of the form. Plus `novalidate` moved out of the HTML into JS,
     so native validation stays armed for any no-JS submission.
- **Design note — why not the originally-queued "invert the reveal":**
  a visible form without script.js still dead-ends at SUBMIT (no handler
  + no backend for a native POST; a plain submit would just reload the
  page and lose everything). Swapping the form for an explicit phone
  number is strictly better than a fillable form that can't submit.
- **Verified:** healthy page → beacon set, fallback hidden, form normal;
  broken-script page → fallback visible with phone number, form hidden.
- **Keep:** `node --check docs/js/script.js` after every JS edit remains
  standing procedure — the watchdog is the net, not a license to skip it.

### ✅ A2. Booking backend missing or erroring (the current state!)
- The form POSTs to `/api/book-servicetitan`, which doesn't exist until
  the ServiceTitan Netlify Function is built. The submit handler catches
  every failure and shows: "There was a problem… Please call us directly
  at (480) 878-0808," then re-enables the button. Verified in code.
  This is the designed launch posture — safe.

### ✅ A3. Backend HANGS instead of failing — FIXED 2026-07-14
- **The risk:** a slow ServiceTitan API or hung Netlify Function leaves
  `fetch()` waiting; browsers can wait minutes on a spinner.
- **What's built:** AbortController aborts the request at 15 seconds and
  routes into the existing call-us error path with human wording ("the
  request took too long to answer") instead of browser jargon; the submit
  button re-enables for a retry.
- **Verified** against a deliberately hanging test backend: spinner during,
  friendly call-us error at ~15s, button re-enabled.

### 🟠 A4. "Success" that isn't (future risk)
- **Why:** the function returns 200 but the ServiceTitan booking didn't
  actually persist (API change, auth expiry mid-request, malformed
  payload). Customer believes they're booked; nobody comes.
- **Failsafe (build into the function, not the site):** the function must
  verify ServiceTitan's response before returning 200; send a
  confirmation email on success; log failures somewhere a human checks.
  ServiceTitan credential rotation/expiry lands here too — document the
  renewal owner when credentials exist.

### ✅ A5. Address autocomplete failures — triple-guarded (verified live)
- Google script blocked/never loads → silent 10s poll gives up; plain field.
- Any error during attach/fill → caught; whatever the customer typed stays.
- Google's auth-failure behavior (it DISABLES the input and rewrites the
  placeholder) → gm_authFailure + a MutationObserver instantly restore the
  field. Tested under a real RefererNotAllowedMapError.
- Watch item: the key's referrer allowlist must include each new domain
  (hireplunge.com at launch) or autocomplete simply stays off — form
  unaffected.

### ✅ A6. Custom date picker
- Progressive by design: the native `<input type="date">` is never
  removed; mobile uses native UI. Custom calendar failing = native input.

### 🟡 A7. Mid-form abandonment
- No persistence (deliberate; no localStorage). A refresh loses typed
  data. Acceptable; note only.

---

## B. Third-party dependencies

### ✅ B1. Font Awesome CDN dependency — REMOVED 2026-07-14 (self-hosted)
- Font Awesome 6.5.0 Free (CSS + webfonts) now lives at
  `docs/vendor/fontawesome/` and every page (hand-built + all templates)
  links the local copy — zero external icon dependency. Verified: fonts
  load from our own origin, zero cdnjs references remain in docs/.
- Note: FA Free's license permits self-hosting; the license header stays
  in all.min.css. To upgrade FA someday, replace the files in vendor/.

### ✅ B2. Google reviews widget
- Feature-detects Google; on any failure shows curated placeholder
  reviews with a link to Google. Verified fallback in `loadGoogleReviews`.
- Watch item: the underlying `PlacesService` API is legacy; if Google
  sunsets it, reviews quietly fall back to placeholders (safe), but
  refresh the integration then.

### 🟡 B3. Google Maps key: billing lapse / quota / deletion
- Autocomplete → guarded (A5). Reviews → placeholder fallback (B2).
  Nothing else uses the key today. Net effect of total key failure:
  cosmetic. Document WHO owns the Google Cloud account + billing alerts.

### 🟡 B4. YouTube embeds
- Currently zero live embeds (all "Video coming soon" placeholders).
  Future embeds are lazy-loaded youtube-nocookie iframes: outage = empty
  box, no page slowdown. Acceptable.

---

## C. Site JavaScript beyond the form

### 🔴 C1. `script.js` is a single point of failure on every page
- One parse error at the top disables: nav drawer (all ~990 pages' menu
  button), booking form (A1), homepage carousel, reviews, date picker,
  autocomplete, placeholder-vanish. The IIFEs isolate *runtime* errors
  fine, but not *parse* errors.
- **Failsafes:** the A1 fixes remove the catastrophic case (booking);
  keep the `node --check` habit; longer-term, consider splitting
  "critical" (nav + booking) from "cosmetic" (carousel, reviews) into two
  files so one bad edit can't take down both.

### ✅ C2. Homepage gallery is 100% JS-injected — FIXED 2026-07-14
- The FIRST slide is now baked into index.html as static HTML (a copy of
  BEFORE_AFTER_PROJECTS[0]); initCarousel() replaces it with the full
  rotating set on a healthy load. The prev/next arrows ship `hidden` and
  are revealed by JS, so the JS-dead state is one clean slide, not a
  slide with dead buttons. Cross-reference comments sit at BOTH copies —
  changing project #1 in script.js means updating the static twin.
- Verified: healthy load = 6 slides + arrows + auto-advance; JS-dead =
  static Before/After pair visible, arrows hidden.
- **Bug caught by the owner (2026-07-14) after the first pass:** the
  `hidden` attribute alone did NOT hide the arrows — `.ba-arrow`'s own
  `display: flex` overrides the browser's built-in [hidden] handling. Fixed
  with an explicit `.ba-arrow[hidden] { display: none; }` rule. LESSON for
  future failsafes: verify the COMPUTED style / visual result, not just the
  DOM property.
- Still open (minor): the PIPPIN page gallery is also JS-injected with no
  static fallback — cosmetic page, low priority.

### ✅ C2b. Reviews "Loading reviews…" forever if JS dies — FIXED 2026-07-14
- The static state is now USEFUL: the rating line and the reviews grid both
  ship with a real "See/Read our reviews on Google" link (opens the Google
  Business listing), which JS overwrites with live cards on a healthy load.
  No eternal spinners. Verified in the JS-dead simulation.

### ✅ C3. Footer year
- Tiny inline script per page, independent of script.js. Fails → shows
  nothing next to ©. Trivial.

---

## D. Generator & content pipeline

### ✅ D1. Bad JSON (services/cities/blog-posts/categories) stops the build
- `generate.py` crashes loudly BEFORE writing anything wrong; the live
  site keeps its last good state. This is the correct failure direction.

### ✅ D2. Hand-edits inside `docs/` get overwritten
- Every generated file carries a DO-NOT-EDIT header; README documents the
  rule. `docs/blog/` is additionally cleared each build (stale pages
  impossible) — which also means never hand-place a file there.

### ✅ D3. Removing a CITY leaves orphan pages live — FIXED 2026-07-14
- `cities.json` removal does NOT delete `docs/services/<city>/` or
  `docs/cities/<city>.html` (renamed/removed SERVICES are cleaned; cities
  aren't). Now `check_orphan_cities()` runs on every build and prints a
  WARNING naming exactly what to delete. Verified with a staged fake city
  (hub page + services folder both flagged).

### ✅ D4. Copy rules are policy, not code — FIXED 2026-07-14
- `check_copy_rules()` now lints ALL authored copy on every build: concrete
  time promises, recurrence imagery, "slow" (with a "slow drain" exemption),
  crime-word + place in one sentence, and {city} placement (exactly one, in
  a paragraph, never the lead). Blog content gets the recurrence + crime
  checks only (how-to durations and "slow drain" advice are legitimate
  there). Warnings, not build failures — READ the build output.
- Proved on day one: it caught real recurrence imagery in the old
  placeholder toilet post ("keeps coming back"), which was rephrased.
  Also verified with a staged "same-day service within 2 hours" violation.

### ✅ D5. Blog mock posts at launch
- 15 posts flagged `"mock": true`. Triple-documented: README pre-launch
  checklist item 8, blog-section warning, and project memory.

---

## E. Hosting, deployment, and caching

### 🟠 E1. Stale-cache mixed deploys (has already bitten twice)
- After every push, browsers can hold old CSS/JS against new HTML —
  layouts look broken or features missing until a hard refresh. Today the
  owner knows Cmd+Shift+R; customers' browsers eventually expire caches,
  but "eventually" can be days for repeat visitors.
- **Failsafe:** have the generator stamp `?v=<build-number>` on the
  css/js links it writes (declined earlier as unnecessary — revisit at
  Netlify launch, where real customers will hit it; cheap to add).

### ✅ E2. Publish-folder privacy (Finding 2)
- `netlify.toml` pins `publish = "docs"`; private files live outside
  `docs/`. Enforced by config, not memory.

### 🟡 E3. Platform-level outages
- GitHub Pages (test) or Netlify (prod) outage = site down until they
  recover; nothing to build, just know it's them not you. At launch:
  domain registration renewal + DNS records + auto-HTTPS are the three
  things to document (owner, registrar, renewal date).

### ✅ E4. Local working-copy hazards
- iCloud duplicate storm: solved (repo moved to ~/Projects; .gitignore
  backstop). GitHub Desktop losing the repo path: happened once,
  documented in memory with the fix.

---

## F. Content & operational

### 🟠 F1. privacy.html / terms.html 404 from every page footer
- Known, deliberately pinned. Must resolve before launch (create pages or
  drop links) — already on the pre-launch checklist.

### ✅ F2. yourwebsite.com placeholders, sitemap, Search Console
- All tracked on the README pre-launch checklist.

### 🟡 F3. Phone number is hardcoded in many places
- If the business number ever changes: CONFIG in script.js, every
  template header/footer/CTA, index.html, pippin.html, schema blocks.
  Generator regenerates most, but index/pippin are hand-edited and easy
  to miss. **Document the full list; grep `4808780808` when it happens.**

### 🟡 F4. Logo/image files
- Header/footer logos carry onerror handlers (hide gracefully). Gallery
  photos: a missing file = broken image tile; low risk while photos are
  placeholders.

---

## Build order & status

1. ✅ **A1 — booking watchdog + noscript + JS-owned novalidate** (DONE
   2026-07-14; superseded the original "invert Step 2" idea — see A1)
2. ✅ **A3 — 15s fetch timeout** (DONE 2026-07-14)
3. ✅ **D4 — copy-rule checks in the generator** (DONE 2026-07-14; caught
   a real violation in existing blog copy on its first run)
4. ✅ **D3 — orphan-city warning** (DONE 2026-07-14)
5. ✅ **C2 — static first gallery slide + hidden-until-JS arrows** (DONE
   2026-07-14) · ✅ **C2b — reviews static fallback links** (DONE 2026-07-14)
6. ✅ **B1 — Font Awesome self-hosted, CDN dependency removed** (DONE
   2026-07-14)
7. **E1 — build-stamped asset versions** (do at Netlify launch)
8. **A4 — belongs to the ServiceTitan function work when credentials arrive**
