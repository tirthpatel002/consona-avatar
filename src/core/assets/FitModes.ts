export type FitMode = 'contain' | 'cover' | 'stretch' | 'none';

export interface FitResult {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Compute draw rect for an asset inside a box (replaces hard-coded 50×50).
 */
export function fitRect(
  mode: FitMode,
  boxW: number,
  boxH: number,
  intrinsicW: number,
  intrinsicH: number
): FitResult {
  if (mode === 'stretch' || mode === 'none' || intrinsicW <= 0 || intrinsicH <= 0) {
    return { x: 0, y: 0, width: boxW, height: boxH };
  }
  const scale =
    mode === 'cover'
      ? Math.max(boxW / intrinsicW, boxH / intrinsicH)
      : Math.min(boxW / intrinsicW, boxH / intrinsicH);
  const width = intrinsicW * scale;
  const height = intrinsicH * scale;
  return {
    x: (boxW - width) / 2,
    y: (boxH - height) / 2,
    width,
    height,
  };
}
