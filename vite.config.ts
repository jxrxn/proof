import { defineConfig, type Plugin, type HtmlTagDescriptor } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  ICONS, OG_IMAGE, SITE_URL, APP_NAME, APP_SHORT_NAME, APP_DESCRIPTION, THEME_COLOR,
} from './src/icons/icons';

// Den vendrade OpenTimestamps-bundlen är en UMD-fil. Om den dras in i
// modulgrafen wrappar Vite chunken i en CommonJS-hjälpare, varpå UMD-wrappern
// tar module.exports-grenen och window.OpenTimestamps aldrig sätts. Därför
// injiceras den i stället som ett klassiskt inline-<script> före modulskriptet
// — exakt samma semantik som den gamla CDN-taggen, och fortfarande en enda
// självbärande HTML-fil i dist.
function inlineOtsVendor(): Plugin {
  const file = fileURLToPath(new URL('./src/vendor/opentimestamps.min.js', import.meta.url));
  return {
    name: 'inline-ots-vendor',
    transformIndexHtml() {
      return [{
        tag: 'script',
        children: readFileSync(file, 'utf8'),
        injectTo: 'head-prepend',
      }];
    },
  };
}

// Ikoner, manifest och OG-bild kan inte bakas in i HTML:en: en PWA-manifest
// måste vara en egen fil för att vara installerbar, Safari hämtar
// apple-touch-icon som URL, och OG-bilder läses av externa skrapare som kräver
// en absolut URL. De emitteras därför som separata filer bredvid index.html.
//
// Filnamnen content-hashas så att de fungerar som cache-buster. Det är inte
// kosmetik: webbläsare cachar favicons extremt aggressivt och ofta bortom
// vanliga Cache-Control-regler, och sociala skrapare cachar OG-bilder på URL.
// Med hash i namnet blir en ändrad ikon en ny URL, och gammal cache kan inte
// träffa. Manifestet genereras här i stället för att ligga statiskt, eftersom
// det måste peka på de hashade ikonnamnen — som inte är kända förrän nu.
function emitIcons(): Plugin {
  const dir = new URL('./src/icons/', import.meta.url);
  const read = (name: string) => readFileSync(fileURLToPath(new URL(name, dir)));
  const hash = (buf: Buffer) => createHash('sha256').update(buf).digest('hex').slice(0, 8);

  // "namn.ext" -> "namn.<hash>.ext"
  const hashedName = (name: string, buf: Buffer) => {
    const dot = name.lastIndexOf('.');
    return `${name.slice(0, dot)}.${hash(buf)}${name.slice(dot)}`;
  };

  // Hasha direkt, inte i generateBundle: transformIndexHtml körs först, och en
  // tom karta där ger länkar till ohashade namn som 404:ar i produktion.
  const sources = new Map<string, Buffer>();
  const emitted = new Map<string, string>();
  for (const name of [...ICONS.map(i => i.file), OG_IMAGE.file]) {
    const source = read(name);
    sources.set(name, source);
    emitted.set(name, hashedName(name, source));
  }

  const manifestSource = (() => {
    const manifest = {
      name: APP_NAME,
      short_name: APP_SHORT_NAME,
      description: APP_DESCRIPTION,
      // Relativt: fungerar både på /proof/ och från en annan sökväg.
      start_url: './',
      scope: './',
      display: 'standalone',
      background_color: THEME_COLOR,
      theme_color: THEME_COLOR,
      icons: ICONS.filter(i => i.inManifest).map(i => ({
        src: `./${emitted.get(i.file)}`,
        sizes: i.sizes,
        type: i.type,
        purpose: i.purpose,
      })),
    };
    return JSON.stringify(manifest, null, 2);
  })();
  emitted.set('manifest.webmanifest',
    hashedName('manifest.webmanifest', Buffer.from(manifestSource)));

  return {
    name: 'emit-icons',
    enforce: 'post',

    generateBundle() {
      for (const [name, source] of sources) {
        this.emitFile({ type: 'asset', fileName: emitted.get(name)!, source });
      }
      this.emitFile({
        type: 'asset',
        fileName: emitted.get('manifest.webmanifest')!,
        source: manifestSource,
      });
    },

    transformIndexHtml: {
      order: 'post',
      handler() {
        const href = (name: string) => `./${emitted.get(name) ?? name}`;
        // OG-bilden måste vara absolut — skrapare löser inte relativa vägar.
        const absolute = (name: string) => new URL(href(name), SITE_URL).href;

        const tags: HtmlTagDescriptor[] = [
          { tag: 'meta', attrs: { name: 'description', content: APP_DESCRIPTION }, injectTo: 'head' },
          { tag: 'meta', attrs: { name: 'theme-color', content: THEME_COLOR }, injectTo: 'head' },
        ];

        for (const icon of ICONS) {
          const rel = icon.file === 'apple-touch-icon.png' ? 'apple-touch-icon' : 'icon';
          // Manifestet bär redan sizes/type för PWA-ikonerna; att deklarera dem
          // som <link rel="icon"> också skulle bara ge webbläsaren fler
          // kandidater att välja fel bland.
          if (icon.inManifest) continue;
          const attrs: Record<string, string> = { rel, href: href(icon.file), type: icon.type };
          if (icon.sizes) attrs.sizes = icon.sizes;
          tags.push({ tag: 'link', attrs, injectTo: 'head' });
        }

        tags.push(
          { tag: 'link', attrs: { rel: 'manifest', href: href('manifest.webmanifest') }, injectTo: 'head' },
          { tag: 'meta', attrs: { property: 'og:type', content: 'website' }, injectTo: 'head' },
          { tag: 'meta', attrs: { property: 'og:title', content: APP_NAME }, injectTo: 'head' },
          { tag: 'meta', attrs: { property: 'og:description', content: APP_DESCRIPTION }, injectTo: 'head' },
          { tag: 'meta', attrs: { property: 'og:url', content: SITE_URL }, injectTo: 'head' },
          { tag: 'meta', attrs: { property: 'og:image', content: absolute(OG_IMAGE.file) }, injectTo: 'head' },
          { tag: 'meta', attrs: { property: 'og:image:width', content: String(OG_IMAGE.width) }, injectTo: 'head' },
          { tag: 'meta', attrs: { property: 'og:image:height', content: String(OG_IMAGE.height) }, injectTo: 'head' },
          { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' }, injectTo: 'head' },
        );
        return tags;
      },
    },
  };
}

// Licens- och notismaterial måste följa med den distribuerade byggnaden, inte
// bara ligga i repot. dist/index.html bakar in all kod och alla typsnitt, så
// den som får filen får också kopior av komponenterna — och då gäller:
//   GPL-3.0 §4    mottagaren ska få en kopia av licensen
//   LGPL-3.0 §4a  tydlig notis om att biblioteket används och omfattas av LGPL
//   LGPL-3.0 §4b  en kopia av BÅDE GPL- och LGPL-texten
//   OFL-1.1 §2    copyright och licens med varje kopia av typsnitten
//   MIT           notisen ska följa med alla kopior
//
// Filerna emitteras separat i stället för att bakas in i HTML:en. OFL tillåter
// uttryckligen "stand-alone text files", och 43 kB licenstext i en data-URI
// hade varken varit läsbart eller till nytta. Källfilerna är de som redan
// finns i repot, så det finns bara en uppsättning att underhålla.
function emitLicenses(): Plugin {
  const DISTRIBUTED: Array<[string, string]> = [
    // I dist/                                  // Källa i repot
    ['LICENSE.txt',                             'LICENSE'],
    ['NOTICE.txt',                              'NOTICE.txt'],
    ['licenses/LGPL-3.0-opentimestamps.txt',    'licenses/opentimestamps-LGPL-3.0.txt'],
    ['licenses/OFL-1.1-Inter.txt',              'src/fonts/LICENSE-Inter.txt'],
    ['licenses/OFL-1.1-JetBrainsMono.txt',      'src/fonts/LICENSE-JetBrainsMono.txt'],
    ['licenses/MIT-hash-wasm.txt',              'licenses/MIT-hash-wasm.txt'],
    ['licenses/MIT-jszip.txt',                  'licenses/MIT-jszip.txt'],
    ['licenses/MIT-bitcore-lib.txt',            'licenses/MIT-bitcore-lib.txt'],
    ['licenses/MIT-elliptic.txt',               'licenses/MIT-elliptic.txt'],
  ];

  // LGPL §4a kräver notisen med VARJE kopia av den kombinerade byggnaden.
  // index.html kan skiljas från sina grannfiler, så den bär en egen kort
  // header som identifierar programmet och pekar vidare. Licenstexterna
  // ligger kvar i sina filer. Headern befriar inte en vidaredistributör från
  // egna skyldigheter — den gör inte en lösryckt kopia compliant i sig.
  const BANNER = `<!--
  Proof — Bitcoin Timestamp
  Copyright (C) 2026 jxrxn
  SPDX-License-Identifier: GPL-3.0-or-later

  Free software under the GNU General Public License, version 3 or later.
  A copy of the license is in LICENSE.txt next to this file.

  This file bundles third-party components. The OpenTimestamps library is
  used by it, and the library and its use are covered by the GNU Lesser
  General Public License, version 3. Fonts are under the SIL Open Font
  License 1.1. See NOTICE.txt and licenses/ next to this file.

  The Proof name, logo and brand assets are not covered by the GPL and are
  excluded from it; see NOTICE.txt. They are not required to run this
  program.

  Source code: https://github.com/jxrxn/proof
-->
`;

  return {
    name: 'emit-licenses',
    generateBundle() {
      for (const [fileName, src] of DISTRIBUTED) {
        this.emitFile({
          type: 'asset',
          fileName,
          source: readFileSync(fileURLToPath(new URL('./' + src, import.meta.url))),
        });
      }
    },
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return BANNER + html;
      },
    },
  };
}

// viteSingleFile bakar in all JS/CSS i dist/index.html. Appen förblir därmed
// körbar direkt från file:// — ikonerna bredvid är rena tillägg som bara
// används vid webbhosting, och 404:ar oskadligt lokalt.
export default defineConfig({
  // Relativ base, inte '/proof/'. GitHub Pages ligger på en underväg, men en
  // absolut base hade brutit file://-körningen. Relativa vägar fungerar i båda.
  base: './',
  plugins: [inlineOtsVendor(), emitIcons(), emitLicenses(), viteSingleFile()],
  build: {
    assetsInlineLimit: (filePath: string) => {
      // Fonterna ska bli data-URI:er så att HTML-filen är självbärande.
      if (filePath.endsWith('.woff2')) return true;
      // Ikonerna måste förbli egna filer — se emitIcons ovan.
      return false;
    },
  },
});
