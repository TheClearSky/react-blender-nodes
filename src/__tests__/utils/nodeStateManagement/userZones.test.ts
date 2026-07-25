import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { validateAction } from '@/utils/nodeStateManagement/planApply/validators';
import { applyPlan } from '@/utils/nodeStateManagement/planApply/applyPlan';
import { actionTypesMap } from '@/utils/nodeStateManagement/mainReducer';
import type { Action } from '@/utils/nodeStateManagement/mainReducer';
import {
  makeStateWithAutoInfer,
  makeDataTypeWithAutoInfer,
  makeTypeOfNodeWithAutoInfer,
} from '@/utils/nodeStateManagement/types';
import { constructNodeOfType } from '@/utils/nodeStateManagement/nodes/constructAndModifyNodes';

// ---------------------------------------------------------------------------
// Minimal closed-union state with a single standard leaf node type, mirroring
// customNodeName.test.ts (validate -> apply directly; no mainReducer => no
// generic-widening trap).
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
type TestAction = Action<DataTypeId, keyof typeof typeOfNodes>;

function buildNode(id: string): TestState['nodes'][number] {
  return constructNodeOfType(
    dataTypes,
    'value',
    typeOfNodes as TestState['typeOfNodes'],
    id,
    { x: 0, y: 0 },
  ) as TestState['nodes'][number];
}

function stateWithNodes(...ids: string[]): TestState {
  return { ...createState(), nodes: ids.map(buildNode) };
}

/** validate -> apply, returning the next state (throws if the action was rejected). */
function dispatch(state: TestState, action: TestAction): TestState {
  const result = validateAction(state, action);
  if (result === null) throw new Error('action not migrated (validator null)');
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`);
  return produce(state, (draft) => {
    applyPlan(draft, result.value);
  });
}

function expectRejected(
  state: TestState,
  action: TestAction,
  code: string,
): void {
  const result = validateAction(state, action);
  expect(result).not.toBeNull();
  expect(result!.ok).toBe(false);
  if (result && !result.ok) expect(result.error.code).toBe(code);
}

/** Applies a raw UPDATE_NODES_RF plan (ReactFlow node changes) bypassing the validator. */
function applyNodeChanges(
  state: TestState,
  changes: Array<Record<string, unknown>>,
): TestState {
  return produce(state, (draft) => {
    applyPlan(draft, { kind: 'UPDATE_NODES_RF', changes });
  });
}

/** Returns the single user zone in a state (asserts exactly one exists). */
function onlyUserZone(state: TestState) {
  const zones = Object.values(state.userZones ?? {});
  expect(zones).toHaveLength(1);
  return zones[0];
}

describe('ADD_USER_ZONE', () => {
  it('wraps the selected nodes in a visual-only zone with sensible defaults', () => {
    const next = dispatch(stateWithNodes('n1', 'n2'), {
      type: actionTypesMap.ADD_USER_ZONE,
      payload: { nodeIds: ['n1', 'n2'] },
    });
    const zone = onlyUserZone(next);
    expect(zone.nodeIds).toEqual(['n1', 'n2']);
    expect(zone.name).toBe('Zone'); // default name
    expect(zone.color).toMatch(/^#[0-9a-fA-F]{6}$/); // default palette hex
    expect(zone.enforced).toBe(false); // visual-only
    expect(zone.structureLink).toBeUndefined();
    expect(zone.boundaryHandles).toBeUndefined();
    // user zones are stored separately from derived (system) zones
    expect(next.zones ?? {}).toEqual({});
  });

  it('honors a provided name and color', () => {
    const next = dispatch(stateWithNodes('n1'), {
      type: actionTypesMap.ADD_USER_ZONE,
      payload: { nodeIds: ['n1'], name: 'Adders', color: '#123abc' },
    });
    const zone = onlyUserZone(next);
    expect(zone.name).toBe('Adders');
    expect(zone.color).toBe('#123abc');
  });

  it('dedups duplicate node ids', () => {
    const next = dispatch(stateWithNodes('n1', 'n2'), {
      type: actionTypesMap.ADD_USER_ZONE,
      payload: { nodeIds: ['n1', 'n1', 'n2', 'n2'] },
    });
    expect(onlyUserZone(next).nodeIds).toEqual(['n1', 'n2']);
  });

  it('rejects (NOOP) an empty selection', () => {
    expectRejected(
      stateWithNodes('n1'),
      { type: actionTypesMap.ADD_USER_ZONE, payload: { nodeIds: [] } },
      'NOOP',
    );
  });

  it('rejects (MISSING_ENDPOINT) a node id not in scope', () => {
    expectRejected(
      stateWithNodes('n1'),
      {
        type: actionTypesMap.ADD_USER_ZONE,
        payload: { nodeIds: ['n1', 'ghost'] },
      },
      'MISSING_ENDPOINT',
    );
  });
});

describe('UPDATE_USER_ZONE', () => {
  function withOneZone(): { state: TestState; zoneId: string } {
    const state = dispatch(stateWithNodes('n1', 'n2'), {
      type: actionTypesMap.ADD_USER_ZONE,
      payload: { nodeIds: ['n1', 'n2'], name: 'Old', color: '#111111' },
    });
    return { state, zoneId: onlyUserZone(state).id };
  }

  it('renames and recolors (partial — omitted fields unchanged)', () => {
    const { state, zoneId } = withOneZone();
    const renamed = dispatch(state, {
      type: actionTypesMap.UPDATE_USER_ZONE,
      payload: { zoneId, name: 'New' },
    });
    expect(renamed.userZones![zoneId].name).toBe('New');
    expect(renamed.userZones![zoneId].color).toBe('#111111'); // unchanged
    const recolored = dispatch(renamed, {
      type: actionTypesMap.UPDATE_USER_ZONE,
      payload: { zoneId, color: '#abcdef' },
    });
    expect(recolored.userZones![zoneId].name).toBe('New'); // unchanged
    expect(recolored.userZones![zoneId].color).toBe('#abcdef');
  });

  it('rejects (NOOP) a blank name + unparseable color (nothing to apply)', () => {
    const { state, zoneId } = withOneZone();
    // Was a silent clamp; an all-dropped update is now a NOOP rejection, so no
    // phantom history entry / applied event is produced.
    expectRejected(
      state,
      {
        type: actionTypesMap.UPDATE_USER_ZONE,
        payload: { zoneId, name: '   ', color: 'not-a-color' },
      },
      'NOOP',
    );
  });

  it('rejects (NOOP) when the zone does not exist', () => {
    const { state } = withOneZone();
    expectRejected(
      state,
      {
        type: actionTypesMap.UPDATE_USER_ZONE,
        payload: { zoneId: 'nope', name: 'X' },
      },
      'NOOP',
    );
  });
});

describe('UPDATE_USER_ZONE_MEMBERS', () => {
  function withZoneOf(...ids: string[]): { state: TestState; zoneId: string } {
    const state = dispatch(stateWithNodes('n1', 'n2', 'n3'), {
      type: actionTypesMap.ADD_USER_ZONE,
      payload: { nodeIds: ids },
    });
    return { state, zoneId: onlyUserZone(state).id };
  }

  it('adds members (union + dedup)', () => {
    const { state, zoneId } = withZoneOf('n1');
    const next = dispatch(state, {
      type: actionTypesMap.UPDATE_USER_ZONE_MEMBERS,
      payload: { zoneId, nodeIds: ['n1', 'n2'], mode: 'add' },
    });
    expect(next.userZones![zoneId].nodeIds).toEqual(['n1', 'n2']);
  });

  it('removes members', () => {
    const { state, zoneId } = withZoneOf('n1', 'n2', 'n3');
    const next = dispatch(state, {
      type: actionTypesMap.UPDATE_USER_ZONE_MEMBERS,
      payload: { zoneId, nodeIds: ['n2'], mode: 'remove' },
    });
    expect(next.userZones![zoneId].nodeIds).toEqual(['n1', 'n3']);
  });

  it('auto-deletes the zone when the last member is removed', () => {
    const { state, zoneId } = withZoneOf('n1');
    const next = dispatch(state, {
      type: actionTypesMap.UPDATE_USER_ZONE_MEMBERS,
      payload: { zoneId, nodeIds: ['n1'], mode: 'remove' },
    });
    expect(next.userZones ?? {}).toEqual({});
  });

  it("rejects (MISSING_ENDPOINT) adding a node that isn't in scope", () => {
    const { state, zoneId } = withZoneOf('n1');
    expectRejected(
      state,
      {
        type: actionTypesMap.UPDATE_USER_ZONE_MEMBERS,
        payload: { zoneId, nodeIds: ['ghost'], mode: 'add' },
      },
      'MISSING_ENDPOINT',
    );
  });

  it('rejects (NOOP) adding only already-present members', () => {
    const { state, zoneId } = withZoneOf('n1', 'n2');
    expectRejected(
      state,
      {
        type: actionTypesMap.UPDATE_USER_ZONE_MEMBERS,
        payload: { zoneId, nodeIds: ['n1'], mode: 'add' },
      },
      'NOOP',
    );
  });

  it('rejects (NOOP) removing members that are not present', () => {
    const { state, zoneId } = withZoneOf('n1');
    expectRejected(
      state,
      {
        type: actionTypesMap.UPDATE_USER_ZONE_MEMBERS,
        payload: { zoneId, nodeIds: ['n2'], mode: 'remove' },
      },
      'NOOP',
    );
  });
});

describe('DELETE_USER_ZONE', () => {
  it('removes the zone', () => {
    const state = dispatch(stateWithNodes('n1'), {
      type: actionTypesMap.ADD_USER_ZONE,
      payload: { nodeIds: ['n1'] },
    });
    const zoneId = onlyUserZone(state).id;
    const next = dispatch(state, {
      type: actionTypesMap.DELETE_USER_ZONE,
      payload: { zoneId },
    });
    expect(next.userZones ?? {}).toEqual({});
  });

  it('rejects (NOOP) a missing zone', () => {
    expectRejected(
      stateWithNodes('n1'),
      { type: actionTypesMap.DELETE_USER_ZONE, payload: { zoneId: 'nope' } },
      'NOOP',
    );
  });
});

describe('ADD_USER_ZONE — default name numbering + first-unused color', () => {
  function addZone(state: TestState, nodeIds: string[], name?: string) {
    return dispatch(state, {
      type: actionTypesMap.ADD_USER_ZONE,
      payload: { nodeIds, ...(name !== undefined ? { name } : {}) },
    });
  }
  function zoneNames(state: TestState): string[] {
    return Object.values(state.userZones ?? {}).map((zone) => zone.name);
  }
  function zoneByName(state: TestState, name: string) {
    return Object.values(state.userZones ?? {}).find((z) => z.name === name)!;
  }

  it('numbers defaults: first "Zone", second "Zone 2", third "Zone 3"', () => {
    let state = addZone(stateWithNodes('n1', 'n2', 'n3'), ['n1']);
    state = addZone(state, ['n2']);
    state = addZone(state, ['n3']);
    expect(zoneNames(state).sort()).toEqual(['Zone', 'Zone 2', 'Zone 3']);
  });

  it('delete-then-create resumes from the MAX remaining suffix (no duplicate)', () => {
    let state = addZone(stateWithNodes('n1', 'n2'), ['n1']); // "Zone"
    state = addZone(state, ['n2']); // "Zone 2"
    const zoneTwo = zoneByName(state, 'Zone 2');
    state = dispatch(state, {
      type: actionTypesMap.DELETE_USER_ZONE,
      payload: { zoneId: zoneTwo.id },
    });
    state = addZone(state, ['n2']);
    // max over the remaining {"Zone"} (suffix 1) + 1 = "Zone 2" again — never a dup
    expect(zoneNames(state).sort()).toEqual(['Zone', 'Zone 2']);
  });

  it('a manually-typed "Zone 7" joins the scan (next default is "Zone 8")', () => {
    let state = addZone(stateWithNodes('n1', 'n2'), ['n1'], 'Zone 7');
    state = addZone(state, ['n2']);
    expect(zoneNames(state).sort()).toEqual(['Zone 7', 'Zone 8']);
  });

  it('the scan is case-sensitive BY INTENT ("zone 5" never affects defaults)', () => {
    let state = addZone(stateWithNodes('n1', 'n2'), ['n1'], 'zone 5');
    state = addZone(state, ['n2']);
    expect(zoneNames(state).sort()).toEqual(['Zone', 'zone 5']);
  });

  it('default color is the FIRST UNUSED palette entry (no duplicate dot after delete-recreate)', () => {
    let state = addZone(stateWithNodes('n1', 'n2'), ['n1']);
    state = addZone(state, ['n2']);
    const [firstColor, secondColor] = Object.values(state.userZones!).map(
      (zone) => zone.color,
    );
    expect(firstColor).not.toBe(secondColor);
    const firstZone = Object.values(state.userZones!)[0];
    state = dispatch(state, {
      type: actionTypesMap.DELETE_USER_ZONE,
      payload: { zoneId: firstZone.id },
    });
    state = addZone(state, ['n1']);
    const colors = Object.values(state.userZones!).map((zone) => zone.color);
    // the recreated zone reuses the now-free first color, NOT the survivor's
    expect(new Set(colors).size).toBe(colors.length);
    expect(colors).toContain(firstColor);
  });
});

describe('user-zone deletion-prune (UPDATE_NODES_RF)', () => {
  function withZone(): { state: TestState; zoneId: string } {
    const state = dispatch(stateWithNodes('n1', 'n2', 'n3'), {
      type: actionTypesMap.ADD_USER_ZONE,
      payload: { nodeIds: ['n1', 'n2'] },
    });
    return { state, zoneId: onlyUserZone(state).id };
  }

  it('prunes a deleted member node from the zone', () => {
    const { state, zoneId } = withZone();
    const next = applyNodeChanges(state, [{ type: 'remove', id: 'n1' }]);
    expect(next.userZones![zoneId].nodeIds).toEqual(['n2']);
  });

  it('auto-deletes a zone whose last member is deleted', () => {
    const { state, zoneId } = withZone();
    const next = applyNodeChanges(state, [
      { type: 'remove', id: 'n1' },
      { type: 'remove', id: 'n2' },
    ]);
    expect(next.userZones?.[zoneId]).toBeUndefined();
    expect(next.userZones ?? {}).toEqual({});
  });

  it('is a NO-OP on a position/select change (no node removed)', () => {
    const { state } = withZone();
    const next = applyNodeChanges(state, [
      { type: 'position', id: 'n1', position: { x: 50, y: 50 } },
    ]);
    // immer structural sharing: an untouched userZones keeps its reference.
    expect(next.userZones).toBe(state.userZones);
  });
});

describe('select-members (UPDATE_NODES_RF select changes)', () => {
  it('marks exactly the zone members selected, others deselected', () => {
    // Mirrors FullGraph's handleSelectUserZoneMembers change-set.
    const state = stateWithNodes('n1', 'n2', 'n3');
    const members = new Set(['n1', 'n3']);
    const next = applyNodeChanges(
      state,
      state.nodes.map((node) => ({
        id: node.id,
        type: 'select',
        selected: members.has(node.id),
      })),
    );
    const selectedOf = (id: string) =>
      next.nodes.find((node) => node.id === id)?.selected;
    expect(selectedOf('n1')).toBe(true);
    expect(selectedOf('n2')).toBe(false);
    expect(selectedOf('n3')).toBe(true);
  });

  it('a select-only change set does not prune user-zone membership', () => {
    const state = dispatch(stateWithNodes('n1', 'n2'), {
      type: actionTypesMap.ADD_USER_ZONE,
      payload: { nodeIds: ['n1', 'n2'] },
    });
    const zoneId = onlyUserZone(state).id;
    const next = applyNodeChanges(state, [
      { type: 'select', id: 'n1', selected: true },
    ]);
    // No 'remove' change → the prune is skipped → membership untouched (same ref).
    expect(next.userZones).toBe(state.userZones);
    expect(next.userZones![zoneId].nodeIds).toEqual(['n1', 'n2']);
  });
});
