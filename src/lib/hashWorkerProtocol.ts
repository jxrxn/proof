import type { HashProgress } from './hashShared';

export type HashWorkerStartMessage = {
  type: 'start';
  jobId: string;
  blob: Blob;
  chunkSize?: number;
};

export type HashWorkerAbortMessage = {
  type: 'abort';
  jobId: string;
};

export type HashWorkerRequest = HashWorkerStartMessage | HashWorkerAbortMessage;

export type HashWorkerProgressMessage = {
  type: 'progress';
  jobId: string;
  progress: HashProgress;
};

export type HashWorkerDoneMessage = {
  type: 'done';
  jobId: string;
  hashHex: string;
};

export type HashWorkerAbortedMessage = {
  type: 'aborted';
  jobId: string;
  name: 'AbortError';
  message: string;
};

export type HashWorkerErrorMessage = {
  type: 'error';
  jobId: string;
  name: string;
  message: string;
};

export type HashWorkerResponse =
  | HashWorkerProgressMessage
  | HashWorkerDoneMessage
  | HashWorkerAbortedMessage
  | HashWorkerErrorMessage;
