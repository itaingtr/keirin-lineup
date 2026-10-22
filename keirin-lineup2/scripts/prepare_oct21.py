"""Append verified October 21 sources before preparing that page alone."""
from datetime import datetime, timezone
import json
import os
from pathlib import Path

from archive_snapshot import Storage, snapshot_name
from collect_sources import collect as collect_card
from collect_history import collect as collect_history
from collect_media import collect as collect_media
from render_races import render
from source_http import fetch


def main():
    target = '2026-10-21'
    cache = {}
    def read(url, sources):
        if url not in cache:
            captured = []
            doc, observed = fetch(url, captured)
            cache[url] = (doc, observed, captured[-1])
        doc, observed, original = cache[url]
        sources.append(original)
        return doc, observed

    card, odds = collect_card(target, read=read, pause=1)
    history_archive, history = collect_history(card, read=read, pause=0)
    media_archive, media = collect_media(card, read=read, pause=0)
    viewer = {'schema_version': 1, 'provider': 'winticket', 'target_date': target,
              'checked_at': datetime.now(timezone.utc).isoformat(),
              'results': history['result_cards'], 'media': media}
    archive = {**card, 'snapshot_kind': 'independent-dated-card',
               'odds': odds, 'history': history_archive, 'media': media_archive}
    store = Storage(os.environ['SNAPSHOT_SUPABASE_URL'], os.environ['SNAPSHOT_SUPABASE_SERVICE_KEY'])
    store.ensure_private_bucket()
    def encode(data):
        return json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode()
    batches, batch, size = [], [], 0
    for _, _, original in cache.values():
        length = len(encode(original))
        if batch and size + length > 8_000_000:
            batches.append(batch)
            batch, size = [], 0
        batch.append(original)
        size += length
    if batch:
        batches.append(batch)
    objects = [encode({'target_date': target, 'snapshot_kind': 'public-source-originals', 'sources': batch})
               for batch in batches] + [encode(archive)]
    usage = store.usage()
    if not usage['bytes_complete'] or usage['known_bytes'] + sum(map(len, objects)) > 450_000_000:
        raise ValueError('Preserve existing storage; new snapshot exceeds conservative storage budget')
    for payload in objects:
        name = snapshot_name(target)
        store.upload(name, payload)
        store.verify(name, payload)
        print('Private source append/readback verified:', name, len(payload), 'bytes', flush=True)
    print('STORAGE USAGE', json.dumps(store.usage(), ensure_ascii=False), flush=True)

    # Publish only derived display fields, after all original sources read back.
    root = Path(__file__).resolve().parents[1]
    page = render(card, site=root/'site')
    old_base = '<base href="./"><script>if(/\\/line\\d{8}\\.html\\/(?:index\\.html)?$/.test(location.pathname))document.querySelector("base").href="../";</script>'
    if old_base not in page:
        raise ValueError('Unexpected generated-page base')
    page = page.replace(old_base, '<base href="/line20261021.html/">')
    for asset in ('viewer.css', 'viewer.js', 'predictions.js', 'comments.css', 'comments.js', 'odds-current.js', 'odds-comparison.js'):
        page = page.replace('"./'+asset, '"/'+asset)
    page = page.replace('value="./line', 'value="/line')
    output = Path('/tmp/lineup2-oct21/line20261021.html')
    output.mkdir(parents=True, exist_ok=False)
    (output/'index.html').write_text(page)
    for name, data in [('odds.json', odds), ('odds-config.json', {'endpoint': './odds.json'}),
                       ('viewer.json', viewer), ('media.json', media)]:
        (output/name).write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')))
    print('PREPARED OCT21', len(card['races']), 'races,', sum(len(r['players']) for r in card['races']),
          'riders,', len(viewer['results']), 'result tables,', len(cache), 'original pages', flush=True)


if __name__ == '__main__':
    main()
