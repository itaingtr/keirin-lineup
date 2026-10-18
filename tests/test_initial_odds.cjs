// Current-page initial summaries; synthetic fixtures, no real network requests.
const {JSDOM}=require('jsdom');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const html=fs.readFileSync('site/line20261017.html/index.html','utf8');
const reader=fs.readFileSync('site/odds-current.js','utf8');
const comparison=fs.readFileSync('site/odds-comparison.js','utf8');
const now=Date.parse('2026-10-18T06:00:00Z');
const tick=()=>new Promise(resolve=>setTimeout(resolve,30));
function snapshot() {
  const odds=[];
  for(let first=1;first<=9;first++)for(let second=1;second<=9;second++)if(first!==second)odds.push({first,second,value:first===4&&second===1?null:first*10+second/10});
  return {race_key:'/keiokaku/racedetail/2720261017010001/',bet_type:'exacta',status:'snapshot',parser_version:2,observed_at:new Date(now-60000).toISOString(),odds};
}
function setup(data,{enabled=true,future=false,fail=false}={}) {
  let page=enabled?html.replace('<tbody id="rows">','<tbody id="rows" data-initial-odds>'):html;
  if(future)page=page.replace('KEIRIN · 2026.10.17','KEIRIN · 2099.10.17');
  const dom=new JSDOM(page,{runScripts:'dangerously',url:'https://itaingtr.github.io/keirin-lineup/'});
  const w=dom.window,NativeDate=w.Date;
  w.Date=class extends NativeDate {constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
  const calls=[];let failed=fail;
  w.fetch=async url=>{
    calls.push(String(url));
    if(failed)throw new Error('fixture transport failed');
    return {ok:true,json:async()=>String(url).endsWith('odds-config.json')?{endpoint:'https://example.test/saved.json'}:{results:[{ok:true,snapshot:data}]}};
  };
  w.eval(reader);w.eval(comparison);
  return {dom,w,calls,setFailed:value=>{failed=value;}};
}
(async()=>{
  {
    const data=snapshot(),{dom,w,calls,setFailed}=setup(data);await tick();
    const row=w.document.querySelector('#rows > tr'),panel=row.querySelector('.odds-cell');
    assert.equal(calls.length,2,'one config and one saved-feed read for all initial rows');
    assert(panel.hidden,'initial summaries do not open the odds panel');
    assert.equal(w.document.querySelectorAll('.exacta-matrix').length,0,'temporary validation matrices stay off the page');
    assert.equal(row.querySelectorAll('.rider-odds').length,9);
    assert.equal(w.document.querySelectorAll('.rider-odds').length,9,'races missing from the feed have no empty bands');
    for(const rider of row.querySelectorAll('.lineup .rider')) {
      assert.equal(rider.firstElementChild.className,'rider-odds');
      assert(rider.firstElementChild.nextElementSibling.classList.contains('recent-s'),'summaries precede the S count');
    }
    const prices=data.odds.filter(item=>item.first===3).map(item=>item.value);
    const expected=(1/prices.reduce((sum,value)=>sum+1/value,0)).toFixed(1);
    assert.equal(row.querySelector('[data-car="3"]').textContent,expected,'the same theoretical equal-payout calculation is used');
    assert.equal(row.querySelector('[data-car="4"]').textContent,'','incomplete combined odds leave no placeholder');
    assert.equal(row.querySelector('[data-pair-combination="4-1"]').textContent,'','unavailable line quotes remain blank');
    assert.equal(row.querySelector('[data-pair-combination="1-8"]').textContent,'10.8');
    assert.equal(row.querySelector('[data-pair-combination="8-1"]').textContent,'80.1');
    assert(row.querySelector('[data-car="3"]').title.includes('保存値'));
    const search=w.document.getElementById('search');
    search.value='高知';search.dispatchEvent(new w.Event('input'));await tick();
    assert.equal(w.document.querySelectorAll('.rider-odds').length,0);
    search.value='';search.dispatchEvent(new w.Event('input'));await tick();
    assert.equal(w.document.querySelectorAll('.rider-odds').length,9);
    assert.equal(calls.length,2,'search reuses the initial saved feed');
    const current=w.document.querySelector('#rows > tr');
    current.querySelector('.odds-toggle').click();await tick();
    const status=current.querySelector('.odds-status');
    data.observed_at=new Date(now).toISOString();
    data.odds.find(item=>item.first===1&&item.second===8).value=1.8;
    current.querySelector('.odds-refresh').click();await tick();
    assert.equal(current.querySelector('.lineup [data-pair-combination="1-8"]').textContent,'1.8','opening and refreshing synchronize the initial summary');
    assert.equal(current.querySelectorAll('.rider-odds').length,9,'updates replace rather than duplicate the bands');
    setFailed(true);current.querySelector('.odds-refresh').click();await tick();
    assert.equal(current.querySelectorAll('.rider-odds').length,0,'failed refresh removes the unverified summary');
    assert(!current.querySelector('.lineup').classList.contains('lineup-odds-visible'));
    assert.equal(current.querySelector('.odds-cell').lastElementChild,status);
    setFailed(false);current.querySelector('.odds-refresh').click();await tick();
    assert.equal(current.querySelectorAll('.rider-odds').length,9);
    assert.equal(current.querySelector('.odds-comparison').lastElementChild.lastElementChild,status);
    dom.window.close();
  }
  for(const options of [{future:true},{enabled:false},{fail:true}]) {
    const {dom,w,calls}=setup(snapshot(),options);await tick();
    assert.equal(w.document.querySelectorAll('.rider-odds').length,0);
    if(options.future||options.enabled===false)assert.equal(calls.length,0,'future pages and historical opt-out pages do not preload');
    dom.window.close();
  }
  for(const kind of ['all-null','missing','wrong-race','closed']) {
    const data=snapshot();
    if(kind==='all-null')data.odds.forEach(item=>item.value=null);
    if(kind==='missing')data.odds.pop();
    if(kind==='wrong-race')data.race_key='/keiokaku/racedetail/2720261017010099/';
    if(kind==='closed')data.status='closed';
    const {dom,w}=setup(data);await tick();
    assert.equal(w.document.querySelectorAll('.rider-odds').length,0,kind+' has no summary or reserved space');
    dom.window.close();
  }
  {
    const data=snapshot();delete data.parser_version;
    data.source_url='https://my.keirin.kdreams.jp'+data.race_key+'?pageType=odds';
    data.rider_numbers=[1,2,3,4,5,6,7,8,9];
    const original=JSON.stringify(data);
    const {dom,w}=setup(data);await tick();
    assert.equal(w.document.querySelector('.lineup [data-pair-combination="1-8"]').textContent,'80.1','legacy stored quotes normalize once in the initial summary');
    assert.equal(JSON.stringify(data),original,'saved history is never changed');
    dom.window.close();
  }
  console.log('PASS initial line and combined odds, one feed request, pre-race hiding, unavailable/invalid quotes, search, refresh, error recovery and legacy orientation');
})().catch(error=>{console.error(error);process.exitCode=1;});
