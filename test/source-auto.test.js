const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const api=fs.existsSync(require('node:path').join(__dirname,'../source-auto.js'))?require('../source-auto.js'):{};
const voice=(name,q='1080p',url='https://cdn.example/video')=>({voice:name,raw:name,qualities:{[q]:{url}},order:[q]});
function ranked(groups,source='veoveo'){assert.equal(typeof api.candidates,'function','candidate policy must exist');return api.candidates({source,voices:groups});}
test('familiar Russian voice wins over higher resolution and aliases share a tier',()=>{
 const list=ranked([voice('LostFilm','2160p'),voice('TVShows','1080p'),voice('HDRezka Studio','1080p'),voice('Red Head Sound','1440p')]);
 assert.equal(api.choose(list).voice,'Red Head Sound');
 assert.equal(api.choose(list.filter(v=>v.voice!=='Red Head Sound')).voice,'TVShows');
 assert.equal(api.choose(ranked([voice('Кубик в кубе'),voice('NewStudio','2160p')])).voice,'Кубик в кубе');
});
test('resolution labels rank actual dimensions and keep a lower-resolution familiar voice',()=>{
 const list=ranked([voice('TVShows','Full HD'),voice('HDrezka Studio','2K'),voice('Red Head Sound','3840x2160')]);
 assert.equal(api.choose(list).quality,'3840x2160');
 assert.equal(api.choose(list.slice(0,2)).quality,'2K');
 assert.equal(api.choose(ranked([voice('TVShows','720p'),voice('LostFilm','4K')])).voice,'TVShows');
});
test('unknown original-language, empty, CAM and non-http streams cannot win automatically',()=>{
 const list=ranked([voice('Original'),voice('English'),voice('ProviderName'),voice('TVShows','1080p',''),voice('LostFilm','CAMRip'),voice('HDrezka','1080p','javascript:alert(1)'),voice('Дублированный')]);
 assert.equal(list.length,1);assert.equal(list[0].voice,'Дублированный');
});
test('saved exact voice and provider beat pixels but missing saved voice is not substituted',()=>{
 const list=[...ranked([voice('LostFilm')]),...ranked([voice('LostFilm','4K'),voice('TVShows','4K')],'hdvb')];
 assert.equal(api.choose(list,{source:'veoveo',voice:'LostFilm'}).source,'veoveo');
 assert.equal(api.choose(list,{source:'veoveo',voice:'AlexFilm'}),null);
});
function harness(responses={}){
 assert.equal(typeof api.createScanner,'function','bounded scanner must exist');
 let now=0,id=0;const timers=new Map(),calls=[];
 const sources=[{id:'veoveo'},{id:'hdvb'},{id:'videodb'},{id:'paid',paid:true},{id:'hidden'}];
 const resolve=(movie,opts,cb)=>{calls.push({movie,opts,cb});const r=responses[opts.source];if(r!=='timeout')cb(null,{source:opts.source,sources,voices:r||[],_meta:{hidden:{avoid:true}}});};
 const scanner=api.createScanner({resolve,now:()=>now,setTimeout:(fn,ms)=>{timers.set(++id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id)});
 function tick(ms){now+=ms;for(let i=0;i<100;i++){const t=[...timers].find(([,v])=>v.at<=now);if(!t)break;timers.delete(t[0]);t[1].fn();}}
 const movie={id:1396,source:'tmdb',name:'Breaking Bad'};
 return {scanner,calls,tick,movie};
}
test('fast scan checks exact episode on three free sources and chooses voice before quality',()=>{
 const h=harness({veoveo:[voice('LostFilm','4K')],hdvb:[voice('TVShows')],videodb:[voice('Red Head Sound','1440p')]});let result;
 h.scanner.scan(h.movie,{season:2,episode:5},r=>result=r);
 assert.deepEqual(h.calls.map(c=>c.opts.source),['veoveo','hdvb','videodb']);
 assert.ok(h.calls.every(c=>c.opts.season===2&&c.opts.episode===5));assert.equal(result.best.voice,'Red Head Sound');
});
test('saved working choice stops after one probe; missing saved voice returns alternatives for confirmation',()=>{
 const h=harness({veoveo:[voice('LostFilm'),voice('TVShows','4K')]});let result;
 h.scanner.scan(h.movie,{season:1,episode:3,preferred:{source:'veoveo',voice:'LostFilm'}},r=>result=r);
 assert.equal(h.calls.length,1);assert.equal(result.best.voice,'LostFilm');
 h.scanner.scan(h.movie,{season:1,episode:4,preferred:{source:'veoveo',voice:'AlexFilm'}},r=>result=r);
 assert.equal(result.best,null);assert.equal(result.needsChoice,true);assert.ok(result.alternatives.length);
});
test('cache is episode-specific, expires, and full rescan bypasses it',()=>{
 const h=harness({veoveo:[voice('TVShows')]});const run=(opts={})=>h.scanner.scan(h.movie,{season:1,episode:1,...opts},()=>{});
 run();const n=h.calls.length;run();assert.equal(h.calls.length,n);
 run({episode:2});assert.ok(h.calls.length>n);const m=h.calls.length;
 run({full:true});assert.ok(h.calls.length>m);const p=h.calls.length;
 h.tick(120001);run();assert.ok(h.calls.length>p);
});
test('timeout completes once, cancellation suppresses late callbacks and malformed result cannot select',()=>{
 const h=harness({veoveo:'timeout'});let count=0,result;
 const cancel=h.scanner.scan(h.movie,{},r=>{count++;result=r;});h.tick(12000);assert.equal(count,1);assert.equal(result.best,null);
 h.calls[0].cb(null,{source:'veoveo',voices:[voice('TVShows')]});assert.equal(count,1);cancel();
 const j=harness({veoveo:'timeout'});let late=0;const stop=j.scanner.scan(j.movie,{},()=>late++);stop();j.calls[0].cb(null,{source:'veoveo',voices:[voice('TVShows')]});j.tick(15000);assert.equal(late,0);
});

function integration({deferred=false,deferredOriginal=false,stored={},serial=true}={}){
 let active={component:'bwa_online',movie:{id:1396,source:'tmdb',...(serial?{name:'Breaking Bad',original_name:'Breaking Bad'}:{title:'Film'})}};
 const values={...stored},launched=[],requests=[],pending=[],originalPending=[],notices=[];const groups=[voice('LostFilm','4K'),voice('TVShows')];
 const flat=g=>({...g,qualities:Object.fromEntries(Object.entries(g.qualities).map(([q,v])=>[q,v.url]))});
 const registry={};
 registry.bwa_online=function(object){
  let source=values.bwa_title_src?.[1396]||'veoveo',selected='LostFilm';
  this.activity={loader:()=>{}};this.loadingSkeleton=()=>{};this.isSerial=()=>serial;
  this.buildFilters=()=>{};this.drawMovie=()=>{};
  this.pickVoice=()=>L.Select.show({title:'Озвучка',items:groups.map((g,index)=>({title:g.voice,index})),onSelect:r=>{selected=groups[r.index].voice;values.bwa_lastvoice={1396:{src:source,voice:selected}};this.buildFilters();}});
  this.pickSource=()=>L.Select.show({title:'Источник',items:[{title:'VeoVeo',source:'veoveo'}],onSelect:()=>{}});
  this.requestStreams=()=>{requests.push(source);this.buildFilters();};
  this.changeBalanser=s=>{values.bwa_title_src={...values.bwa_title_src,1396:s};if(s!==source){source=s;this.requestStreams(true);}};
  this.switchSeason=()=>{};this.destroy=()=>{};
  this.playEpisode=(s,e)=>{const finish=()=>{this.buildFilters();this.playGroupEpisode(flat(groups.find(g=>g.voice===selected)||groups[0]),s,e,groups.map(flat));};if(deferredOriginal)originalPending.push(finish);else finish();};
  this.filterVoice=v=>{selected=v;values.bwa_lastvoice={1396:{src:source,voice:v}};this.buildFilters();};
  this.playGroupEpisode=(group,s,e)=>launched.push({source,group,s,e});this.play=g=>launched.push({source,group:g});
 };
 const L={Component:{get:k=>registry[k],add:(k,v)=>registry[k]=v},Activity:{active:()=>active},
 Storage:{get:(k,f)=>values[k]===undefined?f:values[k],set:(k,v)=>values[k]=v},Noty:{show:t=>notices.push(t)},
 Select:{show:options=>{L.lastMenu=options;},close:()=>{}},Controller:{toggle:()=>{}},SettingsApi:{addParam:()=>{}}};
 const env={BWA_API:{resolve:(m,opts,cb)=>{const finish=()=>cb(null,{source:opts.source,sources:[{id:'veoveo'},{id:'hdvb'},{id:'videodb'}],voices:opts.source==='veoveo'?groups:[voice('TVShows','4K')]});if(deferred)pending.push(finish);else finish();}}};
 assert.equal(api.install(L,env),true,'adapter installs');const c=new registry.bwa_online(active);
 return {L,c,values,launched,requests,pending,originalPending,notices,leave:()=>active={component:'full'},groups};
}
test('initial selection applies preferred voice before rendering without launching on its own',()=>{
 const h=integration();h.c.requestStreams(false);assert.equal(h.launched.length,0);
 assert.equal(h.values.bwa_lastvoice[1396].voice,'TVShows');assert.equal(h.requests[0],'hdvb');
});
test('episode play checks requested coordinates and enforces chosen voice and quality in original launch',()=>{
 const h=integration();h.c.playEpisode(2,5);
 assert.equal(h.launched.length,1);assert.equal(h.launched[0].source,'hdvb');assert.equal(h.launched[0].group.voice,'TVShows');
 assert.deepEqual(Object.keys(h.launched[0].group.qualities),['4K']);assert.equal(h.launched[0].s,2);assert.equal(h.launched[0].e,5);
});
test('manual source/voice selection and activity departure cancel deferred work',()=>{
 for(const action of [h=>h.c.changeBalanser('videodb'),h=>h.c.pickVoice(),h=>h.c.switchSeason(3),h=>h.c.destroy(),h=>h.leave()]){
  const h=integration({deferred:true});h.c.playEpisode(1,1);action(h);h.pending.splice(0).forEach(fn=>fn());assert.equal(h.launched.length,0);h.c.destroy();
 }
});
test('missing saved voice offers manual recovery and never starts an alternative automatically',()=>{
 const h=integration({stored:{bwa_title_src:{1396:'veoveo'},bwa_lastvoice:{1396:{src:'veoveo',voice:'AlexFilm'}}}});h.c.playEpisode(1,5);
 assert.equal(h.launched.length,0);assert.ok(h.L.lastMenu.items.length);assert.match(h.L.lastMenu.title,/озвучк/i);
});
test('disabled selection and missing BWA API preserve normal manual playback',()=>{
 const h=integration({stored:{source_auto_enabled:false}});h.c.playEpisode(1,2);assert.equal(h.launched[0].group.voice,'LostFilm');
});
test('source menu exposes full rescan and manual movie voice remains selected',()=>{
 const h=integration({serial:false});h.c.pickSource();assert.ok(h.L.lastMenu.items.some(x=>x.homeAutoFull));
 h.c.play({...h.groups[0],qualities:{'4K':'https://cdn/4k','1080p':'https://cdn/fhd'}});
 assert.equal(h.launched[0].group.voice,'LostFilm');assert.deepEqual(Object.keys(h.launched[0].group.qualities),['4K']);
});

test('manual source stays selected on the next episode instead of reopening the previous source',()=>{
 const h=integration({stored:{bwa_title_src:{1396:'veoveo'},bwa_lastvoice:{1396:{src:'veoveo',voice:'LostFilm'}}}});
 h.c.changeBalanser('videodb');h.c.playEpisode(1,2);assert.equal(h.launched[0].source,'videodb');
});
test('empty scans are retried and changing saved provider does not reuse a partial cached scan',()=>{
 const h=harness({veoveo:[]});h.scanner.scan(h.movie,{},()=>{});const n=h.calls.length;h.scanner.scan(h.movie,{},()=>{});assert.ok(h.calls.length>n);
 const j=harness({veoveo:[voice('LostFilm')],hdvb:[voice('TVShows')]});let out;
 j.scanner.scan(j.movie,{preferred:{source:'veoveo',voice:'LostFilm'}},()=>{});
 j.scanner.scan(j.movie,{preferred:{source:'hdvb',voice:'TVShows'}},r=>out=r);assert.equal(out.best.source,'hdvb');
});

test('automatic launch uses the resolved episode instead of issuing an unguarded second fetch',()=>{
 const h=integration({deferredOriginal:true});h.c.playEpisode(1,2);
 assert.equal(h.originalPending.length,0);assert.equal(h.launched.length,1);
 h.c.destroy();h.originalPending.forEach(fn=>fn());assert.equal(h.launched.length,1);
});
test('standard Lampa voice filter can override auto selection without reverting',()=>{
 const h=integration();h.c.requestStreams(false);h.c.filterVoice('LostFilm');
 assert.equal(h.values.bwa_lastvoice[1396].voice,'LostFilm');h.c.playEpisode(1,2);assert.equal(h.launched[0].group.voice,'LostFilm');
});
test('hiding a provider invalidates its cached candidate before selection',()=>{
 const h=harness({veoveo:[voice('TVShows')]});h.scanner.scan(h.movie,{},()=>{});let result;
 h.scanner.scan(h.movie,{hidden:['veoveo']},r=>result=r);assert.notEqual(result.best?.source,'veoveo');
});
test('a seed timeout still tries other free providers within the overall deadline',()=>{
 const h=harness({veoveo:'timeout',hdvb:[voice('TVShows')]});let result;
 h.scanner.scan(h.movie,{},r=>result=r);h.tick(5000);assert.equal(result?.best?.source,'hdvb');
});
test('standard Lampa source filter also exposes full rescan',()=>{
 const h=integration();h.L.Select.show({title:'Источник',items:[{title:'VeoVeo',source:'veoveo'}],onSelect:()=>{}});
 assert.ok(h.L.lastMenu.items.some(x=>x.homeAutoFull));
});
