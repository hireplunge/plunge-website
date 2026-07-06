# Service Landing Page Generator

This folder builds the per-city, per-service SEO landing pages that live in
`services/<city>/<service>.html` (e.g. `services/mesa/drain-cleaning.html`).

**This folder is never published.** GitHub Pages (Jekyll) automatically
excludes folders that start with an underscore, so `_generator/` stays
private even though it lives in the repository.

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

Run from the project root. It rebuilds every page in `services/` from
scratch. **Never edit the files in `services/` by hand** — your changes
will be overwritten on the next run. Edit the JSON/template here instead,
then re-run.

## To add a city

1. Add an entry to `cities.json` — copy the Mesa entry as a starting point.
   Write REAL local notes for the city (neighborhoods, housing stock, water
   quirks, jobs we've done there). This is what keeps the pages from being
   cookie-cutter clones, which Google demotes.
2. Run the generator.
3. In that city's page in `cities/`, turn the services-checklist items into
   links pointing at `../services/<city>/<service-slug>.html`
   (see cities/mesa.html for the pattern).

## To add / rename a service

1. Edit `services.json` (slug, name, copy, FAQs, related list).
2. Run the generator. If you renamed a slug, delete the old .html files
   from each `services/<city>/` folder and update the city-page checklist
   links.

## Before launch (when hireplunge.com is connected)

- Replace the `yourwebsite.com` placeholder in `template.html` (canonical
  URL + schema) with the real domain and regenerate.
- Generate a `sitemap.xml` listing every landing page and submit it in
  Google Search Console.
