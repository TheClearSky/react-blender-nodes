import { describe, it, expect } from 'vitest';
import {
  mainReducer,
  actionTypesMap,
} from '@/utils/nodeStateManagement/mainReducer';
import {
  createStandardState,
  type StdState,
} from '../../_helpers/standardState';

describe('REPLACE_STATE — reducer purity (S1)', () => {
  it('does not mutate the dispatched payload and returns a fresh history-stripped tree', () => {
    const current = createStandardState();
    const payloadState: StdState = {
      ...createStandardState(),
      history: { undoStack: [], redoStack: [], config: {}, activeBatch: null },
    };

    const next = mainReducer(current, {
      type: actionTypesMap.REPLACE_STATE,
      payload: { state: payloadState },
    });

    // Purity: the dispatched payload object must be untouched (the old code
    // deleted its `history` and assigned `zones`/`zoneIndex` onto it).
    expect(payloadState.history).toBeDefined();
    expect('zones' in payloadState).toBe(false);

    // The reducer produced a distinct tree, with history stripped + zones attached.
    expect(next).not.toBe(payloadState);
    expect(next.history).toBeUndefined();
    expect('zones' in next).toBe(true);
  });

  it('forwards authored userZones from the payload unchanged (never rehydrated)', () => {
    const current = createStandardState();
    const payloadState: StdState = {
      ...createStandardState(),
      userZones: {
        uz1: {
          id: 'uz1',
          name: 'My Zone',
          color: '#60a5fa',
          nodeIds: ['n1', 'n2'],
          enforced: false,
        },
      },
    };

    const next = mainReducer(current, {
      type: actionTypesMap.REPLACE_STATE,
      payload: { state: payloadState },
    });

    // userZones ride `...rest` verbatim — authored, never stripped or rehydrated
    // (only the derived `zones`/`zoneIndex` are rebuilt).
    expect(next.userZones).toEqual(payloadState.userZones);
    // The dispatched payload object is untouched (purity).
    expect(payloadState.userZones?.uz1.nodeIds).toEqual(['n1', 'n2']);
  });
});
