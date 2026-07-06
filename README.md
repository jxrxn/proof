# Proof — Bitcoin Timestamp

Tidsstämpla text eller filer via [OpenTimestamps](https://opentimestamps.org/).
En SHA-256-hash skapas lokalt och bara hashen skickas till OpenTimestamps
kalenderservrar, som ankrar den i Bitcoin-blockkedjan.

## Utveckling

```bash
npm install
npm run dev        # dev-server med hot reload
npm run build      # typkoll + bygge → dist/index.html (en enda självbärande fil)
npm run e2e        # end-to-end-röktest i Chrome mot dist/ (kräver nätverk)
```

Bygget producerar **en enda HTML-fil** (`dist/index.html`) med all JS/CSS
inbakad — den fungerar direkt från `file://` och gör inga CDN-anrop.
Distribuera genom att kopiera/maila den filen.

## Struktur

- `index.html` — markup (Vite-entry)
- `src/main.ts` — kopplar ihop panelerna
- `src/stamp.ts` — skapa bevis (hash → OpenTimestamps → ZIP-paket)
- `src/verify.ts` — verifiera bevis (ZIP / fil+OTS / text+OTS)
- `src/lib/` — hjälpfunktioner (hash, DOM, OTS-lager med kalendersondering)
- `src/vendor/opentimestamps.min.js` — vendrad OpenTimestamps-bundle v0.4.9
  (UMD, sätter `window.OpenTimestamps`; typad i `src/types/opentimestamps.d.ts`)
- `test/fixtures/` — OpenTimestamps officiella hello-world-exempel (ankrat i
  Bitcoin-block #358391), låter e2e-testet täcka hela VERIFIED-flödet
- `proof.html` — den gamla enfilsversionen (behållen som referens)

## Noteringar

- Bibliotekets `stamp()` väntar på alla kalenderservrar utan timeout, därför
  sonderar `src/lib/ots.ts` först vilka servrar som svarar på POST `/digest`
  och skickar bara till dem. Alla OTS-anrop har dessutom 30 s timeout-skydd.
- Kalendrarnas `/timestamp`-endpoints saknar ibland CORS-headers (särskilt
  före ankring), så uppgradering i webbläsaren kan misslyckas mjukt —
  verifieringen visar då korrekt "pending".
