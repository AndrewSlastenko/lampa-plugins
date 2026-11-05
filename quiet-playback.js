/* Opt-in local preroll filter for Lampa. MIT. Reload Lampa after enabling/disabling. */
(function (root, factory) {
    'use strict';
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else if (root.Lampa) api.install(root.Lampa, root);
}(typeof window !== 'undefined' ? window : this, function () {
    'use strict';

    function install(Lampa, env) {
        if (!Lampa || !Lampa.Manifest || !Lampa.Player || !Lampa.Player.listener ||
            typeof Lampa.Player.listener.follow !== 'function' || !env ||
            !env.XMLHttpRequest || !env.XMLHttpRequest.prototype ||
            typeof env.XMLHttpRequest.prototype.open !== 'function' ||
            typeof env.URL !== 'function' || typeof env.URL.createObjectURL !== 'function' ||
            typeof env.Blob !== 'function') return false;
        if (Lampa._homeQuietPlayback) return true;

        var empty;
        try {
            empty = env.URL.createObjectURL(new env.Blob(['{"ad":[]}'], {type: 'application/json'}));
        } catch (error) { return false; }

        function isPreroll(method, url) {
            if (typeof method !== 'string' || method.toUpperCase() !== 'GET' || typeof url !== 'string') return false;
            try {
                var parsed = new env.URL(url, env.location && env.location.href);
                if ((parsed.protocol !== 'https:' && parsed.protocol !== 'http:') ||
                    parsed.pathname !== '/api/ad/get/preroll' || parsed.username || parsed.password) return false;
                var mirrors = Lampa.Manifest.cub_mirrors || [];
                for (var i = 0; i < mirrors.length; i++) {
                    var mirror = new env.URL('https://' + mirrors[i]);
                    if (parsed.host === mirror.host) return true;
                }
                return false;
            } catch (error) { return false; }
        }

        // Official VastManager uses raw XHR, bypassing Lampa.Reguest.
        // A native local response preserves its status/onload/JSON contract.
        var original = env.XMLHttpRequest.prototype.open;
        env.XMLHttpRequest.prototype.open = function (method, url) {
            if (!isPreroll(method, url)) return original.apply(this, arguments);
            var args = Array.prototype.slice.call(arguments);
            args[1] = empty;
            return original.apply(this, args);
        };
        Lampa.Player.listener.follow('create', function (event) {
            // This event precedes Preroll.show; keep the original media object.
            if (event && event.data && Object.prototype.hasOwnProperty.call(event.data, 'vast_url')) {
                delete event.data.vast_url;
            }
        });
        Lampa._homeQuietPlayback = '1.0.0';
        return true;
    }
    return {install: install};
}));
