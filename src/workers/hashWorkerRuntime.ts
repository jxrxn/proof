import { createSHA256 } from 'hash-wasm';

import { hashBlobChunks, isAbortError } from '../lib/hashShared';
import type { HashWorkerRequest, HashWorkerResponse } from '../lib/hashWorkerProtocol';
import { errorMessage } from '../lib/util';

export type HashWorkerPort = {
  onmessage: ((event: MessageEvent<HashWorkerRequest>) => void) | null;
  postMessage: (message: HashWorkerResponse) => void;
};

export function attachHashWorker(port: HashWorkerPort): void {
  let activeJobId: string | null = null;
  let abortRequested = false;

  port.onmessage = (event: MessageEvent<HashWorkerRequest>) => {
    const message = event.data;

    if (message.type === 'abort') {
      if (activeJobId === message.jobId) {
        abortRequested = true;
      }
      return;
    }

    if (activeJobId !== null) {
      port.postMessage({
        type: 'error',
        jobId: message.jobId,
        name: 'Error',
        message: 'Hash worker is already processing another file.',
      });
      return;
    }

    activeJobId = message.jobId;
    abortRequested = false;
    void runHashJob(message).finally(() => {
      activeJobId = null;
      abortRequested = false;
    });
  };

  async function runHashJob(message: Extract<HashWorkerRequest, { type: 'start' }>): Promise<void> {
    try {
      const hasher = await createSHA256();
      const hashHex = await hashBlobChunks(message.blob, hasher, {
        chunkSize: message.chunkSize,
        onProgress: progress => {
          port.postMessage({
            type: 'progress',
            jobId: message.jobId,
            progress,
          });
        },
        isAborted: () => abortRequested,
      });

      port.postMessage({
        type: 'done',
        jobId: message.jobId,
        hashHex,
      });
    } catch (error) {
      if (isAbortError(error) || abortRequested) {
        port.postMessage({
          type: 'aborted',
          jobId: message.jobId,
          name: 'AbortError',
          message: 'The operation was aborted.',
        });
        return;
      }

      port.postMessage({
        type: 'error',
        jobId: message.jobId,
        name: error instanceof Error ? error.name : 'Error',
        message: errorMessage(error),
      });
    }
  }
}
