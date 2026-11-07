/* Source Auto: optional voice-first BWA selection. MIT. */
(function(root,factory){
 'use strict';var api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else if(root.Lampa&&root.Lampa.Component)api.install(root.Lampa,root);
}(typeof window!=='undefined'?window:this,function(){
 'use strict';
 function voiceKey(value){
  var s=String(value||'').toLowerCase().replace(/ё/g,'е');if(s.normalize)s=s.normalize('NFKC');
  s=s.replace(/^\s*\d+\s*[.)-]\s*/,'');
  s=s.replace(/(^|[^a-zа-я0-9])(?:дубляж|дублированн(?:ый|ая|ое)|(?:одно|двух|много)голос(?:ый|ая|ое)|профессиональн(?:ый|ая|ое)|любительск(?:ий|ая|ое)|закадров(?:ый|ая|ое)|перевод|озвучка|русский|русская|русские|рус|russian|rus|ru|dub|dubbed|dubbing|voiceover)(?=$|[^a-zа-я0-9])/g,' ');
  var letters='абвгдежзийклмнопрстуфхцчшщъыьэюя',latin=['a','b','v','g','d','e','zh','z','i','y','k','l','m','n','o','p','r','s','t','u','f','kh','ts','ch','sh','shch','','y','','e','yu','ya'];
  s=s.replace(/[а-я]/g,function(c){return latin[letters.indexOf(c)];}).replace(/[^a-z0-9]/g,'');
  return /^(original|originalaudio|english|eng|en|originalnyy|originalnaya|original|angliyskiy|angliyskaya|subtitry|subtitles|subs)$/.test(s)?'':s;
 }
 function voiceTier(value){
  var s=voiceKey(value);
  if(/^(hdrezka(?:studio)?|tvshous|tvshows|redheadsound)$/.test(s))return 0;
  if(s==='kubikvkube')return 1;
  if(/^(lostfilm|newstudio|alexfilm)$/.test(s))return 2;
  return 99;
 }
 function resolution(value){
  var s=String(value||'').toLowerCase(),m=s.match(/(\d{3,4})\s*[xх×]\s*(\d{3,4})/);
  if(m)return Math.min(Number(m[1]),Number(m[2]));
  if(/4k|uhd/.test(s))return 2160;if(/2k/.test(s))return 1440;
  if(/full\s*hd|fhd/.test(s))return 1080;
  m=s.match(/(?:^|[^0-9])(2160|1440|1080|720|576|480|360)(?:p|i|[^0-9]|$)/);return m?Number(m[1]):0;
 }
 function candidates(result){
  var out=[];if(!result||typeof result.source!=='string'||!Array.isArray(result.voices))return out;
  result.voices.forEach(function(group){
   if(!group||typeof group.voice!=='string'||!group.voice.trim()||!group.qualities)return;
   Object.keys(group.qualities).forEach(function(q){
    var stream=group.qualities[q],url=typeof stream==='string'?stream:stream&&stream.url;
    if(typeof url!=='string'||!/^https?:\/\/[^\s]+$/i.test(url)||/cam|tsrip|telesync/i.test(q))return;
    out.push({source:result.source,voice:group.voice,raw:group.raw,quality:q,height:resolution(q),tier:voiceTier(group.voice),group:group});
   });
  });return out;
 }
 function highestQuality(rows){return rows.slice().sort(function(a,b){return b.height-a.height;})[0]||null;}
 function choose(list,preferred){
  function unique(rows){var ids=[];rows.forEach(function(c){var key=JSON.stringify([c.voice,c.raw]);if(ids.indexOf(key)<0)ids.push(key);});return ids.length===1;}
  if(preferred){
   var own=list.filter(function(c){return c.source===preferred.source;});
   if(preferred.raw!==undefined&&preferred.raw!==null){
    var raw=own.filter(function(c){return c.raw===preferred.raw&&(c.voice===preferred.voice||(voiceKey(preferred.voice)&&voiceKey(c.voice)===voiceKey(preferred.voice)));});
    if(raw.length)return unique(raw)?highestQuality(raw):null;
   }
   var exact=own.filter(function(c){return c.voice===preferred.voice;});
   if(exact.length)return unique(exact)?highestQuality(exact):null;
   var key=voiceKey(preferred.voice);if(!key)return null;
   var aliases=own.filter(function(c){return voiceKey(c.voice)===key;});
   if(aliases.length)return unique(aliases)?highestQuality(aliases):null;
   var other=list.filter(function(c){return voiceKey(c.voice)===key;}),valid=other.filter(function(c){return unique(other.filter(function(row){return row.source===c.source;}));});
   return highestQuality(valid);
  }
  var rows=list.filter(function(c){return c.tier<99;});
  rows.sort(function(a,b){return a.tier-b.tier||b.height-a.height;});return rows[0]||null;
 }
 function movieKey(movie){return movie&&movie.id?(movie.source||'tmdb')+':'+(movie.name||movie.first_air_date?'tv:':'movie:')+movie.id:null;}
 function createScanner(env){
  var later=env.setTimeout||setTimeout,clear=env.clearTimeout||clearTimeout,now=env.now||Date.now,cache={};
  return {scan:function(movie,opts,callback){
   opts=opts||{};var cancelled=false,finished=false,sourceTimer,deadline,rows=[],asked={},catalog=[{id:'veoveo'},{id:'hdvb'},{id:'collaps'}],meta={},count=0;
   var key=JSON.stringify([movieKey(movie),opts.season||0,opts.episode||0,opts.preferred&&opts.preferred.source,opts.preferred&&opts.preferred.voice,opts.preferred&&opts.preferred.raw,(opts.hidden||[]).slice().sort()]),max=opts.full?30:3;
   function stop(){cancelled=true;clear(sourceTimer);clear(deadline);}
   function finish(){
    if(cancelled||finished)return;finished=true;clear(sourceTimer);clear(deadline);
    if(rows.length)cache[key]={at:now(),rows:rows.slice()};var best=choose(rows,opts.preferred);
    callback({best:best,alternatives:rows.slice().sort(function(a,b){return a.tier-b.tier||b.height-a.height;}),needsChoice:!best&&(!!opts.preferred||rows.length>0),checked:count});
   }
   if(!movieKey(movie)){finish();return stop;}
   if(!opts.full&&cache[key]&&now()-cache[key].at<120000){rows=cache[key].rows.slice();finish();return stop;}
   deadline=later(finish,opts.full?30000:12000);
   function allowed(id){var entry=catalog.filter(function(s){return s&&s.id===id;})[0],m=meta[id]||{};return entry&&!entry.paid&&!entry.bound&&!m.account_only&&!m.avoid&&!m.auth&&id!=='peregon'&&id!=='kinogo'&&(!opts.hidden||opts.hidden.indexOf(id)<0);}
   function next(){
    if(cancelled||finished)return;
    var saved=opts.preferred&&choose(rows,opts.preferred);
    if(saved&&saved.source===opts.preferred.source)return finish();
    if(count>=max)return finish();
    var priority=['veoveo','hdvb','collaps','videodb'];
    var available=catalog.filter(function(s){return s&&allowed(s.id)&&!asked[s.id];}).sort(function(a,b){var x=priority.indexOf(a.id),y=priority.indexOf(b.id);return (x<0?99:x)-(y<0?99:y);});
    if(!available.length)return finish();query(available[0].id);
   }
   function query(source){
    if(cancelled||finished)return;asked[source]=true;count++;var settled=false;
    function done(error,result){
     if(settled||cancelled||finished)return;settled=true;clear(sourceTimer);
     if(!error&&result){
      if(Array.isArray(result.sources))catalog=result.sources;
      if(result._meta)meta=result._meta;
      if(result.source===source&&allowed(source))rows=rows.concat(candidates(result));
     }next();
    }
    sourceTimer=later(function(){done(new Error('timeout'));},5000);
    try{env.resolve(movie,{source:source,season:opts.season,episode:opts.episode},done);}catch(error){done(error);}
   }
   var seed=opts.preferred&&opts.preferred.source||'veoveo';
   if(opts.hidden&&opts.hidden.indexOf(seed)>=0){var visible=catalog.filter(function(s){return opts.hidden.indexOf(s.id)<0;});if(!visible.length){finish();return stop;}seed=visible[0].id;}
   query(seed);return stop;
  }};
 }
 function install(L,env){
  if(L&&L.Manifest)L.Manifest.plugins={type:'other',version:'0.1.4',name:'Автовыбор источника BWA',description:'Привычная озвучка, затем качество. Быстрый и полный поиск'};
  if(!L||L.__homeSourceAuto||!L.Component||!L.Component.get||!L.Storage||!L.Select)return false;
  L.__homeSourceAuto='0.1.4';env=env||{};var owners=[],permits=[];
  if(L.Player&&L.Player.listener&&L.Player.listener.follow)L.Player.listener.follow('create',function(event){
   var data=event&&event.data;if(!data||typeof data.url!=='string'||!data.episode)return;
   for(var i=permits.length-1;i>=0;i--){var p=permits[i];if(p.urls.indexOf(data.url)>=0&&Number(data.season)===p.season&&Number(data.episode)===p.episode){if(!p.valid()&&event.abort)event.abort();break;}}
  });
  var scanner=createScanner({resolve:function(movie,opts,cb){if(!env.BWA_API||typeof env.BWA_API.resolve!=='function')return cb(new Error('BWA API unavailable'));env.BWA_API.resolve(movie,opts,cb);},setTimeout:env.setTimeout,clearTimeout:env.clearTimeout,now:env.now});
  function enabled(){return L.Storage.get('source_auto_enabled',true)!==false&&env.BWA_API&&typeof env.BWA_API.resolve==='function';}
  function notice(text){if(L.Noty)L.Noty.show(text);}
  function read(key,id){return (L.Storage.get(key,{})||{})[id];}
  function write(key,id,value){var all=Object.assign({},L.Storage.get(key,{})||{});all[id]=value;L.Storage.set(key,all);}
  function decorate(Original){
   if(!Original||Original.__homeSourceAuto)return Original;
   function Wrapped(object){
    var returned=Original.apply(this,arguments),c=returned&&typeof returned==='object'?returned:this,movie=object.movie||{},epoch=0,dead=false,internal=false,first=true,cancelScan=null,desired=null,playingChoice=null,selecting=false,manual=false,selectedUiVoice=null;
    var request=c.requestStreams,change=c.changeBalanser,filters=c.buildFilters,pickVoice=c.pickVoice,playEpisode=c.playEpisode,playGroup=c.playGroupEpisode,play=c.play;
    function valid(token){return !dead&&epoch===token&&L.Activity.active()===object;}
    function cancel(){epoch++;if(cancelScan)cancelScan();cancelScan=null;desired=null;playingChoice=null;}
    function preferred(){var last=read('bwa_lastvoice',movie.id);return last&&last.src&&last.voice?{source:last.src,voice:last.voice,raw:last.raw}:null;}
    function remember(best,label){var saved={src:best.source,voice:label||best.voice};if(best.raw!==undefined&&best.raw!==null)saved.raw=best.raw;write('bwa_lastvoice',movie.id,saved);}
    function fingerprint(){return JSON.stringify([read('bwa_title_src',movie.id),read('bwa_lastvoice',movie.id)]);}
    function selectVoice(){
     if(!desired||selecting||typeof pickVoice!=='function')return;
     var show=L.Select.show,matched=false;selecting=true;
     // BWA exposes voice selection as a synchronous Select configuration.
     // Consume only this invocation, restore the public method in finally.
     L.Select.show=function(options){
      if(!options||options.title!=='Озвучка'||!Array.isArray(options.items))return show.apply(this,arguments);
      var items=options.items.filter(function(item){return item.title===desired.voice;}),key=voiceKey(desired.voice);
      if(!items.length&&key)items=options.items.filter(function(item){return voiceKey(item.title)===key;});
      var item=items.length===1&&items[0];
      if(item&&typeof options.onSelect==='function'){matched=true;selectedUiVoice=item.title;options.onSelect(item);remember(desired,item.title);}
     };
     try{internal=true;pickVoice.call(c);}finally{internal=false;selecting=false;L.Select.show=show;}
     return matched;
    }
    if(typeof filters==='function')c.buildFilters=function(){
     if(desired&&!internal&&!selecting){var saved=preferred();if(saved&&(saved.source!==desired.source||(saved.voice!==desired.voice&&saved.voice!==selectedUiVoice))){cancel();manual=true;}}
     var out=filters.apply(this,arguments);if(desired&&!selecting)selectVoice();return out;
    };
    function adopt(best,load){
     desired=best;selectedUiVoice=null;var wrappedRequest=c.requestStreams;
     internal=true;c.requestStreams=function(){};
     try{change.call(c,best.source);remember(best);}
     finally{c.requestStreams=wrappedRequest;internal=false;}
     if(load)request.call(c,true);
    }
    function hidden(){var h=L.Storage.get('bwa_sources_hidden',[]);try{return typeof h==='string'?JSON.parse(h):h||[];}catch(ignore){return [];}}
    function alternatives(result,onPick){
     var seen=Object.create(null),items=[],token=epoch;
     result.alternatives.forEach(function(row){var key=JSON.stringify([row.source,row.voice,row.raw]);if(seen[key])return;seen[key]=true;items.push({title:row.voice+' · '+row.quality,subtitle:row.source,homeCandidate:row});});
     if(!items.length){notice('Подходящий поток не найден. Выберите источник вручную');return;}
     L.Select.show({title:'Выберите озвучку и источник',items:items,onSelect:function(item){if(!valid(token))return;L.Select.close();if(item.homeCandidate)onPick(item.homeCandidate);},onBack:function(){if(valid(token))L.Controller.toggle('content');}});
    }
    function scan(season,episode,full,callback,onChanged,keepList){
     cancel();var token=epoch,snapshot=fingerprint();
     if(keepList){if(c.activity&&c.activity.loader)c.activity.loader(true);}
     else if(c.loadingSkeleton)c.loadingSkeleton(full?'Проверяю все бесплатные источники…':'Проверяю источники и озвучки…');
     cancelScan=scanner.scan(movie,{season:season,episode:episode,full:full,preferred:full?null:preferred(),hidden:hidden()},function(result){
      if(!valid(token))return;
      cancelScan=null;if(c.activity&&c.activity.loader)c.activity.loader(false);
      if(snapshot!==fingerprint()){if(onChanged)onChanged();return;}
      callback(result);
     });
    }
    function resume(){var r=read('bwa_resume',movie.id)||{};return {season:c.isSerial&&c.isSerial()?(Number(r.season)||Number(movie.season)||1):undefined,episode:c.isSerial&&c.isSerial()?(Number(r.episode)||1):undefined};}
    if(typeof request==='function'&&typeof change==='function')c.requestStreams=function(){
     if(internal||!first||manual||!enabled())return request.apply(this,arguments);
     first=false;var args=arguments,r=resume();
     scan(r.season,r.episode,false,function(result){if(result.best)adopt(result.best,true);else {request.apply(c,args);if(result.needsChoice)alternatives(result,function(best){adopt(best,true);});else notice('Автоподбор не нашёл поток. Доступен ручной выбор');}},function(){manual=true;request.call(c,true);});
    };
    ['changeBalanser','switchSeason','pickVoice','destroy'].forEach(function(name){var fn=c[name];if(typeof fn==='function')c[name]=function(){if(!internal){cancel();if(name==='changeBalanser'||name==='pickVoice')manual=true;first=false;}if(name==='destroy')dead=true;return fn.apply(this,arguments);};});
    if(typeof playEpisode==='function')c.playEpisode=function(season,episode){
     if(!enabled()||manual)return playEpisode.apply(this,arguments);
     scan(season,episode,false,function(result){
      var token=epoch;
      function launch(best){
       if(!valid(token))return;adopt(best,false);playingChoice=best;
       // API.resolve already fetched this exact episode. Reuse it instead of
       // starting upstream's second asynchronous fetch after the cancellation gate.
       var group=Object.assign({},best.group,{qualities:{},order:[best.quality]}),stream=best.group.qualities[best.quality];
       group.qualities[best.quality]=typeof stream==='string'?stream:stream.url;
       c.playGroupEpisode(group,season,episode,[group]);
      }
      if(result.best)launch(result.best);else if(result.needsChoice)alternatives(result,launch);else notice('Серия не найдена в проверенных источниках. Выберите источник или запустите полный поиск');
     },null,true);
    };
    if(typeof playGroup==='function')c.playGroupEpisode=function(group,season,episode,groups){
     if(dead||L.Activity.active()!==object)return;
     var wanted=playingChoice;playingChoice=null;
     if(wanted){group=(groups||[group]).filter(function(g){return g.voice===wanted.voice&&g.raw===wanted.raw;})[0];if(!group){notice('Озвучка стала недоступна. Выберите другую вручную');return;}}
     var list=candidates({source:wanted?wanted.source:'manual',voices:[group]}),best=highestQuality(list);
     if(enabled()&&best){var clone=Object.assign({},group);clone.order=[best.quality];clone.qualities={};clone.qualities[best.quality]=group.qualities[best.quality];group=clone;}
     var token=epoch,urls=[];
     [group,wanted&&wanted.group].forEach(function(g){if(g&&g.qualities)Object.keys(g.qualities).forEach(function(q){var v=g.qualities[q];if(typeof v==='string')urls.push(v);else if(v){if(v.url)urls.push(v.url);if(v.alt)urls.push(v.alt);}});});
     permits.push({urls:urls,season:Number(season),episode:Number(episode),valid:function(){return valid(token);}});if(permits.length>16)permits.shift();
     return playGroup.call(this,group,season,episode,groups);
    };
    if(typeof play==='function')c.play=function(group){
     if(enabled()&&desired&&!manual){
      if(group.voice===desired.voice||group.voice===selectedUiVoice)group=desired.group;
      else {var source=desired.source;cancel();manual=true;remember({source:source,voice:group.voice,raw:group.raw});}
     }
     var best=highestQuality(candidates({source:'manual',voices:[group]}));
     if(enabled()&&best){group=Object.assign({},group,{order:[best.quality],qualities:{}});group.qualities[best.quality]=best.group.qualities[best.quality];}
     return play.call(this,group);
    };
    function sourceOptions(options){
     cancel();var token=epoch;
       var originalSelect=options.onSelect;
       return Object.assign({},options,{items:[{title:'Подобрать источник и озвучку',homeAuto:true},{title:'Полный поиск по бесплатным источникам',homeAutoFull:true}].concat(options.items),onSelect:function(item){
        if(!valid(token))return;
        if(item.homeAuto||item.homeAutoFull){L.Select.close();manual=false;var r=resume();scan(r.season,r.episode,!!item.homeAutoFull,function(result){if(result.best)adopt(result.best,true);else if(result.needsChoice)alternatives(result,function(best){adopt(best,true);});else notice('Подходящий поток не найден. Доступен ручной выбор');},null,true);}
        else {manual=true;first=false;return originalSelect&&originalSelect.apply(this,arguments);}
       }});
    }
    owners.push({object:object,menu:sourceOptions});if(owners.length>10)owners.shift();
    return c;
   }
   Wrapped.prototype=Original.prototype;Wrapped.__homeSourceAuto=true;return Wrapped;
  }
  var selectShow=L.Select.show;
  L.Select.show=function(options){
   if(options&&Array.isArray(options.items)&&options.items.some(function(item){return typeof item.source==='string';})&&options.items.every(function(item){return typeof item.source==='string'||item.wish;})){
    var active=L.Activity.active();for(var i=owners.length-1;i>=0;i--)if(owners[i].object===active){options=owners[i].menu(options);break;}
   }
   return selectShow.call(this,options);
  };
  var add=L.Component.add;L.Component.add=function(name,component){return add.call(this,name,name==='bwa_online'?decorate(component):component);};
  var existing=L.Component.get('bwa_online');if(existing)L.Component.add('bwa_online',existing);
  if(L.SettingsApi&&L.SettingsApi.addParam)L.SettingsApi.addParam({component:'player',param:{name:'source_auto_enabled',type:'trigger',default:true},field:{name:'Автовыбор источника BWA',description:'Сначала привычная озвучка, затем разрешение. Ручной выбор сохраняется'}});
  return true;
 }
 return {voiceKey:voiceKey,candidates:candidates,choose:choose,createScanner:createScanner,install:install};
}));
