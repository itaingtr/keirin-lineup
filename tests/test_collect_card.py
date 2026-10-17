import sys
from datetime import date
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).parents[1] / 'scripts'))
import collect_card as collector
from collect_exacta import Document

URL='https://keirin.kdreams.jp/kochi/racedetail/7420261017020006/'
MEETING={'venue':'高知','grade_code':2,'night':False}


def fixture():
    # Synthetic identities with the source's observed semantic columns.
    header='<tr><th>直近4ヶ月の成績</th></tr><tr>'+''.join('<th>'+label+'</th>' for label in ['競走得点','S','B','逃','捲','差','マ'])+'</tr>'
    rows=[]
    for number in [1,2,3]:
        # Frame-number rowspans mean some rider rows have no bracket cell.
        bracket='<td class="bracket">1</td>' if number==1 else ''
        rows.append('<tr><td class="tip">'+('◎' if number==1 else '')+'</td>'+bracket+'<td class="num">'+str(number)+'</td><td class="rider">表示'+str(number)+' 東 京/33/100</td>'+''.join('<td>'+value+'</td>' for value in ['S2','逃','3.92','105.75','2','11','4','3','2','1'])+'</tr>')
    lineup='<div class="line_position"><span class="icon_p"><span class="p000">←</span></span>'
    for number in [1,2,3]:
        if number==3:lineup+='<span class="icon_p space"></span>'
        lineup+='<span class="icon_p"><span class="p00'+str(number)+'">'+str(number)+'</span><span class="p105">追込</span></span>'
    lineup+='</div>'
    return '<html><head><link rel="canonical" href="'+URL+'"><title>高知競輪 レース詳細 | 開催名 6R Ｓ級一般 | 2026年10月18日</title></head><body>発走予定 12:58<table class="racecard_table">'+header+''.join(rows)+'<tr><td>誘導員</td></tr></table>'+lineup+'</body></html>'


class CardTests(unittest.TestCase):
    def test_rowspans_names_marks_and_statistic_meanings(self):
        result=collector.parse_card(Document(fixture()).root,URL,MEETING)
        self.assertEqual(result['race'],6)
        self.assertEqual(result['start_time'],'12:58')
        self.assertEqual(result['lineup'],'12/3')
        self.assertEqual(len(result['players']),3)
        for player in result['players']:
            self.assertEqual(player['period'],100)
            self.assertEqual(player['score'],105.75)
            self.assertEqual(player['stats'],[2,11,4,3,2,1])
            self.assertEqual(player['name'],'表示'+str(player['no']))
        self.assertEqual(result['players'][0]['mark'],'◎')

    def test_competition_position_and_spaces_preserve_every_rider(self):
        source='<div class="line_position"><span class="icon_p"><span class="p001">1</span><span class="p002">2</span></span><span class="icon_p"><span class="p003">3</span></span><span class="icon_p space"></span></div>'
        self.assertEqual(collector.source_lineup(Document(source).root,[1,2,3]),'(12)3')
        with self.assertRaises(ValueError):collector.source_lineup(Document(source).root,[1,2,3,4])
        with self.assertRaises(collector.MissingLineup):collector.source_lineup(Document('<div class="line_position"></div>').root,[1,2,3])

    def test_wrong_race_unknown_columns_and_missing_values_are_rejected(self):
        for source in [fixture().replace(URL,URL.replace('0006','0005')),fixture().replace('<th>B</th>','<th>X</th>'),fixture().replace('<td>11</td>','<td>未発表</td>'),fixture().replace('105.75','--')]:
            with self.assertRaises(ValueError):collector.parse_card(Document(source).root,URL,MEETING)

    def test_a_class_is_excluded_without_inventing_s_class(self):
        self.assertIsNone(collector.parse_card(Document(fixture().replace('Ｓ級一般','Ａ級一般')).root,URL,MEETING))

    def test_calendar_grades_urls_and_actual_race_date(self):
        source='<div class="raceinfo_table"><table><tr><td>高知競輪</td><td><span class="icon_grade gr2"></span></td><td></td><td><a href="'+URL+'">6R</a><a href="'+URL+'">6R</a></td></tr></table></div>'
        meetings=collector.schedule(Document(source).root,'https://keirin.kdreams.jp/',date(2026,10,18))
        self.assertEqual(meetings,[{**MEETING,'urls':[URL]}])
        with self.assertRaises(ValueError):collector.schedule(Document(source).root,'https://keirin.kdreams.jp/',date(2026,10,19))
        with self.assertRaises(ValueError):collector.schedule(Document(source.replace('gr2','unknown')).root,'https://keirin.kdreams.jp/',date(2026,10,18))


if __name__=='__main__':unittest.main()
