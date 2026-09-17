// Ikon- och manifest-metadata. Ligger här bredvid bildfilerna så att en ändrad
// ikon och dess beskrivning hålls ihop. Läses bara av vite.config.ts vid bygge,
// aldrig av appen.

export const SITE_URL = 'https://jxrxn.github.io/proof/';

export const APP_NAME = 'Proof — Bitcoin Timestamp';
export const APP_SHORT_NAME = 'Proof';
export const APP_DESCRIPTION =
  'Timestamp text or a file against the Bitcoin blockchain. The SHA-256 hash ' +
  'is created on your device and only that hash is submitted to OpenTimestamps.';

// Bakgrunds- och temafärg speglar --bg i src/style.css.
export const THEME_COLOR = '#0d0d10';

export type IconFile = {
  file: string;
  sizes?: string;
  type: string;
  purpose?: 'any' | 'maskable';
  inManifest: boolean;
};

export const ICONS: IconFile[] = [
  { file: 'favicon.svg',            type: 'image/svg+xml', inManifest: false },
  { file: 'favicon-48-32-16.ico',   type: 'image/x-icon', sizes: '48x48 32x32 16x16', inManifest: false },
  { file: 'apple-touch-icon.png',   type: 'image/png', sizes: '180x180', inManifest: false },
  { file: 'icon-192.png',           type: 'image/png', sizes: '192x192', purpose: 'any', inManifest: true },
  { file: 'icon-512.png',           type: 'image/png', sizes: '512x512', purpose: 'any', inManifest: true },
  { file: 'icon-maskable-512.png',  type: 'image/png', sizes: '512x512', purpose: 'maskable', inManifest: true },
];

export const OG_IMAGE = { file: 'og-image.png', width: 1200, height: 630 };
