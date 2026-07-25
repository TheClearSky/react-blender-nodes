import { describe, it, expect } from 'vitest';
import type { Patch } from 'immer';
import {
  mainReducer,
  actionTypesMap,
} from '@/utils/nodeStateManagement/mainReducer';
import type { State } from '@/utils/nodeStateManagement/types';
import {
  standardDataTypes,
  standardNodeTypes,
} from '@/utils/nodeStateManagement/standardNodes';
import {
  filterHistoryPatches,
  recordInHistory,
  applyPatchesToDraft,
  createEmptyHistory,
} from '@/components/organisms/FullGraph/historyTypes';

type TestDataTypeId = keyof typeof standardDataTypes | 'testString';
type TestNodeTypeId = keyof typeof standardNodeTypes | 'testProcessor';
type TestState = State<TestDataTypeId, TestNodeTypeId>;

function createTestState(): TestState {
  return {
    dataTypes: {
      ...standardDataTypes,
      testString: {
        name: 'Test String',
        underlyingType: 'string',
        color: '#4A90E2',
      },
    } as TestState['dataTypes'],
    typeOfNodes: {
      ...standardNodeTypes,
      testProcessor: {
        name: 'Test Processor',
        headerColor: '#C44536',
        inputs: [{ name: 'In', dataType: 'testString' as TestDataTypeId }],
        outputs: [{ name: 'Out', dataType: 'testString' as TestDataTypeId }],
      },
    } as TestState['typeOfNodes'],
    nodes: [],
    edges: [],
  };
}

function addNode(state: TestState, position = { x: 0, y: 0 }): TestState {
  // Explicit type arguments pin UnderlyingType/ComplexSchemaType to their
  // defaults — inference from State's conditional types widens them otherwise.
  return mainReducer<TestDataTypeId, TestNodeTypeId>(state, {
    type: actionTypesMap.ADD_NODE,
    payload: { type: 'testProcessor' as TestNodeTypeId, position },
  });
}

describe('undo/redo history — integration via mainReducer', () => {
  it('records an undoable action and reverts it on UNDO', () => {
    const s0 = createTestState();
    const s1 = addNode(s0);
    expect(s1.nodes).toHaveLength(1);
    expect(s1.history?.undoStack).toHaveLength(1);
    expect(s1.history?.redoStack).toHaveLength(0);

    const s2 = mainReducer<TestDataTypeId, TestNodeTypeId>(s1, {
      type: actionTypesMap.UNDO,
    });
    expect(s2.nodes).toHaveLength(0);
    expect(s2.history?.undoStack).toHaveLength(0);
    expect(s2.history?.redoStack).toHaveLength(1);
  });

  it('a custom-name rename is one undoable entry; UNDO restores the prior name, REDO re-applies', () => {
    const s0 = createTestState();
    const s1 = addNode(s0);
    const nodeId = s1.nodes[0].id;
    const undoBefore = s1.history?.undoStack.length ?? 0;

    const s2 = mainReducer<TestDataTypeId, TestNodeTypeId>(s1, {
      type: actionTypesMap.UPDATE_NODE_CUSTOM_NAME,
      payload: { nodeId, customName: 'Summer' },
    });
    expect(s2.nodes[0].data.customName).toBe('Summer');
    // exactly ONE new undo entry for the rename
    expect(s2.history?.undoStack).toHaveLength(undoBefore + 1);

    const s3 = mainReducer<TestDataTypeId, TestNodeTypeId>(s2, {
      type: actionTypesMap.UNDO,
    });
    expect(s3.nodes[0].data.customName).toBeUndefined();

    const s4 = mainReducer<TestDataTypeId, TestNodeTypeId>(s3, {
      type: actionTypesMap.REDO,
    });
    expect(s4.nodes[0].data.customName).toBe('Summer');
  });

  it('a preview-collapse toggle is ONE undoable entry; UNDO expands, REDO re-collapses (decision D2)', () => {
    const s1 = addNode(createTestState());
    const nodeId = s1.nodes[0].id;
    const undoBefore = s1.history?.undoStack.length ?? 0;

    const s2 = mainReducer<TestDataTypeId, TestNodeTypeId>(s1, {
      type: actionTypesMap.UPDATE_NODE_PREVIEW_COLLAPSED,
      payload: { nodeId, previewCollapsed: true },
    });
    expect(s2.nodes[0].data.previewCollapsed).toBe(true);
    expect(s2.history?.undoStack).toHaveLength(undoBefore + 1);

    // UNDO → expanded (absent = expanded, not an explicit false)
    const s3 = mainReducer<TestDataTypeId, TestNodeTypeId>(s2, {
      type: actionTypesMap.UNDO,
    });
    expect(s3.nodes[0].data.previewCollapsed).toBeUndefined();

    // REDO → collapsed again
    const s4 = mainReducer<TestDataTypeId, TestNodeTypeId>(s3, {
      type: actionTypesMap.REDO,
    });
    expect(s4.nodes[0].data.previewCollapsed).toBe(true);
  });

  it('UNDO of an EXPAND restores the collapsed state', () => {
    const s1 = addNode(createTestState());
    const nodeId = s1.nodes[0].id;
    const collapsed = mainReducer<TestDataTypeId, TestNodeTypeId>(s1, {
      type: actionTypesMap.UPDATE_NODE_PREVIEW_COLLAPSED,
      payload: { nodeId, previewCollapsed: true },
    });
    const expanded = mainReducer<TestDataTypeId, TestNodeTypeId>(collapsed, {
      type: actionTypesMap.UPDATE_NODE_PREVIEW_COLLAPSED,
      payload: { nodeId, previewCollapsed: false },
    });
    expect(expanded.nodes[0].data.previewCollapsed).toBeUndefined();

    const undone = mainReducer<TestDataTypeId, TestNodeTypeId>(expanded, {
      type: actionTypesMap.UNDO,
    });
    expect(undone.nodes[0].data.previewCollapsed).toBe(true);
  });

  it('re-applies the action on REDO', () => {
    const s1 = addNode(createTestState());
    const s2 = mainReducer<TestDataTypeId, TestNodeTypeId>(s1, {
      type: actionTypesMap.UNDO,
    });
    const s3 = mainReducer<TestDataTypeId, TestNodeTypeId>(s2, {
      type: actionTypesMap.REDO,
    });
    expect(s3.nodes).toHaveLength(1);
    expect(s3.history?.undoStack).toHaveLength(1);
    expect(s3.history?.redoStack).toHaveLength(0);
  });

  it('clears the redo stack when a new undoable action follows an undo', () => {
    const s1 = addNode(createTestState());
    const s2 = mainReducer<TestDataTypeId, TestNodeTypeId>(s1, {
      type: actionTypesMap.UNDO,
    });
    expect(s2.history?.redoStack).toHaveLength(1);
    const s3 = addNode(s2, { x: 100, y: 100 });
    expect(s3.history?.redoStack).toHaveLength(0);
    expect(s3.history?.undoStack).toHaveLength(1);
  });

  it('does not record group navigation (OPEN/CLOSE_NODE_GROUP) in history — view concern, like SET_VIEWPORT', () => {
    // Deliberate product decision: navigation must not pollute Ctrl+Z, and the
    // runner's follow-into-groups mode dispatches these on every scrub.
    let s = createTestState();
    s = mainReducer<TestDataTypeId, TestNodeTypeId>(s, {
      type: actionTypesMap.ADD_NODE_GROUP,
    });
    // ADD_NODE_GROUP creates the type AND enters it; leave it again.
    s = mainReducer<TestDataTypeId, TestNodeTypeId>(s, {
      type: actionTypesMap.CLOSE_NODE_GROUP,
    });
    const groupTypeId = Object.keys(s.typeOfNodes).find(
      (typeId) => s.typeOfNodes[typeId as TestNodeTypeId]?.subtree,
    ) as TestNodeTypeId;
    expect(groupTypeId).toBeDefined();

    const undoLenBefore = s.history?.undoStack.length ?? 0;
    s = mainReducer<TestDataTypeId, TestNodeTypeId>(s, {
      type: actionTypesMap.OPEN_NODE_GROUP,
      payload: { nodeType: groupTypeId },
    });
    s = mainReducer<TestDataTypeId, TestNodeTypeId>(s, {
      type: actionTypesMap.CLOSE_NODE_GROUP,
    });
    expect(s.history?.undoStack.length ?? 0).toBe(undoLenBefore);
  });

  it('does not record non-undoable actions (SET_VIEWPORT) in history', () => {
    const s1 = addNode(createTestState());
    const undoLenBefore = s1.history?.undoStack.length ?? 0;
    const s2 = mainReducer<TestDataTypeId, TestNodeTypeId>(s1, {
      type: actionTypesMap.SET_VIEWPORT,
      payload: { viewport: { x: 1, y: 2, zoom: 3 } },
    });
    expect(s2.history?.undoStack).toHaveLength(undoLenBefore);
  });

  it('treats UNDO on empty history as a no-op (returns same reference)', () => {
    const s0 = createTestState();
    const s1 = mainReducer<TestDataTypeId, TestNodeTypeId>(s0, {
      type: actionTypesMap.UNDO,
    });
    expect(s1).toBe(s0);
  });

  it('collapses a BEGIN_BATCH/END_BATCH group into a single undo entry', () => {
    let s = createTestState();
    s = mainReducer<TestDataTypeId, TestNodeTypeId>(s, {
      type: actionTypesMap.BEGIN_BATCH,
    });
    s = addNode(s, { x: 0, y: 0 });
    s = addNode(s, { x: 50, y: 0 });
    // No undo entries are pushed while the batch is open.
    expect(s.history?.undoStack ?? []).toHaveLength(0);

    s = mainReducer<TestDataTypeId, TestNodeTypeId>(s, {
      type: actionTypesMap.END_BATCH,
    });
    expect(s.nodes).toHaveLength(2);
    expect(s.history?.undoStack).toHaveLength(1);

    // A single UNDO reverts the whole batch.
    s = mainReducer<TestDataTypeId, TestNodeTypeId>(s, {
      type: actionTypesMap.UNDO,
    });
    expect(s.nodes).toHaveLength(0);
  });

  it('CLEAR_HISTORY empties both stacks', () => {
    let s = addNode(createTestState());
    s = mainReducer<TestDataTypeId, TestNodeTypeId>(s, {
      type: actionTypesMap.UNDO,
    });
    const total =
      (s.history?.undoStack.length ?? 0) + (s.history?.redoStack.length ?? 0);
    expect(total).toBeGreaterThan(0);

    s = mainReducer<TestDataTypeId, TestNodeTypeId>(s, {
      type: actionTypesMap.CLEAR_HISTORY,
    });
    expect(s.history?.undoStack).toHaveLength(0);
    expect(s.history?.redoStack).toHaveLength(0);
  });

  it('trims the undo stack to config.maxSize', () => {
    let s: TestState = {
      ...createTestState(),
      history: {
        undoStack: [],
        redoStack: [],
        config: { maxSize: 2 },
        activeBatch: null,
      },
    };
    s = addNode(s, { x: 0, y: 0 });
    s = addNode(s, { x: 10, y: 0 });
    s = addNode(s, { x: 20, y: 0 });
    expect(s.nodes).toHaveLength(3);
    expect(s.history?.undoStack).toHaveLength(2);
  });
});

describe('undo/redo history — unit (pure helpers)', () => {
  it('filterHistoryPatches drops patches that target the history field', () => {
    const patches: Patch[] = [
      { op: 'add', path: ['nodes', 0], value: { id: 'n1' } },
      { op: 'replace', path: ['history', 'undoStack'], value: [] },
      { op: 'replace', path: ['viewport', 'zoom'], value: 2 },
    ];
    const filtered = filterHistoryPatches(patches);
    expect(filtered).toHaveLength(2);
    expect(filtered.every((p) => p.path[0] !== 'history')).toBe(true);
  });

  it('recordInHistory pushes a normal entry, clears redo, and trims to maxSize', () => {
    const history = createEmptyHistory();
    history.config.maxSize = 2;
    history.redoStack = [
      { patches: [], inversePatches: [], actionType: 'X', timestamp: 0 },
    ];

    recordInHistory(
      history,
      [{ op: 'add', path: ['nodes', 0], value: 1 }],
      [{ op: 'remove', path: ['nodes', 0] }],
      'A',
    );
    expect(history.undoStack).toHaveLength(1);
    expect(history.redoStack).toHaveLength(0); // a new entry clears redo

    recordInHistory(
      history,
      [{ op: 'add', path: ['nodes', 1], value: 2 }],
      [],
      'B',
    );
    recordInHistory(
      history,
      [{ op: 'add', path: ['nodes', 2], value: 3 }],
      [],
      'C',
    );
    expect(history.undoStack).toHaveLength(2); // trimmed to maxSize
    expect(history.undoStack.at(-1)?.actionType).toBe('C');
  });

  it('recordInHistory accumulates into the active batch without growing the undo stack', () => {
    const history = createEmptyHistory();
    history.activeBatch = {
      patches: [],
      inversePatches: [],
      actionTypes: [],
      startTimestamp: 0,
    };
    recordInHistory(
      history,
      [{ op: 'add', path: ['nodes', 0], value: 1 }],
      [{ op: 'remove', path: ['nodes', 0] }],
      'A',
    );
    recordInHistory(
      history,
      [{ op: 'add', path: ['nodes', 1], value: 2 }],
      [{ op: 'remove', path: ['nodes', 1] }],
      'B',
    );
    expect(history.undoStack).toHaveLength(0);
    expect(history.activeBatch?.patches).toHaveLength(2);
    expect(history.activeBatch?.actionTypes).toEqual(['A', 'B']);
  });

  it('applyPatchesToDraft applies add/replace/remove across nested objects and arrays', () => {
    type DraftShape = {
      nodes: Array<{ id: string; pos?: { x: number } }>;
      meta: { name?: string };
    };
    const draft: DraftShape = {
      nodes: [{ id: 'a', pos: { x: 0 } }],
      meta: { name: 'g' },
    };

    applyPatchesToDraft(draft as unknown as Record<string, unknown>, [
      { op: 'replace', path: ['nodes', 0, 'pos', 'x'], value: 42 },
      { op: 'add', path: ['nodes', 1], value: { id: 'b' } },
      { op: 'remove', path: ['meta', 'name'] },
    ]);

    expect(draft.nodes[0].pos?.x).toBe(42);
    expect(draft.nodes[1]).toEqual({ id: 'b' });
    expect(draft.meta.name).toBeUndefined();
  });
});
