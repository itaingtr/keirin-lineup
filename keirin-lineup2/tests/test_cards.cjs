const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const {createHash,webcrypto}=require('node:crypto');
global.crypto=webcrypto;
const root=path.resolve(__dirname,'..');const source=fs.readFileSync(path.join(root,'dist/server/index.js'),'utf8');
const original=fs.readFileSync(path.join(root,'site/index.html'),'utf8');
const race=JSON.parse(/const races=(.*);\nconst body=/.exec(original)[1])[0];
race.race=1;race.source='https://www.winticket.jp/keirin/kumamoto/racecard/2026112587/1/1';
race.players.forEach(p=>p.meetingResults=[]);
const html=original.replace(/const races=.*;\nconst body=/,'const races='+JSON.stringify([race])+';\nconst body=').replace(/<base href="\/line\d{8}\.html\//,'<base href="/line20261125.html/');
const card={schema_version:1,provider:'winticket',target_date:'2026-11-25',html,
 assets:{'media.json':'{}','odds-config.json':'{"endpoint":"./odds.json"}','odds.json':'{"provider":"winticket","target_date":"2026-11-25","results":[]}'},
 summary:{races:1,riders:race.players.length}};
const bytes=JSON.stringify(card)+'\n';
const pointer={schema_version:1,provider:'winticket',target_date:card.target_date,revision:'run-1-1',path:'fallback/cards/20261125/runs/run-1-1.json',sha256:createHash('sha256').update(bytes).digest('hex')};
let now=Date.parse('2026-11-24T15:30:00Z'),failure=false,tamper=false;const urls=[];
const realNow=Date.now;Date.now=()=>now;
global.fetch=async url=>{
 const u=new URL(url);assert.equal(u.origin,'https://raw.githubusercontent.com');urls.push(u.pathname);
 if(failure)throw new Error('Offline');
 const relative=u.pathname.split('/odds-diagnostics/')[1];
 if(relative===pointer.path)return new Response(tamper?bytes+' ':bytes);
 if(relative==='fallback/cards/current.json'||relative==='fallback/cards/20261125/latest.json')return Response.json(pointer);
 if(relative==='fallback/exacta/20261125/latest.json')return Response.json({provider:'winticket',target_date:card.target_date,results:[],checked_at:'original-source-time'});
 throw new Error('Unexpected read '+relative);
};
const request=p=>new Request('https://test.example'+p);
const load=tag=>import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')+'#'+tag);
(async()=>{
 let worker=(await load('good')).default;
 assert.equal(await (await worker.fetch(request('/'))).text(),html);
 for(const route of ['/line20261125.html','/line20261125.html/','/line20261125.html/index.html'])assert.equal(await (await worker.fetch(request(route))).text(),html);
 assert.equal(await (await worker.fetch(request('/line20261023.html'))).text(),fs.readFileSync(path.join(root,'site/line20261023.html/index.html'),'utf8'));
 await worker.fetch(request('/line20261125.html/odds.json'));
 assert.equal(urls.some(u=>u.includes('/exacta/')),false,'No odds read before 09:00 JST');
 now=Date.parse('2026-11-25T00:00:00Z');
 assert.equal((await (await worker.fetch(request('/line20261125.html/odds.json'))).json()).checked_at,'original-source-time');
 const target=race.source.replace('/racecard/','/raceresult/')+'?playerIds=selected_rider';
 let response=await worker.fetch(request('/open-web?card=20261125&to='+encodeURIComponent(target)));
 assert.equal(response.status,302);assert.equal(response.headers.get('location'),target);
 response=await worker.fetch(request('/open-web?to='+encodeURIComponent(target)));assert.equal(response.status,400);
 response=await worker.fetch(request('/open-web?card=20261125&to='+encodeURIComponent('https://evil.example/')));assert.equal(response.status,400);
 failure=true;now+=61000;
 assert.equal(await (await worker.fetch(request('/'))).text(),html,'Retain last verified card on outage');
 failure=false;tamper=true;worker=(await load('bad-hash')).default;
 assert.equal(await (await worker.fetch(request('/'))).text(),original,'Cold checksum failure preserves embedded page');
 response=await worker.fetch(request('/line20261125.html'));assert.equal(response.status,404);
 Date.now=realNow;
 console.log('PASS scheduled cards: root/date equality, preserved history, immutable checksums, source links, 09:00 odds gate and outage recovery');
})().catch(error=>{Date.now=realNow;console.error(error);process.exitCode=1;});
