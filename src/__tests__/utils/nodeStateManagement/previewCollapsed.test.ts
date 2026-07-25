import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { validateAction } from '@/utils/nodeStateManagement/planApply/validators';
import { applyPlan } from '@/utils/nodeStateManagement/planApply/applyPlan';
import { actionTypesMap } from '@/utils/nodeStateManagement/mainReducer';
import {
  makeStateWithAutoInfer,
  makeDataTypeWithAutoInfer,
  makeTypeOfNodeWithAutoInfer,
} from '@/utils/nodeStateManagement/types';
import { constructNodeOfType } from '@/utils/nodeStateManagement/nodes/constructAndModifyNodes';
import { standardNodeTypeNamesMap } from '@/utils/nodeStateManagement/standardNodes';
import { isUndoable } from '@/components/organisms/FullGraph/historyTypes';
import { exportGraphState } from '@/utils/importExport/stateExport';
import { importGraphState } from '@/utils/importExport/stateImport';

// ---------------------------------------------------------------------------
// Minimal closed-union state with a single standard node type (mirrors
// customNodeName.test.ts — the action this one clones).
// ---------------------------------------------------------------------------
const stringType = makeDataTypeWithAutoInfer({
  name: 'String',
  underlyingType: 'string',
  color: '#4A90E2',
});
const dataTypes = { stringType } as const;
type DataTypeId = keyof typeof dataTypes;

const valueNodeType = makeTypeOfNodeWithAutoInfer<DataTypeId>({
  name: 'Value',
  inputs: [],
  outputs: [{ name: 'Out', dataType: 'stringType' }],
});
const typeOfNodes = { value: valueNodeType } as const;

function createState() {
  return makeStateWithAutoInfer({
    dataTypes,
    typeOfNodes,
    nodes: [],
    edges: [],
  });
}
type TestState = ReturnType<typeof createState>;

function buildNode(id: string): TestState['nodes'][number] {
  return constructNodeOfType(
    dataTypes,
    'value',
    typeOfNodes as TestState['typeOfNodes'],
    id,
    { x: 0, y: 0 },
  ) as TestState['nodes'][number];
}

function stateWithNode(node: TestState['nodes'][number]): TestState {
  return { ...createState(), nodes: [node] };
}

/** validate → apply the toggle, returning the next state (throws if rejected). */
function applyPreviewCollapsed(
  state: TestState,
  nodeId: string,
  previewCollapsed: boolean,
): TestState {
  const result = validateAction(state, {
    type: actionTypesMap.UPDATE_NODE_PREVIEW_COLLAPSED,
    payload: { nodeId, previewCollapsed },
  });
  const r = result!;
  if (!r.ok) throw new Error(`expected ok, got ${r.error.code}`);
  return produce(state, (draft) => {
    applyPlan(draft, r.value);
  });
}

describe('UPDATE_NODE_PREVIEW_COLLAPSED', () => {
  it('collapses a node preview (sets data.previewCollapsed = true)', () => {
    const next = applyPreviewCollapsed(
      stateWithNode(buildNode('n1')),
      'n1',
      true,
    );
    expect(next.nodes.find((n) => n.id === 'n1')?.data.previewCollapsed).toBe(
      true,
    );
  });

  it('expanding stores `undefined` (absent = expanded), not an explicit false', () => {
    let state = applyPreviewCollapsed(
      stateWithNode(buildNode('n1')),
      'n1',
      true,
    );
    state = applyPreviewCollapsed(state, 'n1', false);
    expect(
      state.nodes.find((n) => n.id === 'n1')?.data.previewCollapsed,
    ).toBeUndefined();
  });

  it('rejects (NOOP) when the collapse state is unchanged', () => {
    const state = applyPreviewCollapsed(
      stateWithNode(buildNode('n1')),
      'n1',
      true,
    );
    const result = validateAction(state, {
      type: actionTypesMap.UPDATE_NODE_PREVIEW_COLLAPSED,
      payload: { nodeId: 'n1', previewCollapsed: true },
    });
    const r = result!;
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('NOOP');
  });

  it('rejects (NOOP) `false` on a never-collapsed node (undefined ≡ false)', () => {
    // A programmatic / imported {previewCollapsed:false} on an expanded node is a
    // no-op — it must not write an explicit false nor record an undo entry.
    const result = validateAction(stateWithNode(buildNode('n1')), {
      type: actionTypesMap.UPDATE_NODE_PREVIEW_COLLAPSED,
      payload: { nodeId: 'n1', previewCollapsed: false },
    });
    const r = result!;
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('NOOP');
  });

  it('rejects (MISSING_ENDPOINT) when the node does not exist', () => {
    const result = validateAction(createState(), {
      type: actionTypesMap.UPDATE_NODE_PREVIEW_COLLAPSED,
      payload: { nodeId: 'nope', previewCollapsed: true },
    });
    const r = result!;
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('MISSING_ENDPOINT');
  });

  it('accepts a collapse on a SYSTEM node — no system-node exclusion (unlike custom names)', () => {
    // A preview may be registered for ANY node type id, so the validator does NOT
    // exclude system/structural nodes (custom-name would reject this one as NOOP).
    const node = buildNode('sys1');
    (node.data as { nodeTypeUniqueId: string }).nodeTypeUniqueId =
      standardNodeTypeNamesMap.groupInput;
    const result = validateAction(stateWithNode(node), {
      type: actionTypesMap.UPDATE_NODE_PREVIEW_COLLAPSED,
      payload: { nodeId: 'sys1', previewCollapsed: true },
    });
    expect(result!.ok).toBe(true);
  });

  it('round-trips data.previewCollapsed through the real export → import serializer (guards future field-whitelisting)', () => {
    // A collapsed preview is per-instance state that must survive save/load. The
    // serializer passes `node.data` through today; if a future whitelist strips
    // unknown data fields, this pin fails instead of silently losing the toggle.
    const collapsed = applyPreviewCollapsed(
      stateWithNode(buildNode('n1')),
      'n1',
      true,
    );
    expect(collapsed.nodes[0].data.previewCollapsed).toBe(true);

    const importOptions = {
      dataTypes,
      typeOfNodes,
    } as unknown as Parameters<typeof importGraphState>[1];
    const result = importGraphState(exportGraphState(collapsed), importOptions);

    expect(result.success).toBe(true);
    if (result.success) {
      const node = result.data.nodes.find((n) => n.id === 'n1');
      expect(node?.data.previewCollapsed).toBe(true);
    }
  });

  it('is UNDOABLE — a persisted view toggle the user can Ctrl+Z (decision D2)', () => {
    // Reviewers recommended non-undoable; the user chose undoable. Pin the choice so
    // it isn't silently flipped (it is absent from NON_UNDOABLE_PLAN_KINDS).
    const undoable = isUndoable(
      {
        type: actionTypesMap.UPDATE_NODE_PREVIEW_COLLAPSED,
        payload: { nodeId: 'n1', previewCollapsed: true },
      },
      {
        kind: 'UPDATE_NODE_PREVIEW_COLLAPSED' as const,
        nodeId: 'n1',
        previewCollapsed: true,
      },
    );
    expect(undoable).toBe(true);
  });
});
