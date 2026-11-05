'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const target = path.join(__dirname, '..', 'quiet-playback.js');
const api = fs.existsSync(target) ? require(target) : {};
function setup() {
  const calls = [], events = {};
  function XHR() {}
  XHR.prototype.open = function () { calls.push({receiver:this,args:[...arguments]}); return 17; };
  const env = {XMLHttpRequest:XHR, URL, Blob, location:{href:'https://yumata.github.io/lampa/'}};
  const L = {Manifest:{cub_mirrors:['cub.example'],cub_domain:'cub.example'}, Player:{listener:{follow:(name,fn)=>events[name]=fn}}};
  assert.equal(typeof api.install, 'function');
  assert.equal(api.install(L,env),true);
  return {L,env,calls,events};
}
test('only CUB GET preroll endpoint redirects to native empty-list response',async()=>{
  const s=setup(), xhr=new s.env.XMLHttpRequest();
  assert.equal(xhr.open('GET','https://cub.example/api/ad/get/preroll?x=1',true),17);
  assert.equal(s.calls[0].receiver,xhr);
  assert.equal(s.calls[0].args[2],true);
  const url=s.calls[0].args[1]; assert.match(url,/^blob:/);
  assert.deepEqual(await (await fetch(url)).json(),{ad:[]});
});
test('other requests preserve exact arguments and receiver',()=>{
  const s=setup();
  for(const args of [['GET','https://other.example/api/ad/get/preroll',true],['POST','https://cub.example/api/ad/get/preroll',true],['GET','https://cub.example/api/ad/get/banner',false,'user','password'],['GET','https://cub.example/api/ad/get/preroll/extra'],['GET','https://cub.example.evil/api/ad/get/preroll'],['GET','https://user:pass@cub.example/api/ad/get/preroll'],['GET','not a URL']]) {
    const xhr=new s.env.XMLHttpRequest(); xhr.open(...args);
    assert.deepEqual(s.calls.at(-1),{receiver:xhr,args});
  }
});
test('native event handlers and transport options stay on the same XHR',()=>{
  const s=setup(), xhr=new s.env.XMLHttpRequest(), success=function(){}, failure=function(){};
  xhr.onload=success; xhr.onerror=failure; xhr.timeout=10000; xhr.withCredentials=true;
  xhr.open('GET','https://cub.example/api/ad/get/preroll',true);
  assert.equal(xhr.onload,success); assert.equal(xhr.onerror,failure);
  assert.equal(xhr.timeout,10000); assert.equal(xhr.withCredentials,true);
});
test('dynamic mirror changes are respected and installation is idempotent',()=>{
  const s=setup(), open=s.env.XMLHttpRequest.prototype.open;
  assert.equal(api.install(s.L,s.env),true); assert.equal(s.env.XMLHttpRequest.prototype.open,open);
  s.L.Manifest.cub_mirrors.push('new.example');
  new s.env.XMLHttpRequest().open('get','http://new.example/api/ad/get/preroll');
  assert.match(s.calls.at(-1).args[1],/^blob:/);
});
test('create hook removes only plugin preroll URL and preserves identity and media',()=>{
  const s=setup(), data={url:'https://media.example/file',vast_url:'https://ads.example/vast',vast_banner:'banner',iptv:false,subtitles:[1],timeline:{time:7},quality:{high:'video'}};
  const before={...data}; delete before.vast_url;
  s.events.create({data}); assert.deepEqual(data,before);
  s.events.create({}); s.events.create(null);
});
test('incompatible host fails without altering XHR',()=>{
  function XHR() {} XHR.prototype.open=function(){};const open=XHR.prototype.open;
  assert.equal(api.install({}, {XMLHttpRequest:XHR,URL,Blob}),false);
  assert.equal(XHR.prototype.open,open);
});
test('browser plugin bootstrap installs against public Lampa object',()=>{
  const vm=require('node:vm'), s=setup();
  delete s.L._homeQuietPlayback;
  vm.runInNewContext(fs.readFileSync(target,'utf8'),{window:{...s.env,Lampa:s.L}});
  assert.equal(s.L._homeQuietPlayback,'1.0.0');
  assert.match(fs.readFileSync(target,'utf8'),/Lampa/);
});
