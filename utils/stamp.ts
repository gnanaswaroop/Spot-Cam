/**
 * @file The date, time and place stamp drawn into the pixels of a photo, and onto every frame of a video.
 */
import { FONT_FAMILY_OVERLAY } from './constants';

/** What the stamp says. An empty address means only the coordinates are stamped. */
export interface StampText {
  dateTime: string;
  coordinates: string;
  address: string;
}

/** Breaks `text` into lines no wider than `maxWidth` (as `measure` reports), splitting only between words. */
export function wrapWords(text: string, maxWidth: number, measure: (text: string) => number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ').filter(Boolean)) {
    const test = line ? `${line} ${word}` : word;
    if (line && measure(test) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Draws the stamp: bold sans text on a translucent dark band across the top, so it stays readable on any picture.
 * Sizes follow the width of the picture.
 */
export function drawStamp(context: CanvasRenderingContext2D, width: number, text: StampText): void {
  const pad = Math.round(width / 50);
  const headSize = Math.round(width / 32);
  const addrSize = Math.round(width / 38);
  const headLine = Math.round(headSize * 1.35);
  const addrLine = Math.round(addrSize * 1.35);

  // Wrap the address into lines that fit the picture.
  context.font = `600 ${addrSize}px ${FONT_FAMILY_OVERLAY}`;
  const addrLines = wrapWords(text.address, width * 0.92, t => context.measureText(t).width);

  const bandHeight = pad * 2 + headLine * 2 + addrLines.length * addrLine;
  context.fillStyle = 'rgba(0, 0, 0, 0.55)';
  context.fillRect(0, 0, width, bandHeight);

  context.fillStyle = 'white';
  context.textAlign = 'center';
  context.textBaseline = 'alphabetic';
  context.shadowColor = 'rgba(0, 0, 0, 0.9)';
  context.shadowBlur = 4;

  let y = pad + headSize;
  context.font = `700 ${headSize}px ${FONT_FAMILY_OVERLAY}`;
  context.fillText(text.dateTime, width / 2, y);
  y += headLine;
  context.fillText(text.coordinates, width / 2, y);
  y += addrLine;
  context.font = `600 ${addrSize}px ${FONT_FAMILY_OVERLAY}`;
  for (const l of addrLines) {
    context.fillText(l, width / 2, y);
    y += addrLine;
  }
  context.shadowBlur = 0;
}
