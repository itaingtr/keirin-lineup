"""Append-only private source snapshots and read-only storage usage reports."""
import argparse
from datetime import datetime, timezone
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


class Storage:
    def __init__(self, url, key):
        if not re.fullmatch(r'https://[a-z0-9-]+\.supabase\.co', url):
            raise ValueError('Expected an HTTPS Supabase project URL')
        self.url, self.key = url, key

    def request(self, method, path, body=None, content_type='application/json'):
        if method not in ('GET', 'POST'):
            raise ValueError('Snapshot storage permits read and append operations only; deletion needs a separate user-approved operation')
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

    def verify(self, name, data):
        restored = self.request('GET', 'object/authenticated/' + BUCKET + '/' + urllib.parse.quote(name, safe='/'))
        if restored != json.loads(data):
            raise ValueError('Private snapshot readback differs from the uploaded data; publication stopped')

    def ensure_private_bucket(self):
        buckets = self.request('GET', 'bucket')
        matching = [bucket for bucket in buckets if bucket.get('id') == BUCKET]
        if not matching:
            self.request('POST', 'bucket', {'id':BUCKET, 'name':BUCKET, 'public':False})
        bucket = self.request('GET', 'bucket/' + BUCKET)
        if bucket.get('id') != BUCKET or bucket.get('public') is not False:
            raise ValueError('Snapshot bucket must be private; no data uploaded')

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

    def usage(self):
        """Read the inventory without deleting or modifying any stored snapshot."""
        by_date = {}
        pending = ['']
        while pending:
            prefix = pending.pop()
            for obj in self.list_all(prefix):
                name = '/'.join(filter(None, [prefix, obj['name']]))
                if obj.get('id') is None:
                    pending.append(name)
                    continue
                day = name.split('/')[0]
                if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', day):
                    day = 'other'
                group = by_date.setdefault(day, {'objects': 0, 'known_bytes': 0, 'unknown_size_objects': 0})
                group['objects'] += 1
                size = (obj.get('metadata') or {}).get('size')
                if type(size) is int and size >= 0:
                    group['known_bytes'] += size
                else:
                    group['unknown_size_objects'] += 1
        totals = {key: sum(group[key] for group in by_date.values())
                  for key in ('objects', 'known_bytes', 'unknown_size_objects')}
        return {'bucket': BUCKET, 'checked_at': datetime.now(timezone.utc).isoformat(),
                **totals, 'bytes_complete': totals['unknown_size_objects'] == 0,
                'by_date': dict(sorted(by_date.items()))}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--date', help='Race date YYYY-MM-DD')
    parser.add_argument('--input', type=Path, help='Collected JSON outside site/')
    parser.add_argument('--usage-only', action='store_true', help='Read daily and total storage usage without uploading')
    parser.add_argument('--report', type=Path, help='Also write the usage report outside the public site')
    args = parser.parse_args()
    if args.report and args.report.resolve().is_relative_to(Path(__file__).resolve().parents[1] / 'site'):
        parser.error('Usage reports must stay outside the public site')
    data, name = None, None
    if args.usage_only:
        if args.input or args.date:
            parser.error('--usage-only cannot be combined with --input or --date')
    else:
        if not args.date or not args.input:
            parser.error('--date and --input are required for an upload')
        data = args.input.read_bytes()
        snapshot = json.loads(data)
        if not isinstance(snapshot, dict) or snapshot.get('target_date') != args.date:
            parser.error('Snapshot target_date must match --date')
        if not snapshot.get('sources'):
            parser.error('Snapshot must contain nonempty sources')
        name = snapshot_name(args.date)
    store = Storage(os.environ['SNAPSHOT_SUPABASE_URL'].rstrip('/'),
                    os.environ['SNAPSHOT_SUPABASE_SERVICE_KEY'])
    store.ensure_private_bucket()
    if name is not None:
        # New unique object, no upsert or overwrite. No expiry or deletion follows.
        store.upload(name, data)
        store.verify(name, data)
        print(f'Private snapshot saved: {name}')
    report = store.usage()
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
