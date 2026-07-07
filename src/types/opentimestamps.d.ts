// Minimal typning av de delar av den vendrade opentimestamps-bundlen (v0.4.9)
// som appen använder. Bundlen är en UMD-fil som sätter window.OpenTimestamps.

interface OtsOp {}

interface OtsTimestamp {
  msg: Uint8Array;
}

interface OtsDetachedTimestampFile {
  timestamp: OtsTimestamp;
  serializeToBytes(): Uint8Array;
}

interface OtsVerifyAttestation {
  timestamp?: number;
  height?: number;
}

type OtsVerifyResult =
  | Record<string, OtsVerifyAttestation>
  | Map<string, OtsVerifyAttestation>
  | undefined;

interface OpenTimestampsApi {
  DetachedTimestampFile: {
    fromBytes(op: OtsOp, bytes: Uint8Array): OtsDetachedTimestampFile;
    fromHash(op: OtsOp, hash: Uint8Array): OtsDetachedTimestampFile;
    deserialize(bytes: Uint8Array): OtsDetachedTimestampFile;
  };
  Ops: {
    OpSHA256: new () => OtsOp;
  };
  stamp(
    detached: OtsDetachedTimestampFile,
    options?: { calendars?: string[]; m?: number },
  ): Promise<void>;
  upgrade(detached: OtsDetachedTimestampFile): Promise<boolean>;
  verify(
    proof: OtsDetachedTimestampFile,
    file: OtsDetachedTimestampFile,
  ): Promise<OtsVerifyResult>;
}

interface Window {
  OpenTimestamps?: OpenTimestampsApi;
  __proofDebugState?: {
    lastVerifyHashMethod: 'worker' | 'streaming-fallback' | null;
    forceVerifyHashWorkerFailureCount: number;
    packageCapabilityOverride: {
      supported: boolean;
      mode: 'buffered' | 'unsupported';
      maxBytes: number;
      reason?: string;
    } | null;
  };
  __proofTest?: {
    getDebugState: () => {
      lastVerifyHashMethod: 'worker' | 'streaming-fallback' | null;
      forceVerifyHashWorkerFailureCount: number;
      packageCapabilityOverride: {
        supported: boolean;
        mode: 'buffered' | 'unsupported';
        maxBytes: number;
        reason?: string;
      } | null;
    };
    setPackageCapabilityOverride: (override: {
      supported: boolean;
      mode: 'buffered' | 'unsupported';
      maxBytes: number;
      reason?: string;
    } | null) => void;
    showOperationDemo: (
      target: 'stamp' | 'verify',
      state: 'idle' | 'hashing' | 'stamping' | 'verifying' | 'packaging' | 'cancelled' | 'error' | 'done',
      progress?: number,
      cancelVisible?: boolean,
      cancelEnabled?: boolean,
    ) => void;
    resetOperationDemo: (target: 'stamp' | 'verify') => void;
    hashBlobInWorker: (blob: Blob, options?: {
      chunkSize?: number;
      onProgress?: (progress: { bytesRead: number; totalBytes: number; fraction: number }) => void;
      signal?: AbortSignal;
    }) => Promise<string>;
  };
}
