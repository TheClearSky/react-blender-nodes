import { describe, it, expect } from 'vitest';
import { importExecutionRecord } from '@/utils/importExport/recordImport';

describe('importExport/recordImport', () => {
  it('returns an unsuccessful result for non-JSON input instead of throwing', () => {
    const result = importExecutionRecord('definitely not json');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it('returns an unsuccessful result for JSON that is not an execution record', () => {
    const result = importExecutionRecord(JSON.stringify({ nope: true }));
    expect(result.success).toBe(false);
  });
});
