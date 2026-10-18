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

  // ── Het ontwerp passend maken op elk scherm ──
  // Een telefoonpagina (ontworpen op 390 × 844) vult de hele breedte; haar hoogte past zich aan het scherm aan
  // (tussen 600 en 900), zodat er geen zwarte randen overblijven. Is het scherm lager dan dat, dan staat de pagina
  // met 600 hoogte in het midden. Op een liggend scherm, tablet of computer staat het hele ontwerp in het midden.
  // De tv (1920 × 1080) past altijd als geheel.
  var vorige = '', vorigeBreedte = 0;
  function typt() {
    var a = document.activeElement;
    return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
  }
  function pas() {
    var root = document.getElementById('dc-root');
    var laag = root && root.firstElementChild;     // de laag die de runtime om het ontwerp legt
    var bord = laag && laag.firstElementChild;     // het ontwerp zelf
    if (!bord) return;
    volgDom();
    var vw = window.innerWidth, vh = window.innerHeight, w = bord.offsetWidth;
    if (!w || !vw || !vh) return;
    // Gaat het toetsenbord open, dan blijft de pagina staan zoals ze stond (anders springt ze tijdens het typen).
    if (vorige && typt() && vw === vorigeBreedte) return;
    var tel = w === 390, s, h, x = 0, y = 0;
    if (tel && vw / vh <= 0.72) {
      s = vw / 390; h = vh / s;
      if (h < 600) { h = 600; s = vh / 600; x = (vw - 390 * s) / 2; }
      else if (h > 900) { h = 900; y = (vh - 900 * s) / 2; }
      h = Math.ceil(h);
    } else {
      h = tel ? 844 : bord.offsetHeight;
      if (!h) return;
      s = Math.min(vw / w, vh / h); x = (vw - w * s) / 2; y = (vh - h * s) / 2;
    }
    if (tel) {
      hoogte(bord, h);
      // Hoe groot de foto van een kamer nu is ten opzichte van het ontwerp: bordjes op de foto schalen daarmee mee.
      var foto = (Math.max(h, 691) / 844).toFixed(4);
      if (root.style.getPropertyValue('--villa-foto') !== foto) root.style.setProperty('--villa-foto', foto);
    }
    var sleutel = [w, h, s.toFixed(4), x.toFixed(1), y.toFixed(1)].join('|');
    if (sleutel === vorige) return;
    vorige = sleutel; vorigeBreedte = vw;
    root.style.position = 'fixed';
    root.style.left = '0';
    root.style.top = '0';
    root.style.width = '100%';
    root.style.height = '100%';
    root.style.overflow = 'hidden';
    root.style.transform = '';
    laag.style.width = w + 'px';
    laag.style.height = h + 'px';
    laag.style.transformOrigin = '0 0';
    laag.style.transform = 'translate(' + x.toFixed(2) + 'px, ' + y.toFixed(2) + 'px) scale(' + s.toFixed(5) + ')';
  }
  // Het ontwerp, en elk telefoonontwerp dat erin staat (zoals de foyer achter de voordeur), krijgt de hoogte van het scherm.
  function hoogte(bord, h) {
    var lijst = [bord].concat([].slice.call(bord.querySelectorAll('[style*="844px"], [data-villa-hoogte]')));
    for (var i = 0; i < lijst.length; i++) {
      var el = lijst[i], st = el.style;
      if (!el.hasAttribute('data-villa-hoogte')) {
        if (st.height !== '844px' || st.width !== '390px') continue;
        el.setAttribute('data-villa-hoogte', '');
      }
      if (st.height !== h + 'px') st.height = h + 'px';
    }
  }
  var waarnemer = null;
  function volgDom() {
    var root = document.getElementById('dc-root');
    if (waarnemer || !root || !window.MutationObserver) return;
    waarnemer = new MutationObserver(function () { pas(); });
    waarnemer.observe(root, { childList: true, subtree: true });
  }
  function opnieuwPassen() { vorige = ''; pas(); }
  window.addEventListener('resize', opnieuwPassen);
  window.addEventListener('orientationchange', opnieuwPassen);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', function () { pas(); });
  // Toetsenbord weer dicht: opnieuw passen (even wachten tot het scherm weer zijn volle hoogte heeft).
  document.addEventListener('focusout', function () { setTimeout(opnieuwPassen, 350); });
  try { document.documentElement.style.webkitTextSizeAdjust = '100%'; } catch (e) {}
  setInterval(pas, 400);

  // Spelerspagina's (behalve de entree) openen alleen met een bewaarde code.
  var meta = document.querySelector('meta[name="villa-rol"]');
  var paginaRol = meta ? meta.getAttribute('content') : '';
  if (paginaRol === 'speler') {
    if (!lees(SLEUTEL.speler)) location.replace('Entree.dc.html');
    else meldAan('speler').catch(function (r) { if (r === 'code') location.replace('Entree.dc.html'); });
  }
})();
