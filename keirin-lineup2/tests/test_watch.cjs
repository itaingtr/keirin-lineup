const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'../site');
const source=JSON.parse(fs.readFileSync(path.join(root,'media.json'),'utf8'));
const html=fs.readFileSync(path.join(root,'watch.html'),'utf8');
const script=fs.readFileSync(path.join(root,'watch.js'),'utf8');
const pause=()=>new Promise(resolve=>setTimeout(resolve,20));

async function open(query,{data=source,native=false,blocked=false,fatal=false,unavailable=false,outside=false}={}) {
  const events={}, state={played:0,destroyed:0};
  const venue=data.venues[new URLSearchParams(query).get('venue')] || Object.values(data.venues).find(v=>v.hls);
  const now=(outside ? venue?.end_at+30 : venue?.start_at+30)*1000;
  class Hls {
    static Events={ERROR:'error',MANIFEST_PARSED:'manifest'};
    static isSupported(){return !unavailable;}
    on(event,callback){events[event]=callback;}
    loadSource(src){state.hls=src;}
    attachMedia(){queueMicrotask(()=>events.manifest?.());}
    destroy(){state.destroyed++;}
  }
  const dom=new JSDOM(html,{url:'https://preview.example/watch.html?'+query,runScripts:'dangerously',beforeParse(w){
    w.Date.now=()=>now;
    w.Hls=Hls;
    w.fetch=async url=>{assert.equal(url,'./media.json');return {ok:true,json:async()=>data};};
    w.HTMLMediaElement.prototype.play=function(){state.played++;return blocked?Promise.reject(new Error('NotAllowedError')):Promise.resolve();};
    w.HTMLMediaElement.prototype.load=function(){};
    w.HTMLMediaElement.prototype.canPlayType=()=>native?'probably':'';
  }});
  dom.window.eval(script); await pause();
  const doc=dom.window.document;
  if(fatal){events.error?.('error',{fatal:true});await pause();}
  return {dom,doc,state,events};
}

(async()=>{
  const digest=source.races.find(r=>r.digest);
  let test=await open('kind=digest&race='+encodeURIComponent(new URL(digest.source_url).pathname));
  assert.equal(test.doc.getElementById('video').src,digest.digest);
  assert.equal(test.state.played,1); test.dom.window.close();
  const live=Object.entries(source.venues).find(([_,v])=>v.hls);
  for(const [code,venue] of Object.entries(source.venues)) {
    if(!venue.hls) continue;
    test=await open('kind=live&venue='+code);
    assert.equal(test.state.hls,venue.hls);test.dom.window.close();
  }
  test=await open('kind=live&venue='+live[0]);
  assert.equal(test.state.hls,live[1].hls);assert.equal(test.state.played,1);test.dom.window.close();
  test=await open('kind=live&venue='+live[0],{native:true});
  assert.equal(test.doc.getElementById('video').src,live[1].hls);assert.equal(test.state.hls,undefined);test.dom.window.close();
  test=await open('kind=live&venue='+live[0],{blocked:true});
  assert.equal(test.doc.getElementById('play').hidden,false);test.doc.getElementById('play').click();await pause();assert.equal(test.state.played,2);test.dom.window.close();
  test=await open('kind=live&venue='+live[0],{fatal:true});
  assert.equal(test.state.destroyed,1);assert.match(test.doc.getElementById('status').textContent,/読み込めません/);test.dom.window.close();
  test=await open('kind=live&venue='+live[0],{unavailable:true});
  assert.equal(test.state.played,0);assert.match(test.doc.getElementById('status').textContent,/このブラウザー/);test.dom.window.close();
  test=await open('kind=live&venue='+live[0],{outside:true});
  assert.equal(test.state.played,0);assert.match(test.doc.getElementById('status').textContent,/配信時間外/);test.dom.window.close();
  const pending=source.races.find(r=>!r.digest);
  if(pending){test=await open('kind=digest&race='+encodeURIComponent(new URL(pending.source_url).pathname));assert.equal(test.state.played,0);assert.match(test.doc.getElementById('status').textContent,/未公開/);test.dom.window.close();}
  const unsafe=JSON.parse(JSON.stringify(source));unsafe.venues[live[0]].hls='https://evil.example/stream.m3u8';
  test=await open('kind=live&venue='+live[0],{data:unsafe});assert.equal(test.state.played,0);assert.equal(test.state.hls,undefined);test.dom.window.close();
  test=await open('kind=digest&race=/unknown');assert.equal(test.state.played,0);test.dom.window.close();
  console.log('PASS exact race video, native HLS, desktop HLS, autoplay fallback, unavailable video, fatal network error and invalid sources');
})().catch(e=>{console.error(e);process.exitCode=1;});
