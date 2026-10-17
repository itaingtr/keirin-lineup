"""Read-only smoke check of the deployed page and its actual exacta feed."""
import json
import re
import time
import urllib.request

BASE = 'https://itaingtr.github.io/keirin-lineup/'


def read(url):
    suffix = ('&' if '?' in url else '?') + 'check=' + str(time.time_ns())
    with urllib.request.urlopen(url + suffix, timeout=30) as response:
        return response.read().decode(), response.headers


def check():
    page, _ = read(BASE)
    match = re.search(r'const races\s*=\s*', page)
    if not match:
        raise ValueError('Published page has no structured race dataset')
    races = json.JSONDecoder().raw_decode(page[match.end():])[0]
    raw, _ = read(BASE + 'odds-config.json')
    endpoint = json.loads(raw).get('endpoint')
    if not endpoint or not endpoint.startswith('https://'):
        raise ValueError('Published odds source is not configured')
    raw, headers = read(endpoint)
    if headers.get('Access-Control-Allow-Origin') not in ('*', 'https://itaingtr.github.io'):
        raise ValueError('Browser cannot read the feed with the reported CORS policy')
    feed = json.loads(raw)
    snapshots = {item['snapshot']['race_key']: item['snapshot'] for item in feed['results'] if item.get('ok')}
    count = 0
    for race in races:
        key = '/' + race['source'].split('/', 3)[3]
        if key not in snapshots:
            raise ValueError('No successful snapshot for ' + key)
        snapshot = snapshots[key]
        numbers = {player['no'] for player in race['players']}
        pairs = {(item['first'], item['second']) for item in snapshot['odds']}
        expected = {(a,b) for a in numbers for b in numbers if a != b}
        if pairs != expected or len(snapshot['odds']) != len(expected):
            raise ValueError('Published feed does not match listed riders: ' + key)
        count += len(pairs)
    # Ensure the newly deployed client has the snapshot reader as well.
    client, _ = read(BASE + 'odds.js')
    if 'payload.results' not in client or "'snapshot'" not in client:
        raise ValueError('Published client has not updated to read the feed')
    print(f'PASS published page: {len(races)} races, {count} actual exacta combinations, client and browser CORS')


if __name__ == '__main__':
    for attempt in range(3):
        try:
            check()
            break
        except Exception:
            if attempt == 2:
                raise
            time.sleep(10)
