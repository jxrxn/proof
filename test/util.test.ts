import { describe, expect, it } from 'vitest';

import { areTestHooksEnabled } from '../src/lib/testHooks';

describe('areTestHooksEnabled', () => {
  it('stays disabled for normal production builds', () => {
    expect(areTestHooksEnabled({
      DEV: false,
      MODE: 'production',
      VITE_PROOF_TEST_HOOKS: undefined,
    })).toBe(false);
  });

  it('enables test hooks only for explicit test contexts', () => {
    expect(areTestHooksEnabled({
      DEV: true,
      MODE: 'development',
      VITE_PROOF_TEST_HOOKS: undefined,
    })).toBe(true);
    expect(areTestHooksEnabled({
      DEV: false,
      MODE: 'test',
      VITE_PROOF_TEST_HOOKS: undefined,
    })).toBe(true);
    expect(areTestHooksEnabled({
      DEV: false,
      MODE: 'production',
      VITE_PROOF_TEST_HOOKS: '1',
    })).toBe(true);
  });
});
