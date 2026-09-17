import { byId, createStatusList, wireDrop } from './lib/dom';
import { createOperationUi } from './lib/operationUi';
import { hashBlobStreaming } from './lib/hash';
import { hashBlobInWorker } from './lib/hashWorkerClient';
import { detectPackageCapability } from './lib/packageCapability';
import { buildProofZip } from './lib/proofPackage';
import {
  sha256Hex, formatBytes, formatTimestamp, errorMessage, hasExactTextInput, withTimeout,
} from './lib/util';
import { getOts, reachableCalendars, detachedFromHashHex } from './lib/ots';
import { throwIfSignalAborted } from './lib/hashShared';

export interface StampPanel {
  /** Nollställer hela skapa-sidan (input, statusar, resultatkort, nedladdningslänk). */
  resetPanel(): void;
  refreshPackageCapability(): void;
}

export function initStamp(opts: { onInputActivity: () => void }): StampPanel {
  let mode: 'file' | 'text' = 'file';
  let selectedFile: File | null = null;
  let currentProofUrl: string | null = null;
  let currentPackageUrl: string | null = null;
  let currentHashAbort: AbortController | null = null;
  // Vi kan bara veta att en nedladdning INITIERADES, inte att filen faktiskt
  // sparades någonstans. Flaggan används därför bara för att avgöra om vi ska
  // varna innan resultatet kastas - aldrig för att påstå att beviset är sparat.
  let proofDownloadStarted = false;

  const tabs            = document.querySelectorAll<HTMLButtonElement>('.tab');
  const filePanel       = byId('file-panel');
  const textPanel       = byId('text-panel');
  const fileInput       = byId('file-input', HTMLInputElement);
  const fileNameEl      = byId('file-name');
  const drop            = byId('drop');
  const textInput       = byId('text-input', HTMLTextAreaElement);
  const generateBtn     = byId('generate', HTMLButtonElement);
  const proofLink       = byId('proof-link', HTMLAnchorElement);
  const downloadLink    = byId('download-link', HTMLAnchorElement);
  const downloadWarning = byId('download-warning');
  const packageNote     = byId('package-note');
  const packageCapabilityCopy = byId('package-capability-copy');
  const packageSection  = byId('package-section');
  const dropPrompt      = byId('drop-prompt');
  const resultContent   = byId('result-content');
  const resultEmpty     = byId('result-empty');
  const cancelBtn       = byId('stamp-operation-cancel', HTMLButtonElement);
  const newProofBtn     = byId('new-proof', HTMLButtonElement);
  const newProofConfirm = byId('new-proof-confirm');
  const keepProofBtn    = byId('keep-proof', HTMLButtonElement);
  const discardProofBtn = byId('discard-proof', HTMLButtonElement);

  const status = createStatusList(byId('status-list'), 's-');
  const operationUi = createOperationUi('stamp');
  let packageCapability = detectPackageCapability();

  function showResultContent() { resultContent.classList.remove('hidden'); resultEmpty.classList.add('hidden'); }
  function hideResultContent() { resultContent.classList.add('hidden');    resultEmpty.classList.remove('hidden'); }

  function applyPackageCapabilityCopy(): void {
    if (packageCapability.supported) {
      packageCapabilityCopy.textContent =
        'Optional: save a proof package (.zip) containing both the original file and its proof. ' +
        `Proof packages are limited to ${Math.round(packageCapability.maxBytes / 1048576)} MB in this browser; ` +
        'saving the .ots proof itself supports larger files.';
      return;
    }

    packageCapabilityCopy.textContent =
      packageCapability.reason ??
      'Proof packages are unavailable in this browser/app mode. Save the .ots proof file instead.';
  }

  function refreshPackageCapability(): void {
    packageCapability = detectPackageCapability();
    applyPackageCapabilityCopy();
  }

  function updateStampBtn() {
    generateBtn.disabled = mode === 'file' ? selectedFile === null : !hasExactTextInput(textInput.value);
  }

  function clearDownload() {
    proofLink.classList.add('hidden');
    packageSection.classList.add('hidden');
    packageNote.classList.add('hidden');
    if (currentProofUrl) {
      URL.revokeObjectURL(currentProofUrl);
      currentProofUrl = null;
    }
    if (currentPackageUrl) {
      URL.revokeObjectURL(currentPackageUrl);
      currentPackageUrl = null;
    }
  }

  function clearResultMeta() {
    for (const id of ['result-name', 'result-time', 'result-size', 'result-hash']) {
      byId(id).textContent = '';
    }
  }

  function resetStampInput() {
    selectedFile = null;
    fileNameEl.textContent = 'No file selected';
    dropPrompt.classList.remove('hidden');
    drop.classList.remove('has-file');
    textInput.value = '';
    fileInput.value = '';
    updateStampBtn();
  }

  function resetPanel() {
    resetStampInput();
    clearDownload();
    hideResultContent();
    clearResultMeta();
    status.clear();
    operationUi.reset();
  }

  function resetAll() {
    resetPanel();
    // Hör till det föregående beviset och får inte överleva en reset.
    proofDownloadStarted = false;
    newProofConfirm.classList.add('hidden');
    // Den expanderade förklaringen ska inte ligga kvar öppen för nästa bevis.
    resultContent.querySelector('details')?.removeAttribute('open');
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
    // Ny input avbryter en pågående operation så att den aldrig hinner
    // skriva resultat som ser ut att höra till den nya inmatningen.
    currentHashAbort?.abort();
    opts.onInputActivity();
    updateStampBtn();
  });

  function setNewFile(f: File | null) {
    currentHashAbort?.abort();
    selectedFile = f;
    fileNameEl.textContent = f ? f.name : 'No file selected';
    dropPrompt.classList.toggle('hidden', f !== null);
    drop.classList.toggle('has-file', f !== null);
    clearDownload();
    if (f) opts.onInputActivity();
    updateStampBtn();
  }

  wireDrop(drop, fileInput, f => {
    setNewFile(f);
  });

  refreshPackageCapability();

  cancelBtn.addEventListener('click', () => {
    currentHashAbort?.abort();
  });

  async function hashForStamp(
    source: Blob,
    signal: AbortSignal,
    onProgress: (fraction: number) => void,
  ): Promise<string> {
    const options = {
      signal,
      onProgress: (progress: { fraction: number }) => onProgress(progress.fraction),
    };
    try {
      return await hashBlobInWorker(source, options);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw error;
      }
      return hashBlobStreaming(source, options);
    }
  }

  generateBtn.addEventListener('click', async () => {
    generateBtn.disabled = true;
    generateBtn.textContent = 'Working…';
    status.clear();
    clearDownload();
    hideResultContent();
    clearResultMeta();
    operationUi.reset();
    // En controller för HELA operationen (hash → stamp → paket), inte bara
    // hashningen: ny input eller cancel avbryter vid nästa checkpoint.
    // Nytt bevis: föregående nedladdningsstatus gäller inte längre.
    proofDownloadStarted = false;
    newProofConfirm.classList.add('hidden');
    currentHashAbort = new AbortController();
    const opSignal = currentHashAbort.signal;

    try {
      let hashHex: string, size: number, originalName: string, mimeContent: Blob;
      const now = new Date();
      const iso = now.toISOString();
      const stamp = iso.replace(/[:.]/g, '-').slice(0, 19);

      if (mode === 'file') {
        if (!selectedFile) { alert('Please select a file first.'); return; }
        originalName = selectedFile.name;
        mimeContent = selectedFile;
        size = selectedFile.size;
        operationUi.set({
          state: 'hashing',
          message: 'Hashing file locally… 0%',
          progress: 0,
          cancelVisible: true,
          cancelEnabled: true,
        });
        status.set('hash', 'Hashing file locally…', 'info');
        hashHex = await hashForStamp(selectedFile, opSignal, fraction => {
          operationUi.set({
            state: 'hashing',
            message: `Hashing file locally… ${Math.round(fraction * 100)}%`,
            progress: fraction,
            cancelVisible: true,
            cancelEnabled: true,
          });
        });
      } else {
        const text = textInput.value;
        if (!hasExactTextInput(text)) { alert('Please enter some text first.'); return; }
        originalName = 'text.txt';
        mimeContent = new Blob([text], { type: 'text/plain' });
        const data = new TextEncoder().encode(text);
        size = data.byteLength;
        hashHex = await sha256Hex(data);
      }
      throwIfSignalAborted(opSignal);

      byId('result-name').textContent = 'File: ' + originalName;
      byId('result-time').textContent = 'Created: ' + formatTimestamp(now);
      byId('result-size').textContent = 'Size: ' + formatBytes(size);
      byId('result-hash').textContent = hashHex;
      showResultContent();
      status.set('hash', 'SHA-256 hash created locally. Your original file was not uploaded.', 'ok');
      operationUi.set({
        state: 'stamping',
        message: 'Sending SHA-256 digest to OpenTimestamps…',
        progress: null,
        cancelVisible: false,
        cancelEnabled: false,
      });

      const OTS = getOts();

      status.set('ots', 'Sending SHA-256 digest to OpenTimestamps…', 'info');
      // detachedFromHashHex tar bara digesten – filinnehållet lämnar aldrig appen.
      const detached = detachedFromHashHex(hashHex);
      const calendars = await reachableCalendars();
      throwIfSignalAborted(opSignal);
      await withTimeout(
        OTS.stamp(detached, { calendars }),
        30000,
        'OpenTimestamps calendar servers did not respond. Please try again in a little while.',
        opSignal,
      );
      throwIfSignalAborted(opSignal);
      const otsBytes = detached.serializeToBytes();
      status.set('ots', 'Hash submitted to OpenTimestamps. You now have an initial proof (.ots) – Bitcoin anchoring completes later.', 'ok');

      // Enhetlig namngivning: samma tidsstämpel i ZIP-paketet, i det initiala
      // beviset och (senare) i OpenTimestamps-beviset, så användaren direkt ser
      // att de hör till samma tidsstämpling.
      const folderName       = 'proof_' + stamp;
      const initialProofName = folderName + '_initial.ots';
      const readme = `SHA-256 hash + OpenTimestamps
================================
Filename:   ${originalName}
Size:       ${size} bytes
Created:    ${iso}
Algorithm:  SHA-256
Status:     Initial proof – NOT yet anchored to Bitcoin.
            This .ots file does not yet contain Bitcoin verification data.
            Once the commitment containing your hash has been anchored to
            Bitcoin, this initial proof can be completed into a full
            OpenTimestamps proof (see below).

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
  ots upgrade "${initialProofName}"   # run once Bitcoin anchoring has completed
  ots verify -f "${originalName}" "${initialProofName}"
  # then keep it as ${folderName}_opentimestamps.ots

Or verify online:
  https://opentimestamps.org

How this proof works (4 stages):
1. SHA-256 hash created locally - a SHA-256 fingerprint of your file was
   computed on your device. The original file was never uploaded.
2. Hash submitted to OpenTimestamps - only the hash was sent. In return you got
   this .ots file. Right now it is an INITIAL PROOF: it does not yet contain
   Bitcoin verification data.
3. Bitcoin anchoring - OpenTimestamps combines many submitted hashes into a
   shared cryptographic commitment, and that commitment is anchored to the
   Bitcoin blockchain. Your individual hash is not written to Bitcoin on its
   own. This .ots file contains the cryptographic path needed to prove that
   your hash was included in the commitment that was anchored.
4. OpenTimestamps proof - once the commitment has been anchored, "ots upgrade"
   completes this file with the Bitcoin verification data, turning the initial
   proof into a full OpenTimestamps proof. Anyone can then verify it against
   the Bitcoin blockchain without trusting you, me, or OpenTimestamps, using
   any compatible OpenTimestamps software. The app that created this package
   does not need to exist for the proof to be verifiable.
`;

      const proofBytes = new Uint8Array(otsBytes.length);
      proofBytes.set(otsBytes);
      currentProofUrl = URL.createObjectURL(new Blob([proofBytes.buffer], { type: 'application/octet-stream' }));
      proofLink.href = currentProofUrl;
      proofLink.download = initialProofName;
      proofLink.classList.remove('hidden');

      if (packageCapability.supported && size <= packageCapability.maxBytes) {
        operationUi.set({
          state: 'packaging',
          message: 'Creating proof package…',
          progress: null,
          cancelVisible: false,
          cancelEnabled: false,
        });
        const blob = await buildProofZip({
          folderName,
          originalName,
          original: mimeContent,
          hashHex,
          otsFileName: initialProofName,
          otsBytes,
          readme,
        });
        throwIfSignalAborted(opSignal);
        currentPackageUrl = URL.createObjectURL(blob);
        downloadLink.href = currentPackageUrl;
        downloadLink.download = folderName + '.zip';
        packageSection.classList.remove('hidden');
      } else if (!packageCapability.supported) {
        packageNote.textContent =
          packageCapability.reason ??
          'Proof packages are unavailable in this browser/app mode. Save the .ots proof file instead.';
        packageNote.classList.remove('hidden');
      } else {
        packageNote.textContent =
          `Proof packages include the original file and are currently limited to ${Math.round(packageCapability.maxBytes / 1048576)} MB. Save the .ots proof file instead.`;
        packageNote.classList.remove('hidden');
      }

      operationUi.set({
        state: 'done',
        message: 'Initial proof created. Save the .ots proof file.',
        progress: null,
        cancelVisible: false,
        cancelEnabled: false,
      });
      resetStampInput();

    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        clearDownload();
        hideResultContent();
        clearResultMeta();
        status.clear();
        status.set('hash', 'Operation cancelled.', 'warn');
        operationUi.set({
          state: 'cancelled',
          message: 'Operation cancelled.',
          progress: null,
          cancelVisible: false,
          cancelEnabled: false,
        });
      } else {
        clearDownload();
        console.error(err);
        status.set('err', 'Error: ' + errorMessage(err), 'err');
        operationUi.set({
          state: 'error',
          message: 'Error: ' + errorMessage(err),
          progress: null,
          cancelVisible: false,
          cancelEnabled: false,
        });
      }
    } finally {
      currentHashAbort = null;
      updateStampBtn();
      generateBtn.textContent = 'Create Proof';
    }
  });

  // Båda nedladdningarna räknas. Vi registrerar att användaren startade en
  // nedladdning - webbläsaren kan inte tala om för oss om filen faktiskt
  // hamnade någonstans, så flaggan styr bara om vi varnar vid reset.
  for (const link of [proofLink, downloadLink]) {
    link.addEventListener('click', () => { proofDownloadStarted = true; });
  }

  newProofBtn.addEventListener('click', () => {
    if (proofDownloadStarted) {
      resetAll();
      return;
    }
    newProofConfirm.classList.remove('hidden');
    keepProofBtn.focus();
  });

  keepProofBtn.addEventListener('click', () => {
    newProofConfirm.classList.add('hidden');
    newProofBtn.focus();
  });

  discardProofBtn.addEventListener('click', () => {
    resetAll();
  });

  return { resetPanel, refreshPackageCapability };
}
