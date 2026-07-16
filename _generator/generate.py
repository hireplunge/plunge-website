#!/usr/bin/env python3
"""Builds the per-city, per-service landing pages in docs/services/<city>/.

Reads services.json + cities.json + template.html (all in this folder)
and writes one finished page per (city x service) pair.

services.json holds slug, name, lead, and paras (1-2 body paragraphs) per
service — real content grounded in the business's own service list
(originally sourced from a Google Sheet transfer of their GBP services), but
written to vary per city via the {city} token, so no two cities show
identical body text (bad for SEO — duplicate-content pages rank worse).
Meta tags and related-service links are still derived mechanically at build
time, not hand-authored, so adding a city or service never requires touching
this script.

Usage (from the project root or anywhere):
    python3 _generator/generate.py

See README.md in this folder for how to add cities/services.

PARKED / TODO (owner wants these back later — see README "Parked features"):
  - collapsed FAQ per service (2-3 Q&A, <details> accordions, + FAQPage schema)
  - trimmed trust-signals block (ROC license #, licensed/insured, 24/7)

BUILT-IN FAILSAFES (July 2026 audit — full catalog: _generator/failure-modes.md):
  - D4 (DONE 2026-07-14): check_copy_rules() lints all authored copy on
    every build — time promises, recurrence imagery, "slow", crime+place
    pairings, {city} placement. Warnings, not failures: READ THEM.
  - D3 (DONE 2026-07-14): check_orphan_cities() warns when docs/ contains
    city output that cities.json no longer backs (removing a city does not
    auto-delete its generated pages — the warning tells you what to delete).
"""

import html
import json
import pathlib
import re
import shutil
import sys
from datetime import datetime

BASE = pathlib.Path(__file__).resolve().parent
ROOT = BASE.parent

cities = json.loads((BASE / "cities.json").read_text(encoding="utf-8"))
services = json.loads((BASE / "services.json").read_text(encoding="utf-8"))
template = (BASE / "template.html").read_text(encoding="utf-8")
city_template = (BASE / "city-template.html").read_text(encoding="utf-8")
blog_posts = json.loads((BASE / "blog-posts.json").read_text(encoding="utf-8"))
blog_index_template = (BASE / "blog-index-template.html").read_text(encoding="utf-8")
blog_post_template = (BASE / "blog-post-template.html").read_text(encoding="utf-8")
blog_archive_template = (BASE / "blog-archive-template.html").read_text(encoding="utf-8")
blog_category_template = (BASE / "blog-category-template.html").read_text(encoding="utf-8")
blog_bydate_template = (BASE / "blog-bydate-template.html").read_text(encoding="utf-8")

# Blog categories are DERIVED FROM the services list — services.json leads,
# blog-categories.json follows (see the _notes inside that file for the full
# rule). check_blog_categories() below cross-checks the two on every build and
# prints loud warnings on any drift, so the category library can never fall
# out of sync with the city pages' services list silently.
blog_categories = json.loads(
    (BASE / "blog-categories.json").read_text(encoding="utf-8")
)["categories"]

# Fallback for posts whose "category" is missing or doesn't match the library.
# Not a real library entry — it only appears on the archive if actually used.
FALLBACK_CATEGORY = "General"

# The blog landing page shows exactly this many post cards (the newest ones);
# its 4th card is always the "View All Blog Posts" button. Every post — these
# included — is listed on the archive page (docs/blog/all-posts.html), which
# is rebuilt from blog-posts.json on every run. So no matter how many posts
# pile up over the years, the landing page stays 4 cards and nothing is ever
# hand-edited.
BLOG_INDEX_POST_COUNT = 3

# The open-book-and-pen icon used beside each post on the archive page — the
# same stroke SVG as the nav drawer's Blog link, so it inherits orange from
# currentColor via CSS.
BLOG_ICON_SVG = (
    '<svg class="blog-archive-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
    'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    '<path d="M12 8C10.3 6.7 7.3 6.3 5 6.9V17.4C7.3 16.8 10.3 17.2 12 18.5"/>'
    '<path d="M12 8C13.7 6.7 16.7 6.3 19 6.9V13"/>'
    '<path d="M12 8V18.5"/>'
    '<path d="M20.9 12.1L15.9 17.1L13.5 17.6L14 15.2L19 10.2C19.5 9.7 20.4 9.7 20.9 10.2C21.4 10.7 21.4 11.6 20.9 12.1Z"/>'
    '</svg>'
)

# The blog landing page's optional hero video. Same framework as the city
# videos: empty = "Video coming soon" placeholder; drop an 11-char YouTube ID
# here and re-run the generator to turn it into a real embed (no layout shift).
BLOG_YOUTUBE_ID = ""

PHONE_DISPLAY = "(480) 878-0808"

# Longest/most-specific suffixes first, so "X Detection & Repair" doesn't
# get mis-stripped down to "X Detection &".
FAMILY_SUFFIXES = [
    " Installation & Repair",
    " Detection & Repair",
    " Installation",
    " Replacement",
    " Repair",
    " Cleaning",
    " Detection",
    " Units",
]


def esc(text: str) -> str:
    """Escape plain text for safe embedding in HTML."""
    return html.escape(text, quote=False)


def fill(city: dict, text: str) -> str:
    """Replace the {city} token used inside copy strings."""
    return text.replace("{city}", city["name"])


def family_key(name: str) -> str:
    """Groups sibling services (e.g. 'Water Heater Installation' and
    'Water Heater Repair') so related-service links can be derived from
    the service list itself instead of hand-curated per entry."""
    for suffix in FAMILY_SUFFIXES:
        if name.endswith(suffix):
            return name[: -len(suffix)]
    return name


def build_related(svc: dict) -> list:
    """Same-family siblings first (e.g. other Water Heater services).
    Services with no siblings (singletons) fall back to a fixed rotation
    of other singletons, so no page is left with zero related links."""
    key = family_key(svc["name"])
    siblings = [s for s in services if s is not svc and family_key(s["name"]) == key]
    if siblings:
        return siblings[:4]

    singletons = [s for s in services if s is not svc and not any(
        s is not other and family_key(other["name"]) == family_key(s["name"])
        for other in services
    )]
    start = singletons.index(svc) if svc in singletons else 0
    rotated = singletons[start:] + singletons[:start]
    return [s for s in rotated if s is not svc][:4]


def build_page(city: dict, svc: dict) -> str:
    # Visible on-page heading drops the state for a cleaner look ("... in Mesa").
    h1 = f"{svc['name']} in {city['name']}"
    # The <title> tag and meta description KEEP the state — "Mesa, AZ" in the
    # browser tab and Google search snippet still helps local-search ranking,
    # which is the whole point of these pages. (Change seo_heading to h1 here
    # if you ever want the state gone from those too.)
    seo_heading = f"{svc['name']} in {city['name']}, {city['state']}"
    title = f"{seo_heading} | Plunge, A Plumbing Co. LLC"
    lead = fill(city, svc["lead"])
    meta = f"{seo_heading} — {lead} Call {PHONE_DISPLAY}."

    body_html = "\n".join(
        f"                <p>{esc(fill(city, p))}</p>" for p in svc["paras"]
    )

    note_html = "\n".join(
        f"                <p>{esc(p)}</p>" for p in city["notePs"]
    )

    related_html = "\n".join(
        f"                <a class=\"related-chip\" href=\"{rel['slug']}.html\">{esc(rel['name'])}</a>"
        for rel in build_related(svc)
    )

    svc_lower = svc["name"].lower()
    keywords = (
        f"{svc_lower} {city['name']}, {svc_lower} {city['name']} {city['state']}, "
        f"{city['name']} plumber, plumber {city['name']} {city['state']}"
    )

    service_schema = json.dumps(
        {
            "@context": "https://schema.org",
            "@type": "Service",
            "serviceType": svc["name"],
            "description": lead,
            "provider": {
                "@type": "Plumber",
                "name": "Plunge, A Plumbing Co. LLC",
                "telephone": "+14808780808",
                "email": "info@hireplunge.com",
                "address": {
                    "@type": "PostalAddress",
                    "streetAddress": "555 W 2nd Ave B7",
                    "addressLocality": "Mesa",
                    "addressRegion": "AZ",
                    "postalCode": "85210",
                    "addressCountry": "US",
                },
            },
            "areaServed": {
                "@type": "City",
                "name": city["name"],
                "addressRegion": city["state"],
            },
            "url": f"https://yourwebsite.com/services/{city['slug']}/{svc['slug']}.html",
        },
        indent=2,
    )

    tokens = {
        "__SERVICE_NAME__": esc(svc["name"]),
        "__SERVICE_SLUG__": svc["slug"],
        "__CITY_NAME__": esc(city["name"]),
        "__CITY_SLUG__": city["slug"],
        "__CITY_PAGE__": city["cityPage"],
        "__H1__": esc(h1),
        "__TITLE__": esc(title),
        "__META_DESCRIPTION__": esc(meta),
        "__KEYWORDS__": esc(keywords),
        "__LEAD__": esc(lead),
        "__BODY_HTML__": body_html,
        "__CITY_NOTE_TITLE__": esc(city["noteTitle"]),
        "__CITY_NOTE_HTML__": note_html,
        "__RELATED_HTML__": related_html,
        "__SERVICE_SCHEMA__": service_schema,
    }

    page = template
    for token, value in tokens.items():
        page = page.replace(token, value)

    # Sanity check: no unreplaced __TOKEN__ markers should remain
    stray = re.findall(r"__[A-Z_]+__", page)
    if stray:
        print(f"  WARNING: unreplaced tokens in {svc['slug']}: {set(stray)}")

    return page


def build_video(youtube_id: str, title: str) -> str:
    """Video framework: given a non-empty YouTube ID, render a responsive
    embed; otherwise render the unchanged "Video coming soon" placeholder.
    Both fill the same 16:9 box, so turning a video on is a pure content
    swap — no layout shift, no design change. Shared by the city hub pages
    (ID from cities.json) and the blog landing page (BLOG_YOUTUBE_ID).

    Privacy-friendly (youtube-nocookie, no tracking until played) and lazy —
    the video only loads if the visitor scrolls to it."""
    vid = (youtube_id or "").strip()
    if not vid:
        return (
            '<div class="video-placeholder">\n'
            '                    <i class="fa fa-play-circle" aria-hidden="true"></i>\n'
            '                    <span>Video coming soon</span>\n'
            '                </div>'
        )
    return (
        '<div class="video-embed">\n'
        f'                    <iframe src="https://www.youtube-nocookie.com/embed/{esc(vid)}" '
        f'title="{esc(title)}" loading="lazy" '
        'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" '
        'referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>\n'
        '                </div>'
    )


def build_city_page(city: dict) -> str:
    """Builds the per-city hub page (docs/cities/<slug>.html) — the same
    structure as the Mesa page: hero + a linked checklist of every service,
    each pointing at that city's service landing page. The checklist is
    derived from services.json (alphabetical by name) so it can never drift
    out of sync with the actual service pages."""
    checklist = "\n".join(
        f"                <li><a href=\"../services/{city['slug']}/{svc['slug']}.html\">"
        f"{esc(svc['name'])}</a></li>"
        for svc in sorted(services, key=lambda s: s["name"])
    )

    # The city's own local note is woven into the hub hero (below the lead line)
    # so each hub reads distinctly, not as a near-identical clone.
    note_paras = "\n".join(
        f"                        <p>{esc(p)}</p>" for p in city["notePs"]
    )

    tokens = {
        "__CITY_NAME__": esc(city["name"]),
        "__CITY_SLUG__": city["slug"],
        "__SERVICES_CHECKLIST__": checklist,
        "__CITY_NOTE_PARAS__": note_paras,
        "__CITY_VIDEO__": build_video(
            city.get("youtubeId"),
            f"Plunge, A Plumbing Co. — plumbing in {city['name']}, AZ",
        ),
    }
    page = city_template
    for token, value in tokens.items():
        page = page.replace(token, value)

    stray = re.findall(r"__[A-Z_]+__", page)
    if stray:
        print(f"  WARNING: unreplaced tokens in city {city['slug']}: {set(stray)}")

    return page


# =============================================
# BLOG — index (newest first) + one page per post, from blog-posts.json.
# File-based, generated, matching the site (see README "Blog plan").
# =============================================

# =============================================
# COPY-RULE LINT (catalog D4, _generator/failure-modes.md) — the owner's
# copy rules, enforced as build warnings so a future edit can't silently
# regress them. Full rule text lives in project memory (copy-claims-rules);
# in short:
#   1. No CONCRETE time promises ("same-day", "within 2 hours"). Vague
#      speed words and 24/7 availability are fine.
#   2. No recurrence imagery ("keeps coming back") — first-time-right only.
#   3. Never call our work "slow" ("slow drain" describing the PROBLEM is
#      fine and is excluded).
#   4. Never pair a crime word with any place (city, {city}, Valley, AZ...)
#      in one sentence.
#   5. Service flavor copy: {city} appears exactly once, in a PARAGRAPH —
#      never in the lead (leads feed the "«Service» in «City», AZ — ..."
#      meta description, so a lead mention doubles the city in snippets).
# SCOPE: rules 1-4 check services.json + cities.json (marketing copy).
# Blog content gets rules 2 & 4 only — how-to durations ("a 15-minute fix")
# and "slow drain" advice are legitimate blog content, not service promises.
# =============================================

RX_TIME_PROMISE = re.compile(
    r"\bwithin \d|\bsame.day\b|\bnext.day\b|\b\d+ ?(minute|hour|day)s?\b"
    r"|\b(one|two|three|four|five|ten|fifteen|thirty)[- ]minute\b", re.I)
RX_RECURRENCE = re.compile(
    r"\bcome(s)? back\b|\bcoming back\b|\bkeeps? (clogging|coming|failing|breaking|returning)\b"
    r"|\bagain and again\b|\brepeat (visit|failure)s?\b|\bre-?fix\b", re.I)
RX_SLOW = re.compile(r"\bslow(ly)?\b(?! drain)", re.I)
RX_CRIME = re.compile(
    r"theft|thief|thieves|steal|stolen|crime|criminal|vandal|burglar"
    r"|bolt cutter|bad intentions", re.I)


def _rx_place() -> re.Pattern:
    names = "|".join(re.escape(c["name"]) for c in cities)
    return re.compile(
        r"\{city\}|" + names + r"|\bValley\b|\bArizona\b|\bAZ\b|neighborhood", re.I)


def check_copy_rules() -> int:
    """Lints all authored copy against the owner's copy rules. Prints a
    WARNING per violation and returns the count (build still succeeds —
    warnings are the safety net, not a gate)."""
    place_rx = _rx_place()
    problems = []

    def scan(text: str, where: str, marketing: bool) -> None:
        if marketing:
            for rx, label in ((RX_TIME_PROMISE, "concrete time promise"),
                              (RX_SLOW, "'slow' wording")):
                m = rx.search(text)
                if m:
                    problems.append(f"{where}: {label} -> '{m.group(0)}'")
        m = RX_RECURRENCE.search(text)
        if m:
            problems.append(f"{where}: recurrence imagery -> '{m.group(0)}'")
        for sentence in re.split(r"(?<=[.!?])\s+", text):
            if RX_CRIME.search(sentence) and place_rx.search(sentence):
                problems.append(f"{where}: crime word + place in ONE sentence")

    for svc in services:
        scan(svc["lead"], f"services.json '{svc['slug']}' lead", marketing=True)
        if "{city}" in svc["lead"]:
            problems.append(f"services.json '{svc['slug']}': {{city}} in the LEAD "
                            "(leads feed metas — keep them city-free)")
        n = sum(p.count("{city}") for p in svc["paras"])
        if n != 1:
            problems.append(f"services.json '{svc['slug']}': {{city}} appears {n}x "
                            "in paras (rule: exactly 1)")
        for i, p in enumerate(svc["paras"]):
            scan(p, f"services.json '{svc['slug']}' para {i+1}", marketing=True)

    for city in cities:
        scan(city.get("noteTitle", ""), f"cities.json '{city['slug']}' noteTitle", marketing=True)
        for i, p in enumerate(city.get("notePs", [])):
            scan(p, f"cities.json '{city['slug']}' notePs[{i}]", marketing=True)

    for post in blog_posts:
        for field in ("title", "excerpt"):
            scan(post.get(field, ""), f"blog '{post['slug']}' {field}", marketing=False)
        for i, p in enumerate(post.get("body", [])):
            scan(p, f"blog '{post['slug']}' body[{i}]", marketing=False)

    for msg in problems:
        print(f"  WARNING (copy rule): {msg}")
    return len(problems)


def check_orphan_cities() -> int:
    """Catalog D3: removing a city from cities.json does NOT remove its
    generated output — docs/cities/<slug>.html and docs/services/<slug>/
    would stay live forever. This warns loudly so orphans get deleted."""
    known = {c["slug"] for c in cities}
    problems = []
    for f in sorted((ROOT / "docs" / "cities").glob("*.html")):
        if f.stem != "index" and f.stem not in known:
            problems.append(f"docs/cities/{f.name} has no cities.json entry — "
                            "stale page is LIVE; delete it (or restore the city)")
    services_dir = ROOT / "docs" / "services"
    if services_dir.exists():
        for d in sorted(services_dir.iterdir()):
            if d.is_dir() and d.name not in known:
                problems.append(f"docs/services/{d.name}/ has no cities.json entry — "
                                "stale pages are LIVE; delete the folder (or restore the city)")
    for msg in problems:
        print(f"  WARNING (orphan city): {msg}")
    return len(problems)


def check_blog_categories() -> None:
    """Enforces the category/services sync rule (see blog-categories.json
    _notes): every service slug in services.json must be covered by exactly
    one blog category, and every slug a category lists must still exist.
    services.json LEADS; blog-categories.json FOLLOWS. Runs on every build so
    drift is impossible to miss — e.g. add a service and forget the category
    library, and the very next `generate.py` run names the uncovered slug."""
    service_slugs = {s["slug"] for s in services}
    covered = {}
    for cat in blog_categories:
        for slug in cat["services"]:
            if slug in covered:
                print(f"  WARNING: blog-categories.json lists service '{slug}' under "
                      f"both '{covered[slug]}' and '{cat['name']}' — keep it in one.")
            covered[slug] = cat["name"]
            if slug not in service_slugs:
                print(f"  WARNING: blog-categories.json category '{cat['name']}' lists "
                      f"'{slug}', which is no longer in services.json — remove or fix it.")
    for slug in sorted(service_slugs - set(covered)):
        print(f"  WARNING: service '{slug}' (services.json) is not covered by any "
              f"blog category — add it to a category in blog-categories.json "
              f"(categories follow services, not the other way around).")

    # Posts must use a category from the library (or none -> General fallback)
    names = {c["name"] for c in blog_categories}
    for post in blog_posts:
        cat = post.get("category", "")
        if cat and cat not in names:
            print(f"  WARNING: blog post '{post['slug']}' has unknown category "
                  f"'{cat}' — it will build as '{FALLBACK_CATEGORY}'. Valid names "
                  f"are in blog-categories.json.")


def post_category(post: dict) -> str:
    """A post's display category: its 'category' field if it matches the
    library, otherwise the General fallback (never crashes a build)."""
    cat = post.get("category", "")
    return cat if cat in {c["name"] for c in blog_categories} else FALLBACK_CATEGORY


def category_slug(name: str) -> str:
    """Filename-safe slug for a category's page, derived from its name so it
    never needs to be maintained by hand: 'Water Quality & Softening' ->
    'water-quality-and-softening' -> docs/blog/category-<slug>.html."""
    slug = name.lower().replace("&", "and")
    slug = re.sub(r"[^a-z0-9]+", "-", slug).strip("-")
    return slug


def format_post_date(iso: str) -> str:
    """'2026-07-14' -> 'July 14, 2026' (for display). Falls back to the raw
    string if it isn't a plain ISO date, so a bad date never crashes a build."""
    try:
        return datetime.strptime(iso, "%Y-%m-%d").strftime("%B %-d, %Y")
    except ValueError:
        return iso


def sorted_posts() -> list:
    """Newest first, by date. Ties keep source order (stable sort)."""
    return sorted(blog_posts, key=lambda p: p.get("date", ""), reverse=True)


def build_blog_card(post: dict) -> str:
    return (
        '                <article class="blog-card">\n'
        f'                    <a class="blog-card-link" href="{post["slug"]}.html">\n'
        f'                        <p class="blog-card-date">{esc(format_post_date(post.get("date", "")))}'
        f' &middot; <span class="blog-card-cat">{esc(post_category(post))}</span></p>\n'
        f'                        <h2 class="blog-card-title">{esc(post["title"])}</h2>\n'
        f'                        <p class="blog-card-excerpt">{esc(post["excerpt"])}</p>\n'
        '                        <span class="blog-card-more">Read article <i class="fa fa-arrow-right" aria-hidden="true"></i></span>\n'
        '                    </a>\n'
        '                </article>'
    )


def render_photo(photo: dict) -> str:
    """One photo's inner markup: a real <img> once its 'src' is filled in, or
    the "Picture coming soon" placeholder until then — the same box either way,
    so turning a photo on causes no layout shift. Optional 'caption'."""
    src = (photo.get("src") or "").strip()
    if src:
        frame = f'<img src="{esc(src)}" alt="{esc(photo.get("alt", ""))}" loading="lazy">'
    else:
        frame = (
            '<i class="fa fa-image" aria-hidden="true"></i>'
            '<span>Picture coming soon</span>'
        )
    caption = photo.get("caption", "")
    cap_html = (
        f'\n                            <figcaption class="blog-photo-caption">{esc(caption)}</figcaption>'
        if caption else ""
    )
    return (
        '                        <figure class="blog-photo">\n'
        f'                            <div class="blog-photo-frame">{frame}</div>{cap_html}\n'
        '                        </figure>'
    )


def build_blog_figure(item, index: int) -> str:
    """One floated photo figure. 'item' is normally a single photo dict (one
    large photo); it may instead be a LIST of photo dicts, an explicit
    side-by-side group. Figures alternate sides down the article — the first
    floats right, the next left, and so on — unless a single photo pins itself
    with "side": "left" or "right"."""
    if isinstance(item, list):
        photos = item
        side = "left" if index % 2 else "right"
    else:
        photos = [item]
        side = (item.get("side") or "").strip() or ("left" if index % 2 else "right")
    side_class = "blog-figure--left" if side == "left" else "blog-figure--right"
    inner = "\n".join(render_photo(p) for p in photos)
    return (
        f'                    <div class="blog-figure {side_class}">\n'
        f'{inner}\n'
        '                    </div>'
    )


def build_blog_body(post: dict) -> str:
    """Inner HTML of .blog-article-body: the post's paragraphs, with any photo
    figures interleaved and spread evenly down the text so they alternate
    right/left as the reader scrolls (magazine style). Posts with no 'photos'
    are just paragraphs, exactly as before."""
    paras = post["body"]
    figures = post.get("photos") or []
    # Assign each figure to a paragraph, spaced evenly through the body, so the
    # photos are distributed down the article rather than clustered at the top.
    placement = {}
    n = len(figures)
    for i, item in enumerate(figures):
        para_idx = min((i * len(paras)) // n, len(paras) - 1) if n else 0
        placement.setdefault(para_idx, []).append(build_blog_figure(item, i))
    lines = []
    for pi, para in enumerate(paras):
        lines.extend(placement.get(pi, []))
        lines.append(f"                    <p>{esc(para)}</p>")
    return "\n".join(lines)


def build_blog_post_page(post: dict) -> str:
    tokens = {
        "__POST_TITLE__": esc(post["title"]),
        "__POST_SLUG__": post["slug"],
        "__POST_EXCERPT__": esc(post["excerpt"]),
        "__POST_DATE__": esc(format_post_date(post.get("date", ""))),
        "__POST_AUTHOR__": esc(post.get("author", "The Plunge Team")),
        "__POST_CATEGORY__": esc(post_category(post)),
        "__POST_BODY__": build_blog_body(post),
    }
    page = blog_post_template
    for token, value in tokens.items():
        page = page.replace(token, value)
    stray = re.findall(r"__[A-Z_]+__", page)
    if stray:
        print(f"  WARNING: unreplaced tokens in blog post {post['slug']}: {set(stray)}")
    return page


def build_view_all_card(total: int) -> str:
    """The landing page's permanent 4th card: a "View All Blog Posts" button
    styled like the post cards, linking to the archive page. Shows the live
    post count so it always reads current without anyone touching it."""
    label = "post" if total == 1 else "posts"
    return (
        '                <article class="blog-card blog-card--viewall">\n'
        '                    <a class="blog-card-link" href="all-posts.html">\n'
        f'                        {BLOG_ICON_SVG}\n'
        '                        <h2 class="blog-card-title">View All Blog Posts</h2>\n'
        f'                        <p class="blog-card-excerpt">Browse all {total} {label} in one place.</p>\n'
        '                        <span class="blog-card-more">See the full list <i class="fa fa-arrow-right" aria-hidden="true"></i></span>\n'
        '                    </a>\n'
        '                </article>'
    )


def build_archive_item(post: dict) -> str:
    """One row of the all-posts archive list: book-and-pen icon + linked title.
    Mirrors the city pages' services checklist rows (same layout and separator
    lines via CSS), with the icon in place of the ✓ check mark."""
    return (
        f'                <li>{BLOG_ICON_SVG}<a href="{post["slug"]}.html">'
        f'{esc(post["title"])}</a></li>'
    )


# Each category block on the archive page lists at most this many posts (the
# newest); the block's "View All" link leads to the category's own page,
# which lists every post in the category. Like the landing page's 4-card cap,
# this keeps the archive a fixed, scannable size no matter how many hundreds
# of posts eventually pile up.
ARCHIVE_CATEGORY_POST_COUNT = 3


def build_archive_sections(posts: list) -> str:
    """The archive page's body: one block per category, in the library's order
    (blog-categories.json — which itself follows the services list). EVERY
    library category appears, posts or not — the page doubles as a map of the
    topics we cover. Categories with posts list their newest few (see
    ARCHIVE_CATEGORY_POST_COUNT) plus a "View All" link to the category's own
    page; categories with none show a "Stay tuned for more!" placeholder that
    disappears on its own the moment a post lands in that category. Blocks sit
    in a 3-across grid (.blog-archive-grid, see blog.css). The General
    fallback bucket comes last, and only if something actually landed in it."""
    by_cat = {}
    for post in posts:
        by_cat.setdefault(post_category(post), []).append(post)

    order = [c["name"] for c in blog_categories] + [FALLBACK_CATEGORY]
    blocks = []
    for name in order:
        cat_posts = by_cat.get(name)
        if not cat_posts and name == FALLBACK_CATEGORY:
            continue  # General only appears when actually used
        if cat_posts:
            # Dated rows (same markup as the by-date page), per owner request
            rows = "\n".join(
                build_bydate_item(p) for p in cat_posts[:ARCHIVE_CATEGORY_POST_COUNT]
            )
            body = (
                '                <ul class="blog-archive-list">\n'
                f'{rows}\n'
                '                </ul>\n'
                f'                <a class="blog-archive-viewall" href="category-{category_slug(name)}.html">'
                'View All <i class="fa fa-arrow-right" aria-hidden="true"></i></a>'
            )
        else:
            body = '                <p class="blog-archive-empty">Stay tuned for more!</p>'
        blocks.append(
            '            <div class="blog-archive-group">\n'
            f'                <h2 class="blog-archive-cat">{esc(name)}</h2>\n'
            f'{body}\n'
            '            </div>'
        )
    return (
        '            <div class="blog-archive-grid">\n'
        + "\n".join(blocks)
        + '\n            </div>'
    )


def build_bydate_item(post: dict) -> str:
    """One row of the by-date list: book-and-pen icon + linked title with the
    post's date on a small line beneath. Same checklist row chrome as the
    archive/category lists."""
    return (
        f'                <li>{BLOG_ICON_SVG}<div class="blog-bydate-text">'
        f'<a href="{post["slug"]}.html">{esc(post["title"])}</a>'
        f'<span class="blog-bydate-date">{esc(format_post_date(post.get("date", "")))}</span>'
        '</div></li>'
    )


def build_bydate_page(posts: list) -> str:
    """The by-date page (docs/blog/all-posts-by-date.html): every post in one
    flat list, newest first, no category grouping — three columns wide, each
    row showing the post's date. Linked from the bottom of the all-posts
    archive. Fully generated; grows on its own with every new post."""
    rows = "\n".join(build_bydate_item(p) for p in posts)
    n = len(posts)
    tokens = {
        "__BYDATE_COUNT_LINE__": f"{n} post{'' if n == 1 else 's'} and counting.",
        "__BYDATE_LIST__": (
            '            <ul class="blog-archive-list blog-archive-list--full">\n'
            f'{rows}\n'
            '            </ul>'
        ),
    }
    page = blog_bydate_template
    for token, value in tokens.items():
        page = page.replace(token, value)
    stray = re.findall(r"__[A-Z_]+__", page)
    if stray:
        print(f"  WARNING: unreplaced tokens in by-date page: {set(stray)}")
    return page


def build_category_page(name: str, cat_posts: list) -> str:
    """One category's own page (docs/blog/category-<slug>.html): every post in
    the category, newest first, in the 3-column checklist style. Generated for
    EVERY library category — a category with no posts yet just shows the same
    "Stay tuned for more!" placeholder, so its URL is live and stable from day
    one."""
    if cat_posts:
        rows = "\n".join(build_archive_item(p) for p in cat_posts)
        body = (
            '            <ul class="blog-archive-list blog-archive-list--full">\n'
            f'{rows}\n'
            '            </ul>'
        )
    else:
        body = '            <p class="blog-archive-empty">Stay tuned for more!</p>'
    n = len(cat_posts)
    count_line = f"{n} post{'' if n == 1 else 's'} so far in this topic."
    tokens = {
        "__CATEGORY_NAME__": esc(name),
        "__CATEGORY_SLUG__": category_slug(name),
        "__CATEGORY_COUNT_LINE__": count_line,
        "__CATEGORY_BODY__": body,
    }
    page = blog_category_template
    for token, value in tokens.items():
        page = page.replace(token, value)
    stray = re.findall(r"__[A-Z_]+__", page)
    if stray:
        print(f"  WARNING: unreplaced tokens in category page {name}: {set(stray)}")
    return page


def build_blog() -> int:
    outdir = ROOT / "docs" / "blog"
    outdir.mkdir(parents=True, exist_ok=True)
    # docs/blog/ holds ONLY generated files, so clear it before writing —
    # renamed/deleted posts (e.g. removing the pre-launch mock posts) can
    # then never leave stale pages behind. Never hand-place files here.
    for stale in outdir.glob("*.html"):
        stale.unlink()
    check_blog_categories()  # keep blog-categories.json in lockstep with services.json
    posts = sorted_posts()

    # Landing page: the newest BLOG_INDEX_POST_COUNT posts + the permanent
    # "View All Blog Posts" card — always exactly 4 cards, forever.
    cards = "\n".join(build_blog_card(p) for p in posts[:BLOG_INDEX_POST_COUNT])
    cards += "\n" + build_view_all_card(len(posts))
    index = blog_index_template.replace("__BLOG_POST_LIST__", cards)
    index = index.replace(
        "__BLOG_VIDEO__",
        build_video(BLOG_YOUTUBE_ID, "The Plunge Blog — plumbing tips & advice"),
    )
    stray = re.findall(r"__[A-Z_]+__", index)
    if stray:
        print(f"  WARNING: unreplaced tokens in blog index: {set(stray)}")
    (outdir / "index.html").write_text(index, encoding="utf-8")

    # Archive page: every category block, newest few posts + View All links
    archive = blog_archive_template.replace(
        "__BLOG_ARCHIVE_SECTIONS__", build_archive_sections(posts)
    )
    stray = re.findall(r"__[A-Z_]+__", archive)
    if stray:
        print(f"  WARNING: unreplaced tokens in blog archive: {set(stray)}")
    (outdir / "all-posts.html").write_text(archive, encoding="utf-8")

    # One page per category (every library category, even if empty; plus
    # General only when something actually fell back into it)
    by_cat = {}
    for post in posts:
        by_cat.setdefault(post_category(post), []).append(post)
    cat_names = [c["name"] for c in blog_categories]
    if by_cat.get(FALLBACK_CATEGORY):
        cat_names.append(FALLBACK_CATEGORY)
    for name in cat_names:
        (outdir / f"category-{category_slug(name)}.html").write_text(
            build_category_page(name, by_cat.get(name, [])), encoding="utf-8"
        )

    # The flat by-date page: every post, newest first, no categories
    (outdir / "all-posts-by-date.html").write_text(
        build_bydate_page(posts), encoding="utf-8"
    )

    # One page per post
    for post in posts:
        (outdir / f"{post['slug']}.html").write_text(
            build_blog_post_page(post), encoding="utf-8"
        )
    return len(posts)


def main() -> int:
    # Safety nets first, so their warnings lead the output (build continues
    # either way — read them, don't scroll past them):
    n_copy = check_copy_rules()      # catalog D4
    n_orphans = check_orphan_cities()  # catalog D3
    if n_copy == 0 and n_orphans == 0:
        print("Copy-rule lint + orphan check: clean.")

    total = 0
    for city in cities:
        # Pages are written into docs/ — the ONLY folder that gets published
        # (docs/ = the public website; everything else in the repo is private).

        # 1) The per-city hub page: docs/cities/<slug>.html
        (ROOT / "docs" / "cities" / f"{city['slug']}.html").write_text(
            build_city_page(city), encoding="utf-8"
        )

        # 2) That city's service landing pages: docs/services/<slug>/*.html
        outdir = ROOT / "docs" / "services" / city["slug"]
        if outdir.exists():
            shutil.rmtree(outdir)  # clear stale pages from services no longer listed
        outdir.mkdir(parents=True, exist_ok=True)
        for svc in services:
            (outdir / f"{svc['slug']}.html").write_text(
                build_page(city, svc), encoding="utf-8"
            )
            total += 1
        print(f"{city['name']}: 1 hub page + {len(services)} service pages")

    # 3) The blog: index (4 cards max) + all-posts archive + one page per
    #    category + one page per post
    n_posts = build_blog()
    print(f"Blog: 1 index + 1 all-posts archive + {len(blog_categories)} "
          f"category pages + {n_posts} post pages")

    print(f"Done. {len(cities)} city hub pages + {total} service pages + "
          f"1 blog index + 1 blog archive + {len(blog_categories)} category "
          f"pages + {n_posts} blog posts generated.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
