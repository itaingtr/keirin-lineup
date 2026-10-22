// Runs against the generated real card. No login, posting, or external requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const dir = path.resolve(process.argv[2] || path.join(__dirname, '../site'));
const project = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const feed = JSON.parse(fs.readFileSync(path.join(dir, 'odds.json'), 'utf8'));
const snapshots = new Map(feed.results.filter(x=>x.ok).map(x=>[x.snapshot.race_key,x.snapshot]));
const pause = () => new Promise(resolve=>setTimeout(resolve,25));
const raw = JSON.parse(html.match(/const races=(.*);\nconst body=/)[1]);
let checked = 0;

async function check(url) {
  const fetched = [];
  const errors = [];
  const dom = new JSDOM(html, {url,runScripts:'dangerously',pretendToBeVisual:true,beforeParse(window) {
    window.matchMedia = () => ({matches:false});
    window.fetch = async input => {
      const target = new URL(String(input),window.document.baseURI);
      fetched.push(target.href);
      assert.equal(target.hostname,'preview.example');
      assert.ok(['/odds-config.json','/odds.json'].includes(target.pathname), target.href);
      return {ok:true,json:async()=>target.pathname.endsWith('odds-config.json') ? {endpoint:'./odds.json'} : feed};
    };
    window.addEventListener('error',event=>errors.push(event.error || event.message));
  }});
  const {window} = dom;
  for (const name of ['odds-current.js','odds-comparison.js']) window.eval(fs.readFileSync(path.join(project,'site',name),'utf8'));
  await pause();
  const rows = [...window.document.getElementById('rows').children];
  assert.equal(rows.length,raw.length);
  for (let i=0;i<rows.length;i++) {
    const row = rows[i], race = raw[i];
    const source = new URL(race.source);
    assert.equal(source.hostname,'www.winticket.jp');
    const video = row.querySelector('.video-link:not(.live-link)');
    assert.equal(video.href,`https://www.winticket.jp/keirin/${race.venueSlug}/raceresult/${race.meetingStart}${race.venueCode}/${race.meetingDay}/${race.race}`);
    assert.equal(row.querySelector('.live-link').href,`https://www.winticket.jp/keirin/${race.venueSlug}/live`);
    row.querySelector('.odds-toggle').click();
    await pause();
    const snapshot = snapshots.get(source.pathname);
    if (snapshot.status !== 'snapshot') continue;
    const tables = [...row.querySelectorAll('.exacta-matrix')];
    assert.equal(tables.length,2);
    assert.equal(tables[0].dataset.oddsOrder,'number');
    assert.equal(tables[1].dataset.oddsOrder,'lineup');
    for(const table of tables) {
      assert.equal(table.querySelectorAll('td[data-combination]').length,snapshot.odds.length);
      for(const quote of snapshot.odds) {
        const cell = table.querySelector(`[data-combination="${quote.first}-${quote.second}"]`);
        assert.ok(cell);
        const expected = quote.value===null ? '—' : quote.value>=100 ? String(Math.floor(quote.value)) : quote.value.toFixed(1);
        assert.equal(cell.textContent,expected);
        checked++;
      }
      for (const player of race.players) {
        const column = [...table.querySelectorAll('thead .exacta-column-rider')].find(x=>x.querySelector('.exacta-number')?.textContent===String(player.no));
        assert.ok(column);
        assert.equal(column.querySelector('.exacta-score').textContent,player.score);
      }
    }
    assert.ok(row.querySelector('[data-odds-order="number"]').closest('figure').querySelector('.odds-status'));
  }
  const search = window.document.querySelector('#search');
  search.value = raw[0].players[0].name;
  search.dispatchEvent(new window.Event('input'));
  await pause();
  assert.ok(window.document.getElementById('rows').children.length>=1);
  assert.ok(fetched.every(u=>!u.includes('kdreams')));
  assert.deepEqual(errors,[]);
  dom.window.close();
}

(async()=>{
  await check('https://preview.example/');
  const date = html.match(/KEIRIN · (\d{4})\.(\d{2})\.(\d{2})/).slice(1).join('');
  await check(`https://preview.example/line${date}.html/`);
  console.log(`PASS ${raw.length} real races; ${checked} cell checks across both views and both URLs; search and WINTICKET video links`);
})().catch(error=>{console.error(error);process.exitCode=1;});
