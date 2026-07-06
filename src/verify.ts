import JSZip from 'jszip';
import { byId, createStatusList, makeVerdictBanner, wireDrop } from './lib/dom';
import {
  sha256Hex, bytesToHex, errorMessage, withTimeout,
  MAX_FILE_BYTES, fileTooLargeMessage,
} from './lib/util';
import { getOts, opentimestampsProofName, detachedFromHashHex } from './lib/ots';
import { buildProofZip } from './lib/proofPackage';

// README för det ompaketerade beviset som kan sparas efter en verifiering.
function verifiedReadme(opts: {
  originalName: string;
  size: number;
  hashHex: string;
  otsFileName: string;
  verified: boolean;
  anchorDetails: string[];
}): string {
  const status = opts.verified
    ? `Full OpenTimestamps proof — VERIFIED, anchored in the Bitcoin blockchain.` +
      (opts.anchorDetails.length ? '\nAnchoring:  ' + opts.anchorDetails.join('\n            ') : '')
    : `Updated initial proof — contains newly fetched calendar data, but was
            not yet confirmed as anchored in Bitcoin when this package was
            saved. Verify again later.`;
  return `SHA-256 hash + OpenTimestamps
================================
Filename:   ${opts.originalName}
Size:       ${opts.size} bytes
Checked:    ${new Date().toISOString()}
Algorithm:  SHA-256
Status:     ${status}

SHA-256 hash:
${opts.hashHex}

Files in this package:
- ${opts.originalName}           Original file
- ${opts.originalName}.sha256    SHA-256 hash (shasum format)
- ${opts.otsFileName}   OpenTimestamps proof

Verify this package:
- Drop the whole ZIP in the Proof app's "Verify proof" panel, or
- with the command line client (pip install opentimestamps-client), run in
  this folder:
    ots verify -f "${opts.originalName}" "${opts.otsFileName}"
- or upload the .ots file and the original at https://opentimestamps.org

This proof demonstrates that the file existed at the anchored point in time,
without trusting anyone: the SHA-256 hash of the file is committed to a
Bitcoin block via OpenTimestamps.
`;
}

export interface VerifyPanel {
  /** Nollställer hela verifiera-sidan (inputs och resultatkort). */
  resetPanel(): void;
}

type VMode = 'vzip' | 'vseparate' | 'vtext';
type Verdict = 'verified' | 'pending' | 'failed' | 'error';

export function initVerify(opts: { onInputActivity: () => void }): VerifyPanel {
  let vMode: VMode = 'vzip';
  let vZipFile: File | null = null;
  let vOrigFile: File | null = null;
  let vOtsFile: File | null = null;
  let vOtsTextFile: File | null = null;
  let verifyDone = false;
  let currentUpgradedUrl: string | null = null;

  const vtabs             = document.querySelectorAll<HTMLButtonElement>('.vtab');
  const vzipPanel         = byId('vzip-panel');
  const vseparatePanel    = byId('vseparate-panel');
  const vtextPanel        = byId('vtext-panel');
  const vtextInput        = byId('vtext-input', HTMLTextAreaElement);
  const verifyBtn         = byId('verify-btn', HTMLButtonElement);
  const zipPrompt         = byId('zip-prompt');
  const vrContent         = byId('verify-result-content');
  const vrEmpty           = byId('verify-result-empty');
  const resultCard        = byId('verify-result-card');
  const vrUpgradedLink    = byId('vr-upgraded-link', HTMLAnchorElement);
  const vrDownloadWarning = byId('vr-download-warning');

  const vstatus = createStatusList(byId('vr-status-list'), 'vs-');

  function showVerifyContent() { vrContent.classList.remove('hidden'); vrEmpty.classList.add('hidden'); }
  function hideVerifyContent() { vrContent.classList.add('hidden');    vrEmpty.classList.remove('hidden'); }

  function setResultState(state: 'success' | 'pending' | 'failure' | 'neutral') {
    resultCard.classList.remove('is-success', 'is-pending', 'is-failure');
    if (state !== 'neutral') resultCard.classList.add('is-' + state);
  }

  function updateVerifyBtn() {
    let ready = false;
    if (vMode === 'vzip')      ready = vZipFile !== null;
    if (vMode === 'vseparate') ready = vOrigFile !== null && vOtsFile !== null;
    if (vMode === 'vtext')     ready = vtextInput.value.trim() !== '' && vOtsTextFile !== null;
    verifyBtn.disabled = !ready || verifyDone;
  }

  function clearVerifyResult() {
    hideVerifyContent();
    setResultState('neutral');
    vstatus.clear();
    byId('vr-hash').textContent = '';
    vrUpgradedLink.classList.add('hidden');
    vrDownloadWarning.classList.add('hidden');
    if (currentUpgradedUrl) {
      URL.revokeObjectURL(currentUpgradedUrl);
      currentUpgradedUrl = null;
    }
  }

  function clearVerifyOthers(exceptMode: VMode | null) {
    if (exceptMode !== 'vzip') {
      vZipFile = null;
      zipPrompt.classList.remove('hidden');
      byId('zip-name').textContent = 'No ZIP selected';
      byId('zip-input', HTMLInputElement).value = '';
    }
    if (exceptMode !== 'vseparate') {
      vOrigFile = null; vOtsFile = null;
      byId('vorig-name').textContent = 'Click or drag the original file here';
      byId('vots-name').textContent  = 'Click or drag the .ots file here';
      byId('vorig-input', HTMLInputElement).value = '';
      byId('vots-input', HTMLInputElement).value  = '';
    }
    if (exceptMode !== 'vtext') {
      vOtsTextFile = null;
      vtextInput.value = '';
      byId('vots-text-name').textContent = 'Click or drag the .ots file here';
      byId('vots-text-input', HTMLInputElement).value = '';
    }
  }

  function resetPanel() {
    verifyDone = false;
    clearVerifyOthers(null);
    updateVerifyBtn();
    clearVerifyResult();
  }

  vtabs.forEach(tab => {
    tab.addEventListener('click', () => {
      vtabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const m = tab.dataset.vtab;
      vMode = m === 'vseparate' || m === 'vtext' ? m : 'vzip';
      vzipPanel.classList.toggle('hidden',      vMode !== 'vzip');
      vseparatePanel.classList.toggle('hidden', vMode !== 'vseparate');
      vtextPanel.classList.toggle('hidden',     vMode !== 'vtext');
      updateVerifyBtn();
    });
  });

  vtextInput.addEventListener('input', () => {
    verifyDone = false;
    clearVerifyOthers('vtext');
    clearVerifyResult();
    updateVerifyBtn();
  });

  function makeVerifyDrop(
    dropId: string, inputId: string, nameId: string,
    mode: VMode, setter: (f: File) => void,
  ) {
    const nameEl = byId(nameId);
    const inputEl = byId(inputId, HTMLInputElement);
    wireDrop(byId(dropId), inputEl, f => {
      if (!f) return;
      // Storleksgräns före arrayBuffer(): allt hashas och packas upp i minnet.
      if (f.size > MAX_FILE_BYTES) {
        alert(fileTooLargeMessage(f));
        inputEl.value = '';
        return;
      }
      verifyDone = false;
      clearVerifyOthers(mode);
      clearVerifyResult();
      opts.onInputActivity();
      setter(f);
      if (mode === 'vzip') zipPrompt.classList.add('hidden');
      nameEl.textContent = f.name;
      updateVerifyBtn();
    });
  }

  makeVerifyDrop('zip-drop',       'zip-input',       'zip-name',       'vzip',      f => { vZipFile = f; });
  makeVerifyDrop('vorig-drop',     'vorig-input',     'vorig-name',     'vseparate', f => { vOrigFile = f; });
  makeVerifyDrop('vots-drop',      'vots-input',      'vots-name',      'vseparate', f => { vOtsFile = f; });
  makeVerifyDrop('vots-text-drop', 'vots-text-input', 'vots-text-name', 'vtext',     f => { vOtsTextFile = f; });

  // Returnerar utfallet — bara 'verified' låser Verify-knappen; övriga utfall
  // ska gå att köra om utan att användaren väljer om sina filer.
  async function runVerify(fileBytes: Uint8Array<ArrayBuffer>, otsBytes: Uint8Array<ArrayBuffer>, origName: string, otsName: string): Promise<Verdict> {
    const OTS = getOts();

    vstatus.clear();
    vrUpgradedLink.classList.add('hidden');
    showVerifyContent();

    const hashHex = await sha256Hex(fileBytes);
    byId('vr-hash').textContent = hashHex;

    let otsDetached: OtsDetachedTimestampFile;
    try {
      otsDetached = OTS.DetachedTimestampFile.deserialize(otsBytes);
    } catch (e) {
      setResultState('failure');
      vstatus.set('parse', 'Could not parse the .ots file: ' + errorMessage(e), 'err');
      return 'failed';
    }

    const otsHashHex = bytesToHex(otsDetached.timestamp.msg);

    if (hashHex !== otsHashHex) {
      setResultState('failure');
      const el = vstatus.set('hash-check', 'File hash does NOT match the .ots proof.', 'err');
      const small = document.createElement('small');
      small.append('File: ' + hashHex.slice(0, 20) + '…', document.createElement('br'),
                   'OTS:  ' + otsHashHex.slice(0, 20) + '…');
      el.append(document.createElement('br'), small, document.createElement('br'),
                'Wrong file provided, or the file has been modified.');
      return 'failed';
    }
    vstatus.set('hash-check', 'File hash matches the hash recorded in the .ots proof', 'ok');

    vstatus.set('upgrade', 'Checking OpenTimestamps for Bitcoin verification data…', 'info');
    let upgradedBytes: Uint8Array | null = null;
    try {
      // Timeout-skydd: en hängande kalenderserver får inte hänga verifieringen.
      const changed = await withTimeout(OTS.upgrade(otsDetached), 30000,
        'timed out — a calendar server may be down. Try again later.');
      if (changed) {
        upgradedBytes = otsDetached.serializeToBytes();
        vstatus.set('upgrade', 'Bitcoin verification data added — you now have a full OpenTimestamps proof', 'ok');
      } else {
        // Gäller både ett redan komplett bevis och ett färskt som ännu inte
        // ankrats — säg inte "already a full proof" när det kan vara pending.
        vstatus.set('upgrade', 'No new Bitcoin verification data was available to add', 'info');
      }
    } catch (e) {
      vstatus.set('upgrade', 'Could not reach OpenTimestamps: ' + errorMessage(e), 'warn');
    }

    vstatus.set('verify', 'Verifying the proof against Bitcoin block headers…', 'info');
    let verdict: Verdict = 'error';
    let anchorDetails: string[] = [];

    try {
      // detachedFromHashHex tar bara digesten — filinnehållet lämnar aldrig appen.
      const fileDetached = detachedFromHashHex(hashHex);
      const result = await withTimeout(OTS.verify(otsDetached, fileDetached), 30000,
        'Verification timed out — a calendar server may be down. Try again later.');

      let entries: Array<[string, OtsVerifyAttestation]> = [];
      if (result instanceof Map) {
        entries = [...result.entries()];
      } else if (result && typeof result === 'object') {
        entries = Object.entries(result);
      }

      vstatus.remove('verify');

      if (entries.length > 0) {
        verdict = 'verified';
        setResultState('success');
        // Ingen extern blockutforskare anropas här (tidigare BlockCypher):
        // verifiering ska inte läcka aktivitet till tredje part. Blockhöjd och
        // tid kommer ur själva verifieringsresultatet.
        const details = anchorDetails;
        for (const [, value] of entries) {
          const blockHeight = value.height;
          let dateStr = '';
          if (value.timestamp) {
            dateStr = new Date(value.timestamp * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
          }
          if (blockHeight) {
            details.push('Bitcoin block #' + blockHeight.toLocaleString('en') + (dateStr ? ' — ' + dateStr : ''));
          } else if (dateStr) {
            details.push(dateStr);
          }
        }
        vstatus.el.appendChild(makeVerdictBanner('verified', '✓', 'VERIFIED — Anchored in Bitcoin', details));
      } else {
        verdict = 'pending';
        setResultState('pending');
        vstatus.el.appendChild(makeVerdictBanner('pending', '–', 'Initial proof — not yet anchored in Bitcoin', [
          'This is normal for a new proof, not an error. The hash and the .ots file match; OpenTimestamps has your hash, but it has not been written into a Bitcoin block yet.',
          'Bitcoin anchoring usually completes within 1–6 hours — come back later and verify again.',
        ]));
      }

    } catch (e) {
      verdict = 'failed';
      setResultState('failure');
      vstatus.remove('verify');
      const msg = errorMessage(e).toLowerCase();
      if (msg.includes('mismatch') || msg.includes('bad') || msg.includes('match')) {
        vstatus.el.appendChild(makeVerdictBanner('failed', '✗', 'Verification failed',
          ['The hash in the proof does not match the Bitcoin verification data.']));
      } else {
        vstatus.el.appendChild(makeVerdictBanner('failed', '✗', 'Verification error',
          [errorMessage(e)]));
      }
    }

    // Erbjud ett komplett ompaketerat ZIP i stället för en lös .ots-fil — en
    // ensam .ots är obegriplig för mottagaren, medan paketet (original + bevis
    // + README) kan verifieras direkt i ZIP-fliken. Visas alltid när beviset är
    // verifierat, och även annars om uppgraderingen hämtade ny data (den ska
    // inte gå förlorad bara för att verifieringssteget misslyckades).
    if (verdict === 'verified' || upgradedBytes) {
      const otsFileName = opentimestampsProofName(otsName);
      const folderName = otsFileName.replace(/\.ots$/i, '');
      const blob = await buildProofZip({
        folderName,
        originalName: origName,
        original: fileBytes,
        hashHex,
        otsFileName,
        otsBytes: otsDetached.serializeToBytes(),
        readme: verifiedReadme({
          originalName: origName,
          size: fileBytes.byteLength,
          hashHex,
          otsFileName,
          verified: verdict === 'verified',
          anchorDetails,
        }),
      });
      if (currentUpgradedUrl) URL.revokeObjectURL(currentUpgradedUrl);
      currentUpgradedUrl = URL.createObjectURL(blob);
      vrUpgradedLink.href = currentUpgradedUrl;
      vrUpgradedLink.download = folderName + '.zip';
      vrUpgradedLink.textContent = verdict === 'verified'
        ? 'Save verified proof package (.zip, includes original file)'
        : 'Save updated proof package (.zip, includes original file)';
      vrUpgradedLink.classList.remove('hidden');
      vrDownloadWarning.classList.remove('hidden');
    }

    return verdict;
  }

  // Samma beteende som nedladdningslänken på skapa-sidan: efter att paketet
  // sparats, erbjud att börja om med ett nytt bevis.
  vrUpgradedLink.addEventListener('click', () => {
    setTimeout(() => {
      if (confirm('Start fresh with a new proof?')) resetPanel();
    }, 400);
  });

  verifyBtn.addEventListener('click', async () => {
    try {
      getOts();
    } catch (e) {
      alert(errorMessage(e));
      return;
    }
    verifyBtn.disabled = true;
    verifyBtn.textContent = 'Verifying…';
    let verdict: Verdict | null = null;

    try {
      if (vMode === 'vzip') {
        if (!vZipFile) { alert('Please select a ZIP file.'); return; }
        const zip = await JSZip.loadAsync(await vZipFile.arrayBuffer());

        const otsEntries: Array<{ name: string; entry: JSZip.JSZipObject }> = [];
        const origEntries: Array<{ name: string; entry: JSZip.JSZipObject }> = [];
        zip.forEach((path, entry) => {
          if (entry.dir) return;
          const name = path.split('/').pop() ?? path;
          if (name.endsWith('.ots')) {
            otsEntries.push({ name, entry });
          } else if (!name.endsWith('.sha256') && name !== 'README.txt') {
            origEntries.push({ name, entry });
          }
        });

        if (otsEntries.length === 0)  { alert('No .ots file found in the ZIP.'); return; }
        if (origEntries.length === 0) { alert('No original file found in the ZIP.'); return; }
        if (origEntries.length > 1) {
          alert('The ZIP contains more than one possible original file:\n' +
                origEntries.map(o => '• ' + o.name).join('\n') +
                '\nUse the "File + OTS" tab to pick the right file yourself.');
          return;
        }

        // Om ZIP:en innehåller flera .ots-filer (t.ex. både initial och
        // uppgraderad), föredra det fulla OpenTimestamps-beviset.
        let ots = otsEntries[0]!;
        if (otsEntries.length > 1) {
          const upgraded = otsEntries.find(o => /_opentimestamps\.ots$/i.test(o.name));
          if (!upgraded) {
            alert('The ZIP contains more than one .ots file:\n' +
                  otsEntries.map(o => '• ' + o.name).join('\n') +
                  '\nUse the "File + OTS" tab to pick the right proof yourself.');
            return;
          }
          ots = upgraded;
        }

        const otsBytes  = new Uint8Array(await ots.entry.async('arraybuffer'));
        const fileBytes = new Uint8Array(await origEntries[0]!.entry.async('arraybuffer'));
        verdict = await runVerify(fileBytes, otsBytes, origEntries[0]!.name, ots.name);

      } else if (vMode === 'vseparate') {
        if (!vOrigFile) { alert('Please select the original file.'); return; }
        if (!vOtsFile)  { alert('Please select the .ots proof file.'); return; }
        const fileBytes = new Uint8Array(await vOrigFile.arrayBuffer());
        const otsBytes  = new Uint8Array(await vOtsFile.arrayBuffer());
        verdict = await runVerify(fileBytes, otsBytes, vOrigFile.name, vOtsFile.name);

      } else {
        const text = vtextInput.value.trim();
        if (!text)         { alert('Please paste the original text.'); return; }
        if (!vOtsTextFile) { alert('Please select the .ots proof file.'); return; }
        const fileBytes = new TextEncoder().encode(text);
        const otsBytes  = new Uint8Array(await vOtsTextFile.arrayBuffer());
        verdict = await runVerify(fileBytes, otsBytes, 'text.txt', vOtsTextFile.name);
      }
    } catch (e) {
      // T.ex. korrupt ZIP eller oläsbar fil — visa felet i stället för att fela tyst.
      verdict = 'failed';
      showVerifyContent();
      setResultState('failure');
      vstatus.set('load-error', 'Could not read the input: ' + errorMessage(e), 'err');
    } finally {
      // Lås knappen bara när beviset är färdigverifierat; vid pending/fel ska
      // användaren kunna försöka igen utan att välja om sina filer.
      verifyDone = verdict === 'verified';
      updateVerifyBtn();
      verifyBtn.textContent = 'Verify proof';
    }
  });

  return { resetPanel };
}
