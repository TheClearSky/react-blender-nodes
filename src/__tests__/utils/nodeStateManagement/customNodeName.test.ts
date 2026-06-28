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

// ---------------------------------------------------------------------------
// Minimal closed-union state with a single standard node type.
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

/** validate → apply the rename, returning the next state (throws if rejected). */
function applyCustomName(
  state: TestState,
  nodeId: string,
  customName: string | undefined,
): TestState {
  const result = validateAction(state, {
    type: actionTypesMap.UPDATE_NODE_CUSTOM_NAME,
    payload: { nodeId, customName },
  });
  const r = result!;
  if (!r.ok) throw new Error(`expected ok, got ${r.error.code}`);
  return produce(state, (draft) => {
    applyPlan(draft, r.value);
  });
}

describe('UPDATE_NODE_CUSTOM_NAME', () => {
  it('sets a custom name on a standard node', () => {
    const next = applyCustomName(
      stateWithNode(buildNode('n1')),
      'n1',
      'Summer',
    );
    expect(next.nodes.find((n) => n.id === 'n1')?.data.customName).toBe(
      'Summer',
    );
  });

  it('clears the custom name when given an empty string (reverts to type name)', () => {
    let state = applyCustomName(stateWithNode(buildNode('n1')), 'n1', 'Summer');
    state = applyCustomName(state, 'n1', '');
    expect(
      state.nodes.find((n) => n.id === 'n1')?.data.customName,
    ).toBeUndefined();
  });

  it('trims surrounding whitespace from the custom name', () => {
    const next = applyCustomName(
      stateWithNode(buildNode('n1')),
      'n1',
      '  Spaced  ',
    );
    expect(next.nodes.find((n) => n.id === 'n1')?.data.customName).toBe(
      'Spaced',
    );
  });

  it('rejects (MISSING_ENDPOINT) when the node does not exist', () => {
    const result = validateAction(createState(), {
      type: actionTypesMap.UPDATE_NODE_CUSTOM_NAME,
      payload: { nodeId: 'nope', customName: 'X' },
    });
    const r = result!;
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('MISSING_ENDPOINT');
  });

  it('rejects (NOOP) a system node — custom names are standard-nodes-only', () => {
    const node = buildNode('sys1');
    // Make the instance look like a group-I/O system node; the validator excludes
    // boundary / loop / switch / group nodes from naming.
    (node.data as { nodeTypeUniqueId: string }).nodeTypeUniqueId =
      standardNodeTypeNamesMap.groupInput;
    const result = validateAction(stateWithNode(node), {
      type: actionTypesMap.UPDATE_NODE_CUSTOM_NAME,
      payload: { nodeId: 'sys1', customName: 'Nope' },
    });
    const r = result!;
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('NOOP');
  });
});
