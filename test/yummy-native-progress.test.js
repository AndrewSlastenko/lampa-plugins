'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const file = path.join(__dirname, '..', 'yummy-native-progress.js');
const api = fs.existsSync(file) ? require(file) : {};

test('Lampa extension check recognizes the progress bridge as a plugin',()=>{
  // Lampa Extension.check() recognizes JavaScript by this literal API marker.
  const source = fs.readFileSync(file, 'utf8');
  assert.match(source, /Lampa\./, 'Lampa otherwise displays a synthetic 500 / unconfirmed status');
});

function setup(options = {}) {
  assert.equal(typeof api.install, 'function', 'progress bridge install must exist');
  const entry = {title:'Example Anime',number:'1',video_id:11,time:0,duration:1200,
    voice:'Voice A',player:'kodik',updated_at:100,card:{anime_id:42,title:'Example Anime'}};
  const history = Object.assign({'42':entry}, options.history);
  const values = {yani_playback_history:JSON.stringify(history)};
  const roads = {}, calls = [], followers = [], notices = [];
  let activity = {component:options.component || 'yani_detail',yani_id:42};
  const L = {
    Storage:{get:(k,f)=>values[k]===undefined?f:values[k],set:(k,v)=>values[k]=v},
    Activity:{active:()=>activity},
    Timeline:{view:hash=>Object.assign({hash,time:0,duration:0,percent:0},roads[hash]),
      update:road=>{roads[road.hash]=road;},
      listener:{follow:(name,fn)=>followers.push(fn)}},
    Android:{openPlayer:function () {calls.push({receiver:this,args:[...arguments]});return 'opened';}}
  };
  api.install(L,{now:()=>1000,changed:card=>notices.push(card)});
  function emit(hash, road) {roads[hash]=road;followers.forEach(f=>f({data:{hash,road}}));}
  return {L,values,history,roads,calls,followers,notices,emit,
    read:()=>JSON.parse(values.yani_playback_history),setActivity:a=>activity=a};
}
function payload(number = 1) {
  return {title:'Example Anime · Серия '+number,url:'https://media.example/ep'+number+'.m3u8',
    time:0,headers:{Referer:'https://source.example/'},playlist:[]};
}

test('Yummy external launch includes a stable native timeline without mutating input',()=>{
  const s=setup(),p=payload(),before=JSON.stringify(p),receiver={};
  assert.equal(s.L.Android.openPlayer.call(receiver,p.url,p),'opened');
  const out=s.calls[0].args[1];
  assert.equal(s.calls[0].receiver,receiver);assert.equal(JSON.stringify(p),before);
  assert.ok(out.timeline.hash);assert.equal(out.timeline.time,0);assert.deepEqual(out.headers,p.headers);
  assert.equal(typeof out.timeline.handler,'function');
});
test('native returned position persists to local anime history with voice unchanged',()=>{
  const s=setup(),p=payload();s.L.Android.openPlayer(p.url,p);
  const h=s.calls[0].args[1].timeline.hash;
  s.emit(h,{time:108,duration:1200,percent:9});
  assert.equal(s.read()['42'].time,108);assert.equal(s.read()['42'].voice,'Voice A');
  assert.equal(s.read()['42'].number,'1');assert.equal(s.read()['42'].updated_at,1000);
  assert.equal(s.notices.length,1);
});
test('cold reinstall resumes through native timeline despite a changed signed media URL',()=>{
  const s=setup(),p=payload();s.L.Android.openPlayer(p.url,p);
  const hash=s.calls[0].args[1].timeline.hash;
  const next=setup();next.roads[hash]={time:108,duration:1200,percent:9};
  const history=next.read();history['42'].time=108;next.values.yani_playback_history=JSON.stringify(history);
  const changed=payload();changed.url='https://other.example/new-token.mp4';
  next.L.Android.openPlayer(changed.url,changed);
  assert.equal(next.calls[0].args[1].timeline.hash,hash);
  assert.equal(next.calls[0].args[1].time,108);
});
test('ordinary movies, unrelated titles and preexisting timelines pass through unchanged',()=>{
  for(const options of [{component:'full'},{history:{'42':{title:'Other',number:'1'}}}]){
    const s=setup(options),p=payload();s.L.Android.openPlayer(p.url,p);assert.equal(s.calls[0].args[1],p);
  }
  const s=setup(),p=payload();p.timeline={hash:55};s.L.Android.openPlayer(p.url,p);
  assert.equal(s.calls[0].args[1],p);
});
test('late report cannot overwrite a newer episode or a newly selected voice',()=>{
  for(const change of [{number:'2',video_id:22},{voice:'Voice B'}]){
    const s=setup(),p=payload();s.L.Android.openPlayer(p.url,p);const hash=s.calls[0].args[1].timeline.hash;
    const history=s.read();Object.assign(history['42'],change);s.values.yani_playback_history=JSON.stringify(history);
    s.emit(hash,{time:108,duration:1200,percent:9});assert.equal(s.read()['42'].time,0);
  }
});
test('completed playback records episode completion for Continue Watching',()=>{
  const s=setup(),p=payload();s.L.Android.openPlayer(p.url,p);const hash=s.calls[0].args[1].timeline.hash;
  s.emit(hash,{time:1200,duration:1200,percent:100});
  assert.equal(s.read()['42'].finished_episodes['1'],true);
});
test('playlist episodes use distinct hashes while preserving existing playlist metadata',()=>{
  const s=setup(),p=payload();p.playlist=[payload(1),payload(2)];
  s.L.Android.openPlayer(p.url,p);const out=s.calls[0].args[1];
  assert.equal(out.timeline.hash,out.playlist[0].timeline.hash);
  assert.notEqual(out.playlist[0].timeline.hash,out.playlist[1].timeline.hash);
  assert.deepEqual(out.playlist[1].headers,p.playlist[1].headers);
});
test('malformed history and incompatible APIs fail open, installation is idempotent',()=>{
  assert.equal(api.install({}),false);
  const s=setup(),fn=s.L.Android.openPlayer;
  api.install(s.L,{});assert.equal(s.L.Android.openPlayer,fn);assert.equal(s.followers.length,1);
  s.values.yani_playback_history='{broken';const p=payload();s.L.Android.openPlayer(p.url,p);
  assert.equal(s.calls[0].args[1],p);
});
test('reports with invalid values and unrelated hashes do not alter history',()=>{
  const s=setup(),p=payload();s.L.Android.openPlayer(p.url,p);const hash=s.calls[0].args[1].timeline.hash;
  for(const road of [{time:-1,duration:1200},{time:Infinity,duration:1200},{time:NaN,duration:0}])s.emit(hash,road);
  s.emit('unrelated',{time:20,duration:1200,percent:2});assert.equal(s.read()['42'].time,0);
});
test('existing Yummy progress seeds the native timeline before the Android bridge rereads it',()=>{
  const s=setup();const history=s.read();history['42'].time=108;s.values.yani_playback_history=JSON.stringify(history);
  const p=payload();s.L.Android.openPlayer(p.url,p);const out=s.calls[0].args[1];
  assert.equal(s.L.Timeline.view(out.timeline.hash).time,108);
  assert.equal(out.timeline.time,108);
});
test('ambiguous same-title anime entries do not attach an incorrect progress key',()=>{
  const s=setup({history:{'43':{title:'Example Anime',number:'1'}}});
  const p=payload();s.L.Android.openPlayer(p.url,p);assert.equal(s.calls[0].args[1],p);
});
test('explicit Yummy reset to zero clears this bridges old native position',()=>{
  const s=setup(),p=payload();s.L.Android.openPlayer(p.url,p);const hash=s.calls[0].args[1].timeline.hash;
  s.emit(hash,{time:600,duration:1200,percent:50});
  const history=s.read();history['42'].time=0;s.values.yani_playback_history=JSON.stringify(history);
  s.L.Android.openPlayer(p.url,p);assert.equal(s.calls[1].args[1].timeline.time,0);
});
test('late voice A report after launching voice B cannot overwrite the new history',()=>{
  const s=setup(),p=payload();s.L.Android.openPlayer(p.url,p);const first=s.calls[0].args[1].timeline.hash;
  const history=s.read();history['42'].voice='Voice B';history['42'].video_id=22;
  s.values.yani_playback_history=JSON.stringify(history);s.L.Android.openPlayer(p.url,p);
  const second=s.calls[1].args[1].timeline.hash;assert.notEqual(second,first);
  s.emit(first,{time:108,duration:1200,percent:9});assert.equal(s.read()['42'].time,0);
});
test('native completion with zero duration/time still marks the known episode finished',()=>{
  const s=setup(),p=payload();s.L.Android.openPlayer(p.url,p);const hash=s.calls[0].args[1].timeline.hash;
  s.emit(hash,{time:0,duration:0,percent:100});
  assert.equal(s.read()['42'].time,1200);
  assert.equal(s.read()['42'].finished_episodes['1'],true);
});
