# Proof – Security maintenance handoff

**2026-11-10**

## Status

Security maintenance completed. GitHub reports zero open Dependabot and CodeQL alerts.

## Changes

- Enabled GitHub security scanning, including Dependabot, CodeQL and secret scanning.
- Merged dependency security updates.
- Upgraded `puppeteer-core` from 24 to 25.16.0, eliminating the vulnerable transitive `extract-zip` dependency.
- Added `@types/node` for TypeScript compatibility.
- Updated outdated E2E assertions to match the current UI without removing privacy, accessibility or security checks.
- Clarified that File + .ots verification is recommended for large files.
- Removed obsolete `legacy/proof.html`, which loaded JavaScript from external sources, and its README reference.

## Verification

- `npm ci` – passed
- `npm audit` – 0 vulnerabilities
- `npm ls extract-zip` – empty
- `npm run build` – passed
- `npm run test:unit` – 16/16 passed
- `npm run e2e` – all checks passed
- GitHub Dependabot and CodeQL – 0 open alerts, confirmed after push

## Important notes

- Puppeteer 25 requires Node.js 22.12 or newer. Node 24.22.2 was used successfully.
- The E2E failures were caused by outdated assertions against changed interface copy, not observed failures in timestamp creation or verification.
- The lockfile was regenerated, updating additional transitive dependencies.
- The removed legacy page should not be restored without reviewing its external script dependencies.

## Follow-up

- Consider adding `.nvmrc` with `24`.
- Ensure CI uses a compatible Node.js version.
- Continue monitoring GitHub security alerts.

## Relevant commits

- `fdf3813` – Update Puppeteer security dependencies and E2E tests
- `0478292` – Remove obsolete legacy Proof page
