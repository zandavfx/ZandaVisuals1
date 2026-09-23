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
};

let bot = null;
let clearTimer = 0;

const vy = () => state.schema?.osloveni !== 'ty';
const t = (formal, informal) => (vy() ? formal : informal);

const localKey = () => `zanda:form:${slug ?? `nahled-${previewId}`}:v1`;
const sessionKey = () => `zanda:form:${slug}:${state.versionId}:klic`;
const recoveryKey = () => `zanda:form:${slug}:obnova`;

const steps = () => state.schema.kroky;
const questions = () => state.schema.otazky;
const stepIndexOf = q => steps().findIndex(k => k.id === q.krok);
const questionsOfStep = i => questions().filter(q => q.krok === steps()[i]?.id);
const isChoice = q => q.typ === 'single_choice' || q.typ === 'multi_choice';
const isTextual = q => ['short_text', 'long_text', 'email', 'url', 'date'].includes(q.typ);

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

function collectAnswers() {
  const out = {};
  for (const q of questions()) {
    if (q.typ === 'file') continue;
    const v = state.values[q.id];
    if (isEmpty(v)) continue;
    out[q.id] = Array.isArray(v) ? [...v] : v;
  }
  return out;
}

function answerText(q) {
  const v = state.values[q.id];
  if (isEmpty(v)) return '';
  if (q.typ === 'single_choice') return q.moznosti?.find(m => m.id === v)?.label ?? String(v);
  if (q.typ === 'multi_choice') return v.map(id => q.moznosti?.find(m => m.id === id)?.label ?? id).join(', ');
  if (q.typ === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const d = new Date(`${v}T12:00:00`);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('cs-CZ');
  }
  return String(v);
}

function saveLocal() {
  if (!$('#remember').checked) return;
  const ok = storage.set('localStorage', localKey(), JSON.stringify({ values: state.values, version: 1, versionId: state.versionId }));
  if (!ok) setStatus('Uložení na zařízení není dostupné. Odpovědi zůstávají v otevřeném formuláři.');
}

function setValue(q, value) {
  state.values[q.id] = value;
  if (state.errors[q.id]) {
    delete state.errors[q.id];
    clearFieldError(q.id);
  }
  saveLocal();
}

// ── Kontrola ─────────────────────────────────────────────────────────────────
function requiredMessage(q) {
  if (q.typ === 'email') return t('Doplňte platnou e-mailovou adresu.', 'Doplň platnou e-mailovou adresu.');
  if (q.typ === 'single_choice') return t('Vyberte jednu možnost.', 'Vyber jednu možnost.');
  if (q.typ === 'multi_choice') return t('Vyberte aspoň jednu možnost.', 'Vyber aspoň jednu možnost.');
  if (q.typ === 'date') return t('Vyberte prosím datum.', 'Vyber prosím datum.');
  if (q.doporuceni) return t('Napište odpověď, nebo „nechám si doporučit“.', 'Napiš odpověď, nebo „nechám si doporučit“.');
  return t('Tuhle otázku prosím vyplňte.', 'Tuhle otázku prosím vyplň.');
}

const EMAIL_RE = /^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/;

function checkQuestion(q) {
  if (q.typ === 'file') return null;
  const v = state.values[q.id];
  if (isEmpty(v)) return q.povinna ? requiredMessage(q) : null;
  const text = typeof v === 'string' ? v.trim() : '';
  if (q.typ === 'email' && !EMAIL_RE.test(text)) return t('Doplňte platnou e-mailovou adresu.', 'Doplň platnou e-mailovou adresu.');
  if (q.typ === 'url' && !/^https?:\/\/\S+$/i.test(text)) return 'Odkaz musí začínat http:// nebo https://.';
  if (q.typ === 'date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) return 'Neplatné datum.';
  }
  return null;
}

/** Zkontroluje krok; chyby vyznačí a zaměří první. */
function validateStep(i) {
  let first = null;
  for (const q of questionsOfStep(i)) {
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
  document.title = st.titulek || state.schema.nazev || 'Formulář · ZandaVisuals';

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
  if (q.cislo) box.append(el('span', { class: 'number' }, `OTÁZKA ${pad(q.cislo)}`));

  const labelId = `${q.id}-label`;
  const hintId = `${q.id}-hint`;
  const choice = isChoice(q);
  const label = choice
    ? el('span', { class: 'field-label', id: labelId }, q.label)
    : el('label', { for: q.id, id: labelId }, q.label);
  if (!q.povinna) label.append(el('span', { class: 'optional' }, 'volitelné'));
  box.append(label);
  if (q.napoveda) box.append(el('p', { class: 'hint', id: hintId }, q.napoveda));
  const describedBy = q.napoveda ? hintId : undefined;

  if (q.typ === 'file') {
    box.append(el('p', { class: 'file-note', 'data-control': '' }, t(
      'Nahrávání souborů připravujeme. Pošlete prosím odkaz (Disk, WeTransfer…).',
      'Nahrávání souborů připravujeme. Pošli prosím odkaz (Disk, WeTransfer…).',
    )));
    return box;
  }

  if (choice) {
    box.append(renderChoice(q, labelId, describedBy));
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
    long_text: t('Vaše odpověď…', 'Tvoje odpověď…'),
    short_text: t('Vaše odpověď…', 'Tvoje odpověď…'),
    email: t('vas@email.cz', 'tvuj@email.cz'),
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
  if (q.doporuceni && !chipTexts.includes('Nechám si doporučit.')) chipTexts.push('Nechám si doporučit.');
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
  review.append(el('h3', {}, t('Vaše odpovědi', 'Tvoje odpovědi')));
  const earlier = questions().filter(q => q.typ !== 'file' && stepIndexOf(q) < state.step);
  for (const q of earlier) {
    const row = el('div', { class: 'answer' });
    row.append(el('strong', {}, q.label), el('p', {}, answerText(q) || t('Necháme k doplnění.', 'Doplníme spolu.')));
    const edit = el('button', { type: 'button' }, 'Upravit odpověď');
    edit.addEventListener('click', () => {
      goTo(stepIndexOf(q), { focusHeading: false });
      focusQuestion(q.id);
    });
    row.append(edit);
    review.append(row);
  }
}

// ── Vykreslení kroku ─────────────────────────────────────────────────────────
function render() {
  const all = steps();
  const total = all.length;
  const krok = all[state.step];
  const isLast = state.step === total - 1;

  $('#fields').replaceChildren();
  $('#steps').replaceChildren();
  $('#review').replaceChildren();
  $('#review').hidden = !krok.souhrn;
  setStatus('');

  all.forEach((k, i) => {
    const cls = i === state.step ? 'active' : i < state.step ? 'done' : '';
    const b = el('button', { type: 'button', class: `step ${cls}`.trim(), 'aria-current': i === state.step ? 'step' : 'false' });
    b.append(el('b', {}, pad(i + 1)), el('span', {}, k.nazev));
    if (state.done) b.disabled = true;
    b.addEventListener('click', () => {
      if (state.done || state.sending) return;
      if (i <= state.step) goTo(i);
      else if (i === state.step + 1 && validateStep(state.step)) advanceTo(i);
      else setStatus(t('Projděte prosím postupně předchozí kroky.', 'Projdi prosím postupně předchozí kroky.'));
    });
    $('#steps').append(b);
  });

  $('#step-label').textContent = `KROK ${pad(state.step + 1)} / ${pad(total)}`;
  $('#completion').textContent = t('Vaše odpovědi', 'Tvoje odpovědi');
  $('#bar').style.width = `${((state.step + 1) / total) * 100}%`;
  $('#helper-copy').textContent = krok.tip || t(
    'Pište vlastními slovy, stačí stručně. Nepovinné otázky můžete přeskočit.',
    'Piš vlastními slovy, stačí stručně. Nepovinné otázky můžeš přeskočit.',
  );

  const h2 = el('h2', { tabindex: '-1', id: 'step-heading' }, krok.nazev);
  const heading = [h2];
  if (krok.uvod) heading.push(el('p', { class: 'lead' }, krok.uvod));
  $('#heading').replaceChildren(...heading);

  for (const q of questionsOfStep(state.step)) $('#fields').append(renderQuestion(q, isLast));
  for (const [id, msg] of Object.entries(state.errors)) {
    if (fieldBox(id)) showFieldError(id, msg);
  }
  if (krok.souhrn) renderReview();

  $('#back').hidden = state.step === 0;
  updateNextButton();
}

function updateNextButton() {
  const all = steps();
  const isLast = state.step === all.length - 1;
  const next = $('#next');
  if (state.sending) {
    next.textContent = 'Odesílám…';
  } else if (isLast) {
    next.textContent = state.retry ? 'Zkusit znovu' : 'Odeslat odpovědi →';
  } else {
    next.textContent = `${all[state.step + 1].nazev} →`;
  }
  next.disabled = state.sending;
  if (state.sending) next.setAttribute('aria-busy', 'true');
  else next.removeAttribute('aria-busy');
}

function scrollToTop() {
  const top = innerWidth < 760 ? $('.workspace').offsetTop - 15 : 0;
  window.scrollTo({ top, behavior: 'instant' });
}

function goTo(i, { focusHeading = true } = {}) {
  state.step = Math.max(0, Math.min(i, steps().length - 1));
  render();
  scrollToTop();
  if (focusHeading) $('#step-heading')?.focus({ preventScroll: true });
}

function advanceTo(i) {
  goTo(i);
  bot?.flash('R02', 1200);
}

// ── Odeslání ─────────────────────────────────────────────────────────────────
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

async function submit() {
  if (state.sending || state.done) return;
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
    setStatus('Náhled je dokončený. Odpovědi se v náhledu neodesílají.', 'preview-message');
    $('#status').scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' });
    bot?.react('hotovo');
    return;
  }

  const key = idempotencyKey();
  setStatus('');
  setSending(true);
  const res = await postJson(`${formPath}/odeslat`, {
    versionId: state.versionId,
    idempotencyKey: key,
    odpovedi: collectAnswers(),
    web: $('#hp-web').value,
    otevreno: openedAt,
  });
  setSending(false);

  if (res.ok && res.data?.ok) {
    showSuccess(res.data.potvrzeni);
    return;
  }

  state.retry = true;
  if (res.network || res.status >= 500 || !res.data) {
    updateNextButton();
    setStatus(t(
      'Odpovědi se nepodařilo odeslat. Nic se neztratilo — zkuste to prosím znovu.',
      'Odpovědi se nepodařilo odeslat. Nic se neztratilo — zkus to prosím znovu.',
    ), 'status-error');
    bot?.react('chyba');
    return;
  }

  if (res.status === 422 && res.data.chyby && typeof res.data.chyby === 'object') {
    state.errors = {};
    let firstStep = -1;
    let firstId = null;
    for (const q of questions()) {
      const msg = res.data.chyby[q.id];
      if (typeof msg !== 'string') continue;
      state.errors[q.id] = msg;
      const s = stepIndexOf(q);
      if (firstStep === -1 || s < firstStep) { firstStep = s; firstId = q.id; }
    }
    if (firstStep !== -1) {
      goTo(firstStep, { focusHeading: false });
      setStatus(res.data.chyba || t('Zkontrolujte prosím označené odpovědi.', 'Zkontroluj prosím označené odpovědi.'), 'status-error');
      focusQuestion(firstId);
    } else {
      updateNextButton();
      setStatus(res.data.chyby._celkem || res.data.chyba || 'Odpovědi se nepodařilo odeslat.', 'status-error');
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
  setStatus(res.data.chyba || t(
    'Odpovědi se nepodařilo odeslat. Nic se neztratilo — zkuste to prosím znovu.',
    'Odpovědi se nepodařilo odeslat. Nic se neztratilo — zkus to prosím znovu.',
  ), 'status-error');
  bot?.react('chyba');
}

function emailLine(stav) {
  const q = questions().find(x => x.role === 'respondent_email');
  const email = q && typeof state.values[q.id] === 'string' ? state.values[q.id].trim() : '';
  switch (stav) {
    case 'odeslano':
      return email
        ? t(`Potvrzení jsme vám poslali na e-mail ${email}.`, `Potvrzení jsme ti poslali na e-mail ${email}.`)
        : t('Potvrzení jsme vám poslali e-mailem.', 'Potvrzení jsme ti poslali e-mailem.');
    case 'ceka':
      return t('Potvrzení vám pošleme e-mailem během několika minut.', 'Potvrzení ti pošleme e-mailem během několika minut.');
    case 'selhalo':
      return 'Potvrzovací e-mail se teď nepodařilo odeslat. Odpovědi ale máme bezpečně uložené.';
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
  const h = el('h2', { tabindex: '-1', id: 'success-heading' }, p.nadpis || t('Děkujeme, odpovědi máme.', 'Díky, odpovědi máme.'));
  box.append(h);
  if (p.text) box.append(el('p', {}, p.text));
  const line = emailLine(stav);
  if (line) box.append(el('p', { class: 'email-line' }, line));
  if (Array.isArray(p.dalsiKroky) && p.dalsiKroky.length) {
    box.append(el('h3', {}, 'Co bude následovat'));
    const ol = el('ol');
    for (const k of p.dalsiKroky) ol.append(el('li', {}, k));
    box.append(ol);
  }
  $('#success').replaceChildren(box);
  $('#form-area').hidden = true;
  $('#success').hidden = false;

  // Úklid: rozepsané odpovědi i klíč pokusu už nejsou potřeba.
  storage.remove('localStorage', localKey());
  storage.remove('sessionStorage', sessionKey());
  storage.remove('sessionStorage', recoveryKey());
  state.memoryKey = null;
  $('#remember').checked = false;
  state.draftToken = null;

  // Kroky v asidu: vše hotové, dál neklikací.
  $('#steps').querySelectorAll('.step').forEach(b => {
    b.classList.remove('active');
    b.classList.add('done');
    b.setAttribute('aria-current', 'false');
    b.disabled = true;
  });
  $('#helper-copy').textContent = t('Odpovědi jsou uložené. Stránku můžete zavřít.', 'Odpovědi jsou uložené. Stránku můžeš zavřít.');
  bot?.react('hotovo');
  scrollToTop();
  h.focus({ preventScroll: true });
}

// ── Rozepsané odpovědi na serveru ────────────────────────────────────────────
async function saveLater() {
  if (state.savingDraft || state.sending) return;
  if (isPreview) {
    setStatus('V náhledu se rozepsané odpovědi na server neukládají.', 'preview-message');
    return;
  }
  const btn = $('#save-later');
  state.savingDraft = true;
  btn.disabled = true;
  btn.textContent = 'Ukládám…';
  btn.setAttribute('aria-busy', 'true');
  const body = { akce: 'ulozit', versionId: state.versionId, odpovedi: collectAnswers() };
  if (state.draftToken) body.token = state.draftToken;
  const res = await postJson(`${formPath}/rozepsane`, body);
  state.savingDraft = false;
  btn.disabled = false;
  btn.textContent = 'Uložit a dokončit později';
  btn.removeAttribute('aria-busy');

  if (res.ok && res.data?.ok && typeof res.data.token === 'string') {
    state.draftToken = res.data.token;
    showSavedPanel(res.data.token, res.data.platiDo);
    return;
  }
  setStatus(
    res.data?.chyba || t(
      'Rozepsané odpovědi se nepodařilo uložit. Zkuste to prosím znovu.',
      'Rozepsané odpovědi se nepodařilo uložit. Zkus to prosím znovu.',
    ),
    'status-error',
  );
}

function showSavedPanel(token, platiDo) {
  const panel = $('#saved');
  const d = new Date(platiDo);
  const date = Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' });
  const link = `${location.origin}${location.pathname}#pokracovat=${token}`;

  const text = el('p', { id: 'saved-text' }, t(
    `Rozepsané odpovědi jsou uložené${date ? ` do ${date}` : ''}. Pokračovat můžete z tohoto soukromého odkazu — nikomu ho neposílejte:`,
    `Rozepsané odpovědi jsou uložené${date ? ` do ${date}` : ''}. Pokračovat můžeš z tohoto soukromého odkazu — nikomu ho neposílej:`,
  ));
  const input = el('input', { type: 'text', readonly: true, id: 'saved-link', 'aria-labelledby': 'saved-text', spellcheck: 'false', autocomplete: 'off' });
  input.value = link;
  input.addEventListener('focus', () => input.select());
  const copy = el('button', { type: 'button' }, 'Kopírovat odkaz');
  const copied = el('small', { role: 'status', 'aria-live': 'polite' }, t(
    'Odkaz platí 30 dní od posledního uložení. Když uložíte znovu, platí dál ten stejný.',
    'Odkaz platí 30 dní od posledního uložení. Když uložíš znovu, platí dál ten stejný.',
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
    copy.textContent = ok ? 'Zkopírováno' : 'Kopírovat odkaz';
    if (!ok) copied.textContent = t('Odkaz je označený — zkopírujte ho prosím ručně.', 'Odkaz je označený — zkopíruj ho prosím ručně.');
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
    return t('Rozepsané odpovědi jsou načtené. Můžete pokračovat.', 'Rozepsané odpovědi jsou načtené. Můžeš pokračovat.');
  }
  if (!res.network) dropHash();
  return {
    error: res.data?.chyba || t(
      'Rozepsané odpovědi se nepodařilo načíst. Zkuste odkaz otevřít znovu.',
      'Rozepsané odpovědi se nepodařilo načíst. Zkus odkaz otevřít znovu.',
    ),
  };
}

// ── Mazání rozepsaných odpovědí (dvoukrokové potvrzení) ──────────────────────
function disarmClear() {
  state.clearArmed = false;
  clearTimeout(clearTimer);
  $('#clear').textContent = 'Smazat rozepsané odpovědi';
}

function onClear() {
  if (!state.clearArmed) {
    state.clearArmed = true;
    $('#clear').textContent = 'Opravdu smazat?';
    clearTimer = setTimeout(disarmClear, 6000);
    return;
  }
  disarmClear();
  state.values = {};
  state.errors = {};
  state.retry = false;
  state.draftToken = null;
  storage.remove('localStorage', localKey());
  $('#saved').hidden = true;
  $('#saved').replaceChildren();
  applyDefaults();
  goTo(0);
  setStatus(t('Rozepsané odpovědi jsou smazané.', 'Rozepsané odpovědi jsou smazané.'));
}

// ── Stavy bez formuláře ──────────────────────────────────────────────────────
function showNotice({ title, text, retry = false, docTitle }) {
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
    const b = el('button', { type: 'button', class: 'primary' }, 'Zkusit znovu');
    b.addEventListener('click', () => {
      $('#notice').hidden = true;
      $('#main').classList.remove('solo');
      $('#skeleton').hidden = false;
      $('#main').setAttribute('aria-busy', 'true');
      $('#loading-text').textContent = 'Načítám formulář…';
      load();
    });
    box.append(b);
  }
  $('#notice').replaceChildren(box);
  $('#notice').hidden = false;
  if (retry) h1.focus({ preventScroll: true });
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
    label: 'Zandabot — nápověda k formuláři',
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
      title: 'Náhled není k dispozici',
      text: res.status === 401 || res.status === 403
        ? 'Náhled formuláře se otevírá jen po přihlášení do ZandaVisuals OS.'
        : 'Tenhle náhled se nepodařilo najít.',
    };
  }
  if (!formPath) return { kind: 'notfound' };
  const res = await request(formPath);
  if (res.network || res.status >= 500) return { kind: 'error' };
  const d = res.data;
  if (res.status === 404 || d?.stav === 'nenalezen') return { kind: 'notfound' };
  if (d?.stav === 'pozastaveny') return { kind: 'paused', nazev: d.nazev, zprava: d.zprava };
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
      title: 'Formulář se nepodařilo načíst',
      text: 'Zkontrolujte prosím připojení k internetu a zkuste to znovu. Pokud potíže trvají, napište nám.',
      retry: true,
    });
    return;
  }
  if (r.kind === 'notfound') {
    showNotice({
      title: 'Formulář nenalezen',
      text: 'Odkaz je neúplný, nebo formulář už nepřijímá odpovědi. Pokud jste ho dostali od nás, napište nám a pošleme nový.',
    });
    return;
  }
  if (r.kind === 'paused') {
    showNotice({
      title: r.nazev || 'Formulář je pozastavený',
      text: r.zprava || 'Formulář teď nepřijímá odpovědi. Zkuste to prosím později.',
      docTitle: `${r.nazev || 'Formulář'} · ZandaVisuals`,
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
  if (isPreview) $('#preview').hidden = false;

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
        restoredNote = t('Vrátili jsme vaše rozepsané odpovědi. Zkontrolujte je prosím a odešlete znovu.', 'Vrátili jsme tvoje rozepsané odpovědi. Zkontroluj je prosím a odešli znovu.');
      } catch { /* nic */ }
      storage.remove('sessionStorage', recoveryKey());
    }
  }
  const draft = await loadServerDraft();
  applyDefaults();

  renderPage();
  $('#skeleton').hidden = true;
  $('#loading-text').textContent = '';
  $('#form-area').hidden = false;
  $('#main').setAttribute('aria-busy', 'false');
  setupBot();
  render();

  if (draft && typeof draft === 'object' && draft.error) setStatus(draft.error, 'status-error');
  else if (typeof draft === 'string') setStatus(draft);
  else if (restoredNote) setStatus(restoredNote);
}

// ── Události ─────────────────────────────────────────────────────────────────
$('#form').addEventListener('submit', e => {
  e.preventDefault();
  if (!state.schema || state.sending || state.done) return;
  disarmClear();
  if (state.step < steps().length - 1) {
    if (validateStep(state.step)) advanceTo(state.step + 1);
    return;
  }
  submit();
});
$('#back').addEventListener('click', () => {
  if (state.sending || state.step === 0) return;
  goTo(state.step - 1);
});
$('#remember').addEventListener('change', () => {
  if ($('#remember').checked) saveLocal();
  else storage.remove('localStorage', localKey());
});
$('#clear').addEventListener('click', onClear);
$('#clear').addEventListener('blur', () => { if (state.clearArmed) disarmClear(); });
$('#save-later').addEventListener('click', saveLater);

load();
