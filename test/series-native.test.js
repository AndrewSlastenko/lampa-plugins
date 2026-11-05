const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const file='../series-native.js';
const api=fs.existsSync(require('node:path').join(__dirname,file))?require(file):{};
function setup(options={}) {
 assert.equal(typeof api.install,'function','series adapter must exist');
 const events={},rows={},opened=[],notices=[],values={series_native_skip:true,series_native_next:true};let clock=0,id=0;
 const timers=new Map();
 const follow=(channel)=>({follow:(name,fn)=>(events[channel+name] ||= []).push(fn)});
 const emit=(channel,name,data)=>(events[channel+name]||[]).forEach(fn=>fn(data));
 function Original(object){this.filter=function(items,choice){choice.source=0;};this.contextmenu=function(){};this.destroy=function(){};}
 const registry={online_mod:Original};let activity={component:'online_mod',movie:{id:1396,source:'tmdb',name:'Breaking Bad',original_name:'Breaking Bad'}};
 const L={Listener:follow('global'),Component:{get:k=>registry[k],add:(k,v)=>registry[k]=v},Activity:{active:()=>activity},Platform:{is:n=>n==='android'},
 Storage:{get:(k,f)=>values[k]===undefined?f:values[k],field:k=>k==='player'?'android':values[k]},Noty:{show:t=>notices.push(t)},
 Timeline:{view:h=>({hash:h,time:0,duration:3501,percent:0,...rows[h]}),update:r=>{rows[r.hash]=r;emit('timeline','update',{data:{hash:r.hash,road:r}});},listener:follow('timeline')},
 Android:{openPlayer:(url,data)=>opened.push({url,data})},Player:{listener:follow('player')},PlayerPlaylist:{listener:follow('playlist')}};
 L.Player.play=p=>{let aborted=false;emit('player','create',{data:p,abort:()=>aborted=true});if(!aborted)L.Android.openPlayer(p.url,p);return aborted;};
 L.Player.playlist=p=>emit('playlist','set',{playlist:p,position:0});
 api.install(L,{setTimeout:(fn,ms=0)=>{timers.set(++id,{fn,at:clock+ms});return id;},clearTimeout:k=>timers.delete(k)});
 function advance(ms=0){clock+=ms;for(let n=0;n<50;n++){const next=[...timers].find(([k,v])=>v.at<=clock);if(!next)break;timers.delete(next[0]);next[1].fn();}}
 function component(){c=new (registry.online_mod)(activity);c.filter({voice:['Voice A'],source:['Provider A']},{voice:0});return c;}
 let c;component();
 function item(ep,extra={}) {const h=100+ep;c.contextmenu({view:L.Timeline.view(h),element:{season:1,episode:ep,translate_voice:'Voice A'}});return {url:'https://cdn/ep'+ep+'.mp4?token=x',title:'Unparseable display '+ep,timeline:L.Timeline.view(h),headers:{Referer:'https://provider/'},subtitles:[{url:'https://subs/1',label:'RU'}],...extra};}
 function start(first,list=[first]){L.Player.play(first);L.Player.playlist(list);advance();}
 function result(out,road={time:0,duration:0,percent:100}){L.Timeline.update({hash:out.data.timeline.hash,...road});advance(200);}
 return {L,opened,notices,values,rows,item,start,result,advance,emit,c,registry,component,setActivity:a=>activity=a};
}
test('create waits for playlist and sends exact series metadata without altering original fields',()=>{
 const s=setup(),a=s.item(1),b=s.item(2),before=a.url;
 assert.equal(s.L.Player.play(a),true);assert.equal(s.opened.length,0);
 s.L.Player.playlist([a,b]);s.advance();assert.equal(s.opened.length,1);
 const out=s.opened[0];assert.equal(out.url,before+'#homeafr_series=tmdb:1396:1:1:3');
 assert.deepEqual(out.data.headers,a.headers);assert.deepEqual(out.data.subtitles,a.subtitles);
 assert.equal(out.data.playlist.length,1);assert.equal(out.data.timeline.hash,out.data.playlist[0].timeline.hash);
 assert.notEqual(out.data.timeline.hash,a.timeline.hash);assert.equal(a.url,before);
});
test('normal completion resolves only next episode in retained voice/source and preserves progress',()=>{
 const s=setup(),a=s.item(1);let resolve,calls=0;
 const b=s.item(2,{url:cb=>{calls++;resolve=()=>{b.url='https://cdn/new.mp4';cb();};}});
 s.start(a,[a,b]);s.result(s.opened[0]);assert.equal(calls,1);assert.equal(s.opened.length,1);
 resolve();assert.equal(s.opened.length,2);assert.match(s.opened[1].url,/homeafr_series=tmdb:1396:1:2:3/);
 assert.equal(s.rows[101].percent,100);
});
test('Back at rounded100 percent records position without next; duplicate completion cannot advance',()=>{
 const s=setup(),a=s.item(1),b=s.item(2);s.start(a,[a,b]);s.result(s.opened[0],{time:3501,duration:3501,percent:100});
 assert.equal(s.opened.length,1);assert.equal(s.rows[101].time,3501);
 s.result(s.opened[0]);assert.equal(s.opened.length,1);
});
test('old same-episode native result cannot finish a reopened launch',()=>{
 const s=setup(),a=s.item(1),b=s.item(2);s.start(a,[a,b]);const old=s.opened[0];s.start(a,[a,b]);
 assert.notEqual(old.data.timeline.hash,s.opened[1].data.timeline.hash);s.result(old);assert.equal(s.opened.length,2);
 s.result(s.opened[1]);assert.equal(s.opened.length,3);
});
test('navigation and source refresh invalidate pending lazy resolution',()=>{
 for(const leave of [s=>s.setActivity({component:'full'}),s=>s.c.filter({voice:['B'],source:['P']},{voice:0}),s=>s.c.destroy()]){
  const s=setup(),a=s.item(1);let done;const b=s.item(2,{url:cb=>done=()=>{b.url='https://cdn/new';cb();}});
  s.start(a,[a,b]);s.result(s.opened[0]);leave(s);done();assert.equal(s.opened.length,1);
 }
});
test('failed/empty and timed-out next stay in episode list without opening an invalid stream',()=>{
 for(const mode of ['empty','timeout']){
  const s=setup(),a=s.item(1);const b=s.item(2,{url:cb=>{if(mode==='empty'){b.url='';cb();}}});
  s.start(a,[a,b]);s.result(s.opened[0]);s.advance(30000);assert.equal(s.opened.length,1);assert.ok(s.notices.length);
 }
});
test('missing next metadata or last episode never guesses another episode',()=>{
 const s=setup(),a=s.item(1);s.start(a,[a,{url:'https://cdn/unknown',timeline:{hash:999}}]);s.result(s.opened[0]);assert.equal(s.opened.length,1);
 const t=setup(),b=t.item(1);t.start(b);t.result(t.opened[0]);assert.equal(t.opened.length,1);
});
test('unknown shows, films and disabled adapter pass through; titles never supply identity',()=>{
 for(const movie of [{id:42,source:'cub',original_name:'X'},{id:1396,source:'tmdb',title:'Film'},{original_name:'Unknown'}]){
  const s=setup();s.setActivity({component:'online_mod',movie});s.c=s.component();const a=s.item(1);s.start(a);assert.equal(s.opened[0].data,a);
 }
 const s=setup(),a=s.item(1);s.values.series_native_skip=false;s.values.series_native_next=false;s.start(a);assert.equal(s.opened[0].data,a);
});
test('skip and auto-next toggles are independent and a foreign native launch cancels advancement',()=>{
 const s=setup(),a=s.item(1),b=s.item(2);s.values.series_native_skip=false;s.start(a,[a,b]);assert.equal(s.opened[0].url,a.url);
 s.L.Android.openPlayer('https://other',{title:'Other'});s.result(s.opened[0]);assert.equal(s.opened.length,2);
 const t=setup(),c=t.item(1),d=t.item(2);t.values.series_native_next=false;t.start(c,[c,d]);t.result(t.opened[0]);assert.equal(t.opened.length,1);
});
test('component re-registration and duplicate extension load preserve hooks without duplicate player launch',()=>{
 const s=setup();s.L.Component.add('online_mod',function(){this.contextmenu=function(){};this.filter=function(){};});s.c=s.component();const a=s.item(1);s.start(a);assert.equal(s.opened.length,1);
 assert.equal(api.install(s.L),false);
});

test('navigate away and back cannot revive an old next resolver',()=>{
 const s=setup(),a=s.item(1);let done;const b=s.item(2,{url:cb=>done=()=>{b.url='https://cdn/new';cb();}});
 s.start(a,[a,b]);s.result(s.opened[0]);
 s.emit('global','activity',{type:'init',object:{component:'full'}});
 done();assert.equal(s.opened.length,1);
});
test('native correlation is ephemeral and old results never reach storage/sync',()=>{
 const s=setup(),a=s.item(1),b=s.item(2);s.start(a,[a,b]);const hash=s.opened[0].data.timeline.hash;
 assert.equal(s.rows[hash],undefined);assert.equal(s.L.Timeline.view(hash).duration,3501);
 s.result(s.opened[0]);assert.equal(s.rows[hash],undefined);s.L.Timeline.update({hash,time:0,duration:0,percent:100});
 assert.equal(s.rows[hash],undefined);assert.equal(s.rows[101].percent,100);
});

test('torrent handoff annotates every explicit episode independently and preserves native playlist/preload',()=>{
 const s=setup(),card={id:1396,source:'tmdb',original_name:'Breaking Bad'};
 const a={url:'http://box:8090/stream?index=1',path:'Show.S01E01.1080p.mkv',season:1,episode:1,card,torrent_hash:'abc',timeline:{hash:22},headers:{X:'y'}};
 const b={...a,url:'http://box:8090/stream?index=2',path:'Show.S01E02.mkv',episode:2,timeline:{hash:23}};
 a.playlist=[a,b];s.L.Android.openPlayer(a.url,a);
 const out=s.opened[0];assert.match(out.url,/homeafr_series=tmdb:1396:1:1:3/);
 assert.match(out.data.playlist[1].url,/homeafr_series=tmdb:1396:1:2:3/);
 assert.equal(out.data.timeline,a.timeline);assert.equal(out.data.torrent_hash,'abc');assert.deepEqual(out.data.headers,a.headers);
 assert.equal(a.url,'http://box:8090/stream?index=1');assert.equal(out.data.playlist.length,2);
});
test('torrent ambiguity, parser mismatch, multi-episode files and films never acquire guessed timing',()=>{
 for(const path of ['01.mkv','Show.1080p.mkv','Show.S02E01.mkv','Show.S01E01E02.mkv','Show.S01E01-E02.mkv']){
  const s=setup(),a={url:'http://box/stream',path,season:1,episode:1,torrent_hash:'abc',card:{id:1396,original_name:'Show'}};
  s.L.Android.openPlayer(a.url,a);assert.equal(s.opened[0].url,a.url,path);
 }
});
test('raw season folder plus explicit episode token is accepted without reading display title',()=>{
 const s=setup(),a={url:'http://box/stream#keep=1',path:'Season 2/E03.mkv',season:2,episode:3,torrent_hash:'abc',card:{id:1396,original_name:'Show'},title:'Misleading S99E99'};
 s.L.Android.openPlayer(a.url,a);assert.equal(s.opened[0].url,a.url+'&homeafr_series=tmdb:1396:2:3:3');
});

test('season folder never selects a second token from a multi-episode file',()=>{
 for(const [path,episode] of [['Season 1/E01-E02.mkv',2],['Season 1/E01 and E02.mkv',1],['Season 1/Show.S01E01-E02.mkv',2],['Season 1/E01-02.mkv',1],['Season 1/E01+02.mkv',1]]){
  const s=setup(),a={url:'http://box/stream',path,season:1,episode,torrent_hash:'abc',card:{id:1396,original_name:'Show'}};
  s.L.Android.openPlayer(a.url,a);assert.equal(s.opened[0].url,a.url,path);
 }
});

test('structured BWA-style episodes capture show before native handoff and preserve provider playlist',()=>{
 const s=setup();s.setActivity({component:'bwa',movie:{id:1396,original_name:'Breaking Bad',source:'tmdb'}});
 const a={url:'https://cdn/pilot',season:1,episode:1,timeline:{hash:71},title:'Not parsed'};
 const b={url:'https://cdn/two',season:1,episode:2,timeline:{hash:72}};a.playlist=[a,b];
 s.L.Player.play(a);assert.match(s.opened[0].url,/homeafr_series=tmdb:1396:1:1:3/);
 assert.match(s.opened[0].data.playlist[1].url,/homeafr_series=tmdb:1396:1:2:3/);
 assert.equal(s.opened[0].data.playlist[0].timeline,a.timeline);
});
test('structured native payload uses its own card and does not infer episodes from title',()=>{
 const s=setup(),a={url:'https://cdn/one',card:{id:1396,original_name:'X'},season:1,episode:1};s.L.Android.openPlayer(a.url,a);
 assert.match(s.opened[0].url,/homeafr_series=tmdb:1396:1:1:3/);
 const b={url:'https://cdn/unknown',card:{id:1396,original_name:'X'},title:'S01E01'};s.L.Android.openPlayer(b.url,b);assert.equal(s.opened[1].url,b.url);
});
