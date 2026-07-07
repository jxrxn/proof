import { attachHashWorker, type HashWorkerPort } from './hashWorkerRuntime';

attachHashWorker(globalThis as unknown as HashWorkerPort);

export {};
