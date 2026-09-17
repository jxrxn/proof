import JSZip from 'jszip';

// Gemensam paketering för både skapa- och verifiera-sidan: ett ZIP-paket med
// originalfil, .ots-bevis, .sha256-fil och README är appens utbytesformat –
// det är vad ZIP-fliken i verify-panelen förstår.
export interface ProofPackage {
  folderName: string;
  originalName: string;
  original: Blob | Uint8Array<ArrayBuffer>;
  hashHex: string;
  otsFileName: string;
  otsBytes: Uint8Array;
  readme: string;
}

export async function buildProofZip(pkg: ProofPackage): Promise<Blob> {
  const zip = new JSZip();
  const folder = zip.folder(pkg.folderName)!;
  folder.file(pkg.originalName, pkg.original);
  folder.file(pkg.otsFileName, pkg.otsBytes);
  folder.file(pkg.originalName + '.sha256', pkg.hashHex + '  ' + pkg.originalName + '\n');
  folder.file('README.txt', pkg.readme);
  return zip.generateAsync({ type: 'blob' });
}
