import { describe, it, expect } from 'vitest';
import {
  mainReducer,
  actionTypesMap,
} from '@/utils/nodeStateManagement/mainReducer';
import { validateAction } from '@/utils/nodeStateManagement/planApply/validators';
import {
  getRunnerViewPreferences,
  DEFAULT_RUNNER_VIEW_PREFERENCES,
  type RunnerViewPreferenceKey,
} from '@/utils/nodeStateManagement/runnerViewPreferences';
import { isUndoable } from '@/components/organisms/FullGraph/historyTypes';
import {
  createStandardState,
  type StdDataTypeId,
  type StdNodeTypeId,
} from '../../_helpers/standardState';
import {
  makeStateWithAutoInfer,
  makeDataTypeWithAutoInfer,
  makeTypeOfNodeWithAutoInfer,
} from '@/utils/nodeStateManagement/types';
import { exportGraphState } from '@/utils/importExport/stateExport';
import { importGraphState } from '@/utils/importExport/stateImport';

// Explicit `mainReducer<…>` type args everywhere (generic-widening trap, feature-dev §4).

describe('getRunnerViewPreferences (accessor)', () => {
  it('defaults both fields to true when the field is absent', () => {
    expect(getRunnerViewPreferences({})).toEqual({
      autoScroll: true,
      followIntoGroups: true,
    });
  });

  it('defaults PER-FIELD for a partial object (missing sibling → true)', () => {
    expect(
      getRunnerViewPreferences({
        runnerViewPreferences: { autoScroll: false },
      }),
    ).toEqual({ autoScroll: false, followIntoGroups: true });
  });

  it('defaults a non-boolean present field to true (the return type never lies)', () => {
    const malformed = {
      runnerViewPreferences: { autoScroll: 'nope', followIntoGroups: false },
    } as unknown as Parameters<typeof getRunnerViewPreferences>[0];
    expect(getRunnerViewPreferences(malformed)).toEqual({
      autoScroll: true,
      followIntoGroups: false,
    });
  });

  it('returns a FRESH object, never the shared frozen default', () => {
    expect(getRunnerViewPreferences({})).not.toBe(
      DEFAULT_RUNNER_VIEW_PREFERENCES,
    );
  });
});

describe('UPDATE_RUNNER_VIEW_PREFERENCE action', () => {
  it('disables a preference (default true → false) and self-heals the absent sibling', () => {
    const base = createStandardState(); // no runnerViewPreferences field at all
    const next = mainReducer<StdDataTypeId, StdNodeTypeId>(base, {
      type: actionTypesMap.UPDATE_RUNNER_VIEW_PREFERENCE,
      payload: { preference: 'autoScroll', enabled: false },
    });
    // Per-field self-heal: BOTH keys present even though `base` had none.
    expect(next.runnerViewPreferences).toEqual({
      autoScroll: false,
      followIntoGroups: true,
    });
  });

  it('enables a previously-disabled preference (false → true)', () => {
    let state = mainReducer<StdDataTypeId, StdNodeTypeId>(
      createStandardState(),
      {
        type: actionTypesMap.UPDATE_RUNNER_VIEW_PREFERENCE,
        payload: { preference: 'followIntoGroups', enabled: false },
      },
    );
    state = mainReducer<StdDataTypeId, StdNodeTypeId>(state, {
      type: actionTypesMap.UPDATE_RUNNER_VIEW_PREFERENCE,
      payload: { preference: 'followIntoGroups', enabled: true },
    });
    expect(getRunnerViewPreferences(state).followIntoGroups).toBe(true);
    // The sibling that was never touched still reads its default.
    expect(getRunnerViewPreferences(state).autoScroll).toBe(true);
  });

  it('NOOPs a set to the value the preference already holds (mainReducer returns the same state)', () => {
    const base = createStandardState(); // autoScroll defaults to true
    const next = mainReducer<StdDataTypeId, StdNodeTypeId>(base, {
      type: actionTypesMap.UPDATE_RUNNER_VIEW_PREFERENCE,
      payload: { preference: 'autoScroll', enabled: true }, // already (default) true
    });
    expect(next).toBe(base); // same reference — no change, no history entry
  });

  it('validator returns code NOOP for an unchanged set', () => {
    const disabled = mainReducer<StdDataTypeId, StdNodeTypeId>(
      createStandardState(),
      {
        type: actionTypesMap.UPDATE_RUNNER_VIEW_PREFERENCE,
        payload: { preference: 'autoScroll', enabled: false },
      },
    );
    const result = validateAction(disabled, {
      type: actionTypesMap.UPDATE_RUNNER_VIEW_PREFERENCE,
      payload: { preference: 'autoScroll', enabled: false },
    });
    expect(result!.ok).toBe(false);
    if (!result!.ok) expect(result!.error.code).toBe('NOOP');
  });

  it('NOOPs and never writes an out-of-contract prototype key like `toString` (Object.hasOwn, not `in`)', () => {
    const base = createStandardState();
    const result = validateAction(base, {
      type: actionTypesMap.UPDATE_RUNNER_VIEW_PREFERENCE,
      payload: {
        preference: 'toString' as RunnerViewPreferenceKey,
        enabled: false,
      },
    });
    expect(result!.ok).toBe(false);
    if (!result!.ok) expect(result!.error.code).toBe('NOOP');

    // …and it can never land in state as a junk own-property.
    const next = mainReducer<StdDataTypeId, StdNodeTypeId>(base, {
      type: actionTypesMap.UPDATE_RUNNER_VIEW_PREFERENCE,
      payload: {
        preference: 'toString' as RunnerViewPreferenceKey,
        enabled: false,
      },
    });
    expect(next).toBe(base);
    expect(next.runnerViewPreferences).toBeUndefined();
  });

  it('is NON-undoable (a view preference must never pollute the undo stack)', () => {
    expect(
      isUndoable(
        {
          type: actionTypesMap.UPDATE_RUNNER_VIEW_PREFERENCE,
          payload: { preference: 'autoScroll', enabled: false },
        },
        {
          kind: 'UPDATE_RUNNER_VIEW_PREFERENCE' as const,
          preference: 'autoScroll',
          enabled: false,
        },
      ),
    ).toBe(false);
  });
});

// ── Import back-compat (Stage 3) ────────────────────────────────────────────
const importStringType = makeDataTypeWithAutoInfer({
  name: 'String',
  underlyingType: 'string',
  color: '#4A90E2',
});
const importDataTypes = { stringType: importStringType } as const;
type ImportDataTypeId = keyof typeof importDataTypes;
const importValueNode = makeTypeOfNodeWithAutoInfer<ImportDataTypeId>({
  name: 'Value',
  inputs: [],
  outputs: [{ name: 'Out', dataType: 'stringType' }],
});
const importTypeOfNodes = { value: importValueNode } as const;
const importOptions = {
  dataTypes: importDataTypes,
  typeOfNodes: importTypeOfNodes,
} as unknown as Parameters<typeof importGraphState>[1];

// Export a minimal (field-less) state; the envelope JSON is then tweaked to inject
// a runnerViewPreferences value for the malformed/partial/round-trip cases.
const baseExportJson = exportGraphState(
  makeStateWithAutoInfer({
    dataTypes: importDataTypes,
    typeOfNodes: importTypeOfNodes,
    nodes: [],
    edges: [],
  }),
);

function jsonWithPreferences(runnerViewPreferences: unknown): string {
  const envelope = JSON.parse(baseExportJson) as {
    state: Record<string, unknown>;
  };
  envelope.state.runnerViewPreferences = runnerViewPreferences;
  return JSON.stringify(envelope);
}

describe('runnerViewPreferences import back-compat', () => {
  it('field-absent import: zero warnings and NOT materialized (D6 byte-preserving early-return)', () => {
    const result = importGraphState(baseExportJson, importOptions);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.warnings).toEqual([]);
    // The absence pin: the accessor test alone cannot distinguish early-return from
    // a silent materialization — THIS is the assertion that actually pins D6.
    expect('runnerViewPreferences' in result.data).toBe(false);
    expect(getRunnerViewPreferences(result.data)).toEqual({
      autoScroll: true,
      followIntoGroups: true,
    });
  });

  it('round-trips a seeded { autoScroll:false, followIntoGroups:false } (present booleans, no warning)', () => {
    const result = importGraphState(
      jsonWithPreferences({ autoScroll: false, followIntoGroups: false }),
      importOptions,
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.warnings).toEqual([]);
    expect(result.data.runnerViewPreferences).toEqual({
      autoScroll: false,
      followIntoGroups: false,
    });
  });

  it('fills a partial object per-field, silently (missing sibling → default true)', () => {
    const result = importGraphState(
      jsonWithPreferences({ autoScroll: false }),
      importOptions,
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.runnerViewPreferences).toEqual({
      autoScroll: false,
      followIntoGroups: true,
    });
    expect(result.warnings).toEqual([]);
  });

  it('replaces a present non-object with defaults and warns', () => {
    const result = importGraphState(jsonWithPreferences(5), importOptions);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(getRunnerViewPreferences(result.data)).toEqual({
      autoScroll: true,
      followIntoGroups: true,
    });
    expect(
      result.warnings.some((w) => w.path === 'state.runnerViewPreferences'),
    ).toBe(true);
  });

  it('persists a PRESENT runnerViewPreferences through the REAL export serializer (not stripped)', () => {
    // The round-trip tests above inject into parsed JSON; this one exports a state
    // that HAS the field, pinning that the serializer denylist never strips it (a
    // future denylist change would red here instead of silently losing prefs).
    const exported = exportGraphState({
      ...makeStateWithAutoInfer({
        dataTypes: importDataTypes,
        typeOfNodes: importTypeOfNodes,
        nodes: [],
        edges: [],
      }),
      runnerViewPreferences: { autoScroll: false, followIntoGroups: true },
    });
    const result = importGraphState(exported, importOptions);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.runnerViewPreferences).toEqual({
      autoScroll: false,
      followIntoGroups: true,
    });
  });
});
