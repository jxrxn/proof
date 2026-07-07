# Changelog

## v0.2-beta

### Added

- Streamad/chunkad SHA-256-hashning för stora filer i kärnflödet.
- Worker-baserad hashning med streamad fallback i main thread.
- Gemensam progress/status/cancel-UI för hashning och verifiering.
- Capability-aware package-policy för create- och verify-sidan.
- E2E-tester för worker-väg, storfilshashning, cancel, ZIP-bombskydd och
  digest-only-nätverkspayload.

### Changed

- `.ots` är nu det primära output-formatet och det primära verify-flödet.
- `original file + .ots` stöder stora filer utan den tidigare praktiska
  100 MB-gränsen.
- Proof package (`.zip`) är nu tydligt sekundärt, valfritt och begränsat till
  100 MB.
- Verify-sidan skiljer tydligare på `Verify original file + .ots` och
  `Verify proof package (.zip)`.
- Single-file-distributionen via `dist/index.html` har bevarats trots worker-
  hashning.

### Security / Privacy

- OpenTimestamps får fortsatt bara SHA-256-digesten, aldrig originalfilens
  bytes eller filnamn.
- `.ots`-filer innehåller inte originalfilen.
- ZIP/package innehåller originalfilen och är därför tydligt markerat i UI.
- Block explorer-anrop används inte i verifieringsresultatet.

### Limits

- ZIP/package create och verify använder fortfarande buffer-baserad ZIP-hantering.
- ZIP/package är därför fortsatt begränsat till 100 MB.
- ZIP-bombskyddet ligger kvar, inklusive guardad fallback när JSZip saknar
  okomprimerad storleksmetadata.

### Known Risks

- Safari och miljöer med strikt CSP bör testas manuellt för worker-/Blob-
  kombinationen innan bred produktionsexponering.
- Streaming-ZIP och storfilssäkra proof packages ingår inte i v0.2-beta.
