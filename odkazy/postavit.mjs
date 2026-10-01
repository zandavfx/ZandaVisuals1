#!/usr/bin/env node
// Link-in-bio zandavisuals.com/odkazy (Žanek 1. 10. 2026, místo Linktree, zdarma na Cloudflare Pages).
// Z links.json vyrobí index.html (statická stránka s OG značkami) a og.png (1200×630, náhled odkazu).
//   node odkazy/postavit.mjs           — obojí
//   node odkazy/postavit.mjs --bez-og  — jen stránka (OG obrázek beze změny)
// Pak commit a push do main → Cloudflare Pages nasadí sám (kliky počítá functions/go/[slug].js).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SLOZKA = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(fs.readFileSync(path.join(SLOZKA, 'links.json'), 'utf8'));
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// Kontrola links.json: ať se rozbitý soubor nikdy nenasadí.
const chyby = [];
const slugy = new Set();
for (const o of data.odkazy ?? []) {
  if (!/^[a-z0-9-]{1,40}$/.test(o.slug ?? '')) chyby.push(`Neplatný slug „${o.slug}“ (jen a–z, 0–9, pomlčka).`);
  if (slugy.has(o.slug)) chyby.push(`Slug „${o.slug}“ je dvakrát.`);
  slugy.add(o.slug);
  if (!/^(https:\/\/|mailto:)/.test(o.url ?? '')) chyby.push(`Odkaz „${o.slug}“ musí začínat https:// nebo mailto:.`);
  if (!o.text?.trim()) chyby.push(`Odkaz „${o.slug}“ nemá text.`);
}
if (!data.odkazy?.length) chyby.push('Chybí odkazy.');
if ((data.odkazy ?? []).filter((o) => o.hlavni).length > 1) chyby.push('Hlavní může být jen jeden odkaz.');
if (chyby.length) {
  console.error(chyby.join('\n'));
  process.exit(1);
}

const h = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const IKONY = {
  zprava: '<path d="M21 3 10.5 13.5"/><path d="M21 3 14.5 21l-4-7.5L3 9.5z"/>',
  web: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/>',
  email: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/>',
  video: '<rect x="2.5" y="5" width="19" height="14" rx="3.5"/><path d="m10 9.2 5 2.8-5 2.8z" fill="currentColor"/>',
  profil: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="12" cy="10" r="3"/><path d="M6.5 18.5c1.2-2.4 3.1-3.5 5.5-3.5s4.3 1.1 5.5 3.5"/>',
};
const ikona = (k) => `<svg class="ikona" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IKONY[k] ?? IKONY.web}</svg>`;
const AVATAR = fs.readFileSync(path.join(SLOZKA, 'favicon.svg'), 'utf8').replace('<svg ', '<svg aria-hidden="true" width="88" height="88" ');
const og = new URL('og.png', data.adresa.endsWith('/') ? data.adresa : `${data.adresa}/`).toString();

const polozky = data.odkazy.map((o) => {
  // E-mail otevírá stránka přímo (mailto přes přesměrování v aplikaci Instagramu nefunguje),
  // klik se započítá zvlášť přes sendBeacon. Ostatní jdou přes /go/<slug> (funguje i bez JS).
  const mail = o.url.startsWith('mailto:');
  const href = mail ? o.url : `/go/${o.slug}`;
  return `      <li><a class="odkaz${o.hlavni ? ' hlavni' : ''}" href="${h(href)}"${mail ? ` data-pocitat="/go/${h(o.slug)}"` : ''}>${ikona(o.ikona)}<span class="text"><strong>${h(o.text)}</strong>${o.pozn ? `<small>${h(o.pozn)}</small>` : ''}</span><svg class="sipka" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7"/><path d="M8 7h9v9"/></svg></a></li>`;
}).join('\n');

const stranka = `<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${h(data.nazev)}</title>
<meta name="description" content="${h(data.popis)}">
<link rel="canonical" href="${h(data.adresa)}">
<meta property="og:type" content="website">
<meta property="og:locale" content="cs_CZ">
<meta property="og:site_name" content="ZandaVisuals">
<meta property="og:title" content="${h(data.nazev)}">
<meta property="og:description" content="${h(data.popis)}">
<meta property="og:url" content="${h(data.adresa)}">
<meta property="og:image" content="${h(og)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${h(`${data.nazev} — ${data.podtitul}`)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#FAF8F4" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#171517" media="(prefers-color-scheme: dark)">
<link rel="icon" href="/odkazy/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/odkazy/fonty/DM-Sans-2.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/odkazy/styl.css">
</head>
<body>
<main class="stranka">
  <header class="hlava">
    <span class="avatar">${AVATAR}</span>
    <h1>${h(data.nazev)}</h1>
    <p>${h(data.podtitul)}</p>
  </header>
  <nav aria-label="Odkazy">
    <ul class="odkazy">
${polozky}
    </ul>
  </nav>
  <footer class="pata"><a href="/">zandavisuals.com</a></footer>
</main>
<script data-cfasync="false" src="/odkazy/pocitani.js" defer></script>
</body>
</html>
`;
fs.writeFileSync(path.join(SLOZKA, 'index.html'), stranka);
console.log('odkazy/index.html');

if (!process.argv.includes('--bez-og')) {
  // Náhled odkazu (Instagram, WhatsApp, Messenger): stejné písmo a Jiskra, vyrenderováno Chromem.
  const ogHtml = path.join(SLOZKA, '.og.html');
  fs.writeFileSync(ogHtml, `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:'DM Sans';font-weight:100 1000;src:url(fonty/DM-Sans-2.woff2) format('woff2');unicode-range:U+0000-00FF,U+2000-206F}
@font-face{font-family:'DM Sans';font-weight:100 1000;src:url(fonty/DM-Sans-1.woff2) format('woff2');unicode-range:U+0100-02BA,U+02BD-02FF,U+1E00-1E9F}
html,body{margin:0;width:1200px;height:630px;overflow:hidden}
body{background:#FAF8F4;color:#252125;font-family:'DM Sans',sans-serif;display:flex;align-items:center;gap:64px;padding:0 96px;box-sizing:border-box;position:relative}
.av svg{width:260px;height:260px;display:block}
h1{font-size:76px;line-height:1.02;margin:0 0 20px;font-weight:700;letter-spacing:-.025em}
p{font-size:36px;margin:0;color:rgba(37,33,37,.7)}
.url{position:absolute;left:96px;bottom:56px;font-size:26px;font-weight:600;display:flex;align-items:center;gap:14px}
.url i{display:inline-block;width:14px;height:14px;border-radius:50%;background:#E8B5CE}
</style></head><body><div class="av">${AVATAR}</div><div><h1>${h(data.nazev).replace(' · ', '<br>')}</h1><p>${h(data.podtitul)}</p></div><div class="url"><i></i>${h(data.adresa.replace(/^https:\/\//, '').replace(/\/$/, ''))}</div></body></html>`);
  const png = path.join(SLOZKA, 'og.png');
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1200,630', `--screenshot=${png}`, '--virtual-time-budget=2000', `file://${ogHtml}`], { stdio: 'ignore' });
  fs.rmSync(ogHtml, { force: true });
  console.log('odkazy/og.png');
}
