// Režim „jedna otázka na obrazovku" (23. 9. 2026 večer).
//
// Zapíná se jen u formuláře se `schema.rezim === "jedna_otazka"`. Řízení mu
// předá form.js (dynamic import) a dá mu `ctx` se sdílenými službami: stav
// odpovědí, kontrolu otázek, odeslání (stejný požadavek, klíč pokusu, past na
// roboty), rozepsané odpovědi, pozvánku, statistiku kroků, nahrávání souborů
// a náhled. Tenhle modul jen kreslí a ovládá obrazovky — nic neposílá sám.
//
// Průchod: úvod (stranka) → otázky po jedné (kroky = štítky sekcí) →
// přehled odpovědí (krok se `souhrn: true`) → odeslání → potvrzení.
// Podmínky viditelnosti vyhodnocuje ctx.isVisible (táž funkce jako kroky).
//
// Texty ze schématu jen přes textContent / createElement.
//
//   const ovladani = await spustit(ctx)  // → { reset() }
//
// ctx = { schema, values (getter), isPreview, t, L, isEn, isVisible(q|krok),
//   checkQuestion(q), answerText(q), setValue(q, v), renderFileField(q, labelId, hintId),
//   anyUploading(), odeslat(web) → { stav, … }, trackStep(akce, krokIndex),
//   bot (getter), setHelper(text), setStatus(text, trida), emailLine(stav),
//   dokonceno(), retry (getter), inviteText, draftNode, statusNode }

import * as S from './spolecne.js';

const pad = n => String(n).padStart(2, '0');
const el = S.el;

function withBreaks(node, text) {
  String(text).split('\n').forEach((line, i) => {
    if (i) node.append(el('br'));
    node.append(document.createTextNode(line));
  });
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function ikona(d, trida = 'jo-ikona') {
  const s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('focusable', 'false');
  s.setAttribute('class', trida);
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', d);
  s.append(p);
  return s;
}
const SIPKA = 'M5 12h13M13 6l6 6-6 6';
const FAJFKA = 'M5 12.5l4.2 4.2L19 7';

/** Typy, u kterých výběr sám posune dál (jako Typeform). */
const AUTO_DALSI = new Set(['single_choice', 'yes_no', 'rating', 'scale']);

export async function spustit(ctx) {
  const zde = u => new URL(u, import.meta.url).href;
  await Promise.all([S.nactiStyly(zde('./spolecne.css')), S.nactiStyly(zde('./jedna-otazka.css'))]);
  S.pouzijVzhled(document.documentElement, ctx.schema);
  return vytvor(ctx);
}

function vytvor(ctx) {
  const schema = ctx.schema;
  const { t, L } = ctx;
  const kroky = schema.kroky ?? [];
  const otazky = schema.otazky ?? [];
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const jemnyUkazatel = typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches;

  let aktualni = 'uvod';
  let chyby = {};
  let navratNaSouhrn = false;
  let odesilani = false;
  let hotovo = false;
  let autoTimer = 0;
  let posledniKrok = null;
  let cisloBuffer = '';
  let cisloCas = 0;

  // ── Kostra stránky ─────────────────────────────────────────────────────────
  document.body.classList.add('jo-rezim');
  const mainPuvodni = document.getElementById('main');
  if (mainPuvodni) mainPuvodni.hidden = true;
  const paticka = document.querySelector('body > footer');
  if (paticka) paticka.hidden = true;

  const postup = el('div', { class: 'jo-postup', role: 'progressbar', 'aria-label': L('Postup formulářem', 'Form progress'), 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' });
  const postupPlneni = el('div');
  postup.append(postupPlneni);
  document.body.prepend(postup);

  const root = el('div', { class: 'jo', id: 'jo' });
  const scena = el('div', { class: 'jo-scena', role: 'main' });
  const dole = el('div', { class: 'jo-dole' });
  const stav = el('div', { class: 'jo-stav' });
  if (ctx.statusNode) stav.append(ctx.statusNode);
  const lista = el('div', { class: 'jo-lista' });
  const vlevo = el('div', { class: 'jo-lista-vlevo' });
  const vpravo = el('div', { class: 'jo-lista-vpravo' });
  const ulozit = el('button', { type: 'button', class: 'jo-ulozit', 'aria-expanded': 'false', 'aria-controls': 'jo-panel' }, L('Uložit a dokončit později', 'Save and finish later'));
  const zpet = el('button', { type: 'button', class: 'secondary jo-zpet', 'aria-label': L('Zpět', 'Back') });
  zpet.append(el('span', { 'aria-hidden': 'true' }, '← '), el('span', { class: 'jo-zpet-text', 'aria-hidden': 'true' }, L('Zpět', 'Back')));
  const ok = el('button', { type: 'button', class: 'primary jo-ok' });
  vlevo.append(ulozit);
  vpravo.append(zpet, ok);
  lista.append(vlevo, vpravo);
  dole.append(stav, lista);

  // Rozepsané odpovědi: přesunutý #draft z index.html (obsluha zůstává ve form.js).
  const panel = el('div', { class: 'jo-panel', id: 'jo-panel', role: 'dialog', 'aria-label': L('Rozepsané odpovědi', 'Draft answers'), hidden: true });
  const panelTop = el('div', { class: 'jo-panel-top' });
  const zavrit = el('button', { type: 'button', class: 'jo-panel-zavrit', 'aria-label': L('Zavřít', 'Close') }, '×');
  panelTop.append(el('strong', {}, L('Rozepsané odpovědi', 'Draft answers')), zavrit);
  panel.append(panelTop);
  if (ctx.draftNode) panel.append(ctx.draftNode);

  // Past na roboty (skryté pole, člověk ho nevyplní).
  const hp = el('div', { class: 'hp', 'aria-hidden': 'true' });
  const hpInput = el('input', { type: 'text', id: 'jo-hp', name: 'web', tabindex: '-1', autocomplete: 'off', value: '' });
  hp.append(el('label', { for: 'jo-hp' }, L('Nevyplňujte', 'Leave this empty')), hpInput);

  root.append(scena, dole, panel, hp);
  if (mainPuvodni) mainPuvodni.after(root);
  else document.body.append(root);

  // ── Obrazovky ──────────────────────────────────────────────────────────────
  /** Pořadí: úvod, pak kroky (viditelné) — přehled na začátku kroku se souhrnem, otázky kroku. */
  function obrazovky() {
    const list = [{ klic: 'uvod', typ: 'uvod' }];
    kroky.forEach((k, ki) => {
      if (!ctx.isVisible(k)) return;
      if (k.souhrn) list.push({ klic: 'souhrn', typ: 'souhrn', krok: ki });
      for (const q of otazky) {
        if (q.krok === k.id && ctx.isVisible(q)) list.push({ klic: `q:${q.id}`, typ: 'otazka', q, krok: ki });
      }
    });
    return list;
  }
  const indexV = (list, klic) => Math.max(0, list.findIndex(o => o.klic === klic));
  const viditelneKroky = () => kroky.map((_, i) => i).filter(i => ctx.isVisible(kroky[i]));

  function zrusAuto() {
    clearTimeout(autoTimer);
    autoTimer = 0;
  }

  // ── Přechod mezi obrazovkami ───────────────────────────────────────────────
  function ukaz(nova, smer) {
    for (const x of scena.querySelectorAll('[data-odchazi]')) x.remove();
    const stara = scena.querySelector('.jo-obrazovka');
    const animovat = !!stara && typeof nova.animate === 'function' && smer !== 0;
    if (stara && animovat) {
      const r = stara.getBoundingClientRect();
      const s = scena.getBoundingClientRect();
      stara.dataset.odchazi = '1';
      stara.setAttribute('aria-hidden', 'true');
      stara.style.position = 'absolute';
      stara.style.top = `${r.top - s.top}px`;
      stara.style.left = `${r.left - s.left}px`;
      stara.style.width = `${r.width}px`;
      stara.style.pointerEvents = 'none';
    } else if (stara) {
      stara.remove();
    }
    scena.append(nova);
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (!animovat) return;
    // Posun + prolnutí 200 ms; při omezeném pohybu jen prolnutí.
    const posun = reduced ? 0 : 28 * smer;
    // Stará odejde rychleji (120 ms, cubic odchodu) a nová naběhne se
    // zpožděním, ať se dva nadpisy nepřekrývají uprostřed přechodu.
    const pryc = stara.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateY(${-posun / 2}px)` }], { duration: 120, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
    pryc.onfinish = () => stara.remove();
    pryc.oncancel = () => stara.remove();
    nova.animate([{ opacity: 0, transform: `translateY(${posun}px)` }, { opacity: 1, transform: 'none' }], { duration: 200, delay: 90, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' });
  }

  function zamer(sec) {
    // Na dotykových zařízeních nevyskakuje klávesnice sama — zaměří se nadpis.
    const cil = (jemnyUkazatel && (sec.querySelector('[data-focus]') ?? sec.querySelector('input:not([type=file]):not([tabindex="-1"]),textarea'))) || sec.querySelector('[data-nadpis]');
    requestAnimationFrame(() => cil?.focus({ preventScroll: true }));
  }

  function nastavPostup(pomer) {
    const pct = Math.round(Math.max(0, Math.min(1, pomer)) * 100);
    postupPlneni.style.width = `${Math.max(pct, pct > 0 ? 2 : 0)}%`;
    postup.setAttribute('aria-valuenow', String(pct));
  }

  function sledujKrok(novy, smer) {
    if (novy === undefined || novy === posledniKrok) return;
    if (smer > 0 && posledniKrok !== null) {
      ctx.trackStep('dokonceni', posledniKrok);
      ctx.bot?.flash('R02', 1200);
    }
    ctx.trackStep('zobrazeni', novy);
    posledniKrok = novy;
    const k = kroky[novy];
    ctx.setHelper?.(k?.tip || t(
      'Pište vlastními slovy, stačí stručně. Nepovinné otázky můžete přeskočit.',
      'Piš vlastními slovy, stačí stručně. Nepovinné otázky můžeš přeskočit.',
      'Answer in your own words — short is fine. You can skip optional questions.',
    ));
  }

  /** Vykreslí obrazovku podle klíče. smer: 1 dopředu, -1 zpět, 0 bez animace. */
  function prejdi(klic, smer) {
    zrusAuto();
    cisloBuffer = '';
    const list = obrazovky();
    const i = indexV(list, klic);
    const o = list[i];
    aktualni = o.klic;
    root.dataset.obrazovka = o.typ;
    let sec;
    if (o.typ === 'uvod') sec = obrazovkaUvod(list);
    else if (o.typ === 'souhrn') sec = obrazovkaSouhrn(o, list);
    else sec = obrazovkaOtazky(o, list);
    ukaz(sec, smer);
    sledujKrok(o.krok, smer);
    const pred = list.slice(0, i).filter(x => x.typ === 'otazka').length;
    const celkem = list.filter(x => x.typ === 'otazka').length;
    nastavPostup(o.typ === 'uvod' ? 0 : celkem ? pred / celkem : 1);
    aktualizujListu(list, i);
    if (o.typ === 'otazka' && chyby[o.q.id]) ukazChybu(o.q, chyby[o.q.id], { zatres: false });
    zamer(sec);
  }

  function aktualizujListu(list = obrazovky(), i = indexV(list, aktualni)) {
    const o = list[i];
    const posledni = i === list.length - 1;
    zpet.hidden = o.typ === 'uvod';
    ok.replaceChildren();
    if (odesilani) {
      ok.textContent = L('Odesílám…', 'Sending…');
    } else if (posledni) {
      ok.textContent = ctx.retry ? L('Zkusit znovu', 'Try again') : L('Odeslat odpovědi →', 'Send answers →');
    } else if (navratNaSouhrn && o.typ === 'otazka') {
      ok.textContent = L('Zpět na přehled', 'Back to review');
    } else if (o.typ === 'souhrn') {
      ok.append(document.createTextNode(`${L('Pokračovat', 'Continue')} `), ikona(SIPKA));
    } else {
      ok.append(document.createTextNode('OK '), ikona(FAJFKA));
    }
    ok.disabled = odesilani;
    if (odesilani) ok.setAttribute('aria-busy', 'true');
    else ok.removeAttribute('aria-busy');
    zpet.disabled = odesilani;
  }

  // ── Úvod ───────────────────────────────────────────────────────────────────
  function obrazovkaUvod(list) {
    const st = schema.stranka ?? {};
    const sec = el('section', { class: 'jo-obrazovka jo-uvod', 'data-klic': 'uvod', 'aria-labelledby': 'jo-nadpis' });
    if (st.nadtitulek) sec.append(el('p', { class: 'jo-nadtitulek' }, st.nadtitulek));
    const h1 = el('h1', { class: 'jo-nadpis', id: 'jo-nadpis', tabindex: '-1', 'data-nadpis': '' });
    withBreaks(h1, st.nadpis ?? schema.nazev ?? '');
    if (st.nadpisZvyrazneni) h1.append(document.createTextNode(' '), el('span', {}, st.nadpisZvyrazneni));
    sec.append(h1);
    if (st.uvod) sec.append(withBreaks(el('p', { class: 'jo-uvod-text' }), st.uvod));
    if (st.doplnek) sec.append(el('p', { class: 'jo-doplnek' }, st.doplnek));
    if (st.poznamka || st.poznamkaSilna) {
      const box = el('div', { class: 'jo-poznamka' });
      const p = el('p');
      if (st.poznamka) withBreaks(p, st.poznamka);
      if (st.poznamka && st.poznamkaSilna) p.append(el('br'));
      if (st.poznamkaSilna) p.append(el('strong', {}, st.poznamkaSilna));
      box.append(el('img', { src: new URL('./assets/jiskra.svg', import.meta.url).href, width: '32', height: '32', alt: '' }), p);
      sec.append(box);
    }
    if (ctx.inviteText) sec.append(el('p', { class: 'invite-banner jo-pozvanka' }, ctx.inviteText));
    const start = el('div', { class: 'jo-start' });
    const b = el('button', { type: 'button', class: 'primary jo-zacit', 'data-focus': '' });
    b.append(document.createTextNode(`${L('Začít', 'Start')} `), ikona(SIPKA));
    b.addEventListener('click', () => dalsi());
    start.append(b, el('span', { class: 'jo-enter', 'aria-hidden': 'true' }, t('nebo stiskněte Enter ↵', 'nebo stiskni Enter ↵', 'or press Enter ↵')));
    sec.append(start);
    const pocet = list.filter(o => o.typ === 'otazka').length;
    if (pocet) sec.append(el('p', { class: 'jo-meta' }, S.pocetOtazek(schema, pocet)));
    if (st.coDal?.shrnuti) {
      const d = el('details', { class: 'jo-codal' });
      d.append(el('summary', {}, st.coDal.shrnuti));
      for (const odst of st.coDal.odstavce ?? []) d.append(el('p', {}, odst));
      sec.append(d);
    }
    return sec;
  }

  // ── Otázka ─────────────────────────────────────────────────────────────────
  function stitekSekce(o, list, i) {
    const krok = kroky[o.krok];
    if (!krok) return [];
    const out = [];
    const vk = viditelneKroky();
    const s = el('p', { class: 'jo-sekce' });
    s.append(el('span', { class: 'jo-sekce-cislo' }, pad(vk.indexOf(o.krok) + 1)), el('span', {}, krok.nazev));
    out.push(s);
    const prvni = list[i - 1]?.krok !== o.krok;
    if (prvni && krok.uvod && o.typ === 'otazka') out.push(el('p', { class: 'jo-sekce-uvod' }, krok.uvod));
    return out;
  }

  function napovedaKlaves(q) {
    if (!jemnyUkazatel) return '';
    if (q.typ === 'long_text') return t('Shift + Enter = nový řádek · Enter = další', 'Shift + Enter = nový řádek · Enter = další', 'Shift + Enter = new line · Enter = next');
    if (q.typ === 'single_choice' || q.typ === 'multi_choice') {
      const n = Math.min(26, q.moznosti?.length ?? 0);
      const rozsah = n > 1 ? `A–${S.pismeno(n - 1)}` : 'A';
      return q.typ === 'multi_choice'
        ? t(`Klávesy ${rozsah} · můžete vybrat víc možností · Enter = další`, `Klávesy ${rozsah} · můžeš vybrat víc možností · Enter = další`, `Keys ${rozsah} · choose as many as you like · Enter = next`)
        : L(`Klávesy ${rozsah} · Enter = další`, `Keys ${rozsah} · Enter = next`);
    }
    if (q.typ === 'yes_no') return schema.jazyk === 'en' ? 'Keys Y / N · Enter = next' : 'Klávesy A / N · Enter = další';
    if (q.typ === 'rating' || q.typ === 'scale') {
      const k = S.skalaOtazky(q);
      return L(`Čísla ${k.od}–${k.do} · Enter = další`, `Numbers ${k.od}–${k.do} · Enter = next`);
    }
    if (q.typ === 'file') return '';
    return L('Enter ↵ = další', 'Enter ↵ = next');
  }

  function obrazovkaOtazky(o, list) {
    const q = o.q;
    const i = list.indexOf(o);
    const cislo = list.slice(0, i + 1).filter(x => x.typ === 'otazka').length;
    const celkem = list.filter(x => x.typ === 'otazka').length;
    const sec = el('section', { class: 'jo-obrazovka jo-otazka', 'data-klic': o.klic, 'aria-labelledby': `jo-${q.id}-label` });
    sec.append(...stitekSekce(o, list, i));

    const box = el('div', { class: 'field jo-pole', 'data-q': q.id });
    const labelId = `jo-${q.id}-label`;
    const hintId = `jo-${q.id}-hint`;
    const inputId = `jo-${q.id}`;
    const skupina = S.jeVyber(q) || S.jeSkupina(q) || q.typ === 'file';

    const h = el('h2', { class: 'jo-label', id: labelId, tabindex: '-1', 'data-nadpis': '' });
    const c = el('span', { class: 'jo-cislo' });
    c.append(el('span', { class: 'sr-only' }, L(`Otázka ${cislo} z ${celkem}: `, `Question ${cislo} of ${celkem}: `)), el('span', { 'aria-hidden': 'true' }, pad(cislo)), ikona(SIPKA, 'jo-cislo-sipka'));
    const volitelne = q.povinna ? null : el('span', { class: 'optional' }, L('volitelné', 'optional'));
    if (skupina) {
      h.append(c, document.createTextNode(q.label));
      if (volitelne) h.append(volitelne);
    } else {
      const lab = el('label', { for: inputId }, q.label);
      if (volitelne) lab.append(volitelne);
      h.append(c, lab);
    }
    box.append(h);
    if (q.napoveda) box.append(withBreaks(el('p', { class: 'jo-napoveda', id: hintId }), q.napoveda));
    const describedBy = q.napoveda ? hintId : undefined;

    const api = {
      schema,
      rezim: 'jedna',
      labelId,
      describedBy,
      inputId,
      enterHint: 'next',
      ziskej: () => ctx.values[q.id],
      nastav: (v, zdroj) => {
        ctx.setValue(q, v);
        skryjChybu(q);
        if ((zdroj === 'mys' || zdroj === 'klavesa') && AUTO_DALSI.has(q.typ)) naplanujDalsi(q, v, zdroj);
        else zrusAuto();
      },
    };

    let control;
    if (q.typ === 'file') {
      control = ctx.renderFileField(q, labelId, describedBy);
      // Po výběru / přetažení souboru zmizí chyba „přidejte soubor".
      const poSouboru = () => setTimeout(() => { if (!ctx.checkQuestion(q)) skryjChybu(q); }, 0);
      control.addEventListener('change', poSouboru);
      control.addEventListener('drop', poSouboru);
    }
    else if (S.jeNovyTyp(q)) control = S.ovladac(q, api);
    else if (S.jeVyber(q)) control = S.ovladacVyberu(q, api);
    else control = textovePole(q, api);
    box.append(control);
    box.append(el('p', { class: 'jo-chyba', id: `jo-${q.id}-chyba`, role: 'alert', hidden: true }));
    const tip = napovedaKlaves(q);
    if (tip) box.append(el('p', { class: 'jo-klavesy', 'aria-hidden': 'true' }, tip));
    sec.append(box);
    return sec;
  }

  function textovePole(q, api) {
    const isLong = q.typ === 'long_text';
    const wrap = el('div', { class: 'jo-text' });
    const input = el(isLong ? 'textarea' : 'input', {
      id: api.inputId,
      name: q.id,
      class: 'jo-vstup',
      'data-control': '',
      'aria-describedby': api.describedBy,
    });
    if (!isLong) {
      input.type = { short_text: 'text', email: 'email', url: 'url', date: 'date' }[q.typ] ?? 'text';
      input.setAttribute('enterkeyhint', 'next');
    } else {
      input.rows = 3;
    }
    const defaults = {
      long_text: t('Vaše odpověď…', 'Tvoje odpověď…', 'Your answer…'),
      short_text: t('Vaše odpověď…', 'Tvoje odpověď…', 'Your answer…'),
      email: t('vas@email.cz', 'tvuj@email.cz', 'you@email.com'),
      url: 'https://…',
    };
    const placeholder = q.placeholder ?? defaults[q.typ];
    if (placeholder && q.typ !== 'date') input.placeholder = placeholder;
    if (q.typ === 'email') {
      input.autocomplete = 'email';
      input.inputMode = 'email';
      input.setAttribute('autocapitalize', 'off');
      input.spellcheck = false;
    } else if (q.typ === 'url') {
      input.autocomplete = 'url';
      input.inputMode = 'url';
      input.setAttribute('autocapitalize', 'off');
      input.spellcheck = false;
    } else if (q.role === 'respondent_name') {
      input.autocomplete = 'name';
    } else if (q.typ === 'short_text') {
      input.autocomplete = 'off';
    }
    if (q.povinna) input.required = true;
    input.maxLength = { long_text: 5000, short_text: 500, email: 254, url: 2000 }[q.typ] ?? 5000;
    const cur = api.ziskej();
    input.value = typeof cur === 'string' ? cur : '';

    const grow = () => {
      if (!isLong) return;
      input.style.height = 'auto';
      input.style.height = `${Math.min(input.scrollHeight + 2, 420)}px`;
    };
    const chipTexts = [...(q.navrhy ?? [])];
    const doporuceni = L('Nechám si doporučit.', "I'd like a recommendation.");
    if (q.doporuceni && !chipTexts.includes(doporuceni)) chipTexts.push(doporuceni);
    const row = chipTexts.length && (q.typ === 'long_text' || q.typ === 'short_text') ? el('div', { class: 'chips jo-chips' }) : null;
    const sync = () => row?.querySelectorAll('.chip').forEach(b => b.setAttribute('aria-pressed', b.textContent === input.value ? 'true' : 'false'));
    input.addEventListener('input', () => {
      api.nastav(input.value, 'psani');
      sync();
      grow();
    });
    wrap.append(input);
    if (row) {
      for (const text of chipTexts) {
        const b = el('button', { type: 'button', class: 'chip', 'aria-pressed': 'false' }, text);
        b.addEventListener('click', () => {
          input.value = text;
          api.nastav(text, 'psani');
          sync();
          grow();
          input.focus();
        });
        row.append(b);
      }
      sync();
      wrap.append(row);
    }
    requestAnimationFrame(grow);
    return wrap;
  }

  function naplanujDalsi(q, v, zdroj) {
    zrusAuto();
    const klic = aktualni;
    // U škály do 10 počkáme po klávese „1" déle — může přijít „0" (= 10).
    const k = q.typ === 'rating' || q.typ === 'scale' ? S.skalaOtazky(q) : null;
    const delka = zdroj === 'klavesa' && k && v === '1' && k.do >= 10 ? 900 : 420;
    autoTimer = setTimeout(() => {
      if (aktualni === klic && !odesilani && !hotovo) dalsi();
    }, delka);
  }

  // ── Chyby ──────────────────────────────────────────────────────────────────
  function poleOtazky(q) {
    return scena.querySelector(`.jo-obrazovka:not([data-odchazi]) .field[data-q="${CSS.escape(q.id)}"]`);
  }

  function ukazChybu(q, msg, { zatres = true } = {}) {
    const box = poleOtazky(q);
    if (!box) return;
    const p = box.querySelector('.jo-chyba');
    box.classList.add('error');
    const control = box.querySelector('[data-control]');
    control?.setAttribute('aria-invalid', 'true');
    if (control && p) {
      const d = (control.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
      if (!d.includes(p.id)) control.setAttribute('aria-describedby', [...d, p.id].join(' '));
    }
    if (p) {
      p.hidden = false;
      p.textContent = msg;
    }
    if (zatres && !reduced && box.animate) {
      box.animate([{ transform: 'none' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(-3px)' }, { transform: 'none' }], { duration: 320, easing: 'ease-out' });
    }
  }

  function skryjChybu(q) {
    if (!chyby[q.id]) return;
    delete chyby[q.id];
    const box = poleOtazky(q);
    if (!box) return;
    box.classList.remove('error');
    const p = box.querySelector('.jo-chyba');
    if (p) {
      p.hidden = true;
      p.textContent = '';
    }
    const control = box.querySelector('[data-control]');
    control?.removeAttribute('aria-invalid');
    if (control && p) {
      const d = (control.getAttribute('aria-describedby') ?? '').split(' ').filter(x => x && x !== p.id).join(' ');
      if (d) control.setAttribute('aria-describedby', d);
      else control.removeAttribute('aria-describedby');
    }
  }

  // ── Přehled odpovědí ───────────────────────────────────────────────────────
  function obrazovkaSouhrn(o, list) {
    const i = list.indexOf(o);
    const sec = el('section', { class: 'jo-obrazovka jo-souhrn', 'data-klic': 'souhrn', 'aria-labelledby': 'jo-souhrn-nadpis' });
    sec.append(...stitekSekce(o, list, i));
    sec.append(el('h2', { class: 'jo-label', id: 'jo-souhrn-nadpis', tabindex: '-1', 'data-nadpis': '' }, t('Vaše odpovědi', 'Tvoje odpovědi', 'Your answers')));
    const krok = kroky[o.krok];
    if (krok?.uvod) sec.append(el('p', { class: 'jo-sekce-uvod' }, krok.uvod));
    const karta = schema.stranka?.souhrnKarta;
    if (karta?.nadpis || karta?.odstavce?.length) {
      const c = el('div', { class: 'review-card' });
      if (karta.nadpis) c.append(el('h3', {}, karta.nadpis));
      for (const odst of karta.odstavce ?? []) c.append(el('p', {}, odst));
      sec.append(c);
    }
    const ol = el('ol', { class: 'jo-prehled' });
    const drivejsi = list.filter(x => x.typ === 'otazka' && x.krok < o.krok);
    drivejsi.forEach((x, n) => {
      const li = el('li');
      const text = el('div', { class: 'jo-prehled-text' });
      text.append(el('strong', {}, x.q.label), el('p', {}, ctx.answerText(x.q) || t('Necháme k doplnění.', 'Doplníme spolu.', "We'll complete this together.")));
      const edit = el('button', { type: 'button', class: 'jo-upravit', 'aria-label': `${L('Upravit odpověď', 'Edit answer')}: ${x.q.label}` }, L('Upravit', 'Edit'));
      edit.addEventListener('click', () => {
        navratNaSouhrn = true;
        prejdi(x.klic, -1);
      });
      li.append(el('span', { class: 'jo-prehled-cislo', 'aria-hidden': 'true' }, pad(n + 1)), text, edit);
      ol.append(li);
    });
    sec.append(ol);
    return sec;
  }

  // ── Navigace ───────────────────────────────────────────────────────────────
  function dalsi() {
    zrusAuto();
    if (odesilani || hotovo) return;
    const list = obrazovky();
    const i = indexV(list, aktualni);
    const o = list[i];
    if (o.typ === 'otazka') {
      const msg = ctx.checkQuestion(o.q);
      if (msg) {
        chyby[o.q.id] = msg;
        ukazChybu(o.q, msg);
        ctx.bot?.react('chyba');
        return;
      }
      if (navratNaSouhrn) {
        navratNaSouhrn = false;
        const j = list.findIndex(x => x.klic === 'souhrn');
        if (j > i) {
          prejdi('souhrn', 1);
          return;
        }
      }
    }
    if (i >= list.length - 1) {
      odeslat();
      return;
    }
    prejdi(list[i + 1].klic, 1);
  }

  function predchozi() {
    zrusAuto();
    if (odesilani || hotovo) return;
    const list = obrazovky();
    const i = indexV(list, aktualni);
    if (i <= 0) return;
    prejdi(list[i - 1].klic, -1);
  }

  async function odeslat() {
    if (odesilani || hotovo) return;
    if (ctx.anyUploading()) {
      ctx.setStatus(t('Počkejte prosím, až se soubory nahrají.', 'Počkej prosím, až se soubory nahrají.', 'Please wait until your files finish uploading.'), 'status-error');
      return;
    }
    const list = obrazovky();
    for (const o of list) {
      if (o.typ !== 'otazka') continue;
      const msg = ctx.checkQuestion(o.q);
      if (msg) {
        chyby[o.q.id] = msg;
        prejdi(o.klic, -1);
        ctx.bot?.react('chyba');
        return;
      }
    }
    odesilani = true;
    ctx.setStatus('');
    aktualizujListu(list);
    const r = await ctx.odeslat(hpInput.value);
    odesilani = false;
    if (r.stav === 'ok' || r.stav === 'nahled') {
      if (r.stav === 'ok' && posledniKrok !== null) ctx.trackStep('dokonceni', posledniKrok);
      ukazHotovo(r);
      return;
    }
    if (r.stav === 'chyby') {
      chyby = { ...r.chyby };
      const prvni = obrazovky().find(o => o.typ === 'otazka' && chyby[o.q.id]);
      if (prvni) prejdi(prvni.klic, -1);
      else aktualizujListu();
    } else {
      aktualizujListu();
    }
    ctx.setStatus(r.text, 'status-error');
    ctx.bot?.react('chyba');
  }

  // ── Potvrzení ──────────────────────────────────────────────────────────────
  function ukazHotovo(r) {
    hotovo = true;
    zrusAuto();
    panelOtevrit(false);
    root.dataset.obrazovka = 'hotovo';
    const p = schema.potvrzeni ?? {};
    const sec = el('section', { class: 'jo-obrazovka jo-hotovo', 'aria-labelledby': 'jo-hotovo-nadpis' });
    sec.append(el('img', { class: 'jo-jiskra', src: new URL('./assets/jiskra.svg', import.meta.url).href, width: '56', height: '56', alt: '' }));
    sec.append(el('h2', { class: 'jo-label', id: 'jo-hotovo-nadpis', tabindex: '-1', 'data-nadpis': '' }, p.nadpis || t('Děkujeme, odpovědi máme.', 'Díky, odpovědi máme.', 'Thank you, we have your answers.')));
    if (p.text) sec.append(el('p', { class: 'jo-hotovo-text' }, p.text));
    if (r.stav === 'ok') {
      const line = ctx.emailLine(r.potvrzeni);
      if (line) sec.append(el('p', { class: 'email-line' }, line));
    }
    if (Array.isArray(p.dalsiKroky) && p.dalsiKroky.length) {
      sec.append(el('h3', {}, L('Co bude následovat', 'What happens next')));
      const ol = el('ol', { class: 'jo-dalsi-kroky' });
      p.dalsiKroky.forEach((k, n) => {
        const li = el('li');
        li.append(el('span', { class: 'jo-prehled-cislo', 'aria-hidden': 'true' }, pad(n + 1)), el('span', {}, k));
        ol.append(li);
      });
      sec.append(ol);
    }
    if (r.stav === 'nahled') {
      const note = el('div', { class: 'preview-message jo-nahled' });
      note.append(el('p', {}, L('Náhled je dokončený. Odpovědi se v náhledu neodesílají.', "Preview complete. Answers aren't sent in preview.")));
      const znovu = el('button', { type: 'button', class: 'secondary' }, L('Projít znovu', 'Go through again'));
      znovu.addEventListener('click', () => reset());
      note.append(znovu);
      sec.append(note);
    }
    ukaz(sec, 1);
    nastavPostup(1);
    if (r.stav === 'ok') ctx.dokonceno();
    ctx.bot?.react('uspech');
    requestAnimationFrame(() => sec.querySelector('[data-nadpis]')?.focus({ preventScroll: true }));
  }

  function reset() {
    zrusAuto();
    chyby = {};
    navratNaSouhrn = false;
    hotovo = false;
    odesilani = false;
    posledniKrok = null;
    prejdi('uvod', 0);
  }

  // ── Panel rozepsaných odpovědí ─────────────────────────────────────────────
  function panelOtevrit(open) {
    panel.hidden = !open;
    ulozit.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  ulozit.addEventListener('click', () => {
    const open = panel.hidden;
    panelOtevrit(open);
    if (!open) return;
    // Jedno kliknutí = uložit (tlačítko #save-later obsluhuje form.js).
    ctx.draftNode?.querySelector('#save-later')?.click();
    (panel.querySelector('#saved-link') ?? zavrit).focus({ preventScroll: true });
  });
  zavrit.addEventListener('click', () => {
    panelOtevrit(false);
    ulozit.focus();
  });

  zpet.addEventListener('click', predchozi);
  ok.addEventListener('click', () => dalsi());

  // ── Klávesnice ─────────────────────────────────────────────────────────────
  document.addEventListener('keydown', e => {
    if (e.defaultPrevented || e.isComposing || e.altKey) return;
    if (e.key === 'Escape' && !panel.hidden) {
      panelOtevrit(false);
      ulozit.focus();
      return;
    }
    if (hotovo || odesilani) return;
    const tgt = e.target instanceof Element ? e.target : null;
    if (tgt && (panel.contains(tgt) || tgt.closest('#helper, #bot'))) return;
    if (tgt && !root.contains(tgt) && tgt !== document.body && tgt !== document.documentElement) return;
    const tag = tgt?.tagName ?? '';
    const vPoli = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!tgt?.isContentEditable;
    const naTlacitku = tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY';

    if (e.key === 'Enter') {
      // U více možností Enter = další (přepíná mezerník / písmeno / klik).
      if (naTlacitku && tgt.getAttribute('role') === 'checkbox' && root.contains(tgt)) {
        e.preventDefault();
        dalsi();
        return;
      }
      if (naTlacitku) return; // nativní klik (výběr možnosti, Zpět, OK…)
      if (tag === 'TEXTAREA') {
        if (e.shiftKey) return;
        // Na dotyku Enter v textu = nový řádek (další = tlačítko OK).
        if (!(e.metaKey || e.ctrlKey) && !jemnyUkazatel) return;
      }
      if (tag === 'INPUT' && tgt.type === 'file') return;
      e.preventDefault();
      dalsi();
      return;
    }
    if (vPoli || e.metaKey || e.ctrlKey) return;
    const veSkupine = !!tgt?.closest('[role=radiogroup], [role=group]');
    if ((e.key === 'ArrowDown' || e.key === 'PageDown') && !veSkupine) {
      e.preventDefault();
      dalsi();
      return;
    }
    if ((e.key === 'ArrowUp' || e.key === 'PageUp') && !veSkupine) {
      e.preventDefault();
      predchozi();
      return;
    }
    if (e.key.length !== 1) return;
    const sec = scena.querySelector('.jo-obrazovka:not([data-odchazi])');
    if (!sec || !aktualni.startsWith('q:')) return;
    // Čísla u hodnocení a škály (i dvoumístné „10").
    if (/^\d$/.test(e.key) && sec.querySelector('[data-hodnota]')) {
      const now = Date.now();
      let val = e.key;
      if (cisloBuffer && now - cisloCas < 900 && sec.querySelector(`[data-hodnota="${cisloBuffer}${e.key}"]`)) val = `${cisloBuffer}${e.key}`;
      cisloBuffer = val;
      cisloCas = now;
      const b = sec.querySelector(`[data-hodnota="${val}"]`);
      if (b) {
        e.preventDefault();
        b.click();
      }
      return;
    }
    // Písmena u výběru (A, B, C… / A-N u ano-ne).
    const k = e.key.toUpperCase();
    const b = [...sec.querySelectorAll('[data-klavesa]')].find(x => x.dataset.klavesa === k);
    if (b) {
      e.preventDefault();
      b.click();
    }
  });

  // Start
  ctx.setHelper?.(t(
    'Pište vlastními slovy, stačí stručně. Nepovinné otázky můžete přeskočit.',
    'Piš vlastními slovy, stačí stručně. Nepovinné otázky můžeš přeskočit.',
    'Answer in your own words — short is fine. You can skip optional questions.',
  ));
  prejdi('uvod', 0);
  ctx.bot?.react('ahoj');

  return { reset };
}
