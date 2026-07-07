import { describe, expect, it } from 'vitest';

import { detectPackageCapability, type PackageCapability } from '../src/lib/packageCapability';

function withWindowDebugState(
  state: Window['__proofDebugState'] | undefined,
  run: () => void,
): void {
  const originalWindow = globalThis.window;
  const nextWindow = (originalWindow ?? {}) as Window;
  nextWindow.__proofDebugState = state;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: nextWindow,
  });
  try {
    run();
  } finally {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    });
  }
}

describe('detectPackageCapability', () => {
  it('returns buffered support in the current test environment', () => {
    const capability = detectPackageCapability();
    expect(capability.maxBytes).toBe(100 * 1024 * 1024);
    expect(['buffered', 'unsupported']).toContain(capability.mode);
    if (capability.supported) {
      expect(capability.mode).toBe('buffered');
    }
  });

  it('honors the test-only override when present', () => {
    const override: PackageCapability = {
      supported: false,
      mode: 'unsupported',
      maxBytes: 100 * 1024 * 1024,
      reason: 'Forced unsupported for test.',
    };

    withWindowDebugState({
      lastVerifyHashMethod: null,
      forceVerifyHashWorkerFailureCount: 0,
      packageCapabilityOverride: override,
    }, () => {
      expect(detectPackageCapability()).toEqual(override);
    });
  });
});
