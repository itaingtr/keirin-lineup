// Verify the restored official-page flow through the actual built Worker.
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..');
const bundle=fs.readFileSync(path.join(root,'dist/server/index.js'),'utf8');
global.fetch=()=>{throw Error('Official-page navigation must not fetch or save source data');};
(async()=>{
 const worker=(await import('data:text/javascript;base64,'+Buffer.from(bundle).toString('base64'))).default;
 let checked=0;
 for(const route of ['/','/line20261022.html','/line20261022.html/','/line20261021.html','/line20261021.html/','/line20261023.html','/line20261023.html/']){
  const url='https://preview.example'+route;
  const response=await worker.fetch(new Request(url));assert.equal(response.status,200);
  const html=await response.text();
  const dom=new JSDOM(html,{url,runScripts:'dangerously',beforeParse(w){w.open=()=>{throw Error('Unexpected new window');};}});
  const doc=dom.window.document;
  assert.equal(doc.body.dataset.webNavigation,'20261022');
  assert.equal(doc.querySelector('script[src*="viewer.js"],iframe,dialog,video'),null);
  assert.equal(doc.querySelectorAll('.video-link').length,doc.querySelectorAll('.race-link').length*2);
  assert.ok(doc.querySelector('.video-link').textContent.includes('映像を見る'));
  for(const link of doc.querySelectorAll('.meeting-order,.video-link')){
   assert.equal(link.tagName,'A');assert.equal(link.target,'_self');assert.equal(link.hasAttribute('onclick'),false);
   const clicked=new URL(link.href);assert.equal(clicked.origin,new URL(url).origin);assert.equal(clicked.pathname,'/open-web');
   const destination=link.dataset.sourceUrl;assert.equal(clicked.searchParams.get('to'),destination);
   const opened=await worker.fetch(new Request(clicked));assert.equal(opened.status,302);assert.equal(opened.headers.get('location'),destination);
   assert.equal(opened.headers.get('cache-control'),'no-store');
   if(link.classList.contains('meeting-order'))assert.ok(new URL(opened.headers.get('location')).searchParams.get('playerIds'));
   checked++;
  }
  for(const link of doc.querySelectorAll('.race-link'))assert.equal(link.target,'_self');
  assert.equal(dom.window.location.href,url);dom.window.close();
 }
 for(const destination of ['https://evil.example/','https://www.winticket.jp/keirin/unknown/live',
  'https://www.winticket.jp/keirin/odawara/live?app=1','winticket://race/1']){
  const response=await worker.fetch(new Request('https://preview.example/open-web?to='+encodeURIComponent(destination)));
  assert.equal(response.status,400);assert.equal(response.headers.has('location'),false);
 }
 console.log(`PASS ${checked} same-tab links across root/Oct23/Oct22/Oct21, original controls, exact official URLs and selected riders, no player/data requests and rejected unknown redirects`);
})().catch(e=>{console.error(e);process.exitCode=1;});
