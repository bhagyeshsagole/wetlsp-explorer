import { describe, expect, it, vi } from 'vitest';
import { nearestPixelIndex } from './pixelPicking';

const projection = {
  project: ([lng, lat]: [number, number]) => ({ x: lng * 10, y: lat * 10 }),
  unproject: ([x, y]: [number, number]) => ({ lng: x / 10, lat: y / 10 }),
};
const geometry = { lon: Float64Array.of(1, 1.4, 2, 30), lat: Float64Array.of(2, 2, 2, 30) };

describe('pixel picking fallback', () => {
  it('picks the nearest index across a gap, independent of binary data objects', () => {
    expect(nearestPixelIndex(geometry, [13, 20], projection)).toBe(1);
  });
  it('returns no selection outside the tolerance', () => {
    expect(nearestPixelIndex(geometry, [40, 40], projection)).toBe(-1);
  });
  it('prefilters distant pixels before projecting and respects the map transform', () => {
    const project = vi.fn(projection.project);
    expect(nearestPixelIndex(geometry, [10, 20], { ...projection, project })).toBe(0);
    expect(project).toHaveBeenCalledTimes(2);
  });
  it('handles another visible copy of a wrapped world', () => {
    expect(nearestPixelIndex(geometry, [3610, 20], projection)).toBe(0);
  });
});
