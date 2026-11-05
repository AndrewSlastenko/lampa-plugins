/* Source Auto: optional voice-first BWA selection. MIT. */
(function(root,factory){
 'use strict';var api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else if(root.Lampa)api.install(root.Lampa,root);
}(typeof window!=='undefined'?window:this,function(){
 'use strict';
 function voiceTier(value){
  var s=String(value||'').toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]/g,'');
  if(/hdrezka(?:studio)?|твшоус|tvshows|redheadsound/.test(s))return 0;
  if(/кубиквкубе|kubikvkube/.test(s))return 1;
  if(/lostfilm|newstudio|alexfilm/.test(s))return 2;
  if(/дублирован|многоголос|двухголос|профессиональн|русск/.test(s)&&!/субтитр/.test(s))return 3;
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
   if(!group||voiceTier(group.voice)===99||!group.qualities)return;
   Object.keys(group.qualities).forEach(function(q){
    var stream=group.qualities[q],url=typeof stream==='string'?stream:stream&&stream.url;
    if(typeof url!=='string'||!/^https?:\/\/[^\s]+$/i.test(url)||/cam|tsrip|telesync/i.test(q))return;
    out.push({source:result.source,voice:group.voice,raw:group.raw,quality:q,height:resolution(q),tier:voiceTier(group.voice),group:group});
   });
  });return out;
 }
 function choose(list,preferred){
  var rows=list.filter(function(c){return !preferred||(c.source===preferred.source&&c.voice===preferred.voice);});
  rows.sort(function(a,b){return a.tier-b.tier||b.height-a.height;});return rows[0]||null;
 }
 function movieKey(movie){return movie&&movie.id?(movie.source||'tmdb')+':'+(movie.name||movie.first_air_date?'tv:':'movie:')+movie.id:null;}
 function createScanner(env){
  var later=env.setTimeout||setTimeout,clear=env.clearTimeout||clearTimeout,now=env.now||Date.now,cache={};
  return {scan:function(movie,opts,callback){
   opts=opts||{};var cancelled=false,finished=false,sourceTimer,deadline,rows=[],asked={},catalog=[],meta={},count=0;
   var key=movieKey(movie)+':'+(opts.season||0)+':'+(opts.episode||0),max=opts.full?30:3;
   function stop(){cancelled=true;clear(sourceTimer);clear(deadline);}
   function finish(){
    if(cancelled||finished)return;finished=true;clear(sourceTimer);clear(deadline);
    cache[key]={at:now(),rows:rows.slice()};var best=choose(rows,opts.preferred);
    callback({best:best,alternatives:rows.slice().sort(function(a,b){return a.tier-b.tier||b.height-a.height;}),needsChoice:!!opts.preferred&&!best,checked:count});
   }
   if(!movieKey(movie)){finish();return stop;}
   if(!opts.full&&cache[key]&&now()-cache[key].at<120000){rows=cache[key].rows.slice();finish();return stop;}
   deadline=later(finish,opts.full?30000:12000);
   function allowed(id){var entry=catalog.filter(function(s){return s&&s.id===id;})[0],m=meta[id]||{};return entry&&!entry.paid&&!entry.bound&&!m.account_only&&!m.avoid&&!m.auth&&id!=='peregon'&&id!=='kinogo'&&(!opts.hidden||opts.hidden.indexOf(id)<0);}
   function next(){
    if(cancelled||finished)return;
    if(opts.preferred&&choose(rows,opts.preferred))return finish();
    if(count>=max)return finish();
    var available=catalog.filter(function(s){return s&&allowed(s.id)&&!asked[s.id];});
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
   if(opts.hidden&&opts.hidden.indexOf(seed)>=0)seed='videodb';
   query(seed);return stop;
  }};
 }
 function install(){return false;}
 return {candidates:candidates,choose:choose,createScanner:createScanner,install:install};
}));
