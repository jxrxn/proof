import type { IHasher } from 'hash-wasm';

export type HashProgress = {
  bytesRead: number;
  totalBytes: number;
  fraction: number;
};

export type HashBlobOptions = {
  signal?: AbortSignal;
  onProgress?: (progress: HashProgress) => void;
  chunkSize?: number;
};

export type HashChunkOptions = {
  chunkSize?: number;
  onProgress?: (progress: HashProgress) => void;
  isAborted?: () => boolean;
};

export type HashStreamHasher = Pick<IHasher, 'update' | 'digest' | 'init'>;

const DEFAULT_CHUNK_BYTES = 1024 * 1024;

export function createAbortError(): Error {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('The operation was aborted.', 'AbortError');
  }
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function normalizeChunkSize(chunkSize?: number): number {
  if (chunkSize === undefined) return DEFAULT_CHUNK_BYTES;
  if (!Number.isFinite(chunkSize) || chunkSize <= 0) {
    throw new Error('chunkSize must be a positive finite number.');
  }
  return Math.floor(chunkSize);
}

export function emitProgress(
  onProgress: HashChunkOptions['onProgress'],
  bytesRead: number,
  totalBytes: number,
): void {
  if (!onProgress) return;
  onProgress({
    bytesRead,
    totalBytes,
    fraction: totalBytes === 0 ? 1 : bytesRead / totalBytes,
  });
}

export function throwIfAborted(isAborted?: () => boolean): void {
  if (isAborted?.()) {
    throw createAbortError();
  }
}

// Checkpoint för flerstegsoperationer: anropas efter varje await så att en
// avbruten operation (via cancel eller ny input) aldrig skriver resultat.
export function throwIfSignalAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

export async function hashBlobChunks(
  blob: Blob,
  hasher: HashStreamHasher,
  options: HashChunkOptions = {},
): Promise<string> {
  const chunkSize = normalizeChunkSize(options.chunkSize);
  const totalBytes = blob.size;
  let bytesRead = 0;

  hasher.init();
  throwIfAborted(options.isAborted);

  for (let offset = 0; offset < totalBytes; offset += chunkSize) {
    throwIfAborted(options.isAborted);
    const nextOffset = Math.min(offset + chunkSize, totalBytes);
    const chunkBuffer = await blob.slice(offset, nextOffset).arrayBuffer();
    throwIfAborted(options.isAborted);
    hasher.update(new Uint8Array(chunkBuffer));
    bytesRead = nextOffset;
    emitProgress(options.onProgress, bytesRead, totalBytes);
  }

  throwIfAborted(options.isAborted);
  if (totalBytes === 0) {
    emitProgress(options.onProgress, 0, 0);
  }

  return hasher.digest();
}
