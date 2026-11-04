/* TorrServer Auto - MIT. Uses only addresses configured in Lampa. */
(function (root, factory) {
    'use strict';
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else {
        root.HomeTorrServerAuto = api;
        if (root.Lampa) api.install(root.Lampa, root);
    }
}(typeof window !== 'undefined' ? window : this, function () {
    'use strict';
    var SETTING = 'home_torrserver_auto';
    function install(Lampa, environment) {
        if (!Lampa || !Lampa.Torrent || !Lampa.Storage || !Lampa.Reguest ||
            typeof Lampa.Torrent.start !== 'function' || typeof Lampa.Torrent.open !== 'function' ||
            typeof Lampa.Storage.get !== 'function' || typeof Lampa.Storage.set !== 'function' ||
            typeof Lampa.Storage.field !== 'function') return false;
        if (Lampa.Torrent._homeTorrServerAuto) return Lampa.Torrent._homeTorrServerAuto;
        var env = environment || (typeof window !== 'undefined' ? window : {});
        var later = env.setTimeout || setTimeout, cancelTimer = env.clearTimeout || clearTimeout;
        var pending = null, invoking = false, creatingActivity = null;
        function notify(message) { if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show(message); }
        function address(key) {
            var value = Lampa.Storage.get(key, '');
            if (typeof value !== 'string' || !value.trim()) return '';
            value = value.trim();
            if (Lampa.Utils && Lampa.Utils.checkEmptyUrl) value = Lampa.Utils.checkEmptyUrl(value);
            else if (!/^https?:\/\//i.test(value)) value = 'http://' + value;
            return value.replace(/\/+$/, '');
        }
        function enabled() {
            var v = Lampa.Storage.get(SETTING, true);
            return v !== false && v !== 'false' && v !== 0 && v !== '0';
        }
        function wrap(original, mode) {
            return function () {
                var receiver = this, args = arguments;
                if (invoking) return original.apply(receiver, args);
                if (pending) { pending.cancel(); pending = null; }
                var one = address('torrserver_url'), two = address('torrserver_url_two');
                if (!enabled() || !one || !two || one === two ||
                    (Lampa.Platform && Lampa.Platform.is('android') && !Lampa.Storage.field('internal_torrclient')))
                    return original.apply(receiver, args);
                var active = true, stopProbe = function () {};
                var owner = creatingActivity || (Lampa.Activity && Lampa.Activity.active ? Lampa.Activity.active() : null);
                var operation = {owner:owner, cancel:function () { active = false; stopProbe(); }};
                pending = operation;
                function finish(choice) {
                    if (!active) return;
                    operation.cancel();
                    if (pending === operation) pending = null;
                    if (!choice) {
                        var message = mode === 'open' ? 'TorrServer: торрент не найден на доступных серверах. Откройте карточку и выберите раздачу заново.' : 'TorrServer: оба настроенных сервера недоступны';
                        notify(message);
                        if (mode === 'list' && typeof args[1] === 'function') args[1](message);
                        return;
                    }
                    Lampa.Storage.set('torrserver_use_link', choice);
                    notify('TorrServer: выбран сервер ' + (choice === 'one' ? '1 (основной)' : '2 (резервный)'));
                    invoking = true;
                    try { original.apply(receiver, args); }
                    finally { invoking = false; }
                }
                function probe(url, done) {
                    var settled = false, network, timer;
                    function clear() {
                        if (timer !== undefined) cancelTimer(timer);
                        if (network && network.clear) { try { network.clear(); } catch (ignore) {} }
                    }
                    function settle(ok) {
                        if (settled || !active) return;
                        settled = true;
                        clear();
                        done(ok);
                    }
                    stopProbe = function () { settled = true; clear(); };
                    timer = later(function () { settle(false); }, 1500);
                    try {
                        network = new Lampa.Reguest();
                        network.timeout(1500);
                        var options = {};
                        if (Lampa.Storage.field('torrserver_auth') && Lampa.Base64 && Lampa.Base64.encode) {
                            var password = Lampa.Storage.value ? Lampa.Storage.value('torrserver_password') : Lampa.Storage.get('torrserver_password', '');
                            options.headers = {Authorization:'Basic ' + Lampa.Base64.encode(Lampa.Storage.get('torrserver_login', '') + ':' + password)};
                        }
                        network.native(url + (mode === 'open' ? '/torrents' : '/settings'), function (json) {
                            if (typeof json === 'string') { try { json = JSON.parse(json); } catch (ignore) { json = null; } }
                            settle(!!json && typeof json === 'object' && !Array.isArray(json) && (mode === 'open' ? json.hash === args[0] && Array.isArray(json.file_stats) : typeof json.CacheSize !== 'undefined'));
                        }, function () { settle(false); }, JSON.stringify(mode === 'open' ? {action:'get',hash:args[0]} : {action:'get'}), options);
                    } catch (ignore) { settle(false); }
                }
                var first = mode === 'open' && Lampa.Storage.field('torrserver_use_link') === 'two' ? 'two' : 'one';
                var second = first === 'one' ? 'two' : 'one';
                probe(first === 'one' ? one : two, function (ok) {
                    if (ok) finish(first);
                    else probe(second === 'one' ? one : two, function (healthy) { finish(healthy ? second : null); });
                });
            };
        }
        if (Lampa.Listener && Lampa.Listener.follow) {
            Lampa.Listener.follow('activity', function (event) {
                if (!event) return;
                // init precedes component.onCreate; create follows it; start activates that same object.
                if (event.type === 'init') creatingActivity = event.object || null;
                if (event.type === 'create' && event.object === creatingActivity) creatingActivity = null;
                if (pending && event.type === 'start' && (!pending.owner || pending.owner !== event.object)) {
                    pending.cancel(); pending = null;
                }
            });
        }
        var originals = {start:Lampa.Torrent.start, open:Lampa.Torrent.open};
        Lampa.Torrent.start = wrap(originals.start, 'start');
        Lampa.Torrent.open = wrap(originals.open, 'open');
        if (Lampa.Torserver) {
            ['list', 'my'].forEach(function (name) {
                if (typeof Lampa.Torserver[name] === 'function') Lampa.Torserver[name] = wrap(Lampa.Torserver[name], 'list');
            });
        }
        var handle = {version:'0.1.1'};
        Lampa.Torrent._homeTorrServerAuto = handle;
        if (Lampa.SettingsApi && Lampa.SettingsApi.addParam) {
            Lampa.SettingsApi.addParam({component:'server',param:{name:SETTING,type:'trigger','default':true},
                field:{name:'Автовыбор TorrServer',description:'Перед новым запуском: сервер 1, иначе сервер 2. Проверка до 1,5 с на сервер. Оба недоступны — запуск отменяется.'}});
        }
        return handle;
    }
    return {install:install};
}));
