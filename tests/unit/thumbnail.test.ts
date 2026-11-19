import { describe, expect, it } from 'vitest';
import { THUMB_SIZE, thumbSize } from '../../utils/thumbnail';

describe('thumbSize', () => {
  it('scales the longest side down to the thumbnail size, keeping the shape', () => {
    expect(thumbSize(1920, 1080)).toEqual({ width: THUMB_SIZE, height: 180 });
    expect(thumbSize(1080, 1920)).toEqual({ width: 180, height: THUMB_SIZE });
    expect(thumbSize(3000, 3000)).toEqual({ width: THUMB_SIZE, height: THUMB_SIZE });
  });

  it('never makes a small photo bigger', () => {
    expect(thumbSize(100, 50)).toEqual({ width: 100, height: 50 });
  });

  it('never returns a zero side', () => {
    expect(thumbSize(10_000, 1)).toEqual({ width: THUMB_SIZE, height: 1 });
    expect(thumbSize(0, 0)).toEqual({ width: 1, height: 1 });
  });

  it('takes a custom size', () => {
    expect(thumbSize(800, 400, 100)).toEqual({ width: 100, height: 50 });
  });
});
