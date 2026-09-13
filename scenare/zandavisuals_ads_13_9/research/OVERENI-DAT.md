# Veřejná data, zdroje a hranice tvrzení

Sběr 8. 9. 2026. Aktuální zadání Žanka je autorita pro kreativní směr a jeho vlastní zkušenost. Historické prompty se nepřebírají jako současná nabídka nebo důkaz výsledků. Číselné karty v HTML jsou naše vizualizace skutečných veřejných dat, nikoli screenshot interních Instagram Insights.

## POV Dealer: celá dohledatelná historie

| Údaj | Zjištění | Co přesně znamená |
|---|---:|---|
| Sledující | 4 637 | Aktuální veřejný stav, nikoli počet všech lidí, kteří kdy dali follow |
| Příspěvky dle profilu | 24 | Počet z profilu, jiná množina než scrape Reels včetně variant |
| Dohledané unikátní Reels | 112 | Všechny výsledky actoru s limitem 1 000 a zahrnutím zkušebních Reels; deduplikace shortCode |
| Součet přehrání | 3 577 975 | Součet videoPlayCount právě těchto 112 videí; opakovaná přehrání i různé varianty se započítají |
| Nejstarší dostupné video | DO6FGOBjD13 | 22. 9. 2025, 14:15:06 UTC |
| Přehrání tohoto videa | 196 928 | Proto ve scénáři „skoro / téměř 200 tisíc“, nikoli přesně 200 000 |

Start od nuly a tvrzení, že šlo o první video, pochází přímo od Žanka. Scrape dokládá nejstarší **dostupné** video a dnešní stav. Neobsahuje historickou křivku sledujících, odhlášení, smazaná videa ani interní celkový dosah. Nevytvářeli jsme falešnou růstovou křivku z nuly. Nejde ani o doložené tržby nebo získané klienty.

### Proč neuvádíme 5× jako potvrzený výsledek

Druhý běh scraperu s `skipTrialReels=true` vrátil 22 videí. Jejich shortCode jsme spojili s prvním snapshotem, abychom nemíchali různé okamžiky počítání. V tomtéž snapshotu mají 1 615 281 přehrání; dalších 90 videí má 1 962 694. Celkem / filtrovaný soubor = **2,215×**. Druhý běh samotný vykázal o jedno přehrání více, proto se pro výpočet nepoužil jeho počet views.

Tohle je popis dvou množin nalezených scraperem. Není to experiment, kolik by tentýž účet získal bez Trial Reels. Actor nevrátil ověřitelný příznak Trial u každého příspěvku. Ani poměr 2,215× nepřevádíme na prokázaný účinek funkce nebo na unikátní dosah. Uživatelské „5×“ zůstává zkušenost, pro jejíž kvantifikaci by bylo potřeba vymezit srovnávané varianty, období a metriku v Insights. Pět variant ≠ automaticky pětinásobný výsledek.

### Podobná videa dalších dealerů

Žanek uvádí, že po POV Dealerovi začal pozorovat stejné POV zpracování a stejný zvuk u dalších dealerů. Scénář tuto pasáž zachovává jako **jeho osobní pozorování**. Konkrétní účty, videa a časová posloupnost zatím dodané nejsou. Nelze nezávisle doložit převzetí od konkrétního autora. Názvy konkurentů ani falešné srovnání jsme nedoplnili.

## VERYGUD / Ivan Bartoš

Zdroj: [originální Reel DakAV9kMeyq](https://www.instagram.com/reel/DakAV9kMeyq/), účet verygud.cz, timestamp actoru 9. 7. 2026, délka 64,1785 s, **422 474 přehrání** podle videoPlayCount.

Stažený [MP4](bartos/DakAV9kMeyq/video.mp4), [automatický přepis ze zvuku](bartos/DakAV9kMeyq/transcript.md), [JSON přepisu](bartos/DakAV9kMeyq/transcript.json). ASR: lokální Whisper large-v3-mlx, čeština; celý přepis není ručně jazykově opravený. Případné chyby u jmen a výrazů nejsou nové faktické údaje.

- 0–1,1 s: otázka na měsíční výdělek.
- Přibližně 1,1–1,4 s: Bartoš v obraze, náznak odpovědi.
- Od 1,4 s: rozhovor s dalším respondentem.
- Přibližně 28,9 s: Bartoš mluví o práci.
- 38,4–39,5 s: otázka na výdělek.
- 39,6–41,2 s: jeho odpověď.

Úvod byl kontrolován na snímcích 0 / 0,5 / 0,8 / 1,2 s; jde o teaser, nikoli celou odpověď přesunutou na začátek. Časové body řeči pocházejí z ASR a jsou orientační. Publikovaný výsledek sám nedokazuje příčinu úspěchu. Původní nepublikovaný střih bez teaseru ani jeho výkon nemáme. Ukázka „bez hooku“ je proto výslovně **rekonstrukce z publikovaného videa**, bez vymyšleného počtu views.

## Hooky pro české Meta reklamy: co jsme skutečně našli

Neexistuje zde doložený univerzální „nejlepší hook v ČR“. Kombinujeme veřejné primární zdroje, českou agenturní praxi a přímé rozbory tvůrce. Výsledkem jsou návrhy pro konkrétní cílovku, ne statisticky ověřené vítězné reklamy.

- [Meta Reels Ads](https://www.facebook.com/business/ads/facebook-instagram-reels-ads): vertikální obraz 9:16, zvuk a bezpečné umístění důležitých prvků. Veřejně dostupná část zdroje; úplné otevření přesměrovávalo na přihlášení. Nepřevzali jsme číselné sliby snížení nákladů.
- [Gameplan — Kreativa Meta Ads](https://www.gameplan.cz/blog/kreativa-meta-ads/): vlastní česká praxe doporučuje důvod zastavit se v prvních 2–3 sekundách, srozumitelný text, autentickou ukázku a konkrétní nabídku. Přeneseno jako princip: ihned téma, relevantní problém a viditelný důkaz. Jejich marketingová procenta ani tvrzení o algoritmu nebereme jako univerzální důkaz.
- [Skroluj — Dopner](https://www.skroluj.cz/case-studies/dopner): vlastní česká případová studie ukazuje zpracování běžného podnikání přes konkrétní situace a opakovatelný formát. Použito pro POV rozbor. Nepřebíráme jejich výsledky za naše.
- Kallaway — místní výběr ze skutečných audio přepisů (místní podklad): soulad obrazu, textu a řeči; konkrétní důkaz; srozumitelná otevřená otázka; názorné srovnání. Jeho neurovědecké zkratky a absolutní přísliby nepřebíráme.

Pro tyto reklamy: malý štítek cílovky + jedna hlavní věta; konkrétní ukázka od začátku; zbytek videa naplní její slib. Retence pomáhá diagnostikovat střih. Pro obchodní úspěch navíc sledujeme relevantní DM a domluvené spolupráce, nikoli jen views.

## Trial Reels: ověřená funkce vs návrh postupu

[Meta, původní vysvětlení funkce](https://about.fb.com/news/2024/12/trial-reels-try-content-non-followers-first-see-what-perfoms-best/): zkušební Reel se nejprve distribuuje lidem mimo sledující. Může se přesto dostat i k některým sledujícím například sdílením. Zhruba po 24 hodinách jsou dostupné první views a reakce; lze zvolit sdílení všem, případně automatické sdílení podle views v prvních 72 hodinách. Není to garantovaný růst ani placený reklamní A/B test.

[Meta, červen 2025](https://about.fb.com/news/2025/06/inspiring-creativity-that-brings-people-together/): rozšíření dostupnosti. Před výrobou se musí použít aktuální skutečné rozhraní konkrétního účtu. Skript nespoléhá na staré omezení 1 000 sledujících.

Pět začátků, jedna měněná věc, kontrola stejně starých verzí a nové zpracování vlastního staršího materiálu jsou **náš doporučený pracovní postup**. Meta těmito zdroji negarantuje jeho účinnost ani identické publikum jednotlivých verzí. Retence může být dostupná v dalších Insights; ve scénáři je podmíněná dostupností.

## Social proof

Databáze referencí (místní podklad) obsahuje 40 historických referencí potvrzených Žankem, s konkrétními portfolii. Není to seznam 40 právě aktivních klientů. Část prací vznikla subdodávkou. Přesná formulace ve scénářích: „Stříhal jsem pro víc než třicet tvůrců a značek.“ Role je střih; pouze u POV Dealera je potvrzen i širší Instagram proces. Žádné vypůjčené výkonnostní výsledky ostatních značek.

HTML obsahuje jména skutečných referencí s odkazy na práci. To jsou typografické popisky, **ne vytvořená loga**. Režie plánuje originální loga značek / schválené avatary tvůrců do závěrečného social proofu. Aktuální projektový kontext uvádí, že originální loga dodá Žanek; zatím nejsou kompletně k dispozici. Za hotovou logo animaci tento návrh nevydáváme.

## Reprodukovatelné soubory

- profiles.json: veřejné profily.
- reels-raw.json: 238 výsledků, z toho 112 POV, 125 Kallaway včetně 6 spoluautorských, 1 Bartoš.
- pov-without-trials.json: 22 výsledků při vypnutí zkušebních Reels.
- kallaway-all-posts.json: 155 příspěvků, 114 videí + 41 carouselů. V carouselech 81 videí.
- metrics-summary.json: přepočítané součty a pokrytí.
- archive-progress.json + jednotlivé download.json/transcript.json: reálný stav stažení a ASR.

Kallaway se třídí podle vstupního profilu, ne jen ownerUsername: jinak by se chybně ztratilo 6 spoluautorských Reels. Spojení top-level postů a Reels dává 166 příspěvků, shodně s veřejným postsCount. To není záruka dostupnosti smazaných či neveřejných položek. Video archiv obsahuje také jednotlivé videopoložky carouselů.
