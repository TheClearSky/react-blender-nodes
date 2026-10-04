import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { validateAction } from '@/utils/nodeStateManagement/planApply/validators';
import { applyPlan } from '@/utils/nodeStateManagement/planApply/applyPlan';
import {
  actionTypesMap,
  mainReducer,
} from '@/utils/nodeStateManagement/mainReducer';
import type { Action } from '@/utils/nodeStateManagement/mainReducer';
import {
  makeStateWithAutoInfer,
  makeDataTypeWithAutoInfer,
  makeTypeOfNodeWithAutoInfer,
} from '@/utils/nodeStateManagement/types';
import type { TypeOfInput } from '@/utils/nodeStateManagement/types';
import { constructNodeOfType } from '@/utils/nodeStateManagement/nodes/constructAndModifyNodes';
import {
  standardDataTypes,
  standardNodeTypes,
} from '@/utils/nodeStateManagement/standardNodes';
import { typedKeys } from '@/utils/typedKeys';
import { coerceUserZones } from '@/utils/importExport/validation';
import { computeZoneFrames } from '@/components/molecules/ZoneFrameOverlay/useZoneFrames';
import type { Zone } from '@/utils/nodeStateManagement/zones/types';
import {
  buildSocketDocs,
  socketDocKey,
} from '@/components/organisms/ConfigurableNode/SupportingSubcomponents/socketDocs';
import {
  typeOfInputsToDragListItems,
  dragListItemsToTypeOfInputs,
  typeOfOutputsToDragListItems,
  dragListItemsToTypeOfOutputs,
} from '@/components/molecules/NodeTypeEditDrawer/inputOutputConversion';

// In-app docs: optional descriptions on node types (incl. groups), node
// instances (loops), user zones and sockets, plus a socket's min/max/step.

const numberType = makeDataTypeWithAutoInfer({
  name: 'Number',
  underlyingType: 'number',
  color: '#4A90E2',
});
const dataTypes = { numberType } as const;
type DataTypeId = keyof typeof dataTypes;

const valueNodeType = makeTypeOfNodeWithAutoInfer<DataTypeId>({
  name: 'Value',
  inputs: [],
  outputs: [{ name: 'Out', dataType: 'numberType' }],
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

function stateWithNodes(...ids: string[]): TestState {
  return {
    ...createState(),
    nodes: ids.map(
      (id) =>
        constructNodeOfType(
          dataTypes,
          'value',
          typeOfNodes as TestState['typeOfNodes'],
          id,
          { x: 0, y: 0 },
        ) as TestState['nodes'][number],
    ),
  };
}

function dispatch(state: TestState, action: TestAction): TestState {
  const result = validateAction(state, action);
  if (result === null) throw new Error('action not migrated (validator null)');
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`);
  return produce(state, (draft) => {
    applyPlan(draft, result.value);
  });
}

const descriptionOf = (state: TestState, id: string) =>
  (state.nodes.find((n) => n.id === id)?.data as { description?: string })
    .description;

describe('UPDATE_NODE_DESCRIPTION', () => {
  it('sets a trimmed description on every listed node, skipping unknown ids', () => {
    const next = dispatch(stateWithNodes('a', 'b', 'c'), {
      type: actionTypesMap.UPDATE_NODE_DESCRIPTION,
      payload: { nodeIds: ['a', 'b', 'ghost'], description: '  Repeats  ' },
    });
    expect(descriptionOf(next, 'a')).toBe('Repeats');
    expect(descriptionOf(next, 'b')).toBe('Repeats');
    expect(descriptionOf(next, 'c')).toBeUndefined();
  });

  it('a blank description clears it (the key is removed)', () => {
    const described = dispatch(stateWithNodes('a'), {
      type: actionTypesMap.UPDATE_NODE_DESCRIPTION,
      payload: { nodeIds: ['a'], description: 'Hi' },
    });
    const cleared = dispatch(described, {
      type: actionTypesMap.UPDATE_NODE_DESCRIPTION,
      payload: { nodeIds: ['a'], description: '   ' },
    });
    expect('description' in cleared.nodes[0].data).toBe(false);
  });

  it('rejects when none of the nodes exist', () => {
    const result = validateAction(stateWithNodes('a'), {
      type: actionTypesMap.UPDATE_NODE_DESCRIPTION,
      payload: { nodeIds: ['ghost'], description: 'x' },
    });
    expect(result?.ok).toBe(false);
  });
});

describe('UPDATE_USER_ZONE description', () => {
  function withZone() {
    const state = dispatch(stateWithNodes('n1'), {
      type: actionTypesMap.ADD_USER_ZONE,
      payload: { nodeIds: ['n1'], name: 'Drums', color: '#111111' },
    });
    return { state, zoneId: Object.keys(state.userZones!)[0] };
  }

  it('a description-only update sets it and leaves name/color alone', () => {
    const { state, zoneId } = withZone();
    const next = dispatch(state, {
      type: actionTypesMap.UPDATE_USER_ZONE,
      payload: { zoneId, description: ' The beat ' },
    });
    expect(next.userZones![zoneId]).toMatchObject({
      name: 'Drums',
      color: '#111111',
      description: 'The beat',
    });
  });

  it("'' clears it", () => {
    const { state, zoneId } = withZone();
    const described = dispatch(state, {
      type: actionTypesMap.UPDATE_USER_ZONE,
      payload: { zoneId, description: 'The beat' },
    });
    const cleared = dispatch(described, {
      type: actionTypesMap.UPDATE_USER_ZONE,
      payload: { zoneId, description: '' },
    });
    expect('description' in cleared.userZones![zoneId]).toBe(false);
  });

  it('reaches the zone frame (and a blank one does not)', () => {
    const nodes = [
      {
        id: 'n1',
        position: { x: 0, y: 0 },
        measured: { width: 100, height: 50 },
      },
    ];
    const zone = (description?: string) =>
      ({
        id: 'z',
        name: 'Z',
        color: '#60a5fa',
        nodeIds: ['n1'],
        enforced: false,
        description,
      }) as Zone;
    expect(computeZoneFrames({ z: zone('Hi') }, nodes)[0].description).toBe(
      'Hi',
    );
    expect('description' in computeZoneFrames({ z: zone('') }, nodes)[0]).toBe(
      false,
    );
  });

  it('import keeps a string description and drops a malformed one', () => {
    const state: Record<string, unknown> = {
      userZones: {
        good: {
          id: 'good',
          name: 'A',
          color: '#60a5fa',
          nodeIds: ['n1'],
          description: 'Hi',
        },
        bad: {
          id: 'bad',
          name: 'B',
          color: '#60a5fa',
          nodeIds: ['n1'],
          description: 42,
        },
        blank: {
          id: 'blank',
          name: 'C',
          color: '#60a5fa',
          nodeIds: ['n1'],
          description: '  ',
        },
      },
    };
    coerceUserZones(state, []);
    const zones = state.userZones as Record<string, Record<string, unknown>>;
    expect(zones.good.description).toBe('Hi');
    expect('description' in zones.bad).toBe(false);
    expect('description' in zones.blank).toBe(false);
  });
});

describe('UPDATE_NODE_TYPE description (node groups)', () => {
  const groupDataTypes = { ...dataTypes, ...standardDataTypes } as const;
  const groupTypeOfNodes = { ...typeOfNodes, ...standardNodeTypes } as const;
  type GroupNodeTypeId = keyof typeof groupTypeOfNodes;
  function groupState() {
    const state = makeStateWithAutoInfer({
      dataTypes: groupDataTypes,
      typeOfNodes: groupTypeOfNodes,
      nodes: [],
      edges: [],
      enableTypeInference: true,
    });
    const next = mainReducer(state, {
      type: actionTypesMap.ADD_NODE_GROUP,
    }) as typeof state;
    const groupTypeId = typedKeys(next.typeOfNodes).find(
      (key) => next.typeOfNodes[key].subtree !== undefined,
    )! as GroupNodeTypeId;
    return { state: next, groupTypeId };
  }

  it('sets a trimmed description, and a blank one clears it', () => {
    const { state, groupTypeId } = groupState();
    const described = mainReducer(state, {
      type: actionTypesMap.UPDATE_NODE_TYPE,
      payload: {
        nodeTypeId: groupTypeId,
        updates: { description: ' Stutters ' },
      },
    }) as typeof state;
    expect(described.typeOfNodes[groupTypeId].description).toBe('Stutters');
    const cleared = mainReducer(described, {
      type: actionTypesMap.UPDATE_NODE_TYPE,
      payload: { nodeTypeId: groupTypeId, updates: { description: '' } },
    }) as typeof state;
    expect('description' in cleared.typeOfNodes[groupTypeId]).toBe(false);
  });
});

describe('socket docs', () => {
  it('flattens panels, keeps sides apart, and keeps only well-typed fields', () => {
    const docs = buildSocketDocs({
      inputs: [
        {
          name: 'Amount',
          dataType: 'number',
          description: 'How hard',
          min: 0,
          max: 100,
          step: 1,
        },
        {
          name: 'Panel',
          inputs: [
            { name: 'Rate', dataType: 'number', description: 'How fast' },
          ],
        },
        { name: 'Plain', dataType: 'number' },
        {
          name: 'Junk',
          dataType: 'number',
          min: Number.NaN,
          description: '  ',
        },
      ],
      outputs: [
        { name: 'Amount', dataType: 'number', description: 'The result' },
      ],
    });
    expect(docs.get(socketDocKey('in', 'Amount', 'number'))).toEqual({
      description: 'How hard',
      min: 0,
      max: 100,
      step: 1,
    });
    expect(docs.get(socketDocKey('in', 'Rate', 'number'))?.description).toBe(
      'How fast',
    );
    expect(docs.get(socketDocKey('out', 'Amount', 'number'))?.description).toBe(
      'The result',
    );
    expect(docs.has(socketDocKey('in', 'Plain', 'number'))).toBe(false);
    expect(docs.has(socketDocKey('in', 'Junk', 'number'))).toBe(false);
  });
});

describe('node-type editor round-trip', () => {
  it('keeps defaultValue, description, min/max/step (inputs, panels, outputs)', () => {
    const knob: TypeOfInput = {
      name: 'Amount',
      dataType: 'number',
      allowInput: true,
      defaultValue: 50,
      description: 'How hard',
      min: 0,
      max: 100,
      step: 1,
    };
    const inputs = [
      knob,
      { name: 'Panel', inputs: [{ ...knob, name: 'Inner' }] },
    ];
    expect(
      dragListItemsToTypeOfInputs(typeOfInputsToDragListItems(inputs)),
    ).toEqual(inputs);
    const outputs: TypeOfInput[] = [
      { name: 'Out', dataType: 'number', description: 'Result' },
    ];
    expect(
      dragListItemsToTypeOfOutputs(typeOfOutputsToDragListItems(outputs)),
    ).toEqual(outputs);
  });

  it('a blank description is dropped on the way back', () => {
    const items = typeOfOutputsToDragListItems([
      { name: 'Out', dataType: 'number' },
    ]);
    items[0].additionalProperties!.description = '';
    expect(dragListItemsToTypeOfOutputs(items)[0]).toEqual({
      name: 'Out',
      dataType: 'number',
    });
  });
});

describe('ADD_NODE_GROUP naming', () => {
  const groupDataTypes = { ...dataTypes, ...standardDataTypes } as const;
  const groupTypeOfNodes = { ...typeOfNodes, ...standardNodeTypes } as const;
  function stateWith(extraGroupNames: string[]) {
    const state = makeStateWithAutoInfer({
      dataTypes: groupDataTypes,
      typeOfNodes: groupTypeOfNodes,
      nodes: [],
      edges: [],
      enableTypeInference: true,
    });
    // A consumer's own built-in groups (e.g. an instrument library).
    const typeOfNodesWithBuiltIns = { ...state.typeOfNodes } as Record<
      string,
      (typeof state.typeOfNodes)[keyof typeof state.typeOfNodes]
    >;
    extraGroupNames.forEach((name, index) => {
      typeOfNodesWithBuiltIns[`builtIn${index}`] = {
        ...state.typeOfNodes.value,
        name,
        subtree: { nodes: [], edges: [], numberOfReferences: 0 },
      } as unknown as (typeof state.typeOfNodes)[keyof typeof state.typeOfNodes];
    });
    return { ...state, typeOfNodes: typeOfNodesWithBuiltIns } as typeof state;
  }
  const groupNames = (state: ReturnType<typeof stateWith>) =>
    Object.values(state.typeOfNodes)
      .map((type) => type.name)
      .filter((name) => name.startsWith('Node Group'));

  it("a consumer's built-in groups do not push the number up", () => {
    const next = mainReducer(stateWith(['Organ', 'Echo', 'Stutter']), {
      type: actionTypesMap.ADD_NODE_GROUP,
    }) as ReturnType<typeof stateWith>;
    expect(groupNames(next)).toEqual(['Node Group 1']);
  });

  it('takes the first free number', () => {
    const next = mainReducer(stateWith(['Node Group 1', 'Node Group 3']), {
      type: actionTypesMap.ADD_NODE_GROUP,
    }) as ReturnType<typeof stateWith>;
    expect(groupNames(next).sort()).toEqual([
      'Node Group 1',
      'Node Group 2',
      'Node Group 3',
    ]);
  });
});
