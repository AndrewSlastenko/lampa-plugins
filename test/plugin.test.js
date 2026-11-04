'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const target = path.join(__dirname, '..', 'plugin.js');
const api = fs.existsSync(target) ? require(target) : {};

function need(name) { assert.equal(typeof api[name], 'function', name + ' must be implemented'); }
function clock() {
  let now = 0, next = 1;
  const timers = new Map();
  return {
    now: () => now,
    setTimeout(fn, delay) { const id = next++; timers.set(id, { at: now + delay, fn }); return id; },
    clearTimeout(id) { timers.delete(id); },
    tick(ms) {
      const end = now + ms;
      for (let guard = 0; guard < 2000; guard++) {
        const pending = [...timers.entries()].filter(([,t]) => t.at <= end).sort((a,b) => a[1].at-b[1].at || a[0]-b[0]);
        if (!pending.length) { now = end; return; }
        const [id,t] = pending[0]; timers.delete(id); now = t.at; t.fn();
      }
      throw new Error('timer loop');
    }
  };
}
const jp = '劇場版「鬼滅の刃」無限城編 第一章 猗窩座再来';
function params() {
  return { search: jp, movie: { id: 1311031, title: 'Истребитель демонов: Бесконечный замок', original_title: jp, release_date: '2025-07-18', genres: [{id:16,name:'мультфильм'}], alternative_titles: {titles:[{iso_3166_1:'RU',title:'Клинок, рассекающий демонов: Бесконечный замок'}, {iso_3166_1:'US',title:'Demon Slayer: Infinity Castle'}, {iso_3166_1:'JP',title:'Gekijouban Kimetsu no Yaiba: Mugen-jou Hen'}]} } };
}
function setup(get, more = {}) {
  need('createController');
  const time = clock();
  let clears = 0;
  const controller = api.createController(get, () => { clears++; }, Object.assign({
    now: time.now, setTimeout: time.setTimeout, clearTimeout: time.clearTimeout,
    gapMs: 2000, deadlineMs: 40000, requestTimeoutMs: 16000, metadataTimeoutMs: 2500,
    resolveMetadata: (p, done) => done({}), contextKey: () => 'parser-A'
  }, more));
  return { controller, time, clears: () => clears };
}

test('automatic anime queries include Russian alias, English, original and romaji, without mutating input', () => {
  need('collectQueries');
  const p = params(), before = JSON.stringify(p);
  const q = api.collectQueries(p, {});
  assert.deepEqual(q, [p.movie.title, p.movie.alternative_titles.titles[0].title, 'Demon Slayer: Infinity Castle', jp, 'Gekijouban Kimetsu no Yaiba: Mugen-jou Hen']);
  assert.equal(JSON.stringify(p), before);
});
test('same English/original title is requested once; season suffix survives', () => {
  need('collectQueries');
  const q = api.collectQueries({ search:'Breaking Bad S02', movie:{title:'Во все тяжкие',original_title:'Breaking Bad',original_name:'Breaking Bad'} }, {title:'Breaking Bad'});
  assert.deepEqual(q, ['Во все тяжкие S02','Breaking Bad S02']);
});
test('TV alias results and unavailable English metadata do not prevent base queries', () => {
  need('collectQueries');
  const q = api.collectQueries({movie:{name:'Название',original_name:'Original',alternative_titles:{results:[{iso_3166_1:'RU',title:'Другое название'}]}}}, {});
  assert.deepEqual(q, ['Название','Другое название','Original']);
});
test('BTIH dedup handles tracker differences, base32 encoding and preserves Lampa history hash', () => {
  need('mergeResults');
  const hash = '0123456789abcdef0123456789abcdef01234567';
  const base32 = 'AERUKZ4JVPG66AJDIVTYTK6N54ASGRLH';
  const a = {Title:'Russian',hash:'history-a',MagnetUri:'magnet:?xt=urn:btih:'+hash+'&tr=one'};
  const b = {Title:'English',hash:'history-b',Link:'magnet:?tr=two&xt=urn%3Abtih%3A'+base32};
  const c = {Title:'Other release',MagnetUri:'magnet:?xt=urn:btih:ffffffffffffffffffffffffffffffffffffffff'};
  const merged = api.mergeResults([a,b,c]);
  assert.equal(merged.length, 2); assert.equal(merged[0].hash, 'history-a');
  assert.equal(a.Title, 'Russian');
});
test('sequential rounds merge successes once and preserve year/genres/type and season filters', () => {
  const calls = [], out = [], errors = [];
  const p = {search:'Original S01',movie:{id:2,title:'Русское',original_title:'Original',release_date:'2025-01-01',genres:[]}};
  const env = setup((v, ok) => { calls.push({p:v,at:env.time.now()}); ok({Results:[{Title:v.search,MagnetUri:'magnet:?xt=urn:btih:'+(calls.length===1?'1':'2').repeat(40)}]}); });
  const before = JSON.stringify(p);
  env.controller.get(p, x => out.push(x), x => errors.push(x));
  env.time.tick(1999); assert.equal(calls.length, 1); assert.equal(out.length, 0);
  env.time.tick(1); assert.equal(calls.length, 2); assert.equal(out.length, 1);
  assert.equal(calls[0].p.clarification, true); assert.equal(calls[0].p.movie.release_date, '2025-01-01');
  assert.deepEqual(calls[0].p.movie.genres, []); assert.equal(calls[1].p.search, 'Original S01');
  assert.equal(JSON.stringify(p), before); assert.equal(errors.length,0); assert.equal(out[0].Results.length,2);
});
test('one query failure does not discard another success; all failures remain an error', () => {
  let index = 0, result, error;
  const env = setup((p,ok,fail) => ++index===1 ? fail('unreachable') : ok({Results:[{Title:'found',Link:'https://tracker/test'}]}));
  env.controller.get({movie:{title:'Русское',original_title:'English'}}, x=>result=x, x=>error=x);
  env.time.tick(2000); assert.equal(result.Results.length,1); assert.equal(error,undefined);
  const all = setup((p,ok,fail)=>fail('offline'));
  all.controller.get({movie:{title:'One',original_title:'Two'}}, ()=>assert.fail('must not fake empty success'), x=>error=x);
  all.time.tick(2000); assert.equal(error,'offline');
});
test('clear suppresses queued searches and stale parser/metadata callbacks', () => {
  let callback, count = 0, results = 0;
  const env = setup((p,ok) => {count++; callback=ok;});
  env.controller.get({movie:{title:'One',original_title:'Two'}},()=>results++,()=>results++);
  assert.equal(count,1); env.controller.clear(); callback({Results:[{Title:'late'}]}); env.time.tick(50000);
  assert.equal(count,1); assert.equal(results,0); assert.equal(env.clears(),1);
  let metadata;
  const meta = setup(()=>assert.fail('cancelled metadata must not dispatch'), {resolveMetadata:(p,done)=>{metadata=done;}});
  meta.controller.get(params(),()=>results++,()=>results++); meta.controller.clear(); metadata({title:'Late'}); meta.time.tick(50000);
  assert.equal(results,0);
});
test('manual refinement and free-text search are delegated unchanged', () => {
  let actual;
  const env = setup((p,ok)=>{actual=p;ok({Results:[]});});
  for (const p of [{movie:{title:'A'},clarification:true,search:'custom'}, {from_search:true,search:'raw'}]) {
    env.controller.get(p,()=>{},()=>{}); assert.equal(actual,p);
  }
});
test('in-memory cache avoids repeat requests and changes with parser context', () => {
  let calls = 0, context = 'first', finished = 0;
  const env = setup((p,ok)=>{calls++;ok({Results:[{Title:'cached',Link:'https://a'}]});}, {contextKey:()=>context});
  const p = {movie:{id:3,title:'Only'}};
  env.controller.get(p,()=>finished++,()=>{}); env.time.tick(0);
  env.controller.get(p,()=>finished++,()=>{}); env.time.tick(0);
  assert.equal(calls,1); assert.equal(finished,2);
  context='second'; env.controller.get(p,()=>finished++,()=>{}); env.time.tick(0); assert.equal(calls,2);
});
test('request watchdog advances; overall deadline completes once and ignores late callbacks', () => {
  const callbacks = []; let errors=0;
  const env = setup((p,ok)=>callbacks.push(ok), {requestTimeoutMs:5000,deadlineMs:8000});
  env.controller.get({movie:{title:'One',original_title:'Two'}},()=>assert.fail('no success yet'),()=>errors++);
  env.time.tick(8000); assert.equal(callbacks.length,2); assert.equal(errors,1);
  for (const ok of callbacks) ok({Results:[{Title:'late'}]}); env.time.tick(50000); assert.equal(errors,1);
});

test('cache keeps a snapshot separate from rows mutated by the caller', () => {
  const env = setup((p,ok)=>ok({Results:[{Title:'Original row',Link:'https://a',extra:{label:'original'}}]}));
  const p = {movie:{id:3,title:'Only'}};
  env.controller.get(p, value=>{value.Results[0].Title='Changed';value.Results[0].extra.label='Changed';},()=>{});
  let cached;
  env.controller.get(p,value=>cached=value,()=>{}); env.time.tick(0);
  assert.equal(cached.Results[0].Title,'Original row');
  assert.equal(cached.Results[0].extra.label,'original');
});

test('global category bypass and other media type never reuse filtered cache', () => {
  let calls=0;
  const env = setup((p,ok)=>{calls++;ok({Results:[]});});
  const p = {movie:{id:3,title:'Only',genres:[]}};
  env.controller.get(p,()=>{},()=>{});
  env.controller.get({...p,global:true},()=>{},()=>{}); env.time.tick(0);
  env.controller.get({...p,other:true},()=>{},()=>{}); env.time.tick(0);
  assert.equal(calls,3);
});

test('Japanese aliases use metadata labels rather than words from specific anime', () => {
  assert.deepEqual(api.collectQueries({movie:{title:'Провожающая в последний путь Фрирен',original_title:'葬送のフリーレン',alternative_titles:{titles:[{title:'Frieren: Beyond Journey’s End',iso_3166_1:'US'},{title:'Sousou no Frieren',type:'romaji'}]}}},{}), ['Провожающая в последний путь Фрирен','Frieren: Beyond Journey’s End','葬送のフリーレン','Sousou no Frieren']);
});

function lampaMock() {
  const values={}, calls=[], metadata=[], settings=[];
  const originalGet=function(p,ok){calls.push(p);ok({Results:[]});};
  const originalClear=function(){};
  const Lampa={
    Parser:{get:originalGet,clear:originalClear},
    Storage:{get:(key,fallback)=>key in values?values[key]:fallback,field:key=>values[key],listener:{follow(){}}},
    Api:{sources:{tmdb:{get(...args){metadata.push(args);args[2]({title:'English'});}}}},
    SettingsApi:{addComponent:value=>settings.push(value),addParam:value=>settings.push(value)},
    Manifest:{},Noty:{show(){}}
  };
  return {Lampa,values,calls,metadata,settings,originalGet,originalClear};
}

test('install uses English metadata through existing TMDB API and restores original parser', () => {
  const m=lampaMock(), handle=api.install(m.Lampa,{appready:true});
  assert.equal(api.install(m.Lampa,{}),handle);
  assert.equal(m.settings.length,2);
  m.Lampa.Parser.get({movie:{id:42,title:'Русское',original_title:'日本語'}},()=>{},()=>{});
  assert.equal(m.metadata.length,1);
  assert.equal(m.metadata[0][0],'movie/42?append_to_response=alternative_titles');
  assert.deepEqual(m.metadata[0][1],{langs:'en'});
  assert.equal(m.calls[0].search,'Русское');
  handle.uninstall();
  assert.equal(m.Lampa.Parser.get,m.originalGet);assert.equal(m.Lampa.Parser.clear,m.originalClear);
});

test('disabled plugin delegates the original object; foreign IDs are never sent to TMDB', () => {
  const m=lampaMock(), handle=api.install(m.Lampa,{appready:true});
  m.values.home_multititle_search=false;
  const p={movie:{id:42,title:'Русское',original_title:'English'}};
  m.Lampa.Parser.get(p,()=>{},()=>{});
  assert.equal(m.calls[0],p);assert.equal(m.metadata.length,0);
  m.values.home_multititle_search=true;
  m.Lampa.Parser.get({movie:{id:42,source:'yummy',title:'Аниме',original_title:'日本語'}},()=>{},()=>{});
  assert.equal(m.metadata.length,0);
  handle.uninstall();
});
