"""Validate a race dataset and render the shared static page without network access."""
import argparse
from collections import Counter
from datetime import date, timedelta
import html
import json
import math
from pathlib import Path
import re
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = re.compile(r'https://(?:my\.)?keirin\.kdreams\.jp/[a-z]+/racedetail/(\d{2})(\d{8})(\d{2})(\d{4})/')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def text(value, label):
    require(isinstance(value, str) and bool(value.strip()) and not any(c in value for c in '\t\r\n'), f'Invalid {label}')
    return value


def integer(value, low, high, label):
    require(type(value) is int and low <= value <= high, f'Invalid {label}')
    return value


def parse_lineup(lineup, numbers):
    require(isinstance(lineup, str) and re.fullmatch(r'[1-9()/-]+', lineup) is not None, 'Invalid lineup')
    groups, seen = [], []
    for group in lineup.split('/'):
        require(bool(group), 'Empty lineup group')
        units, offset = [], 0
        for match in re.finditer(r'\([1-9]{2,}\)|[1-9](?:-?[1-9])*', group):
            require(match.start() == offset, 'Malformed contest group')
            riders = [int(n) for n in re.findall(r'[1-9]', match[0])]
            units.append({'type': 'contest' if match[0].startswith('(') else 'riders', 'riders': riders})
            seen.extend(riders)
            offset = match.end()
        require(offset == len(group), 'Malformed lineup')
        groups.append(units)
    require(Counter(seen) == Counter(numbers), 'Lineup must contain every rider exactly once')
    return groups


def validate(dataset):
    require(isinstance(dataset, dict) and dataset.get('schema_version') == 1, 'Expected schema_version 1')
    target = date.fromisoformat(dataset['target_date'])
    require(target.isoformat() == dataset['target_date'], 'Use YYYY-MM-DD')
    races = dataset.get('races')
    require(isinstance(races, list) and bool(races), 'No races: refusing to replace the working page')
    require(type(dataset.get('expected_races')) is int and dataset['expected_races'] == len(races), 'Incomplete race count')
    normalized, grades, seen = [], {}, set()
    for r in races:
        source = text(r['source'], 'source URL')
        match = SOURCE.fullmatch(source)
        require(match is not None, 'Expected a K Dreams race detail URL')
        venue_code, start, day, race_no = match.groups()
        require(int(day) >= 1, 'Invalid meeting day')
        require(date.fromisoformat(f'{start[:4]}-{start[4:6]}-{start[6:]}') + timedelta(days=int(day)-1) == target, 'Race URL date does not match target_date')
        number = integer(r['race'], 1, 12, 'race number')
        require(number == int(race_no), 'Race number does not match URL')
        identity = venue_code + start + day + race_no
        require(identity not in seen, 'Duplicate race')
        seen.add(identity)
        grade = integer(r['grade_code'], 1, 6, 'grade code')
        meeting = venue_code + start
        require(meeting not in grades or grades[meeting] == str(grade), 'Conflicting meeting grades')
        grades[meeting] = str(grade)
        venue = text(r['venue'], 'venue')
        race_type = text(r['race_type'], 'race type')
        require(race_type.startswith(('S級', 'Ｓ級')), 'Only S-class races are supported')
        start_time = r['start_time']
        require(isinstance(start_time, str) and (start_time == '' or re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d', start_time)), 'Invalid start time')
        require(isinstance(r['players'], list) and 1 <= len(r['players']) <= 9, 'Invalid rider count')
        players, numbers = [], []
        for p in r['players']:
            no = integer(p['no'], 1, 9, 'rider number')
            require(no not in numbers, 'Duplicate rider number')
            numbers.append(no)
            score = p['score']
            require(type(score) in (int, float) and math.isfinite(score) and 0 <= score <= 200, 'Invalid score')
            period = integer(p['period'], 1, 999, 'period')
            stats = p['stats']
            require(isinstance(stats, list) and len(stats) == 6, 'S/B/逃/捲/差/マ are all required')
            for value in stats:
                integer(value, 0, 999, 'statistic')
            mark = p['mark']
            require(mark in ('', '◎', '○', '◯', '▲', '△', '×', '注', '☆', '★', '穴'), 'Invalid prediction mark')
            players.append({'no': no, 'name': text(p['name'], 'rider name'), 'score': str(math.floor(score)),
                            'rawScore': score, 'period': str(period), 'mark': mark, 'stats': stats})
        normalized.append({'venue': venue, 'race': number, 'source': source, 'raceType': race_type,
                           'startTime': start_time, 'players': players, 'groups': parse_lineup(r['lineup'], numbers),
                           'averageScore': sum(p['rawScore'] for p in players) / len(players)})
    # Higher grades first; within a meeting keep race numbers ascending.
    normalized.sort(key=lambda r: (-int(grades[''.join(SOURCE.fullmatch(r['source']).groups()[:2])]), r['source'][:r['source'].index('/racedetail/')], r['race']))
    return target, normalized, grades


def script_json(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False).replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026').replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')


def available_dates(site, target):
    dates = {target, target + timedelta(days=1)}
    if site.exists():
        for path in site.iterdir():
            match = re.fullmatch(r'(?:line)?(\d{8})\.html', path.name)
            if match and (path / 'index.html').is_file():
                raw = match[1]
                dates.add(date.fromisoformat(f'{raw[:4]}-{raw[4:6]}-{raw[6:]}'))
    return sorted(dates, reverse=True)


def render(dataset, site=None, template=None):
    target, races, grades = validate(dataset)
    site = Path(site) if site is not None else ROOT / 'site'
    template = template if template is not None else (ROOT / 'templates/race-page.html').read_text()
    label = f'{target.month}月{target.day}日'
    summary = f'全{len(races)}レース・{sum(len(r["players"]) for r in races)}人。グレードの高い開催から掲載。'
    options = []
    for day in available_dates(site, target):
        normal = f'line{day:%Y%m%d}.html'
        # Retain the existing legacy October 7 URL instead of inventing a new path.
        path = normal if day == target or (site / normal / 'index.html').is_file() else f'{day:%Y%m%d}.html'
        if day == target + timedelta(days=1):
            path = normal
        selected = ' selected' if day == target else ''
        options.append(f'<option value="https://itaingtr.github.io/keirin-lineup/{path}/"{selected}>{day.month}月{day.day}日</option>')
    values = {'TITLE': html.escape(label + ' S級戦 並びと選手一覧'),
              'HEADER': f'<header><div class="eyebrow">KEIRIN · {target:%Y.%m.%d}</div><h1>{label} S級戦｜並び・選手一覧</h1><p class="intro">{summary}</p></header>',
              'DATE_OPTIONS': ''.join(options), 'COUNT': f'{len(races)} / {len(races)} レース',
              'RACES': script_json(races), 'VIDEO_GRADES': script_json(grades)}
    # Substitute in one pass so data resembling a placeholder cannot alter the template.
    return re.sub(r'@@([A-Z_]+)@@', lambda m: values[m[1]], template)


def write_pages(dataset, site):
    target, _, _ = validate(dataset)
    site = Path(site)
    output = render(dataset, site).encode()
    paths = [site / 'index.html', site / f'line{target:%Y%m%d}.html' / 'index.html']
    temporary = []
    try:
        # Fully render and stage both files before replacing either destination.
        for path in paths:
            path.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as handle:
                handle.write(output)
                temporary.append(Path(handle.name))
        for temp, path in zip(temporary, paths):
            temp.replace(path)
    finally:
        for temp in temporary:
            temp.unlink(missing_ok=True)
    return paths


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('data', type=Path, help='Private structured JSON dataset')
    parser.add_argument('--site-dir', type=Path, default=ROOT / 'site', help='Use a temporary directory for preview output')
    args = parser.parse_args()
    try:
        dataset = json.loads(args.data.read_text())
        for path in write_pages(dataset, args.site_dir):
            print(f'Generated {path}')
    except (ValueError, KeyError, TypeError) as error:
        parser.exit(1, f'Invalid dataset; pages not generated: {error}\n')


if __name__ == '__main__':
    main()
