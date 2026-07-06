#!/usr/bin/env python3
"""Builds the per-city, per-service landing pages in services/<city>/.

Reads services.json + cities.json + template.html (all in this folder)
and writes one finished page per (city x service) pair.

Usage (from the project root or anywhere):
    python3 _generator/generate.py

See README.md in this folder for how to add cities/services.
"""

import html
import json
import pathlib
import re
import sys

BASE = pathlib.Path(__file__).resolve().parent
ROOT = BASE.parent

cities = json.loads((BASE / "cities.json").read_text(encoding="utf-8"))
services = json.loads((BASE / "services.json").read_text(encoding="utf-8"))
template = (BASE / "template.html").read_text(encoding="utf-8")

service_slugs = {s["slug"] for s in services}


def esc(text: str) -> str:
    """Escape plain text for safe embedding in HTML."""
    return html.escape(text, quote=False)


def fill(city: dict, text: str) -> str:
    """Replace the {city} token used inside copy strings."""
    return text.replace("{city}", city["name"])


def build_page(city: dict, svc: dict) -> str:
    h1name = svc.get("h1name", svc["name"])
    h1 = f"{h1name} in {city['name']}, {city['state']}"
    title = f"{h1} | Plunge, a Plumbing Co. LLC"
    meta = fill(city, svc["meta"])
    lead = fill(city, svc["lead"])

    body_html = "\n".join(
        f"                <p>{esc(fill(city, p))}</p>" for p in svc["paras"]
    )

    note_html = "\n".join(
        f"                <p>{esc(p)}</p>" for p in city["notePs"]
    )

    related_html = ""
    for slug in svc["related"]:
        if slug not in service_slugs:
            print(f"  WARNING: {svc['slug']} lists unknown related service '{slug}'")
            continue
        rel = next(s for s in services if s["slug"] == slug)
        related_html += (
            f"                <a class=\"related-chip\" "
            f"href=\"{slug}.html\">{esc(rel['name'])}</a>\n"
        )
    related_html = related_html.rstrip("\n")

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
