-- Kliky na zandavisuals.com/go/<slug> (Cloudflare D1, EU). Bez IP adres, cookies a celých
-- prohlížečů: jen odkaz, čas, doména odkud (referrer), země z Cloudflare a typ zařízení.
CREATE TABLE IF NOT EXISTS kliky (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL,
  cas INTEGER NOT NULL,          -- ms od 1970 (UTC)
  odkud TEXT,                    -- jen doména referreru, např. l.instagram.com
  zeme TEXT,                     -- dvoupísmenný kód země (request.cf.country)
  zarizeni TEXT                  -- telefon / pocitac
);
CREATE INDEX IF NOT EXISTS kliky_cas ON kliky (cas);
CREATE INDEX IF NOT EXISTS kliky_slug_cas ON kliky (slug, cas);
