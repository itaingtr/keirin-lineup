// Run with jsdom@26.1.0 installed in your test environment; never contacts a real odds source.
const {JSDOM}=require('jsdom');
const fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const assert=require('node:assert/strict');
// Keep a fixed published regression card as index advances to later race days.
const html=fs.readFileSync('site/line20261017.html/index.html','utf8');
const oddsCode=fs.readFileSync(process.env.EXACTA_READER||'site/odds.js','utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,20));
function setup(data, configured=true, page=html) {
  const dom=new JSDOM(page,{runScripts:'dangerously',url:'https://itaingtr.github.io/keirin-lineup/'});
  const w=dom.window;
  const calls=[];
  w.fetch=async url=>{
    calls.push(String(url));
    const config=String(url).endsWith('odds-config.json');
    return {ok:true,json:async()=> config?{endpoint:configured?'https://itaingtr.github.io/keirin-lineup/api/odds':null}:data};
  };
  w.eval(oddsCode);
  return {dom,w,calls};
}
function sample() {
  const odds=[];
  for(let first=1;first<=9;first++)for(let second=1;second<=9;second++)if(first!==second)odds.push({first,second,value:first===1&&second===2?null:first*10+second/10});
  return {race_key:'/keiokaku/racedetail/2720261017010001/',bet_type:'exacta',status:'open',observed_at:new Date().toISOString(),odds};
}
(async()=>{
  {
    const {dom,w,calls}=setup(sample());const d=w.document;
    assert.equal(d.querySelectorAll('.odds-toggle').length,19);
    assert.equal(calls.length,0,'no odds fetched until opened');
    const button=d.querySelector('.odds-toggle'),panel=d.querySelector('.odds-cell');
    assert(panel.hidden);button.click();await tick();
    assert.equal(button.getAttribute('aria-expanded'),'true');assert(!panel.hidden);
    assert.equal(panel.querySelectorAll('.exacta-matrix tbody tr').length,9);
    assert.equal(panel.querySelectorAll('.exacta-matrix tbody td').length,81);
    assert(panel.textContent.includes('取得時刻：'));
    assert(panel.querySelector('.exacta-unavailable').title.includes('未発売・対象外'));
    assert.equal(panel.querySelectorAll('.exacta-number').length,27);
    assert(panel.querySelector('.exacta-rider-name').textContent);
    assert(panel.querySelector('.exacta-row-rider').title.includes('寺沼拓摩'));
    assert.equal(panel.querySelector('[data-combination="2-1"]').textContent,'20.1');
    assert.equal(panel.style.getPropertyValue('--exacta-width'),'306px');
    assert.equal(panel.querySelector('[data-combination="2-1"]').title.includes('20.1倍'),true);
    assert.equal(panel.querySelectorAll('.exacta-column-rider').length,9);
    assert.equal(panel.querySelectorAll('.exacta-row-rider').length,9);
    assert.equal(panel.querySelectorAll('.exacta-mirror-rider').length,9);
    assert.equal(panel.querySelectorAll('.exacta-row-rider .exacta-rider-name,.exacta-mirror-rider .exacta-rider-name').length,0);
    assert.equal(panel.querySelectorAll('.exacta-synthetic').length,9);
    assert.equal(panel.querySelectorAll('.exacta-score').length,9);
    for(const header of panel.querySelectorAll('.exacta-column-rider')) {
      const number=header.querySelector('.exacta-number').textContent;
      const original=[...panel.parentElement.querySelectorAll('.rider')].find(rider=>rider.querySelector('.car').textContent===number).querySelector('.score');
      const score=header.querySelector('.exacta-score');
      assert.equal(score.textContent,original.textContent,'score copied from the matching rider');
      assert.equal(score.className,'exacta-score '+original.className,'score keeps its original emphasis');
      assert(score.nextElementSibling.classList.contains('exacta-synthetic'),'score appears above combined odds');
    }
    assert.equal(panel.querySelector('.exacta-synthetic').textContent,'—','missing price prevents combined odds');
    const rows=panel.querySelectorAll('.exacta-matrix tbody tr');
    for(const [index,row] of [...rows].entries()) {
      assert.equal(row.firstElementChild.querySelector('.exacta-number').textContent,String(index+1));
      assert.equal(row.lastElementChild.querySelector('.exacta-number').textContent,String(index+1));
      assert.equal(row.lastElementChild.getAttribute('aria-hidden'),'true');
    }
    assert.equal(rows[0].children[2].dataset.combination,'2-1','columns fix first place');
    assert.equal(rows[1].children[1].dataset.combination,'1-2','rows fix second place');
    assert.equal(rows[4].children[1].dataset.combination,'1-5','1-5 is first column, fifth rider row');
    assert.equal(rows[4].children[1].textContent,'10.5');
    assert.equal(rows[0].children[5].dataset.combination,'5-1');
    assert.equal(rows[0].children[5].textContent,'50.1');
    assert.equal(calls.length,2);
    assert(new URL(calls[1]).searchParams.get('bet_type')==='exacta');
    assert.equal(w.location.href,'https://itaingtr.github.io/keirin-lineup/');
    button.click();assert(panel.hidden);assert.equal(calls.length,2);
    button.click();await tick();assert.equal(calls.length,3,'reopen refreshes odds');
    panel.querySelector('.odds-refresh').click();await tick();assert.equal(calls.length,4);
    const search=d.querySelector('#search');search.value='高知';search.dispatchEvent(new w.Event('input'));await tick();
    assert.equal(d.querySelectorAll('.odds-toggle').length,7,'search redraw reattaches once per race');
    dom.window.close();
  }
  {
    const data=sample(), prices=[5,5,99.9,100,100.9,199.9,200,200.9];
    let index=0;
    for(const item of data.odds) {
      if(item.first===1)item.value=prices[index++];
      if(item.first===2)item.value=null;
      if(item.first===3)item.value=item.second===1?100.1:item.second===2?100.9:500;
      if(item.first===3&&item.second===4)item.value=299.9;
      if(item.first===3&&item.second===5)item.value=300;
      if(item.first===3&&item.second===6)item.value=300.9;
      if(item.first===4)item.value=800.8;
      if(item.first===7)item.value=100.9;
      if(item.first===8)item.value=2400.8;
    }
    const {dom,w}=setup(data);w.document.querySelector('.odds-toggle').click();await tick();
    const table=w.document.querySelector('.exacta-matrix');
    const cell=pair=>table.querySelector('[data-combination="'+pair+'"]');
    assert.equal(cell('1-4').textContent,'99.9');
    assert.equal(cell('1-5').textContent,'100');
    assert.equal(cell('1-6').textContent,'100','100.9 truncates instead of rounding up');
    assert.equal(cell('1-7').textContent,'199');
    assert.equal(cell('1-8').textContent,'200');
    assert.equal(cell('1-9').textContent,'200');
    assert(!cell('1-4').classList.contains('exacta-high'));
    assert(cell('1-5').classList.contains('exacta-high'));
    assert(cell('1-7').classList.contains('exacta-high'));
    assert(cell('1-8').classList.contains('exacta-very-high'));
    assert(cell('3-4').classList.contains('exacta-very-high'));
    assert(cell('3-5').classList.contains('exacta-extreme'));
    assert(cell('3-6').classList.contains('exacta-extreme'));
    assert.equal(cell('3-4').textContent,'299');
    assert.equal(cell('3-6').textContent,'300');
    assert(cell('1-9').title.includes('200.9倍'),'full original quote remains in the tooltip');
    assert.equal(table.querySelectorAll('[data-combination^="1-"].exacta-minimum').length,2,'all tied column minima are bold');
    assert(cell('1-2').classList.contains('exacta-minimum'));
    assert(cell('1-3').classList.contains('exacta-minimum'));
    assert.equal(table.querySelectorAll('[data-combination^="2-"].exacta-minimum').length,0,'unavailable column has no minimum');
    assert(cell('3-1').classList.contains('exacta-minimum'));
    assert(!cell('3-2').classList.contains('exacta-minimum'),'rounded display ties do not change the true minimum');
    const summaries=table.querySelectorAll('.exacta-synthetic');
    assert.equal(summaries[1].textContent,'—');
    assert.equal(summaries[3].textContent,'100');
    assert(summaries[3].classList.contains('exacta-high'));
    assert.equal(summaries[6].textContent,'12.6','combined odds still use 100.9, not the displayed 100');
    assert.equal(summaries[7].textContent,'300');
    assert(summaries[7].classList.contains('exacta-extreme'));
    assert.equal(data.odds.find(item=>item.first===1&&item.second===9).value,200.9);
    dom.window.close();
  }
  {
    const data=sample();
    for(const item of data.odds)item.value=item.first<=2?8.01:item.first===3?8.09:80;
    const {dom,w}=setup(data);w.document.querySelector('.odds-toggle').click();await tick();
    const summaries=w.document.querySelectorAll('.exacta-synthetic');
    assert.equal(summaries[0].textContent,'1.0');
    assert.equal(summaries[2].textContent,'1.0');
    assert(summaries[0].classList.contains('exacta-favorite'));
    assert(summaries[1].classList.contains('exacta-favorite'),'all exactly tied favorites are bold');
    assert(!summaries[2].classList.contains('exacta-favorite'),'display rounding does not create a favorite');
    assert.equal(w.document.querySelectorAll('.exacta-favorite').length,2);
    dom.window.close();
    for(const item of data.odds)item.value=null;
    const missing=setup(data);missing.w.document.querySelector('.odds-toggle').click();await tick();
    assert.equal(missing.w.document.querySelectorAll('.exacta-favorite').length,0,'missing combined odds are never favorites');
    missing.dom.window.close();
  }
  for(const parserVersion of [undefined,2]) {
    const data=sample();data.status='snapshot';
    data.source_url='https://my.keirin.kdreams.jp'+data.race_key+'?pageType=odds';
    data.rider_numbers=[1,2,3,4,5,6,7,8,9];
    if(parserVersion!==undefined)data.parser_version=parserVersion;
    const observed=data.observed_at;
    const {dom,w}=setup({results:[{ok:true,snapshot:data}]});
    w.document.querySelector('.odds-toggle').click();await tick();
    const rows=w.document.querySelectorAll('.exacta-matrix tbody tr');
    assert.equal(rows[4].children[1].dataset.combination,'1-5');
    assert.equal(rows[4].children[1].textContent,parserVersion===2?'10.5':'50.1','legacy quotes normalize once, corrected quotes stay in place');
    const firstPrices=data.odds.filter(item=>parserVersion===2?item.first===1:item.second===1).map(item=>item.value);
    const expected=firstPrices.some(value=>value===null)?'—':(1/firstPrices.reduce((sum,value)=>sum+1/value,0)).toFixed(1);
    assert.equal(w.document.querySelector('.exacta-synthetic').textContent,expected,'combined odds use the corrected first-place column');
    assert.equal(data.observed_at,observed,'original observation time is preserved');
    assert.equal(data.odds.find(item=>item.first===1&&item.second===5).value,10.5,'saved history is not mutated');
    dom.window.close();
  }
  for(const primary of ['lineup','number']) {
    const data=sample();
    data.odds.find(item=>item.first===4&&item.second===1).value=null;
    const {dom,w,calls}=setup(data);
    if(primary==='number')w.document.getElementById('rows').dataset.oddsPrimary='number';
    w.eval(fs.readFileSync('site/odds-comparison.js','utf8'));
    w.document.querySelector('.odds-toggle').click();await tick();
    const panel=w.document.querySelector('.odds-cell');
    const left=panel.querySelector('[data-odds-order="number"]'),right=panel.querySelector('[data-odds-order="lineup"]');
    assert(left&&right);
    assert.equal(panel.querySelector('.odds-comparison').firstElementChild.firstElementChild,primary==='number'?left:right,'the selected primary view is on the left');
    assert.equal(panel.querySelector('.odds-comparison').lastElementChild.firstElementChild,primary==='number'?right:left,'the other view is on the right');
    const statusNode=panel.querySelector('.odds-status');
    assert.equal(left.closest('figure').lastElementChild,statusNode,'observation time follows the numeric table in either position');
    const order=[...w.document.querySelectorAll('#rows > tr:first-child .lineup .car')].map(car=>Number(car.textContent));
    assert.deepEqual([...left.querySelectorAll('.exacta-column-rider .exacta-number')].map(car=>Number(car.textContent)),[...order].sort((a,b)=>a-b));
    assert.deepEqual([...right.querySelectorAll('.exacta-column-rider .exacta-number')].map(car=>Number(car.textContent)),order);
    assert.deepEqual([...right.tBodies[0].rows].map(row=>Number(row.firstElementChild.querySelector('.exacta-number').textContent)),order);
    const starts=[...w.document.querySelectorAll('#rows > tr:first-child .line-group')].slice(1).map(group=>Number(group.querySelector('.car').textContent));
    assert.deepEqual([...right.tHead.querySelectorAll('.exacta-line-start .exacta-number')].map(car=>Number(car.textContent)),starts,'gaps occur only between lines');
    assert.equal(left.querySelectorAll('.exacta-line-start').length,0,'numeric view has no line gaps');
    assert.equal(right.tBodies[0].querySelectorAll('.exacta-line-start').length,starts.length*order.length);
    assert.deepEqual([...right.tBodies[0].querySelectorAll('.exacta-line-row-start')].map(row=>Number(row.firstElementChild.querySelector('.exacta-number').textContent)),starts,'row gaps occur at line boundaries');
    const groups=[...w.document.querySelectorAll('#rows > tr:first-child .line-group')].map(group=>[...group.querySelectorAll('.car')].map(car=>Number(car.textContent)));
    const expectedPairs=groups.flatMap(group=>group.slice(0,-1).map((car,index)=>car+'-'+group[index+1]));
    assert.deepEqual([...right.querySelectorAll('.exacta-line-pair')].map(pair=>pair.dataset.linePair),expectedPairs,'only neighboring riders within a line are paired');
    assert.equal(left.querySelectorAll('.exacta-line-pair').length,0,'numeric view has no extra quotes');
    for(const pair of right.querySelectorAll('.exacta-line-pair')) {
      const [first,second]=pair.dataset.linePair.split('-');
      assert.deepEqual([...pair.children].map(value=>value.dataset.pairCombination),[first+'-'+second,second+'-'+first],'forward quote is above the reverse quote');
      for(const value of pair.children) {
        const source=left.querySelector('[data-combination="'+value.dataset.pairCombination+'"]');
        assert.equal(value.textContent,source.textContent);
        assert.equal(value.title,source.title);
      }
      assert.equal(pair.parentElement.querySelector('.exacta-number').textContent,first);
    }
    assert.equal(right.querySelector('[data-pair-combination="4-1"]').textContent,'—','an unavailable line quote is not replaced with zero');
    const quotes=table=>Object.fromEntries([...table.querySelectorAll('[data-combination]')].map(cell=>[cell.dataset.combination,[cell.textContent,cell.title,cell.className.replace(' exacta-line-start','')]]));
    assert.deepEqual(quotes(left),quotes(right),'reordering preserves prices and emphasis');
    assert.equal(calls.length,2,'configuration plus one shared feed fetch');
    panel.querySelector('.odds-refresh').click();await tick();
    assert.equal(panel.querySelectorAll('.odds-comparison').length,1);
    assert.equal(panel.querySelectorAll('table').length,2,'refresh replaces both tables without duplication');
    assert.equal(panel.querySelectorAll('.odds-status').length,1);
    assert.equal(panel.querySelector('[data-odds-order="number"]').closest('figure').lastElementChild,statusNode,'refresh preserves the original live status node');
    const originalFetch=w.fetch;
    w.fetch=async()=>{throw new Error('fixture connection failure')};
    panel.querySelector('.odds-refresh').click();await tick();
    assert.equal(panel.querySelectorAll('.odds-comparison').length,0);
    assert.equal(panel.lastElementChild,statusNode,'failed refresh restores the status outside the cleared content');
    assert(statusNode.textContent.includes('取得できなかった'));
    w.fetch=originalFetch;
    panel.querySelector('.odds-refresh').click();await tick();
    assert.equal(panel.querySelector('[data-odds-order="number"]').closest('figure').lastElementChild,statusNode,'recovery places the time back under the numeric table');
    const group=panel.parentElement.querySelector('.line-group');
    const contested=[...group.querySelectorAll('.rider')].slice(0,2);
    const contestedCars=contested.map(rider=>rider.querySelector('.car').textContent);
    const contest=w.document.createElement('div');contest.className='contest-pair';
    contested[0].before(contest);contest.append(...contested);
    panel.querySelector('.odds-refresh').click();await tick();
    assert([...panel.querySelectorAll('.exacta-line-pair')].every(pair=>!pair.dataset.linePair.split('-').some(car=>contestedCars.includes(car))),'a contested position is not presented as a simple sequential line');
    dom.window.close();
  }
  {
    // Exercise the complete source HTML -> collector -> saved feed -> UI path.
    // Deliberately unequal 1-5/5-1 values expose an extra or missing transpose.
    const headers=Array.from({length:9},(_,i)=>'<th class="n'+(i+1)+'">'+(i+1)+'</th>').join('');
    const rows=Array.from({length:9},(_,i)=>{
      const second=i+1;
      return '<tr><th class="n'+second+'">'+second+'</th>'+Array.from({length:9},(_,j)=>{
        const first=j+1;return '<td>'+(first===second?'':first*10+second+0.1)+'</td>';
      }).join('')+'</tr>';
    }).join('');
    const source='<div id="JS_ODDSCONTENTS_2shatan"><table class="odds_table"><tr><th>2着＼1着</th>'+headers+'</tr>'+rows+'</table></div>';
    const script="import sys,json; sys.path.insert(0,'scripts'); from collect_exacta import parse_exacta; print(json.dumps(parse_exacta(sys.stdin.read(),'https://my.keirin.kdreams.jp/keiokaku/racedetail/2720261017010001/')))";
    const data=JSON.parse(execFileSync('python3',['-c',script],{input:source,encoding:'utf8'}));
    const {dom,w}=setup({results:[{ok:true,snapshot:data}]});
    w.document.querySelector('.odds-toggle').click();await tick();
    const output=w.document.querySelectorAll('.exacta-matrix tbody tr');
    assert.equal(output[4].children[1].textContent,'15.1','1-5 comes from source column 1, row 5');
    assert.equal(output[0].children[5].textContent,'51.1','5-1 comes from source column 5, row 1');
    const expected=(1/[12.1,13.1,14.1,15.1,16.1,17.1,18.1,19.1].reduce((sum,value)=>sum+1/value,0)).toFixed(1);
    assert.equal(w.document.querySelector('.exacta-synthetic').textContent,expected,'car 1 combined odds use all second-place rows in column 1');
    dom.window.close();
  }
  {
    const data=sample();
    const prices=[3,6,12,24,48,96,192,384];
    let index=0;
    for (const item of data.odds) {
      if(item.first===2)item.value=prices[index++];
      if(item.first===7)item.value=80;
    }
    const {dom,w}=setup(data,true,html.replaceAll('寺沼拓摩','𠮷田太郎次'));
    w.document.querySelector('.odds-toggle').click();await tick();
    const summaries=w.document.querySelectorAll('.exacta-synthetic');
    assert.equal(summaries[1].textContent,'1.5','harmonic total, not an average or equal stakes');
    assert.equal(summaries[6].textContent,'10.0','eight 80x outcomes combine to 10x');
    assert(summaries[1].title.includes('100円単位への丸めなし'));
    // Inverse-odds stakes give identical payout for every second-place outcome.
    const combined=1/prices.reduce((sum,price)=>sum+1/price,0);
    const stakes=prices.map(price=>1000*combined/price);
    assert(Math.abs(stakes.reduce((a,b)=>a+b,0)-1000)<1e-8);
    assert(stakes.every((stake,i)=>Math.abs(stake*prices[i]-1000*combined)<1e-8));
    const labels=w.document.querySelectorAll('.exacta-rider-name');
    assert([...labels].every(label=>[...label.textContent].length<=4));
    assert.equal(labels[0].textContent,'𠮷田太郎','four Unicode characters, including supplementary kanji');
    assert(w.document.querySelector('.exacta-column-rider').title.includes('𠮷田太郎次'),'full name remains available');
    assert.equal(w.document.querySelector('.exacta-row-rider .exacta-rider-name'),null);
    assert(w.document.querySelector('.exacta-row-rider').title.includes('𠮷田太郎次'),'side badge retains the full name in its tooltip');
    dom.window.close();
  }
  for(const mutate of [d=>d.race_key='/wrong/',d=>d.bet_type='trifecta',d=>d.odds.pop(),d=>d.odds[1]=d.odds[0],d=>d.observed_at='unknown',d=>d.odds[0].value=-1]){
    const data=sample();mutate(data);const {dom,w}=setup(data);w.document.querySelector('.odds-toggle').click();await tick();
    assert.equal(w.document.querySelectorAll('.exacta-matrix').length,0);
    assert(w.document.querySelector('.odds-status').textContent.includes('取得できなかった'));
    dom.window.close();
  }
  {
    const data=sample();data.status='snapshot';
    const {dom,w}=setup({results:[{ok:true,snapshot:data}]});
    w.document.querySelector('.odds-toggle').click();await tick();
    assert.equal(w.document.querySelectorAll('.exacta-matrix tbody tr').length,9);
    assert(w.document.querySelector('.odds-status').textContent.includes('保存値'));
    dom.window.close();
  }
  {
    const {dom,w}=setup({results:[]});w.document.querySelector('.odds-toggle').click();await tick();
    assert.equal(w.document.querySelectorAll('.exacta-matrix').length,0);
    assert(w.document.querySelector('.odds-status').textContent.includes('まだ取得できない'));
    dom.window.close();
  }
  for(const status of ['closed','unavailable']){
    const data=sample();data.status=status;const {dom,w}=setup(data);w.document.querySelector('.odds-toggle').click();await tick();
    assert.equal(w.document.querySelectorAll('.exacta-matrix').length,0);dom.window.close();
  }
  {
    const {dom,w,calls}=setup(sample(),false);w.document.querySelector('.odds-toggle').click();await tick();
    assert.equal(calls.length,1);assert(w.document.querySelector('.odds-status').textContent.includes('取得先を確認中'));dom.window.close();
  }
  console.log('PASS exacta disclosure, lazy loading, refresh, matrix orientation, theoretical combined odds, missing prices, four-character names, validation and search redraw');
})().catch(error=>{console.error(error);process.exit(1)});
