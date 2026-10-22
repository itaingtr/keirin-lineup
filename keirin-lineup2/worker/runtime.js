const mediaCache=new Map();

export function parsePublicState(html){
  const match=/window\.__PRELOADED_STATE__\s*=\s*/.exec(html);
  if(!match)throw new Error('Public race data is unavailable');
  const start=match.index+match[0].length;
  if(html[start]!=='{')throw new Error('Invalid public state');
  let depth=0,quote=false,escaped=false;
  for(let i=start;i<html.length;i++){
    const c=html[i];
    if(quote){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quote=false;continue;}
    if(c==='"')quote=true;
    else if(c==='{')depth++;
    else if(c==='}'&&--depth===0){
      const state=JSON.parse(html.slice(start,i+1));
      if(state.redux?.user?.loggedIn!==false||!Array.isArray(state.tanStackQuery?.queries))throw new Error('Expected logged-out public data');
      return state;
    }
  }
  throw new Error('Incomplete public state');
}

function query(state,operation,params){
  const rows=state.tanStackQuery.queries.filter(q=>q.queryKey?.[1]===operation&&q.queryKey[2]&&Object.keys(q.queryKey[2]).length===Object.keys(params).length&&Object.keys(params).every(k=>q.queryKey[2][k]===params[k]));
  if(rows.length!==1||rows[0].state?.status!=='success')throw new Error('Official media metadata is unavailable');
  return rows[0].state.data;
}

async function readPublic(url){
  const response=await fetch(url,{headers:{'Accept':'text/html','User-Agent':'KeirinLineup2/1.0'},redirect:'error',signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new Error('Official source returned '+response.status);
  const reader=response.body.getReader();let size=0;const chunks=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>6000000){await reader.cancel();throw new Error('Source exceeds size limit');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
  return parsePublicState(new TextDecoder().decode(bytes));
}

function checkedMedia(src,slug){
  const u=new URL(src);
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash)throw new Error('Unexpected media URL');
  if(slug){if(u.hostname!=='keirin-'+slug+'.winticket.live'||!/^\/out\/v1\/[a-f0-9]{32}\/index\.m3u8$/.test(u.pathname))throw new Error('Unexpected live source');}
  else if(u.hostname!=='video.winticket.jp'||!/^\/keirin\/digest\/[A-Za-z0-9_-]+\.mp4$/.test(u.pathname))throw new Error('Unexpected video source');
  return u.href;
}

export async function resolveMedia(url){
  const kind=url.searchParams.get('kind');
  if(kind==='digest'){
    const race=ALLOWED_RACES[url.searchParams.get('race')];
    if(!race)throw new Error('Unknown race');
    const state=await readPublic(race.source);
    const data=query(state,'FETCH_KEIRIN_RACE',{cupId:race.cup,index:race.day,raceNumber:race.number});
    if(data.race?.id!==race.id||data.schedule?.cupId!==race.cup||data.schedule?.index!==race.day)throw new Error('Wrong media race identity');
    const src=data.race.hasDigestVideo&&data.race.digestVideoProvider===0?checkedMedia(data.race.digestVideo):null;
    return {kind,provider:'winticket',src,status:src?'available':'unpublished',source_url:race.source,observed_at:new Date().toISOString()};
  }
  if(kind==='live'){
    const venue=VENUES[url.searchParams.get('venue')];if(!venue)throw new Error('Unknown venue');
    const source='https://www.winticket.jp/keirin/'+venue.slug+'/live';
    const state=await readPublic(source);const data=query(state,'FETCH_BROADCAST_TIMETABLE',{sport:0});
    const now=Date.now()/1000;
    const programs=data.channels.filter(c=>c.venueId===venue.code).flatMap(c=>c.programs||[]).filter(p=>p.videoProvider===0&&p.startAt<=now&&p.endAt>=now);
    if(programs.length>1)throw new Error('Ambiguous official broadcast');
    const src=programs.length?checkedMedia(programs[0].hls,venue.slug):null;
    return {kind,provider:'winticket',src,status:src?'available':'offline',venue_slug:venue.slug,source_url:source,observed_at:new Date().toISOString()};
  }
  throw new Error('Unknown media kind');
}

function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});}

export default{async fetch(request){
  const url=new URL(request.url);
  if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Method not allowed',{status:405});
  if(url.pathname==='/open-web'){
    // Keep the clicked link on this origin, then follow a normal same-tab HTTP
    // redirect to the official browser page. Never use an app URL or iframe.
    let target;
    try{target=new URL(url.searchParams.get('to'));}catch(_){return new Response('Invalid official page',{status:400});}
    const resultPath=target.pathname.replace('/racecard/','/raceresult/');
    const live=Object.values(VENUES).some(v=>target.pathname==='/keirin/'+v.slug+'/live');
    const params=[...target.searchParams.keys()];
    const selected=target.searchParams.get('playerIds');
    if(target.origin!=='https://www.winticket.jp'||target.username||target.password||target.port||target.hash||
       !(ALLOWED_RACES[resultPath]||live)||params.some(k=>k!=='playerIds')||params.length>1||
       (selected!==null&&!/^[A-Za-z0-9_-]{1,80}$/.test(selected))||live&&params.length){
      return new Response('Unknown official page',{status:400});
    }
    return new Response(null,{status:302,headers:{'location':target.href,'cache-control':'no-store'}});
  }
  if(url.pathname==='/api/media'){
    if(request.method==='HEAD')return new Response(null,{status:405});
    const kind=url.searchParams.get('kind');
    if(kind==='digest'&&!ALLOWED_RACES[url.searchParams.get('race')]||kind==='live'&&!VENUES[url.searchParams.get('venue')]||!['digest','live'].includes(kind))return json({error:'Unknown media request'},400);
    const key=url.searchParams.toString();const cached=mediaCache.get(key);
    if(cached&&Date.now()-cached.at<30000)return json(cached.data);
    try{const data=await resolveMedia(url);if(mediaCache.size>=64)mediaCache.delete(mediaCache.keys().next().value);mediaCache.set(key,{at:Date.now(),data});return json(data);}
    catch(_){return json({error:'Official media information is temporarily unavailable'},502);}
  }
  let path=url.pathname;if(path.endsWith('/'))path+='index.html';
  const asset=ASSETS[path]||ASSETS[path+'/index.html'];if(!asset)return new Response('Not found',{status:404});
  return new Response(request.method==='HEAD'?null:asset.body,{headers:{'content-type':asset.type,'cache-control':path.endsWith('.html')||path.endsWith('.json')?'no-store':'private, max-age=3600','x-content-type-options':'nosniff'}});
}};
