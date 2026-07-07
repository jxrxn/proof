import {
  createAbortError,
  type HashBlobOptions,
  type HashProgress,
} from './hashShared';
import type { HashWorkerRequest, HashWorkerResponse } from './hashWorkerProtocol';
// ?worker&inline: Vite bundlar den typade workern (hash.worker.ts och hela
// dess modulgraf) och bäddar in den som base64 i huvudbundeln — produktionen
// kör därmed exakt samma kod som unit-testerna (attachHashWorker), singlefile-
// bygget förblir en enda dist/index.html, och file:// fungerar eftersom
// workern startas från en Blob-URL i stället för att hämtas över nätet.
import HashWorker from '../workers/hash.worker?worker&inline';

export type { HashBlobOptions, HashProgress } from './hashShared';

export type WorkerLike = {
  onmessage: ((event: MessageEvent<HashWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage: (message: HashWorkerRequest) => void;
  terminate: () => void;
};

export type HashWorkerClientOptions = HashBlobOptions & {
  createWorker?: () => WorkerLike;
};

let hashWorkerCounter = 0;

function nextJobId(): string {
  hashWorkerCounter += 1;
  return `hash-job-${hashWorkerCounter}`;
}

function defaultCreateWorker(): Worker {
  return new HashWorker();
}

function controlledError(name: string, message: string): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

export async function hashBlobInWorker(
  blob: Blob,
  options: HashWorkerClientOptions = {},
): Promise<string> {
  const { signal, onProgress } = options;
  if (signal?.aborted) {
    throw createAbortError();
  }

  const createWorker = options.createWorker ?? defaultCreateWorker;
  const worker = createWorker();
  const jobId = nextJobId();

  return new Promise<string>((resolve, reject) => {
    let settled = false;

    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
      fn();
    };

    const onAbort = (): void => {
      try {
        worker.postMessage({ type: 'abort', jobId });
      } catch {
        // Ignore best-effort abort delivery; worker is terminated immediately.
      }
      finish(() => reject(createAbortError()));
    };

    worker.onmessage = (event: MessageEvent<HashWorkerResponse>) => {
      const message = event.data;
      if (message.jobId !== jobId) return;

      if (message.type === 'progress') {
        onProgress?.(message.progress);
        return;
      }

      if (message.type === 'done') {
        finish(() => resolve(message.hashHex));
        return;
      }

      if (message.type === 'aborted') {
        finish(() => reject(controlledError(message.name, message.message)));
        return;
      }

      finish(() => reject(controlledError(message.name, message.message)));
    };

    worker.onerror = (event: ErrorEvent) => {
      const message = event.message || 'Hash worker failed.';
      finish(() => reject(controlledError('Error', message)));
    };

    signal?.addEventListener('abort', onAbort, { once: true });

    worker.postMessage({
      type: 'start',
      jobId,
      blob,
      chunkSize: options.chunkSize,
    });
  });
}
