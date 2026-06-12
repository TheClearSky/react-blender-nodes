import { describe, it, expect } from 'vitest';
import { importGraphState } from '@/utils/importExport/stateImport';
import {
  standardDataTypes,
  standardNodeTypes,
} from '@/utils/nodeStateManagement/standardNodes';

// The user-config source of truth required by the importer. The malformed
// inputs below fail before these are consulted, so standard definitions suffice.
const options = {
  dataTypes: standardDataTypes,
  typeOfNodes: standardNodeTypes,
} as unknown as Parameters<typeof importGraphState>[1];

describe('importExport/stateImport', () => {
  it('returns an unsuccessful result for non-JSON input instead of throwing', () => {
    const result = importGraphState('this is not json', options);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it('returns an unsuccessful result for JSON that is not a valid graph state', () => {
    const result = importGraphState(JSON.stringify({ foo: 'bar' }), options);
    expect(result.success).toBe(false);
  });
});
