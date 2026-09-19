import { describe, expect, it } from 'vitest';
import {
  LAYER_DICTIONARY,
  LAYER_ORDER,
  baseLayerName,
  isTimingLayer,
  layerInfo,
  phenometricScaleType,
} from './layers';
import { makeColorScale, sampleRamp, QA_STEPS, TIMING_RAMP } from './colorscales';
import { doyToDateLabel } from './format';

describe('layer dictionary', () => {
  it('holds all 24 WetLSP layers', () => {
    expect(Object.keys(LAYER_DICTIONARY)).toHaveLength(24);
    expect(LAYER_ORDER).toHaveLength(24);
    expect(new Set(LAYER_ORDER).size).toBe(24);
  });

  it('carries the documented units, scales and valid ranges', () => {
    expect(LAYER_DICTIONARY.OGI).toMatchObject({
      units: 'day of year',
      scale: 1,
      validMin: -181,
      validMax: 548,
    });
    expect(LAYER_DICTIONARY.EVImax).toMatchObject({ scale: 0.0001, validMin: 0, validMax: 10000 });
    expect(LAYER_DICTIONARY.EVIarea.validMax).toBe(32766);
    expect(LAYER_DICTIONARY.NumCycles).toMatchObject({ units: 'cycles', validMax: 6 });
    expect(LAYER_DICTIONARY.numObs).toMatchObject({ units: 'days', validMax: 366 });
    expect(LAYER_DICTIONARY.QA).toMatchObject({ validMin: 1, validMax: 4 });
  });

  it('gives second-cycle variants the same semantics as their base layer', () => {
    for (const name of ['OGI', '50PCGI', 'OGMx', 'Peak', 'OGD', '50PCGD', 'OGMn', 'EVImax', 'EVIamp', 'EVIarea']) {
      const base = LAYER_DICTIONARY[name];
      const second = LAYER_DICTIONARY[`${name}_2`];
      expect(second).toBeDefined();
      expect(second.scale).toBe(base.scale);
      expect(second.validMin).toBe(base.validMin);
      expect(second.validMax).toBe(base.validMax);
      expect(second.cycle).toBe(2);
    }
  });
});

describe('phenometricScaleType', () => {
  it('sends every timing layer to the rainbow ramp', () => {
    for (const l of ['OGI', '50PCGI', 'OGMx', 'Peak', 'OGD', '50PCGD', 'OGMn']) {
      expect(phenometricScaleType(l)).toBe('timing');
      expect(phenometricScaleType(`${l}_2`)).toBe('timing');
      expect(isTimingLayer(`${l}_2`)).toBe(true);
    }
  });

  it('sends the EVI layers to greens and QA to greys', () => {
    for (const l of ['EVImax', 'EVIamp', 'EVIarea']) {
      expect(phenometricScaleType(l)).toBe('greenness');
      expect(phenometricScaleType(`${l}_2`)).toBe('greenness');
    }
    expect(phenometricScaleType('QA')).toBe('qa');
    expect(phenometricScaleType('QA_2')).toBe('qa');
  });

  it('sends the counts to viridis', () => {
    expect(phenometricScaleType('NumCycles')).toBe('count');
    expect(phenometricScaleType('numObs')).toBe('count');
  });

  it('handles the leading-digit layer name', () => {
    expect(baseLayerName('50PCGI_2')).toBe('50PCGI');
    expect(phenometricScaleType('50PCGI')).toBe('timing');
    expect(phenometricScaleType('50PCGD_2')).toBe('timing');
  });

  it('degrades to a sequential scale for unknown variables', () => {
    expect(phenometricScaleType('SomethingNew')).toBe('count');
    expect(layerInfo('SomethingNew').cycle).toBe(1);
    expect(layerInfo('SomethingNew_2').cycle).toBe(2);
  });
});

describe('colour scales', () => {
  it('uses the documented timing ramp end to end', () => {
    expect(TIMING_RAMP[0]).toBe('#2c00ff');
    expect(TIMING_RAMP.at(-1)).toBe('#9e0000');
    expect(sampleRamp(TIMING_RAMP, 0)).toEqual([44, 0, 255]);
    expect(sampleRamp(TIMING_RAMP, 1)).toEqual([158, 0, 0]);
  });

  it('makes fill values and NaN fully transparent', () => {
    const timing = makeColorScale('OGI', [1, 366]);
    expect(timing.color(Number.NaN)[3]).toBe(0);
    const green = makeColorScale('EVImax', [0, 1]);
    expect(green.color(Number.NaN)[3]).toBe(0);
    const qa = makeColorScale('QA', [1, 4]);
    expect(qa.color(Number.NaN)[3]).toBe(0);
  });

  it('gives QA exactly four opaque discrete steps', () => {
    const qa = makeColorScale('QA_2', [1, 4]);
    expect(qa.discrete).toBe(true);
    expect(qa.stops).toEqual(QA_STEPS);
    expect(qa.hex(1)).toBe('#f7f7f7');
    expect(qa.hex(4)).toBe('#525252');
    // Out-of-class values are not coloured at all.
    expect(qa.color(0)[3]).toBe(0);
    expect(qa.color(5)[3]).toBe(0);
  });

  it('clamps continuous scales rather than wrapping them', () => {
    const s = makeColorScale('OGI', [100, 200]);
    expect(s.hex(50)).toBe(s.hex(100));
    expect(s.hex(500)).toBe(s.hex(200));
  });

  it('survives a degenerate domain', () => {
    const s = makeColorScale('EVImax', [0.5, 0.5]);
    expect(s.color(0.5)[3]).toBe(255);
    expect(s.ticks()).toEqual([0.5]);
  });
});

describe('scale + fill handling as applied to raster values', () => {
  const apply = (raw: number, layer: string) => {
    const info = LAYER_DICTIONARY[layer];
    if (raw === 32767) return Number.NaN;
    if (raw < info.validMin || raw > info.validMax) return Number.NaN;
    return raw * info.scale;
  };

  it('masks the NetCDF fill value before scaling', () => {
    expect(apply(32767, 'EVImax')).toBeNaN();
    expect(apply(32767, 'OGI')).toBeNaN();
  });

  it('brings EVI layers into 0–1 after the 0.0001 scale', () => {
    expect(apply(10000, 'EVImax')).toBeCloseTo(1, 10);
    expect(apply(4321, 'EVIamp')).toBeCloseTo(0.4321, 10);
    expect(apply(0, 'EVImax')).toBe(0);
  });

  it('leaves day-of-year layers unscaled, including negative onsets', () => {
    expect(apply(-45, 'OGI')).toBe(-45);
    expect(apply(548, '50PCGD_2')).toBe(548);
    expect(apply(549, 'OGI')).toBeNaN();
  });
});

describe('day-of-year labels', () => {
  it('labels an in-year day', () => {
    expect(doyToDateLabel(1, 2021)).toBe('Jan 1');
    expect(doyToDateLabel(182, 2021)).toBe('Jul 1');
  });

  it('carries into the neighbouring years for the -181..548 range', () => {
    expect(doyToDateLabel(-30, 2021)).toContain('2020');
    expect(doyToDateLabel(400, 2021)).toContain('2022');
  });
});
