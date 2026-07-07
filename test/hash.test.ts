import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { hashBlobStreaming, type HashProgress } from '../src/lib/hash';

function makeFilledChunk(size: number, seed: number): Uint8Array {
  const chunk = new Uint8Array(size);
  for (let i = 0; i < chunk.length; i++) {
    chunk[i] = (seed + i) % 251;
  }
  return chunk;
}

describe('hashBlobStreaming', () => {
  it('matches a known SHA-256 for a small blob', async () => {
    const blob = new Blob(['abc']);
    const hashHex = await hashBlobStreaming(blob);
    expect(hashHex).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('hashes a large artificial blob incrementally', async () => {
    const chunks: Uint8Array[] = [];
    const reference = createHash('sha256');
    for (let i = 0; i < 12; i++) {
      const chunk = makeFilledChunk(1024 * 1024, i * 17);
      chunks.push(chunk);
      reference.update(chunk);
    }

    const blob = new Blob(chunks);
    const hashHex = await hashBlobStreaming(blob, { chunkSize: 1024 * 1024 });

    expect(hashHex).toBe(reference.digest('hex'));
  });

  it('reports monotonic progress and completes at 100%', async () => {
    const progressEvents: HashProgress[] = [];
    const blob = new Blob([
      new Uint8Array([0, 1, 2, 3]),
      new Uint8Array([4, 5, 6, 7]),
      new Uint8Array([8, 9]),
    ]);

    await hashBlobStreaming(blob, {
      chunkSize: 3,
      onProgress: progress => progressEvents.push(progress),
    });

    expect(progressEvents.length).toBeGreaterThan(0);
    expect(progressEvents.at(-1)).toEqual({
      bytesRead: blob.size,
      totalBytes: blob.size,
      fraction: 1,
    });

    for (let i = 1; i < progressEvents.length; i++) {
      expect(progressEvents[i]!.bytesRead).toBeGreaterThan(progressEvents[i - 1]!.bytesRead);
      expect(progressEvents[i]!.fraction).toBeGreaterThan(progressEvents[i - 1]!.fraction);
    }
  });

  it('aborts during hashing', async () => {
    const controller = new AbortController();
    const blob = new Blob([
      makeFilledChunk(4096, 1),
      makeFilledChunk(4096, 2),
      makeFilledChunk(4096, 3),
      makeFilledChunk(4096, 4),
    ]);

    await expect(hashBlobStreaming(blob, {
      signal: controller.signal,
      chunkSize: 4096,
      onProgress: () => controller.abort(),
    })).rejects.toMatchObject({ name: 'AbortError' });
  });
});
