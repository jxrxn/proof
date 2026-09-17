import { MAX_FILE_BYTES } from './util';
import { getProofDebugState } from './testHooks';

export type PackageCapability = {
  supported: boolean;
  mode: 'buffered' | 'unsupported';
  maxBytes: number;
  reason?: string;
};

type PackageCapabilityOverride = PackageCapability | null | undefined;

function packageUnsupported(reason: string): PackageCapability {
  return {
    supported: false,
    mode: 'unsupported',
    maxBytes: MAX_FILE_BYTES,
    reason,
  };
}

function packageSupported(): PackageCapability {
  return {
    supported: true,
    mode: 'buffered',
    maxBytes: MAX_FILE_BYTES,
  };
}

function getCapabilityOverride(): PackageCapabilityOverride {
  return getProofDebugState()?.packageCapabilityOverride;
}

export function detectPackageCapability(): PackageCapability {
  const override = typeof window !== 'undefined' ? getCapabilityOverride() : undefined;
  if (override) {
    return override;
  }

  if (typeof Blob === 'undefined') {
    return packageUnsupported('Proof packages are unavailable because this browser cannot create Blob downloads.');
  }
  if (typeof URL === 'undefined' ||
      typeof URL.createObjectURL !== 'function' ||
      typeof URL.revokeObjectURL !== 'function') {
    return packageUnsupported('Proof packages are unavailable because this browser cannot create local download URLs.');
  }
  if (typeof HTMLAnchorElement === 'undefined' || !('download' in HTMLAnchorElement.prototype)) {
    return packageUnsupported('Proof packages are unavailable because this browser does not support file downloads from the app.');
  }
  if (typeof Blob.prototype.arrayBuffer !== 'function') {
    return packageUnsupported('Proof packages are unavailable because this browser cannot read package data safely.');
  }

  return packageSupported();
}
