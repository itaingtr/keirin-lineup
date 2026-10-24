// Public display-only snapshots written by the repository's unattended runner.
// Runtime requests never collect provider pages or write a database.
const CARD_FEED='https://raw.githubusercontent.com/itaingtr/keirin-lineup/odds-diagnostics/';
const cardPointers=new Map(),cardVersions=new Map(),cardQuotes=new Map();
const CARD_DATE=/^\d{4}-\d{2}-\d{2}$/;
const CARD_FILES=new Set(['media.json','odds-config.json','odds.json']);

async function readCardJson(path){
  const response=await fetch(CARD_FEED+path,{headers:{Accept:'application/json'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw new Error('Saved card unavailable');
  const reader=response.body.getReader();const chunks=[];let size=0;
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>6000000){await reader.cancel();throw new Error('Card exceeds limit');}chunks.push(value);}
  const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
  return {bytes,value:JSON.parse(new TextDecoder().decode(bytes))};
}

function validateCard(pointer,card){
  if(card.schema_version!==1||card.provider!=='winticket'||card.target_date!==pointer.target_date||
     typeof card.html!=='string'||!card.html.includes('<base href="/line'+pointer.target_date.replaceAll('-','')+'.html/">')||
     !card.assets||[...CARD_FILES].some(k=>typeof card.assets[k]!=='string'))throw new Error('Invalid saved card');
  const match=/const races=(.*);\nconst body=/.exec(card.html);
  const races=match?JSON.parse(match[1]):null;
  if(!Array.isArray(races)||!races.length||races.length!==card.summary?.races)throw new Error('Incomplete saved card');
  const paths=new Set(),venues=new Set();let riders=0;
  for(const race of races){
    const source=new URL(race.source);
    const parts=/^\/keirin\/([a-z]+)\/racecard\/(\d{8})\d{2}\/([1-6])\/(\d{1,2})$/.exec(source.pathname);
    if(source.origin!=='https://www.winticket.jp'||!parts||source.search||source.hash||!race.players?.length||race.players.length>9||+parts[4]!==race.race)throw new Error('Wrong saved race');
    const day=new Date(parts[2].slice(0,4)+'-'+parts[2].slice(4,6)+'-'+parts[2].slice(6,8)+'T00:00:00Z');
    day.setUTCDate(day.getUTCDate()+Number(parts[3])-1);
    if(day.toISOString().slice(0,10)!==card.target_date)throw new Error('Race has another date');
    paths.add(source.pathname.replace('/racecard/','/raceresult/'));venues.add('/keirin/'+parts[1]+'/live');
    riders+=race.players.length;
    for(const player of race.players)for(const result of player.meetingResults||[]){
      const u=new URL(result.result_url);
      if(u.origin!=='https://www.winticket.jp'||!/^\/keirin\/[a-z]+\/raceresult\/\d{10}\/[1-6]\/\d{1,2}$/.test(u.pathname)||u.search||u.hash)throw new Error('Invalid prior result');
      paths.add(u.pathname);
    }
  }
  if(riders!==card.summary.riders)throw new Error('Incomplete saved riders');
  return {...card,paths,venues};
}

async function savedCard(day=null){
  const key=day||'current';const cached=cardPointers.get(key);
  if(cached&&Date.now()-cached.at<60000)return cached.card;
  try{
    if(day&&!/^\d{8}$/.test(day))throw new Error('Invalid date');
    const {value:p}=await readCardJson(day?'fallback/cards/'+day+'/latest.json':'fallback/cards/current.json');
    if(p.schema_version!==1||p.provider!=='winticket'||!CARD_DATE.test(p.target_date)||
       !/^run-\d+-\d+$/.test(p.revision)||! /^[a-f0-9]{64}$/.test(p.sha256)||
       p.path!=='fallback/cards/'+p.target_date.replaceAll('-','')+'/runs/'+p.revision+'.json'||
       day&&p.target_date.replaceAll('-','')!==day)throw new Error('Invalid pointer');
    if(cached?.card&&p.target_date<cached.card.target_date)throw new Error('Refusing card regression');
    let card=cardVersions.get(p.sha256);
    if(!card){
      const {bytes,value}=await readCardJson(p.path);
      const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
      if(hash!==p.sha256)throw new Error('Saved card checksum differs');
      card=validateCard(p,value);
      if(cardVersions.size>=16)cardVersions.delete(cardVersions.keys().next().value);
      cardVersions.set(p.sha256,card);
    }
    cardPointers.set(key,{at:Date.now(),card});return card;
  }catch(_){cardPointers.set(key,{at:Date.now(),card:cached?.card||null});return cached?.card||null;}
}

async function scheduledAsset(path){
  if(path==='/'||path==='/index.html'){
    const card=await savedCard();
    // Never roll an embedded/current page back to an older feed.
    const base=ASSETS['/index.html'].body.match(/<base href="\/line(\d{8})\.html\//)?.[1]||'00000000';
    return card&&card.target_date.replaceAll('-','')>=base?{body:card.html,type:'text/html; charset=utf-8'}:null;
  }
  const match=/^\/line(\d{8})\.html(?:\/(index\.html|media\.json|odds-config\.json|odds\.json)?)?$/.exec(path);
  if(!match||match[1]<'20261025'&&ASSETS['/line'+match[1]+'.html/index.html'])return null;
  const card=await savedCard(match[1]);if(!card)return null;
  const file=match[2]||'index.html';
  if(file==='index.html')return {body:card.html,type:'text/html; charset=utf-8'};
  let body=card.assets[file];
  const local=new Date(Date.now()+9*3600000).toISOString();
  if(file==='odds.json'&&(local.slice(0,10)>card.target_date||local.slice(0,10)===card.target_date&&Number(local.slice(11,13))>=9)){
    try{
      const {value}=await readCardJson('fallback/exacta/'+match[1]+'/latest.json');
      if(value.provider!=='winticket'||value.target_date!==card.target_date||!Array.isArray(value.results))throw new Error('Wrong saved odds');
      body=JSON.stringify(value);cardQuotes.set(match[1],body);
    }catch(_){body=cardQuotes.get(match[1])||body;}
  }
  return {body,type:'application/json; charset=utf-8'};
}
