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

// ---------------------------------------------------------------------------
// User zones are a visual-only authored field; a malformed userZones from a
// hand-edited / version-skewed file must NEVER crash the canvas. The always-on
// `coerceUserZones` runs on every import (not gated on a repair flag).
// ---------------------------------------------------------------------------

describe('importExport — userZones always-on coerce', () => {
  function envelopeWithUserZones(userZones: unknown): string {
    return JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      state: {
        dataTypes: {},
        typeOfNodes: {},
        nodes: [],
        edges: [],
        userZones,
      },
    });
  }

  it('drops a non-object userZones without failing (no char-spread crash)', () => {
    const result = importGraphState(envelopeWithUserZones('garbage'), options);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.userZones).toBeUndefined();
    }
  });

  it('drops malformed zone entries and coerces nodeIds, keeping valid zones', () => {
    const result = importGraphState(
      envelopeWithUserZones({
        good: {
          id: 'good',
          name: 'Keep',
          color: '#60a5fa',
          nodeIds: ['n1', 5, 'n2'],
        },
        bad: 'not-an-object',
      }),
      options,
    );
    expect(result.success).toBe(true);
    if (result.success) {
      const userZones = result.data.userZones as Record<
        string,
        { nodeIds: unknown[] }
      >;
      expect(userZones.bad).toBeUndefined();
      expect(userZones.good.nodeIds).toEqual(['n1', 'n2']);
    }
  });
});

// ---------------------------------------------------------------------------
// E1 — root Graph I/O invariants are enforced on import (REPLACE_STATE bypasses
// the editor; the runtime keys root I/O by name, so dup/empty names collapse).
// ---------------------------------------------------------------------------

type EnvelopeOverrides = {
  nodes?: unknown[];
  edges?: unknown[];
};

function makeEnvelope({ nodes = [], edges = [] }: EnvelopeOverrides): string {
  return JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    state: {
      dataTypes: {},
      typeOfNodes: {},
      nodes,
      edges,
    },
  });
}

function graphInputNode(
  id: string,
  outputs: { id: string; name: string }[],
): unknown {
  return {
    id,
    type: 'configurableNode',
    position: { x: 0, y: 0 },
    data: { nodeTypeUniqueId: 'groupInput', inputs: [], outputs },
  };
}

function graphOutputNode(
  id: string,
  inputs: { id: string; name: string }[],
): unknown {
  return {
    id,
    type: 'configurableNode',
    position: { x: 0, y: 0 },
    data: { nodeTypeUniqueId: 'groupOutput', inputs, outputs: [] },
  };
}

describe('importExport/stateImport — root Graph I/O invariants (E1)', () => {
  it('rejects an imported root Graph Input with duplicate handle names', () => {
    const json = makeEnvelope({
      nodes: [
        graphInputNode('gi', [
          { id: 'h1', name: 'x' },
          { id: 'h2', name: 'x' },
        ]),
      ],
    });
    const result = importGraphState(json, options);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.errors.some((issue) =>
          /duplicate handle name/i.test(issue.message),
        ),
      ).toBe(true);
    }
  });

  it('rejects an imported root Graph Output with an empty handle name', () => {
    const json = makeEnvelope({
      nodes: [graphOutputNode('go', [{ id: 'r', name: '' }])],
    });
    const result = importGraphState(json, options);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.errors.some((issue) => /empty handle name/i.test(issue.message)),
      ).toBe(true);
    }
  });

  it('ACCEPTS a root Graph Input carrying a blank inferFromConnection template (the infer spare)', () => {
    // The blank `name:''` template with `inferFromConnection` is the spare that
    // materializes a real handle on connect — it is EXEMPT from the empty-name
    // boundary check (unlike the authored empty name above). A fresh root graph
    // ships exactly this, so it must round-trip cleanly.
    const json = makeEnvelope({
      nodes: [
        {
          id: 'gi',
          type: 'configurableNode',
          position: { x: 0, y: 0 },
          data: {
            nodeTypeUniqueId: 'groupInput',
            inputs: [],
            outputs: [
              {
                id: 't',
                name: '',
                dataType: {
                  dataTypeUniqueId: 'groupInfer',
                  dataTypeObject: { underlyingType: 'inferFromConnection' },
                },
              },
            ],
          },
        },
      ],
    });
    const result = importGraphState(json, options);
    expect(result.success).toBe(true);
    if (!result.success) {
      expect(
        result.errors.some((issue) => /empty handle name/i.test(issue.message)),
      ).toBe(false);
    }
  });

  it('ACCEPTS a connected root Graph Input: a concrete named handle PLUS the blank infer spare', () => {
    // The post-connect shape: the consumed handle is concrete + named, and a
    // fresh blank infer spare trails it. Both must import (the named handle is a
    // real row; the spare is exempt) — the parity feature's round-trip.
    const json = makeEnvelope({
      nodes: [
        {
          id: 'gi',
          type: 'configurableNode',
          position: { x: 0, y: 0 },
          data: {
            nodeTypeUniqueId: 'groupInput',
            inputs: [],
            outputs: [
              {
                id: 'h1',
                name: 'In',
                dataType: {
                  dataTypeUniqueId: 'numberType',
                  dataTypeObject: { underlyingType: 'number' },
                },
              },
              {
                id: 't',
                name: '',
                dataType: {
                  dataTypeUniqueId: 'groupInfer',
                  dataTypeObject: { underlyingType: 'inferFromConnection' },
                },
              },
            ],
          },
        },
      ],
    });
    const result = importGraphState(json, options);
    expect(result.success).toBe(true);
  });

  it('warns (does not reject) on more than one root Graph Input', () => {
    const json = makeEnvelope({
      nodes: [
        graphInputNode('gi1', [{ id: 'h1', name: 'x' }]),
        graphInputNode('gi2', [{ id: 'h2', name: 'y' }]),
      ],
    });
    const result = importGraphState(json, options);
    expect(result.success).toBe(true);
    expect(
      result.warnings.some((issue) =>
        /multiple root graph input/i.test(issue.message),
      ),
    ).toBe(true);
  });

  it('repairs duplicate/empty names and extra boundary nodes with repairRootGraphIo', () => {
    const json = makeEnvelope({
      nodes: [
        graphInputNode('gi1', [
          { id: 'h1', name: 'x' },
          { id: 'h2', name: 'x' },
          { id: 'h3', name: '' },
        ]),
        graphInputNode('gi2', [{ id: 'h4', name: 'z' }]),
      ],
    });
    const result = importGraphState(json, {
      ...options,
      repair: { repairRootGraphIo: true },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    const nodes = (
      result.data as unknown as {
        nodes: Array<{
          id: string;
          data: { nodeTypeUniqueId: string; outputs: { name: string }[] };
        }>;
      }
    ).nodes;

    // The extra root Graph Input (gi2) is dropped, keeping the first.
    const inputs = nodes.filter(
      (node) => node.data.nodeTypeUniqueId === 'groupInput',
    );
    expect(inputs).toHaveLength(1);
    expect(inputs[0].id).toBe('gi1');

    // Handle names are now non-empty and unique.
    const names = inputs[0].data.outputs.map((handle) => handle.name);
    expect(names[0]).toBe('x');
    expect(new Set(names).size).toBe(names.length);
    expect(names.every((name) => name.trim() !== '')).toBe(true);
  });
});
