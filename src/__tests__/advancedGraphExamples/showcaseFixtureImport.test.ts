// Round-trip pin for the SDF Showcase fixture: the committed, UI-authored
// export must pass the REAL import pipeline (`importGraphState` — the same
// validation/repair/rehydration the Import menu and the Showcase preload
// use) with the story's REAL definitions, and rehydration must re-attach the
// module-level z.custom schemas BY REFERENCE onto every complex handle
// (export strips them; `undefined === undefined` compatibility was the
// cross-type wiring hole this closes).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { importGraphState } from '@/utils/importExport/stateImport';
import {
  sdfDataTypes,
  sdfNodeTypes,
} from '@/advancedGraphExamples/sdfStudioDefinitions';

const FIXTURE_PATH = resolve(
  __dirname,
  '../../../.storybook/static/graphStates/sdf-shape-studio-state.json',
);

describe('SDF Showcase fixture — real import pipeline round-trip', () => {
  it('imports cleanly and rehydrates handle schemas to the module singletons', () => {
    const fixtureJson = readFileSync(FIXTURE_PATH, 'utf8');
    const result = importGraphState(fixtureJson, {
      dataTypes: sdfDataTypes,
      typeOfNodes: sdfNodeTypes,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.warnings).toEqual([]);

    const importedState = result.data;
    expect(importedState.nodes.length).toBe(8);
    expect(importedState.edges.length).toBe(7);

    // Rehydration keystone: the mask output handle carries THE module mask
    // schema by reference (identity is what edge validation compares).
    const lessThanNode = importedState.nodes.find(
      (node) => node.data.nodeTypeUniqueId === 'sdfLessThan',
    );
    expect(lessThanNode).toBeDefined();
    const maskOutput = lessThanNode!.data.outputs?.find(
      (output) => output.name === 'Out',
    );
    const maskSchema =
      maskOutput?.dataType?.dataTypeObject &&
      'complexSchema' in maskOutput.dataType.dataTypeObject
        ? maskOutput.dataType.dataTypeObject.complexSchema
        : undefined;
    expect(maskSchema).toBe(sdfDataTypes.mask.complexSchema);

    // And an sdf handle likewise.
    const renderNode = importedState.nodes.find(
      (node) => node.data.nodeTypeUniqueId === 'sdfRender',
    );
    const sdfInput = renderNode!.data.inputs?.find(
      (input) => !('inputs' in input) && input.name === 'In',
    );
    const sdfSchema =
      sdfInput && 'dataType' in sdfInput
        ? sdfInput.dataType?.dataTypeObject &&
          'complexSchema' in sdfInput.dataType.dataTypeObject
          ? sdfInput.dataType.dataTypeObject.complexSchema
          : undefined
        : undefined;
    expect(sdfSchema).toBe(sdfDataTypes.sdf.complexSchema);

    // The rename shipped: the fixture references `number`, never `num`.
    expect(fixtureJson.includes('"num"')).toBe(false);
    expect(
      Object.keys(importedState.dataTypes as Record<string, unknown>),
    ).toContain('number');
  });
});
