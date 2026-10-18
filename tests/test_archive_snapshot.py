from datetime import datetime, timezone
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

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

    def test_inventory_keeps_old_data_and_counts_all_pages_and_dates(self):
        calls = []
        class Fake(archive.Storage):
            def __init__(self):
                pass
            def request(self, method, path, body=None, content_type='application/json'):
                calls.append((method, path))
                self_outer.assertEqual(method, 'POST')
                self_outer.assertTrue(path.startswith('object/list/'))
                if body['prefix'] == '':
                    return [{'name': '2020-01-01', 'id': None}, {'name': '2026-10-18', 'id': None},
                            {'name': 'other.json', 'id': 'root', 'metadata': {'size': 7}}]
                if body['prefix'] == '2020-01-01':
                    if body['offset'] == 0:
                        return [{'name': str(i), 'id': str(i), 'created_at': '2020-01-01T00:00:00Z',
                                 'metadata': {'size': 10}} for i in range(100)]
                    return [{'name': 'last', 'id': 'last', 'metadata': {'size': 5}}]
                return [{'name': 'recent', 'id': 'recent', 'metadata': {'size': 20}}]
        self_outer = self
        report = Fake().usage()
        self.assertEqual(report['objects'], 103)
        self.assertEqual(report['known_bytes'], 1032)
        self.assertEqual(report['by_date']['2020-01-01']['known_bytes'], 1005)
        self.assertEqual(report['by_date']['2026-10-18']['known_bytes'], 20)
        self.assertTrue(report['bytes_complete'])
        self.assertTrue(all(method != 'DELETE' for method, _ in calls))

    def test_missing_size_is_reported_as_unknown_not_zero_usage(self):
        class Fake(archive.Storage):
            def __init__(self):
                pass
            def list_all(self, prefix):
                return [{'name': 'unknown.json', 'id': '1', 'metadata': None}]
        report = Fake().usage()
        self.assertFalse(report['bytes_complete'])
        self.assertEqual(report['objects'], 1)
        self.assertEqual(report['unknown_size_objects'], 1)

    def test_delete_is_rejected_before_network_access(self):
        store = archive.Storage('https://test.supabase.co', 'test-placeholder')
        with patch.object(archive.urllib.request, 'urlopen') as network:
            with self.assertRaises(ValueError):
                store.request('DELETE', 'object/' + archive.BUCKET, {'prefixes': ['old.json']})
            network.assert_not_called()

    def test_upload_does_not_overwrite_or_expire_existing_objects(self):
        store = archive.Storage('https://test.supabase.co', 'test-placeholder')
        with patch.object(store, 'request') as request:
            store.upload('2020-01-01/new.json', b'{}')
        request.assert_called_once_with('POST', 'object/' + archive.BUCKET + '/2020-01-01/new.json', b'{}')

    def test_refuses_untrusted_credential_destination(self):
        with self.assertRaises(ValueError):
            archive.Storage('https://example.com', 'test-placeholder')

    def test_creates_missing_private_bucket_without_expiry_or_overwrite(self):
        store=archive.Storage('https://test.supabase.co','test-placeholder')
        with patch.object(store,'request',side_effect=[[],{'name':archive.BUCKET},{'id':archive.BUCKET,'public':False}]) as request:
            store.ensure_private_bucket()
        self.assertEqual(request.call_args_list[1].args,('POST','bucket',{'id':archive.BUCKET,'name':archive.BUCKET,'public':False}))
        self.assertEqual(len(request.call_args_list),3)

    def test_existing_public_bucket_is_rejected_without_modifying_it(self):
        store=archive.Storage('https://test.supabase.co','test-placeholder')
        with patch.object(store,'request',side_effect=[[{'id':archive.BUCKET}],{'id':archive.BUCKET,'public':True}]) as request:
            with self.assertRaises(ValueError):store.ensure_private_bucket()
        self.assertTrue(all(call.args[0]=='GET' for call in request.call_args_list))

    def test_uploaded_snapshot_is_read_back_through_authenticated_route(self):
        store=archive.Storage('https://test.supabase.co','test-placeholder')
        data=b'{"target_date":"2026-10-18","races":[{"no":1}]}'
        with patch.object(store,'request',return_value={'target_date':'2026-10-18','races':[{'no':1}]}) as request:
            store.verify('2026-10-18/new.json',data)
        request.assert_called_once_with('GET','object/authenticated/'+archive.BUCKET+'/2026-10-18/new.json')

    def test_mismatched_readback_stops_publication_without_deleting_the_snapshot(self):
        store=archive.Storage('https://test.supabase.co','test-placeholder')
        with patch.object(store,'request',return_value={'races':[]}) as request:
            with self.assertRaises(ValueError):store.verify('2026-10-18/new.json',b'{"races":[1]}')
        self.assertTrue(all(call.args[0]=='GET' for call in request.call_args_list))


if __name__ == '__main__':
    unittest.main()
