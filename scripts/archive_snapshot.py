"""Private 30-day source snapshots in Supabase Storage (never in the public site)."""
import argparse
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import re
import urllib.error
import urllib.parse
import urllib.request
import uuid

BUCKET = 'keirin-source-snapshots'


def snapshot_name(target_date, now=None):
    target = datetime.strptime(target_date, '%Y-%m-%d').date()
    now = now or datetime.now(timezone.utc)
    return f'{target.isoformat()}/{now.astimezone(timezone.utc):%Y%m%dT%H%M%S%fZ}-{uuid.uuid4().hex}.json'


def expired_objects(objects, now=None):
    cutoff = (now or datetime.now(timezone.utc)) - timedelta(days=30)
    result = []
    for obj in objects:
        # Never expire by race date: a newly acquired old card is still a new backup.
        created = datetime.fromisoformat(obj['created_at'].replace('Z', '+00:00'))
        if created < cutoff:
            result.append(obj['name'])
    return result


class Storage:
    def __init__(self, url, key):
        if not re.fullmatch(r'https://[a-z0-9-]+\.supabase\.co', url):
            raise ValueError('Expected an HTTPS Supabase project URL')
        self.url, self.key = url, key

    def request(self, method, path, body=None, content_type='application/json'):
        data = None if body is None else (body if isinstance(body, bytes) else json.dumps(body).encode())
        req = urllib.request.Request(self.url + '/storage/v1/' + path, data=data,
            headers={'apikey': self.key, 'Authorization': 'Bearer ' + self.key,
                     'Content-Type': content_type}, method=method)
        try:
            with urllib.request.urlopen(req, timeout=60) as response:
                payload = response.read()
                return json.loads(payload) if payload else None
        except urllib.error.HTTPError as error:
            # Do not print response bodies, headers or credentials in CI logs.
            raise RuntimeError(f'Storage {method} failed with HTTP {error.code}') from None

    def upload(self, name, data):
        self.request('POST', 'object/' + BUCKET + '/' + urllib.parse.quote(name, safe='/'), data)

    def list_all(self, prefix):
        result, offset = [], 0
        while True:
            batch = self.request('POST', 'object/list/' + BUCKET,
                {'prefix': prefix, 'limit': 100, 'offset': offset,
                 'sortBy': {'column': 'name', 'order': 'asc'}})
            result.extend(batch)
            if len(batch) < 100:
                return result
            offset += len(batch)

    def prune(self):
        # Collect all names before deleting, so pagination cannot skip objects.
        objects = []
        for directory in self.list_all(''):
            if directory.get('id') is not None:
                continue
            if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', directory['name']):
                continue
            for obj in self.list_all(directory['name']):
                if obj.get('id') is not None and obj.get('created_at'):
                    objects.append(dict(obj, name=directory['name'] + '/' + obj['name']))
        names = expired_objects(objects)
        for offset in range(0, len(names), 100):
            self.request('DELETE', 'object/' + BUCKET, {'prefixes': names[offset:offset + 100]})
        return len(names)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--date', required=True, help='Race date YYYY-MM-DD')
    parser.add_argument('--input', required=True, type=Path, help='Collected JSON outside site/')
    args = parser.parse_args()
    data = args.input.read_bytes()
    snapshot = json.loads(data)
    if not isinstance(snapshot, dict) or snapshot.get('target_date') != args.date:
        parser.error('Snapshot target_date must match --date')
    if not snapshot.get('sources'):
        parser.error('Snapshot must contain nonempty sources')
    name = snapshot_name(args.date)
    store = Storage(os.environ['SNAPSHOT_SUPABASE_URL'].rstrip('/'),
                    os.environ['SNAPSHOT_SUPABASE_SERVICE_KEY'])
    # A failed backup must prevent later publish steps. Prune only after upload succeeds.
    store.upload(name, data)
    deleted = store.prune()
    print(f'Private snapshot saved: {name}; expired snapshots deleted: {deleted}')


if __name__ == '__main__':
    main()
