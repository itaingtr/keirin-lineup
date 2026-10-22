const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'dist/server/index.js'),'utf8');
const viewer=JSON.parse(fs.readFileSync(path.join(root,'site/line20261021.html/viewer.json'),'utf8'));
let sequence=0,calls=[],mode='normal';
const card=viewer.results[0],racePath=new URL(card.source_url).pathname;
const state=data=>'<script>window.__PRELOADED_STATE__ = '+JSON.stringify({redux:{user:{loggedIn:mode!=='logged-in'?false:true}},tanStackQuery:{queries:[data]}})+';</script>';
global.fetch=async(url,options)=>{
 calls.push({url,options});assert.equal(new URL(url).hostname,'www.winticket.jp');assert.equal(options.redirect,'error');assert.equal(options.headers.Cookie,undefined);assert.equal(options.headers.Authorization,undefined);
 if(mode==='http-error')return new Response('unavailable',{status:503});
 if(String(url).endsWith('/live')){
  const venue=Object.entries(viewer.media.venues).find(([,v])=>String(url).includes('/'+v.slug+'/'));
  const hls='https://keirin-'+venue[1].slug+'.winticket.live/out/v1/'+'a'.repeat(32)+'/index.m3u8';
  const now=Date.now()/1000;
  return new Response(state({queryKey:['broadcast','FETCH_BROADCAST_TIMETABLE',{sport:0}],state:{status:'success',data:{channels:[{venueId:venue[0],programs:[{videoProvider:0,startAt:now-60,endAt:now+60,hls}]}]}}}));
 }
 const params={raceNumber:card.race,index:card.meeting_day,cupId:card.meeting_start+card.venue_code};
 const data={race:{id:mode==='wrong-race'?'another-race':card.race_id,hasDigestVideo:true,digestVideoProvider:0,digestVideo:mode==='unsafe-url'?'https://evil.example/movie.mp4':'https://video.winticket.jp/keirin/digest/fresh123.mp4'},schedule:{cupId:params.cupId,index:params.index},note:'braces } and escaped " { stay JSON strings'};
 return new Response(state({queryKey:['keirin/race/common','FETCH_KEIRIN_RACE',params],state:{status:'success',data}}));
};
const moduleFor=()=>import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')+'#'+sequence++);
const request=(query)=>new Request('https://site.example/api/media?'+query);
(async()=>{
 let mod=await moduleFor();
 let response=await mod.default.fetch(new Request('https://site.example/'));
 assert.equal(response.status,200);assert.equal(await response.text(),fs.readFileSync(path.join(root,'site/index.html'),'utf8'));
 response=await mod.default.fetch(new Request('https://site.example/line20261022.html/'));assert.equal(response.status,200);assert.equal(await response.text(),fs.readFileSync(path.join(root,'site/line20261022.html/index.html'),'utf8'));
 response=await mod.default.fetch(new Request('https://site.example/line20261021.html/'));assert.equal(response.status,200);assert.match(await response.text(),/data-web-navigation/);
 response=await mod.default.fetch(new Request('https://site.example/line20261021.html'));assert.equal(response.status,200);
 response=await mod.default.fetch(new Request('https://site.example/line20261022.html'));assert.equal(response.status,200);
 response=await mod.default.fetch(request('kind=digest&race=https://evil.example/'));assert.equal(response.status,400);assert.equal(calls.length,0);
 const query='kind=digest&race='+encodeURIComponent(racePath);
 response=await mod.default.fetch(request(query));assert.equal(response.status,200);assert.equal((await response.json()).src,'https://video.winticket.jp/keirin/digest/fresh123.mp4');
 const count=calls.length;await mod.default.fetch(request(query));assert.equal(calls.length,count);
 for(const failure of ['logged-in','wrong-race','unsafe-url','http-error']){mode=failure;mod=await moduleFor();response=await mod.default.fetch(request(query));assert.equal(response.status,502,failure);}
 mode='normal';mod=await moduleFor();const venue=Object.keys(viewer.media.venues)[0];response=await mod.default.fetch(request('kind=live&venue='+venue));assert.equal(response.status,200);assert.match((await response.json()).src,/winticket\.live/);
 console.log('PASS Worker routes, public-state parsing, fresh media, cache, source identity, no credential forwarding and rejected unsafe requests');
})().catch(e=>{console.error(e);process.exitCode=1;});
