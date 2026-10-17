"""Read K Dreams public card information for review before publishing a new day."""
import argparse
from datetime import datetime, timezone
import html
from pathlib import Path
import re
import time
import urllib.parse
import urllib.request
from collect_exacta import Document, Node


def clean(value):
    return re.sub(r'\s+', ' ', value).strip()


def fetch(url):
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != 'https' or parsed.hostname not in ('keirin.kdreams.jp', 'my.keirin.kdreams.jp'):
        raise ValueError('Unexpected card source')
    request = urllib.request.Request(url, headers={'User-Agent': 'KeirinLineup/1.0 (+https://github.com/itaingtr/keirin-lineup)'})
    with urllib.request.urlopen(request, timeout=30) as response:
        raw = response.read(6_000_001)
        if len(raw) > 6_000_000:
            raise ValueError('Response too large')
        return Document(raw.decode(response.headers.get_content_charset() or 'utf-8')).root


def cells(row):
    return [node for node in row.children if isinstance(node, Node) and node.tag in ('td', 'th')]


def esc(value):
    return html.escape(str(value))


def review_table(table):
    rows = []
    for row in table.find_all('tr'):
        values = cells(row)
        if values:
            rows.append('<tr>' + ''.join('<td title="' + esc(node.attrs.get('class', '')) + '">' + esc(clean(node.text())) + '</td>' for node in values) + '</tr>')
    return '<table border="1"><caption>' + esc(table.attrs.get('class', '')) + '</caption>' + ''.join(rows) + '</table>'


def inspect_day(day, output):
    date = datetime.strptime(day, '%Y-%m-%d').date()
    url = f'https://keirin.kdreams.jp/racecard/{date:%Y/%m/%d}/'
    doc = fetch(url)
    links = {}
    for node in doc.find_all('a'):
        source = urllib.parse.urljoin(url, node.attrs.get('href', ''))
        if re.fullmatch(r'https://(?:my\.)?keirin\.kdreams\.jp/[a-z]+/racedetail/\d{16}/', source):
            links[source] = clean(node.text())
    if not links:
        raise ValueError('No race links found for requested date')
    parts = ['<!doctype html><html lang="ja"><meta charset="utf-8"><title>出走表の確認</title>', '<h1>' + esc(day) + ' 出走表の確認</h1>', '<p>' + esc(datetime.now(timezone.utc).isoformat()) + '</p>']
    for div in doc.find_all('div'):
        if 'raceinfo_table' in div.attrs.get('class', '').split():
            parts.extend(review_table(table) for table in div.find_all('table'))
    parts.append('<h2>掲載レース</h2><ul>' + ''.join('<li><a href="' + esc(source) + '">' + esc(label or source) + '</a></li>' for source, label in links.items()) + '</ul>')
    samples = []
    for prefix, race in [('27', '0001'), ('74', '0006')]:
        chosen = next((source for source in links if source.split('/')[-2].startswith(prefix) and source.split('/')[-2].endswith(race)), None)
        if chosen:
            samples.append(chosen)
    if not samples:
        samples = list(links)[:2]
    for source in samples:
        time.sleep(2)
        detail = fetch(source)
        parts.append('<h2><a href="' + esc(source) + '">' + esc(source) + '</a></h2>')
        title = next((clean(node.text()) for node in detail.find_all('title')), '')
        parts.append('<p>' + esc(title) + '</p>')
        for table in detail.find_all('table'):
            if '競走得点' in table.text() or 'racecard' in table.attrs.get('class', ''):
                parts.append(review_table(table))
        parts.append('<h3>並び表示の確認</h3>')
        for node in detail.find_all():
            classes = node.attrs.get('class', '')
            if 'line' in classes.lower() or 'line' in node.attrs.get('id', '').lower():
                if len(node.text()) < 500:
                    parts.append('<p>' + esc(node.tag + ' ' + classes + ' ' + node.attrs.get('id', '') + ' : ' + clean(node.text())) + '</p>')
                    for child in node.find_all():
                        if clean(child.text()) and len(child.text()) < 60:
                            parts.append('<div>' + esc(child.tag + ' ' + child.attrs.get('class', '') + ' : ' + clean(child.text())) + '</div>')
        parts.append('<h3>開催表示</h3>')
        for node in detail.find_all('img'):
            if any(word in node.attrs.get('src', '').lower() for word in ('grade', 'g1', 'g2', 'g3', 'f1', 'f2')):
                parts.append('<p>' + esc(node.attrs.get('alt', '') + ' ' + node.attrs.get('src', '')) + '</p>')
        flat = clean(detail.text())
        for word in ('並び予想', '発走予定', 'Ｓ級', 'S級'):
            index = flat.find(word)
            if index >= 0:
                parts.append('<p>' + esc(flat[max(0, index-50):index+350]) + '</p>')
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text('\n'.join(parts) + '</html>\n')
    print(f'Reviewed {len(links)} scheduled race links and {len(samples)} sample cards for {day}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--date', required=True)
    parser.add_argument('--review', type=Path, required=True)
    args = parser.parse_args()
    inspect_day(args.date, args.review)
