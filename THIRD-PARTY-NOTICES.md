# Third-party notices

Proof itself is Copyright (C) 2026 jxrxn and is licensed under
**GPL-3.0-or-later**; see [`LICENSE`](LICENSE). That covers Proof's own code
only. The Proof name, logo and brand assets are excluded from that license and
rights to them are reserved; see [`NOTICE.txt`](NOTICE.txt).

[`NOTICE.txt`](NOTICE.txt) is the notice that ships with the build. This file
is the longer, repository-facing version of the same material.

Proof bundles third-party software. The built application
(`dist/index.html`) is a single file with everything inlined, so anyone who
receives that file also receives copies of the components listed here.

**Each component below remains under its own license and its own copyright
holders.** Proof's licensing choice does not change that, and Proof claims no
ownership of OpenTimestamps, Bitcoin, or any other third-party code,
specification or trademark.

This file is the notice required by those components' licenses. It is not
legal advice.

---

## OpenTimestamps (`opentimestamps`) – LGPL-3.0-or-later

**The OpenTimestamps library is used by Proof, and the library and its use
are covered by the GNU Lesser General Public License, version 3.**

| | |
|---|---|
| Package | `opentimestamps` (formerly `javascript-opentimestamps`) |
| Version | 0.4.9 |
| License | LGPL-3.0-or-later (see note below) |
| Author | EternityWall |
| Upstream | https://github.com/opentimestamps/javascript-opentimestamps |
| Release tag | `v0.4.9` |
| Vendored as | `src/vendor/opentimestamps.min.js` |

### Basis for "or later"

Upstream `package.json` at `v0.4.9` carries the SPDX string `"LGPL-3.0"`,
which does not itself express an "or later" option. The operative grant is
the notice at the top of the upstream `LICENSE` file, which reads: "under the
terms of the GNU Lesser General Public License as published by the Free
Software Foundation, either version 3 of the License, **or (at your option)
any later version**". This notice is reproduced verbatim in
`licenses/opentimestamps-LGPL-3.0.txt`.

### Compatibility with Proof's GPL-3.0-or-later license

LGPL-3.0 states that it "incorporates the terms and conditions of version 3
of the GNU General Public License, supplemented by the additional permissions
listed below". GPL-3.0 §7 provides that "when you convey a copy of a covered
work, you may at your option remove any additional permissions from that
copy, or from any part of it". Distributing the library as part of a
GPL-3.0-or-later work therefore rests on dropping those additional
permissions, not on any separate relicensing grant.

### License texts

LGPL-3.0 incorporates the terms of GPL-3.0 by reference, and §4(b) requires
that a Combined Work be accompanied by a copy of both documents. Both are
included in this repository:

- [`licenses/opentimestamps-LGPL-3.0.txt`](licenses/opentimestamps-LGPL-3.0.txt)
  – a verbatim copy of the upstream `LICENSE` file at tag `v0.4.9`, which
  contains the project's own notice followed by the LGPL-3.0 text
- [`licenses/GPL-3.0.txt`](licenses/GPL-3.0.txt) – the GNU General Public
  License version 3, as incorporated by the LGPL

`licenses/GPL-3.0.txt` and the repository's own [`LICENSE`](LICENSE) are
byte-identical copies of the same unmodifiable FSF document. They are kept
separate because they serve different roles: `LICENSE` is the license Proof
is released under, while `licenses/GPL-3.0.txt` is the copy that accompanies
the Library under LGPL-3.0 §4(b).

### Copyright notice

Upstream does not carry per-file copyright headers, and its `LICENSE` file
contains no copyright line other than the Free Software Foundation's notice
on the license document itself. `package.json` at `v0.4.9` names the author
as **EternityWall**. No further copyright statement is reproduced here
because none is published upstream to reproduce.

### Source availability

`src/vendor/opentimestamps.min.js` is a minified build, not source. The
corresponding source is the upstream repository at release tag `v0.4.9`:

    git clone https://github.com/opentimestamps/javascript-opentimestamps
    git checkout v0.4.9

The vendored file is byte-identical to the build published by the upstream
project at
`https://opentimestamps.org/assets/javascripts/vendor/opentimestamps.min.js`,
so its provenance can be verified independently:

    SHA-256  f6181ae00cce58773f8710894c99d0656058f6a1e08c57360b263cd46c54fbf2
    Size     1599354 bytes

Proof does not modify the library. It is vendored verbatim and inlined into
`dist/index.html` by `vite.config.ts` without transformation. Replacing the
library therefore means replacing that one file and rebuilding; see
[`OTS-BUNDLE.md`](OTS-BUNDLE.md) for how it is wired in.

### Components inside the OpenTimestamps bundle

The upstream build is itself a browserified bundle and embeds further
dependencies, including `bitcore-lib` (MIT) and `elliptic` (MIT). Their
package metadata and license fields travel inside the bundled file.

---

## Inter – SIL Open Font License 1.1

| | |
|---|---|
| Version | via `@fontsource-variable/inter` 5.3.0 |
| License | OFL-1.1 |
| Upstream | https://github.com/rsms/inter |
| License text | [`src/fonts/LICENSE-Inter.txt`](src/fonts/LICENSE-Inter.txt) |

Vendored as the `woff2` subset files in `src/fonts/`, inlined into
`dist/index.html` as data URIs. Not modified.

---

## JetBrains Mono – SIL Open Font License 1.1

| | |
|---|---|
| Version | via `@fontsource/jetbrains-mono` 5.3.0 |
| License | OFL-1.1 |
| Upstream | https://github.com/JetBrains/JetBrainsMono |
| License text | [`src/fonts/LICENSE-JetBrainsMono.txt`](src/fonts/LICENSE-JetBrainsMono.txt) |

Vendored as a `woff2` subset in `src/fonts/`, inlined into
`dist/index.html` as a data URI. Not modified.

---

## MIT components compiled into the build

MIT requires its copyright and permission notice to be included in all copies,
so these travel with `dist/index.html`. Their texts are in `licenses/` and are
emitted into the build.

| Package | Copyright | License text |
|---|---|---|
| `hash-wasm` | (c) 2020 Dani Biro | [`licenses/MIT-hash-wasm.txt`](licenses/MIT-hash-wasm.txt) |
| `jszip` | (c) 2009-2016 Stuart Knightley and others | [`licenses/MIT-jszip.txt`](licenses/MIT-jszip.txt) |
| `bitcore-lib` | (c) 2013-2019 BitPay, Inc. and others | [`licenses/MIT-bitcore-lib.txt`](licenses/MIT-bitcore-lib.txt) |
| `elliptic` | (c) Fedor Indutny, 2014 | [`licenses/MIT-elliptic.txt`](licenses/MIT-elliptic.txt) |

`jszip` is dual licensed MIT or GPLv3; Proof uses it under MIT. `bitcore-lib`
and `elliptic` are not direct dependencies – they are embedded inside the
vendored OpenTimestamps build.

Build-time-only tooling (Vite, TypeScript, Vitest, puppeteer-core) is not
distributed. Licenses for the full dependency tree are recorded in the
`license` fields of `package-lock.json`.

---

## What the build distributes

Taken as a whole, `dist/` carries the notices and license texts its
components require. Alongside `index.html` it contains:

| File | Why it is there |
|---|---|
| `LICENSE.txt` | GPL-3.0 §4 – recipients get a copy of Proof's license. Also the "copy of the GNU GPL" that LGPL-3.0 §4(b) requires. |
| `NOTICE.txt` | LGPL-3.0 §4(a) prominent notice, Proof's copyright, the brand-asset reservation, and the index of component licenses. |
| `licenses/LGPL-3.0-opentimestamps.txt` | LGPL-3.0 §4(b) – "this license document". |
| `licenses/OFL-1.1-Inter.txt` | OFL-1.1 §2 – each copy of the font must carry its copyright notice and license. |
| `licenses/OFL-1.1-JetBrainsMono.txt` | Same, for JetBrains Mono. |
| `licenses/MIT-*.txt` (4 files) | MIT – notice included in all copies. |

`index.html` additionally carries a short comment header naming the program,
its copyright, its license and the LGPL notice, so that the file identifies
itself and points to its source even when seen on its own.

That header is not a substitute for the accompanying files, and it does not
discharge anyone else's obligations. Whoever redistributes `index.html` –
especially detached from the rest of `dist/` – is a distributor in their own
right and must satisfy the GPL, LGPL, OFL and MIT terms themselves, including
supplying the license texts and Corresponding Source. The repository URL in
the header does not by itself make a forwarded copy compliant.
