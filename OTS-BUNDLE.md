# Den vendrade OpenTimestamps-bundlen

Analys av `src/vendor/opentimestamps.min.js` – varför den är 1,5 MB, vad av
den vi faktiskt använder, och vad som skulle krävas för att krympa den.

Skriven 2026-09-17 mot `opentimestamps v.0.4.9`. Alla siffror är uppmätta,
och kommandona för att mäta om dem finns längst ned.

**Slutsats:** vi behöver OpenTimestamps, men vi behöver inte det mesta av
filen. Den absoluta merparten är `bitcore-lib` med beroenden, och det finns
bara där för en kodväg som en webbläsare aldrig kan ta.

Detta är enbart en storleksfråga. Ingen korrekthets- eller integritetsbrist:
digest-only-gränsen i `src/lib/ots.ts` håller oavsett bundle-storlek, och
hashen lämnar aldrig enheten.

## Vad filen är

Det officiella webbläsarbygget av OpenTimestamps, version 0.4.9 – samma fil
som den gamla CDN-taggen serverade. Den injiceras som klassiskt `<script>`
av `inlineOtsVendor()` i `vite.config.ts`; se kommentaren där för varför den
inte kan importeras som modul.

Sedan 2026-09-18 ligger den sist i `<body>` i stället för i `<head>`, så att
den inte längre blockerar renderingen av sidan. Det påverkar inte storleken –
alla siffror nedan gäller fortfarande. Bundlen är 60 % av vad varje besökare
laddar ner; se `PERFORMANCE.md` för helheten.

Appen använder exakt fem ingångar ur den:

| Anrop | Var |
|---|---|
| `DetachedTimestampFile.fromHash` | `src/lib/ots.ts` |
| `DetachedTimestampFile.deserialize` | `src/verify.ts` |
| `Ops.OpSHA256` | `src/lib/ots.ts` |
| `stamp` | `src/stamp.ts` |
| `upgrade`, `verify` | `src/verify.ts` |

## Varför den är 1,5 MB

OpenTimestamps egen källkod är 112 kB okomprimerad, fördelad på tolv filer.
Resten är beroendeträdet.

| Del | Storlek |
|---|---|
| OTS egen logik (`package/src`, okomprimerad) | 112 kB |
| `bitcore-lib` 8.24.2, minifierad och ensam | 419 kB |
| `elliptic` 6.5.3, `lodash`, `bn.js`, `hash.js` | tillkommer |
| browserify-polyfills (`buffer` förekommer 1 744 ggr) | tillkommer |
| **Vendrad fil totalt** | **1 562 kB** |

Notera att 419 kB för bitcore är mätt utan browser-polyfills. I den
browserifierade bundlen kostar den mer.

## Varför bitcore ligger där

OTS har två sätt att hämta ett Bitcoin-blockhuvud, och paketet innehåller
båda.

**`bitcoin.js` – lokal Bitcoin Core-nod.** Läser `bitcoin.conf`, plockar
`rpcuser`/`rpcpassword` och anropar `getblockheader` över RPC. Det är den
här vägen som behöver bitcore-libs `BlockHeader`-parsning, ECDSA och
transaktionshantering.

I en webbläsare är vägen oåtkomlig – det finns inget filsystem och ingen
`bitcoin.conf`. Koden ligger där som dödvikt, men drar ändå in hela
beroendeträdet eftersom browserify inte tree-shakar.

**`esplora.js` – blockstream.info/api.** Det är den väg appen faktiskt tar.
Verifieringen av en Bitcoin-attestering reduceras i praktiken till:

```js
if (!arrEq(digest, hexToBytes(header.merkleroot)))
  throw new Error("Digest does not match merkleroot");
return header.time;
```

Hämta JSON, jämför hex, returnera tidsstämpeln. Merkle-kedjan fram till den
digesten räknas ut av OTS egna `ops.js` med SHA-256 och RIPEMD-160 som
biblioteket implementerar själv.

Ingenstans i den vägen behövs bitcore.

## Vad som kan göras

I stigande risk. Ingen av dem är gjord.

### 1. Ingenting

Rimligt val så länge storleken inte gör ont. Kostnaden är en
engångsnedladdning, inte latens vid användning – appen kör från en lokal
fil. Bundlen är dessutom det officiella, granskade bygget, vilket har ett
värde i sig för just den här sortens kod.

### 2. Egen bundle ur OTS-källkoden

Bygg från `javascript-opentimestamps` källkod med `bitcoin.js` stubbad, så
att bitcore kan tree-shakas bort. All verifieringslogik lämnas orörd.
Rimlig förväntan: 1,5 MB → under 200 kB.

Måttlig risk, och verifierbar – `test/e2e.mjs` har redan ett fixture som ger
VERIFIED mot en riktigt förankrad tidsstämpel, så en sådan ändring går att
kontrollera på riktigt och inte bara i teorin.

En komplikation att räkna med: npm-paketet `javascript-opentimestamps` ligger
på 0.4.5 och drar in `web3`, `moment-timezone` och `request` – alltså värre
än den vendrade 0.4.9, som kommer från GitHub-bygget. Källan måste hämtas
därifrån, inte från npm.

### 3. Egen .ots-implementation

Formatet är enkelt – uppskattningsvis 300–500 rader för parsning, operationer
och merkle-evaluering. Men då skriver vi om det som hela appens trovärdighet
vilar på, och byter bort ett granskat bibliotek mot egen kod. Bör inte göras
utan starkt skäl.

## Mät om siffrorna

```bash
# Vendrad fil
ls -l src/vendor/opentimestamps.min.js

# Vilka bibliotek som ligger i bundlen
grep -o '_from:"[^"]*"' src/vendor/opentimestamps.min.js | sort -u

# Spår av den lokala RPC-vägen (dödvikt i webbläsare)
grep -o "callRPC\|bitcoin.conf\|rpcuser\|getblockheader" \
  src/vendor/opentimestamps.min.js | sort | uniq -c

# OTS egen källkod
npm pack javascript-opentimestamps@0.4.5 && tar xzf javascript-opentimestamps-*.tgz
du -sk package/src

# bitcore-lib ensam
npm i bitcore-lib@8.24.2
echo 'require("bitcore-lib")' > entry.js
npx esbuild entry.js --bundle --minify --platform=node --outfile=bitcore.min.js
ls -l bitcore.min.js
```
