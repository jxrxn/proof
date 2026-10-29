# Handoff till nästa session

Datum: 2026-10-29

## Uppdrag och läge

Användaren vill minska Proofs laddningsstorlek med bibehållna funktioner.
En arbetsplan har skrivits och reviderats efter två tekniska granskningar
som användaren förmedlade från Claude. Inga optimeringar eller ändringar i
appkod, byggkonfiguration, beroenden eller vendor-bundle har genomförts.

Den senaste beställningen var att skriva denna handoff och committa den
tillsammans med dokumentationsändringarna. Nästa session ska utgå från
[LOAD-SIZE-PLAN.md](LOAD-SIZE-PLAN.md), inte från äldre storleksprognoser.

## Dokument att läsa

- [LOAD-SIZE-PLAN.md](LOAD-SIZE-PLAN.md): huvudplan med checklistor,
  beslutspunkter, acceptanskrav och återställning.
- [OTS-BUNDLE.md](OTS-BUNDLE.md): korrigerad analys av beroenden och risker.
- [PERFORMANCE.md](PERFORMANCE.md): historiska mätningar, nu förtydligade
  så att avvisade alternativ inte framstår som nästa steg.

## Viktiga beslut och korrigeringar

- Behåll ensam, självbärande `dist/index.html`, befintlig fonttäckning,
  `file://`-stöd och alla befintliga funktioner och skydd.
- Lås OTS till nuvarande 0.4.9 och identifiera exakt upstream-Git-källa.
  Byt inte version samtidigt som storleksoptimeringen.
- Steg 2a är enbart stub för den lokala Bitcoin Core-vägen. Crypto- och
  HTTP-lagren lämnas oförändrade. Stubben får aldrig ge lyckad verifiering.
- Prognosen att enbart bitcore-stubben ger en bundle under 200 kB har dragits
  tillbaka. Bundlen innehåller även crypto-browserify och request-träden;
  deras separata bidrag är inte uppmätta.
- Steg 2b är valfritt separat arbete: mindre crypto- och HTTP-adaptrar,
  med egna tester och samma funktionella acceptanskrav som 2a.
- Crypto-adaptern behöver SHA-1, RIPEMD-160 och SHA-256 samt `randomBytes`.
  Utvärdera `@noble/hashes` med kontroll av vald version och storlek. Skriv
  inga egna hashimplementationer. OTS behöver ett synkront gränssnitt.
- `randomBytes` ska använda `crypto.getRandomValues`. Saknad eller felande
  säker slump ska stoppa stämpling tydligt; aldrig `Math.random` eller annan
  svag fallback. Testa både olika payloads för samma digest och att noncen
  faktiskt påverkar commitmenten, samt fel utan kalender-POST vid slumpfel.
- Använd fasta nätverkssvar för deterministiska tester; verkliga anrop är
  separata röktester. En enda VERIFIED-fixture räcker inte för 2b.
- En modifierad OTS-bundle ska uttryckligen märkas som modifierad i
  `NOTICE.txt` och HTML-bannern, med ändringar/datum samt tillgänglig
  modifierad källa, patch/stub och byggskript. Detta är planerat, ännu inte gjort.
- Fontfiler förblir inbakade. Besparingen från begränsad viktaxel är osäker
  och sannolikt begränsad; den tidigare 170 kB-vinsten gällde externa filer.
- `SITE_URL` pekar på GitHub Pages. Mät faktisk leverans; planera ingen egen
  Brotli-/headerkonfiguration. Lokala Brotli-mått är teoretiska om de inte
  motsvarar serverns leverans. Aktuella serverheaders har inte kontrollerats.
- Kör full manuell webbläsarmatris en gång på slutversionen. Varje kandidat
  behöver relevanta automatiserade kontroller. Lighthouse före/efter är
  orienterande; uppmätta byte är huvudmåttet.

## Kontroller som redan gjorts

Utifrån appens commit `4b0069c` kördes under denna session:

- `npm run test:unit`: 16 tester godkända i fyra testfiler.
- `npm run build`: typkontroll och produktionsbygge godkända.
- Vites storleksrapport: HTML 2 118,16 kB rå och 752,48 kB gzip.
- E2E har inte körts under denna session.
- `git diff --check` passerade efter dokumentationsändringarna.

Den faktiska vendrade bundlen kontrollerades med textsökning: bland annat
crypto-browserify, browserify-sign/cipher, diffie-hellman, public-encrypt,
request-promise, tough-cookie och createHash-anrop finns där. Ingen ny
modulvis storleksanalys eller upstream-källgranskning har gjorts.

## Nästa konkreta arbete

Börja med steg 1 i planen: dokumentera miljö och exakt referens, spara
referensbygge, skapa återanvändbar storleksmätning och kör befintlig E2E.
Därefter kan 2a provbyggas separat och mätas. Hoppa inte direkt till
crypto-/fetch-adaptrar eller anta att 2b behövs innan 2a har utvärderats.

E2E bygger med testhooks. Avsluta verifieringen med `npm run build` så att
den kvarvarande `dist/` är ett produktionsbygge utan aktiverade testhooks.
Varje optimering ska vara separat granskningsbar och kunna återställas.
Ingen publicering har beställts eller genomförts.
