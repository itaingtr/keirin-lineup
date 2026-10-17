# Site updates

- Normally edit only `site/index.html` and the requested day's `site/lineYYYYMMDD.html/index.html`. Keep those two pages identical. Do not rewrite previous daily pages unless the user explicitly requests it.
- Shared `site/comments.js` and `site/comments.css` affect historical pages too. Explain that scope before changing them; avoid shared-file changes for a change intended only for today's page.
- Use Asia/Tokyo for race dates and scheduling. The desired daily collection times are 21:00 and 23:30 JST; each collection targets the next calendar day's S-class races from Rakuten K Dreams.
- Keep collected source data in private storage, outside `site/` and Git history. Keep source snapshots for at least five years, with no automatic expiry, deletion, or overwrite. Five years is a minimum, not a deletion trigger. Before any deletion, offer a transferable backup to the user and obtain their explicit permission. Report daily and cumulative storage usage; if capacity is insufficient, preserve existing data and stop new writes rather than deleting anything.
- Do not enable unattended publishing until live source extraction and validation have passed. Never publish an empty, partially fetched, or fabricated race card over a working page.

- For new race pages, use the dataset workflow in `RENDERING.md`: edit `templates/race-page.html` for layout, validate data with `scripts/render_races.py`, and generate only the index and target date. Read `DATA_SOURCES.md` before selecting or claiming permission for another data provider.

- Exacta odds use the operational GitHub Actions collector in `ODDS.md`. Public display-only odds JSON is served from `odds-diagnostics`; keep raw source HTML and private user data out of that public branch. Direct executor HTTP failures do not establish that the deployment collector failed. Keep observation timestamps; panel refresh currently rereads saved quotes and does not trigger source collection.
