import { describe, it, expect } from 'vitest';
import { importExecutionRecord } from '@/utils/importExport/recordImport';

describe('importExport/recordImport', () => {
  it('should export the importExecutionRecord function', () => {
    expect(importExecutionRecord).toBeDefined();
    expect(typeof importExecutionRecord).toBe('function');
  });
});
