// Run with jsdom@26.1.0 installed in your test environment; never contacts a real odds source.
const {JSDOM}=require('jsdom');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const html=fs.readFileSync('site/index.html','utf8');
const oddsCode=fs.readFileSync('site/odds.js','utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,20));
function setup(data, configured=true) {
  const dom=new JSDOM(html,{runScripts:'dangerously',url:'https://itaingtr.github.io/keirin-lineup/'});
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
    assert(panel.textContent.includes('未発売・対象外'));
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
    assert(w.document.querySelector('.odds-status').textContent.includes('取得済みの記録'));
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
  console.log('PASS exacta disclosure, lazy loading, refresh, no navigation, matrix, validation failures, search redraw and unconfigured source');
})().catch(error=>{console.error(error);process.exit(1)});
