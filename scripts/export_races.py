"""Export already-public race values from one of our pages to private JSON."""
import argparse
import json
from pathlib import Path
import re
from render_races import validate


def constant(page, name):
    match = re.search(r'const\s+' + re.escape(name) + r'\s*=\s*', page)
    if not match:
        raise ValueError(f'Missing {name}')
    return json.JSONDecoder().raw_decode(page[match.end():])[0]


def export(page):
    match = re.search(r'KEIRIN · (\d{4})\.(\d{2})\.(\d{2})', page)
    if not match:
        raise ValueError('Missing page date')
    target = '-'.join(match.groups())
    grades = constant(page, 'videoGrades')
    raw = re.search(r'const raw=String.raw`(.*?)`;', page, re.S)
    races = []
    if raw:
        marks, stats, times = [constant(page, n) for n in ['predictionMarks', 'recentStats', 'startTimes']]
        for line in raw[1].splitlines():
            venue, number, source, kind, riders, lineup = line.split('\t')
            race_id = source.rstrip('/').split('/')[-1]
            players = []
            for rider in riders.split(','):
                no, name, score, period = rider.split('|')
                index = int(no)-1
                players.append({'no': int(no), 'name': name, 'score': float(score), 'period': int(period),
                                'mark': marks[race_id].split(',')[index], 'stats': stats[race_id][index]})
            races.append({'venue': venue, 'race': int(number), 'source': source, 'race_type': kind,
                          'grade_code': int(grades[race_id[:10]]), 'start_time': times[venue+'-'+number],
                          'lineup': lineup, 'players': players})
    else:
        for r in constant(page, 'races'):
            race_id = r['source'].rstrip('/').split('/')[-1]
            groups = []
            for group in r['groups']:
                groups.append(''.join('(' + ''.join(map(str,u['riders'])) + ')' if u['type'] == 'contest'
                                      else '-'.join(map(str,u['riders'])) for u in group))
            players = [{'no': p['no'], 'name': p['name'], 'score': p['rawScore'], 'period': int(p['period']),
                        'mark': p['mark'], 'stats': p['stats']} for p in r['players']]
            races.append({'venue': r['venue'], 'race': r['race'], 'source': r['source'], 'race_type': r['raceType'],
                          'grade_code': int(grades[race_id[:10]]), 'start_time': r['startTime'],
                          'lineup': '/'.join(groups), 'players': players})
    dataset = {'schema_version': 1, 'target_date': target, 'expected_races': len(races), 'races': races}
    validate(dataset)
    return dataset


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('page', type=Path)
    parser.add_argument('--output', required=True, type=Path, help='Use private-snapshots/ or /tmp; never site/')
    args = parser.parse_args()
    output = args.output.resolve()
    site = Path(__file__).resolve().parents[1] / 'site'
    if output.is_relative_to(site):
        parser.error('Do not store source JSON in the public site directory')
    try:
        data = export(args.page.read_text())
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + '\n')
        print(f'Exported {len(data["races"])} races to {output}')
    except (ValueError, KeyError, TypeError) as error:
        parser.exit(1, f'Cannot export this page: {error}\n')


if __name__ == '__main__':
    main()
