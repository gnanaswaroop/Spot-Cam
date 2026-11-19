/** Small copies of photos for the gallery grid, so it does not have to hold every full-size photo in memory. */

/** The longest side of a thumbnail, in pixels (the grid shows them about 120 px wide, so this stays sharp on dense screens). */
export const THUMB_SIZE = 320;
const THUMB_QUALITY = 0.7;

/** The size a `width` x `height` image has when its longest side is `max` (never larger than the original). */
export const thumbSize = (width: number, height: number, max = THUMB_SIZE): { width: number; height: number } => {
  const scale = Math.min(1, max / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
};

/** A small JPEG data URL of what is drawn on `source` (a canvas, or anything canvas can draw). */
export const makeThumbnail = (source: CanvasImageSource, width: number, height: number): string => {
  const size = thumbSize(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  canvas.getContext('2d')!.drawImage(source, 0, 0, size.width, size.height);
  return canvas.toDataURL('image/jpeg', THUMB_QUALITY);
};

/** A thumbnail of the photo in `dataUrl`; the photo itself when it cannot be decoded (so something still shows). */
export const thumbnailFromDataUrl = (dataUrl: string): Promise<string> =>
  new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      try {
        resolve(makeThumbnail(img, img.naturalWidth, img.naturalHeight));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
