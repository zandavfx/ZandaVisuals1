// Odkazy, které stránka otevírá přímo (e-mail), se započítají zvlášť: krátký POST na /go/<slug>.
// Bez cookies a identifikátorů; když prohlížeč sendBeacon nemá, odkaz funguje dál.
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-pocitat]');
  if (a && navigator.sendBeacon) navigator.sendBeacon(a.dataset.pocitat);
});
