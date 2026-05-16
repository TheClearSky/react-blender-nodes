import { describe, it, expect } from 'vitest';
import { importGraphState } from '@/utils/importExport/stateImport';

describe('importExport/stateImport', () => {
  it('should export the importGraphState function', () => {
    expect(importGraphState).toBeDefined();
    expect(typeof importGraphState).toBe('function');
  });
});
