# Link-in-bio — zandavisuals.com/odkazy

Žanek 1. 10. 2026: místo Linktree, **zdarma**, jako součást webu zandavisuals.com (Cloudflare Pages, projekt `zandavisuals1`). Místo placeného VPS s Caddy/nginx běží na Cloudflare Pages + Pages Functions + D1. Všechno je v bezplatném tarifu.

| Adresa | Co dělá |
|---|---|
| `/odkazy/` | Stránka s odkazy (statická, telefon napřed, světlý i tmavý režim, OG náhled) |
| `/go/<slug>` | Přesměrování na odkaz z `links.json` + započtení kliku. Neznámý slug → zpět na `/odkazy/` |
| `/odkazy/stats` | Statistiky kliků za heslem (Basic auth) |

Do Instagramu patří adresa **`zandavisuals.com/odkazy`**.

## Úprava odkazů

1. Uprav `odkazy/links.json`: `slug` (a–z, 0–9, pomlčka), `text`, `pozn` (menší řádek), `url` (`https://` nebo `mailto:`), `ikona` (`zprava`, `web`, `email`, `video`, `profil`), u jednoho odkazu `"hlavni": true` (růžové tlačítko).
2. `node odkazy/postavit.mjs` vyrobí `index.html` a `og.png` a soubor zkontroluje (rozbitý se nenasadí). OG obrázek kreslí Google Chrome na Macu.
3. Commit a push do `main` → Cloudflare Pages nasadí sám asi za minutu.

Přejmenovaný nebo smazaný slug zůstane ve statistikách se štítkem „už není na stránce“. Staré odkazy `/go/<starý slug>` pak vedou na `/odkazy/`.

## Statistiky

- Heslo zadává Žanek (jednou): `npx wrangler pages secret put STATS_PASSWORD --project-name zandavisuals1`. Jméno je `zanek`, jiné jde nastavit stejně přes `STATS_USER`. Bez hesla stránka ukáže jen „Statistiky zatím nejsou zapnuté“.
- Ukazuje kliky za 7 a 30 dní a celkem, graf po dnech, tabulku s trendem každého odkazu a odkud lidé přišli, z jaké země a z jakého zařízení.
- **Co se ukládá:** odkaz, čas, doména odkud (např. `l.instagram.com`), země podle Cloudflare, telefon/počítač. **Neukládá se** IP adresa, cookies ani celý prohlížeč. Proto není potřeba lišta se souhlasem.
- HEAD požadavky (roboti náhledů) se nepočítají. Kliky na e-mail se počítají přes `sendBeacon`, protože `mailto:` přes přesměrování v aplikaci Instagramu nefunguje.

## Kde co je

- `functions/go/[slug].js` — přesměrování a zápis kliku (chyba databáze přesměrování nezastaví).
- `functions/odkazy/stats.js` — statistiky.
- `wrangler.toml` (kořen repozitáře) — napojení D1. Produkce používá `zandavisuals-odkazy`, náhledy větví `zandavisuals-odkazy-nahled` (obě EU). Bez build příkazu, web se dál servíruje z kořene.
- `odkazy/schema.sql` — tabulka `kliky`. Nová databáze: `npx wrangler d1 execute zandavisuals-odkazy --remote --file odkazy/schema.sql`.
- `_headers` — přísná CSP jen pro `/odkazy`, ostatní web beze změny.

**Vyzkoušet na Macu:** `npx wrangler pages dev . --port 8797` v kořeni repozitáře (lokální D1, heslo v `.dev.vars`, který není v Gitu).

## Co stojí peníze

**Nic.** Cloudflare Pages, Functions (100 000 požadavků denně zdarma) i D1 (5 GB a 100 000 zápisů denně zdarma) jsou v bezplatném tarifu účtu. Kliky na link-in-bio jsou o řády níž. Placené by bylo jen VPS z původního zadání (~100–200 Kč měsíčně) — nepoužito.

## Při přechodu na nový web

Složky `odkazy/` a `functions/`, `wrangler.toml` a blok `/odkazy` v `_headers` přenést do nového webu. Databáze i statistiky zůstanou, jsou v Cloudflare, ne v repozitáři.
