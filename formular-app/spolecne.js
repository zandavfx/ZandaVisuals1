// Sdílené části veřejného formuláře (23. 9. 2026 večer).
//
// Načítá se JEN u formulářů, které to potřebují: nové typy otázek (ano/ne,
// hodnocení, škála, číslo, telefon), výběr s obrázky / emoji, vlastní vzhled
// (`schema.vzhled`) nebo režim „jedna otázka na obrazovku". Formulář bez
// těchto věcí (Book Therapy) tenhle soubor vůbec nestáhne a form.js se chová
// přesně jako dřív.
//
// Používá ho form.js (režim kroků) i jedna-otazka.js. Při importu nesahá na
// DOM, takže jde načíst i v node:test (tests/formular-app-*.test.mjs).
// Texty ze schématu se vkládají jen přes textContent / createElement.

// ── Typy ─────────────────────────────────────────────────────────────────────
export const NOVE_TYPY = ['yes_no', 'rating', 'scale', 'number', 'phone'];
export const TEMATA = ['papir', 'inkoust', 'ruzova'];
const SKUPINOVE = new Set(['yes_no', 'rating', 'scale']);

export const jeNovyTyp = q => NOVE_TYPY.includes(q?.typ);
/** Otázka je skupina tlačítek (popisek je span s id, ne <label for>). */
export const jeSkupina = q => SKUPINOVE.has(q?.typ);
export const jeVyber = q => q?.typ === 'single_choice' || q?.typ === 'multi_choice';
/** Výběr, u kterého má aspoň jedna možnost obrázek nebo emoji → dlaždice. */
export const maObrazky = q => jeVyber(q) && (q.moznosti ?? []).some(m => m && (m.ikona || m.obrazek));

/**
 * Potřebuje formulář tenhle modul? (Stejné pravidlo je ve form.js jako
 * needsExtensions — form.js se rozhoduje dřív, než modul stáhne.)
 */
export function potrebujeRozsireni(schema) {
  if (!schema || typeof schema !== 'object') return false;
  if (schema.rezim === 'jedna_otazka' || schema.vzhled) return true;
  return (schema.otazky ?? []).some(q => jeNovyTyp(q) || maObrazky(q));
}

// ── Jazyk a oslovení ─────────────────────────────────────────────────────────
/** Stejná pravidla jako t() a L() ve form.js. */
export function jazykFormulare(schema) {
  const en = schema?.jazyk === 'en';
  const vy = schema?.osloveni !== 'ty';
  const t = (formal, informal, english) => (en && english !== undefined ? english : vy ? formal : informal);
  const L = (cs, eng) => (en ? eng : cs);
  return { en, vy, t, L };
}

/** 1 otázka, 2 otázky, 5 otázek / 1 question, 2 questions. */
export function pocetOtazek(schema, n) {
  if (schema?.jazyk === 'en') return `${n} ${n === 1 ? 'question' : 'questions'}`;
  return `${n} ${n === 1 ? 'otázka' : n >= 2 && n <= 4 ? 'otázky' : 'otázek'}`;
}

// ── Podmínky ─────────────────────────────────────────────────────────────────
// Kopie pravidla jeViditelna z runtime/lib/formulare/schema.ts a isVisible
// z form.js — měnit všechna tři místa stejně (hlídá tests/formular-app-*.test.mjs).
export function isBlank(v) {
  if (Array.isArray(v)) return v.length === 0;
  return typeof v !== 'string' || v.trim() === '';
}

export function conditionMet(p, v) {
  if (Array.isArray(p.je) && p.je.length > 0) {
    if (Array.isArray(v)) return v.some(x => typeof x === 'string' && p.je.includes(x));
    if (typeof v !== 'string') return false;
    const h = v.trim().toLowerCase();
    return p.je.some(x => x === v || String(x).trim().toLowerCase() === h);
  }
  if (p.vyplneno) return !isBlank(v);
  return true;
}

/** Je otázka / krok vidět při těchto odpovědích? */
export function jeViditelna(schema, values, target, depth = 0) {
  if (depth > 92) return false; // pojistka proti cyklu v neplatném schématu
  const kroky = schema?.kroky ?? [];
  const otazky = schema?.otazky ?? [];
  if ('typ' in target && typeof target.krok === 'string') {
    const krok = kroky.find(k => k.id === target.krok);
    if (krok && !jeViditelna(schema, values, krok, depth + 1)) return false;
  }
  const p = target.podminka;
  if (!p || typeof p !== 'object') return true;
  const ref = otazky.find(q => q.id === p.otazka);
  if (!ref || ref === target) return true;
  return conditionMet(p, jeViditelna(schema, values, ref, depth + 1) ? values?.[ref.id] : undefined);
}

// ── Hodnocení a škála ────────────────────────────────────────────────────────
/** Stejné jako skalaOtazky v schema.ts. */
export function skalaOtazky(q) {
  if (q.typ === 'rating') return { od: 1, do: q.skala?.do ?? 5, popisOd: q.skala?.popisOd, popisDo: q.skala?.popisDo };
  return { od: q.skala?.od ?? 0, do: q.skala?.do ?? 10, popisOd: q.skala?.popisOd, popisDo: q.skala?.popisDo };
}

// ── Kontrola odpovědí ────────────────────────────────────────────────────────
// Hlášky nových typů jsou 1:1 serverové (hlasky() v schema.ts). U starých
// typů stejné jako requiredMessage / checkQuestion ve form.js.
const EMAIL_RE = /^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/;
const TELEFON_RE = /^\+?[0-9 ()./-]{6,24}$/;
const CISLO_RE = /^-?\d{1,12}(?:[.,]\d{1,6})?$/;

const prazdna = v => v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);

export function zpravaPovinne(schema, q) {
  const { t } = jazykFormulare(schema);
  if (q.typ === 'email') return t('Doplňte platnou e-mailovou adresu.', 'Doplň platnou e-mailovou adresu.', 'Please enter a valid email address.');
  if (q.typ === 'single_choice' || q.typ === 'yes_no') return t('Vyberte jednu možnost.', 'Vyber jednu možnost.', 'Please select one option.');
  if (q.typ === 'multi_choice') return t('Vyberte aspoň jednu možnost.', 'Vyber aspoň jednu možnost.', 'Please select at least one option.');
  if (q.typ === 'rating' || q.typ === 'scale') return t('Vyberte prosím hodnotu.', 'Vyber prosím hodnotu.', 'Please choose a value.');
  if (q.typ === 'date') return t('Vyberte prosím datum.', 'Vyber prosím datum.', 'Please pick a date.');
  if (q.doporuceni) {
    return t('Napište odpověď, nebo „nechám si doporučit“.', 'Napiš odpověď, nebo „nechám si doporučit“.', "Please write an answer, or choose “I'd like a recommendation.”");
  }
  return t('Tuhle otázku prosím vyplňte.', 'Tuhle otázku prosím vyplň.', 'Please answer this question.');
}

/** Chyba hodnoty (bez souborů), nebo null. */
export function zkontrolujHodnotu(schema, q, v) {
  const { t, L } = jazykFormulare(schema);
  if (prazdna(v)) return q.povinna ? zpravaPovinne(schema, q) : null;
  const text = typeof v === 'string' ? v.trim() : '';
  switch (q.typ) {
    case 'email':
      return EMAIL_RE.test(text) ? null : t('Doplňte platnou e-mailovou adresu.', 'Doplň platnou e-mailovou adresu.', 'Please enter a valid email address.');
    case 'url':
      return /^https?:\/\/\S+$/i.test(text) ? null : L('Odkaz musí začínat http:// nebo https://.', 'The link must start with http:// or https://.');
    case 'date':
      return /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(`${text}T00:00:00Z`)) ? null : L('Neplatné datum.', 'Invalid date.');
    case 'yes_no':
      return text === 'ano' || text === 'ne' ? null : L('Neplatná volba.', 'Invalid choice.');
    case 'rating':
    case 'scale': {
      const k = skalaOtazky(q);
      const n = Number(text);
      return /^\d{1,2}$/.test(text) && n >= k.od && n <= k.do ? null : t('Vyberte prosím hodnotu.', 'Vyber prosím hodnotu.', 'Please choose a value.');
    }
    case 'number': {
      const chyba = t('Zadejte platné číslo.', 'Zadej platné číslo.', 'Please enter a valid number.');
      if (!CISLO_RE.test(text)) return chyba;
      const n = Number(text.replace(',', '.'));
      const r = q.cislo_rozsah;
      if ((r?.min !== undefined && n < r.min) || (r?.max !== undefined && n > r.max)) return chyba;
      return null;
    }
    case 'phone':
      return TELEFON_RE.test(text) ? null : t('Zadejte platné telefonní číslo.', 'Zadej platné telefonní číslo.', 'Please enter a valid phone number.');
    default:
      return null;
  }
}

/** Čitelný text odpovědi (přehled). Soubory řeší volající. */
export function textOdpovedi(schema, q, v) {
  const { L } = jazykFormulare(schema);
  if (prazdna(v)) return '';
  if (q.typ === 'single_choice') return q.moznosti?.find(m => m.id === v)?.label ?? String(v);
  if (q.typ === 'multi_choice' && Array.isArray(v)) return v.map(id => q.moznosti?.find(m => m.id === id)?.label ?? id).join(', ');
  if (q.typ === 'yes_no') return v === 'ano' ? L('Ano', 'Yes') : v === 'ne' ? L('Ne', 'No') : String(v);
  if (q.typ === 'rating') return L(`${v} z ${skalaOtazky(q).do}`, `${v} of ${skalaOtazky(q).do}`);
  if (q.typ === 'scale') { const k = skalaOtazky(q); return `${v} (${k.od}–${k.do})`; }
  if (q.typ === 'date' && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const d = new Date(`${v}T12:00:00`);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString(L('cs-CZ', 'en-GB'));
  }
  return Array.isArray(v) ? v.join(', ') : String(v);
}

// ── Vzhled (témata a akcent) ─────────────────────────────────────────────────
const HEX_RE = /^#[0-9a-f]{6}$/i;
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const hexZ = c => `#${c.map(x => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('')}`;
/** Smíchá dvě barvy: podil = kolik z druhé (0–1). */
export const smichej = (a, b, podil) => hexZ(rgb(a).map((x, i) => x + (rgb(b)[i] - x) * podil));

function jas(hex) {
  const [r, g, b] = rgb(hex).map(x => {
    const s = x / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const kontrast = (a, b) => {
  const [x, y] = [jas(a), jas(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

/** Čitelná barva textu na tlačítku s daným pozadím: inkoust, nebo bílá. */
export function citelnaBarva(pozadi) {
  const INK = '#252125';
  return kontrast(pozadi, INK) >= kontrast(pozadi, '#ffffff') ? INK : '#ffffff';
}

/**
 * Nastaví téma (data-tema) a případný akcent jako CSS proměnné na kořen
 * stránky. Bez `vzhled` = papír s růžovou (původní barvy).
 */
export function pouzijVzhled(root, schema) {
  const v = schema?.vzhled && typeof schema.vzhled === 'object' ? schema.vzhled : null;
  const tema = TEMATA.includes(v?.tema) ? v.tema : 'papir';
  root.dataset.tema = tema;
  root.dataset.zarovnani = v?.zarovnani === 'stred' ? 'stred' : 'vlevo';
  const a = typeof v?.akcent === 'string' && HEX_RE.test(v.akcent) ? v.akcent.toLowerCase() : null;
  if (!a) return;
  const tmave = tema === 'inkoust';
  const podklad = tmave ? '#252125' : tema === 'ruzova' ? '#f8ecf1' : '#faf8f4';
  const fg = citelnaBarva(a);
  const set = (k, val) => root.style.setProperty(k, val);
  set('--pink', a);
  set('--btn-bg', a);
  set('--btn-fg', fg);
  set('--btn-hover', smichej(a, fg === '#ffffff' ? '#000000' : '#ffffff', 0.14));
  set('--bar', a);
  set('--hi', `${a}8c`);
  set('--soft', smichej(podklad, a, tmave ? 0.2 : 0.16));
  set('--soft-line', smichej(podklad, a, tmave ? 0.36 : 0.32));
  // Obrys vybrané možnosti: dost tmavý (světlá témata) / světlý (tmavé) na čitelnost.
  set('--chip-on', kontrast(a, podklad) >= 2.2 ? a : smichej(a, tmave ? '#ffffff' : '#252125', 0.4));
  set('--focus', kontrast(a, podklad) >= 3 ? a : smichej(a, tmave ? '#ffffff' : '#252125', 0.45));
}

/** Načte CSS jednou; vrací Promise<boolean>. Nevadí, když selže (stránka jede dál). */
export function nactiStyly(href) {
  return new Promise(resolve => {
    const abs = new URL(href, document.baseURI).href;
    if ([...document.querySelectorAll('link[rel="stylesheet"]')].some(l => l.href === abs)) {
      resolve(true);
      return;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = abs;
    link.onload = () => resolve(true);
    link.onerror = () => resolve(false);
    document.head.append(link);
  });
}

// ── DOM pomocníci (volají se až při vykreslení) ──────────────────────────────
export function el(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    node.setAttribute(k, v === true ? '' : String(v));
  }
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function svg(d, trida) {
  const s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('focusable', 'false');
  if (trida) s.setAttribute('class', trida);
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', d);
  s.append(p);
  return s;
}
const HVEZDA = 'M12 3.2l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.5l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z';
const FAJFKA = 'M5 12.5l4.2 4.2L19 7';

export const pismeno = i => (i < 26 ? String.fromCharCode(65 + i) : '');

/**
 * Roving tabindex skupiny rádií: šipky mění výběr (jako single_choice ve
 * form.js), Home / End na kraj. `vyber(i, zdroj)` volá ovladač.
 */
function sipkyRadia(buttons, vyber) {
  buttons.forEach((b, i) => {
    b.addEventListener('keydown', e => {
      const last = buttons.length - 1;
      let to = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') to = i === last ? 0 : i + 1;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') to = i === 0 ? last : i - 1;
      else if (e.key === 'Home') to = 0;
      else if (e.key === 'End') to = last;
      if (to === null) return;
      e.preventDefault();
      vyber(to, 'sipka');
    });
  });
}

function skupina(q, api, trida, role = 'radiogroup') {
  return el('div', {
    class: trida,
    role,
    'aria-labelledby': api.labelId,
    'aria-describedby': api.describedBy,
    'aria-required': role === 'radiogroup' && q.povinna ? 'true' : undefined,
    'data-control': '',
  });
}

/**
 * Ovladač nového typu (yes_no, rating, scale, number, phone).
 *   api = { schema, rezim: 'kroky' | 'jedna', labelId, describedBy, enterHint,
 *           ziskej(): hodnota, nastav(hodnota, zdroj) }
 * zdroj: 'mys' (klik / dotyk), 'klavesa' (Enter, mezerník, písmeno, číslo),
 * 'sipka' (šipky ve skupině), 'psani' (text).
 */
export function ovladac(q, api) {
  if (q.typ === 'number' || q.typ === 'phone') return textoveCislo(q, api);
  const { L } = jazykFormulare(api.schema);
  const jedna = api.rezim === 'jedna';
  let polozky;
  if (q.typ === 'yes_no') {
    const en = api.schema?.jazyk === 'en';
    polozky = [
      { hodnota: 'ano', text: L('Ano', 'Yes'), klavesa: en ? 'Y' : 'A' },
      { hodnota: 'ne', text: L('Ne', 'No'), klavesa: 'N' },
    ];
  } else {
    const k = skalaOtazky(q);
    polozky = [];
    for (let n = k.od; n <= k.do; n++) {
      polozky.push({
        hodnota: String(n),
        text: String(n),
        aria: q.typ === 'rating' ? L(`${n} z ${k.do}`, `${n} of ${k.do}`) : undefined,
      });
    }
  }

  const trida = q.typ === 'yes_no' ? 'zv-ano-ne' : q.typ === 'rating' ? 'zv-hvezdy' : 'zv-skala';
  const group = skupina(q, api, trida);
  if (q.typ === 'scale') {
    group.style.setProperty('--n', String(polozky.length));
    group.style.setProperty('--nm', String(polozky.length > 6 ? Math.ceil(polozky.length / 2) : polozky.length));
  }
  const buttons = polozky.map(p => {
    const b = el('button', {
      type: 'button',
      role: 'radio',
      'aria-checked': 'false',
      class: q.typ === 'yes_no' ? 'zv-moznost' : q.typ === 'rating' ? 'zv-hvezda' : 'zv-cislo',
      'data-hodnota': q.typ === 'yes_no' ? undefined : p.hodnota,
      'data-klavesa': q.typ === 'yes_no' && jedna ? p.klavesa : undefined,
      'aria-label': p.aria,
    });
    if (q.typ === 'rating') {
      b.append(svg(HVEZDA));
    } else if (q.typ === 'yes_no') {
      if (jedna) b.append(el('span', { class: 'zv-klavesa', 'aria-hidden': 'true' }, p.klavesa));
      b.append(el('span', { class: 'zv-text' }, p.text), svg(FAJFKA, 'zv-fajfka'));
    } else {
      b.textContent = p.text;
    }
    return b;
  });

  const refresh = () => {
    const v = api.ziskej();
    const vybrany = polozky.findIndex(p => p.hodnota === v);
    buttons.forEach((b, i) => {
      b.setAttribute('aria-checked', i === vybrany ? 'true' : 'false');
      b.tabIndex = i === vybrany || (vybrany === -1 && i === 0) ? 0 : -1;
      b.toggleAttribute('data-focus', b.tabIndex === 0);
      if (q.typ === 'rating') b.classList.toggle('plna', vybrany !== -1 && i <= vybrany);
    });
  };
  const vyber = (i, zdroj) => {
    api.nastav(polozky[i].hodnota, zdroj);
    refresh();
    if (zdroj !== 'mys') buttons[i].focus();
  };
  buttons.forEach((b, i) => {
    // detail 0 = klik z klávesnice (Enter / mezerník / .click() z písmena).
    b.addEventListener('click', e => vyber(i, e.detail === 0 ? 'klavesa' : 'mys'));
    if (q.typ === 'rating') {
      b.addEventListener('pointerenter', () => buttons.forEach((x, j) => x.classList.toggle('nahled', j <= i)));
      b.addEventListener('pointerleave', () => buttons.forEach(x => x.classList.remove('nahled')));
    }
    group.append(b);
  });
  sipkyRadia(buttons, vyber);
  refresh();

  if (q.typ === 'scale' || q.typ === 'rating') {
    const k = skalaOtazky(q);
    if (k.popisOd || k.popisDo) {
      const wrap = el('div', { class: `zv-skala-obal${q.typ === 'rating' ? ' zv-hvezdy-obal' : ''}` });
      const pop = el('div', { class: 'zv-popisky', 'aria-hidden': 'true' });
      pop.append(el('span', {}, k.popisOd ?? ''), el('span', {}, k.popisDo ?? ''));
      // Popisky krajních hodnot přečte čtečka jako popis skupiny.
      const sr = el('span', { class: 'sr-only', id: `${q.id}-popisky` }, [k.popisOd && `${k.od} = ${k.popisOd}`, k.popisDo && `${k.do} = ${k.popisDo}`].filter(Boolean).join(', '));
      group.setAttribute('aria-describedby', `${api.describedBy ?? ''} ${q.id}-popisky`.trim());
      // data-control zůstává na skupině (chyby se vkládají za ni → za obal).
      group.removeAttribute('data-control');
      wrap.setAttribute('data-control', '');
      wrap.append(group, pop, sr);
      wrap.refresh = refresh;
      return wrap;
    }
  }
  group.refresh = refresh;
  return group;
}

function textoveCislo(q, api) {
  const { t, L } = jazykFormulare(api.schema);
  const phone = q.typ === 'phone';
  const input = el('input', {
    id: api.inputId ?? q.id,
    name: q.id,
    type: phone ? 'tel' : 'text',
    inputmode: phone ? 'tel' : 'decimal',
    autocomplete: phone ? 'tel' : 'off',
    'data-control': '',
    'aria-describedby': api.describedBy,
    enterkeyhint: api.enterHint,
    class: phone ? 'zv-telefon' : 'zv-cislo-pole',
  });
  input.maxLength = phone ? 24 : 20;
  if (q.povinna) input.required = true;
  const r = q.cislo_rozsah;
  const priklad = r?.min !== undefined && r.min > 0 ? String(r.min) : '0';
  input.placeholder = q.placeholder ?? (phone ? L('+420 777 123 456', '+44 20 7946 0000') : t(`Např. ${priklad}`, `Např. ${priklad}`, `E.g. ${priklad}`));
  const v = api.ziskej();
  input.value = typeof v === 'string' ? v : '';
  input.addEventListener('input', () => api.nastav(input.value, 'psani'));
  if (!phone && r && (r.min !== undefined || r.max !== undefined)) {
    // Rozsah jako drobná nápověda pod polem (součást popisu pole).
    const fmt = n => Number(n).toLocaleString(L('cs-CZ', 'en-GB'));
    const text = r.min !== undefined && r.max !== undefined
      ? L(`Od ${fmt(r.min)} do ${fmt(r.max)}`, `From ${fmt(r.min)} to ${fmt(r.max)}`)
      : r.min !== undefined ? L(`Nejméně ${fmt(r.min)}`, `At least ${fmt(r.min)}`) : L(`Nejvýš ${fmt(r.max)}`, `At most ${fmt(r.max)}`);
    const wrap = el('div', { class: 'zv-cislo-obal' });
    const note = el('small', { class: 'zv-rozsah', id: `${q.id}-rozsah` }, text);
    input.setAttribute('aria-describedby', `${api.describedBy ?? ''} ${q.id}-rozsah`.trim());
    wrap.append(input, note);
    return wrap;
  }
  return input;
}

/**
 * Výběr jako dlaždice (s obrázky / emoji) nebo seznam s písmeny (režim jedna
 * otázka). V režimu kroků se volá jen pro dlaždice — obyčejný výběr kreslí
 * form.js beze změny.
 */
export function ovladacVyberu(q, api) {
  const single = q.typ === 'single_choice';
  const jedna = api.rezim === 'jedna';
  const dlazdice = maObrazky(q);
  const options = q.moznosti ?? [];
  const group = skupina(q, api, dlazdice ? 'zv-dlazdice' : 'zv-seznam', single ? 'radiogroup' : 'group');
  if (dlazdice) group.style.setProperty('--sloupcu', String(Math.min(options.length, options.length === 4 ? 2 : 3)));

  const isChecked = id => {
    const v = api.ziskej();
    return single ? v === id : Array.isArray(v) && v.includes(id);
  };
  const buttons = options.map((m, i) => {
    const b = el('button', {
      type: 'button',
      class: `zv-moznost${dlazdice ? ' zv-dlazdice-polozka' : ''}`,
      role: single ? 'radio' : 'checkbox',
      'aria-checked': 'false',
      'data-klavesa': jedna ? pismeno(i) || undefined : undefined,
    });
    if (dlazdice) {
      const media = el('span', { class: 'zv-media', 'aria-hidden': 'true' });
      const emoji = () => media.replaceChildren(el('span', { class: 'zv-emoji' }, m.ikona || '✦'));
      if (typeof m.obrazek === 'string' && /^https:\/\/[^\s"'<>]+$/i.test(m.obrazek)) {
        const img = el('img', { src: m.obrazek, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
        img.addEventListener('error', emoji, { once: true });
        media.append(img);
      } else {
        emoji();
      }
      b.append(media);
    }
    const radek = el('span', { class: 'zv-radek' });
    if (jedna && pismeno(i)) radek.append(el('span', { class: 'zv-klavesa', 'aria-hidden': 'true' }, pismeno(i)));
    radek.append(el('span', { class: 'zv-text' }, m.label), svg(FAJFKA, 'zv-fajfka'));
    b.append(radek);
    return b;
  });

  const refresh = () => {
    const any = options.some(m => isChecked(m.id));
    buttons.forEach((b, i) => {
      const on = isChecked(options[i].id);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      if (single) b.tabIndex = on || (!any && i === 0) ? 0 : -1;
      b.removeAttribute('data-focus');
    });
    const target = (single ? buttons.find(b => b.tabIndex === 0) : buttons.find(b => b.getAttribute('aria-checked') === 'true')) ?? buttons[0];
    target?.setAttribute('data-focus', '');
  };
  const vyber = (i, zdroj) => {
    if (single) {
      api.nastav(options[i].id, zdroj);
    } else {
      const cur = Array.isArray(api.ziskej()) ? api.ziskej() : [];
      const id = options[i].id;
      api.nastav(cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id], zdroj);
    }
    refresh();
    if (zdroj !== 'mys') buttons[i].focus();
  };
  buttons.forEach((b, i) => {
    b.addEventListener('click', e => vyber(i, e.detail === 0 ? 'klavesa' : 'mys'));
    group.append(b);
  });
  if (single) sipkyRadia(buttons, vyber);
  refresh();
  group.refresh = refresh;
  return group;
}
