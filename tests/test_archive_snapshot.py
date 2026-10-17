from datetime import datetime, timedelta, timezone
import importlib.util
from pathlib import Path
import re
import unittest

spec = importlib.util.spec_from_file_location('archive', Path(__file__).parents[1] / 'scripts/archive_snapshot.py')
archive = importlib.util.module_from_spec(spec)
spec.loader.exec_module(archive)


class SnapshotTests(unittest.TestCase):
    def test_unique_snapshot_names_and_target_validation(self):
        now = datetime(2026, 10, 17, 12, tzinfo=timezone.utc)
        first = archive.snapshot_name('2026-10-18', now)
        second = archive.snapshot_name('2026-10-18', now)
        self.assertNotEqual(first, second)
        self.assertRegex(first, r'^2026-10-18/20261017T120000000000Z-[a-f0-9]+\.json$')
        with self.assertRaises(ValueError):
            archive.snapshot_name('../../comments')

    def test_expiry_uses_upload_age_and_preserves_boundary(self):
        now = datetime(2026, 11, 17, 12, tzinfo=timezone.utc)
        ages = [timedelta(days=30, seconds=1), timedelta(days=30), timedelta(days=2)]
        objects = [{'name': str(i), 'created_at': (now-age).isoformat()} for i, age in enumerate(ages)]
        self.assertEqual(archive.expired_objects(objects, now), ['0'])

    def test_bad_expiry_metadata_fails_closed(self):
        with self.assertRaises(ValueError):
            archive.expired_objects([{'name': 'keep', 'created_at': 'unknown'}])

    def test_paginated_listing_prunes_only_private_snapshot_paths(self):
        class Fake(archive.Storage):
            def __init__(self):
                self.deleted = []
            def request(self, method, path, body=None, content_type='application/json'):
                if method == 'DELETE':
                    self.deleted.extend(body['prefixes'])
                    return None
                if body['prefix'] == '':
                    return [{'name': '2026-10-18', 'id': None}, {'name': 'race_comments', 'id': None}]
                self_outer.assertEqual(body['prefix'], '2026-10-18')
                if body['offset'] == 0:
                    return [{'name': str(i), 'id': str(i), 'created_at': '2020-01-01T00:00:00Z'} for i in range(100)]
                return [{'name': 'recent', 'id': 'recent', 'created_at': datetime.now(timezone.utc).isoformat()}]
        self_outer = self
        store = Fake()
        self.assertEqual(store.prune(), 100)
        self.assertEqual(len(store.deleted), 100)
        self.assertTrue(all(name.startswith('2026-10-18/') for name in store.deleted))

    def test_refuses_untrusted_credential_destination(self):
        with self.assertRaises(ValueError):
            archive.Storage('https://example.com', 'test-placeholder')


if __name__ == '__main__':
    unittest.main()
