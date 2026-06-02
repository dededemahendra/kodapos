import { describe, expect, it } from 'vitest';
import { conditionOf, parseGeocode, parseForecast } from '../../convex/lib/weather';

describe('conditionOf', () => {
  it('rainy when precip >= 5 (takes precedence over hot temp)', () => {
    expect(conditionOf(35, 5)).toBe('rainy');
    expect(conditionOf(20, 12)).toBe('rainy');
  });
  it('hot when temp >= 32 and dry', () => {
    expect(conditionOf(32, 0)).toBe('hot');
    expect(conditionOf(34, 4.9)).toBe('hot');
  });
  it('cool when temp < 24 and dry', () => {
    expect(conditionOf(23.9, 0)).toBe('cool');
  });
  it('normal otherwise', () => {
    expect(conditionOf(28, 0)).toBe('normal');
    expect(conditionOf(24, 4)).toBe('normal');
    expect(conditionOf(24, 0)).toBe('normal');
  });
});

describe('parseGeocode', () => {
  it('reads the first result lat/long', () => {
    const json = { results: [{ latitude: -6.2, longitude: 106.8, name: 'Jakarta' }] };
    expect(parseGeocode(json)).toEqual({ latitude: -6.2, longitude: 106.8 });
  });
  it('null when results empty', () => {
    expect(parseGeocode({ results: [] })).toBeNull();
  });
  it('null when results missing', () => {
    expect(parseGeocode({})).toBeNull();
    expect(parseGeocode(null)).toBeNull();
  });
  it('null when a coordinate is missing', () => {
    expect(parseGeocode({ results: [{ latitude: -6.2 }] })).toBeNull();
  });
});

describe('parseForecast', () => {
  it('zips daily arrays into WeatherDay[] with derived conditions', () => {
    const json = {
      daily: {
        time: ['2026-06-03', '2026-06-04', '2026-06-05'],
        temperature_2m_max: [33, 22, 28],
        precipitation_sum: [0, 0, 10],
      },
    };
    expect(parseForecast(json)).toEqual([
      { dateKey: '2026-06-03', condition: 'hot', tempMaxC: 33, precipMm: 0 },
      { dateKey: '2026-06-04', condition: 'cool', tempMaxC: 22, precipMm: 0 },
      { dateKey: '2026-06-05', condition: 'rainy', tempMaxC: 28, precipMm: 10 },
    ]);
  });
  it('returns [] on a malformed payload', () => {
    expect(parseForecast({})).toEqual([]);
    expect(parseForecast({ daily: { time: ['2026-06-03'] } })).toEqual([]);
    expect(parseForecast(null)).toEqual([]);
  });
  it('skips individual bad elements rather than discarding the whole array', () => {
    expect(
      parseForecast({
        daily: {
          time: ['2026-06-03', '2026-06-04'],
          temperature_2m_max: [33, null],
          precipitation_sum: [0, 0],
        },
      })
    ).toEqual([{ dateKey: '2026-06-03', condition: 'hot', tempMaxC: 33, precipMm: 0 }]);
  });
});
