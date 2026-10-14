// Villa: één Durable Object dat de hele avond bijhoudt en live doorgeeft aan alle schermen.
// Rollen: 'speler' (telefoon met envelopcode), 'regia' (Donna Serafina, pincode) en 'scherm' (de tv, gekoppeld vanuit de Regia).
import { DurableObject } from 'cloudflare:workers';
import { REGIA_PIN, VIDEOS, DEUREN, spelerBijCode } from './spel.js';

const BEGIN = () => ({
  deuren: { archivio: false, sala: false },
  scherm: { scene: 'wacht', video: '', nonce: 1 },
});

const OPEN = 1; // WebSocket.readyState
const nieuwToken = () => crypto.randomUUID().replace(/-/g, '');

export class Villa extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.staat = BEGIN();
    this.tokens = { regia: [], scherm: [] };
    ctx.blockConcurrencyWhile(async () => {
      const s = await ctx.storage.get('staat');
      const t = await ctx.storage.get('tokens');
      if (s) {
        const b = BEGIN();
        this.staat = { ...b, ...s, deuren: { ...b.deuren, ...(s.deuren || {}) }, scherm: { ...b.scherm, ...(s.scherm || {}) } };
      }
      if (t) this.tokens = { regia: t.regia || [], scherm: t.scherm || [] };
    });
    // Telefoons sturen elke 25 seconden 'ping'; dat beantwoorden we zonder het object wakker te maken.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Verwacht een websocket', { status: 426 });
    const paar = new WebSocketPair();
    const client = paar[0], server = paar[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ rol: '', ok: false });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, data) {
    if (typeof data !== 'string' || data.length > 4000) return;
    let m;
    try { m = JSON.parse(data); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    const a = ws.deserializeAttachment() || { rol: '', ok: false };
    if (m.t === 'hallo') return this.hallo(ws, m);
    if (!a.ok) return;
    if (a.rol === 'regia') return this.vanRegia(ws, m);
    if (a.rol === 'scherm') return this.vanScherm(ws, a, m);
  }

  async webSocketClose(ws) {
    try { ws.close(1000, 'tot ziens'); } catch (e) {}
    this.meldStatus(ws);
  }

  async webSocketError(ws) {
    this.meldStatus(ws);
  }

  // ── aanmelden ──────────────────────────────────────────────
  async hallo(ws, m) {
    if (m.rol === 'speler') {
      const s = spelerBijCode(m.code);
      if (!s) {
        ws.serializeAttachment({ rol: '', ok: false });
        return this.stuur(ws, { t: 'fout', reden: 'code' });
      }
      ws.serializeAttachment({ rol: 'speler', ok: true, speler: s.id });
      this.stuur(ws, { t: 'welkom', rol: 'speler', speler: s });
      this.stuur(ws, { t: 'staat', staat: this.staatVoor('speler') });
      return this.meldStatus();
    }

    if (m.rol === 'regia') {
      let tk = typeof m.token === 'string' && this.tokens.regia.includes(m.token) ? m.token : null;
      if (!tk && typeof m.pin === 'string' && m.pin.replace(/\D/g, '') === REGIA_PIN) {
        tk = nieuwToken();
        this.tokens.regia = [...this.tokens.regia.slice(-9), tk];
        await this.ctx.storage.put('tokens', this.tokens);
      }
      if (!tk) return this.stuur(ws, { t: 'fout', reden: m.pin ? 'pin' : 'token' });
      ws.serializeAttachment({ rol: 'regia', ok: true });
      this.stuur(ws, { t: 'welkom', rol: 'regia', token: tk });
      return this.stuur(ws, { t: 'staat', staat: this.staatVoor('regia') });
    }

    if (m.rol === 'scherm') {
      if (typeof m.token === 'string' && this.tokens.scherm.includes(m.token)) {
        ws.serializeAttachment({ rol: 'scherm', ok: true, geluid: false, speelt: '', geladen: 0 });
        this.stuur(ws, { t: 'welkom', rol: 'scherm', token: m.token });
        this.stuur(ws, { t: 'staat', staat: this.staatVoor('scherm') });
        return this.meldStatus();
      }
      // Nog niet gekoppeld: geef de tv een koppelcode die Donna Serafina in de Regia intikt.
      const bezet = new Set(this.open().map((s) => (s.deserializeAttachment() || {}).koppel).filter(Boolean));
      let code;
      do { code = String(1000 + Math.floor(Math.random() * 9000)); } while (bezet.has(code));
      ws.serializeAttachment({ rol: 'scherm', ok: false, koppel: code });
      this.stuur(ws, { t: 'koppel', code });
      return this.meldStatus();
    }
  }

  // ── opdrachten van Donna Serafina ──────────────────────────
  async vanRegia(ws, m) {
    if (m.t === 'deur' && DEUREN.includes(m.deur)) {
      this.staat.deuren[m.deur] = !!m.open;
      await this.bewaar();
      return this.zendStaat();
    }

    if (m.t === 'koppel') {
      const code = String(m.code || '').replace(/\D/g, '');
      const tv = this.open().find((s) => {
        const x = s.deserializeAttachment() || {};
        return x.rol === 'scherm' && !x.ok && x.koppel === code;
      });
      if (!code || !tv) return this.stuur(ws, { t: 'fout', reden: 'koppelcode' });
      const tk = nieuwToken();
      this.tokens.scherm = [...this.tokens.scherm.slice(-4), tk];
      await this.ctx.storage.put('tokens', this.tokens);
      tv.serializeAttachment({ rol: 'scherm', ok: true, geluid: false, speelt: '', geladen: 0 });
      this.stuur(tv, { t: 'welkom', rol: 'scherm', token: tk });
      this.stuur(tv, { t: 'staat', staat: this.staatVoor('scherm') });
      this.stuur(ws, { t: 'gekoppeld' });
      return this.meldStatus();
    }

    if (m.t === 'scherm') {
      const nonce = (this.staat.scherm.nonce || 0) + 1;
      if (m.scene === 'video' && Object.prototype.hasOwnProperty.call(VIDEOS, m.video)) {
        this.staat.scherm = { scene: 'video', video: m.video, nonce };
      } else if (m.scene === 'wacht') {
        this.staat.scherm = { scene: 'wacht', video: '', nonce };
      } else return;
      await this.bewaar();
      return this.zendStaat();
    }

    if (m.t === 'opnieuw') {
      const nonce = (this.staat.scherm.nonce || 0) + 1;
      this.staat = BEGIN();
      this.staat.scherm.nonce = nonce;
      await this.bewaar();
      return this.zendStaat();
    }
  }

  // ── meldingen van de tv ────────────────────────────────────
  async vanScherm(ws, a, m) {
    if (m.t !== 'tv') return;
    ws.serializeAttachment({
      ...a,
      geluid: !!m.geluid,
      speelt: typeof m.speelt === 'string' ? m.speelt.slice(0, 40) : '',
      geladen: Math.max(0, Math.min(99, Number(m.geladen) || 0)),
      fout: m.fout ? true : (m.speelt ? false : !!a.fout),
    });
    // Video afgelopen: terug naar het wachtscherm, zodat de Regia dat ook ziet.
    if (m.einde && this.staat.scherm.scene === 'video' && m.einde === this.staat.scherm.nonce) {
      this.staat.scherm = { scene: 'wacht', video: '', nonce: this.staat.scherm.nonce + 1 };
      await this.bewaar();
      return this.zendStaat();
    }
    return this.meldStatus();
  }

  // ── hulpjes ────────────────────────────────────────────────
  open(behalve) {
    return this.ctx.getWebSockets().filter((s) => s !== behalve && s.readyState === OPEN);
  }

  status(behalve) {
    const spelers = new Set();
    const tv = { verbonden: 0, wacht: false, geluid: false, speelt: '', geladen: 0, fout: false };
    for (const s of this.open(behalve)) {
      const x = s.deserializeAttachment() || {};
      if (x.rol === 'speler' && x.ok) spelers.add(x.speler);
      if (x.rol === 'scherm') {
        if (x.ok) {
          tv.verbonden += 1;
          tv.geluid = tv.geluid || !!x.geluid;
          tv.speelt = tv.speelt || x.speelt || '';
          tv.geladen = Math.max(tv.geladen, x.geladen || 0);
          tv.fout = tv.fout || !!x.fout;
        } else tv.wacht = true;
      }
    }
    return { spelers: [...spelers], tv, videos: Object.keys(VIDEOS).length };
  }

  staatVoor(rol, behalve) {
    if (rol === 'speler') return { deuren: this.staat.deuren };
    if (rol === 'scherm') return { deuren: this.staat.deuren, scherm: this.staat.scherm, videos: VIDEOS };
    return { deuren: this.staat.deuren, scherm: this.staat.scherm, videos: VIDEOS, status: this.status(behalve) };
  }

  zendStaat() {
    for (const s of this.open()) {
      const x = s.deserializeAttachment() || {};
      if (x.ok) this.stuur(s, { t: 'staat', staat: this.staatVoor(x.rol) });
    }
  }

  meldStatus(behalve) {
    for (const s of this.open(behalve)) {
      const x = s.deserializeAttachment() || {};
      if (x.ok && x.rol === 'regia') this.stuur(s, { t: 'staat', staat: this.staatVoor('regia', behalve) });
    }
  }

  stuur(ws, m) {
    try { ws.send(JSON.stringify(m)); } catch (e) {}
  }

  async bewaar() {
    await this.ctx.storage.put('staat', this.staat);
  }
}
