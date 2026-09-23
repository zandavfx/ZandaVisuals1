// Veřejný formulář ZandaVisuals (23. 9. 2026).
//
// Jedna stránka pro všechny formuláře: /formular/<slug> na app.zandavisuals.com
// i na zandavisuals.com (Cloudflare Pages). Texty přicházejí výhradně ze
// schématu formuláře (runtime/lib/formulare/schema.ts) a vkládají se jen přes
// textContent / createElement — nikdy innerHTML s textem ze schématu.
//
// Vzhled je převzatý 1:1 ze schválené šablony
// klienti/book-therapy/vystupy/2026-09-23-formular/. Úspěch se ukazuje až po
// potvrzení serverem; při chybě zůstávají všechny odpovědi ve formuláři.

import { createZandaBot } from '/formular-app/assets/zanda-bot.js';

// ── Pomocníci ────────────────────────────────────────────────────────────────
const $ = sel => document.querySelector(sel);

function el(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    node.setAttribute(k, v === true ? '' : String(v));
  }
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

/** Text s \n → textové uzly oddělené <br> (bez innerHTML). */
function withBreaks(node, text) {
  String(text).split('\n').forEach((line, i) => {
    if (i) node.append(el('br'));
    node.append(document.createTextNode(line));
  });
  return node;
}

const pad = n => String(n).padStart(2, '0');

const storage = {
  get(area, key) {
    try { return window[area].getItem(key); } catch { return null; }
  },
  set(area, key, value) {
    try { window[area].setItem(key, value); return true; } catch { return false; }
  },
  remove(area, key) {
    try { window[area].removeItem(key); } catch { /* nedostupné úložiště */ }
  },
};

const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const openedAt = Date.now();

// ── Adresa a API ─────────────────────────────────────────────────────────────
const slugMatch = location.pathname.match(/^\/formular\/([a-z0-9_-]+)\/?$/);
const slug = slugMatch ? slugMatch[1] : null;
const previewId = (() => {
  const id = new URLSearchParams(location.search).get('nahled');
  return id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : null;
})();
const isPreview = previewId !== null;

const API = (() => {
  const meta = document.querySelector('meta[name="zanda-api"]')?.getAttribute('content')?.trim();
  if (meta) return meta.replace(/\/+$/, '');
  if (location.hostname === 'zandavisuals.com' || location.hostname === 'www.zandavisuals.com') {
    return 'https://app.zandavisuals.com';
  }
  return '';
})();

const formPath = slug ? `${API}/api/verejne/formulare/${encodeURIComponent(slug)}` : null;

/** fetch + JSON; vrací { ok, status, data } nebo { network: true }. */
async function request(url, options = {}) {
  let res;
  try {
    res = await fetch(url, { credentials: 'omit', cache: 'no-store', ...options });
  } catch {
    return { network: true, ok: false, status: 0, data: null };
  }
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  return { network: false, ok: res.ok, status: res.status, data };
}

function postJson(url, body) {
  return request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ── Stav ─────────────────────────────────────────────────────────────────────
const state = {
  schema: null,
  versionId: null,
  values: {},
  errors: {},
  step: 0,
  sending: false,
  retry: false,
  done: false,
  draftToken: null,
  memoryKey: null,
  savingDraft: false,
  clearArmed: false,
  stepSig: '',
  /** Soubory podle otázky: [{ key, id, name, size, progress, status, error, xhr }] */
  files: {},
  uploadToken: null,
  /** Token osobní pozvánky / žádosti o opravu (jen v paměti a v sessionStorage). */
  inviteToken: null,
};

let bot = null;
let clearTimer = 0;

// ── Rozšíření (23. 9. 2026 večer) ────────────────────────────────────────────
// Nové typy otázek, dlaždice s obrázky, vlastní vzhled a režim „jedna otázka"
// žijí v /formular-app/spolecne.js (+ jedna-otazka.js). Stahují se JEN když
// je formulář potřebuje — u formuláře bez nich (Book Therapy) zůstává `rozsireni`
// null a všechny větve níže se přeskočí, stránka je beze změny.
let rozsireni = null;
/** Řízení režimu jedna otázka (jen když ho formulář má). */
let joCtl = null;
const NEW_TYPES = ['yes_no', 'rating', 'scale', 'number', 'phone'];
const GROUP_TYPES = ['yes_no', 'rating', 'scale'];
function needsExtensions(schema) {
  if (schema.rezim === 'jedna_otazka' || schema.vzhled) return true;
  return (schema.otazky ?? []).some(q => NEW_TYPES.includes(q?.typ)
    || ((q?.typ === 'single_choice' || q?.typ === 'multi_choice') && (q.moznosti ?? []).some(m => m && (m.ikona || m.obrazek))));
}

const localKey = () => `zanda:form:${slug ?? `nahled-${previewId}`}:v1`;
const sessionKey = () => `zanda:form:${slug}:${state.versionId}:klic`;
const recoveryKey = () => `zanda:form:${slug}:obnova`;
const langKey = () => `zanda:form:${slug}:jazyk`;
const filesKey = () => `zanda:form:${slug}:soubory`;
const inviteKey = () => `zanda:form:${slug}:pozvanka`;
const statsKey = () => `zanda:form:${slug}:${state.versionId}:kroky`;

// ── Jazyk (23. 9. 2026) ──────────────────────────────────────────────────────
// Hlášky jsou česky, u schématu s `jazyk: "en"` anglicky. Dokud schéma
// nemáme (nenalezen, chyba sítě), rozhoduje ?lang=en v adrese nebo jazyk
// formuláře, který se na tomhle zařízení naposledy načetl.
let pageLang = (() => {
  const q = new URLSearchParams(location.search).get('lang');
  if (q === 'en' || q === 'cs') return q;
  return slug && storage.get('localStorage', langKey()) === 'en' ? 'en' : 'cs';
})();

const isEn = () => (state.schema ? state.schema.jazyk === 'en' : pageLang === 'en');
const vy = () => state.schema?.osloveni !== 'ty';
/** Česky podle oslovení (vy / ty), anglicky jedno znění (když je zadané). */
const t = (formal, informal, english) => (isEn() && english !== undefined ? english : vy() ? formal : informal);
/** Hláška bez oslovení: česky / anglicky. */
const L = (cs, en) => (isEn() ? en : cs);
const recommendText = () => L('Nechám si doporučit.', "I'd like a recommendation.");

const steps = () => state.schema.kroky;
const questions = () => state.schema.otazky;
const stepIndexOf = q => steps().findIndex(k => k.id === q.krok);
const questionsOfStep = i => questions().filter(q => q.krok === steps()[i]?.id);
const isChoice = q => q.typ === 'single_choice' || q.typ === 'multi_choice';
const isTextual = q => ['short_text', 'long_text', 'email', 'url', 'date'].includes(q.typ);

// ── Podmínky (23. 9. 2026) ───────────────────────────────────────────────────
// Kopie pravidla jeViditelna z runtime/lib/formulare/schema.ts — měnit vždy
// obě místa stejně. Otázka ve skrytém kroku je skrytá; podmínka na skrytou
// otázku se bere, jako by byla nevyplněná. Bez podmínek je vše vidět.
function isBlank(v) {
  if (Array.isArray(v)) return v.length === 0;
  return typeof v !== 'string' || v.trim() === '';
}

function conditionMet(p, v) {
  if (Array.isArray(p.je) && p.je.length > 0) {
    if (Array.isArray(v)) return v.some(x => typeof x === 'string' && p.je.includes(x));
    if (typeof v !== 'string') return false;
    const h = v.trim().toLowerCase();
    return p.je.some(x => x === v || String(x).trim().toLowerCase() === h);
  }
  if (p.vyplneno) return !isBlank(v);
  return true;
}

function isVisible(target, depth = 0) {
  if (depth > 92) return false; // pojistka proti cyklu v neplatném schématu
  if ('typ' in target && typeof target.krok === 'string') {
    const krok = steps().find(k => k.id === target.krok);
    if (krok && !isVisible(krok, depth + 1)) return false;
  }
  const p = target.podminka;
  if (!p || typeof p !== 'object') return true;
  const ref = questions().find(q => q.id === p.otazka);
  if (!ref || ref === target) return true;
  return conditionMet(p, isVisible(ref, depth + 1) ? state.values[ref.id] : undefined);
}

const hasConditions = () => steps().some(k => k.podminka) || questions().some(q => q.podminka);
const visibleSteps = () => steps().map((_, i) => i).filter(i => isVisible(steps()[i]));
const nextVisible = i => visibleSteps().find(j => j > i) ?? -1;
const prevVisible = i => visibleSteps().filter(j => j < i).pop() ?? -1;

// ── Hodnoty ──────────────────────────────────────────────────────────────────
/** Jen známá id a správné typy — ať ze serveru, úložiště, nebo obnovy. */
function sanitizeValues(input) {
  const out = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  for (const q of questions()) {
    const v = input[q.id];
    if (q.typ === 'file') continue;
    if (q.typ === 'multi_choice') {
      if (!Array.isArray(v)) continue;
      const allowed = new Set((q.moznosti ?? []).map(m => m.id));
      const picked = [...new Set(v.filter(x => typeof x === 'string' && allowed.has(x)))];
      if (picked.length) out[q.id] = picked;
    } else if (q.typ === 'single_choice') {
      if (typeof v === 'string' && (q.moznosti ?? []).some(m => m.id === v)) out[q.id] = v;
    } else if (typeof v === 'string') {
      out[q.id] = v;
    }
  }
  return out;
}

function applyDefaults() {
  for (const q of questions()) {
    if (q.vychozi === undefined || q.vychozi === null || q.vychozi === '' || q.id in state.values) continue;
    if (q.typ === 'multi_choice') {
      const parts = String(q.vychozi).split(',').map(s => s.trim());
      const picked = sanitizeValues({ [q.id]: parts })[q.id];
      if (picked) state.values[q.id] = picked;
    } else if (q.typ === 'single_choice') {
      const picked = sanitizeValues({ [q.id]: String(q.vychozi) })[q.id];
      if (picked) state.values[q.id] = picked;
    } else if (isTextual(q)) {
      state.values[q.id] = String(q.vychozi);
    }
  }
}

function isEmpty(v) {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);
}

/**
 * Odpovědi k odeslání — jen viditelné otázky (skryté server stejně zahodí).
 * Soubory (id nahraných souborů) jen při odeslání, ne do rozepsaných.
 */
function collectAnswers({ files = true } = {}) {
  const out = {};
  for (const q of questions()) {
    if ((q.typ === 'file' && (!files || isPreview)) || !isVisible(q)) continue;
    const v = state.values[q.id];
    if (isEmpty(v)) continue;
    out[q.id] = Array.isArray(v) ? [...v] : v;
  }
  return out;
}

function answerText(q) {
  const v = state.values[q.id];
  if (isEmpty(v)) return '';
  if (rozsireni && NEW_TYPES.includes(q.typ)) return rozsireni.textOdpovedi(state.schema, q, v);
  if (q.typ === 'single_choice') return q.moznosti?.find(m => m.id === v)?.label ?? String(v);
  if (q.typ === 'multi_choice') return v.map(id => q.moznosti?.find(m => m.id === id)?.label ?? id).join(', ');
  if (q.typ === 'file') return doneFiles(q).map(f => f.name).join(', ');
  if (q.typ === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const d = new Date(`${v}T12:00:00`);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString(L('cs-CZ', 'en-GB'));
  }
  return String(v);
}

function saveLocal() {
  if (!$('#remember').checked) return;
  const ok = storage.set('localStorage', localKey(), JSON.stringify({ values: state.values, version: 1, versionId: state.versionId }));
  if (!ok) setStatus(L('Uložení na zařízení není dostupné. Odpovědi zůstávají v otevřeném formuláři.', "Saving on this device isn't available. Your answers stay in the open form."));
}

function setValue(q, value) {
  state.values[q.id] = value;
  if (state.errors[q.id]) {
    delete state.errors[q.id];
    clearFieldError(q.id);
  }
  saveLocal();
  if (hasConditions()) refreshVisibility();
}

// ── Živé podmínky ────────────────────────────────────────────────────────────
/** Krátké prolnutí při ukázání / skrytí otázky (bez pohybu při reduced motion). */
function toggleField(box, show) {
  box.getAnimations?.().forEach(a => a.cancel());
  delete box.dataset.leaving;
  if (show) {
    box.hidden = false;
    if (!reducedMotion && box.animate) {
      box.animate([{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { duration: 180, easing: 'ease-out' });
    }
    return;
  }
  if (reducedMotion || !box.animate) {
    box.hidden = true;
    return;
  }
  box.dataset.leaving = '1';
  const a = box.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: 'ease-in' });
  a.onfinish = () => {
    if (!box.dataset.leaving) return;
    box.hidden = true;
    delete box.dataset.leaving;
  };
}

/** Po změně odpovědi: otázky aktuálního kroku, kroky v asidu, průběh a tlačítko. */
function refreshVisibility() {
  for (const q of questionsOfStep(state.step)) {
    const box = fieldBox(q.id);
    if (!box) continue;
    const show = isVisible(q);
    const shown = !box.hidden && !box.dataset.leaving;
    if (show === shown) continue;
    if (!show && state.errors[q.id]) {
      delete state.errors[q.id];
      clearFieldError(q.id);
    }
    toggleField(box, show);
  }
  const sig = visibleSteps().join(',');
  if (sig !== state.stepSig) {
    renderSteps();
    updateProgress();
    updateNextButton();
    // Aktuální krok se mohl stát posledním (nebo přestat být).
    const hint = nextVisible(state.step) === -1 ? 'send' : 'next';
    $('#fields').querySelectorAll('input[enterkeyhint]').forEach(i => i.setAttribute('enterkeyhint', hint));
  }
}

// ── Kontrola ─────────────────────────────────────────────────────────────────
function requiredMessage(q) {
  if (q.typ === 'email') return t('Doplňte platnou e-mailovou adresu.', 'Doplň platnou e-mailovou adresu.', 'Please enter a valid email address.');
  if (q.typ === 'single_choice') return t('Vyberte jednu možnost.', 'Vyber jednu možnost.', 'Please select one option.');
  if (q.typ === 'multi_choice') return t('Vyberte aspoň jednu možnost.', 'Vyber aspoň jednu možnost.', 'Please select at least one option.');
  if (q.typ === 'date') return t('Vyberte prosím datum.', 'Vyber prosím datum.', 'Please pick a date.');
  if (q.doporuceni) return t('Napište odpověď, nebo „nechám si doporučit“.', 'Napiš odpověď, nebo „nechám si doporučit“.', `Please write an answer, or choose “${recommendText()}”`);
  return t('Tuhle otázku prosím vyplňte.', 'Tuhle otázku prosím vyplň.', 'Please answer this question.');
}

const EMAIL_RE = /^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/;

function checkQuestion(q) {
  if (q.typ === 'file') {
    // Rozpracované nahrávání krok neblokuje; odeslání čeká (viz submit).
    const list = state.files[q.id] ?? [];
    const ok = list.some(f => f.status === 'done' || f.status === 'uploading');
    return q.povinna && !ok ? t('Přidejte prosím soubor.', 'Přidej prosím soubor.', 'Please add a file.') : null;
  }
  // Nové typy: stejné hlášky jako serverová kontrola (spolecne.js).
  if (rozsireni && NEW_TYPES.includes(q.typ)) return rozsireni.zkontrolujHodnotu(state.schema, q, state.values[q.id]);
  const v = state.values[q.id];
  if (isEmpty(v)) return q.povinna ? requiredMessage(q) : null;
  const text = typeof v === 'string' ? v.trim() : '';
  if (q.typ === 'email' && !EMAIL_RE.test(text)) return t('Doplňte platnou e-mailovou adresu.', 'Doplň platnou e-mailovou adresu.', 'Please enter a valid email address.');
  if (q.typ === 'url' && !/^https?:\/\/\S+$/i.test(text)) return L('Odkaz musí začínat http:// nebo https://.', 'The link must start with http:// or https://.');
  if (q.typ === 'date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) return L('Neplatné datum.', 'Invalid date.');
  }
  return null;
}

/** Zkontroluje krok (jen viditelné otázky); chyby vyznačí a zaměří první. */
function validateStep(i) {
  let first = null;
  for (const q of questionsOfStep(i)) {
    if (!isVisible(q)) continue;
    const msg = checkQuestion(q);
    if (msg) {
      state.errors[q.id] = msg;
      showFieldError(q.id, msg);
      first ??= q.id;
    }
  }
  if (first) {
    focusQuestion(first);
    bot?.react('chyba');
    return false;
  }
  return true;
}

/** Před odesláním: první krok s chybou (nebo -1). */
function firstInvalidStep() {
  let firstStep = -1;
  for (const q of questions()) {
    if (!isVisible(q)) continue;
    const msg = checkQuestion(q);
    if (msg) {
      state.errors[q.id] = msg;
      const s = stepIndexOf(q);
      if (firstStep === -1 || s < firstStep) firstStep = s;
    }
  }
  return firstStep;
}

// ── Chyby u polí ─────────────────────────────────────────────────────────────
function fieldBox(id) {
  return document.querySelector(`.field[data-q="${CSS.escape(id)}"]`);
}

function showFieldError(id, msg) {
  const box = fieldBox(id);
  if (!box) return;
  box.classList.add('error');
  const control = box.querySelector('[data-control]');
  control?.setAttribute('aria-invalid', 'true');
  let p = box.querySelector('.error-message');
  if (!p) {
    p = el('p', { class: 'error-message', id: `${id}-error` });
    control?.after(p);
    const described = control?.getAttribute('aria-describedby') ?? '';
    control?.setAttribute('aria-describedby', `${described} ${id}-error`.trim());
  }
  p.textContent = msg;
}

function clearFieldError(id) {
  const box = fieldBox(id);
  if (!box) return;
  box.classList.remove('error');
  const control = box.querySelector('[data-control]');
  control?.removeAttribute('aria-invalid');
  box.querySelector('.error-message')?.remove();
  if (control) {
    const described = (control.getAttribute('aria-describedby') ?? '').split(' ').filter(x => x && x !== `${id}-error`).join(' ');
    if (described) control.setAttribute('aria-describedby', described);
    else control.removeAttribute('aria-describedby');
  }
}

function focusQuestion(id) {
  const box = fieldBox(id);
  if (!box) return;
  const target = box.querySelector('[data-focus]') ?? box.querySelector('[data-control]');
  target?.focus({ preventScroll: false });
}

// ── Stav a zprávy ────────────────────────────────────────────────────────────
function setStatus(text, kind = '') {
  const s = $('#status');
  s.className = kind;
  s.textContent = text;
}

// ── Vykreslení stránky (aside, hlavička, patička) ────────────────────────────
function renderPage() {
  const st = state.schema.stranka ?? {};
  document.title = st.titulek || state.schema.nazev || L('Formulář · ZandaVisuals', 'Form · ZandaVisuals');

  if (st.proKoho) {
    $('#client-name').textContent = st.proKoho;
    $('#client').hidden = false;
  }
  if (st.nadtitulek) {
    $('#eyebrow').textContent = st.nadtitulek;
    $('#eyebrow').hidden = false;
  }
  const h1 = $('#title');
  h1.replaceChildren();
  withBreaks(h1, st.nadpis ?? state.schema.nazev ?? '');
  if (st.nadpisZvyrazneni) {
    h1.append(document.createTextNode(' '), el('span', {}, st.nadpisZvyrazneni));
  }
  h1.hidden = false;
  if (st.uvod) {
    withBreaks($('#intro'), st.uvod);
    $('#intro').hidden = false;
  }
  if (st.doplnek) {
    $('#muted').textContent = st.doplnek;
    $('#muted').hidden = false;
  }
  if (st.poznamka || st.poznamkaSilna) {
    const p = $('#note');
    if (st.poznamka) withBreaks(p, st.poznamka);
    if (st.poznamka && st.poznamkaSilna) p.append(el('br'));
    if (st.poznamkaSilna) p.append(el('strong', {}, st.poznamkaSilna));
    $('#side-note').hidden = false;
  }
  if (st.coDal?.shrnuti) {
    $('#next-summary').textContent = st.coDal.shrnuti;
    const body = $('#next-body');
    for (const odst of st.coDal.odstavce ?? []) body.append(el('p', {}, odst));
    $('#next-info').hidden = false;
  }
  if (Array.isArray(st.paticka)) {
    $('#foot-left').textContent = st.paticka[0] ?? '';
    $('#foot-right').textContent = st.paticka[1] ?? '';
  }
  $('#aside-skeleton').hidden = true;
}

// ── Vykreslení otázky ────────────────────────────────────────────────────────
function renderQuestion(q, isLastStep) {
  const box = el('div', { class: 'field', 'data-q': q.id });
  if (q.cislo) box.append(el('span', { class: 'number' }, `${L('OTÁZKA', 'QUESTION')} ${pad(q.cislo)}`));

  const labelId = `${q.id}-label`;
  const hintId = `${q.id}-hint`;
  const choice = isChoice(q);
  // Výběr i soubory jsou skupina — popisek je span (aria-labelledby), ne <label for>.
  // (Ano / ne, hvězdičky a škála jsou taky skupina tlačítek.)
  const label = choice || q.typ === 'file' || GROUP_TYPES.includes(q.typ)
    ? el('span', { class: 'field-label', id: labelId }, q.label)
    : el('label', { for: q.id, id: labelId }, q.label);
  if (!q.povinna) label.append(el('span', { class: 'optional' }, L('volitelné', 'optional')));
  box.append(label);
  if (q.napoveda) box.append(el('p', { class: 'hint', id: hintId }, q.napoveda));
  const describedBy = q.napoveda ? hintId : undefined;

  if (q.typ === 'file') {
    box.append(renderFileField(q, labelId, describedBy));
    return box;
  }

  if (rozsireni && NEW_TYPES.includes(q.typ)) {
    box.append(rozsireni.ovladac(q, controlApi(q, labelId, describedBy, isLastStep)));
    return box;
  }

  if (choice) {
    // Možnosti s obrázkem / emoji = dlaždice (spolecne.js); jinak čipy jako dřív.
    box.append(rozsireni?.maObrazky(q) ? rozsireni.ovladacVyberu(q, controlApi(q, labelId, describedBy, isLastStep)) : renderChoice(q, labelId, describedBy));
    return box;
  }

  // Textové typy
  const isLong = q.typ === 'long_text';
  const input = el(isLong ? 'textarea' : 'input', {
    id: q.id,
    name: q.id,
    'data-control': '',
    'aria-describedby': describedBy,
  });
  if (!isLong) {
    input.type = { short_text: 'text', email: 'email', url: 'url', date: 'date' }[q.typ] ?? 'text';
    input.setAttribute('enterkeyhint', isLastStep ? 'send' : 'next');
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
  const current = state.values[q.id];
  input.value = typeof current === 'string' ? current : '';
  input.addEventListener('input', () => {
    setValue(q, input.value);
    syncSuggestionChips(box, input.value);
  });

  const chipTexts = [...(q.navrhy ?? [])];
  if (q.doporuceni && !chipTexts.includes(recommendText())) chipTexts.push(recommendText());
  if (chipTexts.length && (q.typ === 'long_text' || q.typ === 'short_text')) {
    const row = el('div', { class: 'chips' });
    for (const text of chipTexts) {
      const b = el('button', { type: 'button', class: 'chip', 'aria-pressed': input.value === text ? 'true' : 'false' }, text);
      b.addEventListener('click', () => {
        input.value = text;
        setValue(q, text);
        syncSuggestionChips(box, text);
        input.focus();
      });
      row.append(b);
    }
    box.append(row);
  }
  box.append(input);
  return box;
}

/** Rozhraní ovladačů ze spolecne.js pro režim kroků (hodnota přes setValue). */
function controlApi(q, labelId, describedBy, isLastStep) {
  return {
    schema: state.schema,
    rezim: 'kroky',
    labelId,
    describedBy,
    enterHint: isLastStep ? 'send' : 'next',
    ziskej: () => state.values[q.id],
    nastav: value => setValue(q, value),
  };
}

function syncSuggestionChips(box, value) {
  box.querySelectorAll('.chips .chip[aria-pressed]').forEach(b => {
    b.setAttribute('aria-pressed', b.textContent === value ? 'true' : 'false');
  });
}

/** single_choice = radiogroup (šipky), multi_choice = checkboxy. Obojí jako čipy. */
function renderChoice(q, labelId, describedBy) {
  const single = q.typ === 'single_choice';
  const group = el('div', {
    class: 'chips',
    role: single ? 'radiogroup' : 'group',
    'aria-labelledby': labelId,
    'aria-describedby': describedBy,
    'aria-required': single && q.povinna ? 'true' : undefined,
    'data-control': '',
  });
  const options = q.moznosti ?? [];
  const buttons = [];

  const isChecked = id => {
    const v = state.values[q.id];
    return single ? v === id : Array.isArray(v) && v.includes(id);
  };

  const refresh = () => {
    const anyChecked = options.some(m => isChecked(m.id));
    buttons.forEach((b, i) => {
      const checked = isChecked(options[i].id);
      b.setAttribute('aria-checked', checked ? 'true' : 'false');
      if (single) b.tabIndex = checked || (!anyChecked && i === 0) ? 0 : -1;
    });
    // Cíl zaměření při chybě / „Upravit odpověď".
    buttons.forEach(b => b.removeAttribute('data-focus'));
    const target = buttons.find(b => b.tabIndex === 0 && single) ?? buttons.find(b => b.getAttribute('aria-checked') === 'true') ?? buttons[0];
    target?.setAttribute('data-focus', '');
  };

  const selectSingle = i => {
    setValue(q, options[i].id);
    refresh();
    buttons[i].focus();
  };

  options.forEach((m, i) => {
    const b = el('button', { type: 'button', class: 'chip', role: single ? 'radio' : 'checkbox', 'aria-checked': 'false' }, m.label);
    b.addEventListener('click', () => {
      if (single) {
        selectSingle(i);
      } else {
        const cur = Array.isArray(state.values[q.id]) ? state.values[q.id] : [];
        const next = cur.includes(m.id) ? cur.filter(x => x !== m.id) : [...cur, m.id];
        setValue(q, next);
        refresh();
      }
    });
    if (single) {
      b.addEventListener('keydown', e => {
        const last = options.length - 1;
        let to = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') to = i === last ? 0 : i + 1;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') to = i === 0 ? last : i - 1;
        else if (e.key === 'Home') to = 0;
        else if (e.key === 'End') to = last;
        if (to === null) return;
        e.preventDefault();
        selectSingle(to);
      });
    }
    buttons.push(b);
    group.append(b);
  });
  refresh();
  return group;
}

// ── Soubory (23. 9. 2026) ────────────────────────────────────────────────────
// Soubor jde z prohlížeče rovnou do úložiště (podepsaný PUT), server jen
// podepisuje a ověřuje. Token nahrávání vzniká tady, jednou za relaci karty
// (sessionStorage), a server ho zná jen jako otisk. Odpověď otázky = id
// hotových souborů. Kontrola velikosti a typu je kopie pravidel z
// runtime/lib/formulare/soubory-pravidla.ts — měnit obě místa.
const hasFileQuestions = () => questions().some(q => q.typ === 'file');
const fileItems = q => state.files[q.id] ?? (state.files[q.id] = []);
const doneFiles = q => (state.files[q.id] ?? []).filter(f => f.status === 'done');
const anyUploading = () => !!state.schema && Object.values(state.files).some(list => list.some(f => f.status === 'uploading'));
let fileSeq = 0;

function newUploadToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function readFilesSession() {
  try {
    const d = JSON.parse(storage.get('sessionStorage', filesKey()) ?? 'null');
    return d && typeof d === 'object' ? d : null;
  } catch { return null; }
}

function uploadToken() {
  if (state.uploadToken) return state.uploadToken;
  const saved = readFilesSession();
  state.uploadToken = typeof saved?.token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(saved.token) ? saved.token : newUploadToken();
  persistFiles();
  return state.uploadToken;
}

/** Hotové soubory do sessionStorage — po obnovení stránky v téže kartě zůstanou. */
function persistFiles() {
  if (!slug || !state.uploadToken) return;
  const files = {};
  for (const [qid, list] of Object.entries(state.files)) {
    const done = list.filter(f => f.status === 'done' && f.id).map(f => ({ id: f.id, name: f.name, size: f.size }));
    if (done.length) files[qid] = done;
  }
  storage.set('sessionStorage', filesKey(), JSON.stringify({ token: state.uploadToken, files }));
}

function restoreFiles() {
  if (!slug || isPreview || !hasFileQuestions()) return;
  const saved = readFilesSession();
  if (!saved || typeof saved.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(saved.token)) return;
  state.uploadToken = saved.token;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  for (const q of questions()) {
    if (q.typ !== 'file') continue;
    const list = Array.isArray(saved.files?.[q.id]) ? saved.files[q.id] : [];
    const ok = list
      .filter(f => f && uuid.test(f.id) && typeof f.name === 'string' && Number.isFinite(f.size))
      .slice(0, q.soubor?.maxSouboru ?? 1);
    if (!ok.length) continue;
    state.files[q.id] = ok.map(f => ({ key: ++fileSeq, id: f.id, name: f.name, size: f.size, progress: 1, status: 'done', error: '' }));
    syncFileValue(q);
  }
}

function syncFileValue(q) {
  const ids = doneFiles(q).map(f => f.id);
  if (ids.length) state.values[q.id] = ids;
  else delete state.values[q.id];
  if (state.errors[q.id] && !checkQuestion(q)) {
    delete state.errors[q.id];
    clearFieldError(q.id);
  }
}

function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['kB', 'MB', 'GB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toLocaleString(L('cs-CZ', 'en-GB'), { maximumFractionDigits: v < 10 ? 1 : 0 })} ${units[i]}`;
}

const TYPE_BY_EXT = {
  mp4: 'video/mp4', m4v: 'video/x-m4v', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska', avi: 'video/x-msvideo',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif', avif: 'image/avif',
  mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac',
  pdf: 'application/pdf', zip: 'application/zip', txt: 'text/plain',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};
const extOf = name => (/\.([A-Za-z0-9]{1,10})$/.exec(String(name).trim())?.[1] ?? '').toLowerCase();

function fileType(file) {
  const tp = String(file.type ?? '').split(';')[0].trim().toLowerCase();
  if (tp && tp !== 'application/octet-stream') return tp;
  return TYPE_BY_EXT[extOf(file.name)] ?? 'application/octet-stream';
}

function typeAllowed(q, file) {
  const list = (q.soubor?.typy ?? []).map(x => String(x).trim().toLowerCase()).filter(Boolean);
  if (!list.length) return true;
  const tp = fileType(file);
  const ext = extOf(file.name);
  return list.some(x => (x.startsWith('.') ? ext !== '' && x === `.${ext}` : x.endsWith('/*') ? tp.startsWith(x.slice(0, -1)) : tp === x));
}

/** Kontrola před nahráním (server kontroluje znovu a přísněji). */
function fileProblem(q, file) {
  const maxMb = q.soubor?.maxMb ?? 0;
  if (!(file.size > 0)) return L('Soubor je prázdný.', 'The file is empty.');
  if (file.size > Math.min(500, maxMb) * 1024 * 1024) return L(`Soubor je moc velký (nejvýš ${maxMb} MB).`, `The file is too large (max ${maxMb} MB).`);
  if (!typeAllowed(q, file)) return L('Tenhle typ souboru sem nejde nahrát.', "This file type can't be uploaded here.");
  return null;
}

function typesLabel(q) {
  const names = {
    'image/*': L('obrázky', 'images'),
    'video/*': L('videa', 'videos'),
    'audio/*': L('zvuk', 'audio'),
  };
  return (q.soubor?.typy ?? [])
    .map(x => String(x).trim().toLowerCase())
    .filter(Boolean)
    .map(x => names[x] ?? (x.startsWith('.') ? x.slice(1).toUpperCase() : (x.split('/')[1] ?? x).toUpperCase()))
    .join(', ');
}

function limitsText(q) {
  const max = q.soubor?.maxSouboru ?? 1;
  const mb = q.soubor?.maxMb ?? 0;
  const count = isEn()
    ? (max === 1 ? `1 file up to ${mb} MB` : `Up to ${max} files, each up to ${mb} MB`)
    : (max === 1 ? `1 soubor do ${mb} MB` : `Nejvýš ${max} ${max < 5 ? 'soubory' : 'souborů'}, každý do ${mb} MB`);
  const types = typesLabel(q);
  return types ? `${count} · ${types}` : count;
}

const uploadFailedText = () => t(
  'Nahrání se nepodařilo — zkuste to prosím znovu, nebo pošlete odkaz.',
  'Nahrání se nepodařilo — zkus to prosím znovu, nebo pošli odkaz.',
  "The upload didn't work — please try again, or send a link instead.",
);

/** Hláška ze serveru; anglický formulář bez vlastního textu dostane obecnou. */
function uploadServerText(res) {
  if (res.network || res.status >= 500 || !res.data) return uploadFailedText();
  if ([413, 415, 422].includes(res.status) && res.data.chyba) return res.data.chyba;
  return serverText(res, uploadFailedText());
}

function announce(q, text) {
  const live = fieldBox(q.id)?.querySelector('.file-live');
  if (live) live.textContent = text;
}

function renderFileField(q, labelId, describedBy) {
  const max = q.soubor?.maxSouboru ?? 1;
  const wrap = el('div', { class: 'file-field', role: 'group', 'aria-labelledby': labelId, 'aria-describedby': describedBy, 'data-control': '' });
  const input = el('input', { type: 'file', hidden: true, tabindex: '-1', 'aria-hidden': 'true' });
  if (max > 1) input.multiple = true;
  const accept = (q.soubor?.typy ?? []).filter(x => typeof x === 'string' && x.trim()).join(',');
  if (accept) input.accept = accept;

  const drop = el('div', { class: 'file-drop' });
  const pick = el('button', { type: 'button', class: 'file-pick', 'data-focus': '' }, max > 1
    ? t('Vybrat soubory', 'Vybrat soubory', 'Choose files')
    : t('Vybrat soubor', 'Vybrat soubor', 'Choose a file'));
  const lead = el('p', { class: 'file-lead' }, t('Přetáhněte soubor sem, nebo', 'Přetáhni soubor sem, nebo', 'Drag a file here, or'));
  lead.append(document.createTextNode(' '), pick);
  drop.append(lead, el('small', { class: 'file-limits' }, limitsText(q)));

  const list = el('ul', { class: 'file-list' });
  const live = el('p', { class: 'file-live sr-only', role: 'status', 'aria-live': 'polite' });
  wrap.append(drop, input, list, live);

  pick.addEventListener('click', e => {
    e.stopPropagation();
    input.click();
  });
  drop.addEventListener('click', e => {
    if (e.target === drop || e.target.classList?.contains('file-lead') || e.target.classList?.contains('file-limits')) input.click();
  });
  input.addEventListener('change', () => {
    addFiles(q, [...(input.files ?? [])]);
    input.value = '';
  });
  drop.addEventListener('dragover', e => {
    if (![...(e.dataTransfer?.types ?? [])].includes('Files')) return;
    e.preventDefault();
    drop.classList.add('drag');
  });
  drop.addEventListener('dragleave', e => {
    if (!drop.contains(e.relatedTarget)) drop.classList.remove('drag');
  });
  drop.addEventListener('drop', e => {
    e.preventDefault();
    drop.classList.remove('drag');
    addFiles(q, [...(e.dataTransfer?.files ?? [])]);
  });

  fillFileList(q, list);
  return wrap;
}

function fillFileList(q, list) {
  list.replaceChildren();
  for (const f of state.files[q.id] ?? []) {
    const li = el('li', { class: `file-item ${f.status}` });
    const top = el('div', { class: 'file-row' });
    top.append(el('span', { class: 'file-name' }, f.name), el('span', { class: 'file-size' }, formatSize(f.size)));
    const remove = el('button', { type: 'button', class: 'file-remove', 'aria-label': `${L('Odebrat soubor', 'Remove file')} ${f.name}` }, L('Odebrat', 'Remove'));
    remove.addEventListener('click', () => removeFile(q, f));
    top.append(remove);
    li.append(top);
    if (f.status === 'uploading') {
      const pct = Math.round((f.progress ?? 0) * 100);
      const bar = el('div', { class: 'file-bar', role: 'progressbar', 'aria-label': `${L('Nahrávání', 'Uploading')} ${f.name}`, 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct) });
      const fill = el('div');
      fill.style.width = `${pct}%`;
      bar.append(fill);
      li.append(bar);
      f.bar = bar;
    } else {
      f.bar = null;
    }
    if (f.status === 'error' && f.error) li.append(el('p', { class: 'file-error' }, f.error));
    list.append(li);
  }
}

/** Po změně stavu souboru: seznam (když je otázka vidět), tlačítko a hodnota. */
function refreshFiles(q) {
  const list = fieldBox(q.id)?.querySelector('.file-list');
  if (list) fillFileList(q, list);
  syncFileValue(q);
  updateNextButton();
}

function setProgress(f, ratio) {
  f.progress = ratio;
  if (!f.bar?.isConnected) return;
  const pct = Math.round(ratio * 100);
  f.bar.setAttribute('aria-valuenow', String(pct));
  f.bar.firstChild.style.width = `${pct}%`;
}

function addFiles(q, files) {
  if (!files.length || state.done) return;
  const max = q.soubor?.maxSouboru ?? 1;
  const list = fileItems(q);
  // Chybné položky místo nezabírají — nahradí je nový výběr.
  state.files[q.id] = list.filter(f => f.status !== 'error');
  let free = max - state.files[q.id].length;
  const messages = [];
  for (const file of files) {
    if (free <= 0) {
      messages.push(isEn()
        ? `You can upload at most ${max} ${max === 1 ? 'file' : 'files'} here.`
        : `Sem jde nahrát nejvýš ${max} ${max === 1 ? 'soubor' : max < 5 ? 'soubory' : 'souborů'}.`);
      break;
    }
    const problem = fileProblem(q, file);
    if (problem) {
      state.files[q.id].push({ key: ++fileSeq, id: null, name: file.name, size: file.size, progress: 0, status: 'error', error: problem });
      continue;
    }
    free -= 1;
    const item = { key: ++fileSeq, id: null, name: file.name, size: file.size, progress: 0, status: 'uploading', error: '' };
    state.files[q.id].push(item);
    if (isPreview) {
      // Náhled nic nenahrává — soubor jen předstírá hotové nahrání.
      item.status = 'done';
      item.id = `nahled-${item.key}`;
      item.progress = 1;
    } else {
      uploadFile(q, item, file);
    }
  }
  refreshFiles(q);
  if (isPreview) setStatus(L('V náhledu se soubory nenahrávají.', "Files aren't uploaded in preview."), 'preview-message');
  if (messages.length) announce(q, messages.join(' '));
  if (messages.length) setStatus(messages.join(' '), 'status-error');
}

function putToStorage(item, file, url, contentType) {
  return new Promise(resolve => {
    const xhr = new XMLHttpRequest();
    item.xhr = xhr;
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = e => { if (e.lengthComputable) setProgress(item, e.loaded / e.total); };
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300 ? 'ok' : 'error');
    xhr.onerror = () => resolve('error');
    xhr.onabort = () => resolve('abort');
    xhr.send(file);
  });
}

async function uploadFile(q, item, file) {
  const failed = (text, removeOnServer) => {
    if (item.status !== 'uploading') return;
    item.status = 'error';
    item.error = text;
    item.xhr = null;
    if (removeOnServer && item.id) postJson(`${formPath}/soubory`, { akce: 'odebrat', fileId: item.id, uploadToken: uploadToken() });
    announce(q, `${item.name}: ${text}`);
    refreshFiles(q);
    bot?.react('chyba');
  };

  const start = await postJson(`${formPath}/soubory`, {
    akce: 'zacit',
    versionId: state.versionId,
    otazka: q.id,
    nazev: file.name,
    typ: file.type || '',
    velikost: file.size,
    uploadToken: uploadToken(),
  });
  if (item.status !== 'uploading') return; // mezitím odebrán
  if (!(start.ok && start.data?.ok && typeof start.data.putUrl === 'string')) {
    failed(uploadServerText(start), false);
    return;
  }
  item.id = start.data.fileId;
  const put = await putToStorage(item, file, start.data.putUrl, start.data.contentType || fileType(file));
  if (put === 'abort' || item.status !== 'uploading') return;
  if (put !== 'ok') {
    failed(uploadFailedText(), true);
    return;
  }
  const done = await postJson(`${formPath}/soubory`, { akce: 'hotovo', fileId: item.id, uploadToken: uploadToken() });
  if (item.status !== 'uploading') return;
  if (!(done.ok && done.data?.ok)) {
    failed(uploadServerText(done), true);
    return;
  }
  item.status = 'done';
  item.progress = 1;
  item.xhr = null;
  persistFiles();
  announce(q, L(`Soubor ${item.name} je nahraný.`, `${item.name} is uploaded.`));
  refreshFiles(q);
}

function removeFile(q, item, { quiet = false } = {}) {
  const was = item.status;
  item.status = 'removed';
  item.xhr?.abort();
  state.files[q.id] = (state.files[q.id] ?? []).filter(f => f !== item);
  if (item.id && !isPreview && (was === 'done' || was === 'uploading')) {
    postJson(`${formPath}/soubory`, { akce: 'odebrat', fileId: item.id, uploadToken: uploadToken() });
  }
  persistFiles();
  refreshFiles(q);
  if (quiet) return;
  announce(q, L(`Soubor ${item.name} je odebraný.`, `${item.name} was removed.`));
  fieldBox(q.id)?.querySelector('.file-pick')?.focus();
}

function removeAllFiles() {
  for (const q of questions()) {
    if (q.typ !== 'file') continue;
    for (const f of [...(state.files[q.id] ?? [])]) removeFile(q, f, { quiet: true });
  }
}

// ── Souhrn ───────────────────────────────────────────────────────────────────
function renderReview() {
  const review = $('#review');
  const karta = state.schema.stranka?.souhrnKarta;
  if (karta?.nadpis || karta?.odstavce?.length) {
    const c = el('div', { class: 'review-card' });
    if (karta.nadpis) c.append(el('h3', {}, karta.nadpis));
    for (const odst of karta.odstavce ?? []) c.append(el('p', {}, odst));
    review.append(c);
  }
  review.append(el('h3', {}, t('Vaše odpovědi', 'Tvoje odpovědi', 'Your answers')));
  const earlier = questions().filter(q => stepIndexOf(q) < state.step && isVisible(q));
  for (const q of earlier) {
    const row = el('div', { class: 'answer' });
    row.append(el('strong', {}, q.label), el('p', {}, answerText(q) || t('Necháme k doplnění.', 'Doplníme spolu.', "We'll complete this together.")));
    const edit = el('button', { type: 'button' }, L('Upravit odpověď', 'Edit answer'));
    edit.addEventListener('click', () => {
      goTo(stepIndexOf(q), { focusHeading: false });
      focusQuestion(q.id);
    });
    row.append(edit);
    review.append(row);
  }
}

// ── Vykreslení kroku ─────────────────────────────────────────────────────────
/**
 * Kroky v asidu. Skryté kroky (podmínka) se nevykreslí a číslují se jen
 * viditelné — bez podmínek je výsledek stejný jako dřív.
 */
function renderSteps() {
  const all = steps();
  const visible = visibleSteps();
  state.stepSig = visible.join(',');
  $('#steps').replaceChildren();
  visible.forEach((i, pos) => {
    const k = all[i];
    const cls = i === state.step ? 'active' : i < state.step ? 'done' : '';
    const b = el('button', { type: 'button', class: `step ${cls}`.trim(), 'aria-current': i === state.step ? 'step' : 'false' });
    b.append(el('b', {}, pad(pos + 1)), el('span', {}, k.nazev));
    if (state.done) b.disabled = true;
    b.addEventListener('click', () => {
      if (state.done || state.sending) return;
      if (i <= state.step) goTo(i);
      else if (i === nextVisible(state.step) && validateStep(state.step)) advanceTo(i);
      else setStatus(t('Projděte prosím postupně předchozí kroky.', 'Projdi prosím postupně předchozí kroky.', 'Please go through the previous steps in order.'));
    });
    $('#steps').append(b);
  });
}

/** „KROK 02 / 03" a pruh průběhu počítají jen viditelné kroky. */
function updateProgress() {
  const visible = visibleSteps();
  const total = Math.max(1, visible.length);
  const pos = Math.max(0, visible.indexOf(state.step));
  $('#step-label').textContent = `${L('KROK', 'STEP')} ${pad(pos + 1)} / ${pad(total)}`;
  $('#bar').style.width = `${((pos + 1) / total) * 100}%`;
}

function render() {
  const krok = steps()[state.step];
  const isLast = nextVisible(state.step) === -1;

  $('#fields').replaceChildren();
  $('#review').replaceChildren();
  $('#review').hidden = !krok.souhrn;
  setStatus('');

  renderSteps();
  updateProgress();
  $('#completion').textContent = t('Vaše odpovědi', 'Tvoje odpovědi', 'Your answers');
  $('#helper-copy').textContent = krok.tip || t(
    'Pište vlastními slovy, stačí stručně. Nepovinné otázky můžete přeskočit.',
    'Piš vlastními slovy, stačí stručně. Nepovinné otázky můžeš přeskočit.',
    'Answer in your own words — short is fine. You can skip optional questions.',
  );

  const h2 = el('h2', { tabindex: '-1', id: 'step-heading' }, krok.nazev);
  const heading = [h2];
  if (krok.uvod) heading.push(el('p', { class: 'lead' }, krok.uvod));
  $('#heading').replaceChildren(...heading);

  for (const q of questionsOfStep(state.step)) {
    const box = renderQuestion(q, isLast);
    // Skrytá otázka zůstává v DOM, ať se po změně odpovědi jen prolne.
    if (!isVisible(q)) box.hidden = true;
    $('#fields').append(box);
  }
  for (const [id, msg] of Object.entries(state.errors)) {
    const box = fieldBox(id);
    if (box && !box.hidden) showFieldError(id, msg);
  }
  if (krok.souhrn) renderReview();

  $('#back').hidden = prevVisible(state.step) === -1;
  updateNextButton();
}

function updateNextButton() {
  const all = steps();
  const nextStep = nextVisible(state.step);
  const isLast = nextStep === -1;
  const next = $('#next');
  const waiting = isLast && !state.sending && anyUploading();
  if (state.sending) {
    next.textContent = L('Odesílám…', 'Sending…');
  } else if (waiting) {
    next.textContent = L('Nahrávám soubory…', 'Uploading files…');
  } else if (isLast) {
    next.textContent = state.retry ? L('Zkusit znovu', 'Try again') : L('Odeslat odpovědi →', 'Send answers →');
  } else {
    next.textContent = `${all[nextStep].nazev} →`;
  }
  next.disabled = state.sending || waiting;
  if (state.sending || waiting) next.setAttribute('aria-busy', 'true');
  else next.removeAttribute('aria-busy');
}

function scrollToTop() {
  const top = innerWidth < 760 ? $('.workspace').offsetTop - 15 : 0;
  window.scrollTo({ top, behavior: 'instant' });
}

function goTo(i, { focusHeading = true } = {}) {
  let to = Math.max(0, Math.min(i, steps().length - 1));
  // Skrytý krok (podmínka) přeskočíme na nejbližší viditelný.
  if (!isVisible(steps()[to])) {
    const before = prevVisible(to);
    const after = nextVisible(to);
    to = before !== -1 ? before : after !== -1 ? after : 0;
  }
  state.step = to;
  render();
  trackStep('zobrazeni', to);
  scrollToTop();
  if (focusHeading) $('#step-heading')?.focus({ preventScroll: true });
}

function advanceTo(i) {
  trackStep('dokonceni', state.step);
  goTo(i);
  bot?.flash('R02', 1200);
}

// ── Odeslání ─────────────────────────────────────────────────────────────────
/**
 * Text chyby ze serveru. Server píše česky; v anglickém formuláři místo něj
 * ukážeme vlastní anglickou hlášku podle stavu (kromě hlášek z kontroly
 * odpovědí, které server u `jazyk: "en"` posílá anglicky sám).
 */
function serverText(res, fallback) {
  if (!isEn()) return res.data?.chyba || fallback;
  if (res.status === 409) return 'The form has changed in the meantime. Reload the page — your answers will stay.';
  if (res.status === 429) return 'Too many attempts in a short time. Please try again in a few minutes.';
  if (res.status === 413) return 'Your answers are too long.';
  if (res.status === 404) return "This form isn't accepting answers right now.";
  return fallback;
}

/**
 * Klíč pokusu vznikne při prvním odeslání a drží se v sessionStorage, takže
 * opakování i obnovení stránky pošle TENTÝŽ klíč (server odpověď nezdvojí).
 * Bez sessionStorage ho držíme aspoň v paměti stránky.
 */
function idempotencyKey() {
  if (state.memoryKey) return state.memoryKey;
  const k = sessionKey();
  let key = storage.get('sessionStorage', k);
  if (!key || !/^[A-Za-z0-9_-]{16,80}$/.test(key)) {
    key = typeof crypto?.randomUUID === 'function'
      ? crypto.randomUUID()
      : Array.from(crypto.getRandomValues(new Uint8Array(18)), b => b.toString(16).padStart(2, '0')).join('');
    storage.set('sessionStorage', k, key);
  }
  state.memoryKey = key;
  return key;
}

function setSending(on) {
  state.sending = on;
  $('#form').setAttribute('aria-busy', on ? 'true' : 'false');
  $('#save-later').disabled = on;
  updateNextButton();
}

/** Tělo odeslání (sdílí režim kroků i jedna otázka; pořadí klíčů jako dřív). */
function submitBody(key, web) {
  const body = {
    versionId: state.versionId,
    idempotencyKey: key,
    odpovedi: collectAnswers(),
    web,
    otevreno: openedAt,
  };
  // Jen formuláře s nahráváním posílají token — ostatní tělo beze změny.
  if (hasFileQuestions()) body.souborovyToken = uploadToken();
  // Jen stránka otevřená z pozvánky posílá její token — jinak tělo beze změny.
  if (state.inviteToken) body.pozvankaToken = state.inviteToken;
  return body;
}

/**
 * Odeslání pro režim jedna otázka: stejný požadavek, klíč pokusu a obnova
 * po změně verze jako submit(), jen výsledek vrací místo vykreslení kroků.
 * → { stav: 'ok', potvrzeni } | { stav: 'nahled' } | { stav: 'chyby', chyby, text } | { stav: 'chyba', text }
 */
async function sendAnswers(web) {
  if (isPreview) return { stav: 'nahled' };
  const failed = () => t(
    'Odpovědi se nepodařilo odeslat. Nic se neztratilo — zkuste to prosím znovu.',
    'Odpovědi se nepodařilo odeslat. Nic se neztratilo — zkus to prosím znovu.',
    "Your answers couldn't be sent. Nothing is lost — please try again.",
  );
  const key = idempotencyKey();
  setSending(true);
  const res = await postJson(`${formPath}/odeslat`, submitBody(key, web));
  setSending(false);
  if (res.ok && res.data?.ok) return { stav: 'ok', potvrzeni: res.data.potvrzeni };
  if (res.data?.pozvanka === 'neplatna') {
    return { stav: 'chyba', text: res.data.chyba || t('Pozvánka už neplatí. Napište nám a pošleme novou.', 'Pozvánka už neplatí. Napiš nám a pošleme novou.', "This invitation is no longer valid. Let us know and we'll send you a new one.") };
  }
  state.retry = true;
  if (res.network || res.status >= 500 || !res.data) return { stav: 'chyba', text: failed() };
  if (res.status === 422 && res.data.chyby && typeof res.data.chyby === 'object') {
    const chyby = {};
    for (const q of questions()) {
      if (isVisible(q) && typeof res.data.chyby[q.id] === 'string') chyby[q.id] = res.data.chyby[q.id];
    }
    if (Object.keys(chyby).length) {
      return { stav: 'chyby', chyby, text: res.data.chyba || t('Zkontrolujte prosím označené odpovědi.', 'Zkontroluj prosím označené odpovědi.', 'Please check the highlighted answers.') };
    }
    return { stav: 'chyba', text: res.data.chyby._celkem || res.data.chyba || L('Odpovědi se nepodařilo odeslat.', "Your answers couldn't be sent.") };
  }
  if (res.status === 409) storage.set('sessionStorage', recoveryKey(), JSON.stringify(state.values));
  return { stav: 'chyba', text: serverText(res, failed()) };
}

async function submit() {
  if (state.sending || state.done) return;
  if (anyUploading()) {
    setStatus(t('Počkejte prosím, až se soubory nahrají.', 'Počkej prosím, až se soubory nahrají.', 'Please wait until your files finish uploading.'), 'status-error');
    return;
  }
  if (!validateStep(state.step)) return;
  const bad = firstInvalidStep();
  if (bad !== -1) {
    goTo(bad, { focusHeading: false });
    const firstId = questionsOfStep(bad).find(q => state.errors[q.id])?.id;
    if (firstId) focusQuestion(firstId);
    bot?.react('chyba');
    return;
  }

  if (isPreview) {
    setStatus(L('Náhled je dokončený. Odpovědi se v náhledu neodesílají.', "Preview complete. Answers aren't sent in preview."), 'preview-message');
    $('#status').scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' });
    bot?.react('hotovo');
    return;
  }

  const key = idempotencyKey();
  setStatus('');
  setSending(true);
  const res = await postJson(`${formPath}/odeslat`, submitBody(key, $('#hp-web').value));
  setSending(false);

  if (res.ok && res.data?.ok) {
    trackStep('dokonceni', state.step);
    showSuccess(res.data.potvrzeni);
    return;
  }

  // Neplatná pozvánka: hláška ze serveru (v jazyce formuláře), odpovědi
  // zůstávají a token se potichu nezahazuje.
  if (res.data?.pozvanka === 'neplatna') {
    updateNextButton();
    setStatus(res.data.chyba || t(
      'Pozvánka už neplatí. Napište nám a pošleme novou.',
      'Pozvánka už neplatí. Napiš nám a pošleme novou.',
      "This invitation is no longer valid. Let us know and we'll send you a new one.",
    ), 'status-error');
    bot?.react('chyba');
    return;
  }

  state.retry = true;
  if (res.network || res.status >= 500 || !res.data) {
    updateNextButton();
    setStatus(t(
      'Odpovědi se nepodařilo odeslat. Nic se neztratilo — zkuste to prosím znovu.',
      'Odpovědi se nepodařilo odeslat. Nic se neztratilo — zkus to prosím znovu.',
      "Your answers couldn't be sent. Nothing is lost — please try again.",
    ), 'status-error');
    bot?.react('chyba');
    return;
  }

  if (res.status === 422 && res.data.chyby && typeof res.data.chyby === 'object') {
    state.errors = {};
    let firstStep = -1;
    let firstId = null;
    for (const q of questions()) {
      if (!isVisible(q)) continue;
      const msg = res.data.chyby[q.id];
      if (typeof msg !== 'string') continue;
      state.errors[q.id] = msg;
      const s = stepIndexOf(q);
      if (firstStep === -1 || s < firstStep) { firstStep = s; firstId = q.id; }
    }
    if (firstStep !== -1) {
      goTo(firstStep, { focusHeading: false });
      setStatus(res.data.chyba || t('Zkontrolujte prosím označené odpovědi.', 'Zkontroluj prosím označené odpovědi.', 'Please check the highlighted answers.'), 'status-error');
      focusQuestion(firstId);
    } else {
      updateNextButton();
      setStatus(res.data.chyby._celkem || res.data.chyba || L('Odpovědi se nepodařilo odeslat.', "Your answers couldn't be sent."), 'status-error');
    }
    bot?.react('chyba');
    return;
  }

  // 400 / 404 / 409 / 413 / 429: text ze serveru, hodnoty zůstávají, stejný klíč.
  if (res.status === 409) {
    // Nová verze formuláře: po obnovení stránky vrátíme rozepsané odpovědi.
    storage.set('sessionStorage', recoveryKey(), JSON.stringify(state.values));
  }
  updateNextButton();
  setStatus(serverText(res, t(
    'Odpovědi se nepodařilo odeslat. Nic se neztratilo — zkuste to prosím znovu.',
    'Odpovědi se nepodařilo odeslat. Nic se neztratilo — zkus to prosím znovu.',
    "Your answers couldn't be sent. Nothing is lost — please try again.",
  )), 'status-error');
  bot?.react('chyba');
}

function emailLine(stav) {
  const q = questions().find(x => x.role === 'respondent_email');
  const email = q && typeof state.values[q.id] === 'string' ? state.values[q.id].trim() : '';
  switch (stav) {
    case 'odeslano':
      return email
        ? t(`Potvrzení jsme vám poslali na e-mail ${email}.`, `Potvrzení jsme ti poslali na e-mail ${email}.`, `We've sent a confirmation to ${email}.`)
        : t('Potvrzení jsme vám poslali e-mailem.', 'Potvrzení jsme ti poslali e-mailem.', "We've sent you a confirmation by email.");
    case 'ceka':
      return t('Potvrzení vám pošleme e-mailem během několika minut.', 'Potvrzení ti pošleme e-mailem během několika minut.', "We'll email you a confirmation within a few minutes.");
    case 'selhalo':
      return L('Potvrzovací e-mail se teď nepodařilo odeslat. Odpovědi ale máme bezpečně uložené.', "We couldn't send the confirmation email right now, but your answers are safely saved.");
    default:
      return '';
  }
}

function showSuccess(stav) {
  state.done = true;
  state.retry = false;
  const p = state.schema.potvrzeni ?? {};
  const box = el('div', { class: 'success' });
  box.append(el('img', { src: '/formular-app/assets/jiskra.svg', width: '44', alt: '' }));
  const h = el('h2', { tabindex: '-1', id: 'success-heading' }, p.nadpis || t('Děkujeme, odpovědi máme.', 'Díky, odpovědi máme.', 'Thank you, we have your answers.'));
  box.append(h);
  if (p.text) box.append(el('p', {}, p.text));
  const line = emailLine(stav);
  if (line) box.append(el('p', { class: 'email-line' }, line));
  if (Array.isArray(p.dalsiKroky) && p.dalsiKroky.length) {
    box.append(el('h3', {}, L('Co bude následovat', 'What happens next')));
    const ol = el('ol');
    for (const k of p.dalsiKroky) ol.append(el('li', {}, k));
    box.append(ol);
  }
  $('#success').replaceChildren(box);
  $('#form-area').hidden = true;
  $('#success').hidden = false;

  cleanupAfterSuccess();

  // Kroky v asidu: vše hotové, dál neklikací.
  $('#steps').querySelectorAll('.step').forEach(b => {
    b.classList.remove('active');
    b.classList.add('done');
    b.setAttribute('aria-current', 'false');
    b.disabled = true;
  });
  $('#helper-copy').textContent = t('Odpovědi jsou uložené. Stránku můžete zavřít.', 'Odpovědi jsou uložené. Stránku můžeš zavřít.', 'Your answers are saved. You can close this page.');
  bot?.react('hotovo');
  scrollToTop();
  h.focus({ preventScroll: true });
}

/** Úklid po uložení odpovědí (sdílí oba režimy). */
function cleanupAfterSuccess() {
  // Úklid: rozepsané odpovědi i klíč pokusu už nejsou potřeba.
  storage.remove('localStorage', localKey());
  storage.remove('sessionStorage', sessionKey());
  storage.remove('sessionStorage', recoveryKey());
  if (hasFileQuestions()) storage.remove('sessionStorage', filesKey());
  if (state.inviteToken) {
    storage.remove('sessionStorage', inviteKey());
    state.inviteToken = null;
    $('#invite')?.remove();
  }
  state.files = {};
  state.uploadToken = null;
  state.memoryKey = null;
  $('#remember').checked = false;
  state.draftToken = null;
}

// ── Rozepsané odpovědi na serveru ────────────────────────────────────────────
async function saveLater() {
  if (state.savingDraft || state.sending) return;
  if (isPreview) {
    setStatus(L('V náhledu se rozepsané odpovědi na server neukládají.', "Drafts aren't saved to the server in preview."), 'preview-message');
    return;
  }
  const btn = $('#save-later');
  state.savingDraft = true;
  btn.disabled = true;
  btn.textContent = L('Ukládám…', 'Saving…');
  btn.setAttribute('aria-busy', 'true');
  const body = { akce: 'ulozit', versionId: state.versionId, odpovedi: collectAnswers({ files: false }) };
  if (state.draftToken) body.token = state.draftToken;
  const res = await postJson(`${formPath}/rozepsane`, body);
  state.savingDraft = false;
  btn.disabled = false;
  btn.textContent = L('Uložit a dokončit později', 'Save and finish later');
  btn.removeAttribute('aria-busy');

  if (res.ok && res.data?.ok && typeof res.data.token === 'string') {
    state.draftToken = res.data.token;
    showSavedPanel(res.data.token, res.data.platiDo);
    return;
  }
  setStatus(
    serverText(res, t(
      'Rozepsané odpovědi se nepodařilo uložit. Zkuste to prosím znovu.',
      'Rozepsané odpovědi se nepodařilo uložit. Zkus to prosím znovu.',
      "Your draft couldn't be saved. Please try again.",
    )),
    'status-error',
  );
}

function showSavedPanel(token, platiDo) {
  const panel = $('#saved');
  const d = new Date(platiDo);
  const date = Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(L('cs-CZ', 'en-GB'), { day: 'numeric', month: 'numeric', year: 'numeric' });
  const link = `${location.origin}${location.pathname}#pokracovat=${token}`;

  const text = el('p', { id: 'saved-text' }, t(
    `Rozepsané odpovědi jsou uložené${date ? ` do ${date}` : ''}. Pokračovat můžete z tohoto soukromého odkazu — nikomu ho neposílejte:`,
    `Rozepsané odpovědi jsou uložené${date ? ` do ${date}` : ''}. Pokračovat můžeš z tohoto soukromého odkazu — nikomu ho neposílej:`,
    `Your draft is saved${date ? ` until ${date}` : ''}. You can continue from this private link — don't share it with anyone:`,
  ));
  const input = el('input', { type: 'text', readonly: true, id: 'saved-link', 'aria-labelledby': 'saved-text', spellcheck: 'false', autocomplete: 'off' });
  input.value = link;
  input.addEventListener('focus', () => input.select());
  const copy = el('button', { type: 'button' }, L('Kopírovat odkaz', 'Copy link'));
  const copied = el('small', { role: 'status', 'aria-live': 'polite' }, t(
    'Odkaz platí 30 dní od posledního uložení. Když uložíte znovu, platí dál ten stejný.',
    'Odkaz platí 30 dní od posledního uložení. Když uložíš znovu, platí dál ten stejný.',
    'The link is valid for 30 days from the last save. If you save again, the same link keeps working.',
  ));
  copy.addEventListener('click', async () => {
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
        ok = true;
      }
    } catch { ok = false; }
    if (!ok) {
      input.focus();
      input.select();
      try { ok = document.execCommand('copy'); } catch { ok = false; }
    }
    copy.textContent = ok ? L('Zkopírováno', 'Copied') : L('Kopírovat odkaz', 'Copy link');
    if (!ok) copied.textContent = t('Odkaz je označený — zkopírujte ho prosím ručně.', 'Odkaz je označený — zkopíruj ho prosím ručně.', 'The link is selected — please copy it manually.');
  });
  const row = el('div', { class: 'saved-row' });
  row.append(input, copy);
  panel.replaceChildren(text, row, copied);
  panel.hidden = false;
}

async function loadServerDraft() {
  if (!location.hash.startsWith('#pokracovat=') || isPreview) return;
  const token = decodeURIComponent(location.hash.slice('#pokracovat='.length));
  const dropHash = () => {
    try { history.replaceState(history.state, '', location.pathname + location.search); } catch { /* nic */ }
  };
  const res = await postJson(`${formPath}/rozepsane`, { akce: 'nacist', token });
  if (res.ok && res.data?.ok) {
    state.values = { ...state.values, ...sanitizeValues(res.data.odpovedi) };
    state.draftToken = token;
    dropHash();
    return t('Rozepsané odpovědi jsou načtené. Můžete pokračovat.', 'Rozepsané odpovědi jsou načtené. Můžeš pokračovat.', 'Your draft is loaded. You can continue.');
  }
  if (!res.network) dropHash();
  return {
    error: serverText(res, t(
      'Rozepsané odpovědi se nepodařilo načíst. Zkuste odkaz otevřít znovu.',
      'Rozepsané odpovědi se nepodařilo načíst. Zkus odkaz otevřít znovu.',
      "Your draft couldn't be loaded. Try opening the link again.",
    )),
  };
}

// ── Pozvánka a žádost o opravu (23. 9. 2026) ─────────────────────────────────
// Odkaz #pozvanka=<token>: token jde jen v těle požadavku, z adresy se hned
// odstraní a drží se v paměti (a v sessionStorage téhle karty, ať přežije
// obnovení stránky). Bez pozvánky se stránka chová přesně jako dřív.
const INVITE_RE = /^[A-Za-z0-9_-]{43}$/;

async function loadInvitation() {
  if (isPreview || !slug) return null;
  let token = null;
  let fromHash = false;
  if (location.hash.startsWith('#pozvanka=')) {
    try { token = decodeURIComponent(location.hash.slice('#pozvanka='.length)); } catch { token = '#'; }
    fromHash = true;
    try { history.replaceState(history.state, '', location.pathname + location.search); } catch { /* nic */ }
  } else {
    token = storage.get('sessionStorage', inviteKey());
  }
  if (!token) return null;
  if (!INVITE_RE.test(token)) {
    storage.remove('sessionStorage', inviteKey());
    return { error: t('Odkaz s pozvánkou je neúplný. Napište nám a pošleme nový.', 'Odkaz s pozvánkou je neúplný. Napiš nám a pošleme nový.', "The invitation link is incomplete. Let us know and we'll send a new one.") };
  }
  const res = await postJson(`${formPath}/pozvanka`, { token });
  if (res.network || res.status >= 500 || !res.data) {
    // Ověření se nepovedlo (síť) — token necháme, platnost ověří odeslání.
    state.inviteToken = token;
    storage.set('sessionStorage', inviteKey(), token);
    return null;
  }
  if (!res.ok || !res.data.ok) {
    storage.remove('sessionStorage', inviteKey());
    return {
      error: (!isEn() || res.status === 410 ? res.data.chyba : '') || t(
        'Pozvánka už neplatí. Napište nám a pošleme novou.',
        'Pozvánka už neplatí. Napiš nám a pošleme novou.',
        "This invitation is no longer valid. Let us know and we'll send you a new one.",
      ),
    };
  }
  state.inviteToken = token;
  storage.set('sessionStorage', inviteKey(), token);
  const pre = res.data.oprava ? sanitizeValues(res.data.predvyplneni) : {};
  // Čerstvě otevřený odkaz předvyplní původní odpovědi; po obnovení stránky
  // mají přednost úpravy, které už člověk udělal.
  state.values = fromHash ? { ...state.values, ...pre } : { ...pre, ...state.values };
  return {
    jmeno: typeof res.data.jmeno === 'string' ? res.data.jmeno : '',
    oprava: !!res.data.oprava,
    opravaZ: typeof res.data.opravaZ === 'string' ? res.data.opravaZ : '',
  };
}

function showInviteBanner(info) {
  if (!info || info.error) return;
  const text = inviteBannerText(info);
  if (!text) return;
  const box = el('p', { class: 'invite-banner', id: 'invite' }, text);
  $('#form-area').prepend(box);
}

/** Text pruhu pozvánky / opravy odpovědí (nebo ''). */
function inviteBannerText(info) {
  let text = '';
  if (info.oprava) {
    const d = new Date(info.opravaZ);
    const date = Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(L('cs-CZ', 'en-GB'), { day: 'numeric', month: 'numeric', year: 'numeric' });
    text = t(
      `Opravujete odpovědi${date ? ` z ${date}` : ''}. Původní odpovědi jsou předvyplněné — změňte, co je potřeba, a odešlete znovu. Původní odpověď zůstane uložená.`,
      `Opravuješ odpovědi${date ? ` z ${date}` : ''}. Původní odpovědi jsou předvyplněné — změň, co je potřeba, a odešli znovu. Původní odpověď zůstane uložená.`,
      `You're reviewing your answers${date ? ` from ${date}` : ''}. Your previous answers are filled in — change what's needed and send again. Your original answers stay saved.`,
    );
  } else if (info.jmeno) {
    text = L(`Pozvánka pro: ${info.jmeno}`, `Invitation for: ${info.jmeno}`);
  }
  return text;
}

// ── Statistika kroků (23. 9. 2026) ───────────────────────────────────────────
// Jen počty: zobrazení a dokončení kroku, každé nejvýš jednou za relaci
// prohlížeče. Odesílá se na pozadí (sendBeacon) a nikdy neruší vyplňování.
// V náhledu se nic neposílá.
const trackedMemory = new Set();

function trackStep(akce, i) {
  if (isPreview || !formPath || !state.versionId || !state.schema) return;
  const krok = steps()[i]?.id;
  if (typeof krok !== 'string' || !/^[a-z0-9_]{1,40}$/.test(krok)) return;
  const mark = `${akce}:${krok}`;
  let seen = [];
  try { seen = JSON.parse(storage.get('sessionStorage', statsKey()) || '[]'); } catch { seen = []; }
  if (!Array.isArray(seen)) seen = [];
  if (trackedMemory.has(mark) || seen.includes(mark)) return;
  trackedMemory.add(mark);
  seen.push(mark);
  storage.set('sessionStorage', statsKey(), JSON.stringify(seen.slice(-200)));
  const url = `${formPath}/krok`;
  const body = JSON.stringify({ versionId: state.versionId, krok, akce });
  try {
    // text/plain = bez preflightu i napříč doménami (zandavisuals.com → app).
    if (typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(url, new Blob([body], { type: 'text/plain' }))) return;
  } catch { /* zkusíme fetch */ }
  try {
    fetch(url, { method: 'POST', body, keepalive: true, credentials: 'omit', headers: { 'Content-Type': 'text/plain' } }).catch(() => {});
  } catch { /* statistika nesmí nic rozbít */ }
}

// ── Mazání rozepsaných odpovědí (dvoukrokové potvrzení) ──────────────────────
function disarmClear() {
  state.clearArmed = false;
  clearTimeout(clearTimer);
  $('#clear').textContent = L('Smazat rozepsané odpovědi', 'Delete draft answers');
}

function onClear() {
  if (!state.clearArmed) {
    state.clearArmed = true;
    $('#clear').textContent = L('Opravdu smazat?', 'Really delete?');
    clearTimer = setTimeout(disarmClear, 6000);
    return;
  }
  disarmClear();
  removeAllFiles();
  state.values = {};
  state.errors = {};
  state.retry = false;
  state.draftToken = null;
  storage.remove('localStorage', localKey());
  $('#saved').hidden = true;
  $('#saved').replaceChildren();
  applyDefaults();
  if (joCtl) joCtl.reset();
  else goTo(0);
  setStatus(t('Rozepsané odpovědi jsou smazané.', 'Rozepsané odpovědi jsou smazané.', 'Your draft answers are deleted.'));
}

// ── Stavy bez formuláře ──────────────────────────────────────────────────────
function showNotice({ title, text, retry = false, docTitle }) {
  applyLanguage();
  document.title = docTitle || `${title} · ZandaVisuals`;
  $('#main').classList.add('solo');
  $('#main').setAttribute('aria-busy', 'false');
  $('#skeleton').hidden = true;
  $('#loading-text').textContent = '';
  $('#form-area').hidden = true;
  const box = el('div', { class: 'notice' });
  box.append(el('img', { src: '/formular-app/assets/jiskra.svg', width: '44', alt: '' }));
  const h1 = el('h1', { tabindex: '-1' }, title);
  box.append(h1, el('p', {}, text));
  if (retry) {
    const b = el('button', { type: 'button', class: 'primary' }, L('Zkusit znovu', 'Try again'));
    b.addEventListener('click', () => {
      $('#notice').hidden = true;
      $('#main').classList.remove('solo');
      $('#skeleton').hidden = false;
      $('#main').setAttribute('aria-busy', 'true');
      $('#loading-text').textContent = L('Načítám formulář…', 'Loading form…');
      load();
    });
    box.append(b);
  }
  $('#notice').replaceChildren(box);
  $('#notice').hidden = false;
  if (retry) h1.focus({ preventScroll: true });
}

// ── Statické texty v angličtině ──────────────────────────────────────────────
/** Zapamatuje jazyk formuláře pro stavové stránky bez schématu (jen se slugem). */
function rememberLanguage(lang) {
  pageLang = lang;
  if (!slug) return;
  if (lang === 'en') storage.set('localStorage', langKey(), 'en');
  else storage.remove('localStorage', langKey());
}

/** První textový uzel prvku (text před <strong>, <input> apod.). */
const leadingText = node => (node ? [...node.childNodes].find(n => n.nodeType === Node.TEXT_NODE) ?? null : null);

let restoreStaticTexts = null;

/**
 * Jazyk stránky: atribut lang a texty z index.html. Česky se nic nemění
 * (index.html je česky). Anglicky se texty přepíšou jednou a zapamatuje se
 * návrat — kdyby po stavové stránce v angličtině (nápověda jazyka) přišel
 * český formulář, vrátí se původní texty.
 */
function applyLanguage() {
  const en = isEn();
  document.documentElement.lang = en ? 'en' : 'cs';
  if (!en) {
    restoreStaticTexts?.();
    restoreStaticTexts = null;
    return;
  }
  if (restoreStaticTexts) return;
  const undo = [];
  const text = (node, value) => {
    if (!node) return;
    const prev = node.textContent;
    node.textContent = value;
    undo.push(() => { node.textContent = prev; });
  };
  const attr = (node, name, value) => {
    if (!node) return;
    const prev = node.getAttribute(name);
    node.setAttribute(name, value);
    undo.push(() => (prev === null ? node.removeAttribute(name) : node.setAttribute(name, prev)));
  };
  text(leadingText($('#preview')), 'Form preview ');
  text($('#preview span'), '— answers are not sent');
  attr(document.querySelector('header a'), 'aria-label', 'ZandaVisuals — main website');
  text(leadingText($('#client')), 'PREPARED FOR ');
  attr($('#steps'), 'aria-label', 'Form steps');
  text(document.querySelector('label[for="hp-web"]'), 'Leave this empty');
  text($('#back'), '← Back');
  text($('#save-later'), 'Save and finish later');
  text(leadingText($('#remember').parentElement), ' Remember my draft answers on this device');
  text($('#clear'), 'Delete draft answers');
  attr($('#close-helper'), 'aria-label', 'Close help');
  text($('#helper small'), 'Form help');
  attr($('#bot'), 'aria-label', 'Open Zandabot help');
  // Stav načítání se mění průběžně, proto bez návratu.
  if ($('#loading-text').textContent) $('#loading-text').textContent = 'Loading form…';
  restoreStaticTexts = () => undo.reverse().forEach(fn => fn());
}

// ── Zandabot a nápověda ──────────────────────────────────────────────────────
function setupBot() {
  if (bot) return;
  const host = $('#bot');
  host.hidden = false;
  const helper = $('#helper');
  const setOpen = open => {
    helper.hidden = !open;
    host.querySelector('svg')?.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  bot = createZandaBot(host, {
    expression: 'R02',
    label: L('Zandabot — nápověda k formuláři', 'Zandabot — form help'),
    idle: !reducedMotion,
    onClick: () => setOpen(helper.hidden),
  });
  const svg = host.querySelector('svg');
  svg?.setAttribute('aria-controls', 'helper');
  svg?.setAttribute('aria-expanded', 'false');
  $('#close-helper').addEventListener('click', () => {
    setOpen(false);
    svg?.focus();
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || helper.hidden) return;
    const inside = helper.contains(document.activeElement);
    setOpen(false);
    if (inside) svg?.focus();
  });
}

// ── Načtení ──────────────────────────────────────────────────────────────────
async function fetchSchema() {
  if (isPreview) {
    const res = await request(`/api/formulare/${previewId}/nahled`, { credentials: 'same-origin' });
    if (res.ok && res.data?.schema) return { kind: 'active', schema: res.data.schema, versionId: null };
    if (res.network || res.status >= 500) return { kind: 'error' };
    return {
      kind: 'notice',
      title: L('Náhled není k dispozici', 'Preview unavailable'),
      text: res.status === 401 || res.status === 403
        ? L('Náhled formuláře se otevírá jen po přihlášení do ZandaVisuals OS.', 'The form preview opens only after signing in to ZandaVisuals OS.')
        : L('Tenhle náhled se nepodařilo najít.', "This preview couldn't be found."),
    };
  }
  if (!formPath) return { kind: 'notfound' };
  const res = await request(formPath);
  if (res.network || res.status >= 500) return { kind: 'error' };
  const d = res.data;
  if (res.status === 404 || d?.stav === 'nenalezen') return { kind: 'notfound' };
  if (d?.stav === 'pozastaveny') return { kind: 'paused', nazev: d.nazev, zprava: d.zprava, jazyk: d.jazyk };
  if (res.ok && d?.stav === 'aktivni' && d.schema && d.versionId) {
    return { kind: 'active', schema: d.schema, versionId: d.versionId };
  }
  return { kind: 'error' };
}

function schemaLooksUsable(s) {
  return s && typeof s === 'object'
    && Array.isArray(s.kroky) && s.kroky.length > 0
    && Array.isArray(s.otazky)
    && s.kroky.every(k => k && typeof k.id === 'string' && typeof k.nazev === 'string');
}

async function load() {
  const r = await fetchSchema();
  if (r.kind === 'error' || (r.kind === 'active' && !schemaLooksUsable(r.schema))) {
    showNotice({
      title: L('Formulář se nepodařilo načíst', "The form couldn't be loaded"),
      text: L(
        'Zkontrolujte prosím připojení k internetu a zkuste to znovu. Pokud potíže trvají, napište nám.',
        'Please check your internet connection and try again. If the problem persists, let us know.',
      ),
      retry: true,
    });
    return;
  }
  if (r.kind === 'notfound') {
    showNotice({
      title: L('Formulář nenalezen', 'Form not found'),
      text: L(
        'Odkaz je neúplný, nebo formulář už nepřijímá odpovědi. Pokud jste ho dostali od nás, napište nám a pošleme nový.',
        "The link is incomplete, or the form is no longer accepting answers. If you got it from us, let us know and we'll send a new one.",
      ),
    });
    return;
  }
  if (r.kind === 'paused') {
    if (r.jazyk === 'en') rememberLanguage('en');
    showNotice({
      title: r.nazev || L('Formulář je pozastavený', 'This form is paused'),
      text: r.zprava || L('Formulář teď nepřijímá odpovědi. Zkuste to prosím později.', "This form isn't accepting answers right now. Please try again later."),
      docTitle: `${r.nazev || L('Formulář', 'Form')} · ZandaVisuals`,
    });
    return;
  }
  if (r.kind === 'notice') {
    showNotice({ title: r.title, text: r.text });
    return;
  }
  await startForm(r.schema, r.versionId);
}

async function startForm(schema, versionId) {
  state.schema = schema;
  state.versionId = versionId;
  rememberLanguage(schema.jazyk === 'en' ? 'en' : 'cs');
  applyLanguage();
  if (isPreview) $('#preview').hidden = false;

  // Nové typy / vzhled / jedna otázka: stáhnout rozšíření (jinak nic).
  let joModule = null;
  if (needsExtensions(schema)) {
    const loaded = await loadExtensions(schema);
    if (!loaded) {
      showNotice({
        title: L('Formulář se nepodařilo načíst', "The form couldn't be loaded"),
        text: L(
          'Zkontrolujte prosím připojení k internetu a zkuste to znovu. Pokud potíže trvají, napište nám.',
          'Please check your internet connection and try again. If the problem persists, let us know.',
        ),
        retry: true,
      });
      return;
    }
    joModule = loaded.jo;
  }

  // Pořadí zdrojů: rozepsané na serveru > obnova po změně verze > zařízení > výchozí.
  let restoredNote = '';
  const saved = storage.get('localStorage', localKey());
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed?.values) {
        state.values = sanitizeValues(parsed.values);
        $('#remember').checked = true;
      }
    } catch { /* poškozený záznam ignorujeme */ }
  }
  if (slug) {
    const recovery = storage.get('sessionStorage', recoveryKey());
    if (recovery) {
      try {
        state.values = { ...state.values, ...sanitizeValues(JSON.parse(recovery)) };
        restoredNote = t('Vrátili jsme vaše rozepsané odpovědi. Zkontrolujte je prosím a odešlete znovu.', 'Vrátili jsme tvoje rozepsané odpovědi. Zkontroluj je prosím a odešli znovu.', "We've restored your draft answers. Please check them and send again.");
      } catch { /* nic */ }
      storage.remove('sessionStorage', recoveryKey());
    }
  }
  const invite = await loadInvitation();
  const draft = await loadServerDraft();
  restoreFiles();
  applyDefaults();

  if (joModule) {
    await startOneQuestion(joModule, invite, draft, restoredNote);
    return;
  }

  renderPage();
  $('#skeleton').hidden = true;
  $('#loading-text').textContent = '';
  $('#form-area').hidden = false;
  $('#main').setAttribute('aria-busy', 'false');
  setupBot();
  render();
  showInviteBanner(invite);
  trackStep('zobrazeni', state.step);

  showStartStatus(invite, draft, restoredNote);
}

function showStartStatus(invite, draft, restoredNote) {
  if (invite?.error) setStatus(invite.error, 'status-error');
  else if (draft && typeof draft === 'object' && draft.error) setStatus(draft.error, 'status-error');
  else if (typeof draft === 'string') setStatus(draft);
  else if (restoredNote) setStatus(restoredNote);
}

// ── Režim jedna otázka na obrazovku (23. 9. 2026 večer) ──────────────────────
/** Stáhne spolecne.js (+ jedna-otazka.js), styly a použije vzhled. Při chybě null. */
async function loadExtensions(schema) {
  try {
    const one = schema.rezim === 'jedna_otazka';
    const [mod, joMod] = await Promise.all([
      import('/formular-app/spolecne.js'),
      one ? import('/formular-app/jedna-otazka.js') : null,
    ]);
    rozsireni = mod;
    // Styly: když se nenačtou, stránka funguje dál (jen bez nových stylů).
    await rozsireni.nactiStyly('/formular-app/spolecne.css');
    rozsireni.pouzijVzhled(document.documentElement, schema);
    return { jo: joMod };
  } catch {
    rozsireni = null;
    return null;
  }
}

async function startOneQuestion(joModule, invite, draft, restoredNote) {
  renderPage(); // titulek dokumentu, klient v hlavičce, patička
  $('#skeleton').hidden = true;
  $('#loading-text').textContent = '';
  $('#main').setAttribute('aria-busy', 'false');
  setupBot();
  joCtl = await joModule.spustit({
    schema: state.schema,
    get values() { return state.values; },
    isPreview,
    t,
    L,
    isEn,
    isVisible,
    checkQuestion,
    answerText,
    // Bez refreshVisibility — ta patří k DOM režimu kroků.
    setValue(q, value) {
      state.values[q.id] = value;
      delete state.errors[q.id];
      saveLocal();
    },
    renderFileField,
    anyUploading,
    odeslat: sendAnswers,
    trackStep,
    get bot() { return bot; },
    setHelper(text) { $('#helper-copy').textContent = text; },
    setStatus,
    emailLine,
    dokonceno() {
      state.done = true;
      state.retry = false;
      cleanupAfterSuccess();
      $('#helper-copy').textContent = t('Odpovědi jsou uložené. Stránku můžete zavřít.', 'Odpovědi jsou uložené. Stránku můžeš zavřít.', 'Your answers are saved. You can close this page.');
    },
    get retry() { return state.retry; },
    inviteText: invite && !invite.error ? inviteBannerText(invite) : '',
    // Existující prvky z index.html se jen přesunou (obsluha událostí zůstává).
    draftNode: $('#draft'),
    statusNode: $('#status'),
  });
  showStartStatus(invite, draft, restoredNote);
}

// ── Události ─────────────────────────────────────────────────────────────────
$('#form').addEventListener('submit', e => {
  e.preventDefault();
  if (!state.schema || state.sending || state.done) return;
  disarmClear();
  const nextStep = nextVisible(state.step);
  if (nextStep !== -1) {
    if (validateStep(state.step)) advanceTo(nextStep);
    return;
  }
  submit();
});
$('#back').addEventListener('click', () => {
  const prevStep = state.schema ? prevVisible(state.step) : -1;
  if (state.sending || prevStep === -1) return;
  goTo(prevStep);
});
$('#remember').addEventListener('change', () => {
  if ($('#remember').checked) saveLocal();
  else storage.remove('localStorage', localKey());
});
$('#clear').addEventListener('click', onClear);
$('#clear').addEventListener('blur', () => { if (state.clearArmed) disarmClear(); });
$('#save-later').addEventListener('click', saveLater);
window.addEventListener('beforeunload', e => {
  // Rozpracované nahrávání by se zavřením stránky ztratilo.
  if (!anyUploading() || state.done) return;
  e.preventDefault();
  e.returnValue = '';
});

load();
