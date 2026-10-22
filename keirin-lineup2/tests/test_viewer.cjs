const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'../site');
const sourceUrl=element=>element.dataset.sourceUrl||element.href;
const script=fs.readFileSync(path.join(root,'viewer.js'),'utf8');
const pause=()=>new Promise(r=>setTimeout(r,10));

async function check(location,dir=""){
 const html=fs.readFileSync(path.join(root,dir,"index.html"),"utf8");
 const data=JSON.parse(fs.readFileSync(path.join(root,dir,"viewer.json"),"utf8"));
 const viewerPath="/"+(dir?dir+"/":"")+"viewer.json";
 const tracked={opened:0,plays:0,pauses:0,destroyed:0,blocked:false,api:[]};let currentHls;
 class Hls{
  static Events={ERROR:'error',MANIFEST_PARSED:'manifest'};static isSupported(){return true;}
  constructor(){this.events={};currentHls=this;}
  on(e,cb){this.events[e]=cb;}loadSource(src){tracked.hls=src;}attachMedia(){queueMicrotask(()=>this.events.manifest?.());}destroy(){tracked.destroyed++;}
 }
 const dom=new JSDOM(html,{url:location,runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){
  w.matchMedia=()=>({matches:false});w.open=()=>{tracked.opened++;throw Error('External window opened');};w.Hls=Hls;
  w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
  w.HTMLMediaElement.prototype.play=function(){tracked.plays++;return tracked.blocked?Promise.reject(Error('autoplay blocked')):Promise.resolve();};
  w.HTMLMediaElement.prototype.pause=function(){tracked.pauses++;};w.HTMLMediaElement.prototype.load=function(){};w.HTMLMediaElement.prototype.canPlayType=()=>'';
  w.fetch=async(input)=>{
   const url=new URL(String(input),w.document.baseURI);
   assert.equal(url.origin,'https://preview.example');
   if(url.pathname===viewerPath)return {ok:true,json:async()=>data};
   assert.equal(url.pathname,'/api/media');tracked.api.push(url);
   const live=url.searchParams.get('kind')==='live';const venue=live?data.media.venues[url.searchParams.get('venue')]:null;
   return {ok:true,json:async()=>({provider:'winticket',kind:live?'live':'digest',status:'available',src:live?'https://keirin-'+venue.slug+'.winticket.live/out/v1/'+'a'.repeat(32)+'/index.m3u8':'https://video.winticket.jp/keirin/digest/fresh123.mp4',venue_slug:venue?.slug,observed_at:'2026-10-22T08:00:00Z'})};
  };
 }});
 const w=dom.window,doc=w.document;
 if(!dir||dir==='line20261022.html'){
  assert.equal(doc.body.dataset.inlineViewer,'20261022b');
  assert.match(doc.querySelector('script[src*="viewer.js"]').src,/inline-20261022b/);
  for(const control of doc.querySelectorAll('.meeting-order,.video-link')){assert.equal(control.tagName,'BUTTON');assert.equal(control.type,'button');assert.equal(control.hasAttribute('href'),false);assert.equal(control.hasAttribute('target'),false);}
 }
 const pending=doc.querySelector('.meeting-order')||doc.querySelector('.video-link');pending.click();assert.equal(w.location.href,location);assert.equal(w.__lineupPending,pending);
 const style=doc.createElement('style');style.textContent=fs.readFileSync(path.join(root,'viewer.css'),'utf8');doc.head.append(style);w.eval(script);
 const dialog=doc.querySelector('.lineup-viewer');await pause();assert.ok(dialog.open);dialog.querySelector('.viewer-close').click();let checked=0;
 for(const link of doc.querySelectorAll('.meeting-order')){
  const playerId=new URL(sourceUrl(link)).searchParams.get('playerIds');const name=new URL(sourceUrl(link)).pathname;
  const expected=data.results.find(r=>new URL(r.source_url).pathname===name).rows.find(r=>r.player_id===playerId);
  assert.ok(expected);link.click();await pause();
  assert.ok(dialog.open);assert.equal(w.location.href,location);
  const selected=dialog.querySelector('.viewer-selected');assert.ok(selected);assert.equal(selected.querySelector('.viewer-name').textContent,expected.name);
  assert.equal(w.getComputedStyle(selected.querySelector('td')).backgroundColor,'rgb(202, 254, 227)');
  dialog.querySelector('.viewer-close').click();assert.equal(dialog.open,false);assert.equal(doc.activeElement,link);checked++;
 }
 const video=doc.querySelector('.video-link:not(.live-link)');video.click();await pause();assert.equal(dialog.querySelector('video').src,'https://video.winticket.jp/keirin/digest/fresh123.mp4');
 assert.equal(w.location.href,location);dialog.querySelector('.viewer-close').click();assert.ok(tracked.pauses>0);
 tracked.blocked=true;video.click();await pause();assert.equal(dialog.querySelector('.viewer-play').hidden,false);tracked.blocked=false;dialog.querySelector('.viewer-play').click();await pause();dialog.querySelector('.viewer-close').click();
 const seen=new Set();for(const live of doc.querySelectorAll('.live-link')){
  const venue=live.closest('tr').querySelector('.venue').textContent;if(seen.has(venue))continue;seen.add(venue);
  live.click();await pause();assert.match(tracked.hls,/winticket\.live/);const before=tracked.destroyed;
  dialog.dispatchEvent(new w.Event('cancel',{cancelable:true}));assert.equal(dialog.open,false);assert.equal(tracked.destroyed,before+1);
 }
 assert.equal(tracked.opened,0);assert.equal(w.location.href,location);assert.equal(doc.body.classList.contains('viewer-open'),false);
 assert.equal(tracked.api.every(u=>u.pathname==='/api/media'),true);
 dom.window.close();return checked;
}
(async()=>{let checked=0;for(const [url,dir] of [['https://preview.example/',''],['https://preview.example/line20261022.html',''],['https://preview.example/line20261022.html/',''],['https://preview.example/line20261021.html','line20261021.html'],['https://preview.example/line20261021.html/','line20261021.html']])checked+=await check(url,dir);console.log(`PASS ${checked} inline result selections across root/Oct22/Oct21, green backgrounds, button-only actions, queued clicks, inline video/live, close/ESC cleanup and unchanged page URLs`);})().catch(e=>{console.error(e);process.exitCode=1;});
