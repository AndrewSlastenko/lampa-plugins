/* Torrent Title Search 0.1.2 - MIT - no accounts or telemetry. */
(function (root, factory) {
    'use strict';
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else {
        root.HomeMultiTitleSearch = api;
        if (root.Lampa) api.install(root.Lampa, root);
    }
}(typeof window !== 'undefined' ? window : this, function () {
    'use strict';
    var SETTING = 'home_multititle_search';
    function clean(value) { return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''; }
    function normalized(value) {
        value = clean(value);
        if (value.normalize) value = value.normalize('NFKC');
        return value.toLowerCase().replace(/ё/g, 'е').replace(/[\s.,:;!?「」『』“”"'’`\-–—]+/g, ' ').trim();
    }
    function aliases(movie) {
        var value = movie.alternative_titles || {};
        var list = Array.isArray(value) ? value : (value.titles || value.results || []);
        var out = Array.isArray(list) ? list.slice() : [];
        (Array.isArray(movie.names) ? movie.names : []).forEach(function (title) { out.push({ title: title }); });
        return out.filter(function (item) { return item && clean(item.title || item.name); });
    }
    function englishTitle(movie, metadata) {
        var explicit = clean(metadata.title || metadata.name || movie.english_title || movie.english_name);
        if (explicit) return explicit;
        var list = aliases(movie);
        for (var i = 0; i < list.length; i++) {
            var candidate=clean(list[i].title || list[i].name);
            if (/^(US|GB|AU|CA)$/i.test(list[i].iso_3166_1 || '') && !/^[A-Za-z]{1,2}$/.test(candidate)) return candidate;
        }
        return '';
    }
    function collectQueries(params, metadata) {
        params = params || {}; metadata = metadata || {};
        var movie = params.movie || {}, result = [], seen = Object.create(null);
        var season = (clean(params.search).match(/\s+S\d{2,3}$/i) || [''])[0];
        function add(title) {
            title = clean(title);
            if (!title || result.length >= 5) return;
            if (season && !/\s+S\d{2,3}$/i.test(title)) title += season;
            var key = normalized(title);
            if (key && !seen[key]) { seen[key] = true; result.push(title); }
        }
        var list = aliases(movie).concat(aliases(metadata));
        add(movie.title || movie.name);
        for (var i = 0; i < list.length; i++) {
            var title = clean(list[i].title || list[i].name);
            if ((list[i].iso_3166_1 === 'RU' || /[А-Яа-яЁё]/.test(title)) && normalized(title) !== normalized(movie.title || movie.name)) {
                add(title); break;
            }
        }
        add(englishTitle(movie, metadata));
        add(movie.original_title || movie.original_name);
        if (/[\u3040-\u30ff\u3400-\u9fff]/.test(movie.original_title || movie.original_name || '') || movie.original_language === 'ja') {
            // Prefer an explicitly labelled romanization, then an unlabelled existing alias.
            // Never guess a transliteration or treat another country's translation as romaji.
            for (var priority = 0; priority < 2; priority++) {
                var found = false;
                for (var j = 0; j < list.length; j++) {
                    var alternative = clean(list[j].title || list[j].name);
                    var labelled = list[j].iso_3166_1 === 'JP' || /romaji|romaniz|romanised|romanized/i.test(list[j].type || '');
                    if ((priority === 0 ? labelled : !list[j].iso_3166_1) &&
                        /^[\x20-\x7e]+$/.test(alternative) && /[A-Za-z]/.test(alternative) && !seen[normalized(alternative + season)]) {
                        add(alternative); found = true; break;
                    }
                }
                if (found) break;
            }
        }
        if (!result.length) add(params.search);
        return result;
    }
    function btih(value) {
        value = clean(value);
        if (/^[a-f\d]{40}$/i.test(value)) return value.toLowerCase();
        if (!/^[a-z2-7]{32}$/i.test(value)) return '';
        var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567', bits = 0, buffer = 0, output = '';
        for (var i = 0; i < value.length; i++) {
            buffer = (buffer << 5) | alphabet.indexOf(value.charAt(i).toUpperCase()); bits += 5;
            if (bits >= 8) { bits -= 8; output += ('0' + ((buffer >>> bits) & 255).toString(16)).slice(-2); }
        }
        return output;
    }
    function magnetHash(value) {
        if (typeof value !== 'string' || !/^magnet:\?/i.test(value)) return '';
        var parts = value.slice(value.indexOf('?') + 1).split('&');
        for (var i = 0; i < parts.length; i++) {
            var pair = parts[i].split('='), key = pair.shift(), text;
            try { key = decodeURIComponent(key); text = decodeURIComponent(pair.join('=')); } catch (_) { continue; }
            if (key.toLowerCase() === 'xt' && /^urn:btih:/i.test(text)) { var hash = btih(text.slice(9)); if (hash) return hash; }
        }
        return '';
    }
    function resultKey(item) {
        var hash = btih(item.InfoHash || item.infoHash || item.info_hash || '') || magnetHash(item.MagnetUri) || magnetHash(item.Link) || magnetHash(item.downloadUrl);
        if (hash) return 'btih:' + hash;
        var link = clean(item.Link || item.downloadUrl);
        if (link && !/^magnet:/i.test(link)) return 'url:' + link;
        return 'title:' + normalized(item.Title || item.title) + '|' + String(item.Size || item.size || '') + '|' + clean(item.Tracker);
    }
    function mergeResults(items) {
        var seen = Object.create(null), output = [];
        (Array.isArray(items) ? items : []).forEach(function (item) {
            if (!item || typeof item !== 'object') return;
            var key = resultKey(item);
            if (!seen[key] && output.length < 2000) { seen[key] = true; output.push(item); }
        });
        return output;
    }
    function clone(value) { var out = {}; Object.keys(value || {}).forEach(function (key) { out[key] = value[key]; }); return out; }
    function snapshot(rows) { return JSON.parse(JSON.stringify(rows)); }

    function createController(originalGet, originalClear, options) {
        options = options || {};
        var now = options.now || Date.now, later = options.setTimeout || setTimeout, cancel = options.clearTimeout || clearTimeout;
        var gap = options.gapMs === undefined ? 2000 : options.gapMs;
        var deadline = options.deadlineMs || 40000, requestTimeout = options.requestTimeoutMs || 16000;
        var metadataTimeout = options.metadataTimeoutMs || 2500, generation = 0, active = null, cache = [];
        var lastStatus = {};
        function invalidate() {
            generation++;
            if (active) { active.live = false; active.timers.forEach(cancel); active = null; }
        }
        function clear() { invalidate(); if (originalClear) return originalClear(); }
        function get(params, complete, fail) {
            invalidate();
            params = params || {};
            if (!params.movie || params.from_search || params.clarification) return originalGet(params, complete, fail);
            var session = { live:true, token:generation, timers:[], rows:[], success:0, errors:[], completed:0, started:now(), lastStart:-Infinity, queries:[] };
            active = session;
            function valid() { return session.live && session.token === generation; }
            function schedule(fn, delay) { var id = later(function () { if (valid()) fn(); }, delay); session.timers.push(id); return id; }
            var key = '';
            function finish(expired) {
                if (!valid()) return;
                session.live = false; session.timers.forEach(cancel); active = null;
                var rows = mergeResults(session.rows);
                lastStatus = {queries:session.queries.slice(), completed:session.completed, total:session.queries.length, results:rows.length, elapsedMs:now()-session.started, partial:!!expired || session.errors.length > 0, cache:false};
                if (session.success) {
                    var result = {Results:rows};
                    if (!expired && !session.errors.length && key) {
                        cache = cache.filter(function (entry) { return entry.key !== key && entry.until > now(); });
                        cache.push({key:key, until:now()+10*60*1000, result:{Results:snapshot(rows)}}); if (cache.length > 12) cache.shift();
                    }
                    if (typeof complete === 'function') complete(result);
                } else if (typeof fail === 'function') fail(session.errors[0] || 'Парсер не ответил за отведённое время');
            }
            schedule(function () { finish(true); }, deadline);
            function begin(metadata) {
                if (!valid() || session.queries.length) return;
                session.queries = collectQueries(params, metadata);
                if (!session.queries.length) { session.errors.push('Нет названия для поиска'); finish(false); return; }
                key = JSON.stringify([options.contextKey ? options.contextKey() : '', params.movie.source || 'tmdb', params.movie.id || '', params.movie.release_date || '', params.movie.first_air_date || '', params.movie.original_name ? 'tv':'movie', !!params.global, !!params.other, params.movie.genres || [], params.movie.number_of_seasons || 0, params.movie.original_language || '', session.queries]);
                var cached = cache.filter(function (entry) { return entry.key === key && entry.until > now(); })[0];
                if (cached) {
                    schedule(function () {
                        if (!valid()) return;
                        session.live = false; session.timers.forEach(cancel); active = null;
                        lastStatus = {queries:session.queries.slice(), results:cached.result.Results.length, cache:true};
                        if (typeof complete === 'function') complete({Results:snapshot(cached.result.Results)});
                    }, 0);
                    return;
                }
                if (options.onStart) options.onStart(session.queries.slice());
                function next(index) {
                    if (!valid()) return;
                    if (index >= session.queries.length) { finish(false); return; }
                    var wait = Math.max(0, gap - (now()-session.lastStart));
                    if (wait > 0) { schedule(function () { next(index); }, wait); return; }
                    session.lastStart = now();
                    var queryParams = clone(params); queryParams.movie = clone(params.movie);
                    queryParams.movie.genres = Array.isArray(params.movie.genres) ? params.movie.genres.slice() : [];
                    queryParams.search = session.queries[index]; queryParams.clarification = true;
                    var settled = false;
                    function settle(result, error) {
                        if (!valid() || settled) return;
                        settled = true; cancel(watchdog); session.completed++;
                        if (result && Array.isArray(result.Results)) { session.success++; session.rows = session.rows.concat(result.Results); }
                        else session.errors.push(error || 'Некорректный ответ парсера');
                        next(index+1);
                    }
                    var watchdog = schedule(function () { settle(null, 'Парсер не ответил за отведённое время'); }, requestTimeout);
                    try { originalGet(queryParams, function (result) { settle(result); }, function (error) { settle(null, error); }); }
                    catch (error) { settle(null, error.message || String(error)); }
                }
                next(0);
            }
            var metadataDone = false;
            function resolved(data) { if (!valid() || metadataDone) return; metadataDone = true; cancel(metadataTimer); begin(data || {}); }
            var metadataTimer = schedule(function () { resolved({}); }, metadataTimeout);
            try { if (options.resolveMetadata) options.resolveMetadata(params, resolved); else resolved({}); }
            catch (_) { resolved({}); }
        }
        return {get:get, clear:clear, status:function () { return clone(lastStatus); }};
    }

    function install(Lampa, environment) {
        environment = environment || {};
        if (!Lampa.Parser || typeof Lampa.Parser.get !== 'function' || typeof Lampa.Parser.clear !== 'function') return null;
        if (Lampa.Parser.get.__homeMultiTitle) return Lampa.Parser.get.__homeMultiTitle;
        var savedGet = Lampa.Parser.get, savedClear = Lampa.Parser.clear, registered = false;
        function enabled() {
            var value = Lampa.Storage.get(SETTING, true);
            return value !== false && value !== 'false' && value !== 0 && value !== '0';
        }
        function contextKey() {
            return JSON.stringify(['parser_torrent_type','parser_use_link','jackett_url','jackett_key','jackett_url_two','jackett_key_two','jackett_interview','prowlarr_url','prowlarr_key','prowlarr_url_two','prowlarr_key_two','torrserver_url','torrserver_url_two','torrserver_use_link','torrserver_search_type'].map(function (name) { return Lampa.Storage.field(name); }));
        }
        var controller = createController(function () { return savedGet.apply(Lampa.Parser, arguments); }, function () { return savedClear.apply(Lampa.Parser, arguments); }, {
            contextKey:contextKey,
            resolveMetadata:function (params, done) {
                var movie = params.movie || {};
                if (englishTitle(movie, {})) { done({}); return; }
                var id = movie.tmdb_id || ((!movie.source || movie.source === 'tmdb') ? movie.id : null);
                var tmdb = Lampa.Api && Lampa.Api.sources && Lampa.Api.sources.tmdb;
                if (!id || !/^\d+$/.test(String(id)) || !tmdb || typeof tmdb.get !== 'function') { done({}); return; }
                var type = movie.original_name || movie.number_of_seasons > 0 || movie.media_type === 'tv' ? 'tv' : 'movie';
                tmdb.get(type+'/'+id+'?append_to_response=alternative_titles', {langs:'en'}, done, function () { done({}); }, {life:10080});
            },
            onStart:function (queries) {
                if (queries.length > 1 && Lampa.Noty) Lampa.Noty.show('Поиск по '+queries.length+' названиям…', {time:2500});
            }
        });
        function wrapped(params, complete, fail) {
            if (!enabled()) { controller.clear(); return savedGet.call(Lampa.Parser, params, complete, fail); }
            return controller.get(params, complete, fail);
        }
        var handle = {version:'0.1.1', controller:controller, uninstall:function () { controller.clear(); if (Lampa.Parser.get === wrapped) { Lampa.Parser.get = savedGet; Lampa.Parser.clear = savedClear; } }};
        wrapped.__homeMultiTitle = handle;
        Lampa.Parser.get = wrapped; Lampa.Parser.clear = controller.clear;
        function settings() {
            if (registered || !Lampa.SettingsApi) return;
            registered = true;
            Lampa.SettingsApi.addComponent({component:SETTING, name:'Поиск торрентов по названиям', icon:'<svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15 15l6 6" stroke="currentColor" stroke-width="2"/></svg>'});
            Lampa.SettingsApi.addParam({component:SETTING, param:{name:SETTING,type:'trigger','default':true}, field:{name:'Искать по нескольким названиям',description:'Русское, английское и оригинальное названия. Одинаковые раздачи объединяются.'}});
            if (Lampa.Storage.listener) Lampa.Storage.listener.follow('change', function (event) { if (event.name === SETTING) controller.clear(); });
        }
        if (environment.appready) settings();
        else if (Lampa.Listener) Lampa.Listener.follow('app', function (event) { if (event.type === 'ready') settings(); });
        if (Lampa.Manifest) Lampa.Manifest.plugins = {type:'other', version:handle.version, name:'Поиск торрентов по названиям', description:'Автоматический поиск торрентов по переводам и оригинальному названию'};
        return handle;
    }
    return {collectQueries:collectQueries, mergeResults:mergeResults, createController:createController, install:install};
}));
