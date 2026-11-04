/* YummyAnime -> native Android player progress bridge. MIT. */
(function (root, factory) {
    'use strict';
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else if (root.Lampa && root.Lampa.Android) api.install(root.Lampa, {
        changed: function (card) {
            if (root.$ && root.document) root.$(root.document).trigger('yani:watch-progress', [card]);
        }
    });
}(typeof window !== 'undefined' ? window : this, function () {
    'use strict';

    function clone(value) { return JSON.parse(JSON.stringify(value)); }
    function finite(value) { return typeof value === 'number' && isFinite(value); }
    function normal(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
    function episode(title, entry) {
        var prefix = normal(entry.title), value = normal(title);
        if (!prefix || value.indexOf(prefix) !== 0) return '';
        var rest = value.slice(prefix.length);
        if (!rest) return String(entry.number || '1');
        var match = rest.match(/^\s*[·|—-]\s*(?:серия|серія|episode)\s+(\d+(?:\.\d+)?)(?:\s|$|[·|—-])/i);
        return match ? match[1] : '';
    }
    function hash(id, number, entry) {
        var key = 'home-yani-progress|' + id + '|' + number + '|' + (entry.video_id || '') + '|' + (entry.voice || ''), value = 0;
        for (var i = 0; i < key.length; i++) value = ((value << 5) - value + key.charCodeAt(i)) | 0;
        return (value & 0x7fffffff) || 1;
    }
    function install(L, env) {
        env = env || {};
        if (!L || !L.Android || typeof L.Android.openPlayer !== 'function' || !L.Storage ||
            !L.Activity || !L.Timeline || !L.Timeline.view || !L.Timeline.listener ||
            typeof L.Timeline.listener.follow !== 'function') return false;
        if (L.Android._homeYummyProgress) return true;
        L.Android._homeYummyProgress = '0.1.2';
        var original = L.Android.openPlayer, contexts = {};
        function history() {
            var value = L.Storage.get('yani_playback_history', '{}');
            value = typeof value === 'string' ? JSON.parse(value) : clone(value);
            return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        }
        function enrich(item, id, entry) {
            if (!item || item.timeline) return item;
            var number = episode(item.title, entry);
            if (!number) return item;
            var out = Object.assign({}, item), key = hash(id, number, entry);
            var timeline = L.Timeline.view(key);
            var savedTime = Number(entry.time);
            if (number === String(entry.number) && finite(savedTime) && savedTime >= 0 && savedTime !== timeline.time && L.Timeline.update) {
                L.Timeline.update({hash:key,time:savedTime,duration:Number(entry.duration || 0),
                    percent:entry.duration ? savedTime / entry.duration * 100 : 0});
                timeline = L.Timeline.view(key);
            }
            out.time = Number(timeline.time || 0);
            out.timeline = Object.assign({}, timeline, {
                hash: key, duration: Number(timeline.duration || entry.duration || 0),
                handler: function (percent, time, duration) {
                    if (L.Timeline.update) L.Timeline.update({hash:key,percent:percent,time:time,duration:duration});
                }
            });
            contexts[key] = {id:id,number:number,voice:entry.voice,video_id:entry.video_id};
            return out;
        }
        L.Android.openPlayer = function (url, data) {
            var args = Array.prototype.slice.call(arguments);
            try {
                var activity = L.Activity.active();
                if (data && !data.timeline && activity && /^yani_/.test(activity.component || '')) {
                    var entries = history(), matches = Object.keys(entries).filter(function (id) {
                        return entries[id] && episode(data.title, entries[id]) === String(entries[id].number);
                    });
                    if (matches.length === 1) {
                        var id = matches[0], entry = entries[id];
                        var out = enrich(data, id, entry);
                        if (Array.isArray(data.playlist)) out.playlist = data.playlist.map(function (item) {
                            return enrich(item, id, entry);
                        });
                        args[1] = out;
                    }
                }
            } catch (ignore) { /* Preserve native behavior on unsupported payloads. */ }
            return original.apply(this, args);
        };
        L.Timeline.listener.follow('update', function (event) {
            try {
                var data = event && event.data, context = data && contexts[data.hash], road = data && data.road;
                if (!context || !road || !finite(road.time) || road.time < 0 || !finite(road.duration) || road.duration < 0) return;
                var entries = history(), entry = entries[context.id];
                if (!entry || String(entry.number) !== context.number || entry.voice !== context.voice || entry.video_id !== context.video_id) return;
                var time = road.time, duration = road.duration;
                // The native wrapper reports normal completion as0/0/100.
                if (road.percent === 100 && time === 0 && duration === 0) {
                    duration = Number(entry.duration);
                    time = duration;
                }
                if (!finite(duration) || duration <= 0) return;
                entry.time = Math.min(time, duration);
                entry.duration = duration;
                entry.updated_at = env.now ? env.now() : Date.now();
                if (road.percent >= 95 || entry.time / entry.duration >= 0.95) {
                    entry.finished_episodes = Object.assign({}, entry.finished_episodes || {});
                    entry.finished_episodes[context.number] = true;
                }
                if (entry.time / entry.duration >= 0.5) {
                    entry.half_watched_episodes = Object.assign({}, entry.half_watched_episodes || {});
                    entry.half_watched_episodes[context.number] = true;
                }
                L.Storage.set('yani_playback_history', JSON.stringify(entries));
                if (env.changed) env.changed(entry.card || null);
            } catch (ignore) { /* A corrupt optional history must not break playback. */ }
        });
        return true;
    }
    return {install:install};
}));
