// Validate actual newly collected odds through the exact Site Worker artifact.
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {execFileSync}=require('node:child_process');const {webcrypto}=require('node:crypto');global.crypto=webcrypto;
const report=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const expected=JSON.parse(fs.readFileSync(report.local_feed,'utf8'));
const root=path.resolve(__dirname,'..');
const gitRead=p=>execFileSync('git',['show','FETCH_HEAD:'+p],{encoding:'utf8',maxBuffer:6000000});
global.fetch=async(url,options)=>{
 assert.equal(options.cache,undefined,'Unsupported Request.cache can hide successful collections');
 assert.equal(options.headers['Cache-Control'],'no-cache');
 const parsed=new URL(url);assert.equal(parsed.origin,'https://raw.githubusercontent.com');
 const file=parsed.pathname.split('/odds-diagnostics/')[1];assert.ok(file);
 if(file==='fallback/exacta/'+report.target_date.replaceAll('-','')+'/latest.json')return Response.json(expected);
 try{return new Response(gitRead(file),{headers:{'content-type':'application/json'}});}
 catch(_){return new Response('Missing saved card',{status:404});}
};
(async()=>{
 const source=fs.readFileSync(path.join(root,'dist/server/index.js'),'utf8');
 const worker=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
 const route='https://site.example/line'+report.target_date.replaceAll('-','')+'.html/';
 const response=await worker.fetch(new Request(route+'odds.json'));
 assert.equal(response.status,200);const actual=await response.json();
 assert.deepEqual(actual,expected,'The Site must deliver the collected feed, not the night-time unavailable stub');
 const config=await (await worker.fetch(new Request(route+'odds-config.json'))).json();
 assert.equal(config.endpoint,report.endpoint);
 let pairs=0,snapshots=0;
 for(const result of actual.results)if(result.ok&&result.snapshot.status==='snapshot'){
  const s=result.snapshot;assert.equal(s.provider,'winticket');assert.equal(s.bet_type,'exacta');
  assert.ok(s.observed_at);assert.equal(s.odds.length,s.rider_numbers.length*(s.rider_numbers.length-1));
  snapshots++;pairs+=s.odds.length;
 }
 console.log('SITE ODDS DELIVERY PASS',JSON.stringify({target_date:report.target_date,races:actual.results.length,snapshots,pairs,checked_at:actual.checked_at,endpoint:config.endpoint}));
})().catch(error=>{console.error(error);process.exitCode=1;});
