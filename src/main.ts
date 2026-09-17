import './style.css';
// ?raw i stället för asset-import: logotypen bakas in i bundlen, så headern
// renderas även när index.html öppnas ensam. Filen ligger med övriga
// varumärkestillgångar i src/icons/ och inte i markupen, eftersom de är
// undantagna från GPL medan index.html inte är det.
import brandMark from './icons/proof_logo.svg?raw';
import { hashBlobInWorker } from './lib/hashWorkerClient';
import type { PackageCapability } from './lib/packageCapability';
import { TEST_HOOKS_ENABLED } from './lib/testHooks';
import { createOperationUi, type OperationState } from './lib/operationUi';
import { initStamp } from './stamp';
import { initVerify, type VerifyPanel } from './verify';

// Medvetet getElementById i stället för byId: byId kastar när elementet
// saknas. Logotypen är en varumärkestillgång som inte krävs för att programmet
// ska fungera, så den som tar bort markupen ska få en app utan logotyp — inte
// en app som kraschar vid start.
// innerHTML är säkert här till skillnad från statusrader: innehållet är vår
// egen statiska SVG från bygget, aldrig data från en fil eller ett API.
const brandMarkEl = document.getElementById('brand-mark');
if (brandMarkEl) {
  brandMarkEl.innerHTML = brandMark;
}

// Ny input på ena sidan nollställer den andra, så att kortens innehåll aldrig
// visar resultat som hör till en tidigare fil/text.
let verifyPanel: VerifyPanel | undefined;
const stampPanel = initStamp({ onInputActivity: () => verifyPanel?.resetPanel() });
verifyPanel = initVerify({ onInputActivity: () => stampPanel.resetPanel() });

// Minimal test-hook for e2e so the real browser-bundled worker path can be
// exercised without wiring it into the visible UI yet.
if (TEST_HOOKS_ENABLED) {
  const stampOperationUi = createOperationUi('stamp');
  const verifyOperationUi = createOperationUi('verify');
  const debugState = {
    lastVerifyHashMethod: null as 'worker' | 'streaming-fallback' | null,
    forceVerifyHashWorkerFailureCount: 0,
    packageCapabilityOverride: null as PackageCapability | null,
  };

  window.__proofTest = {
    getDebugState() {
      return { ...debugState };
    },
    setPackageCapabilityOverride(override: PackageCapability | null) {
      debugState.packageCapabilityOverride = override;
      stampPanel.refreshPackageCapability();
      verifyPanel?.refreshPackageCapability();
    },
    hashBlobInWorker,
    showOperationDemo(
      target: 'stamp' | 'verify',
      state: OperationState,
      progress = 0.5,
      cancelVisible = true,
      cancelEnabled = true,
    ) {
      const ui = target === 'verify' ? verifyOperationUi : stampOperationUi;
      ui.set({
        state,
        message: `${state}... ${Math.round(progress * 100)}%`,
        progress,
        cancelVisible,
        cancelEnabled,
      });
    },
    resetOperationDemo(target: 'stamp' | 'verify') {
      const ui = target === 'verify' ? verifyOperationUi : stampOperationUi;
      ui.reset();
    },
  };
  (window as Window & { __proofDebugState?: typeof debugState }).__proofDebugState = debugState;
}
