/* 4Geeks first-party attribution tracker (served by the Marketing Hub).
   Install once through Google Tag Manager on 4geeks.com (and any 4Geeks site):
     <script async src="https://marketing.4geeksacademy.com/t.js"></script>
   Records each visit (page, referrer, UTMs, ad click ids), keeps one visitor id
   per browser, and when someone submits a form with an email it links the
   visitor to that lead. The email is SHA-256 hashed in the browser: the raw
   address never leaves the page through this script.
   Turn it off for a visitor with window.__4gTrack = false (e.g. no consent),
   and it also stays off when the browser sends Global Privacy Control. */
(function () {
  'use strict';
  if (window.__4gTrackLoaded) return; window.__4gTrackLoaded = true;
  if (window.__4gTrack === false || navigator.globalPrivacyControl === true) return;
  if (/bot|crawl|spider|headless|lighthouse|preview/i.test(navigator.userAgent || '')) return;

  var me = document.currentScript || document.querySelector('script[src*="/t.js"]');
  var ORIGIN = (me && me.src) ? me.src.replace(/\/t\.js.*$/, '') : 'https://marketing.4geeksacademy.com';
  var ENDPOINT = ORIGIN + '/t/c';
  var SITES = /(^|\.)(4geeks\.com|4geeksacademy\.com|4geeks\.co)$/i;
  var CLICK_IDS = ['gclid', 'gbraid', 'wbraid', 'fbclid', 'ttclid', 'msclkid', 'li_fat_id', 'twclid', 'ScCid'];
  var UTMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_id'];
  var SESSION_MS = 30 * 60 * 1000;

  // ---- storage (cookie on the root domain + localStorage backup) ----
  function rootDomain() { var p = location.hostname.split('.'); return p.length > 2 ? p.slice(-2).join('.') : location.hostname; }
  function getCookie(n) { var m = document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : null; }
  function setCookie(n, v, days) { try { document.cookie = n + '=' + encodeURIComponent(v) + '; path=/; max-age=' + Math.round(days * 86400) + '; domain=.' + rootDomain() + '; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : ''); } catch (e) {} }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function rid() { var a = new Uint8Array(12); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach(function (_, i) { a[i] = Math.random() * 256; }); return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }

  var params = new URLSearchParams(location.search);
  // Visitor id: cookie, else localStorage, else one handed over by a 4Geeks link (?_4gv=), else new.
  var vid = getCookie('_4g_vid') || ls('_4g_vid') || (/^[a-f0-9]{24}$/.test(params.get('_4gv') || '') ? params.get('_4gv') : null) || rid();
  setCookie('_4g_vid', vid, 730); ls('_4g_vid', vid);

  function campaignSig() {
    var s = []; UTMS.concat(CLICK_IDS).forEach(function (k) { if (params.get(k)) s.push(k + '=' + params.get(k)); }); return s.join('&');
  }
  function session() {
    var now = Date.now(); var raw = getCookie('_4g_sid') || ls('_4g_sid') || ''; var parts = raw.split('.');
    var sid = parts[0]; var last = Number(parts[1] || 0); var sig = parts.slice(2).join('.');
    var cs = campaignSig();
    var isNew = !sid || now - last > SESSION_MS || (cs && cs !== sig);
    if (isNew) sid = rid();
    var keep = cs || (isNew ? '' : sig);
    setCookie('_4g_sid', sid + '.' + now + '.' + keep, 1); ls('_4g_sid', sid + '.' + now + '.' + keep);
    return { sid: sid, isNew: isNew };
  }

  // ---- sending ----
  var queue = []; var timer = null;
  function flush() {
    timer = null; if (!queue.length) return;
    var body = JSON.stringify({ v: vid, e: queue.splice(0, 20) });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'text/plain' }))) return;
    } catch (e) {}
    try { fetch(ENDPOINT, { method: 'POST', body: body, keepalive: true, mode: 'cors', headers: { 'content-type': 'text/plain' } }); } catch (e) {}
  }
  function push(ev) { queue.push(ev); if (queue.length >= 10) flush(); else if (!timer) timer = setTimeout(flush, 800); }
  addEventListener('pagehide', flush); addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(); });

  // ---- page views (first load + single-page-app navigation) ----
  var lastPath = null;
  function pageview(first) {
    var path = location.pathname + location.search;
    if (path === lastPath) return; lastPath = path;
    params = new URLSearchParams(location.search);
    var s = session();
    var ev = { t: 'pv', ts: Date.now(), s: s.sid, h: location.hostname, p: location.pathname, ti: (document.title || '').slice(0, 120), m: /Mobi|Android/i.test(navigator.userAgent) ? 1 : 0 };
    if (s.isNew) {
      ev.ns = 1;
      if (first && document.referrer) ev.r = document.referrer.slice(0, 500);
      var u = {}; UTMS.forEach(function (k) { if (params.get(k)) u[k.replace('utm_', '')] = params.get(k).slice(0, 200); }); if (Object.keys(u).length) ev.u = u;
      for (var i = 0; i < CLICK_IDS.length; i++) { var c = params.get(CLICK_IDS[i]); if (c) { ev.c = CLICK_IDS[i]; ev.cv = c.slice(0, 300); break; } }
    }
    push(ev);
  }
  pageview(true);
  ['pushState', 'replaceState'].forEach(function (fn) { var o = history[fn]; history[fn] = function () { var r = o.apply(this, arguments); setTimeout(function () { pageview(false); }, 0); return r; }; });
  addEventListener('popstate', function () { pageview(false); });

  // ---- link the visitor to the lead when they submit an email ----
  function sha256(text) {
    if (!(window.crypto && crypto.subtle && window.TextEncoder)) return Promise.resolve(null);
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (b) { return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); });
  }
  var sent = {};
  function identifyFrom(root) {
    var inputs = (root || document).querySelectorAll('input[type=email], input[name*=email i], input[autocomplete=email]');
    for (var i = 0; i < inputs.length; i++) {
      var v = String(inputs[i].value || '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) || sent[v]) continue;
      sent[v] = 1;
      (function (email) {
        sha256(email).then(function (h) { if (h) { push({ t: 'id', ts: Date.now(), s: session().sid, h: location.hostname, p: location.pathname, eh: h }); flush(); } });
      })(v);
    }
  }
  document.addEventListener('submit', function (e) { identifyFrom(e.target); }, true);
  // Forms built with JS buttons don't always fire "submit": catch the click too.
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest && e.target.closest('button, input[type=submit], [role=button]');
    if (!b) return;
    var f = b.closest('form') || document;
    // Read the email NOW (during the click): many forms clear or replace themselves right after.
    if (/submit|send|enviar|apply|aplicar|start|empezar|get|quiero|details|detalles|next|siguiente/i.test((b.textContent || b.value || '') + ' ' + (b.type || ''))) identifyFrom(f);
  }, true);

  // ---- carry the visitor id across 4Geeks domains ----
  document.addEventListener('mousedown', function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    try {
      var u = new URL(a.href, location.href);
      if (u.hostname !== location.hostname && SITES.test(u.hostname) && rootDomain() !== u.hostname.split('.').slice(-2).join('.')) { u.searchParams.set('_4gv', vid); a.href = u.toString(); }
    } catch (err) {}
  }, true);

  window.__4g = { vid: vid, flush: flush };
})();
