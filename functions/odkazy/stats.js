// zandavisuals.com/odkazy/stats — kliky link-in-bio za heslem (Basic auth z proměnných Cloudflare).
// STATS_PASSWORD je povinné (bez něj stránka nic neukáže), STATS_USER výchozí „zanek“.
// Jen čtení z D1; tabulka po odkazech, 30denní graf, odkud, země, zařízení.

const PRAHA = 'Europe/Prague';
const DEN = 86_400_000;

const html = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const cislo = (n) => new Intl.NumberFormat('cs-CZ').format(n ?? 0);

async function stejne(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  return crypto.subtle.timingSafeEqual(x, y);
}

async function prihlasen(request, env) {
  const h = request.headers.get('Authorization') ?? '';
  if (!h.startsWith('Basic ')) return false;
  let jmeno = '';
  let heslo = '';
  try {
    const dekod = new TextDecoder().decode(Uint8Array.from(atob(h.slice(6)), (c) => c.charCodeAt(0)));
    const i = dekod.indexOf(':');
    jmeno = dekod.slice(0, i);
    heslo = dekod.slice(i + 1);
  } catch {
    return false;
  }
  const [okJmeno, okHeslo] = await Promise.all([stejne(jmeno, env.STATS_USER || 'zanek'), stejne(heslo, env.STATS_PASSWORD)]);
  return okJmeno && okHeslo;
}

/** Posun pražského času proti UTC v sekundách (pro seskupení po dnech v SQL). */
function posunPrahy(cas) {
  const d = new Date(cas);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: PRAHA, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - d.getTime()) / 1000);
}

function dny30(ted) {
  const vysledek = [];
  for (let i = 29; i >= 0; i--) vysledek.push(new Date(ted - i * DEN + posunPrahy(ted) * 1000).toISOString().slice(0, 10));
  return vysledek;
}

function sparkline(hodnoty, { w = 120, h = 28 } = {}) {
  const max = Math.max(1, ...hodnoty);
  const krok = w / (hodnoty.length - 1);
  const body = hodnoty.map((v, i) => `${(i * krok).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline points="${body}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

function sloupce(dny, hodnoty) {
  const max = Math.max(1, ...hodnoty);
  const w = 600;
  const h = 120;
  const sirka = w / hodnoty.length;
  const bary = hodnoty.map((v, i) => {
    const vyska = v ? Math.max(2, (v / max) * (h - 8)) : 0;
    return `<rect x="${(i * sirka + 1).toFixed(1)}" y="${(h - vyska).toFixed(1)}" width="${(sirka - 2).toFixed(1)}" height="${vyska.toFixed(1)}" rx="1.5"><title>${html(dny[i])}: ${v}</title></rect>`;
  }).join('');
  return `<svg class="graf" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Kliky za posledních 30 dní">${bary}</svg>`;
}

const datum = (iso) => { const [, m, d] = iso.split('-'); return `${+d}. ${+m}.`; };

function seznam(nadpis, radky, popis = (k) => k) {
  if (!radky.length) return `<section class="karta"><h2>${nadpis}</h2><p class="tlumene">Zatím nic.</p></section>`;
  const celkem = radky.reduce((a, r) => a + r.n, 0);
  return `<section class="karta"><h2>${nadpis}</h2><ul class="podily">${radky.map((r) => `<li><span>${html(popis(r.k))}</span><span class="cislo">${cislo(r.n)} <small>${Math.round((r.n / celkem) * 100)} %</small></span></li>`).join('')}</ul></section>`;
}

function stranka(telo, status = 200, extra = {}) {
  return new Response(`<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Statistiky odkazů · ZandaVisuals</title><link rel="icon" href="/odkazy/favicon.svg" type="image/svg+xml"><style>${STYL}</style></head><body><main>${telo}</main></body></html>`, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; font-src 'self'; frame-ancestors 'none'", ...extra },
  });
}

export async function onRequestGet({ request, env }) {
  if (!env.STATS_PASSWORD) {
    return stranka('<h1>Statistiky zatím nejsou zapnuté</h1><p>Chybí heslo. V Terminálu: <code>npx wrangler pages secret put STATS_PASSWORD --project-name zandavisuals1</code></p>', 503);
  }
  if (!(await prihlasen(request, env))) {
    return new Response('Přihlášení vyžadováno.', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Statistiky odkazu ZandaVisuals", charset="UTF-8"', 'Cache-Control': 'no-store' } });
  }
  if (!env.ODKAZY_DB) return stranka('<h1>Chybí databáze kliků</h1><p>Projekt nemá napojenou D1 (ODKAZY_DB).</p>', 503);

  const ted = Date.now();
  const posun = posunPrahy(ted);
  const od7 = ted - 7 * DEN;
  const od30 = ted - 30 * DEN;
  const dny = dny30(ted);
  const db = env.ODKAZY_DB;
  const [souhrn, denne, odkud, zeme, zarizeni, odkazyR] = await Promise.all([
    db.prepare('SELECT slug, SUM(cas >= ?1) AS d7, SUM(cas >= ?2) AS d30, COUNT(*) AS vse, MAX(cas) AS posledni FROM kliky GROUP BY slug').bind(od7, od30).all(),
    db.prepare("SELECT slug, date(cas / 1000 + ?2, 'unixepoch') AS den, COUNT(*) AS n FROM kliky WHERE cas >= ?1 GROUP BY slug, den").bind(ted - 31 * DEN, posun).all(),
    db.prepare("SELECT COALESCE(odkud, 'přímo / neznámé') AS k, COUNT(*) AS n FROM kliky WHERE cas >= ?1 GROUP BY k ORDER BY n DESC LIMIT 8").bind(od30).all(),
    db.prepare("SELECT COALESCE(zeme, '—') AS k, COUNT(*) AS n FROM kliky WHERE cas >= ?1 GROUP BY k ORDER BY n DESC LIMIT 8").bind(od30).all(),
    db.prepare('SELECT zarizeni AS k, COUNT(*) AS n FROM kliky WHERE cas >= ?1 GROUP BY k ORDER BY n DESC').bind(od30).all(),
    env.ASSETS.fetch(new URL('/odkazy/links.json', request.url)).then((r) => (r.ok ? r.json() : { odkazy: [] })).catch(() => ({ odkazy: [] })),
  ]);
  const odkazy = odkazyR.odkazy ?? [];
  const podleSlugu = new Map((souhrn.results ?? []).map((r) => [r.slug, r]));
  const slugy = [...new Set([...odkazy.map((o) => o.slug), ...podleSlugu.keys()])];
  const denniMapa = new Map();
  for (const r of denne.results ?? []) denniMapa.set(`${r.slug}|${r.den}`, r.n);
  const radaSlugu = (slug) => dny.map((d) => denniMapa.get(`${slug}|${d}`) ?? 0);
  const celkemDenne = dny.map((d) => slugy.reduce((a, s) => a + (denniMapa.get(`${s}|${d}`) ?? 0), 0));
  const soucet = (k) => slugy.reduce((a, s) => a + (podleSlugu.get(s)?.[k] ?? 0), 0);

  const radky = slugy.map((s) => {
    const o = odkazy.find((x) => x.slug === s);
    const r = podleSlugu.get(s) ?? {};
    return `<tr><th scope="row"><span class="nazev">${html(o?.text ?? s)}</span><span class="slug">/go/${html(s)}${o ? '' : ' · už není na stránce'}</span></th><td class="cislo">${cislo(r.d7)}</td><td class="cislo">${cislo(r.d30)}</td><td class="cislo">${cislo(r.vse)}</td><td class="trend">${sparkline(radaSlugu(s))}</td></tr>`;
  }).join('');

  const zarizeniPopis = { telefon: 'Telefon', pocitac: 'Počítač' };
  return stranka(`
    <header><img src="/odkazy/favicon.svg" alt="" width="40" height="40"><div><h1>Statistiky odkazů</h1><p class="tlumene">zandavisuals.com/odkazy · ${html(new Date(ted).toLocaleString('cs-CZ', { timeZone: PRAHA }))}</p></div></header>
    <section class="dlazdice">
      <div><span class="tlumene">7 dní</span><strong>${cislo(soucet('d7'))}</strong></div>
      <div><span class="tlumene">30 dní</span><strong>${cislo(soucet('d30'))}</strong></div>
      <div><span class="tlumene">Celkem</span><strong>${cislo(soucet('vse'))}</strong></div>
    </section>
    <section class="karta"><h2>Kliky po dnech (30 dní)</h2>${sloupce(dny, celkemDenne)}<div class="osa"><span>${datum(dny[0])}</span><span>${datum(dny[29])}</span></div></section>
    <section class="karta tabulka"><h2>Odkazy</h2><div class="posun"><table><thead><tr><th scope="col">Odkaz</th><th scope="col" class="cislo">7 dní</th><th scope="col" class="cislo">30 dní</th><th scope="col" class="cislo">Celkem</th><th scope="col">30 dní</th></tr></thead><tbody>${radky}</tbody></table></div></section>
    <div class="mrizka">
      ${seznam('Odkud (30 dní)', odkud.results ?? [])}
      ${seznam('Země (30 dní)', zeme.results ?? [])}
      ${seznam('Zařízení (30 dní)', zarizeni.results ?? [], (k) => zarizeniPopis[k] ?? k)}
    </div>
    <p class="tlumene pata">Klik = otevření /go/… (u e-mailu kliknutí na tlačítko). Bez IP adres a cookies.</p>`);
}

const STYL = `
@font-face{font-family:'DM Sans';font-weight:100 1000;font-display:swap;src:url(/odkazy/fonty/DM-Sans-2.woff2) format('woff2');unicode-range:U+0000-00FF,U+2000-206F,U+20AC}
@font-face{font-family:'DM Sans';font-weight:100 1000;font-display:swap;src:url(/odkazy/fonty/DM-Sans-1.woff2) format('woff2');unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1E00-1E9F}
:root{--papir:#FAF8F4;--inkoust:#252125;--ruzova:#E8B5CE;--plocha:#fff;--cara:rgba(37,33,37,.1);--tlum:rgba(37,33,37,.62);color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--papir:#171517;--inkoust:#F4F1EC;--plocha:#211E21;--cara:rgba(244,241,236,.12);--tlum:rgba(244,241,236,.62)}}
*{box-sizing:border-box}body{margin:0;background:var(--papir);color:var(--inkoust);font:15px/1.5 'DM Sans',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
main{max-width:64rem;margin:0 auto;padding:24px 16px 48px}
header{display:flex;gap:12px;align-items:center;margin-bottom:20px}h1{font-size:22px;margin:0;letter-spacing:-.01em}h2{font-size:14px;margin:0 0 12px;font-weight:600}
.tlumene{color:var(--tlum);margin:0;font-size:13px}code{font-size:13px;background:var(--plocha);border:1px solid var(--cara);padding:2px 6px;border-radius:.375rem;word-break:break-all}
.dlazdice{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}.dlazdice div{background:var(--plocha);border:1px solid var(--cara);border-radius:.5rem;padding:12px 14px;display:flex;flex-direction:column}
.dlazdice strong{font-size:26px;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.karta{background:var(--plocha);border:1px solid var(--cara);border-radius:.5rem;padding:16px;margin-bottom:12px}
.graf{width:100%;height:120px;display:block}.graf rect{fill:var(--ruzova)}.osa{display:flex;justify-content:space-between;color:var(--tlum);font-size:12px;margin-top:6px}
.posun{overflow-x:auto}table{width:100%;border-collapse:collapse;min-width:30rem}th,td{text-align:left;padding:0 8px;height:44px;border-top:1px solid var(--cara);font-weight:400}
thead th{border-top:0;color:var(--tlum);font-size:12px;height:32px}.cislo{text-align:right;font-variant-numeric:tabular-nums}
.nazev{display:block;font-weight:600}.slug{display:block;color:var(--tlum);font-size:12px}.trend{width:136px;color:var(--inkoust)}.spark{display:block}
.mrizka{display:grid;grid-template-columns:repeat(auto-fit,minmax(14rem,1fr));gap:12px}.mrizka .karta{margin:0}
.podily{list-style:none;margin:0;padding:0}.podily li{display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-top:1px solid var(--cara)}.podily li:first-child{border-top:0}.podily small{color:var(--tlum)}
.pata{margin-top:16px}
@media (max-width:34rem){table{min-width:0}.trend,thead th:last-child{display:none}.dlazdice strong{font-size:22px}}
`;
