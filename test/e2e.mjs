// End-to-end-röktest mot det byggda dist/index.html i riktig Chrome:
//   1. skapa bevis från text  →  hash + ZIP-länk
//   2. mata tillbaka ZIP:en i verify  →  pending-utfall, knapp omkörbar
//   3. korrupt ZIP  →  inline-fel, ingen tyst krasch
// Kräver nätverk (OpenTimestamps-kalendrarna). Kör: npm run build && npm run e2e
// Chrome-sökväg kan överridas med env CHROME.

import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/index.html');
const APP = 'file://' + dist;
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

let failures = 0;
const check = (ok, label) => { console.log((ok ? 'OK: ' : 'FAIL: ') + label); if (!ok) failures++; };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
try {
  const page = await browser.newPage();
  const errors = [];
  const dialogs = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('dialog', async d => {
    dialogs.push(d.message());
    console.log('DIALOG:', d.message().split('\n')[0]);
    await d.dismiss();
  });

  await page.goto(APP, { waitUntil: 'networkidle0', timeout: 30000 });

  const otsLoaded = await page.evaluate(() => !!window.OpenTimestamps);
  check(otsLoaded, 'vendored OpenTimestamps bundle sets window.OpenTimestamps');

  const a11y = await page.evaluate(() => ({
    statusLive: document.getElementById('status-list').getAttribute('aria-live'),
    vrStatusLive: document.getElementById('vr-status-list').getAttribute('aria-live'),
    inputFocusable: getComputedStyle(document.getElementById('file-input')).display !== 'none',
  }));
  check(a11y.statusLive === 'polite' && a11y.vrStatusLive === 'polite', 'status areas are aria-live=polite');
  check(a11y.inputFocusable, 'file inputs are focusable (not display:none)');

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
  check(!await page.$eval('#download-warning', el => el.classList.contains('hidden')),
        'original-file warning shown next to the stamp download link');

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

  // ── Oversized file → rejected with an alert before any hashing ──
  const dialogsBefore = dialogs.length;
  await page.evaluate(() => {
    const file = new File([new ArrayBuffer(100 * 1024 * 1024 + 1)], 'huge.zip');
    const dt = new DataTransfer();
    dt.items.add(file);
    const ev = new DragEvent('drop', { bubbles: true });
    Object.defineProperty(ev, 'dataTransfer', { value: dt });
    document.getElementById('zip-drop').dispatchEvent(ev);
  });
  await new Promise(r => setTimeout(r, 400));
  check(dialogs.length > dialogsBefore && dialogs[dialogs.length - 1].includes('not supported'),
        'oversized file rejected with a clear message');
  check(await page.$eval('#zip-name', el => el.textContent !== 'huge.zip'),
        'oversized file was not accepted as input');

  // ── Zip bomb: small compressed ZIP with a >100 MB original inside →
  //    rejected before extraction ──
  const bombZip = new JSZip();
  const bombFolder = bombZip.folder('proof_bomb');
  bombFolder.file('big.bin', new Uint8Array(100 * 1024 * 1024 + 1));   // 100 MB + 1 av nollor
  bombFolder.file('big.bin.ots', readFileSync(path.join(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures'), 'hello-world.txt.ots')));
  const bombBytes = await bombZip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
  check(bombBytes.length < 100 * 1024 * 1024,
        `outer bomb ZIP is small (${(bombBytes.length / 1024).toFixed(0)} KB) — inner entry check is what must catch it`);

  const bombDialogsBefore = dialogs.length;
  await page.evaluate(b64 => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const file = new File([bytes], 'bomb.zip', { type: 'application/zip' });
    const dt = new DataTransfer();
    dt.items.add(file);
    const ev = new DragEvent('drop', { bubbles: true });
    Object.defineProperty(ev, 'dataTransfer', { value: dt });
    document.getElementById('zip-drop').dispatchEvent(ev);
  }, bombBytes.toString('base64'));
  await page.click('#verify-btn');
  for (let i = 0; i < 40 && dialogs.length === bombDialogsBefore; i++) {
    await new Promise(r => setTimeout(r, 250));
  }
  check(dialogs.length > bombDialogsBefore &&
        dialogs[dialogs.length - 1] ===
          'The original file inside this ZIP is larger than 100 MB and cannot be verified in the browser.',
        'zip bomb rejected before extraction with the exact message');
  check(await page.$eval('#verify-btn', b => !b.disabled && b.textContent === 'Verify proof'),
        'app still responsive after zip bomb rejection');

  // ── Anchored fixture (OpenTimestamps hello-world example) → full VERIFIED
  //    flow via File + OTS, then round-trip the repackaged proof ZIP ──
  const fixtureDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
  const origB64 = readFileSync(path.join(fixtureDir, 'hello-world.txt')).toString('base64');
  const otsB64  = readFileSync(path.join(fixtureDir, 'hello-world.txt.ots')).toString('base64');

  await page.click('.vtab[data-vtab="vseparate"]');
  await page.evaluate((origB64, otsB64) => {
    const toFile = (b64, name) => {
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      return new File([bytes], name);
    };
    const dropOn = (id, file) => {
      const dt = new DataTransfer();
      dt.items.add(file);
      const ev = new DragEvent('drop', { bubbles: true });
      Object.defineProperty(ev, 'dataTransfer', { value: dt });
      document.getElementById(id).dispatchEvent(ev);
    };
    dropOn('vorig-drop', toFile(origB64, 'hello-world.txt'));
    dropOn('vots-drop',  toFile(otsB64,  'hello-world.txt.ots'));
  }, origB64, otsB64);
  check(await page.$eval('#verify-btn', b => !b.disabled), 'verify button enabled after File + OTS drops');

  await page.click('#verify-btn');
  await page.waitForFunction(
    () => document.querySelector('#vr-status-list .verdict-banner') ||
          document.querySelector('#vr-status-list .status.err'),
    { timeout: 90000 }
  );
  // Paket-ZIP:en byggs efter att bannern visats — vänta in spara-länken
  // (den ska alltid erbjudas vid VERIFIED) innan länkstatus läses.
  await page.waitForFunction(
    () => !document.getElementById('vr-upgraded-link').classList.contains('hidden') ||
          document.querySelector('#vr-status-list .status.err'),
    { timeout: 15000 }
  );
  const fixture = await page.evaluate(() => ({
    banner: document.querySelector('#vr-status-list .verdict-banner')?.className || null,
    bannerText: document.querySelector('#vr-status-list .verdict-banner')?.textContent.slice(0, 140) || null,
    linkHidden: document.getElementById('vr-upgraded-link').classList.contains('hidden'),
    linkText: document.getElementById('vr-upgraded-link').textContent,
    linkName: document.getElementById('vr-upgraded-link').download,
    btnDisabled: document.getElementById('verify-btn').disabled,
  }));
  console.log('fixture verify:', JSON.stringify(fixture, null, 1));
  check(fixture.banner?.includes('verified'), 'anchored fixture gives VERIFIED verdict');
  check(!fixture.linkHidden && fixture.linkText === 'Save verified proof package (.zip, includes original file)',
        'repackaged proof ZIP offered after VERIFIED');
  check(!await page.$eval('#vr-download-warning', el => el.classList.contains('hidden')),
        'original-file warning shown next to the verify download link');
  check(fixture.linkName === 'hello-world.txt_opentimestamps.zip',
        'repackaged ZIP has stable _opentimestamps name (' + fixture.linkName + ')');
  check(fixture.btnDisabled, 'verify button locked after VERIFIED (nothing left to redo)');

  // Round-trip: the saved package must verify in the ZIP tab
  await page.click('.vtab[data-vtab="vzip"]');
  await page.evaluate(async () => {
    const link = document.getElementById('vr-upgraded-link');
    const blob = await (await fetch(link.href)).blob();
    const file = new File([blob], link.download, { type: 'application/zip' });
    const dt = new DataTransfer();
    dt.items.add(file);
    const ev = new DragEvent('drop', { bubbles: true });
    Object.defineProperty(ev, 'dataTransfer', { value: dt });
    document.getElementById('zip-drop').dispatchEvent(ev);
  });
  await page.click('#verify-btn');
  await page.waitForFunction(
    () => document.querySelector('#vr-status-list .verdict-banner') ||
          document.querySelector('#vr-status-list .status.err'),
    { timeout: 90000 }
  );
  const roundtrip = await page.evaluate(() => ({
    banner: document.querySelector('#vr-status-list .verdict-banner')?.className || null,
    linkName: document.getElementById('vr-upgraded-link').download,
  }));
  check(roundtrip.banner?.includes('verified'), 'round-trip: repackaged ZIP verifies as VERIFIED');
  check(roundtrip.linkName === 'hello-world.txt_opentimestamps.zip',
        'round-trip keeps a stable package name (' + roundtrip.linkName + ')');

  // Saving the package offers to start fresh (dialog is dismissed = cancel)
  await page.click('#vr-upgraded-link');
  await new Promise(r => setTimeout(r, 900));
  check(dialogs.includes('Start fresh with a new proof?'),
        'saving the verified package asks to start fresh');
  check(!await page.$eval('#vr-upgraded-link', el => el.classList.contains('hidden')),
        'cancelling the dialog keeps the result intact');

  if (errors.length) { console.log('page errors:', errors); failures++; }
  console.log(failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED');
  process.exitCode = failures === 0 ? 0 : 1;
} finally {
  await browser.close();
}
