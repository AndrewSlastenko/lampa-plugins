'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const api=require('../torrserver-auto.js');

function setup() {
  const requests=[],listeners={};
  let L;
  function Request(label) {
    this.label=label;
    this.silent=function (url,success,error,data,options) {
      const params={url,complite:success,error};
      if(listeners.request_before) listeners.request_before({params});
      requests.push({receiver:this,args:[url,params.complite,error,data,options]});return 'sent';
    };
    this.native=function () {return 'native unchanged';};
  }
  Request.marker='keep';
  const values={torrserver_url:'http://primary.example:8090',torrserver_url_two:'secondary.example:8090'};
  L={Listener:{follow:(name,fn)=>listeners[name]=fn},Torrent:{start(){},open(){}},Storage:{get:(k,d)=>values[k]??d,field:k=>values[k],set:(k,v)=>values[k]=v},Reguest:Request};
  api.install(L,{});
  return {L,Request,requests,values};
}
function legacyReady(res) {
  const progress=Math.min(100,((res.preloaded_bytes||0)*100)/(res.preload_size||0));
  return progress>=95||Number.isNaN(progress);
}
const URL='http://primary.example:8090/stream/movie.mkv?link=hash&index=1&stat';

test('core cached Request constructor waits for actual preload completion, including missing size and full byte counter',()=>{
  const s=setup(),seen=[],opened=[];
  new s.Request().silent(URL,res=>{seen.push(res);if(legacyReady(res))opened.push(res.stat);});
  const states=[{stat:0},{stat:1},{stat:2},{stat:2,preload_size:100,preloaded_bytes:100},{stat:2,preload_size:100,preloaded_bytes:500},{stat:3,preload_size:100,preloaded_bytes:120}];
  for(const state of states) s.requests[0].args[1](Object.freeze(state));
  assert.deepEqual(opened,[3]);
  assert.deepEqual(seen.slice(0,-1).map(legacyReady),[false,false,false,false,false]);
  assert.equal(seen.at(-1),states.at(-1));
});

test('waiting responses keep telemetry and do not mutate the server response',()=>{
  const s=setup();let received;
  new s.Request().silent(URL,res=>received=res);
  const source=Object.freeze({stat:2,preload_size:200,preloaded_bytes:190,download_speed:1234,active_peers:8,stat_string:'Torrent preload'});
  s.requests[0].args[1](source);
  assert.equal(legacyReady(received),false);
  assert.equal(received.download_speed,1234);assert.equal(received.active_peers,8);
  assert.equal(source.preloaded_bytes,190);assert.notEqual(received,source);
});

test('real downloaded-byte growth remains visible to Lampas no-progress watchdog',()=>{
  const s=setup(),seen=[];new s.Request().silent(URL,res=>seen.push(res));
  for(const bytes of [100,200,500])s.requests[0].args[1]({stat:2,preload_size:100,preloaded_bytes:bytes});
  assert.deepEqual(seen.map(x=>x.preloaded_bytes),[100,200,500]);
  assert.ok(seen.every(x=>!legacyReady(x)));
});

test('only configured server stream preload/stat responses are guarded',()=>{
  for(const url of [
    'http://other.example:8090/stream/x?stat',
    'http://primary.example:80901/stream/x?stat',
    'http://primary.example:8090/streaming/x?stat',
    'http://primary.example:8090/settings',
    'http://primary.example:8090/stream/x?play',
    'https://parser.example/results?stat'
  ]) {
    const s=setup();let received;const response={stat:2,preload_size:100,preloaded_bytes:100};
    new s.Request().silent(url,res=>received=res);s.requests[0].args[1](response);
    assert.equal(received,response,url);
  }
});

test('secondary address without scheme and initial preload request are covered',()=>{
  const s=setup();let received;
  new s.Request().silent('http://secondary.example:8090/stream?link=hash&preload&stat',res=>received=res);
  s.requests[0].args[1]({stat:2,preload_size:100,preloaded_bytes:100});
  assert.equal(legacyReady(received),false);
});

test('request constructor, receiver, arguments, errors, result and native transport survive',()=>{
  const s=setup(),req=new s.Request('label'),receiver={},error=()=>{},data='body',options={headers:{Authorization:'Basic test'}};
  let args,context;
  const result=req.silent.call(receiver,URL,function(){context=this;args=[...arguments];},error,data,options);
  assert.equal(result,'sent');assert.equal(s.requests[0].receiver,receiver);
  assert.deepEqual(s.requests[0].args.slice(2),[error,data,options]);
  const callbackContext={};s.requests[0].args[1].call(callbackContext,{stat:2,preload_size:100,preloaded_bytes:100},'extra');
  assert.equal(context,callbackContext);assert.equal(args[1],'extra');assert.equal(legacyReady(args[0]),false);
  assert.ok(req instanceof s.Request);assert.ok(req instanceof s.L.Reguest);assert.equal(req.label,'label');
  assert.equal(s.L.Reguest.marker,'keep');assert.equal(req.native(),'native unchanged');
});

test('completed or disabled preload and unknown responses preserve existing behavior',()=>{
  const s=setup();let received;
  new s.Request().silent(URL,res=>received=res);
  for(const response of [null,{},'text',{stat:3},{stat:3,preload_size:0},{stat:3,preload_size:100,preloaded_bytes:100},{stat:99}]) {
    s.requests[0].args[1](response);assert.equal(received,response);
  }
});

test('install twice keeps the constructor and normal silent callbacks',()=>{
  const s=setup(),wrapped=s.L.Reguest;api.install(s.L,{});assert.equal(s.L.Reguest,wrapped);
  let count=0;new s.Request().silent(URL,()=>count++);s.requests[0].args[1]({stat:2});assert.equal(count,1);
});
