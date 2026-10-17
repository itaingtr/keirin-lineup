from copy import deepcopy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('renderer', Path(__file__).parents[1] / 'scripts/render_races.py')
renderer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(renderer)


def fixture():
    return {'schema_version': 1, 'target_date': '2026-10-17', 'expected_races': 1, 'races': [
        {'venue': 'テスト場', 'race': 1, 'source': 'https://my.keirin.kdreams.jp/test/racedetail/2720261017010001/',
         'race_type': 'Ｓ級予選', 'grade_code': 3, 'start_time': '15:23', 'lineup': '1(23)/4',
         'players': [{'no': n, 'name': f'選手{n}', 'score': 100.75+n, 'period': 100+n,
                      'mark': '◎' if n == 1 else '', 'stats': [n, 10+n, n, 5-n, 0, 0]} for n in range(1, 5)]}]}


class RendererTests(unittest.TestCase):
    def test_contests_and_complete_statistics(self):
        _, races, _ = renderer.validate(fixture())
        self.assertEqual(races[0]['groups'][0][1], {'type': 'contest', 'riders': [2, 3]})
        self.assertEqual(races[0]['players'][0]['score'], '101')
        self.assertEqual(races[0]['players'][0]['rawScore'], 101.75)
        self.assertEqual(races[0]['players'][0]['stats'], [1, 11, 1, 4, 0, 0])

    def test_rejects_missing_duplicate_or_unknown_riders(self):
        for lineup in ['1-2/3', '1-2-2/3-4', '1-2/3-5', '1(23/4', '1//2-3-4']:
            d = fixture(); d['races'][0]['lineup'] = lineup
            with self.subTest(lineup=lineup), self.assertRaises(ValueError):
                renderer.validate(d)

    def test_rejects_wrong_dates_incomplete_counts_and_unsafe_links(self):
        for edit in [lambda d: d.update(expected_races=2), lambda d: d.update(target_date='2026-10-18'),
                     lambda d: d['races'][0].update(source='javascript:alert(1)'),
                     lambda d: d['races'][0]['players'][0].update(stats=[1, 2]),
                     lambda d: d['races'][0]['players'][0].update(score=float('nan')),
                     lambda d: d['races'][0]['players'][0].update(no=2)]:
            d = fixture(); edit(d)
            with self.assertRaises(ValueError):
                renderer.validate(d)

    def test_actual_race_day_not_meeting_start(self):
        d = fixture();d['target_date'] = '2026-10-19'
        d['races'][0]['source'] = 'https://my.keirin.kdreams.jp/test/racedetail/2720261017030001/'
        renderer.validate(d)

    def test_grade_order(self):
        d=fixture(); low=deepcopy(d['races'][0]);low.update(source='https://my.keirin.kdreams.jp/test/racedetail/7420261017010001/',grade_code=2,venue='別場')
        d['races'].insert(0,low);d['expected_races']=2
        _, races, _ = renderer.validate(d)
        self.assertEqual(races[0]['venue'], 'テスト場')

    def test_private_text_cannot_break_out_of_script(self):
        d=fixture();d['races'][0]['players'][0]['name']='</script><img src=x onerror=alert(1)>'
        output=renderer.render(d)
        self.assertNotIn('</script><img', output)
        self.assertIn('\\u003c/script\\u003e', output)
        self.assertIn('escapeHtml(Array.from(p.name)', output)
        self.assertNotIn('@@RACES@@',output)

    def test_only_target_and_index_are_replaced_and_repeated_output_matches(self):
        with tempfile.TemporaryDirectory() as directory:
            site=Path(directory);old=site/'line20261016.html'/'index.html';old.parent.mkdir();old.write_text('old page')
            renderer.write_pages(fixture(),site)
            first=(site/'index.html').read_bytes()
            renderer.write_pages(fixture(),site)
            self.assertEqual(first,(site/'index.html').read_bytes())
            self.assertEqual(first,(site/'line20261017.html'/'index.html').read_bytes())
            self.assertEqual(old.read_text(),'old page')
            self.assertIn('line20261018.html/',first.decode())
            self.assertIn('line20261016.html/',first.decode())

    def test_invalid_data_leaves_working_pages_untouched(self):
        with tempfile.TemporaryDirectory() as directory:
            site=Path(directory);(site/'index.html').write_text('working')
            d=fixture();d['races']=[];d['expected_races']=0
            with self.assertRaises(ValueError):renderer.write_pages(d,site)
            self.assertEqual((site/'index.html').read_text(),'working')


if __name__ == '__main__':
    unittest.main()
