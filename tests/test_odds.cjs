// Run with jsdom@26.1.0 installed in your test environment; never contacts a real odds source.
const {JSDOM}=require('jsdom');
const fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const assert=require('node:assert/strict');
const html=fs.readFileSync('site/index.html','utf8');
const oddsCode=fs.readFileSync('site/odds.js','utf8');
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
    assert.equal(panel.querySelectorAll('.exacta-number').length,18);
    assert(panel.querySelector('.exacta-rider-name').textContent);
    assert(panel.querySelector('.exacta-row-rider').title.includes('寺沼拓摩'));
    assert.equal(panel.querySelector('[data-combination="2-1"]').textContent,'20.1');
    assert.equal(panel.style.getPropertyValue('--exacta-width'),'324px');
    assert.equal(panel.querySelector('[data-combination="2-1"]').title.includes('20.1倍'),true);
    assert.equal(panel.querySelectorAll('.exacta-column-rider').length,9);
    assert.equal(panel.querySelectorAll('.exacta-row-rider').length,9);
    assert.equal(panel.querySelectorAll('.exacta-synthetic').length,9);
    assert.equal(panel.querySelector('.exacta-synthetic').textContent,'—','missing price prevents combined odds');
    const rows=panel.querySelectorAll('.exacta-matrix tbody tr');
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
    assert.equal(w.document.querySelector('.exacta-row-rider .exacta-rider-name').textContent,'𠮷田太郎');
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
