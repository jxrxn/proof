// End-to-end-röktest mot det byggda dist/index.html i riktig Chrome:
//   1. skapa bevis från text  →  hash + ZIP-länk
//   2. mata tillbaka ZIP:en i verify  →  pending-utfall, knapp omkörbar
//   3. korrupt ZIP  →  inline-fel, ingen tyst krasch
// Kräver nätverk (OpenTimestamps-kalendrarna). Kör: npm run e2e
// Chrome-sökväg kan överridas med env CHROME.

import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/index.html');
const APP = 'file://' + dist;
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const fixtureDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const origB64 = readFileSync(path.join(fixtureDir, 'hello-world.txt')).toString('base64');
const otsB64 = readFileSync(path.join(fixtureDir, 'hello-world.txt.ots')).toString('base64');

let failures = 0;
const check = (ok, label) => { console.log((ok ? 'OK: ' : 'FAIL: ') + label); if (!ok) failures++; };
const squish = text => text.replace(/\s+/g, ' ').trim();

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
try {
  const page = await browser.newPage();
  const errors = [];
  const dialogs = [];
  const calendarPosts = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('request', req => {
    if (req.method() === 'POST' && req.url().includes('/digest')) {
      calendarPosts.push({
        url: req.url(),
        body: req.postData() || '',
      });
    }
  });
  page.on('dialog', async d => {
    dialogs.push(d.message());
    console.log('DIALOG:', d.message().split('\n')[0]);
    await d.dismiss();
  });

  await page.goto(APP, { waitUntil: 'networkidle0', timeout: 30000 });

  const otsLoaded = await page.evaluate(() => !!window.OpenTimestamps);
  check(otsLoaded, 'vendored OpenTimestamps bundle sets window.OpenTimestamps');

  const workerHash = await page.evaluate(async () => {
    return window.__proofTest?.hashBlobInWorker(new Blob(['abc']));
  });
  check(workerHash === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
        'real browser worker path hashes a small blob correctly');

  await page.evaluate(() => {
    window.__proofTest?.showOperationDemo('stamp', 'hashing', 0.42, true, true);
  });
  const progressUi = await page.evaluate(() => ({
    operationHidden: document.getElementById('stamp-operation').classList.contains('hidden'),
    text: document.getElementById('stamp-operation-text').textContent,
    progressHidden: document.getElementById('stamp-operation-progress').classList.contains('hidden'),
    progressValue: document.getElementById('stamp-operation-progress').value,
    cancelHidden: document.getElementById('stamp-operation-cancel').classList.contains('hidden'),
  }));
  check(!progressUi.operationHidden && progressUi.text?.includes('hashing') && !progressUi.progressHidden,
        'progress text and progress bar can be shown');
  check(progressUi.progressValue === 0.42 && !progressUi.cancelHidden,
        'progress demo shows expected value and cancel button');
  await page.evaluate(() => {
    document.getElementById('stamp-operation-cancel').focus();
  });
  const cancelFocused = await page.evaluate(() => document.activeElement?.id === 'stamp-operation-cancel');
  check(cancelFocused, 'cancel button is keyboard-focusable when shown');
  await page.evaluate(() => {
    window.__proofTest?.resetOperationDemo('stamp');
  });

  const a11y = await page.evaluate(() => ({
    statusLive: document.getElementById('status-list').getAttribute('aria-live'),
    vrStatusLive: document.getElementById('vr-status-list').getAttribute('aria-live'),
    inputFocusable: getComputedStyle(document.getElementById('file-input')).display !== 'none',
  }));
  check(a11y.statusLive === 'polite' && a11y.vrStatusLive === 'polite', 'status areas are aria-live=polite');
  check(a11y.inputFocusable, 'file inputs are focusable (not display:none)');

  const initialCopy = await page.evaluate(() => ({
    createHelper: document.querySelector('#stamp-input-card .helper-text')?.textContent || '',
    verifyHelper: document.querySelector('#verify-input-card .helper-text')?.textContent || '',
    activeVerifyTab: document.querySelector('.vtab.active')?.getAttribute('data-vtab'),
    primaryModeNote: document.querySelector('#vseparate-panel .mode-note')?.textContent || '',
    zipModeNote: document.querySelector('#vzip-panel .mode-note')?.textContent || '',
  }));
  check(squish(initialCopy.createHelper).includes('Large files are supported when saving a proof file (.ots).'),
        'create copy presents .ots as the large-file-safe default');
  check(squish(initialCopy.createHelper).includes('Proof packages include the original file and are currently limited to 100 MB.'),
        'create copy presents proof packages as limited and secondary');
  check(squish(initialCopy.verifyHelper).includes('For large files, use the original file and its .ots proof.'),
        'verify copy recommends original file + .ots for large files');
  check(squish(initialCopy.verifyHelper).includes('Proof package verification is currently limited to 100 MB.'),
        'verify copy states the package limit clearly');
  check(squish(initialCopy.verifyHelper).includes('Proof packages include the original file.'),
        'verify copy states that proof packages include the original file');
  check(initialCopy.activeVerifyTab === 'vseparate', 'Verify original file + .ots is the default verify mode');

  await page.evaluate(() => {
    window.__proofTest?.setPackageCapabilityOverride({
      supported: false,
      mode: 'unsupported',
      maxBytes: 100 * 1024 * 1024,
      reason: 'Proof packages are unavailable in this browser/app mode. Save the .ots proof file instead.',
    });
  });
  const unsupportedCopy = await page.evaluate(() => ({
    capabilityCopy: document.getElementById('package-capability-copy')?.textContent || '',
    verifyCapabilityCopy: document.getElementById('verify-package-capability-copy')?.textContent || '',
  }));
  check(squish(unsupportedCopy.capabilityCopy).includes('Proof packages are unavailable in this browser/app mode.'),
        'create page copy updates when proof packages are unsupported');
  check(squish(unsupportedCopy.verifyCapabilityCopy).includes('Proof package verification is unavailable in this browser/app mode.'),
        'verify page copy updates when package verification is unsupported');

  await page.evaluate(() => {
    const file = new File(['package-unsupported'], 'package-unsupported.txt', { type: 'text/plain' });
    const dt = new DataTransfer();
    dt.items.add(file);
    const ev = new DragEvent('drop', { bubbles: true });
    Object.defineProperty(ev, 'dataTransfer', { value: dt });
    document.getElementById('drop').dispatchEvent(ev);
  });
  await page.click('#generate');
  await page.waitForFunction(
    () => !document.getElementById('proof-link').classList.contains('hidden') &&
          !document.getElementById('package-note').classList.contains('hidden'),
    { timeout: 90000 }
  );
  const unsupportedPackage = await page.evaluate(() => ({
    proofHidden: document.getElementById('proof-link').classList.contains('hidden'),
    packageHidden: document.getElementById('download-link').classList.contains('hidden'),
    noteText: document.getElementById('package-note').textContent || '',
  }));
  check(!unsupportedPackage.proofHidden, '.ots still works when proof packages are unsupported');
  check(unsupportedPackage.packageHidden &&
        squish(unsupportedPackage.noteText).includes('Proof packages are unavailable in this browser/app mode.'),
        'proof package is not offered when capability is unsupported');
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
    dropOn('vots-drop', toFile(otsB64, 'hello-world.txt.ots'));
  }, origB64, otsB64);
  check(await page.$eval('#verify-btn', b => !b.disabled),
        'original file + .ots verify stays available when package verification is unsupported');
  await page.click('.vtab[data-vtab="vzip"]');
  const unsupportedVerifyZip = await page.evaluate(() => ({
    capabilityCopy: document.getElementById('verify-package-capability-copy')?.textContent || '',
    buttonDisabled: document.getElementById('verify-btn').disabled,
  }));
  check(squish(unsupportedVerifyZip.capabilityCopy).includes('Proof package verification is unavailable in this browser/app mode.'),
        'package verify shows fallback copy instead of pretending support');
  check(unsupportedVerifyZip.buttonDisabled,
        'package verify action is disabled when capability is unsupported');
  await page.click('.vtab[data-vtab="vseparate"]');
  await page.evaluate(() => {
    window.__proofTest?.setPackageCapabilityOverride(null);
  });

  // ── Stamp: small file mode ──
  const marker = 'network-payload-marker-' + Date.now();
  const smallFileName = 'network-check.txt';
  await page.evaluate(({ marker, smallFileName }) => {
    const file = new File([marker], smallFileName, { type: 'text/plain' });
    const dt = new DataTransfer();
    dt.items.add(file);
    const ev = new DragEvent('drop', { bubbles: true });
    Object.defineProperty(ev, 'dataTransfer', { value: dt });
    document.getElementById('drop').dispatchEvent(ev);
  }, { marker, smallFileName });
  await page.click('#generate');
  await page.waitForFunction(
    () => (
      !document.getElementById('proof-link').classList.contains('hidden') &&
      (
        !document.getElementById('download-link').classList.contains('hidden') ||
        !document.getElementById('package-note').classList.contains('hidden')
      )
    ) ||
          document.querySelector('#status-list .status.err'),
    { timeout: 90000 }
  );
  const stamp = await page.evaluate(() => ({
    err: document.querySelector('#status-list .status.err')?.textContent || null,
    hash: document.getElementById('result-hash').textContent,
    proofName: document.getElementById('proof-link').download,
    dlName: document.getElementById('download-link').download,
    packageHidden: document.getElementById('download-link').classList.contains('hidden'),
    proofText: document.getElementById('proof-link').textContent,
    packageText: document.getElementById('download-link').textContent,
  }));
  if (stamp.err) { console.log('FAIL: stamp errored: ' + stamp.err); process.exit(1); }
  check(/^[0-9a-f]{64}$/.test(stamp.hash), 'stamp produced a SHA-256 hash');
  check(/^proof_.*_initial\.ots$/.test(stamp.proofName), 'stamp produced an initial .ots proof (' + stamp.proofName + ')');
  check(stamp.proofText === 'Save proof file (.ots)', '.ots is presented as the primary download after create');
  check(!stamp.packageHidden && /^proof_.*\.zip$/.test(stamp.dlName), 'stamp produced a proof ZIP (' + stamp.dlName + ')');
  check(stamp.packageText === 'Save proof package (.zip, includes original file)',
        'proof package is presented as the secondary ZIP download');
  check(!await page.$eval('#download-warning', el => el.classList.contains('hidden')),
        'original-file warning shown next to the stamp download link');
  check(calendarPosts.length > 0, 'OpenTimestamps calendar POSTs were observed');
  check(!calendarPosts.some(req => req.body.includes(marker) || req.body.includes(smallFileName)),
        'OpenTimestamps requests do not include file contents or file name');

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
  check(await page.$eval('.vtab.active', el => el.getAttribute('data-vtab') === 'vzip'),
        'dragging a ZIP into the package zone selects package mode');
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

  // ── Large file >100 MB → .ots still works, package is unavailable ──
  await page.evaluate(() => {
    const chunks = Array.from({ length: 101 }, () => new Uint8Array(1024 * 1024));
    const file = new File(chunks, 'large-over-limit.bin', { type: 'application/octet-stream' });
    const dt = new DataTransfer();
    dt.items.add(file);
    const ev = new DragEvent('drop', { bubbles: true });
    Object.defineProperty(ev, 'dataTransfer', { value: dt });
    document.getElementById('drop').dispatchEvent(ev);
  });
  await page.click('#generate');
  await page.waitForFunction(
    () => (
      !document.getElementById('proof-link').classList.contains('hidden') &&
      (
        !document.getElementById('download-link').classList.contains('hidden') ||
        !document.getElementById('package-note').classList.contains('hidden')
      )
    ) ||
          document.querySelector('#status-list .status.err'),
    { timeout: 120000 }
  );
  const largeStamp = await page.evaluate(() => ({
    proofName: document.getElementById('proof-link').download,
    packageHidden: document.getElementById('download-link').classList.contains('hidden'),
    noteHidden: document.getElementById('package-note').classList.contains('hidden'),
    noteText: document.getElementById('package-note').textContent,
  }));
  check(/^proof_.*_initial\.ots$/.test(largeStamp.proofName), 'large file over 100 MB can still create an .ots proof');
  check(largeStamp.packageHidden,
        'proof package is hidden or rejected clearly for large files');

  // ── Cancel during hashing ──
  await page.evaluate(() => {
    const chunks = Array.from({ length: 140 }, () => new Uint8Array(1024 * 1024));
    const file = new File(chunks, 'cancel-me.bin', { type: 'application/octet-stream' });
    const dt = new DataTransfer();
    dt.items.add(file);
    const ev = new DragEvent('drop', { bubbles: true });
    Object.defineProperty(ev, 'dataTransfer', { value: dt });
    document.getElementById('drop').dispatchEvent(ev);
  });
  await page.click('#generate');
  await page.waitForFunction(
    () => !document.getElementById('stamp-operation-cancel').classList.contains('hidden'),
    { timeout: 15000 }
  );
  await page.click('#stamp-operation-cancel');
  await page.waitForFunction(
    () => document.getElementById('stamp-operation-text').textContent.includes('cancelled'),
    { timeout: 15000 }
  );
  const cancelled = await page.evaluate(() => ({
    text: document.getElementById('stamp-operation-text').textContent,
    proofHidden: document.getElementById('proof-link').classList.contains('hidden'),
    resultHidden: document.getElementById('result-content').classList.contains('hidden'),
    hashText: document.getElementById('result-hash').textContent,
    nameText: document.getElementById('result-name').textContent,
  }));
  check(cancelled.text.includes('cancelled'), 'cancel during hashing reports a cancelled state');
  check(cancelled.proofHidden, 'cancelled hashing does not leave a downloadable proof behind');
  check(cancelled.resultHidden && cancelled.hashText === '' && cancelled.nameText === '',
        'cancelled hashing clears stale create metadata');

  // ── New input during a running create-hash must abort the old operation:
  //    the old run may not produce a proof/link against the new input ──
  await page.click('#generate');
  await page.waitForFunction(
    () => !document.getElementById('stamp-operation-cancel').classList.contains('hidden'),
    { timeout: 15000 }
  );
  await page.evaluate(() => {
    const file = new File([new Uint8Array([1, 2, 3])], 'replacement.txt');
    const dt = new DataTransfer();
    dt.items.add(file);
    const ev = new DragEvent('drop', { bubbles: true });
    Object.defineProperty(ev, 'dataTransfer', { value: dt });
    document.getElementById('drop').dispatchEvent(ev);
  });
  await page.waitForFunction(
    () => document.getElementById('stamp-operation-text').textContent.includes('cancelled'),
    { timeout: 15000 }
  );
  await new Promise(r => setTimeout(r, 800));   // låt ev. kvardröjande gammal operation hinna "bli klar"
  const newInputDuringStamp = await page.evaluate(() => ({
    proofHidden: document.getElementById('proof-link').classList.contains('hidden'),
    packageHidden: document.getElementById('download-link').classList.contains('hidden'),
    resultHidden: document.getElementById('result-content').classList.contains('hidden'),
    fileName: document.getElementById('file-name').textContent,
    generateEnabled: !document.getElementById('generate').disabled,
  }));
  check(newInputDuringStamp.proofHidden && newInputDuringStamp.packageHidden && newInputDuringStamp.resultHidden,
        'new input during create-hash aborts the old run without leaving proof/links');
  check(newInputDuringStamp.fileName === 'replacement.txt' && newInputDuringStamp.generateEnabled,
        'new input is selected and create can be restarted after the abort');

  // ── Type-aware rerouting: dropping an .ots onto the default ZIP zone should
  //    switch to File + OTS and place the file in the OTS slot ──
  await page.click('.vtab[data-vtab="vzip"]');
  await page.evaluate(otsB64 => {
    const bytes = Uint8Array.from(atob(otsB64), c => c.charCodeAt(0));
    const file = new File([bytes], 'hello-world.txt.ots');
    const dt = new DataTransfer();
    dt.items.add(file);
    const ev = new DragEvent('drop', { bubbles: true });
    Object.defineProperty(ev, 'dataTransfer', { value: dt });
    document.getElementById('zip-drop').dispatchEvent(ev);
  }, otsB64);
  const rerouteToOts = await page.evaluate(() => ({
    active: document.querySelector('.vtab.active')?.getAttribute('data-vtab'),
    otsName: document.getElementById('vots-name').textContent,
    zipName: document.getElementById('zip-name').textContent,
  }));
  check(rerouteToOts.active === 'vseparate', 'dropping .ots on ZIP zone switches to File + OTS');
  check(rerouteToOts.otsName === 'hello-world.txt.ots', 'dropped .ots is shown in the OTS slot');
  check(rerouteToOts.zipName === 'No ZIP selected', 'wrong drop does not stay in the ZIP slot');

  // ── In Text + OTS mode, dropping an .ots should stay in that mode and fill
  //    the text proof slot ──
  await page.click('.vtab[data-vtab="vtext"]');
  await page.evaluate(otsB64 => {
    const bytes = Uint8Array.from(atob(otsB64), c => c.charCodeAt(0));
    const file = new File([bytes], 'hello-world.txt.ots');
    const dt = new DataTransfer();
    dt.items.add(file);
    const ev = new DragEvent('drop', { bubbles: true });
    Object.defineProperty(ev, 'dataTransfer', { value: dt });
    document.getElementById('vots-text-drop').dispatchEvent(ev);
  }, otsB64);
  const textOts = await page.evaluate(() => ({
    active: document.querySelector('.vtab.active')?.getAttribute('data-vtab'),
    otsName: document.getElementById('vots-text-name').textContent,
  }));
  check(textOts.active === 'vtext', 'dropping .ots in Text + OTS mode keeps that mode active');
  check(textOts.otsName === 'hello-world.txt.ots', 'dropped .ots is shown in the text proof slot');

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

  // ── Oversized package ZIP → rejected with an alert before any hashing ──
  const dialogsBefore = dialogs.length;
  await page.evaluate(() => {
    const file = new File([new ArrayBuffer(100 * 1024 * 1024 + 1)], 'Typo.zip');
    const dt = new DataTransfer();
    dt.items.add(file);
    const ev = new DragEvent('drop', { bubbles: true });
    Object.defineProperty(ev, 'dataTransfer', { value: dt });
    document.getElementById('zip-drop').dispatchEvent(ev);
  });
  await new Promise(r => setTimeout(r, 400));
  check(dialogs.length > dialogsBefore && dialogs[dialogs.length - 1].includes('not supported'),
        'oversized package ZIP rejected with a clear message');
  check(await page.$eval('#zip-name', el => el.textContent !== 'Typo.zip'),
        'oversized package ZIP was not accepted as input');

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
        `outer bomb ZIP is small (${(bombBytes.length / 1024).toFixed(0)} KB) – inner entry check is what must catch it`);

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
    () => {
      const method = window.__proofTest?.getDebugState().lastVerifyHashMethod;
      return method === 'worker' || method === 'streaming-fallback';
    },
    { timeout: 15000 }
  );
  const verifyHashMethod = await page.evaluate(() => window.__proofTest?.getDebugState().lastVerifyHashMethod);
  check(verifyHashMethod === 'worker' || verifyHashMethod === 'streaming-fallback',
        'File + OTS uses the streaming hash path');
  await page.waitForFunction(
    () => document.querySelector('#vr-status-list .verdict-banner') ||
          document.querySelector('#vr-status-list .status.err'),
    { timeout: 90000 }
  );
  // Paket-ZIP:en byggs efter att bannern visats – vänta in spara-länken
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
    operationHidden: document.getElementById('verify-operation').classList.contains('hidden'),
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
  check(fixture.operationHidden, 'verify operation UI resets after a completed verify');
  const roundtripPackage = await page.evaluate(async () => {
    const link = document.getElementById('vr-upgraded-link');
    const blob = await (await fetch(link.href)).blob();
    return {
      href: link.href,
      download: link.download,
      bytes: Array.from(new Uint8Array(await blob.arrayBuffer())),
    };
  });

  // ── Large original file named .zip + .ots in File + OTS mode should be
  //    accepted even though ZIP/package mode still rejects >100 MB ──
  await page.click('.vtab[data-vtab="vseparate"]');
  await page.evaluate(() => {
    const bigFile = new File(
      Array.from({ length: 101 }, () => new Uint8Array(1024 * 1024)),
      'Typo.zip',
      { type: 'application/zip' },
    );
    const otsFile = new File([new Uint8Array([1, 2, 3, 4])], 'Typo.zip.ots');
    const dropOn = (id, file) => {
      const dt = new DataTransfer();
      dt.items.add(file);
      const ev = new DragEvent('drop', { bubbles: true });
      Object.defineProperty(ev, 'dataTransfer', { value: dt });
      document.getElementById(id).dispatchEvent(ev);
    };
    dropOn('vorig-drop', bigFile);
    dropOn('vots-drop', otsFile);
  });
  const largeSeparate = await page.evaluate(() => ({
    activeMode: document.querySelector('.vtab.active')?.getAttribute('data-vtab'),
    origName: document.getElementById('vorig-name').textContent,
    otsName: document.getElementById('vots-name').textContent,
    btnDisabled: document.getElementById('verify-btn').disabled,
  }));
  check(largeSeparate.activeMode === 'vseparate' &&
        largeSeparate.origName === 'Typo.zip' &&
        largeSeparate.otsName === 'Typo.zip.ots' &&
        !largeSeparate.btnDisabled,
        'large original file named Typo.zip is accepted in File + OTS mode');

  // ── Cancel during verify hashing should stop the hash and leave no stale verdict ──
  await page.click('#verify-btn');
  await page.waitForFunction(
    () => !document.getElementById('verify-operation-cancel').classList.contains('hidden'),
    { timeout: 15000 }
  );
  await page.click('#verify-operation-cancel');
  await page.waitForFunction(
    () => document.getElementById('verify-operation-text').textContent.includes('cancelled'),
    { timeout: 15000 }
  );
  const verifyCancelled = await page.evaluate(() => ({
    text: document.getElementById('verify-operation-text').textContent,
    resultHidden: document.getElementById('verify-result-content').classList.contains('hidden'),
    downloadHidden: document.getElementById('vr-upgraded-link').classList.contains('hidden'),
    retryEnabled: !document.getElementById('verify-btn').disabled,
  }));
  check(verifyCancelled.text.includes('cancelled'), 'cancel during verify hashing reports a cancelled state');
  check(verifyCancelled.resultHidden && verifyCancelled.downloadHidden && verifyCancelled.retryEnabled,
        'cancel during verify hashing leaves no stale verdict, no stale download, and keeps retry possible');

  // ── New input during a running verify-hash must abort the old operation:
  //    the old run may not produce a verdict/download against the new input ──
  await page.click('#verify-btn');
  await page.waitForFunction(
    () => !document.getElementById('verify-operation-cancel').classList.contains('hidden'),
    { timeout: 15000 }
  );
  await page.evaluate(() => {
    const file = new File([new Uint8Array([9, 9, 9])], 'replacement-original.bin');
    const dt = new DataTransfer();
    dt.items.add(file);
    const ev = new DragEvent('drop', { bubbles: true });
    Object.defineProperty(ev, 'dataTransfer', { value: dt });
    document.getElementById('vorig-drop').dispatchEvent(ev);
  });
  await page.waitForFunction(
    () => document.getElementById('verify-operation-text').textContent.includes('cancelled'),
    { timeout: 15000 }
  );
  await new Promise(r => setTimeout(r, 800));   // låt ev. kvardröjande gammal operation hinna "bli klar"
  const newInputDuringVerify = await page.evaluate(() => ({
    banner: document.querySelector('#vr-status-list .verdict-banner')?.className ?? null,
    resultHidden: document.getElementById('verify-result-content').classList.contains('hidden'),
    downloadHidden: document.getElementById('vr-upgraded-link').classList.contains('hidden'),
    origName: document.getElementById('vorig-name').textContent,
    retryEnabled: !document.getElementById('verify-btn').disabled,
  }));
  check(newInputDuringVerify.banner === null && newInputDuringVerify.resultHidden && newInputDuringVerify.downloadHidden,
        'new input during verify-hash aborts the old run without leaving verdict/download');
  check(newInputDuringVerify.origName === 'replacement-original.bin' && newInputDuringVerify.retryEnabled,
        'new original is selected and verify can be restarted after the abort');

  // ── Corrupt .ots in File + OTS mode → retryable inline error ──
  await page.evaluate(() => {
    const smallFile = new File([new TextEncoder().encode('hello world')], 'hello.txt', { type: 'text/plain' });
    const badOts = new File([new Uint8Array([9, 8, 7, 6])], 'bad.ots');
    const dropOn = (id, file) => {
      const dt = new DataTransfer();
      dt.items.add(file);
      const ev = new DragEvent('drop', { bubbles: true });
      Object.defineProperty(ev, 'dataTransfer', { value: dt });
      document.getElementById(id).dispatchEvent(ev);
    };
    dropOn('vorig-drop', smallFile);
    dropOn('vots-drop', badOts);
  });
  await page.click('#verify-btn');
  await page.waitForFunction(() => document.getElementById('vs-parse') || document.getElementById('vs-load-error'), { timeout: 15000 });
  check(await page.$eval('#verify-btn', b => !b.disabled), 'corrupt .ots in File + OTS mode leaves retry possible');

  // ── Simulate worker failure once and confirm verify falls back to main-thread streaming ──
  await page.evaluate((origB64, otsB64) => {
    window.__proofDebugState.forceVerifyHashWorkerFailureCount += 1;
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
    dropOn('vots-drop', toFile(otsB64, 'hello-world.txt.ots'));
  }, origB64, otsB64);
  await page.click('#verify-btn');
  await page.waitForFunction(
    () => window.__proofTest?.getDebugState().lastVerifyHashMethod === 'streaming-fallback',
    { timeout: 15000 }
  );
  check(
    await page.evaluate(() => window.__proofTest?.getDebugState().lastVerifyHashMethod === 'streaming-fallback'),
    'verify falls back to main-thread streaming if the worker fails'
  );
  await page.waitForFunction(
    () => document.querySelector('#vr-status-list .verdict-banner') ||
          document.querySelector('#vr-status-list .status.err'),
    { timeout: 90000 }
  );

  // Round-trip: the saved package must verify in the ZIP tab
  await page.click('.vtab[data-vtab="vzip"]');
  await page.evaluate((saved) => {
    const file = new File([new Uint8Array(saved.bytes)], saved.download, { type: 'application/zip' });
    const dt = new DataTransfer();
    dt.items.add(file);
    const ev = new DragEvent('drop', { bubbles: true });
    Object.defineProperty(ev, 'dataTransfer', { value: dt });
    document.getElementById('zip-drop').dispatchEvent(ev);
  }, roundtripPackage);
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
