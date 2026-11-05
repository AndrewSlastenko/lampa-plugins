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
