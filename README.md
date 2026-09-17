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

Bygget producerar **en enda HTML-fil** (`dist/index.html`) med all JS/CSS
inbakad. Ingen separat worker-fil, `.wasm`-fil eller CDN-resurs krävs.

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
