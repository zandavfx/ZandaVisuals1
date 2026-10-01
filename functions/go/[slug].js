// zandavisuals.com/go/<slug> → cíl z odkazy/links.json + započtení kliku do D1 (link-in-bio, 1. 10. 2026).
// Přesměruje se jen na adresy z links.json (žádné otevřené přesměrování). Kliknutí se ukládá
// bez IP, cookies a celého prohlížeče. Když databáze chybí nebo selže, přesměrování funguje dál.

const SLUG = /^[a-z0-9-]{1,40}$/;

async function nactiOdkazy(context) {
  const r = await context.env.ASSETS.fetch(new URL('/odkazy/links.json', context.request.url));
  if (!r.ok) return [];
  const data = await r.json();
  return Array.isArray(data.odkazy) ? data.odkazy : [];
}

/** Jen doména, odkud klik přišel (např. l.instagram.com), nikdy celá adresa. */
function odkud(referrer, vlastni) {
  try {
    const h = new URL(referrer).hostname.toLowerCase();
    return h && h !== vlastni ? h.slice(0, 100) : null;
  } catch {
    return null;
  }
}

function zarizeni(ua = '') {
  return /mobile|iphone|android|ipad/i.test(ua) ? 'telefon' : 'pocitac';
}

async function zapocitej(context, slug) {
  const db = context.env.ODKAZY_DB;
  if (!db) return;
  const { request } = context;
  try {
    await db
      .prepare('INSERT INTO kliky (slug, cas, odkud, zeme, zarizeni) VALUES (?1, ?2, ?3, ?4, ?5)')
      .bind(slug, Date.now(), odkud(request.headers.get('Referer'), new URL(request.url).hostname), String(request.cf?.country ?? '').slice(0, 2) || null, zarizeni(request.headers.get('User-Agent') ?? ''))
      .run();
  } catch {
    // Počítání je jen doplněk; přesměrování nesmí kvůli databázi selhat.
  }
}

export async function onRequest(context) {
  const slug = String(context.params.slug ?? '').toLowerCase();
  const odkaz = SLUG.test(slug) ? (await nactiOdkazy(context)).find((o) => o.slug === slug) : null;
  if (!odkaz) return Response.redirect(new URL('/odkazy/', context.request.url).toString(), 302);

  // E-mail (mailto) otevírá stránka sama; sem jen pošle „sendBeacon“, ať se klik započítá.
  if (context.request.method === 'POST') {
    context.waitUntil(zapocitej(context, slug));
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  }
  if (context.request.method !== 'GET' && context.request.method !== 'HEAD') return new Response(null, { status: 405 });

  // Robot náhledu odkazu (Instagram, Messenger…) neposílá HEAD jako klik.
  if (context.request.method === 'GET') context.waitUntil(zapocitej(context, slug));
  return new Response(null, {
    status: 302,
    headers: { Location: odkaz.url, 'Cache-Control': 'no-store', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Robots-Tag': 'noindex' },
  });
}
