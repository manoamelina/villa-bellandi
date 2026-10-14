/* Villa Bellandi — de live verbinding tussen de telefoons, de Regia en de tv.
   Elke pagina van de app laadt dit vóór support.js. Componenten lezen window.Villa;
   in het ontwerpcanvas bestaat window.Villa niet en werken ze zoals in het prototype. */
(function () {
  'use strict';

  var SLEUTEL = { speler: 'villa-code', regia: 'villa-regia', scherm: 'villa-scherm' };
  var luisteraars = [];
  var ws = null, poging = 0, pingTimer = null, herTimer = null, hallo = null, wachtend = null, laatsteTeken = 0;

  function lees(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function schrijf(k, v) {
    try { if (v == null) window.localStorage.removeItem(k); else window.localStorage.setItem(k, v); } catch (e) {}
  }

  var V = window.Villa = {
    verbonden: false,   // is de lijn naar de server open?
    rol: '',            // 'speler' | 'regia' | 'scherm' zodra aangemeld
    speler: null,       // { id, naam, voor } voor een speler
    staat: null,        // laatste staat van de server
    fout: '',           // laatste foutreden
    koppelcode: '',     // voor een tv die nog gekoppeld moet worden
    aan: function (f) {
      luisteraars.push(f);
      return function () { luisteraars = luisteraars.filter(function (g) { return g !== f; }); };
    },
    stuur: function (m) { return stuurNu(m); },
    bewaard: function (rol) { return lees(SLEUTEL[rol]) || ''; },
    vergeet: function (rol) { schrijf(SLEUTEL[rol], null); },
    meldAan: meldAan,
    haal: haal,
  };

  function meld() {
    luisteraars.slice().forEach(function (f) { try { f(V); } catch (e) { console.error(e); } });
  }

  function verbind() {
    clearTimeout(herTimer);
    if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
    var adres = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/live';
    try { ws = new WebSocket(adres); } catch (e) { return later(); }
    ws.onopen = function () {
      poging = 0;
      laatsteTeken = Date.now();
      V.verbonden = true;
      if (hallo) stuurNu(hallo());
      clearInterval(pingTimer);
      // Elke 15 s een ping. Komt er 40 s lang niets terug, dan is de lijn dood (bijv. telefoon van wifi naar 4G).
      pingTimer = setInterval(function () {
        if (!ws || ws.readyState !== 1) return;
        if (Date.now() - laatsteTeken > 40000) { breek(); return; }
        ws.send('ping');
      }, 15000);
      meld();
    };
    ws.onmessage = function (e) {
      laatsteTeken = Date.now();
      if (e.data === 'pong') return;
      var m;
      try { m = JSON.parse(e.data); } catch (x) { return; }
      ontvang(m);
    };
    ws.onclose = function () {
      V.verbonden = false;
      clearInterval(pingTimer);
      ws = null;
      meld();
      later();
    };
    ws.onerror = function () { try { ws && ws.close(); } catch (e) {} };
  }

  // Een hangende verbinding meteen loslaten en opnieuw beginnen.
  function breek() {
    if (ws) {
      var oud = ws;
      ws = null;
      oud.onopen = oud.onmessage = oud.onclose = oud.onerror = null;
      try { oud.close(); } catch (e) {}
    }
    clearInterval(pingTimer);
    if (V.verbonden) { V.verbonden = false; meld(); }
    if (hallo) later();
  }

  function later() {
    clearTimeout(herTimer);
    var wacht = Math.min(8000, 400 * Math.pow(2, poging++)) + Math.random() * 300;
    herTimer = setTimeout(verbind, wacht);
  }

  // Telefoon weer actief of netwerk terug: meteen opnieuw verbinden.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && hallo && !V.verbonden) { poging = 0; verbind(); }
  });
  window.addEventListener('online', function () { if (hallo) { poging = 0; verbind(); } });
  window.addEventListener('offline', function () { breek(); });

  function stuurNu(m) {
    if (ws && ws.readyState === 1) { ws.send(JSON.stringify(m)); return true; }
    return false;
  }

  function ontvang(m) {
    if (m.t === 'welkom') {
      V.rol = m.rol; V.fout = ''; V.koppelcode = '';
      if (m.speler) V.speler = m.speler;
      if (m.rol === 'speler' && V._code) schrijf(SLEUTEL.speler, V._code);
      if (m.token) schrijf(SLEUTEL[m.rol], m.token);
      if (wachtend) { wachtend.ok(V); wachtend = null; }
    } else if (m.t === 'staat') {
      V.staat = m.staat;
    } else if (m.t === 'koppel') {
      V.koppelcode = m.code;
      if (wachtend && wachtend.rol === 'scherm') { wachtend.ok(V); wachtend = null; }
    } else if (m.t === 'gekoppeld') {
      V.gekoppeld = Date.now();
    } else if (m.t === 'fout') {
      V.fout = m.reden;
      if (m.reden === 'code') { schrijf(SLEUTEL.speler, null); if (V.rol !== 'speler') hallo = null; }
      if (m.reden === 'token') { schrijf(SLEUTEL.regia, null); hallo = null; }
      if (wachtend && m.reden !== 'koppelcode') { wachtend.nee(m.reden); wachtend = null; }
    }
    meld();
  }

  // Aanmelden als speler (code), Regia (pincode of bewaard token) of tv (bewaard token of koppelen).
  // Geeft een belofte: slaagt bij 'welkom' (of bij een koppelcode voor de tv), faalt bij 'fout' of na 9 s zonder verbinding.
  function meldAan(rol, waarde) {
    var eerste;
    if (rol === 'speler') {
      V._code = String(waarde || lees(SLEUTEL.speler) || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      eerste = { t: 'hallo', rol: 'speler', code: V._code };
    } else if (rol === 'regia') {
      eerste = waarde ? { t: 'hallo', rol: 'regia', pin: String(waarde) } : { t: 'hallo', rol: 'regia', token: lees(SLEUTEL.regia) || '' };
    } else {
      eerste = { t: 'hallo', rol: 'scherm', token: lees(SLEUTEL.scherm) || '' };
    }
    hallo = function () {
      if (rol === 'speler') return { t: 'hallo', rol: 'speler', code: lees(SLEUTEL.speler) || V._code };
      if (rol === 'regia') return lees(SLEUTEL.regia) ? { t: 'hallo', rol: 'regia', token: lees(SLEUTEL.regia) } : eerste;
      return { t: 'hallo', rol: 'scherm', token: lees(SLEUTEL.scherm) || '' };
    };
    return new Promise(function (ok, nee) {
      if (wachtend) wachtend.nee('vervangen');
      var klok = setTimeout(function () {
        if (wachtend && wachtend.klok === klok) { wachtend = null; nee('verbinding'); }
      }, 9000);
      wachtend = {
        rol: rol, klok: klok,
        ok: function (v) { clearTimeout(klok); ok(v); },
        nee: function (r) { clearTimeout(klok); nee(r); },
      };
      if (!stuurNu(eerste)) verbind();
    });
  }

  // Haalt een bestand in zijn geheel op en geeft een blob-adres terug (video's spelen dan zonder haperen).
  var blobs = {};
  function haal(url, type) {
    if (!blobs[url]) {
      blobs[url] = fetch(url).then(function (r) {
        if (!r.ok) throw new Error('niet gevonden: ' + url);
        return r.blob();
      }).then(function (b) {
        var juist = type || (/\.mp4$/i.test(url) ? 'video/mp4' : b.type);
        return URL.createObjectURL(juist && b.type !== juist ? new Blob([b], { type: juist }) : b);
      });
      blobs[url].catch(function () { delete blobs[url]; });
    }
    return blobs[url];
  }

  // ── Het ontwerp (390 × 844 of 1920 × 1080) passend maken op elk scherm ──
  var vorige = '';
  function pas() {
    var root = document.getElementById('dc-root');
    var bord = root && root.firstElementChild;
    if (!bord) return;
    var w = bord.offsetWidth, h = bord.offsetHeight;
    if (!w || !h) return;
    var s = Math.min(window.innerWidth / w, window.innerHeight / h);
    var sleutel = w + 'x' + h + '@' + s.toFixed(4);
    if (sleutel === vorige) return;
    vorige = sleutel;
    root.style.position = 'fixed';
    root.style.left = '50%';
    root.style.top = '50%';
    root.style.width = w + 'px';
    root.style.height = h + 'px';
    root.style.transformOrigin = '50% 50%';
    root.style.transform = 'translate(-50%, -50%) scale(' + s + ')';
  }
  window.addEventListener('resize', function () { vorige = ''; pas(); });
  setInterval(pas, 400);

  // Spelerspagina's (behalve de entree) openen alleen met een bewaarde code.
  var meta = document.querySelector('meta[name="villa-rol"]');
  var paginaRol = meta ? meta.getAttribute('content') : '';
  if (paginaRol === 'speler') {
    if (!lees(SLEUTEL.speler)) location.replace('Entree.dc.html');
    else meldAan('speler').catch(function (r) { if (r === 'code') location.replace('Entree.dc.html'); });
  }
})();
