// Blok „Video“ v sekci formuláře (MID-033, Mochi vlna 3, 11. 10. 2026).
//
// Načítá se JEN u formuláře, který má v některé sekci video (krok.video.token).
// Formulář bez videa (Book Therapy) tenhle soubor vůbec nestáhne.
//
// Video je Loom z Nahrávek: přehrává se stejnou veřejnou cestou jako stránka
// /v/<token> (/api/verejne/v/<token>/video, náhled /nahled) a měří se stejně:
// „zobrazeni“ po ~2 s viditelného videa, „prehrani“ při spuštění a milníky
// 25/50/75/100 podle SKUTEČNĚ přehraného času (DOKOUKANO_OD = 0.9 jako
// lib/videa/mereni.ts). Bez cookies, každý druh nejvýš jednou za načtení,
// náhled formuláře v OS neměří. Při importu nesahá na DOM (testy v node).

export const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;
export const DOKOUKANO_OD = 0.9;
const VIDITELNOST_MS = 2000;

/** Milníky podle podílu přehraného času (stejně jako milnikyPrehrani v lib/videa/mereni.ts). */
export function milniky(pomer) {
  if (!Number.isFinite(pomer) || pomer <= 0) return [];
  const out = [];
  if (pomer >= 0.25) out.push('25');
  if (pomer >= 0.5) out.push('50');
  if (pomer >= 0.75) out.push('75');
  if (pomer >= DOKOUKANO_OD) out.push('100');
  return out;
}

/** Součet přehraných úseků videa (TimeRanges) v sekundách. */
export function prehranoSekund(played) {
  let s = 0;
  for (let i = 0; i < (played?.length ?? 0); i += 1) {
    const a = played.start(i);
    const b = played.end(i);
    if (Number.isFinite(a) && Number.isFinite(b) && b > a) s += b - a;
  }
  return s;
}

/** Adresy videa a náhledu pro token (null = neplatný token). `api` = základ API bez lomítka. */
export function adresyVidea(token, api = '') {
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) return null;
  const zaklad = `${api}/api/verejne/v/${encodeURIComponent(token)}`;
  return { video: `${zaklad}/video`, nahled: `${zaklad}/nahled`, udalost: `${zaklad}/udalost` };
}

const odeslane = new Set();

/**
 * Událost měření. text/plain bez přihlašovacích údajů a bez čtení odpovědi (no-cors),
 * ať funguje i z formuláře na zandavisuals.com (API na app.zandavisuals.com) bez CORS.
 */
export function posliUdalost(adresa, token, druh, fetchFn = globalThis.fetch) {
  const klic = `${token}:${druh}`;
  if (odeslane.has(klic) || typeof fetchFn !== 'function') return false;
  odeslane.add(klic);
  try {
    const p = fetchFn(adresa, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ druh }),
      keepalive: true,
      credentials: 'omit',
      cache: 'no-store',
    });
    // Výpadek sítě: zkusit znovu nejdřív při další příležitosti (další milník / spuštění).
    if (p && typeof p.catch === 'function') p.catch(() => odeslane.delete(klic));
  } catch {
    odeslane.delete(klic);
  }
  return true;
}

// Jeden prvek (a jeden pozorovatel) na token za načtení stránky: formulář sekci překresluje při každém
// kroku, video se proto znovu použije (přehrávání pokračuje, nic se nezdvojí). Posluchač skrytí karty
// je jen jeden pro všechna videa.
const prvky = new Map();
const casovace = new Map();
let posluchacSkryti = false;

function zastavitCasovace() {
  for (const t of casovace.values()) clearTimeout(t);
  casovace.clear();
}

/** Počet vytvořených prvků (pro testy). */
export const pocetPrvku = () => prvky.size;

/**
 * Prvek s videem pro sekci. `merit` = false v náhledu formuláře (nic se neměří).
 * `L(cs, en)` = text podle jazyka formuláře. Neplatný token = null (sekce bez videa).
 */
export function videoKroku(video, { api = '', merit = true, L = (cs) => cs } = {}) {
  const a = adresyVidea(video?.token, api);
  if (!a) return null;
  const token = video.token;
  const ulozeny = prvky.get(token);
  if (ulozeny) return ulozeny;
  const box = document.createElement('figure');
  box.className = 'video-krok';
  box.setAttribute('style', 'margin:4px 0 8px;display:grid;gap:6px');
  const v = document.createElement('video');
  v.src = a.video;
  v.poster = a.nahled;
  v.controls = true;
  v.playsInline = true;
  v.preload = 'metadata';
  v.setAttribute('aria-label', L('Ukázkové video', 'Sample video'));
  v.setAttribute('style', 'display:block;width:100%;aspect-ratio:16/9;border-radius:12px;background:#000;object-fit:contain');
  const chyba = document.createElement('figcaption');
  chyba.hidden = true;
  chyba.setAttribute('style', 'font-size:13px;opacity:.75');
  chyba.textContent = L('Video se teď nepodařilo načíst. Formulář můžete vyplnit i bez něj.', "The video couldn't be loaded. You can fill in the form without it.");
  v.addEventListener('error', () => { chyba.hidden = false; });
  box.append(v, chyba);
  prvky.set(token, box);

  if (merit) {
    v.addEventListener('play', () => posliUdalost(a.udalost, token, 'prehrani'));
    const zmer = () => {
      if (!(v.duration > 0) || !Number.isFinite(v.duration)) return;
      for (const m of milniky(prehranoSekund(v.played) / v.duration)) posliUdalost(a.udalost, token, m);
    };
    v.addEventListener('timeupdate', zmer);
    v.addEventListener('ended', zmer);
    // Zobrazení: video aspoň ~2 s ve viditelné části stránky (jednorázový časovač, žádné dotazování).
    const stop = () => { clearTimeout(casovace.get(token)); casovace.delete(token); };
    const start = () => {
      if (casovace.has(token) || document.visibilityState !== 'visible' || odeslane.has(`${token}:zobrazeni`)) return;
      casovace.set(token, setTimeout(() => { casovace.delete(token); posliUdalost(a.udalost, token, 'zobrazeni'); }, VIDITELNOST_MS));
    };
    if (typeof IntersectionObserver === 'function') {
      const io = new IntersectionObserver((zaznamy) => {
        if (zaznamy.some(z => z.isIntersecting)) start(); else stop();
        if (odeslane.has(`${token}:zobrazeni`)) io.disconnect();
      }, { threshold: 0.5 });
      io.observe(v);
    } else {
      start();
    }
    if (!posluchacSkryti) {
      posluchacSkryti = true;
      document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'visible') zastavitCasovace(); });
    }
  }
  return box;
}
