"""Embed this existing static site into the dependency-free Sites Worker starter."""
import json
import mimetypes
from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[1]


def build():
    assets={}
    for file in sorted((ROOT/'site').rglob('*')):
        if not file.is_file() or file.suffix not in ('.html','.css','.js','.json'):continue
        if any(part.startswith('.') or 'snapshot' in part for part in file.relative_to(ROOT/'site').parts):
            raise ValueError('Private source files must not enter the viewer bundle')
        path='/'+file.relative_to(ROOT/'site').as_posix()
        assets[path]={'body':file.read_text(),'type':(mimetypes.guess_type(path)[0] or 'text/plain')+'; charset=utf-8'}
    allowed={};venues={}
    refs=[]
    for path, asset in assets.items():
        if path.endswith('/index.html') or path=='/index.html':
            match=re.search(r'const races=(.*);\nconst body=',asset['body'])
            if match:
                for race in json.loads(match[1]):
                    refs.append({'source_url':race['source'].replace('/racecard/','/raceresult/')})
                    refs.extend({'source_url':result['result_url']} for player in race['players']
                                for result in player.get('meetingResults',[]))
        if path.endswith('/viewer.json'):
            refs.extend(json.loads(asset['body'])['results'])
    for item in refs:
        source=item['source_url'].replace('/raceresult/','/racecard/')
        match=re.fullmatch(r'https://www\.winticket\.jp/keirin/([a-z]+)/racecard/(\d{8})(\d{2})/(\d)/(\d{1,2})',source)
        if not match:raise ValueError('Unexpected source in media allowlist')
        slug,start,code,day,number=match.groups()
        from datetime import date,timedelta
        day_date=date.fromisoformat(f'{start[:4]}-{start[4:6]}-{start[6:]}')+timedelta(days=int(day)-1)
        key=source.replace('https://www.winticket.jp','').replace('/racecard/','/raceresult/')
        allowed[key]={'source':source,'cup':start+code,'day':int(day),'number':int(number),'id':f'{int(number):02}{code}{day_date:%Y%m%d}'}
        venues[code]={'slug':slug,'code':code}
    prelude='const ASSETS='+json.dumps(assets,ensure_ascii=False,separators=(',',':'))+';\nconst ALLOWED_RACES='+json.dumps(allowed,separators=(',',':'))+';\nconst VENUES='+json.dumps(venues,separators=(',',':'))+';\n'
    (ROOT/'worker/index.js').write_text(prelude+(ROOT/'worker/runtime.js').read_text())
    print(f'Embedded {len(assets)} assets and {len(allowed)} allowed race identities')


if __name__=='__main__':build()
