"""Read K Dreams public card information for review before publishing a new day."""
import argparse
from datetime import datetime, timezone
import html
from pathlib import Path
import re
import time
import unicodedata
import urllib.parse
import urllib.request
from collect_exacta import Document, Node
from render_races import SOURCE, parse_lineup as validate_lineup, validate, write_pages


def clean(value):
    return re.sub(r'\s+', ' ', value).strip()


def fetch(url):
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != 'https' or parsed.hostname not in ('keirin.kdreams.jp', 'my.keirin.kdreams.jp'):
        raise ValueError('Unexpected card source')
    request = urllib.request.Request(url, headers={'User-Agent': 'KeirinLineup/1.0 (+https://github.com/itaingtr/keirin-lineup)'})
    with urllib.request.urlopen(request, timeout=30) as response:
        if urllib.parse.urlsplit(response.url).hostname not in ('keirin.kdreams.jp', 'my.keirin.kdreams.jp'):
            raise ValueError('Unexpected card redirect')
        raw = response.read(6_000_001)
        if len(raw) > 6_000_000:
            raise ValueError('Response too large')
        return Document(raw.decode(response.headers.get_content_charset() or 'utf-8')).root


def cells(row):
    return [node for node in row.children if isinstance(node, Node) and node.tag in ('td', 'th')]


def esc(value):
    return html.escape(str(value))


def classes(node):
    return node.attrs.get('class', '').split()


def compact(value):
    return re.sub(r'\s+', '', unicodedata.normalize('NFKC', value))


class MissingLineup(ValueError):
    pass


def schedule(doc, base, target):
    meetings = []
    containers = [node for node in doc.find_all('div') if 'raceinfo_table' in classes(node)]
    if len(containers) != 1:
        raise ValueError('Expected one requested-day race schedule')
    for row in containers[0].find_all('tr'):
        links = []
        for anchor in row.find_all('a'):
            url = urllib.parse.urljoin(base, anchor.attrs.get('href', ''))
            match = SOURCE.fullmatch(url)
            if match:
                from datetime import date, timedelta
                start, day = match[2], int(match[3])
                actual = date.fromisoformat(f'{start[:4]}-{start[4:6]}-{start[6:]}') + timedelta(days=day-1)
                if actual != target:
                    raise ValueError('Schedule contains a race from another day')
                links.append(url)
        if not links:
            continue
        grades = {int(token[2:]) for node in row.find_all() for token in classes(node) if re.fullmatch(r'gr[1-6]', token)}
        if len(grades) != 1:
            raise ValueError('Missing or ambiguous meeting grade')
        values = cells(row)
        venue = clean(values[0].text()).removesuffix('競輪')
        night = any('s2' in classes(node) or 's3' in classes(node) for node in row.find_all())
        meetings.append({'venue':venue, 'grade_code':grades.pop(), 'night':night, 'urls':list(dict.fromkeys(links))})
    if not meetings:
        raise ValueError('No published meetings for requested date')
    return meetings


def source_lineup(doc, numbers):
    positions = [node for node in doc.find_all('div') if 'line_position' in classes(node)]
    if len(positions) != 1:
        raise MissingLineup('Lineup has not been published')
    groups, units = [], []
    for node in positions[0].children:
        if not isinstance(node, Node):
            continue
        if 'space' in classes(node):
            if units:
                groups.append(''.join(units)); units = []
            continue
        riders = [int(token[1:]) for child in node.find_all() for token in classes(child) if re.fullmatch(r'p00[1-9]', token)]
        if riders:
            if 'icon_p' not in classes(node):
                raise ValueError('Unexpected lineup position structure')
            units.append('(' + ''.join(map(str,riders)) + ')' if len(riders)>1 else str(riders[0]))
    if units:
        groups.append(''.join(units))
    if not groups:
        raise MissingLineup('Lineup has not been published')
    result = '/'.join(groups)
    validate_lineup(result, numbers)
    return result


PREFECTURES = '北海道 青森 岩手 宮城 秋田 山形 福島 茨城 栃木 群馬 埼玉 千葉 東京 神奈川 新潟 富山 石川 福井 山梨 長野 岐阜 静岡 愛知 三重 滋賀 京都 大阪 兵庫 奈良 和歌山 鳥取 島根 岡山 広島 山口 徳島 香川 愛媛 高知 福岡 佐賀 長崎 熊本 大分 宮崎 鹿児島 沖縄 外国'.split()
RIDER = re.compile(r'(.+?)(?:' + '|'.join(PREFECTURES) + r')/\d+/(\d+)')


def parse_card(doc, url, meeting):
    canonicals = [node.attrs.get('href','') for node in doc.find_all('link') if node.attrs.get('rel')=='canonical']
    if canonicals and any(urllib.parse.urlsplit(value).path != urllib.parse.urlsplit(url).path for value in canonicals):
        raise ValueError('Card canonical does not match requested race')
    title = next((clean(node.text()) for node in doc.find_all('title')), '')
    kind = re.search(r'\b(\d+)R\s+([ＳS]級[^|]+?)\s*\|', title)
    if not kind:
        if re.search(r'\d+R\s+[ＡAＬL]級', title):
            return None
        raise ValueError('Unrecognized race class in source title')
    tables = [node for node in doc.find_all('table') if 'racecard_table' in classes(node) and 'none' not in classes(node)]
    tables = [node for node in tables if '直近4ヶ月の成績' in compact(node.text())]
    if len(tables) != 1:
        raise ValueError('Missing primary current-statistics card')
    header_rows = list(tables[0].find_all('tr'))
    if not any([compact(cell.text()) for cell in cells(row)][:7] == ['競走得点','S','B','逃','捲','差','マ'] for row in header_rows):
        raise ValueError('Unexpected current-statistic column meanings')
    players = []
    for row in header_rows:
        values = cells(row)
        number = next((compact(node.text()) for node in values if 'num' in classes(node)), None)
        if number is None:
            continue
        if not re.fullmatch(r'[1-9]',number):
            raise ValueError('Invalid car number in source')
        rider_indices = [i for i,node in enumerate(values) if 'rider' in classes(node)]
        if len(rider_indices)!=1:
            raise ValueError('Missing rider identity')
        index=rider_indices[0]
        identity=RIDER.fullmatch(compact(values[index].text()))
        if not identity:
            raise ValueError('Unrecognized rider name / prefecture / period')
        if len(values)<index+11:
            raise ValueError('Incomplete statistics for rider')
        score=compact(values[index+4].text())
        if not re.fullmatch(r'\d+(?:\.\d+)?',score):
            raise ValueError('Missing competition score')
        stats=[compact(node.text()) for node in values[index+5:index+11]]
        if not all(re.fullmatch(r'\d+',value) for value in stats):
            raise ValueError('Missing S/B/finishing statistics')
        mark=next((clean(node.text()) for node in values if 'tip' in classes(node)), None)
        if mark is None:
            raise ValueError('Missing prediction-mark column')
        players.append({'no':int(number),'name':identity[1],'score':float(score),'period':int(identity[2]),'mark':mark,'stats':list(map(int,stats))})
    if not players:
        raise ValueError('No riders published for S-class card')
    lineup=source_lineup(doc,[player['no'] for player in players])
    flat=clean(doc.text())
    start=re.search(r'発走予定\s*(\d{1,2}:\d{2})',flat)
    if not start:
        raise ValueError('Missing published start time')
    return {'venue':meeting['venue'],'race':int(kind[1]),'source':url,'race_type':kind[2],
            'grade_code':meeting['grade_code'],'start_time':start[1].zfill(5),'lineup':lineup,'players':players}


def prepare_day(day, output_site, review):
    target=datetime.strptime(day,'%Y-%m-%d').date()
    calendar=f'https://keirin.kdreams.jp/racecard/{target:%Y/%m/%d}/'
    meetings=schedule(fetch(calendar),calendar,target)
    races, observations, skipped = [], [], []
    for meeting in meetings:
        if meeting['grade_code']==1:
            continue  # FII meetings have no S-class races.
        for url in meeting['urls']:
            time.sleep(2)
            doc=fetch(url)
            observed=datetime.now(timezone.utc).isoformat()
            try:
                race=parse_card(doc,url,meeting)
            except MissingLineup as error:
                if not meeting['night']:
                    raise
                skipped.append((url,str(error)))
                continue
            observations.append((url,observed))
            if race is not None:
                races.append(race)
            print(f'Checked {url}: ' + ('S-class confirmed' if race else 'A/L class excluded'),flush=True)
    dataset={'schema_version':1,'target_date':day,'expected_races':len(races),'races':races}
    validate(dataset)
    write_pages(dataset,output_site)
    details=['<!doctype html><html lang="ja"><meta charset="utf-8"><h1>'+esc(day)+' 出走表取得結果</h1>',
             '<p>'+str(len(races))+' S級レース・'+str(sum(len(r['players']) for r in races))+'人</p>',
             '<table><tr><th>取得元</th><th>取得時刻</th></tr>']
    details.extend('<tr><td><a href="'+esc(url)+'">'+esc(url)+'</a></td><td>'+esc(stamp)+'</td></tr>' for url,stamp in observations)
    details.append('</table><h2>並び未発表のナイター</h2>')
    details.extend('<p>'+esc(url+' '+reason)+'</p>' for url,reason in skipped)
    review.write_text('\n'.join(details)+'</html>\n')
    print(f'Prepared {day}: {len(races)} races, {sum(len(r["players"]) for r in races)} riders; {len(skipped)} unpublished night lineups excluded',flush=True)


def review_table(table):
    rows = []
    for row in table.find_all('tr'):
        values = cells(row)
        if values:
            rows.append('<tr>' + ''.join('<td title="' + esc(node.attrs.get('class', '') + ' | ' + ' ; '.join(str(child.attrs) for child in node.find_all() if child.attrs)) + '">' + esc(clean(node.text())) + '</td>' for node in values) + '</tr>')
    return '<table border="1"><caption>' + esc(table.attrs.get('class', '')) + '</caption>' + ''.join(rows) + '</table>'


def inspect_day(day, output):
    date = datetime.strptime(day, '%Y-%m-%d').date()
    url = f'https://keirin.kdreams.jp/racecard/{date:%Y/%m/%d}/'
    doc = fetch(url)
    links = {}
    for node in doc.find_all('a'):
        source = urllib.parse.urljoin(url, node.attrs.get('href', ''))
        if re.fullmatch(r'https://(?:my\.)?keirin\.kdreams\.jp/[a-z]+/racedetail/\d{16}/', source):
            links[source] = clean(node.text())
    if not links:
        raise ValueError('No race links found for requested date')
    parts = ['<!doctype html><html lang="ja"><meta charset="utf-8"><title>出走表の確認</title>', '<h1>' + esc(day) + ' 出走表の確認</h1>', '<p>' + esc(datetime.now(timezone.utc).isoformat()) + '</p>']
    for div in doc.find_all('div'):
        if 'raceinfo_table' in div.attrs.get('class', '').split():
            parts.extend(review_table(table) for table in div.find_all('table'))
    parts.append('<h2>掲載レース</h2><ul>' + ''.join('<li><a href="' + esc(source) + '">' + esc(label or source) + '</a></li>' for source, label in links.items()) + '</ul>')
    samples = []
    for prefix, race in [('27', '0001'), ('74', '0006')]:
        chosen = next((source for source in links if source.split('/')[-2].startswith(prefix) and source.split('/')[-2].endswith(race)), None)
        if chosen:
            samples.append(chosen)
    if not samples:
        samples = list(links)[:2]
    for source in samples:
        time.sleep(2)
        detail = fetch(source)
        parts.append('<h2><a href="' + esc(source) + '">' + esc(source) + '</a></h2>')
        title = next((clean(node.text()) for node in detail.find_all('title')), '')
        parts.append('<p>' + esc(title) + '</p>')
        for table in detail.find_all('table'):
            if '競走得点' in table.text() or 'racecard' in table.attrs.get('class', ''):
                parts.append(review_table(table))
        parts.append('<h3>並び表示の確認</h3>')
        for node in detail.find_all():
            classes = node.attrs.get('class', '')
            if 'line_position' in classes.split():
                parts.append('<h4>並びの区切り</h4>')
                for child in node.children:
                    if isinstance(child, Node):
                        parts.append('<pre>' + esc(child.tag + ' ' + str(child.attrs) + ' : ' + clean(child.text())) + '</pre>')
            if 'line' in classes.lower() or 'line' in node.attrs.get('id', '').lower():
                if len(node.text()) < 500:
                    parts.append('<p>' + esc(node.tag + ' ' + classes + ' ' + node.attrs.get('id', '') + ' : ' + clean(node.text())) + '</p>')
                    for child in node.find_all():
                        if clean(child.text()) and len(child.text()) < 60:
                            parts.append('<div>' + esc(child.tag + ' ' + child.attrs.get('class', '') + ' : ' + clean(child.text())) + '</div>')
        parts.append('<h3>開催表示</h3>')
        for node in detail.find_all('img'):
            if any(word in node.attrs.get('src', '').lower() for word in ('grade', 'g1', 'g2', 'g3', 'f1', 'f2')):
                parts.append('<p>' + esc(node.attrs.get('alt', '') + ' ' + node.attrs.get('src', '')) + '</p>')
        flat = clean(detail.text())
        for word in ('並び予想', '発走予定', 'Ｓ級', 'S級'):
            index = flat.find(word)
            if index >= 0:
                parts.append('<p>' + esc(flat[max(0, index-50):index+350]) + '</p>')
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text('\n'.join(parts) + '</html>\n')
    print(f'Reviewed {len(links)} scheduled race links and {len(samples)} sample cards for {day}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--date', required=True)
    parser.add_argument('--review', type=Path, required=True)
    parser.add_argument('--output-site', type=Path)
    args = parser.parse_args()
    if args.output_site:
        prepare_day(args.date,args.output_site,args.review)
    else:
        inspect_day(args.date, args.review)
