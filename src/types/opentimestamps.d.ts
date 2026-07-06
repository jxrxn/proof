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
}
