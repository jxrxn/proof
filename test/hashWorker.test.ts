import { describe, expect, it } from 'vitest';

import { hashBlobStreaming } from '../src/lib/hash';
import { hashBlobInWorker, type WorkerLike } from '../src/lib/hashWorkerClient';
import type { HashWorkerRequest, HashWorkerResponse } from '../src/lib/hashWorkerProtocol';
import { attachHashWorker } from '../src/workers/hashWorkerRuntime';

function makeFilledChunk(size: number, seed: number): Uint8Array {
  const chunk = new Uint8Array(size);
  for (let i = 0; i < chunk.length; i++) {
    chunk[i] = (seed + i) % 251;
  }
  return chunk;
}

class FakeHashWorker implements WorkerLike {
  onmessage: ((event: MessageEvent<HashWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  private readonly port = { onmessage: null as ((event: MessageEvent<HashWorkerRequest>) => void) | null, postMessage: (message: HashWorkerResponse) => {
    queueMicrotask(() => {
      this.onmessage?.({ data: message } as MessageEvent<HashWorkerResponse>);
    });
  } };
  private terminated = false;

  constructor() {
    attachHashWorker(this.port);
  }

  postMessage(message: HashWorkerRequest): void {
    if (this.terminated) {
      throw new Error('Worker already terminated.');
    }
    queueMicrotask(() => {
      this.port.onmessage?.({ data: message } as MessageEvent<HashWorkerRequest>);
    });
  }

  terminate(): void {
    this.terminated = true;
    this.onmessage = null;
    this.onerror = null;
  }
}

describe('hashBlobInWorker', () => {
  it('matches a known SHA-256 for a small blob', async () => {
    const hashHex = await hashBlobInWorker(new Blob(['abc']), {
      createWorker: () => new FakeHashWorker(),
    });

    expect(hashHex).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('matches hashBlobStreaming for a large artificial blob', async () => {
    const blob = new Blob([
      makeFilledChunk(1024 * 1024, 11),
      makeFilledChunk(1024 * 1024, 29),
      makeFilledChunk(1024 * 1024, 47),
      makeFilledChunk(1024 * 1024, 71),
    ]);

    const [workerHash, directHash] = await Promise.all([
      hashBlobInWorker(blob, {
        chunkSize: 1024 * 1024,
        createWorker: () => new FakeHashWorker(),
      }),
      hashBlobStreaming(blob, { chunkSize: 1024 * 1024 }),
    ]);

    expect(workerHash).toBe(directHash);
  });

  it('reports monotonic progress and completes at 100%', async () => {
    const blob = new Blob([
      new Uint8Array([0, 1, 2, 3]),
      new Uint8Array([4, 5, 6, 7]),
      new Uint8Array([8, 9]),
    ]);
    const fractions: number[] = [];

    await hashBlobInWorker(blob, {
      chunkSize: 3,
      createWorker: () => new FakeHashWorker(),
      onProgress: progress => fractions.push(progress.fraction),
    });

    expect(fractions.length).toBeGreaterThan(0);
    expect(fractions.at(-1)).toBe(1);
    for (let i = 1; i < fractions.length; i++) {
      expect(fractions[i]!).toBeGreaterThan(fractions[i - 1]!);
    }
  });

  it('aborts with a controlled AbortError', async () => {
    const controller = new AbortController();
    const blob = new Blob([
      makeFilledChunk(4096, 1),
      makeFilledChunk(4096, 2),
      makeFilledChunk(4096, 3),
      makeFilledChunk(4096, 4),
    ]);

    await expect(hashBlobInWorker(blob, {
      signal: controller.signal,
      chunkSize: 4096,
      createWorker: () => new FakeHashWorker(),
      onProgress: () => controller.abort(),
    })).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('supports multiple sequential hash runs without state collisions', async () => {
    const createWorker = () => new FakeHashWorker();

    const first = await hashBlobInWorker(new Blob(['first']), { createWorker });
    const second = await hashBlobInWorker(new Blob(['second']), { createWorker });

    expect(first).not.toBe(second);
    expect(first).toBe(await hashBlobStreaming(new Blob(['first'])));
    expect(second).toBe(await hashBlobStreaming(new Blob(['second'])));
  });
});
