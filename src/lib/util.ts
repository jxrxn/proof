import { createAbortError } from './hashShared';

export async function sha256Hex(data: BufferSource): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// Allt hashas och paketeras i minnet (File.arrayBuffer + JSZip), utan streamad
// hashing — mycket stora filer kan därför krascha fliken. Gränsen är medvetet
// konservativ och gäller både skapa- och verifiera-flödet, inklusive
// uppackade entries inuti ett proof package (skydd mot zip-bomber).
export const MAX_FILE_BYTES = 100 * 1024 * 1024;

// Ett giltigt .ots-bevis är typiskt några kB; 10 MB är en generös övre gräns.
export const MAX_OTS_BYTES = 10 * 1024 * 1024;

export function hasExactTextInput(value: string): boolean {
  return value.length > 0;
}

export function fileTooLargeMessage(f: File): string {
  const limitMb = Math.round(MAX_FILE_BYTES / 1048576);
  return `"${f.name}" is ${formatBytes(f.size)}. Files over ${limitMb} MB ` +
    `are not supported: everything is hashed and packaged in memory, so ` +
    `very large files can crash the tab.`;
}

export function formatBytes(n: number): string {
  if (n < 1024)    return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1048576).toFixed(2) + ' MB';
}

export function formatTimestamp(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
  signal?: AbortSignal,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
    if (!signal) return;
    if (signal.aborted) {
      reject(createAbortError());
      return;
    }
    onAbort = () => reject(createAbortError());
    signal.addEventListener('abort', onAbort, { once: true });
  });
  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer);
    if (signal && onAbort) {
      signal.removeEventListener('abort', onAbort);
    }
  });
}
