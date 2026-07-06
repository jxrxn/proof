// End-to-end-röktest mot det byggda dist/index.html i riktig Chrome:
//   1. skapa bevis från text  →  hash + ZIP-länk
//   2. mata tillbaka ZIP:en i verify  →  pending-utfall, knapp omkörbar
//   3. korrupt ZIP  →  inline-fel, ingen tyst krasch
// Kräver nätverk (OpenTimestamps-kalendrarna). Kör: npm run build && npm run e2e
// Chrome-sökväg kan överridas med env CHROME.

import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/index.html');
const APP = 'file://' + dist;
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

let failures = 0;
const check = (ok, label) => { console.log((ok ? 'OK: ' : 'FAIL: ') + label); if (!ok) failures++; };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('dialog', async d => { console.log('DIALOG:', d.message().split('\n')[0]); await d.dismiss(); });

  await page.goto(APP, { waitUntil: 'networkidle0', timeout: 30000 });

  const otsLoaded = await page.evaluate(() => !!window.OpenTimestamps);
  check(otsLoaded, 'vendored OpenTimestamps bundle sets window.OpenTimestamps');

  // ── Stamp: text mode ──
  await page.click('.tab[data-tab="text"]');
  await page.type('#text-input', 'e2e-test ' + Date.now());
  await page.click('#generate');
  await page.waitForFunction(
    () => !document.getElementById('download-link').classList.contains('hidden') ||
          document.querySelector('#status-list .status.err'),
    { timeout: 90000 }
  );
  const stamp = await page.evaluate(() => ({
    err: document.querySelector('#status-list .status.err')?.textContent || null,
    hash: document.getElementById('result-hash').textContent,
    dlName: document.getElementById('download-link').download,
  }));
  if (stamp.err) { console.log('FAIL: stamp errored: ' + stamp.err); process.exit(1); }
  check(/^[0-9a-f]{64}$/.test(stamp.hash), 'stamp produced a SHA-256 hash');
  check(/^proof_.*\.zip$/.test(stamp.dlName), 'stamp produced a proof ZIP (' + stamp.dlName + ')');

  // ── Feed the produced ZIP into the verify panel via a synthetic drop ──
  await page.evaluate(async () => {
    const resp = await fetch(document.getElementById('download-link').href);
    const blob = await resp.blob();
    const file = new File([blob], document.getElementById('download-link').download, { type: 'application/zip' });
    const dt = new DataTransfer();
    dt.items.add(file);
    const ev = new DragEvent('drop', { bubbles: true });
    Object.defineProperty(ev, 'dataTransfer', { value: dt });
    document.getElementById('zip-drop').dispatchEvent(ev);
  });
  check(await page.$eval('#verify-btn', b => !b.disabled), 'verify button enabled after ZIP drop');

  await page.click('#verify-btn');
  await page.waitForFunction(
    () => document.querySelector('#vr-status-list .verdict-banner') ||
          document.querySelector('#vr-status-list .status.err'),
    { timeout: 90000 }
  );
  const verify = await page.evaluate(() => ({
    vrHash: document.getElementById('vr-hash').textContent,
    banner: document.querySelector('#vr-status-list .verdict-banner')?.className || null,
    btnDisabled: document.getElementById('verify-btn').disabled,
  }));
  check(verify.vrHash === stamp.hash, 'verify hash matches stamp hash');
  check(verify.banner !== null && (verify.banner.includes('pending') || verify.banner.includes('verified')),
        'verdict banner shown (' + verify.banner + ')');
  if (verify.banner?.includes('pending')) {
    check(!verify.btnDisabled, 'verify button re-enabled for retry on pending');
  }

  // ── Corrupt ZIP → inline load error, retry possible ──
  await page.evaluate(() => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'broken.zip', { type: 'application/zip' });
    const dt = new DataTransfer();
    dt.items.add(file);
    const ev = new DragEvent('drop', { bubbles: true });
    Object.defineProperty(ev, 'dataTransfer', { value: dt });
    document.getElementById('zip-drop').dispatchEvent(ev);
  });
  await page.click('#verify-btn');
  await page.waitForFunction(() => document.getElementById('vs-load-error'), { timeout: 15000 });
  check(await page.$eval('#verify-btn', b => !b.disabled), 'retry possible after corrupt-ZIP error');

  if (errors.length) { console.log('page errors:', errors); failures++; }
  console.log(failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED');
  process.exitCode = failures === 0 ? 0 : 1;
} finally {
  await browser.close();
}
