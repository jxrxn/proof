# Plan: mindre laddningsstorlek med bibehållna funktioner

Datum: 2026-10-29  
Status: planerad; optimeringarna är inte genomförda.

## Mål

Minska storleken på Proofs byggda HTML och överföringen vid webbhosting utan
att ändra tidsstämplingens eller verifieringens beteende. Prioritera en
webbläsaranpassad OpenTimestamps-bundle, därefter typsnitt och komprimering
vid hosting. Genomför och utvärdera varje ändring separat.

## Krav som ska bevaras

- `dist/index.html` ska innehålla all kod, CSS och alla typsnitt som behövs
  för samma funktion och språktäckning som i dag. Inga nya CDN-anrop.
- Körning från `file://` ska bevaras med nuvarande nätverksberoenden och
  webbläsarbegränsningar. Chrome är nuvarande verifierade referens.
- Skapa `.ots`, läsa befintliga bevis, uppgradera bevis och verifiera
  Bitcoin-förankring ska fungera som tidigare.
- Streamad storfilshashning, worker, fallback, progress, avbrytning och
  skydd mot resultat från tidigare indata ska bevaras.
- ZIP-skapande och ZIP-verifiering ska behålla 100 MB-gränsen och befintliga
  skydd, inklusive gränsen för `.ots`-poster.
- Originalinnehåll och filnamn ska stanna lokalt. Gränsen mellan appen och
  OTS ska fortsatt ta enbart SHA-256-digesten. Kalenderanropens commitment
  hanteras av OTS; nätverkspayload ska jämföras mot referensbygget.
- Samma språk, tecken, fontvikter och visuella utformning ska stödjas.
- Källproveniens, ändringar, bygginstruktioner och tredjepartsnotiser ska
  följa de komponenter som faktiskt distribueras.

## Utgångsläge

Kontroll den 29 oktober 2026, utifrån commit `4b0069c`:

| Mått | Resultat |
|---|---|
| Produktionsbygge inklusive typkontroll | Godkänt |
| Enhetstester | 16 godkända i fyra testfiler |
| `dist/index.html`, Vites storleksrapport | 2 118,16 kB rå; 752,48 kB gzip |
| E2E i denna kontroll | Inte kört |

Den äldre uppdelningen i `PERFORMANCE.md` visar att OTS och typsnitt står
för cirka 93 procent av gzip-storleken. Mät om delarna före implementation;
blanda inte äldre delmätningar med nya totalsiffror.

## Steg 1: etablera en jämförbar referens

- [ ] Spara commit-id, Node-/npm-version, byggkommandon och komprimeringsnivåer.
- [ ] Mät råstorlek, gzip och Brotli för HTML samt separata storlekar för
      OTS, CSS/typsnitt och appkod med ett återanvändbart mätskript.
- [ ] Kör `npm run test:unit`, `npm run build` och `npm run e2e`.
- [ ] Dokumentera testmiljö och externa nätverksfel separat från appfel.
- [ ] Spara ett referensbygge utanför `dist/`, som skrivs över vid bygge.
- [ ] Dokumentera aktuella resultat för pending, upgrade, verified,
      felaktigt original och trasigt bevis. Kartlägg vilka fall E2E redan täcker.

**Klart när:** referensbygget och dess mätningar kan användas för jämförelse,
och eventuella befintliga testproblem är dokumenterade.

## Steg 2a: provbygg med enbart Bitcoin Core-stub

Berör främst `src/vendor/opentimestamps.min.js`, `vite.config.ts` och nya
byggverktyg. Behåll OTS-version 0.4.9 i denna ändring för att isolera effekten.

- [ ] Identifiera den exakta upstream-källan bakom dagens bundle. Lås
      Git-commit och kontrollsumma; utgå inte från npm-paketets versionsnummer.
- [ ] Kartlägg modulvägen för lokal Bitcoin Core/RPC och hur biblioteket
      väljer Esplora i webbläsaren, inklusive fel- och fallback-beteende.
- [ ] Skapa ett separat provbygge som ersätter den lokala nodmodulen med
      en minimal stub med samma nödvändiga gränssnitt och felbeteende.
      Stubben får aldrig returnera ett lyckat verifieringsresultat.
- [ ] Behåll OTS parsning, serialisering, hashoperationer, kalenderlogik,
      uppgradering och Esplora-verifiering oförändrade.
- [ ] Kontrollera bundlens modulrapport: bitcore och beroenden som enbart
      behövs för nodvägen ska vara borta. Granska kvarvarande polyfills.
- [ ] Bevara `window.OpenTimestamps`, det API appen använder och ordningen
      mellan det klassiska inline-skriptet och appmodulen.
- [ ] Mät både bundlen och hela HTML-filen med samma metod som referensen.

**Storlekshypotes:** ingen numerisk prognos före provbygget. Bundlen
innehåller även `crypto-browserify` och `request`/`request-promise` med stora
beroendeträd. `elliptic` och `bn.js` kan därför finnas kvar även när bitcore
försvinner. Under 200 kB är inte en underbyggd prognos för denna åtgärd.

**Beslutspunkt:** inför kandidaten först när den ger en tydlig uppmätt
besparing och klarar steg 3. Vi byter då bort det officiella distribuerade
bygget mot ett eget modifierat bygge och tar ansvar för underhåll och
verifiering. Reproducerbarhet hjälper granskning men bevisar inte korrekthet;
att bygget är officiellt innebär inte heller att det är oberoende granskat.
Behåll originalet om vinsten inte motiverar detta ansvar.

## Steg 2b: separat beslut om mindre crypto- och HTTP-adaptrar

Detta är ett valfritt fortsättningsarbete efter mätning av 2a, med egen
ändring och beslutspunkt. Det omfattas inte av löftet i 2a att lämna
hashoperationer och nätverkslager oförändrade.

- [ ] Kartlägg exakt vilka crypto- och request-API:er OTS faktiskt använder.
- [ ] Prova separat en minimal synkron `createHash`-adapter för erforderliga
      algoritmer: SHA-1 (`OpSHA1` i befintliga bevis), RIPEMD-160 och SHA-256.
      Utvärdera `@noble/hashes` som konkret bibliotekskandidat; kontrollera
      vald versions API, licens, granskningsunderlag och uppmätta bundlestorlek
      före införande och lås versionen. Skriv inga egna hashimplementationer.
      Web Crypto och appens nuvarande hash-wasm-anrop är asynkrona och kan
      inte förutsättas vara direkta ersättningar för det synkrona OTS-API:t.
- [ ] Ersätt även `crypto.randomBytes` med en kompatibel adapter som använder
      `crypto.getRandomValues` och bevarar erforderligt returformat. Om säker
      slump saknas eller misslyckas ska stämplingen avbrytas med ett tydligt
      fel. Ingen fallback till `Math.random`, konstant eller svag slump tillåts.
      Hantera `getRandomValues` storleksgräns om större anrop stöds.
- [ ] Testa att två stämplingar av samma digest skickar olika commitments
      till samma kalender med fasta nätverkssvar och verklig säker slump.
      Testa dessutom med två kontrollerade nonce-värden att adaptern använder
      slumpkällan och att noncen påverkar payloaden. Testdubblar får endast
      finnas i tester. Testa att saknad/felande säker slump ger fel och inga
      kalender-POST:ar. Olika payloads ensamt bevisar inte säker slump.
- [ ] Verifiera kända hashvektorer, binära indata, upprepade `update`,
      digestformat och OTS-operationer mot originalet.
- [ ] Prova därefter separat en fetch-adapter för kalender- och Esplora-anrop.
      Bevara binära svar/request bodies, status- och felhantering, headers,
      CORS, timeout och de avbrottsbeteenden som faktiskt används.
- [ ] Testa adaptrarna med fasta nätverkssvar och fel samt steg 3:s
      verifieringsfall. Kontrollera att Bitcoin-attesteringar inte accepteras
      på svagare villkor än i originalet.
- [ ] Mät varje adapter separat och därefter tillsammans.

**Beslutspunkt:** detta ändrar kryptografiska och nätverksmässiga byggstenar
som verifieringen beror på och kräver egen testning. Inför bara styrkta
beteendeekvivalenta ändringar vars besparing motiverar underhållskostnaden.
Ingen egen implementation av `.ots`-formatet eller svagare verifiering ingår.

## Steg 3: verifiera och inför OTS-kandidaten

- [ ] Jämför original och kandidat med samma fasta `.ots`-fixtures:
      parsning/serialisering, digest, attesteringar och verifieringsresultat.
- [ ] Kontrollera verklig kalenderstampning och att sparade bevis går att
      läsa igen. Nya bevis behöver inte vara byteidentiska eftersom OTS
      använder slumpning och externa kalendersvar.
- [ ] Testa pending samt en deterministisk upgrade från ett sparat
      kalendersvar. Komplettera med live-upgrade när tillgängliga bevis
      tillåter det, utan att göra testsviten beroende av ny Bitcoin-förankring.
- [ ] Kör det befintliga förankrade hello-world-beviset till VERIFIED.
- [ ] Säkerställ att fel original, skadad `.ots` och nätverksfel inte ger
      VERIFIED. Jämför felhanteringen med originalet.
- [ ] Kör befintlig E2E för storfil, worker/fallback, cancel, ZIP-skydd,
      paketets round-trip och nätverkspayload. Lägg endast till tester där
      relevanta beteenden saknar täckning.
- [ ] Kör automatiserad Chrome-kontroll från `file://` för varje kandidat.
      Den fullständiga manuella webbläsarmatrisen körs en gång i steg 6.
- [ ] Gör payloadtestet förutsägbart med fasta kalender-/HTTP-svar och
      kontrollerade indata. Testa payloadens struktur och frånvaro av
      original/filnamn; blanda inte ihop digesten med OTS maskerade commitment.
      Behåll verkliga kalenderanrop som ett separat nätverksberoende röktest.
- [ ] Lägg in låsta byggberoenden, byggskript, upstream-referens, patch/stub,
      kontrollsummor och instruktion för att återskapa vendorn.
- [ ] Uppdatera `OTS-BUNDLE.md`, `THIRD-PARTY-NOTICES.md`, `NOTICE.txt` och
      byggnotiser där innehållet faktiskt ändras. Markera uttryckligen OTS
      som modifierat i `NOTICE.txt` och HTML-bannern i `vite.config.ts`, med
      ändringarnas innehåll och datum. Tillhandahåll den modifierade källan,
      patch/stub och byggskript via den dokumenterade källdistributionen.
      Ta bara bort attribution för beroenden som verifierat saknas i
      slutprodukten.

**Klart när:** relevanta kontroller passerar, inga nya externa anrop eller
beteendeförändringar har införts och bundlen kan återskapas från låsta källor.
Samma acceptanskrav gäller alla kandidater från både 2a och 2b; för 2b
krävs dessutom adaptertesterna ovan, inklusive säker slump och alla tre
hashalgoritmerna. En VERIFIED-fixture ensam räcker inte.

## Steg 4: optimera inbakade typsnitt

Berör `src/fonts/`, `src/style.css` och dokumenterade verktyg för fontbygge.
Potentialen är begränsad: den tidigare uppskattningen om cirka 170 kB gällde
externa fontfiler och gäller inte denna plan. Att begränsa viktaxeln kan
möjligen spara några tiotal kB, men det måste mätas. WOFF2 är redan
komprimerat; gzip av base64-data ger ingen motsvarande stor extravinst.
Gör först ett storleksprov och gå vidare till visuell kontroll bara om
besparingen motiverar arbetet.

- [ ] Inventera använda vikter även i HTML, dynamisk markup och element
      som kan ärva webbläsarens standardvikter. CSS visar i dag 400, 600 och 700.
- [ ] Jämför Inter begränsad till intervallet 400–700 med statiska filer
      för de faktiskt använda vikterna. Mät slutlig HTML, inte bara WOFF2.
- [ ] Behåll alla nuvarande språk-subsets, teckentäckning och `unicode-range`.
      Behåll JetBrains Mono om mätning inte visar en motiverad förbättring.
- [ ] Anpassa `@font-face` till de producerade fontfilerna.
- [ ] Jämför skärmbilder för alla vikter, svenska, latin-ext, grekiska,
      kyrilliska och vietnamesiska samt befintlig systemfont-fallback.
      Kontrollera radbrytningar, syntetiska vikter och layoutförskjutning.
- [ ] Dokumentera fontkälla, låsta verktyg, kommandon och modifieringar.
      Kontrollera fontlicensens villkor för modifiering och namn.

**Beslutspunkt:** behåll bara en variant som ger mindre HTML efter
komprimering och bevarar utseende och teckentäckning. Att flytta typsnitt
till externa filer ingår inte eftersom ensam-HTML-stödet ska behållas.

## Steg 5: mät faktisk leverans från GitHub Pages

`SITE_URL` i `src/icons/icons.ts` pekar på `https://jxrxn.github.io/proof/`.
Planera ingen egen header- eller Brotli-konfiguration i Pages.

- [ ] Mät en gång vad Pages faktiskt levererar för HTML vid förhandling av
      komprimering: `Content-Encoding`, `Vary`, cacheheaders och överförda byte.
      Notera om den publicerade filen skiljer sig från den lokala kandidaten.
- [ ] Redovisa lokalt beräknad Brotli enbart som teoretisk jämförelse om
      servern inte levererar Brotli. Räkna den inte som en realiserad vinst.

Byte av hosting eller publicering ingår inte. Råstorlek och uppmätt faktisk
överföring är huvudmåtten; någon ändring av Pages konfiguration planeras inte.

## Steg 6: slutkontroll och dokumentation

- [ ] Kör enhetstester och full E2E mot slutversionen. E2E bygger en variant
      med testhooks; avsluta därför med `npm run build` för produktionsfilen.
- [ ] Kontrollera att produktionsbygget saknar aktiverade testhooks och
      fortfarande innehåller all nödvändig kod, CSS och alla typsnitt.
- [ ] Mät referens och slutversion med samma komprimeringsinställningar.
- [ ] Uppdatera `PERFORMANCE.md`, `OTS-BUNDLE.md`, `README.md` och
      `CHANGELOG.md` med faktiska resultat och kvarvarande begränsningar.
- [ ] Redovisa före/efter per åtgärd och totalt: råstorlek, gzip, Brotli,
      besparing i byte/procent, testresultat och ej verifierade miljöer.
- [ ] Kör slutlig webbläsarmatris: Chrome via `file://`, HTTP och tillgänglig
      HTTPS-testmiljö samt manuella röktester i Firefox och Safari. Redovisa
      uttryckligen miljöer som inte kunnat verifieras.
- [ ] Gör en Lighthouse-körning före och efter under samma förutsättningar
      som en orienterande kontroll av FCP/LCP, TBT och CLS. Bytebesparing är
      huvudmåttet; enstaka körningar styrker inte en exakt tidsvinst. Upprepa
      endast om resultatet antyder regression eller behöver utredas.

## Leveranser och återställning

Gör separata, granskningsbara ändringar för referens/mätverktyg,
OTS-bundle (2a och varje adapter i 2b separat), typsnitt och leveransmätning. Varje optimering ska
kunna återställas oberoende. Originalbundlen ska kunna återfås från det
dokumenterade Git-referensläget; spara inte dubbla bundles i produktions-HTML.

Arbetet är klart när införda optimeringar ger dokumenterad storleksvinst,
samtliga relevanta funktionstester passerar och distributionen fortfarande
uppfyller kraven ovan. Redovisa avvisade kandidater och kvarvarande
begränsningar öppet; sätt inget slutligt storlekslöfte före provbygget.

## Underlag

- [Nuvarande prestandaanalys](PERFORMANCE.md)
- [Analys av OTS-bundlen](OTS-BUNDLE.md)
- [Funktioner och distributionskrav](README.md)
- [E2E-tester](test/e2e.mjs)
- [Byggkonfiguration](vite.config.ts)
