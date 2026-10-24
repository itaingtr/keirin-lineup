// Runs against the generated real card. No login, posting, or external requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const dir = path.resolve(process.argv[2] || path.join(__dirname, '../site'));
const project = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const fixedBase=html.match(/<base href="\/(line\d{8}\.html)\/">/);
const assetPrefix=fixedBase?'/'+fixedBase[1]:'';
const dataDir=fixedBase?path.join(project,'site',fixedBase[1]):fs.existsSync(path.join(dir,'odds.json'))?dir:path.join(project,'site');
const feed = JSON.parse(fs.readFileSync(path.join(dataDir, 'odds.json'), 'utf8'));
const media = JSON.parse(fs.readFileSync(path.join(dataDir, 'media.json'), 'utf8'));
const config=JSON.parse(fs.readFileSync(path.join(dataDir,'odds-config.json'),'utf8'));
const sourceUrl=element=>element.dataset.sourceUrl||element.href;
const history = fs.existsSync(path.join(dataDir,'history.json'))?JSON.parse(fs.readFileSync(path.join(dataDir,'history.json'),'utf8')):{races:rawHistory()};
function rawHistory(){const card=JSON.parse(html.match(/const races=(.*);\nconst body=/)[1]);return card.map(r=>({source_url:r.source,players:r.players.map(p=>({no:p.no,meeting_results:p.meetingResults}))}));}
const snapshots = new Map(feed.results.filter(x=>x.ok).map(x=>[x.snapshot.race_key,x.snapshot]));
const pause = () => new Promise(resolve=>setTimeout(resolve,25));
const raw = JSON.parse(html.match(/const races=(.*);\nconst body=/)[1]);
let checked = 0;
let historyChecked = 0;

async function check(url) {
  const fetched = [];
  const errors = [];
  const dom = new JSDOM(html, {url,runScripts:'dangerously',pretendToBeVisual:true,beforeParse(window) {
    window.matchMedia = () => ({matches:false});
    window.fetch = async input => {
      const target = new URL(String(input),window.document.baseURI);
      fetched.push(target.href);
      if(target.hostname==='raw.githubusercontent.com'){assert.equal(target.origin+target.pathname,new URL(config.endpoint).origin+new URL(config.endpoint).pathname);}else{assert.equal(target.hostname,'preview.example');assert.ok(['/odds-config.json','/odds.json','/media.json'].includes(target.pathname.replace(assetPrefix,'')),target.href);}
      return {ok:true,json:async()=>target.pathname.endsWith('odds-config.json') ? config : target.pathname.endsWith('media.json') ? media : feed};
    };
    window.addEventListener('error',event=>errors.push(event.error || event.message));
  }});
  const {window} = dom;
  for (const name of ['predictions.js','odds-current.js','odds-comparison.js']) window.eval(fs.readFileSync(path.join(project,'site',name),'utf8'));
  await pause();
  const rows = [...window.document.getElementById('rows').children];
  assert.equal(rows.length,raw.length);
  for (let i=0;i<rows.length;i++) {
    const row = rows[i], race = raw[i];
    const source = new URL(race.source);
    assert.equal(source.hostname,'www.winticket.jp');
    const video = row.querySelector('.video-link:not(.live-link)');
    assert.equal(sourceUrl(video),`https://www.winticket.jp/keirin/${race.venueSlug}/raceresult/${race.meetingStart}${race.venueCode}/${race.meetingDay}/${race.race}`);
    assert.equal(sourceUrl(row.querySelector('.live-link')),`https://www.winticket.jp/keirin/${race.venueSlug}/live`);
    const extra=media.races.find(r=>r.source_url===race.source);
    for (const rider of row.querySelectorAll('.rider')) {
      const number=Number(rider.querySelector('.car').textContent);
      assert.equal(rider.querySelector('.prediction-mark').textContent,extra.players.find(p=>p.no===number).mark);
      const results=history.races.find(r=>r.source_url===race.source).players.find(p=>p.no===number).meeting_results;
      const container=rider.querySelector('.meeting-results');
      assert.equal(rider.querySelector('.stats').nextElementSibling,container);
      if(race.meetingDay===1){assert.equal(container.querySelectorAll('a').length,0);assert.match(container.querySelector('.meeting-empty').title,/初日/);}
      const slots=[...container.querySelectorAll('.meeting-result')];
      assert.equal(slots.length,race.meetingDay-1);
      for(let day=1;day<race.meetingDay;day++) {
        const slot=slots[day-1];
        const item=results.find(r=>r.meeting_day===day);
        if(!item){assert.equal(slot.querySelector('a'),null);continue;}
        const link=slot.querySelector('.meeting-order');
        const destination=new URL(sourceUrl(link));
        const expected=new URL(item.result_url);
        expected.searchParams.set('playerIds',item.player_id);
        assert.equal(destination.href,expected.href);
        assert.equal(destination.searchParams.get('playerIds'),item.player_id);
        assert.equal(link.tagName,'A');assert.equal(link.target,'_self');assert.equal(link.hasAttribute('onclick'),false);assert.equal(new URL(link.href).pathname,'/open-web');
        const rank=link.querySelector('.meeting-rank');
        assert.equal(rank.textContent,item.has_accident?item.accident:String(item.order));
        assert.equal(rank.classList.contains('meeting-rank-circle'),item.display_type===1);
        assert.equal(rank.classList.contains('meeting-rank-solid'),item.display_type===2);
        assert.equal(Boolean(link.querySelector('.meeting-back')),item.back);
        assert.equal(slot.querySelector('.meeting-time').textContent,Number(item.final_half_record)>0?item.final_half_record:'—');
        assert.match(link.getAttribute('aria-label'),/競走成績/);
        historyChecked++;
      }
    }
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
  await check(dir===path.join(project,'site')?'https://preview.example/':'https://preview.example'+(assetPrefix||'/'));
  const date = html.match(/KEIRIN · (\d{4})\.(\d{2})\.(\d{2})/).slice(1).join('');
  await check(`https://preview.example/line${date}.html/`);
  console.log(`PASS ${raw.length} real races; ${checked} odds cells and ${historyChecked} meeting results across both URLs; official video/live links and exact rider selection on every result link`);
})().catch(error=>{console.error(error);process.exitCode=1;});
