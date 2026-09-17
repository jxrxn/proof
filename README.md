# Proof — Bitcoin Timestamp

Tidsstämpla text eller filer via [OpenTimestamps](https://opentimestamps.org/).
Appen skapar SHA-256 lokalt i webbläsaren och skickar bara digesten till
OpenTimestamps. Originalfilen lämnar inte appen när du sparar eller verifierar
ett vanligt `.ots`-bevis.

## v0.2-beta i korthet

- **Primärt flöde:** spara och verifiera en separat proof file (`.ots`).
- **Stora filer:** stöds i kärnflödet `original file + .ots` via streamad,
  chunkad SHA-256-hashning.
- **Sekundärt flöde:** proof package (`.zip`) är valfritt, begränsat och
  capability-aware.
- **Integritet:** OpenTimestamps får bara 32-byte SHA-256-digesten, aldrig
  originalfilens bytes eller filnamn.
- **Distribution:** bygget producerar en enda självbärande `dist/index.html`
  som fungerar från `file://`.

## Utveckling

```bash
npm install
npm run dev        # dev-server med hot reload
npm run build      # typkoll + bygge → dist/index.html
npm run test:unit  # unit-tester för lågnivåmoduler
npm run e2e        # bygger testvariant + kör end-to-end-röktest i Chrome (kräver nätverk)
```

Själva appen är **en enda självbärande HTML-fil** (`dist/index.html`) med all
JS, CSS och alla typsnitt inbakade. Ingen separat worker-fil, `.wasm`-fil
eller CDN-resurs krävs, vilket gör filen mycket portabel — den kan flyttas,
kopieras och öppnas som en ensam fil.

Bredvid den emitteras ikoner, `manifest.webmanifest` och OG-bilden som egna
filer. De behövs bara vid webbhosting — ett PWA-manifest måste vara en egen
fil för att vara installerbart, Safari hämtar apple-touch-icon som URL, och
OG-bilder läses av externa skrapare som kräver absolut URL. Kopierar man bara
`index.html` följer de inte med, och ikonlänkarna 404:ar oskadligt.

### Vad som gäller vid körning från `file://`

Skilj på två saker:

- **Lokalt: gränssnittet och SHA-256-hashningen** kräver inget nätverk och
  inget webbhotell. Det fungerar när filen öppnas direkt.
- **Nätverksberoende: stampning mot kalendrar, `upgrade` och verifiering**
  kräver cross-origin-anrop från ett `file://`-ursprung, där webbläsare
  behandlar origin som `null`. Det är verifierat i **Chrome** — `test/e2e.mjs`
  körs från `file://` utan uppmjukade säkerhetsflaggor och hävdar att verkliga
  kalender-POST:ar observerades. Det är **inte** verifierat i Firefox eller
  Safari, som är strängare mot `file://`-ursprung.

Hostad över HTTPS gäller inte den reservationen — då är ursprunget normalt.
Det är den distributionsform appen är avsedd för.

## Användning

### Save proof file (`.ots`)

Det här är standardflödet.

- `.ots`-filen innehåller **inte** originalfilen.
- `.ots`-filen innehåller ett OpenTimestamps-bevis för filens SHA-256-digest.
- Stora filer stöds här, eftersom originalfilen hashas lokalt i chunks i
  stället för att läsas in helt i minnet på en gång.

### Create proof package (`.zip, includes original file`)

Det här är ett sekundärt, valfritt flöde.

- ZIP-paketet innehåller **en kopia av originalfilen**.
- ZIP-paketet innehåller också `.ots`, SHA-256-hash och metadata/README.
- ZIP-paket är för närvarande **begränsade till 100 MB** och använder en
  buffer-baserad ZIP-modell i webbläsaren.
- Appen erbjuder bara package-flödet när nuvarande browser/app-läge klarar det
  säkert enligt `src/lib/packageCapability.ts`.

## Verifiering

### Verify original file + `.ots`

Det här är det primära verify-flödet.

- Rekommenderas för stora filer.
- Originalfilen hashas lokalt med streamad SHA-256.
- OpenTimestamps-verifieringen arbetar vidare från `hashHex + .ots`, inte från
  originalfilens bytes.

### Verify proof package (`.zip`)

Det här är ett sekundärt verify-flöde.

- ZIP-paket innehåller originalfilen.
- ZIP-verifiering är för närvarande **begränsad till 100 MB**.
- ZIP-bombskydd finns kvar: i normal drift kontrolleras ZIP-entry-storlekar
  före uppackning när JSZip exponerar okomprimerad storlek. En guardad fallback
  upprätthåller samma gränser efter uppackning om metadata saknas.
- `.ots`-entryn har en separat gräns på 10 MB (`MAX_OTS_BYTES`).

## Integritet och nätverk

### Vad som aldrig skickas till OpenTimestamps

- originalfilens bytes
- originalfilens filnamn
- ZIP-paketets innehåll

### Vad som skickas

- en SHA-256-digest på 32 byte

### Externa nätverksanrop

- Vid skapande skickas digesten till svarande OpenTimestamps-kalendrar via
  deras `/digest`-endpoints.
- Vid verifiering/upgrade kan OpenTimestamps-biblioteket kontakta kalendrar för
  att hämta ny verification data.
- Vid full verifiering kontaktar OpenTimestamps även sin Bitcoin-header-källa
  för att verifiera anchoring.
- Appen anropar inte externa blockutforskar-API:er för att visa blockhöjd eller
  tid i resultatet.

## Browserstöd och begränsningar

### Rekommenderat

- Chrome och Edge: bäst testade för både build och e2e.
- Firefox: bör fungera för kärnflödet `.ots`, men bör regressions-testas manuellt.

### Att verifiera extra noga

- Safari: worker-/Blob-/CSP-kombinationen bör testas manuellt innan bred
  distribution, även om single-file-modellen bevaras.
- Strikt CSP: workerns inline Blob-modell och WebAssembly-kompilering behöver
  verifieras i målmiljön om appen senare bäddas in i en låst host.

### Nuvarande produktgränser

- `.ots`-flödet är storfilssäkert i v0.2-beta.
- ZIP/package-flödet är **inte** obegränsat och använder fortfarande en
  buffer-baserad modell med 100 MB-gräns.
- README lovar alltså inte streaming-ZIP eller obegränsade package-filer.

## Struktur

- `index.html` — markup (Vite-entry)
- `src/main.ts` — kopplar ihop panelerna
- `src/stamp.ts` — skapa bevis
- `src/verify.ts` — verifiera bevis
- `src/lib/hash.ts` — streamad/chunkad SHA-256 i main thread
- `src/lib/hashWorkerClient.ts` — worker-klient för hashning
- `src/lib/packageCapability.ts` — capability/policy för proof package
- `src/lib/ots.ts` — digest-only-gräns mot OpenTimestamps
- `src/vendor/opentimestamps.min.js` — vendrad OpenTimestamps-bundle v0.4.9
- `OTS-BUNDLE.md` — analys av den vendrade bundlens storlek och beroenden
- `src/fonts/` — vendrade latin-subsets av Inter och JetBrains Mono (woff2)
- `src/icons/` — favicon, PWA-ikoner, OG-bild och deras metadata (`icons.ts`)
- `test/fixtures/` — officiellt hello-world-exempel för VERIFIED-flödet
- `legacy/proof.html` — gammal arkiverad version; använd inte den som app

## Tekniska noteringar

- `detachedFromHashHex()` i `src/lib/ots.ts` är den viktiga digest-only-boundaryn
  mot OpenTimestamps.
- Den vendrade OTS-bundlen är 1,5 MB, varav merparten är `bitcore-lib` med
  beroenden. Det finns där för OTS lokala Bitcoin-node-väg (`bitcoin.js`,
  RPC mot `bitcoin.conf`), som är oåtkomlig i en webbläsare — vi går alltid
  via `esplora.js` mot blockstream.info. Se `OTS-BUNDLE.md` för mätningar och
  vad som skulle krävas för att krympa den.
- `hash-wasm` används för chunkad SHA-256 över `Blob`/`File`.
- Typsnitten är vendrade som woff2 i stället för att hämtas från Google Fonts.
  Ett CDN-anrop hade brutit både `file://`-körning och löftet att appen inte
  pratar med någon utomstående. `build.assetsInlineLimit` är höjd så att Vite
  bakar in dem som data-URI:er — annars hade de emitterats som separata assets
  och bygget vore inte längre en enda fil. Uppdateras från
  `@fontsource-variable/inter` och `@fontsource/jetbrains-mono`, båda v5.3.0, OFL.
- Av Inter ingår samtliga sju subsets: latin, latin-ext, vietnamesiska,
  grekiska, grekiska-ext, kyrilliska och kyrilliska-ext (241 kB totalt).
  `-ext`-varianterna är inte valfria — utan dem täcks språken bara delvis och
  texten blandar Inter med systemfonten inuti samma ord (polska `Zażółć`,
  polytonisk grekiska, kyrilliska minoritetsspråk).
- Skript som Inter helt saknar — CJK, arabiska, hebreiska, thai, devanagari —
  faller alltid tillbaka på systemfonten oavsett subsets. Det sker för hela
  stycken, så resultatet ser annorlunda ut men aldrig blandat.
- Enstaka arkaiska fornkyrkoslaviska tecken (`Ꙋ` U+A64A, `ꙗ` U+A657, `ѿ`
  U+047F) ligger i `cyrillic-ext`-intervallet men saknas i Inters faktiska
  filer och faller därför tillbaka. Modern kyrilliska — ryska, ukrainska,
  serbiska, bulgariska — är helt täckt.
- `unicode-range` i `@font-face` är nödvändig, inte en optimering: flera
  `@font-face` för samma familj utan intervall gör att bara den sist
  deklarerade används.
- Ikoner, manifest och OG-bild content-hashas av `emitIcons()` i
  `vite.config.ts` (`favicon.<hash>.svg`) och fungerar därmed som
  cache-buster. Webbläsare cachar favicons aggressivt och sociala skrapare
  cachar OG-bilder på URL — med hash i namnet blir en ändrad ikon en ny URL
  som gammal cache inte kan träffa. Manifestet genereras vid bygge i stället
  för att ligga statiskt, eftersom det måste peka på de hashade ikonnamnen.
  Hashen kaskaderar: ändrad ikon ger nytt manifest som ger ny länk i HTML:en.
- JS och CSS har däremot inga versionerade filnamn, och kan inte ha det — de
  finns inte som filer utan är inbakade i `index.html`. Den filens färskhet
  är en `Cache-Control`-fråga hos webbhotellet, inte en filnamnsfråga.
- `base` är `'./'`, inte `'/proof/'`. GitHub Pages ligger på en underväg, men
  en absolut base hade brutit `file://`-körningen. Relativa vägar fungerar i
  båda fallen. Sajt-URL:en för OG-taggarna står i `src/icons/icons.ts`.
- Worker-spåret bundlas via Vites `?worker&inline` från den typade
  `src/workers/hash.worker.ts` — samma kod som unit-testas — och startas som
  Blob-worker, vilket bevarar single-file-distributionen från `file://`.
- Om worker-hashning faller används streamad main-thread-hashning som fallback,
  inte helfilsläsning.
- Ny input under pågående skapa/verifiera-operation avbryter operationen
  (samma `AbortController` som cancel-knappen) så att ett gammalt resultat
  aldrig kan skrivas mot en ny fil.
- Avbrott (`AbortController`) är chunk-granulära: en pågående chunk avslutas
  innan hashningen stannar helt.

## Licens

Copyright (C) 2026 jxrxn

Proof är fri programvara: du får sprida och/eller ändra den under villkoren i
GNU General Public License, publicerad av Free Software Foundation, antingen
version 3 eller (om du vill) någon senare version.

Programmet sprids i hopp om att vara användbart, men UTAN NÅGON GARANTI — utan
ens underförstådd garanti om SÄLJBARHET eller LÄMPLIGHET FÖR ETT SÄRSKILT
ÄNDAMÅL. Se GNU General Public License för mer information.

`SPDX-License-Identifier: GPL-3.0-or-later` — licenstexten finns i
[`LICENSE`](LICENSE).

Det gäller Proofs **egen** kod: källkoden i `src/`, `index.html`,
byggkonfigurationen och testerna.

### Namn, logotyp och varumärke

Licensen ovan gäller programvaran. Den upplåter inga rättigheter till namnet
**Proof**, Proofs logotyp eller övrig visuell identitet. De tillgångarna är
undantagna från GPL-3.0-or-later och rättigheterna till dem förbehålls.

Konkret är det bildfilerna i [`src/icons/`](src/icons/): `proof_logo.svg`,
`favicon.svg`, `favicon-48-32-16.ico`, `apple-touch-icon.png`, `icon-192.png`,
`icon-512.png`, `icon-maskable-512.png` och `og-image.png`. Metadatamodulen
`src/icons/icons.ts` är däremot kod och omfattas av GPL som allt annat.

`proof_logo.svg` bakas in i `dist/index.html` vid bygget. Att bilden hamnar
inuti en GPL-licensierad fil ändrar inte dess status: själva grafiken förblir
undantagen. Koden som placerar den — markupen och injektionen i `src/main.ts`
— är GPL som resten.

**Ingen av bildfilerna krävs för att programmet ska fungera.** Appen hashar,
tidsstämplar och verifierar utan dem — de är identitet och presentation.
Logotypinjektionen är medvetet feltolerant: tas markupen bort startar appen
ändå, utan logotyp.
Den som sprider en ändrad version under GPL får byta ut dem mot sina egna,
vilket är vad licensen förutsätter. Undantaget skapar därför ingen motsägelse
mot GPL:s krav.

Inget anspråk görs här på att "Proof" är ett registrerat varumärke.

### Tredjepartskomponenter

Proof gör inga anspråk på OpenTimestamps, Bitcoin, eller någon annan
tredjepartskod, specifikation eller varumärke. **Varje tredjepartskomponent
behåller sin egen licens och sina egna upphovsrättsinnehavare**, och Proofs
licensval ändrar inte det.

Den byggda `dist/index.html` bakar in allt i en fil, så den som får filen får
också kopior av komponenterna:

| Komponent | Licens |
|---|---|
| OpenTimestamps 0.4.9 | LGPL-3.0-or-later |
| Inter, JetBrains Mono | OFL-1.1 |
| hash-wasm | MIT |
| jszip | MIT OR GPL-3.0-or-later |

**OpenTimestamps-biblioteket används av Proof, och biblioteket och dess
användning omfattas av GNU Lesser General Public License version 3.**

Fullständig attribution, versioner, proveniens och licenstexter finns i
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md) och [`licenses/`](licenses/).

Bygget tar med sig det som krävs: `dist/` innehåller `LICENSE.txt`,
[`NOTICE.txt`](NOTICE.txt) och en `licenses/`-katalog, och `index.html` bär en
kort notis överst. **`dist/` som helhet** bär alltså de notiser och
licenstexter komponenterna kräver.

Headern i `index.html` identifierar programmet och pekar mot källkoden. Den
uppfyller inte i sig någon annans skyldigheter: den som sprider `index.html`
vidare, särskilt lösryckt från sina grannfiler, har egna skyldigheter enligt
GPL och de övriga licenserna — bland annat att tillhandahålla licenstexterna
och Corresponding Source. Att repo-URL:en står i filen gör inte en ensam,
vidarekopierad `index.html` compliant av sig själv.
