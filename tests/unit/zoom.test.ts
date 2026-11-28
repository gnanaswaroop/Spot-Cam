import { describe, expect, it } from 'vitest';
import { FIT, MAX_ZOOM, MIN_ZOOM, clampPan, clampScale, zoomAbout } from '../../utils/zoom';

describe('clampScale', () => {
  it('keeps the scale between 1x and the largest zoom', () => {
    expect(clampScale(0.2)).toBe(MIN_ZOOM);
    expect(clampScale(2)).toBe(2);
    expect(clampScale(99)).toBe(MAX_ZOOM);
  });
});

describe('clampPan', () => {
  it('has nothing to pan at 1x, so the view is reset whatever shift it had', () => {
    expect(clampPan({ scale: 1, x: 40, y: -30 }, 300, 400)).toEqual(FIT);
  });

  it('lets the picture move only as far as it sticks out past each edge', () => {
    // At 2x a 300 x 400 box has 150 px and 200 px of picture beyond each side's half-width.
    expect(clampPan({ scale: 2, x: 500, y: 0 }, 300, 400)).toEqual({ scale: 2, x: 150, y: 0 });
    expect(clampPan({ scale: 2, x: -500, y: -500 }, 300, 400)).toEqual({ scale: 2, x: -150, y: -200 });
    expect(clampPan({ scale: 2, x: 10, y: -20 }, 300, 400)).toEqual({ scale: 2, x: 10, y: -20 });
  });
});

describe('zoomAbout', () => {
  it('zooms about the centre when the point is the centre', () => {
    expect(zoomAbout(FIT, 2, 0, 0)).toEqual({ scale: 2, x: 0, y: 0 });
  });

  it('keeps the point under the fingers fixed on the picture', () => {
    // A point 100 px right of the centre, on screen, before zooming in. After zooming, it must still be at 100 px.
    const next = zoomAbout(FIT, 3, 100, 0);
    const onPictureBefore = (100 - FIT.x) / FIT.scale;
    expect(next.x + next.scale * onPictureBefore).toBeCloseTo(100, 6);
  });

  it('keeps the same point still when the view was already shifted and zoomed', () => {
    const view = { scale: 2, x: 30, y: -10 };
    const fx = 60;
    const fy = 25;
    const next = zoomAbout(view, 4, fx, fy);
    const onPicture = { x: (fx - view.x) / view.scale, y: (fy - view.y) / view.scale };
    expect(next.x + next.scale * onPicture.x).toBeCloseTo(fx, 6);
    expect(next.y + next.scale * onPicture.y).toBeCloseTo(fy, 6);
  });

  it('never goes past the limits', () => {
    expect(zoomAbout(FIT, 100, 0, 0).scale).toBe(MAX_ZOOM);
    expect(zoomAbout({ scale: 2, x: 0, y: 0 }, 0.1, 50, 50)).toEqual({ scale: MIN_ZOOM, x: 50 - (50 - 0) / 2, y: 50 - (50 - 0) / 2 });
  });
});
