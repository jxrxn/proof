export type ProofDebugState = {
  lastVerifyHashMethod: 'worker' | 'streaming-fallback' | null;
  forceVerifyHashWorkerFailureCount: number;
  packageCapabilityOverride: {
    supported: boolean;
    mode: 'buffered' | 'unsupported';
    maxBytes: number;
    reason?: string;
  } | null;
};

export function areTestHooksEnabled(env: {
  DEV: boolean;
  MODE: string;
  VITE_PROOF_TEST_HOOKS?: string;
}): boolean {
  return env.DEV || env.MODE === 'test' || env.VITE_PROOF_TEST_HOOKS === '1';
}

export const TEST_HOOKS_ENABLED =
  import.meta.env.DEV ||
  import.meta.env.MODE === 'test' ||
  import.meta.env.VITE_PROOF_TEST_HOOKS === '1';

export function getProofDebugState(): ProofDebugState | undefined {
  if (!TEST_HOOKS_ENABLED || typeof window === 'undefined') {
    return undefined;
  }
  return window.__proofDebugState;
}
