# Nyttolast och laddningstid

Analys av vad `dist/index.html` faktiskt kostar att ladda, vad som är åtgärdat
och vad som är kvar. Systerdokument till `OTS-BUNDLE.md`, som går på djupet i
den största enskilda posten.

Mätt 2026-09-18 mot `dist/index.html` från `npm run build`. Kommandot för att
mäta om finns längst ned.

**Slutsats:** allt ligger i en enda fil som måste vara helt nedladdad innan
något kan målas, och två poster är 93 % av den – OTS-bundlen och de inbakade
typsnitten. Ingen av dem är löst. Det som är gjort är att flytta bundlen ur
renderingsvägen, vilket är en annan sak än att krympa den.

Detta är enbart en prestandafråga. Ingen korrekthets- eller integritetsbrist.

## Vad filen består av

| Del | Rå | Gzip | Andel |
|---|---|---|---|
| Inline OTS-vendor (`<script>`) | 1 599 kB | **448 kB** | 60 % |
| CSS – varav 320 kB base64-typsnitt | 334 kB | **247 kB** | 33 % |
| App-modul (jszip, hash-wasm, egen kod) | 169 kB | 51 kB | 7 % |
| **Totalt** | **2 116 kB** | **749 kB** | |

Den egna CSS:en är 15 kB rå, 3,7 kB gzippad. Resten av de 247 kB är typsnitt.

Lighthouse-posterna "Reduce unused CSS 115 KiB" och "Reduce unused JavaScript
374 KiB" är inte död kod. Det är typsnitten respektive OTS-bundlen, sedda
utifrån. Leta inte efter oanvända regler i `style.css` – de finns inte.

Referensmätning på Slow 4G, emulerad Moto G Power: FCP, LCP och Speed Index
alla 4,8 s, Performance 70. TBT 0 ms och CLS 0 – det är uteslutande
nedladdningen som är problemet, inte exekveringen eller layouten.

## Vad som är gjort

**Vendorn ligger sist i `<body>`**, inte i `<head>`. Ett klassiskt `<script>`
blockerar parsern där det står, så i huvudet sköt 1,6 MB upp allt synligt
innehåll tills det var nedladdat, parsat och kört. LCP-elementet – `<p
class="sub">` i headern – låg 1 597 748 byte in i dokumentet och kunde inte
målas innan dess. Nu ligger det 163 byte in.

Ordningen mot appen håller ändå: modulskriptet i `<head>` är deferrat och kör
efter att dokumentet parsats, alltså efter vendorn. `getOts()` ser fortfarande
alltid ett satt `window.OpenTimestamps`, och hela `test/e2e.mjs` passerar.

Det tar bort renderingsblockeringen. Det tar inte bort en enda byte.

## Vad som är kvar

I stigande risk. Ingen av dem är gjord.

### 1. Typsnitten: `unicode-range` gör ingen nytta som data-URI

Det här är den lägst hängande frukten, och den bygger på ett antagande som
inte håller.

`@font-face` deklarerar sju Inter-subsets med `unicode-range`, och
`src/style.css` motiverar dem med språktäckning. Den motiveringen är riktig.
Men `unicode-range` skjuter bara upp en **nätverkshämtning**. Som data-URI
finns ingen hämtning – filen är redan där. Alltså laddar varje besökare ner
alla sju subsets varje gång, inklusive `greek-ext` och `cyrillic-ext`.

| Subset | Storlek |
|---|---|
| `inter-latin-ext` | 85 068 B |
| `inter-latin` | 48 256 B |
| `inter-cyrillic-ext` | 25 960 B |
| `jetbrains-mono-latin` | 21 168 B |
| `inter-greek` | 18 996 B |
| `inter-cyrillic` | 18 748 B |
| `inter-greek-ext` | 11 232 B |
| `inter-vietnamese` | 10 252 B |
| **Totalt** | **239 680 B** |

Emittera de icke-latinska subsetsen som systerfiler bredvid `index.html` –
`emitIcons()` i `vite.config.ts` gör redan exakt det mönstret – och behåll
bara `inter-latin` + `jetbrains-mono-latin` inbakade. Då börjar
`unicode-range` fungera som avsett: en kyrillisk läsare hämtar 18 kB, alla
andra hämtar noll.

- 170 kB av 240 kB (71 %) lämnar den kritiska vägen
- 749 kB → ca 578 kB gzip, en minskning med 23 %

Priset är att `file://`-körning tappar icke-latinska glyfer och faller till
systemfonten. Det är samma kompromiss som redan är accepterad för CJK,
arabiska, hebreiska, thai och devanagari – skillnaden är att den då även
gäller polska och ryska vid `file://`, men inte vid webbhosting.

Vill man inte ta det priset: behåll `latin-ext` inbakad också. Då blir det
85 kB i stället för 170 kB, och `file://` täcker fortfarande hela
Latinalfabetet.

Notera att `unicode-range` måste ligga kvar oavsett vilket. Den är nödvändig
för korrekthet, inte bara för storlek: flera `@font-face` för samma familj
utan intervall gör att bara den sist deklarerade används.

En andra, oberoende besparing: Inter är vendrad som variabel font med hela
axeln 100–900, men appen använder bara 400, 600 och 700. Att nypa axeln till
det intervallet krymper filen ytterligare.

### 2. OTS-bundlen: 448 kB, 60 % av nyttolasten

Behandlas i sin egen fil. Kort version: merparten är `bitcore-lib` med
beroenden, och det finns bara där för en kodväg som en webbläsare aldrig kan
ta. Ett eget bygge ur OTS-källkoden med `bitcoin.js` stubbad har rimlig
förväntan 1,5 MB → under 200 kB.

Se **`OTS-BUNDLE.md`** för mätningar, varför bitcore ligger där och vad de tre
alternativen kostar.

### 3. Lata in vendorn vid första användning

`getOts()` i `src/lib/ots.ts` är redan en lat accessor – den anropas först när
användaren stämplar eller verifierar, aldrig vid sidladdning. Arkitekturen är
alltså redan förberedd. Det som saknas är att bytena inte är lata: de ligger
inline i dokumentet.

Att flytta vendorn till en systerfil och hämta den vid första `getOts()` tar
bort 448 kB från den kritiska vägen helt. Men då är appen inte längre körbar
från `file://` för sin kärnfunktion, och det är ett uttalat designkrav – se
`README.md`, "Vad som gäller vid körning från `file://`". Ikonerna bredvid är
rena tillägg som får 404:a lokalt; det här skulle inte vara det.

Ska den vägen tas behöver den en fallback: försök med systerfilen, fall
tillbaka på en inbakad kopia. Men då ligger bytena kvar i dokumentet och hela
poängen är borta. Realistiskt utesluter single-file-kravet det här
alternativet, och då är punkt 2 den enda vägen till en mindre OTS.

## Vad som inte är värt att göra

**Splitta app-modulen.** 51 kB gzip, 7 % av nyttolasten. jszip och hash-wasm
är dessutom båda på den kritiska vägen för kärnflödena.

**Jaga oanvänd CSS.** Se ovan – Lighthouse ser typsnitten, inte döda regler.

**Optimera LCP-elementet.** Det är ett stycke text i headern. Det finns inget
att lazy-loada, dimensionera eller preloada. LCP är nedladdningsbunden, och
enda sättet att flytta den är färre byte.

## Mät om siffrorna

```bash
npm run build
python3 - <<'PY'
import re, gzip
h = open('dist/index.html', encoding='utf8').read()
print(f"totalt {len(h.encode()):,} rå {len(gzip.compress(h.encode(), 9)):,} gzip")
for m in re.finditer(r'<(script|style)([^>]*)>(.*?)</\1>', h, re.S):
    b = m.group(3).encode()
    print(f"{m.group(1):6}{m.group(2)[:28]:30} {len(b):>9,} rå {len(gzip.compress(b, 9)):>9,} gzip")
PY

# Hur långt in i dokumentet LCP-elementet ligger
python3 -c "h=open('dist/index.html',encoding='utf8').read(); b=h.find('<body>'); print(h.find('class=\"sub\"',b)-b)"

# Typsnittens andel
ls -l src/fonts/*.woff2
```
