import { describe, it, expect } from 'vitest';
import {
  mainReducer,
  actionTypesMap,
} from '@/utils/nodeStateManagement/mainReducer';
import {
  isLoopNode,
  getLoopStructureFromNode,
} from '@/utils/nodeStateManagement/nodes/loops';
import {
  createStandardState,
  type StdDataTypeId,
  type StdNodeTypeId,
  type StdState,
} from '../../_helpers/standardState';

function addLoop(state: StdState): StdState {
  // Explicit type arguments pin UnderlyingType/ComplexSchemaType to their
  // defaults — inference from State's conditional types widens them otherwise.
  return mainReducer<StdDataTypeId, StdNodeTypeId>(state, {
    type: actionTypesMap.ADD_LOOP,
    payload: { position: { x: 0, y: 0 } },
  });
}

describe('nodeStateManagement/loops — ADD_LOOP construction', () => {
  it('adds a loop triplet whose members are recognised as loop nodes', () => {
    const s1 = addLoop(createStandardState());
    const loopNodes = s1.nodes.filter(
      (n) =>
        n.data.nodeTypeUniqueId != null && isLoopNode(n.data.nodeTypeUniqueId),
    );
    expect(loopNodes).toHaveLength(3);
  });

  it('resolves the full loop structure from any member node', () => {
    const s1 = addLoop(createStandardState());
    const member = s1.nodes.find(
      (n) =>
        n.data.nodeTypeUniqueId != null && isLoopNode(n.data.nodeTypeUniqueId),
    );
    expect(member).toBeDefined();
    const structure = getLoopStructureFromNode(s1, member!);
    expect(structure).toBeDefined();
  });

  it('registers a zone for the created loop (zones are action-created)', () => {
    const s1 = addLoop(createStandardState());
    expect(Object.keys(s1.zones ?? {}).length).toBeGreaterThan(0);
  });

  it('does not classify a non-loop node type as a loop node', () => {
    expect(isLoopNode('someRegularNodeType')).toBe(false);
  });
});

describe('nodeStateManagement/zones — ADD_SWITCH construction', () => {
  it('registers a zone for the created switch (zones are action-created)', () => {
    const s1 = mainReducer<StdDataTypeId, StdNodeTypeId>(
      createStandardState(),
      {
        type: actionTypesMap.ADD_SWITCH,
        payload: { position: { x: 0, y: 0 } },
      },
    );
    expect(Object.keys(s1.zones ?? {}).length).toBeGreaterThan(0);
  });
});
