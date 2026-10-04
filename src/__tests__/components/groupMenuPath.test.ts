import { describe, it, expect } from 'vitest';
import { isValidElement } from 'react';
import {
  cleanTypedName,
  parsePathText,
} from '@/components/molecules/PathChipsInput/pathText';
import {
  createNodeContextMenu,
  menuFolderSuggestions,
} from '@/components/molecules/ContextMenu/createNodeContextMenu';
import type { ContextMenuItem } from '@/components/molecules/ContextMenu/ContextMenu';
import {
  actionTypesMap,
  mainReducer,
} from '@/utils/nodeStateManagement/mainReducer';
import {
  makeStateWithAutoInfer,
  makeDataTypeWithAutoInfer,
  makeTypeOfNodeWithAutoInfer,
} from '@/utils/nodeStateManagement/types';
import {
  standardDataTypes,
  standardNodeTypes,
} from '@/utils/nodeStateManagement/standardNodes';
import { typedKeys } from '@/utils/typedKeys';

// Node-group Menu Path + the group mark in the Add menu
// (.claude/plans/group-menu-path.md, rulings Q-P1..4 and Q-G1..3 "all rec").

describe('typed folder names (Q-P2: letters, digits, single spaces)', () => {
  it('keeps letters, digits and single spaces and reports anything dropped', () => {
    expect(cleanTypedName('Drum Kits 2')).toEqual({
      clean: 'Drum Kits 2',
      dropped: false,
    });
    expect(cleanTypedName('Filter & EQ')).toEqual({
      clean: 'Filter EQ',
      dropped: true,
    });
    expect(cleanTypedName('a   b')).toEqual({ clean: 'a b', dropped: false });
  });

  it('a separator finishes a name; a paste becomes several chips', () => {
    expect(parsePathText('Group Nodes/Drums/Ki')).toEqual({
      complete: ['Group Nodes', 'Drums'],
      rest: 'Ki',
      dropped: false,
    });
    expect(parsePathText('Drums›')).toEqual({
      complete: ['Drums'],
      rest: '',
      dropped: false,
    });
    expect(parsePathText('A > B')).toEqual({
      complete: ['A'],
      rest: 'B',
      dropped: false,
    });
    // Blank pieces between separators are not folders.
    expect(parsePathText('//Drums//').complete).toEqual(['Drums']);
  });
});

const numberType = makeDataTypeWithAutoInfer({
  name: 'Number',
  underlyingType: 'number',
  color: '#3498DB',
});
const dataTypes = { numberType, ...standardDataTypes } as const;
const typeOfNodes = {
  pulser: makeTypeOfNodeWithAutoInfer<keyof typeof dataTypes>({
    name: 'Pulser',
    locationInContextMenu: ['Control'],
    inputs: [],
    outputs: [],
  }),
  map: makeTypeOfNodeWithAutoInfer<keyof typeof dataTypes>({
    name: 'Map',
    locationInContextMenu: ['Control'],
    inputs: [],
    outputs: [],
  }),
  ...standardNodeTypes,
} as const;

function groupState() {
  const state = makeStateWithAutoInfer({
    dataTypes,
    typeOfNodes,
    nodes: [],
    edges: [],
    enableTypeInference: true,
  });
  const next = mainReducer(state, {
    type: actionTypesMap.ADD_NODE_GROUP,
  }) as typeof state;
  const groupId = typedKeys(next.typeOfNodes).find(
    (key) => next.typeOfNodes[key].subtree !== undefined,
  )!;
  return { state: next, groupId };
}
type GroupState = ReturnType<typeof groupState>['state'];

function moveTo(state: GroupState, groupId: string, path: string[]) {
  return mainReducer(state, {
    type: actionTypesMap.UPDATE_NODE_TYPE,
    payload: {
      nodeTypeId: groupId as keyof GroupState['typeOfNodes'],
      updates: { locationInContextMenu: path },
    },
  }) as GroupState;
}

describe('UPDATE_NODE_TYPE locationInContextMenu (Q-P3)', () => {
  it('a new group starts under Group Nodes', () => {
    const { state, groupId } = groupState();
    expect(state.typeOfNodes[groupId].locationInContextMenu).toEqual([
      'Group Nodes',
    ]);
  });

  it('sets the path, trimming names and dropping blank ones', () => {
    const { state, groupId } = groupState();
    const next = moveTo(state, groupId, ['  Control ', '', 'My   Rigs']);
    expect(next.typeOfNodes[groupId].locationInContextMenu).toEqual([
      'Control',
      'My Rigs',
    ]);
  });

  it('[] puts it at the top level (the key is removed)', () => {
    const { state, groupId } = groupState();
    const next = moveTo(state, groupId, []);
    expect('locationInContextMenu' in next.typeOfNodes[groupId]).toBe(false);
  });
});

describe('the group mark in the Add menu (Q-G1..3)', () => {
  const hidden = {
    groupInput: true,
    groupOutput: true,
    loopStart: true,
    loopStop: true,
    loopEnd: true,
    switchStart: true,
    switchEnd: true,
  } as const;
  function menuFor(state: GroupState, groupIcon?: false) {
    const [addNode] = createNodeContextMenu({
      typeOfNodes: state.typeOfNodes,
      dispatch: () => {},
      setContextMenu: () => {},
      contextMenuPosition: { x: 0, y: 0 },
      hiddenNodeTypesInContextMenu: hidden as never,
      ...(groupIcon === false && { groupIcon: false as const }),
    });
    return addNode.subItems!;
  }
  const folder = (items: ContextMenuItem[], label: string) =>
    items.find((item) => item.label === label)!.subItems!;
  const iconProps = (item: ContextMenuItem) =>
    (item.icon as { props: Record<string, unknown> }).props;

  it('a group placed among plain nodes is marked; its siblings get an aligned blank', () => {
    const { state, groupId } = groupState();
    const control = folder(
      menuFor(moveTo(state, groupId, ['Control'])),
      'Control',
    );
    const group = control.find((item) => item.label === 'Node Group 1')!;
    const pulser = control.find((item) => item.label === 'Pulser')!;
    expect(isValidElement(group.icon)).toBe(true);
    expect(iconProps(group)['aria-label']).toBe('Node group');
    expect(isValidElement(pulser.icon)).toBe(true);
    expect(iconProps(pulser)['aria-hidden']).toBe(true);
  });

  it('a folder with no groups is unchanged; `false` turns the mark off', () => {
    const { state, groupId } = groupState();
    expect(
      folder(menuFor(state), 'Control').every(
        (item) => item.icon === undefined,
      ),
    ).toBe(true);
    expect(folder(menuFor(state), 'Group Nodes')[0].icon).toBeDefined();
    const moved = moveTo(state, groupId, ['Control']);
    expect(
      folder(menuFor(moved, false), 'Control').every(
        (item) => item.icon === undefined,
      ),
    ).toBe(true);
  });
});

describe('menu folder suggestions', () => {
  const types = {
    a: { locationInContextMenu: ['Control'] },
    b: { locationInContextMenu: ['Group Nodes', 'Drums'] },
    c: { locationInContextMenu: ['Group Nodes', 'Synths'] },
    d: { locationInContextMenu: ['Group Nodes', 'Drums', 'Kicks'] },
    e: { locationInContextMenu: ['Standard Nodes'] },
    f: {},
  };

  it('lists the distinct folders directly under a path', () => {
    expect(menuFolderSuggestions(types, [])).toEqual([
      'Control',
      'Group Nodes',
      'Standard Nodes',
    ]);
    expect(menuFolderSuggestions(types, ['Group Nodes'])).toEqual([
      'Drums',
      'Synths',
    ]);
    expect(menuFolderSuggestions(types, ['Group Nodes', 'Drums'])).toEqual([
      'Kicks',
    ]);
    expect(menuFolderSuggestions(types, ['Nowhere'])).toEqual([]);
  });

  it('skips types hidden from the menu', () => {
    expect(menuFolderSuggestions(types, [], { e: true })).toEqual([
      'Control',
      'Group Nodes',
    ]);
  });
});
