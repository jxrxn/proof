import { createSHA256 } from 'hash-wasm';
import {
  hashBlobChunks,
  type HashBlobOptions,
  type HashProgress,
} from './hashShared';

export type { HashBlobOptions, HashProgress } from './hashShared';

// hash-wasm embeds its WASM modules as base64 strings and documents support for
// Web Workers. That makes it a good fit for the later worker step, while
// keeping this PR limited to a streaming Blob/File wrapper.
export async function hashBlobStreaming(
  blob: Blob,
  options: HashBlobOptions = {},
): Promise<string> {
  const { signal, onProgress } = options;
  const hasher = await createSHA256();
  return hashBlobChunks(blob, hasher, {
    chunkSize: options.chunkSize,
    onProgress,
    isAborted: () => signal?.aborted === true,
  });
}
