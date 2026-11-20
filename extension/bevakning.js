// ==UserScript==
// @name         Trafikverket provtidsbevakning
// @description  Aviserar när en ledig provtid dyker upp. Bokar ingenting.
// @match        https://fp.trafikverket.se/Boka/*
// @run-at       document-idle
// @noframes
// @grant        none
// ==/UserScript==
/*
 * Bevakning av lediga provtider hos Trafikverket (endast avisering, bokar ingenting).
 *
 * Användning:
 *   1. Logga in med BankID på https://fp.trafikverket.se/Boka/ng/ i Chrome.
 *   2. Öppna DevTools-konsolen (Cmd+Option+J), klistra in hela den här filen, tryck Enter.
 *      (Eller lägg filen som skript i Tampermonkey, då startar den av sig själv.)
 *   3. Klicka "Aktivera notiser och ljud" i rutan nere till höger.
 *   4. Skapa en bevakning genom att välja datumintervall under "Ny bevakning".
 *   5. Klicka "Lägg till orter här" under bevakningen och gör sedan en vanlig sökning
 *      på sidan för varje ort. Klicka "Klar" efteråt.
 *   6. Vill du ha notiser i mobilen: klicka "Slå på mobilnotiser" och följ instruktionen.
 *   7. Låt fliken vara öppen. När en tid inom ett intervall dyker upp får du ljud, notis och push.
 *
 * Orterna sparas i webbläsaren. Efter utloggning räcker det att logga in med BankID igen.
 */
(function () {
  'use strict';

  var CONFIG = {
    // Varje bevakning har ett eget datumintervall (båda datumen inräknade) och egna orter.
    // Ställs in i rutan och sparas i webbläsaren, t.ex. { key: 'g1', from: '2026-11-17', to: '2026-12-18' }.
    groups: [],
    cycleMinMs: 60 * 1000,       // kortaste paus mellan kontrollrundor
    cycleMaxMs: 90 * 1000,       // längsta paus mellan kontrollrundor
    gapMinMs: 3000,              // paus mellan varje enskild kontroll inom en runda
    gapMaxMs: 6000,
    // Pushnotis till mobilen via appen ntfy. Slås på i rutan, som skapar ett slumpat ämne.
    // Ämnesnamnet fungerar som lösenord, dela det inte. '' = avstängt.
    ntfyTopic: ''
  };

  // Klistras skriptet in igen i samma flik tar det över det som redan bevakas.
  var previous = window.__tvBevakning && window.__tvBevakning.state;
  if (window.__tvBevakning && window.__tvBevakning.stop) {
    window.__tvBevakning.stop();
  }

  var state = {
    searches: {},      // locationId -> { url, headers, body, name }
    members: {},       // gruppnyckel -> [locationId, ...]
    coverage: {},      // "grupp|ort" -> { n, first, last } från senaste svaret
    seen: {},          // nyckel -> true, för tider vi redan aviserat
    hits: [],          // aktuella tider inom intervallen
    target: null,      // gruppnyckel som nya sökningar läggs till i, eller null
    draftFrom: null,   // datum som skrivs in under "Ny bevakning"
    draftTo: null,
    pendingRender: false,
    lastCheck: null,
    lastResponse: null,
    running: true,
    timer: null,
    message: '',
    audio: null,
    authed: false,        // har minst en kontroll lyckats sedan start/senaste utloggning?
    waitingLogin: false   // utloggad: väntar på ny BankID-inloggning
  };

  var MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  function shortDate(iso) { return parseInt(iso.slice(8, 10), 10) + ' ' + MONTHS[parseInt(iso.slice(5, 7), 10) - 1]; }
  function groupLabel(g) { return shortDate(g.from) + ' – ' + shortDate(g.to); }
  function groupByKey(key) {
    for (var i = 0; i < CONFIG.groups.length; i++) if (CONFIG.groups[i].key === key) return CONFIG.groups[i];
    return null;
  }

  // ---------- sparade sökningar ----------
  // Sparas i webbläsaren (bara på Trafikverkets sida) så att de finns kvar efter omladdning.

  var STORE_KEY = 'tvBevakning.searches';
  var GROUP_KEY = 'tvBevakning.groups';

  function loadJSON(key) {
    try {
      var v = JSON.parse(window.localStorage.getItem(key) || 'null');
      return v && typeof v === 'object' ? v : null;
    } catch (e) { return null; }
  }
  function save() {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(state.searches));
      window.localStorage.setItem(GROUP_KEY, JSON.stringify(state.members));
    } catch (e) { /* ignorera */ }
  }

  var SETTINGS_KEY = 'tvBevakning.settings';
  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  function validGroup(g) {
    return !!g && typeof g.key === 'string' && DATE_RE.test(g.from) && DATE_RE.test(g.to) && g.from <= g.to;
  }
  function saveSettings() {
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ groups: CONFIG.groups, ntfyTopic: CONFIG.ntfyTopic }));
    } catch (e) { /* ignorera */ }
  }
  (function loadSettings() {
    var saved = loadJSON(SETTINGS_KEY);
    if (!saved) return;
    if (Array.isArray(saved.groups)) CONFIG.groups = saved.groups.filter(validGroup);
    if (typeof saved.ntfyTopic === 'string') CONFIG.ntfyTopic = saved.ntfyTopic;
  })();

  /** Tar bort sparade sökningar som inte längre hör till någon bevakning. */
  function pruneSearches() {
    Object.keys(state.searches).forEach(function (id) {
      if (!isMember(id)) delete state.searches[id];
    });
  }

  function countWatched() {
    var n = 0;
    CONFIG.groups.forEach(function (g) { n += state.members[g.key].length; });
    return n;
  }
  function idleMessage() {
    if (!CONFIG.groups.length) return 'Skapa en bevakning genom att välja datum under "Ny bevakning".';
    return countWatched() ? 'Bevakningen är igång.' : 'Klicka "Lägg till orter här" och sök sedan på en ort.';
  }

  (function restore() {
    var members = null;
    if (previous && previous.searches && Object.keys(previous.searches).length) {
      state.searches = previous.searches;
      members = previous.members || null;
      if (previous.members) state.seen = previous.seen || {};
    } else {
      state.searches = loadJSON(STORE_KEY) || {};
      members = loadJSON(GROUP_KEY);
    }
    var hadGroups = !!members;
    members = members || {};
    CONFIG.groups.forEach(function (g, i) {
      var ids = Array.isArray(members[g.key]) ? members[g.key] : [];
      // Sökningar från en äldre version utan grupper hamnar i den första bevakningen.
      if (!hadGroups && i === 0) ids = Object.keys(state.searches);
      state.members[g.key] = ids.map(String).filter(function (id) { return !!state.searches[id]; });
    });
    pruneSearches();
    state.message = idleMessage();
    save();
  })();

  var nativeFetch = window.fetch.bind(window);
  var TARGET = 'occasion-bundles';

  // ---------- tolkning av svar ----------

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function isoToday() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function dayBefore(iso) {
    var d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - 86400000);
    return d.toISOString().slice(0, 10);
  }

  /** Plockar ut alla provtillfällen ur ett svar, oavsett exakt hur det är nästlat. */
  function extractOccasions(node, out) {
    out = out || [];
    if (!node || typeof node !== 'object') return out;
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) extractOccasions(node[i], out);
      return out;
    }
    var date = null, time = null;
    if (typeof node.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(node.date)) {
      date = node.date.slice(0, 10);
      var t = /T(\d{2}:\d{2})/.exec(node.date);
      if (t && t[1] !== '00:00') time = t[1];
    }
    var start = node.duration && typeof node.duration.start === 'string' ? node.duration.start : null;
    if (start && /^\d{4}-\d{2}-\d{2}/.test(start)) {
      if (!date) date = start.slice(0, 10);
      var st = /T(\d{2}:\d{2})/.exec(start);
      if (st && !time) time = st[1];
    }
    if (typeof node.time === 'string' && /^\d{1,2}:\d{2}/.test(node.time)) {
      time = node.time.slice(0, 5);
    }
    if (date) {
      out.push({
        date: date,
        time: time || '',
        location: typeof node.locationName === 'string' ? node.locationName : '',
        name: typeof node.name === 'string' ? node.name : ''
      });
    }
    for (var k in node) {
      if (Object.prototype.hasOwnProperty.call(node, k)) extractOccasions(node[k], out);
    }
    return out;
  }

  function isUnauthorized(httpStatus, json) {
    if (httpStatus === 401 || httpStatus === 403) return true;
    return !!json && (json.status === 401 || json.status === 403);
  }

  // ---------- fånga användarens egna sökningar ----------

  function isMember(id) {
    return CONFIG.groups.some(function (g) { return state.members[g.key].indexOf(id) !== -1; });
  }

  function remember(url, headers, bodyText) {
    var body;
    try { body = JSON.parse(bodyText); } catch (e) { return null; }
    var q = body && body.occasionBundleQuery;
    if (!q || q.locationId === undefined || q.locationId === null) return null;
    var id = String(q.locationId);
    var added = false;
    if (state.target && state.members[state.target].indexOf(id) === -1) {
      state.members[state.target].push(id);
      added = true;
    }
    if (!isMember(id)) return null;   // sökning på en ort som inte bevakas: rör ingenting
    state.searches[id] = {
      url: url,
      headers: headers || {},
      body: body,
      name: (state.searches[id] && state.searches[id].name) || ('Ort ' + id)
    };
    save();
    if (added) {
      if (!state.waitingLogin) state.message = idleMessage();
      schedule(2000);
    }
    render();
    return id;
  }

  function addGroup(from, to) {
    var g = { key: 'g' + Date.now().toString(36), from: from, to: to };
    CONFIG.groups.push(g);
    state.members[g.key] = [];
    state.target = g.key;        // nästa sökning läggs till i den nya bevakningen
    saveSettings();
    save();
    if (!state.waitingLogin) state.message = idleMessage();
    render();
  }

  function removeGroup(gKey) {
    CONFIG.groups = CONFIG.groups.filter(function (g) { return g.key !== gKey; });
    delete state.members[gKey];
    state.hits = state.hits.filter(function (h) { return h.g !== gKey; });
    Object.keys(state.coverage).forEach(function (k) {
      if (k.indexOf(gKey + '|') === 0) delete state.coverage[k];
    });
    if (state.target === gKey) state.target = null;
    pruneSearches();
    saveSettings();
    save();
    if (!state.waitingLogin) state.message = idleMessage();
    render();
  }

  function randomTopic() {
    var bytes = new Uint8Array(8);
    window.crypto.getRandomValues(bytes);
    return 'provtid-' + Array.prototype.map.call(bytes, function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('');
  }

  function setTopic(topic) {
    CONFIG.ntfyTopic = topic;
    saveSettings();
    render();
  }

  function removeMember(gKey, id) {
    state.members[gKey] = state.members[gKey].filter(function (x) { return x !== id; });
    state.hits = state.hits.filter(function (h) { return !(h.g === gKey && h.id === id); });
    delete state.coverage[gKey + '|' + id];
    if (!isMember(id)) delete state.searches[id];
    save();
    if (!state.waitingLogin) state.message = idleMessage();
    render();
  }

  var XHR = window.XMLHttpRequest;
  var origOpen = XHR.prototype.open;
  var origSetHeader = XHR.prototype.setRequestHeader;
  var origSend = XHR.prototype.send;

  XHR.prototype.open = function (method, url) {
    this.__tvUrl = String(url);
    this.__tvHeaders = {};
    return origOpen.apply(this, arguments);
  };
  XHR.prototype.setRequestHeader = function (name, value) {
    if (this.__tvHeaders) this.__tvHeaders[name] = value;
    return origSetHeader.apply(this, arguments);
  };
  XHR.prototype.send = function (body) {
    try {
      if (this.__tvUrl && this.__tvUrl.indexOf(TARGET) !== -1 && typeof body === 'string') {
        var id = remember(this.__tvUrl, this.__tvHeaders, body);
        if (id) {
          var xhr = this;
          xhr.addEventListener('load', function () {
            try { handleResponse(null, id, xhr.status, JSON.parse(xhr.responseText)); } catch (e) { /* ignorera */ }
          });
        }
      }
    } catch (e) { /* får aldrig störa sidans egna anrop */ }
    return origSend.apply(this, arguments);
  };

  window.fetch = function (input, init) {
    try {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      if (url.indexOf(TARGET) !== -1 && init && typeof init.body === 'string') {
        var headers = {};
        if (init.headers) {
          if (typeof init.headers.forEach === 'function') {
            init.headers.forEach(function (v, k) { headers[k] = v; });
          } else {
            for (var k in init.headers) headers[k] = init.headers[k];
          }
        }
        remember(url, headers, init.body);
      }
    } catch (e) { /* ignorera */ }
    return nativeFetch(input, init);
  };

  // ---------- kontrollrundor ----------

  function rand(min, max) { return min + Math.floor(Math.random() * (max - min)); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function readCookie(name) {
    var m = new RegExp('(?:^|; )' + name + '=([^;]*)').exec(document.cookie || '');
    return m ? decodeURIComponent(m[1]) : null;
  }

  function freshBody(search, group) {
    var body = JSON.parse(JSON.stringify(search.body));
    var q = body.occasionBundleQuery;
    if (q && typeof q.startDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(q.startDate)) {
      var today = isoToday();
      var want = dayBefore(group.from);
      if (want > today) {
        // Intervallet ligger längre fram: be om tider från dagen före intervallets start.
        q.startDate = want + q.startDate.slice(10);
      } else if (q.startDate.slice(0, 10) < today) {
        // Håll startdatumet aktuellt om bevakningen står på över flera dagar.
        q.startDate = new Date().toISOString();
      }
    }
    return body;
  }

  function checkOne(group, id) {
    var search = state.searches[id];
    var headers = {};
    for (var k in search.headers) headers[k] = search.headers[k];
    if (!headers['Content-Type'] && !headers['content-type']) headers['Content-Type'] = 'application/json';
    var xsrf = readCookie('XSRF-TOKEN');
    if (xsrf) headers['X-XSRF-TOKEN'] = xsrf;
    return nativeFetch(search.url, {
      method: 'POST',
      credentials: 'include',
      headers: headers,
      body: JSON.stringify(freshBody(search, group))
    }).then(function (res) {
      return res.text().then(function (text) {
        var json = null;
        try { json = JSON.parse(text); } catch (e) { /* inte JSON */ }
        return handleResponse(group.key, id, res.status, json);
      });
    });
  }

  /**
   * Tar hand om ett svar för en ort. gKey är bevakningen svaret gäller, eller null för
   * användarens egna sökningar (då uppdateras bara ortsnamn och inloggningsstatus).
   * Returnerar false om sessionen har gått ut.
   */
  function handleResponse(gKey, id, httpStatus, json) {
    state.lastResponse = json;
    state.lastCheck = new Date();
    if (isUnauthorized(httpStatus, json)) {
      sessionExpired();
      return false;
    }
    var search = state.searches[id];
    if (!search) return true;
    if (state.waitingLogin) {
      state.waitingLogin = false;
      state.message = 'Inloggad igen. ' + idleMessage();
      push('Bevakningen ar igang igen', 'Inloggningen fungerar och tiderna kontrolleras på nytt.');
    }
    state.authed = true;
    var all = extractOccasions(json);
    for (var i = 0; i < all.length; i++) {
      if (all[i].location) {
        if (search.name !== all[i].location) { search.name = all[i].location; save(); }
        break;
      }
    }
    var group = gKey && groupByKey(gKey);
    if (!group) { render(); return true; }

    var dates = all.map(function (o) { return o.date; }).sort();
    state.coverage[gKey + '|' + id] = { n: all.length, first: dates[0] || '', last: dates[dates.length - 1] || '' };

    var keep = state.hits.filter(function (h) { return !(h.g === gKey && h.id === id); });
    var fresh = [];
    var seenNow = {};
    all.forEach(function (o) {
      if (o.date < group.from || o.date > group.to) return;
      var key = gKey + '|' + id + '|' + o.date + '|' + o.time;
      if (seenNow[key]) return;
      seenNow[key] = true;
      var hit = { g: gKey, id: id, key: key, date: o.date, time: o.time, location: o.location || search.name };
      keep.push(hit);
      if (!state.seen[key]) { state.seen[key] = true; fresh.push(hit); }
    });
    keep.sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); });
    state.hits = keep;
    if (fresh.length) announce(fresh);
    render();
    return true;
  }

  function cycle() {
    if (!state.running) return;
    var tasks = [];
    CONFIG.groups.forEach(function (g) {
      state.members[g.key].forEach(function (id) {
        if (state.searches[id]) tasks.push({ group: g, id: id });
      });
    });
    var chain = Promise.resolve(true);
    tasks.forEach(function (task, i) {
      chain = chain.then(function (ok) {
        if (!ok || !state.running) return false;
        return (i ? sleep(rand(CONFIG.gapMinMs, CONFIG.gapMaxMs)) : Promise.resolve())
          .then(function () {
            // Orten kan ha tagits bort medan rundan pågick.
            if (!state.searches[task.id] || state.members[task.group.key].indexOf(task.id) === -1) return true;
            return checkOne(task.group, task.id);
          });
      });
    });
    chain.then(function () {
      if (state.running && !state.waitingLogin) state.message = idleMessage();
    }).catch(function (err) {
      state.message = 'Tillfälligt fel: ' + (err && err.message ? err.message : err) + ' – försöker igen.';
    }).then(function () {
      render();
      if (state.running) schedule(rand(CONFIG.cycleMinMs, CONFIG.cycleMaxMs));
    });
  }

  function schedule(ms) {
    if (!state.running) return;
    clearTimeout(state.timer);
    state.timer = setTimeout(cycle, ms);
  }

  // ---------- avisering ----------

  function beep(times) {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!state.audio) state.audio = new Ctx();
      var ctx = state.audio;
      if (ctx.state === 'suspended') ctx.resume();
      for (var i = 0; i < times; i++) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.frequency.value = 880;
        osc.connect(gain);
        gain.connect(ctx.destination);
        var t0 = ctx.currentTime + i * 0.45;
        gain.gain.setValueAtTime(0.3, t0);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35);
        osc.start(t0);
        osc.stop(t0 + 0.36);
      }
    } catch (e) { /* ljud är bara en bonus */ }
  }

  function notify(title, text) {
    try {
      if (window.Notification && Notification.permission === 'granted') {
        new Notification(title, { body: text, requireInteraction: true });
      }
    } catch (e) { /* ignorera */ }
  }

  /** Skickar en pushnotis till mobilen. Innehåller bara ort, datum och tid. */
  function push(title, text) {
    if (!CONFIG.ntfyTopic) return;
    try {
      nativeFetch('https://ntfy.sh/' + encodeURIComponent(CONFIG.ntfyTopic), {
        method: 'POST',
        credentials: 'omit',
        headers: {
          'Title': title,                 // endast ASCII i rubriken
          'Priority': 'urgent',
          'Tags': 'rotating_light',
          'Click': 'https://fp.trafikverket.se/Boka/ng/'
        },
        body: text
      }).catch(function (e) { console.warn('[bevakning] Kunde inte skicka push:', e); });
    } catch (e) { console.warn('[bevakning] Kunde inte skicka push:', e); }
  }

  var baseTitle = document.title;
  var flashTimer = null;
  function flashTitle(text) {
    clearInterval(flashTimer);
    var on = false;
    flashTimer = setInterval(function () {
      on = !on;
      document.title = on ? text : baseTitle;
    }, 1000);
  }

  function announce(fresh) {
    var lines = fresh.slice(0, 5).map(function (h) {
      return h.location + ' ' + h.date + (h.time ? ' kl. ' + h.time : '');
    });
    if (fresh.length > 5) lines.push('… och ' + (fresh.length - 5) + ' till');
    notify('Ledig provtid hos Trafikverket', lines.join('\n'));
    push('Ledig provtid hos Trafikverket', lines.join('\n'));
    beep(4);
    flashTitle('LEDIG TID! ' + lines[0]);
    console.log('[bevakning] Nya tider:', fresh);
  }

  function sessionExpired() {
    // Bevakningen fortsätter försöka en gång per runda och kommer igång av sig själv efter ny inloggning.
    var wasWorking = state.authed && !state.waitingLogin;
    state.waitingLogin = true;
    state.authed = false;
    state.hits = [];
    state.message = 'Utloggad. Logga in med BankID, så fortsätter bevakningen av sig själv.';
    if (wasWorking) {
      notify('Bevakningen pausad', 'Du har loggats ut hos Trafikverket.');
      push('Bevakningen pausad', 'Du har loggats ut hos Trafikverket. Logga in med BankID så fortsätter bevakningen.');
      beep(2);
    }
    render();
  }

  // ---------- liten statusruta ----------

  var panel = document.createElement('div');
  panel.id = 'tv-bevakning';
  panel.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;width:320px;' +
    'max-height:70vh;overflow:auto;background:#fff;color:#222;border:2px solid #d70000;' +
    'border-radius:8px;padding:12px;font:13px/1.4 Arial,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.25)';
  // Fästs på <html> i stället för <body>: sidans body gör att position:fixed annars hamnar längst ner på sidan.
  document.documentElement.appendChild(panel);
  // Lyft rutan till webbläsarens "top layer" så att den alltid sitter fast i fönstrets hörn.
  try {
    panel.popover = 'manual';
    panel.style.inset = 'auto 16px 16px auto';
    panel.style.margin = '0';
    panel.showPopover();
  } catch (e) { /* äldre webbläsare: rutan ligger kvar som vanligt */ }

  function el(tag, text, css) {
    var e = document.createElement(tag);
    if (text) e.textContent = text;
    if (css) e.style.cssText = css;
    return e;
  }

  function button(label, onClick, css) {
    var b = el('button', label, 'margin:6px 6px 0 0;padding:5px 8px;font:inherit;cursor:pointer;' + (css || ''));
    b.addEventListener('click', onClick);
    return b;
  }

  function renderGroup(g) {
    var isTarget = state.target === g.key;
    var box = el('div', null, 'margin-top:10px;padding:8px;border-radius:6px;border:1px solid ' +
      (isTarget ? '#0a58ca;background:#eef4ff' : '#ccc'));
    box.appendChild(el('div', groupLabel(g), 'font-weight:bold'));
    var ids = state.members[g.key];
    if (!ids.length) box.appendChild(el('div', 'Inga orter än.', 'color:#666'));
    ids.forEach(function (id) {
      var row = el('div', null, 'display:flex;justify-content:space-between;align-items:baseline;gap:6px');
      var cov = state.coverage[g.key + '|' + id];
      var left = el('span', state.searches[id] ? state.searches[id].name : 'Ort ' + id);
      if (cov) {
        left.appendChild(el('span', cov.n ? ' · svar ' + cov.first + ' – ' + cov.last : ' · inga tider i svaret',
          'color:#888;font-size:11px'));
      }
      row.appendChild(left);
      var x = el('button', '×', 'border:0;background:none;cursor:pointer;color:#a00;font-size:15px;padding:0 4px');
      x.title = 'Ta bort orten från den här bevakningen';
      x.addEventListener('click', function () { removeMember(g.key, id); });
      row.appendChild(x);
      box.appendChild(row);
    });
    var hits = state.hits.filter(function (h) { return h.g === g.key; });
    if (hits.length) {
      box.appendChild(el('div', 'Lediga tider:', 'font-weight:bold;margin-top:6px;color:#0a7a2f'));
      hits.forEach(function (h) {
        box.appendChild(el('div', h.location + ' · ' + h.date + (h.time ? ' kl. ' + h.time : ''), 'color:#0a7a2f'));
      });
    } else if (ids.length && state.lastCheck && !state.waitingLogin) {
      box.appendChild(el('div', 'Inga tider i intervallet just nu.', 'color:#666;margin-top:4px'));
    }
    if (isTarget) {
      box.appendChild(el('div', 'Sök nu på en ort på sidan, så läggs den till här.', 'margin-top:6px;color:#0a58ca'));
      box.appendChild(button('Klar', function () { state.target = null; render(); }));
    } else {
      box.appendChild(button('Lägg till orter här', function () { state.target = g.key; render(); }));
    }
    box.appendChild(button('Ta bort bevakning', function () {
      if (window.confirm('Ta bort bevakningen ' + groupLabel(g) + '?')) removeGroup(g.key);
    }, 'color:#a00'));
    return box;
  }

  function addDays(iso, n) {
    var d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) + n * 86400000);
    return d.toISOString().slice(0, 10);
  }

  function dateInput(value, onChange) {
    var input = el('input', null, 'font:inherit;padding:2px;width:130px');
    input.type = 'date';
    input.value = value;
    input.addEventListener('input', function () { onChange(input.value); });
    input.addEventListener('blur', function () {
      if (state.pendingRender) setTimeout(render, 0);
    });
    return input;
  }

  function renderNewGroup() {
    if (!state.draftFrom) state.draftFrom = isoToday();
    if (!state.draftTo) state.draftTo = addDays(isoToday(), 30);
    var box = el('div', null, 'margin-top:10px;padding:8px;border-radius:6px;border:1px dashed #999');
    box.appendChild(el('div', 'Ny bevakning', 'font-weight:bold'));
    var row = el('div', null, 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:4px');
    row.appendChild(dateInput(state.draftFrom, function (v) { state.draftFrom = v; }));
    row.appendChild(el('span', '–'));
    row.appendChild(dateInput(state.draftTo, function (v) { state.draftTo = v; }));
    box.appendChild(row);
    box.appendChild(button('Skapa bevakning', function () {
      var from = state.draftFrom, to = state.draftTo;
      if (!DATE_RE.test(from || '') || !DATE_RE.test(to || '') || from > to) {
        window.alert('Välj ett giltigt datumintervall där första datum inte ligger efter sista.');
        return;
      }
      state.draftFrom = state.draftTo = null;
      addGroup(from, to);
    }));
    return box;
  }

  function renderPhone() {
    var box = el('div', null, 'margin-top:10px;padding:8px;border-radius:6px;border:1px solid #ccc');
    box.appendChild(el('div', 'Notiser i mobilen', 'font-weight:bold'));
    if (CONFIG.ntfyTopic) {
      box.appendChild(el('div', 'Installera appen ntfy och prenumerera på ämnet:'));
      box.appendChild(el('div', CONFIG.ntfyTopic, 'font-family:monospace;user-select:all;background:#f3f3f3;padding:3px 5px;margin:3px 0'));
      box.appendChild(el('div', 'Dela inte ämnet, det fungerar som ett lösenord. Klicka "Testa larm" för att prova.', 'color:#666;font-size:11px'));
      box.appendChild(button('Stäng av', function () { setTopic(''); }));
    } else {
      box.appendChild(el('div', 'Få larm i mobilen via gratisappen ntfy. Bara ort, datum och tid skickas, via ntfy.sh.', 'color:#666'));
      box.appendChild(button('Slå på mobilnotiser', function () { setTopic(randomTopic()); }));
    }
    return box;
  }

  function render() {
    if (!panel.parentNode) return;
    // Rita inte om medan ett datumfält används, då tappas det som skrivs in.
    var active = document.activeElement;
    if (active && active.tagName === 'INPUT' && panel.contains && panel.contains(active)) {
      state.pendingRender = true;
      return;
    }
    state.pendingRender = false;
    panel.textContent = '';
    panel.appendChild(el('div', 'Bevakning av provtider', 'font-weight:bold;margin-bottom:4px'));
    panel.appendChild(el('div', state.message));
    if (state.lastCheck) {
      panel.appendChild(el('div', 'Senast kontrollerat ' + state.lastCheck.toLocaleTimeString('sv-SE'), 'color:#666'));
    }
    CONFIG.groups.forEach(function (g) { panel.appendChild(renderGroup(g)); });
    panel.appendChild(renderNewGroup());
    panel.appendChild(renderPhone());
    var needsPermission = window.Notification && Notification.permission !== 'granted';
    if (needsPermission || !state.audio) {
      panel.appendChild(button('Aktivera notiser och ljud', function () {
        beep(1);
        if (window.Notification && Notification.permission !== 'granted') {
          Notification.requestPermission().then(render);
        }
        render();
      }));
    }
    if (state.running) {
      panel.appendChild(button('Testa larm', testAlarm));
      panel.appendChild(button('Stoppa', stop));
    }
  }

  /** Utlöser ljud, notis och push med en påhittad tid, utan att röra bevakningen. */
  function testAlarm() {
    announce([{ location: 'TEST (ingen riktig tid)', date: isoToday(), time: '00:00' }]);
  }

  function stop() {
    state.running = false;
    clearTimeout(state.timer);
    clearInterval(flashTimer);
    document.title = baseTitle;
    XHR.prototype.open = origOpen;
    XHR.prototype.setRequestHeader = origSetHeader;
    XHR.prototype.send = origSend;
    window.fetch = nativeFetch;
    if (panel.parentNode) panel.parentNode.removeChild(panel);
    console.log('[bevakning] Stoppad.');
  }

  window.addEventListener('focus', function () {
    clearInterval(flashTimer);
    document.title = baseTitle;
  });

  window.__tvBevakning = {
    state: state,
    config: CONFIG,
    stop: stop,
    checkNow: cycle,
    testAlarm: testAlarm,
    _test: { extractOccasions: extractOccasions, isUnauthorized: isUnauthorized, handleResponse: handleResponse, remember: remember, freshBody: freshBody, removeMember: removeMember, addGroup: addGroup, removeGroup: removeGroup, setTopic: setTopic, randomTopic: randomTopic }
  };

  render();
  if (countWatched()) {
    schedule(2000);
    console.log('[bevakning] Startad, fortsätter bevaka sparade orter.');
  } else {
    console.log('[bevakning] Startad. ' + idleMessage());
  }
})();
