// Exercise the complete real-source card through the deployed Worker code.
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {createHash,webcrypto}=require('node:crypto');const {JSDOM}=require('jsdom');global.crypto=webcrypto;
const report=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const bytes=fs.readFileSync(report.local_payload);const card=JSON.parse(bytes);
assert.equal(createHash('sha256').update(bytes).digest('hex'),report.sha256);
const pointer={schema_version:1,provider:'winticket',target_date:report.target_date,revision:report.revision,path:report.path,sha256:report.sha256};
global.fetch=async url=>{
 const u=new URL(url);assert.equal(u.origin,'https://raw.githubusercontent.com');
 const rel=u.pathname.split('/odds-diagnostics/')[1];
 if(rel===report.path)return new Response(bytes);
 if(rel==='fallback/cards/current.json'||rel==='fallback/cards/'+report.target_date.replaceAll('-','')+'/latest.json')return Response.json(pointer);
 return new Response('Not published',{status:404});
};
(async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../dist/server/index.js'),'utf8');
 const worker=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
 const datePath='/line'+report.target_date.replaceAll('-','')+'.html/';
 for(const route of ['/',datePath]){
  const response=await worker.fetch(new Request('https://test.example'+route));assert.equal(response.status,200);
  const html=await response.text();assert.equal(html,card.html);
  const dom=new JSDOM(html,{url:'https://test.example'+route,runScripts:'dangerously'});const doc=dom.window.document;
  assert.equal(doc.querySelectorAll('.race-link').length,report.races);
  assert.equal(doc.querySelectorAll('.video-link').length,report.races*2);
  assert.equal(doc.querySelector('iframe,dialog,video,script[src*="viewer.js"]'),null);
  let selected=0;
  for(const link of doc.querySelectorAll('.meeting-order,.video-link')){
   assert.equal(link.target,'_self');const u=new URL(link.href);assert.equal(u.pathname,'/open-web');
   const result=await worker.fetch(new Request(u));assert.equal(result.status,302);
   assert.equal(result.headers.get('location'),link.dataset.sourceUrl);
   if(link.matches('.meeting-order')){assert.ok(new URL(link.dataset.sourceUrl).searchParams.get('playerIds'));selected++;}
  }
  console.log('REAL CARD DOM PASS',route,report.races,'races',report.riders,'riders',selected,'selected-rider history links');
  dom.window.close();
 }
 const odds=JSON.parse(card.assets['odds.json']);
 assert.ok(odds.results.length===report.races&&odds.results.every(x=>x.ok&&x.snapshot.status==='unavailable'&&!('odds' in x.snapshot)));
 console.log('PASS actual prepared card, original controls, exact source links and no collected odds');
})().catch(error=>{console.error(error);process.exitCode=1;});
