#!/usr/bin/env python3
"""Builds the per-city, per-service landing pages in services/<city>/.

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
"""

import html
import json
import pathlib
import re
import shutil
import sys

BASE = pathlib.Path(__file__).resolve().parent
ROOT = BASE.parent

cities = json.loads((BASE / "cities.json").read_text(encoding="utf-8"))
services = json.loads((BASE / "services.json").read_text(encoding="utf-8"))
template = (BASE / "template.html").read_text(encoding="utf-8")

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
    h1 = f"{svc['name']} in {city['name']}, {city['state']}"
    title = f"{h1} | Plunge, a Plumbing Co. LLC"
    lead = fill(city, svc["lead"])
    meta = f"{h1} — {lead} Call {PHONE_DISPLAY}."

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


def main() -> int:
    total = 0
    for city in cities:
        outdir = ROOT / "services" / city["slug"]
        if outdir.exists():
            shutil.rmtree(outdir)  # clear stale pages from services no longer listed
        outdir.mkdir(parents=True, exist_ok=True)
        for svc in services:
            (outdir / f"{svc['slug']}.html").write_text(
                build_page(city, svc), encoding="utf-8"
            )
            total += 1
        print(f"{city['name']}: {len(services)} pages -> {outdir.relative_to(ROOT)}/")
    print(f"Done. {total} pages generated.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
