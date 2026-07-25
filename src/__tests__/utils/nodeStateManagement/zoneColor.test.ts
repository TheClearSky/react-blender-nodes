import { describe, it, expect } from 'vitest';
import { normalizeZoneColor } from '@/utils/nodeStateManagement/zones/zoneColor';

describe('normalizeZoneColor', () => {
  it('lowercases uppercase hex (idempotent canonical form)', () => {
    expect(normalizeZoneColor('#A3E635')).toBe('#a3e635');
    expect(normalizeZoneColor('#a3e635')).toBe('#a3e635');
  });

  it('converts rgb() (space and comma syntax) to hex', () => {
    expect(normalizeZoneColor('rgb(96 165 250)')).toBe('#60a5fa');
    expect(normalizeZoneColor('rgb(96, 165, 250)')).toBe('#60a5fa');
  });

  it('converts a named CSS color to hex', () => {
    expect(normalizeZoneColor('rebeccapurple')).toBe('#663399');
  });

  it('parses oklch() to a 6-digit hex', () => {
    expect(normalizeZoneColor('oklch(0.72 0.14 250)')).toMatch(
      /^#[0-9a-f]{6}$/,
    );
  });

  it('drops alpha (8-digit hex → 6-digit)', () => {
    expect(normalizeZoneColor('#11223344')).toBe('#112233');
  });

  it('returns undefined for an unparseable string', () => {
    expect(normalizeZoneColor('not-a-color')).toBeUndefined();
    expect(normalizeZoneColor('#zzz')).toBeUndefined();
  });

  it('returns undefined for empty / whitespace / undefined', () => {
    expect(normalizeZoneColor('')).toBeUndefined();
    expect(normalizeZoneColor('   ')).toBeUndefined();
    expect(normalizeZoneColor(undefined)).toBeUndefined();
  });
});
