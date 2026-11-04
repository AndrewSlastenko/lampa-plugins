'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const target = require('node:path').join(__dirname, '..', 'torrserver-auto.js');
const api = fs.existsSync(target) ? require(target) : {};
function setup(extra = {}) {
  assert.equal(typeof api.install, 'function', 'install must exist');
  let id = 0; const timers = new Map(), requests = [], calls = [], notes = [], params = [], listeners = {};
  const values = Object.assign({torrserver_url:'http://primary.example:8090',torrserver_url_two:'http://secondary.example:8090',internal_torrclient:true}, extra);
  const env = {setTimeout(fn) {timers.set(++id,fn); return id;}, clearTimeout(i) {timers.delete(i);}};
  function Request() { this.timeout = () => {}; this.clear = () => {}; this.silent = () => { throw new Error("native transport required"); }; this.native = (url,yes,no,data,options) => requests.push({url,yes,no,data,options}); }
  const L = {Base64:{encode:s=>Buffer.from(s,'utf8').toString('base64')},Listener:{follow:(name,fn)=>listeners[name]=fn},Storage:{get:(k,d) => values[k] === undefined ? d : values[k],field:k=>values[k],value:k=>values[k],set:(k,v)=>values[k]=v},Reguest:Request,
    Torserver:{my:function () {calls.push({method:'my',context:this,args:[...arguments]});},list:function () {calls.push({method:'list',context:this,args:[...arguments]});}},
    Torrent:{start:function () {calls.push({method:'start',context:this,args:[...arguments]});return 42;},open:function () {calls.push({method:'open',context:this,args:[...arguments]});return 43;}},
    Noty:{show:s=>notes.push(s)},SettingsApi:{addParam:p=>params.push(p)},Platform:{is:()=>false}};
  api.install(L,env);
  return {L,values,requests,calls,notes,params,emit:(name,event)=>listeners[name](event),tick() {const batch=[...timers.values()];timers.clear(); batch.forEach(f=>f());}};
}
test('primary healthy selects one and preserves receiver and all arguments',()=>{const s=setup();const args=[{}, {}, ()=>{}];s.L.Torrent.start.apply(s,args);assert.equal(s.calls.length,0);assert.equal(s.requests[0].data,'{"action":"get"}');s.requests[0].yes({CacheSize:0});assert.equal(s.values.torrserver_use_link,'one');assert.deepEqual(s.calls[0].args,args);assert.equal(s.calls[0].context,s);assert.match(s.notes[0],/1/);});
test('primary down falls back to secondary for open',()=>{const s=setup();s.L.Torrent.open('hash');s.requests[0].no();s.requests[1].yes({hash:'hash',file_stats:[]});assert.equal(s.values.torrserver_use_link,'two');assert.equal(s.calls[0].method,'open');});
test('both down never launches and reports error',()=>{const s=setup();s.L.Torrent.start({});s.tick();s.tick();assert.equal(s.calls.length,0);assert.match(s.notes[0],/недоступ/i);});
test('late primary success and duplicate callbacks cannot launch twice',()=>{const s=setup();s.L.Torrent.start({});s.tick();s.requests[0].yes({CacheSize:1});assert.equal(s.calls.length,0);s.requests[1].yes({CacheSize:1});s.requests[1].yes({CacheSize:1});s.requests[1].no();assert.equal(s.calls.length,1);assert.equal(s.values.torrserver_use_link,'two');});
test('new launches cancel old probes without caching health',()=>{const s=setup();s.L.Torrent.start('old');s.L.Torrent.open('new');s.requests[0].yes({CacheSize:1});assert.equal(s.calls.length,0);s.requests[1].yes({hash:'new',file_stats:[]});assert.equal(s.calls[0].args[0],'new');s.L.Torrent.start('again');assert.equal(s.requests.length,3);});
test('disabled and one-address settings retain manual synchronous behavior',()=>{for(const extra of [{home_torrserver_auto:false},{torrserver_url_two:''}]){const s=setup(extra);assert.equal(s.L.Torrent.start('manual'),42);assert.equal(s.requests.length,0);assert.equal(s.values.torrserver_use_link,undefined);}});
test('malformed JSON and incompatible responses fall back',()=>{for(const json of ['{broken',null,{},'[]']){const s=setup();s.L.Torrent.start('x');s.requests[0].yes(json);assert.equal(s.requests.length,2);s.requests[1].yes('{"CacheSize":1}');assert.equal(s.calls.length,1);}});
test('install is idempotent with default-on toggle',()=>{const s=setup();const wrapped=s.L.Torrent.start;api.install(s.L,{});assert.equal(s.L.Torrent.start,wrapped);assert.equal(s.params.length,1);assert.equal(s.params[0].param.default,true);});
test('external Android torrent client bypasses probes',()=>{const s=setup({internal_torrclient:false});s.L.Platform.is=()=>true;assert.equal(s.L.Torrent.open('external'),43);assert.equal(s.requests.length,0);});
test('public source has no numeric addresses or address defaults',()=>{assert.doesNotMatch(fs.readFileSync(target,'utf8'),/\b\d{1,3}(?:\.\d{1,3}){3}\b/);});
test('incompatible host preserves native methods',()=>{const original=()=>7;const L={Torserver:{my:function () {calls.push({method:'my',context:this,args:[...arguments]});},list:function () {calls.push({method:'list',context:this,args:[...arguments]});}},
    Torrent:{start:original}};assert.equal(api.install(L,{}),false);assert.equal(L.Torrent.start,original);});


test('activity navigation cancels pending probes and notifications',()=>{const s=setup();s.L.Torrent.start('old');s.emit('activity',{type:'start'});s.requests[0].yes({CacheSize:1});s.tick();assert.equal(s.calls.length,0);assert.equal(s.notes.length,0);});
test('toggle appears in native server settings',()=>{const s=setup();assert.equal(s.params[0].component,'server');});

test('native probes respect configured Basic authentication without disclosing credentials',()=>{const s=setup({torrserver_auth:true,torrserver_login:'example-user',torrserver_password:'example-secret'});s.L.Torrent.start('x');const expected='Basic '+Buffer.from('example-user:example-secret').toString('base64');assert.equal(s.requests[0].options.headers.Authorization,expected);s.requests[0].no();assert.equal(s.requests[1].options.headers.Authorization,expected);s.requests[1].yes({CacheSize:1});assert.doesNotMatch(s.notes.join(' '),/example-user|example-secret|Basic/);});
test('disabled authentication sends no Authorization header',()=>{const s=setup({torrserver_auth:false,torrserver_login:'unused',torrserver_password:'unused'});s.L.Torrent.start('x');assert.equal(s.requests[0].options && s.requests[0].options.headers,undefined);});

test('library list chooses fallback when primary is down, preserving callbacks and receiver',()=>{const s=setup();const yes=()=>{},no=()=>{};s.L.Torserver.list.call(s,yes,no);assert.equal(s.calls.length,0);s.requests[0].no();s.requests[1].yes({CacheSize:1});assert.equal(s.values.torrserver_use_link,'two');assert.equal(s.calls[0].method,'list');assert.equal(s.calls[0].context,s);assert.deepEqual(s.calls[0].args,[yes,no]);});
test('existing hash stays on selected secondary even after primary wakes',()=>{const s=setup({torrserver_use_link:'two'});s.L.Torrent.open('saved-hash');assert.match(s.requests[0].url,/secondary.*\/torrents$/);assert.deepEqual(JSON.parse(s.requests[0].data),{action:'get',hash:'saved-hash'});s.requests[0].yes({hash:'saved-hash',file_stats:[]});assert.equal(s.values.torrserver_use_link,'two');assert.equal(s.requests.length,1);assert.equal(s.calls.length,1);});
test('unknown hash tries other server then reports reopen card without launching',()=>{const s=setup({torrserver_use_link:'two'});s.L.Torrent.open('missing');s.requests[0].yes({});s.requests[1].yes({hash:'unrelated',file_stats:[]});assert.equal(s.calls.length,0);assert.match(s.notes[0],/карточк/i);});
test('disabled library list passes through immediately',()=>{const s=setup({home_torrserver_auto:false});s.L.Torserver.list();assert.equal(s.calls[0].method,'list');assert.equal(s.requests.length,0);});

test('new library activity init then onCreate my then own start preserves its pending probe',()=>{const s=setup();const owner={component:'mytorrents'};const yes=()=>{},no=()=>{};s.emit('activity',{type:'init',component:owner.component,object:owner});s.L.Torserver.my(yes,no);s.emit('activity',{type:'create',component:owner.component,object:owner});s.emit('activity',{type:'start',component:owner.component,object:owner});s.requests[0].yes({CacheSize:1});assert.equal(s.calls.length,1);assert.equal(s.calls[0].method,'my');assert.deepEqual(s.calls[0].args,[yes,no]);});
test('navigation from a pending new library to another instance cancels callbacks',()=>{const s=setup();const owner={component:'mytorrents'},other={component:'mytorrents'};s.emit('activity',{type:'init',object:owner});s.L.Torserver.my(()=>{},()=>{});s.emit('activity',{type:'create',object:owner});s.emit('activity',{type:'start',object:other});s.requests[0].yes({CacheSize:1});s.tick();assert.equal(s.calls.length,0);assert.equal(s.notes.length,0);});
test('saved torrent hash is enough while server revives metadata without file_stats',()=>{const s=setup({torrserver_use_link:'two'});s.L.Torrent.open('saved');s.requests[0].yes({hash:'saved',stat:1});assert.equal(s.calls.length,1);assert.equal(s.calls[0].method,'open');assert.equal(s.values.torrserver_use_link,'two');assert.equal(s.requests.length,1);});
