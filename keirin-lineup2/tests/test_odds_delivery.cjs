// The card pointer can fail while the independently saved odds remain healthy.
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {webcrypto}=require('node:crypto');global.crypto=webcrypto;
const source=fs.readFileSync(path.join(__dirname,'../dist/server/index.js'),'utf8');
const live={schema_version:1,provider:'winticket',target_date:'2026-10-25',checked_at:'2026-10-25T02:20:49+00:00',results:[]};
const realNow=Date.now;Date.now=()=>Date.parse('2026-10-25T02:34:00Z');
const calls=[];
global.fetch=async(url,options)=>{
 assert.equal(options.cache,undefined,'Do not require Request.cache support from the hosted Worker');
 assert.equal(options.headers['Cache-Control'],'no-cache');
 const parsed=new URL(url);assert.equal(parsed.origin,'https://raw.githubusercontent.com');calls.push(parsed.pathname);
 if(parsed.pathname.endsWith('/fallback/exacta/20261025/latest.json'))return Response.json(live);
 return new Response('Card pointer temporarily unavailable',{status:503});
};
(async()=>{
 const worker=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
 const request=route=>new Request('https://test.example'+route);
 const response=await worker.fetch(request('/line20261025.html/odds.json?race_key=ignored&bet_type=exacta'));
 assert.equal(response.status,200);assert.deepEqual(await response.json(),live,'An unavailable card pointer must not mask healthy saved odds');
 const config=await (await worker.fetch(request('/line20261025.html/odds-config.json'))).json();
 assert.equal(config.endpoint,'https://raw.githubusercontent.com/itaingtr/keirin-lineup/odds-diagnostics/fallback/exacta/20261025/latest.json');
 assert.ok(calls.some(url=>url.endsWith('/exacta/20261025/latest.json')));
 const historical=await worker.fetch(request('/line20261024.html/odds-config.json'));
 assert.equal(await historical.text(),fs.readFileSync(path.join(__dirname,'../site/line20261024.html/odds-config.json'),'utf8'));
 console.log('PASS live odds survive card-pointer outages, use a compatible uncached request and retain historical configurations');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{Date.now=realNow;});
