import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('collector',Path(__file__).parents[1]/'scripts/collect_exacta.py')
collector=importlib.util.module_from_spec(spec);spec.loader.exec_module(collector)
URL='https://my.keirin.kdreams.jp/shizuoka/racedetail/3820261015030009/'

def page():
    # Small synthetic fixture for structure only; these are not live odds.
    head=''.join(f'<th class="n{n}">{n}</th>' for n in [1,2,3])
    rows=''.join('<tr><th class="n'+str(a)+'">'+str(a)+'</th>'+''.join('<td>'+('' if a==b else f'{a*10+b}.1')+'</td>' for b in [1,2,3])+'</tr>' for a in [1,2,3])
    return '<html><head><link rel="canonical" href="'+URL+'"><title>テスト表</title></head><body><div id="JS_ODDSCONTENTS_2shatan"><table class="odds_table"><tr><th></th>'+head+'<th></th></tr><tr><td class="rider n1"></td><td class="rider n2"></td><td class="rider n3"></td></tr>'+rows+'</table></div></body></html>'

class CollectorTests(unittest.TestCase):
    def test_complete_matrix_and_orientation(self):
        result=collector.parse_exacta(page(),URL,'2026-10-17T00:00:00Z')
        self.assertEqual(len(result['odds']),6)
        self.assertEqual(result['odds'][0],{'first':1,'second':2,'value':12.1})
        self.assertEqual(result['status'],'snapshot')
        self.assertEqual(result['source_url'],URL+'?pageType=odds')
    def test_wrong_race_and_incomplete_or_bad_values(self):
        for source in [page().replace(URL,URL.replace('0009','0008')),page().replace('<td>12.1</td>',''),page().replace('12.1','調整中'),page().replace('JS_ODDSCONTENTS_2shatan','JS_ODDSCONTENTS_3rentan')]:
            with self.assertRaises(ValueError):collector.parse_exacta(source,URL)
    def test_explicit_unavailable_not_guessed_numeric(self):
        result=collector.parse_exacta(page().replace('12.1','欠場'),URL)
        self.assertIsNone(result['odds'][0]['value'])
    def test_destination_is_fixed(self):
        for url in ['http://my.keirin.kdreams.jp/shizuoka/racedetail/3820261015030009/','https://example.com/','https://user:pass@my.keirin.kdreams.jp/shizuoka/racedetail/3820261015030009/']:
            with self.assertRaises(ValueError):collector.source_url(url)
if __name__=='__main__':unittest.main()
