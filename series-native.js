/* Ordinary series -> Android player metadata and guarded next episode. MIT. */
(function(root,factory){
 'use strict';var api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else if(root.Lampa&&root.Lampa.Player)api.install(root.Lampa);
}(typeof window!=='undefined'?window:this,function(){
 'use strict';
 function integer(v,min,max){return /^(0|[1-9][0-9]*)$/.test(String(v))&&Number(v)>=min&&Number(v)<=max;}
 function identity(movie){
  if(!movie||!(movie.original_name||movie.number_of_seasons||movie.seasons||movie.media_type==='tv'||(movie.name&&!movie.title)))return null;
  if((!movie.source||movie.source==='tmdb')&&integer(movie.id,1,99999999))return 'tmdb:'+movie.id;
  return /^tt[0-9]{7,9}$/.test(movie.imdb_id||'')?'imdb:'+movie.imdb_id:null;
 }
 function annotate(url,meta){
  if(typeof url!=='string'||!/^https?:\/\//.test(url)||/(?:#|&)homeafr_(?:anime|series)=/.test(url))return url;
  return url+(url.indexOf('#')<0?'#':'&')+'homeafr_series='+meta.id+':'+meta.season+':'+meta.episode+':3';
 }
 function torrentMetadata(item){
  if(!item||!item.torrent_hash||typeof item.path!=='string'||!integer(item.season,0,999)||!integer(item.episode,1,99999))return null;
  var id=identity(item.card);if(!id)return null;
  var path=item.path,found=[],match;
  var re=/(?:^|[^a-z0-9])s(\d{1,3})[ ._-]*e(\d{1,5})(?!\d)(?![ ._-]*e\d|[-+]\d)/gi;
  while((match=re.exec(path)))found.push([Number(match[1]),Number(match[2])]);
  if(!found.length){
   re=/(?:^|[^a-z0-9])(\d{1,3})x(\d{1,5})(?!\d)(?![ ._-]*x\d|[-+]\d)/gi;
   while((match=re.exec(path)))found.push([Number(match[1]),Number(match[2])]);
  }
  if(!found.length){
   var parts=path.split(/[\\/]/),seasons=[];
   parts.slice(0,-1).forEach(function(p){var m=/^(?:season|сезон|s)[ ._-]*(\d{1,3})$/i.exec(p);if(m)seasons.push(Number(m[1]));});
   var e=/(?:^|[^a-z0-9])(?:episode|ep|e|серия)[ ._-]*(\d{1,5})(?!\d)(?![ ._-]*e\d|[-+]\d)/i.exec(parts[parts.length-1]);
   if(seasons.length===1&&e)found.push([seasons[0],Number(e[1])]);
  }
  if(found.length!==1||found[0][0]!==Number(item.season)||found[0][1]!==Number(item.episode))return null;
  return {id:id,season:found[0][0],episode:found[0][1]};
 }
 function install(L,env){
  if(!L||L.__homeSeriesNative||!L.Component||!L.Component.get||!L.Player||!L.Player.listener||
    !L.PlayerPlaylist||!L.PlayerPlaylist.listener||!L.Timeline||!L.Timeline.listener||!L.Android||!L.Android.openPlayer)return false;
  L.__homeSeriesNative=true;env=env||{};
  var later=env.setTimeout||setTimeout,clear=env.clearTimeout||clearTimeout;
  var states=[],generation=0,pending=null,active=null,internal=false;
  var sequence=0,prefix='home-series-launch:',nonce=Date.now().toString(36)+Math.random().toString(36).slice(2,8);
  var timelineView=L.Timeline.view,timelineUpdate=L.Timeline.update;
  L.Timeline.view=function(hash){if(String(hash).indexOf(prefix)===0)return Object.assign({hash:hash,time:0,duration:0,percent:0},active&&active.hash===hash?active.nativeRoad:{});return timelineView.apply(this,arguments);};
  L.Timeline.update=function(params){if(params&&String(params.hash).indexOf(prefix)===0){if(active&&String(params.hash)===String(active.hash))active.result(params.percent,params.time,params.duration);return;}return timelineUpdate.apply(this,arguments);};
  if(L.Listener&&L.Listener.follow)L.Listener.follow('activity',function(event){var owner=(active||pending);if(owner&&event&&event.object&&event.object!==owner.activity)cancel();});
  if(L.Activity.listener&&L.Activity.listener.follow)L.Activity.listener.follow('popstate',cancel);
  function enabled(key){return !L.Storage||L.Storage.get(key,true)!==false;}
  function cancel(){generation++;if(pending)clear(pending.timer);pending=null;if(active&&active.timer)clear(active.timer);active=null;}
  function notice(text){if(L.Noty)L.Noty.show(text);}
  function valid(session){return session&&generation===session.generation&&session.state.revision===session.revision&&L.Activity.active()===session.activity;}
  function decorate(Original){
   if(!Original||Original.__homeSeriesNative)return Original;
   function Wrapped(object){
    var returned=Original.apply(this,arguments),component=returned&&typeof returned==='object'?returned:this;
    var state={object:object,rows:{},revision:0,voice:'',provider:''};states.push(state);if(states.length>10)states.shift();
    var contextmenu=component.contextmenu,filter=component.filter,destroy=component.destroy;
    if(typeof contextmenu==='function')component.contextmenu=function(params){
     var e=params&&params.element,view=params&&params.view,id=identity(object.movie);
     if(id&&e&&view&&view.hash!==undefined&&integer(e.season,0,999)&&integer(e.episode,1,99999)){
      state.rows[String(view.hash)]={id:id,season:Number(e.season),episode:Number(e.episode),voice:String(e.translate_voice||state.voice),provider:state.provider};
      var keys=Object.keys(state.rows);if(keys.length>500)delete state.rows[keys[0]];
     }
     return contextmenu.apply(this,arguments);
    };
    if(typeof filter==='function')component.filter=function(items,choice){
     state.revision++;state.rows={};if((active&&active.state===state)||(pending&&pending.state===state))cancel();
     var result=filter.apply(this,arguments);choice=choice||{};items=items||{};
     state.voice=String((items.voice||[])[choice.voice]||'');state.provider=String((items.source||[])[choice.source]||'');return result;
    };
    if(typeof destroy==='function')component.destroy=function(){state.revision++;state.rows={};if((active&&active.state===state)||(pending&&pending.state===state))cancel();return destroy.apply(this,arguments);};
    return component;
   }
   Wrapped.prototype=Original.prototype;Wrapped.__homeSeriesNative=true;return Wrapped;
  }
  var add=L.Component.add;
  L.Component.add=function(name,component){return add.call(this,name,name==='online_mod'?decorate(component):component);};
  var existing=L.Component.get('online_mod');if(existing)L.Component.add('online_mod',existing);
  var open=L.Android.openPlayer;
  L.Android.openPlayer=function(url,data){
   if(!internal)cancel();
   if(!internal&&data&&data.torrent_hash&&enabled('series_native_skip')){
    function copy(item){var out=Object.assign({},item),meta=torrentMetadata(item);delete out.playlist;if(meta)out.url=annotate(item.url,meta);return out;}
    var cloned=copy(data),meta=torrentMetadata(data);if(Array.isArray(data.playlist))cloned.playlist=data.playlist.map(copy);
    var args=Array.prototype.slice.call(arguments);args[0]=meta?annotate(url,meta):url;args[1]=cloned;return open.apply(this,args);
   }
   return open.apply(this,arguments);
  };
  function launch(session,item,index){
   if(!valid(session))return;
   var meta=session.state.rows[String(item.timeline&&item.timeline.hash)];
   if(!meta||meta.id!==session.meta.id||meta.season!==session.meta.season||meta.voice!==session.meta.voice||meta.provider!==session.meta.provider||typeof item.url!=='string'||!/^https?:\/\//.test(item.url)){
    notice('Следующая серия недоступна в выбранном источнике');return;
   }
   var hash=prefix+nonce+':'+(++sequence);
   var original=item.timeline,road=L.Timeline.view(original.hash),returned=false;
   var out=Object.assign({},item),url=enabled('series_native_skip')?annotate(item.url,meta):item.url;
   var nativeRoad={hash:hash,time:Number(road.time||0),duration:Number(road.duration||0),percent:Number(road.percent||0)};
   function result(percent,time,duration){
    if(returned||!valid(session)||active!==session||!isFinite(percent)||!isFinite(time)||!isFinite(duration)||time<0||duration<0)return;
    var finished=percent===100&&time===0&&duration===0;
    if(!finished&&time===0&&duration===0)return;
    returned=true;
    if(finished){time=Number(road.duration||0);duration=time;}
    if(typeof original.handler==='function')original.handler(finished?100:percent,time,duration);
    else L.Timeline.update({hash:original.hash,percent:finished?100:percent,time:time,duration:duration});
    if(!finished||!enabled('series_native_next'))return;
    session.timer=later(function(){
     if(!valid(session)||active!==session)return;
     var next=session.list[index+1];if(!next){notice('Серии выбранного сезона закончились');return;}
     var nextMeta=session.state.rows[String(next.timeline&&next.timeline.hash)];
     if(!nextMeta||nextMeta.episode!==meta.episode+1||nextMeta.season!==meta.season||nextMeta.voice!==meta.voice||nextMeta.provider!==meta.provider){notice('Следующая серия недоступна в выбранном источнике');return;}
     if(typeof next.url==='function'){
      var done=false;session.timer=later(function(){if(!done&&valid(session)){done=true;notice('Не удалось загрузить следующую серию');}},20000);
      try{next.url(function(){if(done||!valid(session)||active!==session)return;done=true;clear(session.timer);launch(session,next,index+1);});}
      catch(ignore){done=true;clear(session.timer);notice('Не удалось загрузить следующую серию');}
     }else launch(session,next,index+1);
    },200);
   }
   out.url=url;out.position=nativeRoad.time;out.time=nativeRoad.time;
   out.timeline=Object.assign({},nativeRoad,{handler:result});
   if(out.quality){out.quality=Object.assign({},out.quality);Object.keys(out.quality).forEach(function(k){var q=out.quality[k];if(typeof q==='string')out.quality[k]=enabled('series_native_skip')?annotate(q,meta):q;else if(q&&typeof q==='object'&&typeof q.url==='string')out.quality[k]=Object.assign({},q,{url:enabled('series_native_skip')?annotate(q.url,meta):q.url});});}
   var single=Object.assign({},out);delete single.playlist;out.playlist=[single];
   session.hash=hash;session.result=result;session.nativeRoad=nativeRoad;active=session;
   internal=true;try{L.Android.openPlayer(url,out);}finally{internal=false;}
  }
  L.Player.listener.follow('create',function(event){
   cancel();var data=event&&event.data,activity=L.Activity.active();
   if(!data||!data.timeline||!activity||activity.component!=='online_mod'||
     (!enabled('series_native_skip')&&!enabled('series_native_next'))||!L.Platform||!L.Platform.is('android')||
     (data.launch_player&&data.launch_player!=='android')||(!data.launch_player&&L.Storage&&L.Storage.field&&L.Storage.field('player')!=='android'))return;
   var state=null;for(var i=states.length-1;i>=0;i--)if(states[i].object===activity){state=states[i];break;}
   var meta=state&&state.rows[String(data.timeline.hash)];if(!meta||typeof data.url!=='string'||!/^https?:\/\//.test(data.url))return;
   event.abort();var session={generation:generation,state:state,revision:state.revision,activity:activity,meta:meta,first:data,list:[data]};pending=session;
   session.timer=later(function(){if(pending===session&&valid(session)){pending=null;launch(session,data,0);}},0);
  });
  L.PlayerPlaylist.listener.follow('set',function(event){
   var session=pending,list=event&&event.playlist;if(!session||!valid(session)||!Array.isArray(list))return;
   var index=list.indexOf(session.first);if(index<0)index=list.findIndex(function(p){return p.timeline&&String(p.timeline.hash)===String(session.first.timeline.hash)&&p.url===session.first.url;});
   if(index<0)return;clear(session.timer);pending=null;session.list=list.slice();session.timer=later(function(){launch(session,session.first,index);},0);
  });
  L.Timeline.listener.follow('update',function(event){var d=event&&event.data;if(active&&d&&d.road&&String(d.hash)===String(active.hash))active.result(d.road.percent,d.road.time,d.road.duration);});
  if(L.SettingsApi&&L.SettingsApi.addParam){['series_native_skip','series_native_next'].forEach(function(key){L.SettingsApi.addParam({component:'player',param:{name:key,type:'trigger',default:true},field:{name:key==='series_native_skip'?'Пропуск заставок сериалов':'Следующая серия в Android-плеере',description:key==='series_native_skip'?'Пять секунд на отмену кнопкой OK':'Тот же сезон, источник и озвучка'}});});}
  return true;
 }
 return {install:install,identity:identity,annotate:annotate};
}));
