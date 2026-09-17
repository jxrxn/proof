import { describe, expect, it } from 'vitest';

import { areTestHooksEnabled } from '../src/lib/testHooks';
import { hasExactTextInput, withTimeout } from '../src/lib/util';

describe('hasExactTextInput', () => {
  it('treats whitespace as meaningful input', () => {
    expect(hasExactTextInput(' ')).toBe(true);
    expect(hasExactTextInput('\n')).toBe(true);
    expect(hasExactTextInput('  \n\t')).toBe(true);
  });

  it('rejects only truly empty text', () => {
    expect(hasExactTextInput('')).toBe(false);
  });
});

describe('withTimeout', () => {
  it('rejects promptly when the abort signal fires', async () => {
    const controller = new AbortController();
    const never = new Promise<void>(() => {});

    const pending = withTimeout(never, 10_000, 'timed out', controller.signal);
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});

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
