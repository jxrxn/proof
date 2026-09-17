import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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

// viteSingleFile bakar in all JS/CSS i dist/index.html så att bygget blir en
// enda självbärande fil som fungerar direkt från file:// — inga CDN-anrop.
export default defineConfig({
  plugins: [inlineOtsVendor(), viteSingleFile()],
  build: {
    // De vendrade woff2-filerna måste bli data-URI:er, annars skulle Vite
    // lägga dem som separata assets och bygget vore inte längre en enda fil.
    assetsInlineLimit: 256 * 1024,
  },
});
