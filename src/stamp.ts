import JSZip from 'jszip';
import { byId, createStatusList, wireDrop } from './lib/dom';
import { sha256Hex, formatBytes, formatTimestamp, errorMessage, withTimeout } from './lib/util';
import { getOts, reachableCalendars } from './lib/ots';

export interface StampPanel {
  /** Nollställer hela skapa-sidan (input, statusar, resultatkort, nedladdningslänk). */
  resetPanel(): void;
}

export function initStamp(opts: { onInputActivity: () => void }): StampPanel {
  let mode: 'file' | 'text' = 'file';
  let selectedFile: File | null = null;
  let currentDownloadUrl: string | null = null;

  const tabs          = document.querySelectorAll<HTMLButtonElement>('.tab');
  const filePanel     = byId('file-panel');
  const textPanel     = byId('text-panel');
  const fileInput     = byId<HTMLInputElement>('file-input');
  const fileNameEl    = byId('file-name');
  const drop          = byId('drop');
  const textInput     = byId<HTMLTextAreaElement>('text-input');
  const generateBtn   = byId<HTMLButtonElement>('generate');
  const downloadLink  = byId<HTMLAnchorElement>('download-link');
  const dropPrompt    = byId('drop-prompt');
  const resultContent = byId('result-content');
  const resultEmpty   = byId('result-empty');

  const status = createStatusList(byId('status-list'), 's-');

  function showResultContent() { resultContent.classList.remove('hidden'); resultEmpty.classList.add('hidden'); }
  function hideResultContent() { resultContent.classList.add('hidden');    resultEmpty.classList.remove('hidden'); }

  function updateStampBtn() {
    generateBtn.disabled = mode === 'file' ? selectedFile === null : textInput.value.trim() === '';
  }

  function clearDownload() {
    downloadLink.classList.add('hidden');
    if (currentDownloadUrl) {
      URL.revokeObjectURL(currentDownloadUrl);
      currentDownloadUrl = null;
    }
  }

  function resetStampInput() {
    selectedFile = null;
    fileNameEl.textContent = 'No file selected';
    dropPrompt.classList.remove('hidden');
    textInput.value = '';
    fileInput.value = '';
    updateStampBtn();
  }

  function resetPanel() {
    resetStampInput();
    clearDownload();
    hideResultContent();
    status.clear();
  }

  function resetAll() {
    resetPanel();
    for (const id of ['result-name', 'result-time', 'result-size', 'result-hash']) {
      byId(id).textContent = '';
    }
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      mode = tab.dataset.tab === 'text' ? 'text' : 'file';
      filePanel.classList.toggle('hidden', mode !== 'file');
      textPanel.classList.toggle('hidden', mode !== 'text');
      updateStampBtn();
    });
  });

  textInput.addEventListener('input', () => {
    opts.onInputActivity();
    updateStampBtn();
  });

  function setNewFile(f: File | null) {
    selectedFile = f;
    fileNameEl.textContent = f ? f.name : 'No file selected';
    dropPrompt.classList.toggle('hidden', f !== null);
    clearDownload();
    if (f) opts.onInputActivity();
    updateStampBtn();
  }

  wireDrop(drop, fileInput, f => setNewFile(f));

  generateBtn.addEventListener('click', async () => {
    generateBtn.disabled = true;
    generateBtn.textContent = 'Working…';
    status.clear();
    clearDownload();

    try {
      let data: Uint8Array<ArrayBuffer>, originalName: string, mimeContent: Blob;
      const now = new Date();
      const iso = now.toISOString();
      const stamp = iso.replace(/[:.]/g, '-').slice(0, 19);

      if (mode === 'file') {
        if (!selectedFile) { alert('Please select a file first.'); return; }
        data = new Uint8Array(await selectedFile.arrayBuffer());
        originalName = selectedFile.name;
        mimeContent = selectedFile;
      } else {
        const text = textInput.value.trim();
        if (!text) { alert('Please enter some text first.'); return; }
        data = new TextEncoder().encode(text);
        originalName = 'text.txt';
        mimeContent = new Blob([text], { type: 'text/plain' });
      }

      status.set('hash', 'Creating SHA-256 hash on your device…', 'info');
      const hashHex = await sha256Hex(data);
      const size = data.byteLength;

      byId('result-name').textContent = 'File: ' + originalName;
      byId('result-time').textContent = 'Created: ' + formatTimestamp(now);
      byId('result-size').textContent = 'Size: ' + formatBytes(size);
      byId('result-hash').textContent = hashHex;
      showResultContent();
      status.set('hash', 'SHA-256 created locally. Your original file was not uploaded.', 'ok');

      const OTS = getOts();

      status.set('ots', 'Submitting the hash to OpenTimestamps…', 'info');
      const detached = OTS.DetachedTimestampFile.fromBytes(new OTS.Ops.OpSHA256(), data);
      const calendars = await reachableCalendars();
      await withTimeout(OTS.stamp(detached, { calendars }), 30000,
        'OpenTimestamps calendar servers did not respond. Please try again in a little while.');
      const otsBytes = detached.serializeToBytes();
      status.set('ots', 'Hash submitted to OpenTimestamps. You now have an initial proof (.ots) — Bitcoin anchoring usually completes within 1–6 hours.', 'ok');

      // Enhetlig namngivning: samma tidsstämpel i ZIP-paketet, i det initiala
      // beviset och (senare) i OpenTimestamps-beviset, så användaren direkt ser
      // att de hör till samma tidsstämpling.
      const folderName       = 'proof_' + stamp;
      const initialProofName = folderName + '_initial.ots';
      const otsProofName     = folderName + '_opentimestamps.ots';
      const zip    = new JSZip();
      const folder = zip.folder(folderName)!;
      folder.file(originalName,             mimeContent);
      folder.file(initialProofName,         otsBytes);
      folder.file(originalName + '.sha256', hashHex + '  ' + originalName + '\n');
      folder.file('README.txt', `SHA-256 hash + OpenTimestamps
================================
Filename:   ${originalName}
Size:       ${size} bytes
Created:    ${iso}
Algorithm:  SHA-256
Status:     Initial proof — NOT yet anchored to Bitcoin.
            This .ots file does not yet contain Bitcoin verification data.
            Bitcoin anchoring usually completes within 1-6 hours, after which
            the initial proof becomes a full OpenTimestamps proof (see below).

SHA-256 hash:
${hashHex}

Files in this package:
- ${originalName}           Original file
- ${originalName}.sha256    SHA-256 hash (shasum format)
- ${initialProofName}   Initial proof (no Bitcoin verification data yet)

Verify SHA-256 (macOS / Linux):
  shasum -a 256 "${originalName}"

Verify SHA-256 (Windows PowerShell):
  Get-FileHash "${originalName}" -Algorithm SHA256

Turn the initial proof into an OpenTimestamps proof (requires opentimestamps-client):
  pip install opentimestamps-client
  ots upgrade "${initialProofName}"   # wait 1-6 hours for Bitcoin anchoring first
  ots verify  "${initialProofName}"
  # then keep it as ${otsProofName}

Or verify online:
  https://opentimestamps.org

How this proof works (4 stages):
1. SHA-256 hash created locally - a SHA-256 fingerprint of your file was
   computed on your device. The original file was never uploaded.
2. Hash submitted to OpenTimestamps - only the hash was sent. In return you got
   this .ots file. Right now it is an INITIAL PROOF: it does not yet contain
   Bitcoin verification data.
3. Bitcoin anchoring (usually 1-6 hours) - OpenTimestamps commits your hash to
   the Bitcoin blockchain (it is written into a Bitcoin transaction).
4. OpenTimestamps proof - after anchoring, "ots upgrade" adds the Bitcoin
   verification data to the file, turning the initial proof into a full
   OpenTimestamps proof that anyone can verify against the Bitcoin blockchain,
   without trusting you, me, or OpenTimestamps.
`);

      const blob = await zip.generateAsync({ type: 'blob' });
      currentDownloadUrl = URL.createObjectURL(blob);
      downloadLink.href = currentDownloadUrl;
      downloadLink.download = folderName + '.zip';
      downloadLink.classList.remove('hidden');
      resetStampInput();

    } catch (err) {
      console.error(err);
      status.set('err', 'Error: ' + errorMessage(err), 'err');
    } finally {
      updateStampBtn();
      generateBtn.textContent = 'Create Proof';
    }
  });

  downloadLink.addEventListener('click', () => {
    setTimeout(() => {
      if (confirm('Start fresh with a new proof?')) resetAll();
    }, 400);
  });

  return { resetPanel };
}
