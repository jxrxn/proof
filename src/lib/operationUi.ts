import { byId } from './dom';

export type OperationState =
  | 'idle'
  | 'hashing'
  | 'stamping'
  | 'verifying'
  | 'packaging'
  | 'cancelled'
  | 'error'
  | 'done';

export type OperationUiUpdate = {
  state: OperationState;
  message?: string;
  progress?: number | null;
  cancelVisible?: boolean;
  cancelEnabled?: boolean;
};

export type OperationUiController = {
  set(update: OperationUiUpdate): void;
  reset(): void;
  getState(): OperationState;
};

function clampProgress(progress: number | null | undefined): number | null {
  if (progress === null || progress === undefined) return null;
  if (!Number.isFinite(progress)) return null;
  return Math.max(0, Math.min(1, progress));
}

export function createOperationUi(prefix: string): OperationUiController {
  const root = byId(`${prefix}-operation`);
  const text = byId(`${prefix}-operation-text`);
  const bar = byId(`${prefix}-operation-progress`, HTMLProgressElement);
  const cancel = byId(`${prefix}-operation-cancel`, HTMLButtonElement);
  let state: OperationState = 'idle';

  function set(update: OperationUiUpdate): void {
    state = update.state;
    const progress = clampProgress(update.progress);
    const show = update.state !== 'idle';
    root.classList.toggle('hidden', !show);
    root.dataset.state = update.state;

    text.textContent = update.message ?? '';

    if (progress === null) {
      bar.removeAttribute('value');
      bar.classList.add('hidden');
    } else {
      bar.value = progress;
      bar.classList.remove('hidden');
    }

    const cancelVisible = update.cancelVisible === true;
    cancel.classList.toggle('hidden', !cancelVisible);
    cancel.disabled = update.cancelEnabled !== true;
    cancel.setAttribute('aria-disabled', String(cancel.disabled));
  }

  function reset(): void {
    set({
      state: 'idle',
      message: '',
      progress: null,
      cancelVisible: false,
      cancelEnabled: false,
    });
  }

  cancel.type = 'button';
  cancel.addEventListener('click', event => {
    if (cancel.disabled) {
      event.preventDefault();
    }
  });
  reset();

  return {
    set,
    reset,
    getState() {
      return state;
    },
  };
}
