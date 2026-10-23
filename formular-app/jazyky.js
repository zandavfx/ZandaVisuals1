// Jazyky veřejného formuláře (23. 10. 2026, Žanek: přepínání mezi
// němčinou, češtinou a angličtinou).
//
// 1) Němčina hlášek stránky: slovník „anglické znění → německé“. Volání
//    L(cs, en) a t(formal, informal, en) ve form.js / spolecne.js /
//    jedna-otazka.js tak nemusí nést třetí jazyk; jen texty s proměnnou
//    (`${…}`) mají německé znění přímo jako další argument. Německy se vždy
//    vyká (Sie).
// 2) Překlady textů formuláře (`schema.preklady`): stejné pravidlo překrytí
//    jako runtime/lib/formulare/preklady.ts (prelozSchema) — měnit obě místa
//    (hlídá tests/formular-preklady.test.mjs).
// Čisté ESM bez DOM při importu (jde načíst v node:test).

export const JAZYKY = ['cs', 'en', 'de'];
export const ZKRATKY = { cs: 'CS', en: 'EN', de: 'DE' };
/** Název jazyka v něm samém (popisek přepínače pro čtečky). */
export const NAZVY = { cs: 'Čeština', en: 'English', de: 'Deutsch' };

export const DE = {
  "I'd like a recommendation.": 'Ich hätte gern eine Empfehlung.',
  'en-GB': 'de-DE',
  'en-US': 'de-DE',
  "Saving on this device isn't available. Your answers stay in the open form.": 'Speichern auf diesem Gerät ist nicht verfügbar. Ihre Antworten bleiben im geöffneten Formular.',
  'Please enter a valid email address.': 'Bitte geben Sie eine gültige E-Mail-Adresse ein.',
  'Please select one option.': 'Bitte wählen Sie eine Option.',
  'Please select at least one option.': 'Bitte wählen Sie mindestens eine Option.',
  'Please pick a date.': 'Bitte wählen Sie ein Datum.',
  'Please answer this question.': 'Bitte beantworten Sie diese Frage.',
  'Please add a file.': 'Bitte fügen Sie eine Datei hinzu.',
  'The link must start with http:// or https://.': 'Der Link muss mit http:// oder https:// beginnen.',
  'Invalid date.': 'Ungültiges Datum.',
  'Form · ZandaVisuals': 'Formular · ZandaVisuals',
  QUESTION: 'FRAGE',
  optional: 'optional',
  'Your answer…': 'Ihre Antwort…',
  'you@email.com': 'name@firma.de',
  'The file is empty.': 'Die Datei ist leer.',
  "This file type can't be uploaded here.": 'Dieser Dateityp kann hier nicht hochgeladen werden.',
  images: 'Bilder',
  videos: 'Videos',
  audio: 'Audio',
  "The upload didn't work — please try again, or send a link instead.": 'Das Hochladen hat nicht geklappt – bitte versuchen Sie es erneut oder schicken Sie stattdessen einen Link.',
  'Choose files': 'Dateien auswählen',
  'Choose a file': 'Datei auswählen',
  'Drag a file here, or': 'Datei hierher ziehen oder',
  'Remove file': 'Datei entfernen',
  Remove: 'Entfernen',
  Uploading: 'Wird hochgeladen',
  "Files aren't uploaded in preview.": 'In der Vorschau werden keine Dateien hochgeladen.',
  'Your answers': 'Ihre Antworten',
  "We'll complete this together.": 'Das ergänzen wir gemeinsam.',
  'Edit answer': 'Antwort bearbeiten',
  'Please go through the previous steps in order.': 'Bitte gehen Sie die vorherigen Schritte der Reihe nach durch.',
  STEP: 'SCHRITT',
  'Answer in your own words — short is fine. You can skip optional questions.': 'Antworten Sie in eigenen Worten – kurz genügt. Optionale Fragen können Sie überspringen.',
  'Sending…': 'Wird gesendet…',
  'Uploading files…': 'Dateien werden hochgeladen…',
  'Try again': 'Erneut versuchen',
  'Send answers →': 'Antworten senden →',
  "Your answers couldn't be sent. Nothing is lost — please try again.": 'Ihre Antworten konnten nicht gesendet werden. Nichts ist verloren – bitte versuchen Sie es erneut.',
  "This invitation is no longer valid. Let us know and we'll send you a new one.": 'Diese Einladung ist nicht mehr gültig. Schreiben Sie uns, dann schicken wir Ihnen eine neue.',
  'Please check the highlighted answers.': 'Bitte prüfen Sie die markierten Antworten.',
  "Your answers couldn't be sent.": 'Ihre Antworten konnten nicht gesendet werden.',
  'Please wait until your files finish uploading.': 'Bitte warten Sie, bis Ihre Dateien hochgeladen sind.',
  "Preview complete. Answers aren't sent in preview.": 'Vorschau beendet. In der Vorschau werden keine Antworten gesendet.',
  "We've sent you a confirmation by email.": 'Wir haben Ihnen eine Bestätigung per E-Mail geschickt.',
  "We'll email you a confirmation within a few minutes.": 'Sie erhalten in wenigen Minuten eine Bestätigung per E-Mail.',
  "We couldn't send the confirmation email right now, but your answers are safely saved.": 'Die Bestätigungs-E-Mail konnte gerade nicht gesendet werden, aber Ihre Antworten sind sicher gespeichert.',
  'Thank you, we have your answers.': 'Vielen Dank, wir haben Ihre Antworten.',
  'What happens next': 'Wie es weitergeht',
  'Your answers are saved. You can close this page.': 'Ihre Antworten sind gespeichert. Sie können diese Seite schließen.',
  "Your answers are saved, but the time couldn't be booked — we'll get in touch with another one.": 'Ihre Antworten sind gespeichert, aber der Termin konnte nicht gebucht werden – wir melden uns mit einem anderen.',
  "Drafts aren't saved to the server in preview.": 'In der Vorschau werden Entwürfe nicht auf dem Server gespeichert.',
  'Saving…': 'Wird gespeichert…',
  'Save and finish later': 'Speichern und später fertigstellen',
  "Your draft couldn't be saved. Please try again.": 'Ihr Entwurf konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.',
  'Copy link': 'Link kopieren',
  'The link is valid for 30 days from the last save. If you save again, the same link keeps working.': 'Der Link ist 30 Tage ab dem letzten Speichern gültig. Wenn Sie erneut speichern, funktioniert derselbe Link weiter.',
  Copied: 'Kopiert',
  'The link is selected — please copy it manually.': 'Der Link ist markiert – bitte kopieren Sie ihn manuell.',
  'Your draft is loaded. You can continue.': 'Ihr Entwurf ist geladen. Sie können weitermachen.',
  "Your draft couldn't be loaded. Try opening the link again.": 'Ihr Entwurf konnte nicht geladen werden. Bitte öffnen Sie den Link erneut.',
  "The invitation link is incomplete. Let us know and we'll send a new one.": 'Der Einladungslink ist unvollständig. Schreiben Sie uns, dann schicken wir einen neuen.',
  'Delete draft answers': 'Entwurf löschen',
  'Really delete?': 'Wirklich löschen?',
  'Your draft answers are deleted.': 'Ihr Entwurf ist gelöscht.',
  'Loading form…': 'Formular wird geladen…',
  'Zandabot — form help': 'Zandabot – Hilfe zum Formular',
  'Preview unavailable': 'Vorschau nicht verfügbar',
  'The form preview opens only after signing in to ZandaVisuals OS.': 'Die Vorschau öffnet sich nur nach der Anmeldung in ZandaVisuals OS.',
  "This preview couldn't be found.": 'Diese Vorschau wurde nicht gefunden.',
  "The form couldn't be loaded": 'Das Formular konnte nicht geladen werden',
  'Please check your internet connection and try again. If the problem persists, let us know.': 'Bitte prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut. Wenn das Problem bleibt, schreiben Sie uns.',
  'Form not found': 'Formular nicht gefunden',
  "The link is incomplete, or the form is no longer accepting answers. If you got it from us, let us know and we'll send a new one.": 'Der Link ist unvollständig oder das Formular nimmt keine Antworten mehr an. Wenn Sie ihn von uns haben, schreiben Sie uns, dann schicken wir einen neuen.',
  'This form is paused': 'Dieses Formular ist pausiert',
  "This form isn't accepting answers right now. Please try again later.": 'Dieses Formular nimmt gerade keine Antworten an. Bitte versuchen Sie es später noch einmal.',
  Form: 'Formular',
  "We've restored your draft answers. Please check them and send again.": 'Wir haben Ihren Entwurf wiederhergestellt. Bitte prüfen Sie die Antworten und senden Sie erneut.',
  'Please choose a value.': 'Bitte wählen Sie einen Wert.',
  'Please pick a time.': 'Bitte wählen Sie einen Termin.',
  "Please write an answer, or choose “I'd like a recommendation.”": 'Bitte schreiben Sie eine Antwort oder wählen Sie „Ich hätte gern eine Empfehlung.“',
  'Invalid choice.': 'Ungültige Auswahl.',
  'Please enter a valid number.': 'Bitte geben Sie eine gültige Zahl ein.',
  'Please enter a valid phone number.': 'Bitte geben Sie eine gültige Telefonnummer ein.',
  Yes: 'Ja',
  No: 'Nein',
  '+44 20 7946 0000': '+49 30 123456',
  'Loading available times…': 'Freie Termine werden geladen…',
  Day: 'Tag',
  Time: 'Uhrzeit',
  "There are no free times right now. Send the form and we'll get in touch.": 'Gerade sind keine Termine frei. Senden Sie das Formular, wir melden uns.',
  'Preview: sample times. The published form shows real free times.': 'Vorschau: Beispieltermine. Das veröffentlichte Formular zeigt echte freie Termine.',
  'Pick a day and time. Times are in your time zone.': 'Wählen Sie Tag und Uhrzeit. Die Zeiten sind in Ihrer Zeitzone.',
  "Free times couldn't be loaded right now.": 'Freie Termine konnten gerade nicht geladen werden.',
  'Form progress': 'Fortschritt im Formular',
  Back: 'Zurück',
  'Draft answers': 'Entwurf',
  Close: 'Schließen',
  'Leave this empty': 'Bitte leer lassen',
  'Back to review': 'Zurück zur Übersicht',
  Continue: 'Weiter',
  Start: 'Starten',
  'or press Enter ↵': 'oder Enter ↵ drücken',
  'Shift + Enter = new line · Enter = next': 'Umschalt + Enter = neue Zeile · Enter = weiter',
  'Enter ↵ = next': 'Enter ↵ = weiter',
  Edit: 'Bearbeiten',
  'Go through again': 'Noch einmal durchgehen',
  'Sample video': 'Beispielvideo',
  "The video couldn't be loaded. You can fill in the form without it.": 'Das Video konnte nicht geladen werden. Sie können das Formular auch ohne Video ausfüllen.',
  // Statické texty index.html (applyLanguage ve form.js).
  'Form preview ': 'Formularvorschau ',
  '— answers are not sent': '– Antworten werden nicht gesendet',
  'ZandaVisuals — main website': 'ZandaVisuals – Hauptwebsite',
  'PREPARED FOR ': 'VORBEREITET FÜR ',
  'Form steps': 'Schritte des Formulars',
  '← Back': '← Zurück',
  ' Remember my draft answers on this device': ' Entwurf auf diesem Gerät merken',
  'Close help': 'Hilfe schließen',
  'Form help': 'Hilfe zum Formular',
  'Open Zandabot help': 'Zandabot-Hilfe öffnen',
  'Form language': 'Sprache des Formulars',
  "We've kept your answers in the new language.": 'Ihre Antworten haben wir in die neue Sprache übernommen.',
};

/** Text v jazyce: čeština, angličtina, němčina (vlastní znění, jinak slovník, jinak anglicky). */
export function textVJazyce(jazyk, cs, en, de) {
  if (jazyk === 'en') return en;
  if (jazyk === 'de') return de ?? DE[en] ?? en;
  return cs;
}

// ── Překlady textů formuláře (kopie lib/formulare/preklady.ts) ────────────────
const objekt = x => !!x && typeof x === 'object' && !Array.isArray(x);
const vlastni = (o, k) => (o && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);
const text = x => (typeof x === 'string' && x.trim() ? x : undefined);
const texty = x => (Array.isArray(x) && x.length > 0 && x.every(v => typeof v === 'string') ? x : undefined);
const POLE_STRANKY = ['titulek', 'proKoho', 'nadtitulek', 'nadpis', 'nadpisZvyrazneni', 'uvod', 'doplnek', 'poznamka', 'poznamkaSilna'];

export const zakladniJazyk = schema => (JAZYKY.includes(schema?.jazyk) ? schema.jazyk : 'cs');

/** Jazyky formuláře: základní první, pak překlady v pevném pořadí. */
export function jazykyFormulare(schema) {
  const zaklad = zakladniJazyk(schema);
  const p = objekt(schema?.preklady) ? schema.preklady : {};
  // Prázdný překlad ({}) jazyk do přepínače nepřidá.
  return [zaklad, ...JAZYKY.filter(j => {
    const t = vlastni(p, j);
    return j !== zaklad && objekt(t) && Object.keys(t).length > 0;
  })];
}

/** Schéma v jazyce (základní / bez překladu = totéž schéma). */
export function prelozit(schema, jazyk) {
  if (jazyk === zakladniJazyk(schema)) return schema;
  const p = vlastni(objekt(schema.preklady) ? schema.preklady : undefined, jazyk);
  if (!objekt(p)) return schema;

  const ps = objekt(p.stranka) ? p.stranka : {};
  const zs = schema.stranka ?? {};
  const stranka = { ...zs };
  for (const k of POLE_STRANKY) {
    const t = text(ps[k]);
    if (t !== undefined) stranka[k] = t;
  }
  if (objekt(ps.coDal) && zs.coDal) stranka.coDal = { shrnuti: text(ps.coDal.shrnuti) ?? zs.coDal.shrnuti, odstavce: texty(ps.coDal.odstavce) ?? zs.coDal.odstavce };
  if (objekt(ps.souhrnKarta) && zs.souhrnKarta) stranka.souhrnKarta = { nadpis: text(ps.souhrnKarta.nadpis) ?? zs.souhrnKarta.nadpis, odstavce: texty(ps.souhrnKarta.odstavce) ?? zs.souhrnKarta.odstavce };
  const pat = texty(ps.paticka);
  if (pat && pat.length === 2 && zs.paticka) stranka.paticka = [pat[0], pat[1]];

  const pk = objekt(p.kroky) ? p.kroky : {};
  const kroky = schema.kroky.map(k => {
    const t = vlastni(pk, k.id);
    if (!objekt(t)) return k;
    const out = { ...k };
    if (text(t.nazev)) out.nazev = t.nazev;
    if (text(t.uvod) && k.uvod !== undefined) out.uvod = t.uvod;
    if (text(t.tip) && k.tip !== undefined) out.tip = t.tip;
    return out;
  });

  const po = objekt(p.otazky) ? p.otazky : {};
  const otazky = schema.otazky.map(o => {
    const t = vlastni(po, o.id);
    if (!objekt(t)) return o;
    const out = { ...o };
    if (text(t.label)) out.label = t.label;
    if (text(t.napoveda) && o.napoveda !== undefined) out.napoveda = t.napoveda;
    if (text(t.placeholder) && o.placeholder !== undefined) out.placeholder = t.placeholder;
    if (texty(t.navrhy) && Array.isArray(o.navrhy)) out.navrhy = t.navrhy;
    if (objekt(t.moznosti) && Array.isArray(o.moznosti)) {
      out.moznosti = o.moznosti.map(m => {
        const l = text(vlastni(t.moznosti, m.id));
        return l ? { ...m, label: l } : m;
      });
    }
    if (objekt(t.skala) && o.skala) {
      const od = text(t.skala.popisOd);
      const doo = text(t.skala.popisDo);
      out.skala = { ...o.skala, ...(od && o.skala.popisOd !== undefined ? { popisOd: od } : {}), ...(doo && o.skala.popisDo !== undefined ? { popisDo: doo } : {}) };
    }
    return out;
  });

  const pp = objekt(p.potvrzeni) ? p.potvrzeni : {};
  const zp = schema.potvrzeni ?? {};
  const potvrzeni = { ...zp, nadpis: text(pp.nadpis) ?? zp.nadpis, text: text(pp.text) ?? zp.text };
  if (texty(pp.dalsiKroky) && zp.dalsiKroky) potvrzeni.dalsiKroky = pp.dalsiKroky;
  const tl = objekt(pp.tlacitko) ? text(pp.tlacitko.text) : undefined;
  if (tl && zp.tlacitko) potvrzeni.tlacitko = { ...zp.tlacitko, text: tl };

  return { ...schema, jazyk, nazev: text(p.nazev) ?? schema.nazev, stranka, kroky, otazky, potvrzeni };
}

/**
 * Jazyk, ve kterém stránku ukázat: ?lang= v adrese > dřívější volba na tomhle
 * zařízení > jazyk prohlížeče > základní jazyk formuláře. Jen dostupné jazyky.
 */
export function vybratJazyk(schema, { zAdresy = null, ulozeny = null, prohlizec = [] } = {}) {
  const dostupne = jazykyFormulare(schema);
  if (dostupne.includes(zAdresy)) return zAdresy;
  if (dostupne.includes(ulozeny)) return ulozeny;
  for (const l of prohlizec) {
    const j = String(l ?? '').slice(0, 2).toLowerCase();
    if (dostupne.includes(j)) return j;
  }
  return dostupne[0];
}
