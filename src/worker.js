// Ingang van de app. /live is de live verbinding; al het andere zijn gewone bestanden uit public/.
export { Villa } from './villa.js';

const TYPES = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8',
  json: 'application/json', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  svg: 'image/svg+xml', mp4: 'video/mp4', ttf: 'font/ttf', woff2: 'font/woff2', ico: 'image/x-icon', txt: 'text/plain; charset=utf-8',
};

// Korte adressen: / voor de spelers, /tv voor de tv, /regia voor Donna Serafina.
const KORT = {
  '/': '/Entree.dc.html', '/index.html': '/Entree.dc.html',
  '/tv': '/Scherm.dc.html', '/tv/': '/Scherm.dc.html',
  '/regia': '/Regia.dc.html', '/regia/': '/Regia.dc.html',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (KORT[url.pathname]) return Response.redirect(new URL(KORT[url.pathname] + url.search, url).toString(), 302);
    if (url.pathname === '/live') {
      const id = env.VILLA.idFromName('villa-bellandi');
      return env.VILLA.get(id).fetch(request);
    }
    // Op Cloudflare serveert de assets-laag bestanden zelf, nog vóór deze code.
    // Dit stuk draait alleen voor onbekende paden, en bij het lokaal testen.
    const r = await env.ASSETS.fetch(request);
    const ext = (url.pathname.split('.').pop() || '').toLowerCase();
    const type = r.headers.get('Content-Type') || '';
    if (!TYPES[ext] || (type && type !== 'application/octet-stream')) return r;
    const h = new Headers(r.headers);
    h.set('Content-Type', TYPES[ext]);
    return new Response(r.body, { status: r.status, headers: h });
  },
};
