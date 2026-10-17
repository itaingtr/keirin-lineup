"""Read-only K Dreams exacta collector for the site's deployment backend."""
import argparse
from datetime import datetime, timezone
from html.parser import HTMLParser
import http.cookiejar
import json
import math
from pathlib import Path
import re
import time
import urllib.error
import urllib.parse
import urllib.request


class Node:
    def __init__(self, tag='', attrs=()):
        self.tag, self.attrs, self.children = tag, dict(attrs), []
    def text(self):
        return ''.join(child if isinstance(child, str) else child.text() for child in self.children)
    def find_all(self, tag=None):
        for child in self.children:
            if isinstance(child, Node):
                if tag is None or child.tag == tag:
                    yield child
                yield from child.find_all(tag)


class Document(HTMLParser):
    VOID = {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.root = Node()
        self.stack = [self.root]
        self.feed(html)
    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs)
        self.stack[-1].children.append(node)
        if tag not in self.VOID:
            self.stack.append(node)
    def handle_startendtag(self, tag, attrs):
        self.stack[-1].children.append(Node(tag, attrs))
    def handle_endtag(self, tag):
        for index in range(len(self.stack)-1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                break
    def handle_data(self, data):
        self.stack[-1].children.append(data)


def source_url(value):
    parsed = urllib.parse.urlsplit(value)
    if parsed.scheme != 'https' or parsed.hostname not in ('keirin.kdreams.jp','my.keirin.kdreams.jp') or parsed.username or parsed.password or parsed.port:
        raise ValueError('Only public HTTPS K Dreams race URLs are accepted')
    if not re.fullmatch(r'/[a-z]+/racedetail/\d{16}/', parsed.path):
        raise ValueError('Expected a race detail URL')
    return urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, parsed.path, 'pageType=odds', ''))


def rider_number(node):
    classes = node.attrs.get('class', '').split()
    number = next((int(c[1:]) for c in classes if re.fullmatch(r'n[1-9]', c)), None)
    text = re.sub(r'\s+', '', node.text())
    if number is None and re.fullmatch(r'[1-9]', text):
        number = int(text)
    return number


def parse_exacta(html, url, observed_at=None):
    url = source_url(url)
    key = urllib.parse.urlsplit(url).path
    doc = Document(html).root
    canonicals = [n.attrs.get('href','') for n in doc.find_all('link') if n.attrs.get('rel') == 'canonical']
    if canonicals and any(urllib.parse.urlsplit(u).path != key for u in canonicals):
        raise ValueError('Canonical race URL does not match requested race')
    sections = [n for n in doc.find_all() if n.attrs.get('id') == 'JS_ODDSCONTENTS_2shatan']
    if len(sections) != 1:
        raise ValueError('Exacta section absent or ambiguous')
    tables = [n for n in sections[0].find_all('table') if 'odds_table' in n.attrs.get('class','').split()]
    if len(tables) != 1:
        raise ValueError('Expected one exacta matrix')
    rows = list(tables[0].find_all('tr'))
    header_rows = []
    for row in rows:
        headers = [rider_number(n) for n in row.children if isinstance(n,Node) and n.tag == 'th']
        headers = [n for n in headers if n is not None]
        cells = [n for n in row.children if isinstance(n,Node) and n.tag == 'td']
        if len(headers) >= 2 and not cells:
            header_rows.append(headers)
    if not header_rows:
        raise ValueError('Missing exacta column numbers')
    numbers = header_rows[0]
    if len(set(numbers)) != len(numbers) or not 2 <= len(numbers) <= 9:
        raise ValueError('Duplicate or invalid column numbers')
    output, seen = [], set()
    for row in rows:
        headers = [n for n in row.children if isinstance(n,Node) and n.tag == 'th']
        cells = [n for n in row.children if isinstance(n,Node) and n.tag == 'td']
        # K Dreams places first-place riders across the top and second-place
        # riders down the left. A cell in column 1, row 5 is 1 -> 5.
        second = rider_number(headers[0]) if headers else None
        if second is None or not cells:
            continue
        if second not in numbers or len(cells) != len(numbers):
            raise ValueError('Unexpected matrix dimensions')
        for first, cell in zip(numbers, cells):
            if first == second:
                continue
            pair = (first, second)
            if pair in seen:
                raise ValueError('Duplicate exacta combination')
            seen.add(pair)
            value = re.sub(r'\s+', '', cell.text()).replace(',', '')
            if re.fullmatch(r'\d+(?:\.\d+)?', value):
                value = float(value)
                if not math.isfinite(value) or value <= 0:
                    raise ValueError('Invalid numeric odds')
            elif value in ('-', '--', '―', '—', '欠場', '発売なし', '未発売'):
                value = None
            else:
                raise ValueError('Unrecognized odds cell; refusing to invent missing values')
            output.append({'first': first, 'second': second, 'value': value})
    if seen != {(a,b) for a in numbers for b in numbers if a != b}:
        raise ValueError('Incomplete exacta matrix')
    title = next((n.text().strip() for n in doc.find_all('title')), '')
    return {'race_key':key,'bet_type':'exacta','status':'snapshot','parser_version':2,
            'observed_at':observed_at or datetime.now(timezone.utc).isoformat(),
            'source_url':url,'rider_numbers':sorted(numbers),'odds':output,'source_title':title}


def fetch_exacta(url):
    url = source_url(url)
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    request = urllib.request.Request(url, headers={'User-Agent':'KeirinLineup/1.0 (+https://github.com/itaingtr/keirin-lineup)', 'Accept':'text/html'})
    with opener.open(request, timeout=30) as response:
        # TLS verification stays enabled; no login, betting or submission is performed.
        raw = response.read(6_000_001)
        if len(raw) > 6_000_000:
            raise ValueError('Unexpectedly large response')
        html = raw.decode(response.headers.get_content_charset() or 'utf-8')
        final = urllib.parse.urlsplit(response.url)
        if final.hostname not in ('keirin.kdreams.jp','my.keirin.kdreams.jp'):
            raise ValueError('Unexpected redirect destination')
        return parse_exacta(html, url)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', action='append', default=[])
    parser.add_argument('--page', type=Path, help='Collect the races already listed in our generated page')
    parser.add_argument('--report', type=Path, required=True)
    args = parser.parse_args()
    urls = list(args.url)
    if args.page:
        from export_races import export
        urls.extend(race['source'] for race in export(args.page.read_text())['races'])
    urls = list(dict.fromkeys(urls))
    if not urls:
        parser.error('Provide --url or --page')
    report = {'checked_at':datetime.now(timezone.utc).isoformat(), 'results':[]}
    for index, url in enumerate(urls):
        if index:
            time.sleep(2)
        item = {'source_url':url}
        try:
            item.update(ok=True, snapshot=fetch_exacta(url))
        except Exception as error:
            item.update(ok=False, error_type=type(error).__name__, error=str(error))
        report['results'].append(item)
        print(json.dumps({'url':url,'ok':item['ok'],'combinations':len(item.get('snapshot',{}).get('odds',[])),
                          'error':item.get('error')},ensure_ascii=False))
    args.report.parent.mkdir(parents=True,exist_ok=True)
    args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2,allow_nan=False)+'\n')


if __name__ == '__main__':
    main()
