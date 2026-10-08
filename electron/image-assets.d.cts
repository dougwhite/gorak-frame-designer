export interface FrameImageAsset {
  width: number;
  height: number;
  png: Uint8Array;
  transparent?: Uint8Array;
  flags?: string;
}
export function loadImages(
  folder: string,
  references: readonly (readonly [string, string | null, string | null])[],
): Promise<Record<string, FrameImageAsset>>;
export function imageBytes(folder: string, src: string): Promise<Uint8Array>;
export function decodeMask(
  width: number,
  height: number,
  mask?: string | null,
): Uint8Array | undefined;
