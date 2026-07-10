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
    title = f"{seo_heading} | Plunge, a Plumbing Co. LLC"
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
                "name": "Plunge, a Plumbing Co. LLC",
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
            f"Plunge, a Plumbing Co. — plumbing in {city['name']}, AZ",
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
        f'                        <p class="blog-card-date">{esc(format_post_date(post.get("date", "")))}</p>\n'
        f'                        <h2 class="blog-card-title">{esc(post["title"])}</h2>\n'
        f'                        <p class="blog-card-excerpt">{esc(post["excerpt"])}</p>\n'
        '                        <span class="blog-card-more">Read article <i class="fa fa-arrow-right" aria-hidden="true"></i></span>\n'
        '                    </a>\n'
        '                </article>'
    )


def build_blog_post_page(post: dict) -> str:
    body = "\n".join(f"                    <p>{esc(p)}</p>" for p in post["body"])
    tokens = {
        "__POST_TITLE__": esc(post["title"]),
        "__POST_SLUG__": post["slug"],
        "__POST_EXCERPT__": esc(post["excerpt"]),
        "__POST_DATE__": esc(format_post_date(post.get("date", ""))),
        "__POST_AUTHOR__": esc(post.get("author", "The Plunge Team")),
        "__POST_BODY__": body,
    }
    page = blog_post_template
    for token, value in tokens.items():
        page = page.replace(token, value)
    stray = re.findall(r"__[A-Z_]+__", page)
    if stray:
        print(f"  WARNING: unreplaced tokens in blog post {post['slug']}: {set(stray)}")
    return page


def build_blog() -> int:
    outdir = ROOT / "docs" / "blog"
    outdir.mkdir(parents=True, exist_ok=True)
    posts = sorted_posts()

    # Index (post list, newest first) + optional hero video
    cards = "\n".join(build_blog_card(p) for p in posts)
    index = blog_index_template.replace("__BLOG_POST_LIST__", cards)
    index = index.replace(
        "__BLOG_VIDEO__",
        build_video(BLOG_YOUTUBE_ID, "The Plunge Blog — plumbing tips & advice"),
    )
    stray = re.findall(r"__[A-Z_]+__", index)
    if stray:
        print(f"  WARNING: unreplaced tokens in blog index: {set(stray)}")
    (outdir / "index.html").write_text(index, encoding="utf-8")

    # One page per post
    for post in posts:
        (outdir / f"{post['slug']}.html").write_text(
            build_blog_post_page(post), encoding="utf-8"
        )
    return len(posts)


def main() -> int:
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

    # 3) The blog: docs/blog/index.html + one page per post
    n_posts = build_blog()
    print(f"Blog: 1 index + {n_posts} post pages")

    print(f"Done. {len(cities)} city hub pages + {total} service pages + "
          f"1 blog index + {n_posts} blog posts generated.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
