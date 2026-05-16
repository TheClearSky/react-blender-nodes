import { useCallback, useRef } from 'react';
import type { ActionDispatch } from 'react';
import type { z } from 'zod';
import type {
  State,
  SupportedUnderlyingTypes,
} from '@/utils/nodeStateManagement/types';
import type { Action } from '@/utils/nodeStateManagement/mainReducer';
import { actionTypesMap } from '@/utils/nodeStateManagement/mainReducer';
import type { ExecutionRecord } from '@/utils/nodeRunner/types';
import type { UseNodeRunnerReturn } from '@/utils/nodeRunner/useNodeRunner';
import { exportGraphState, importGraphState } from '@/utils/importExport';
import {
  exportExecutionRecord,
  importExecutionRecord,
} from '@/utils/importExport';
import type { GraphEvent } from '@/utils/nodeStateManagement/graphEvent';

/** Trigger a browser download of a JSON string as a file. */
function downloadJson(json: string, filename: string) {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type UseGraphImportExportOptions<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
> = {
  state: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >;
  dispatch: ActionDispatch<
    [
      action: Action<
        DataTypeUniqueId,
        NodeTypeUniqueId,
        UnderlyingType,
        ComplexSchemaType
      >,
    ]
  >;
  onStateImported?: (
    importedState: State<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    >,
  ) => void;
  onRecordingImported?: (record: ExecutionRecord) => void;
  onImportError?: (errors: string[]) => void;
  /**
   * Unified observability stream for `ui:state:imported` and
   * `ui:recording:imported` events. Captured via ref so identity
   * changes don't propagate to `handleImportState`'s deps — that
   * cascade would recreate `FileInputElements` and remount the hidden
   * `<input type="file">` between the menu click and `setFiles`,
   * breaking imports.
   */
  onGraphEvent?: (
    event: GraphEvent<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    >,
  ) => void;
  setReactFlowKey: React.Dispatch<React.SetStateAction<number>>;
};

type UseGraphImportExportReturn = {
  handleExportState: () => void;
  handleImportState: (json: string) => void;
  handleExportRecording: () => void;
  handleImportRecording: (json: string) => void;
  importStateInputRef: React.RefObject<HTMLInputElement | null>;
  importRecordingInputRef: React.RefObject<HTMLInputElement | null>;
  executionRecordRef: React.MutableRefObject<
    (() => ExecutionRecord | null) | null
  >;
  loadRecordRef: React.MutableRefObject<
    | ((
        record: ExecutionRecord,
      ) => ReturnType<UseNodeRunnerReturn['loadRecord']>)
    | null
  >;
  FileInputElements: React.FC;
};

function useGraphImportExport<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>({
  state,
  dispatch,
  onStateImported,
  onRecordingImported,
  onImportError,
  onGraphEvent,
  setReactFlowKey,
}: UseGraphImportExportOptions<
  DataTypeUniqueId,
  NodeTypeUniqueId,
  UnderlyingType,
  ComplexSchemaType
>): UseGraphImportExportReturn {
  // Capture onGraphEvent in a ref so identity changes don't ripple
  // into the deps of `handleImportState` / `FileInputElements`.
  // Without this, every parent re-render would recreate the file
  // inputs, causing setFiles() to target stale (detached) DOM.
  const onGraphEventRef = useRef(onGraphEvent);
  onGraphEventRef.current = onGraphEvent;

  const executionRecordRef = useRef<(() => ExecutionRecord | null) | null>(
    null,
  );
  const loadRecordRef = useRef<
    | ((
        record: ExecutionRecord,
      ) => ReturnType<UseNodeRunnerReturn['loadRecord']>)
    | null
  >(null);
  const importStateInputRef = useRef<HTMLInputElement>(null);
  const importRecordingInputRef = useRef<HTMLInputElement>(null);

  const handleExportState = useCallback(() => {
    const json = exportGraphState(state, { pretty: true });
    downloadJson(json, 'graph-state.json');
  }, [state]);

  const handleImportState = useCallback(
    (json: string) => {
      const result = importGraphState(json, {
        dataTypes: state.dataTypes,
        typeOfNodes: state.typeOfNodes,
        repair: {
          removeOrphanEdges: true,
          removeDuplicateNodeIds: true,
          removeDuplicateEdgeIds: true,
          fillMissingDefaults: true,
          rehydrateDataTypeObjects: true,
        },
      });
      if (result.success) {
        // Replace stripped JSON definitions with live originals.
        // Export strips non-serializable fields (onChange, complexSchema, etc.)
        // from typeOfNodes and dataTypes. These are type DEFINITIONS that don't
        // change between sessions — always use the live versions.
        const importedState = {
          ...result.data,
          dataTypes: state.dataTypes,
          typeOfNodes: state.typeOfNodes,
        };

        dispatch({
          type: actionTypesMap.REPLACE_STATE,
          payload: { state: importedState },
        });
        // Force ReactFlow to remount so it processes the imported nodes and
        // edges in a fresh initial render (where Handle registration happens
        // in sync with edge rendering). Without this, edges try to resolve
        // handles before the new Handle components have registered.
        setReactFlowKey((k) => k + 1);
        onGraphEventRef.current?.({
          kind: 'ui:state:imported',
          success: true,
          state: importedState,
        });
        onStateImported?.(importedState);
      } else {
        const errors = result.errors.map((e) => `${e.path}: ${e.message}`);
        onGraphEventRef.current?.({
          kind: 'ui:state:imported',
          success: false,
          errors,
        });
        onImportError?.(errors);
      }
    },
    [
      state.dataTypes,
      state.typeOfNodes,
      dispatch,
      onStateImported,
      onImportError,
      setReactFlowKey,
    ],
  );

  const handleExportRecording = useCallback(() => {
    const record = executionRecordRef.current?.();
    if (!record) return;
    const json = exportExecutionRecord(record, { pretty: true });
    downloadJson(json, 'execution-recording.json');
  }, []);

  const handleImportRecording = useCallback(
    (json: string) => {
      const result = importExecutionRecord(json, {
        repair: {
          sanitizeNonSerializableValues: true,
          removeOrphanSteps: true,
        },
      });
      if (result.success) {
        // Load the deserialized record into the runner
        const loadResult = loadRecordRef.current?.(result.data);
        if (loadResult && !loadResult.valid) {
          onImportError?.(loadResult.errors);
          return;
        }
        if (loadResult?.warnings.length) {
          // Surface warnings but still load (record is valid)
          console.warn('Recording import warnings:', loadResult.warnings);
        }
        onGraphEventRef.current?.({ kind: 'ui:recording:imported' });
        onRecordingImported?.(result.data);
      } else {
        onImportError?.(result.errors.map((e) => `${e.path}: ${e.message}`));
      }
    },
    [onRecordingImported, onImportError],
  );

  const FileInputElements: React.FC = useCallback(
    () => (
      <>
        <input
          ref={importStateInputRef}
          type='file'
          accept='.json'
          className='hidden'
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
              const text = ev.target?.result;
              if (typeof text === 'string') handleImportState(text);
            };
            reader.readAsText(file);
            e.target.value = '';
          }}
        />
        <input
          ref={importRecordingInputRef}
          type='file'
          accept='.json'
          className='hidden'
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
              const text = ev.target?.result;
              if (typeof text === 'string') handleImportRecording(text);
            };
            reader.readAsText(file);
            e.target.value = '';
          }}
        />
      </>
    ),
    [handleImportState, handleImportRecording],
  );

  return {
    handleExportState,
    handleImportState,
    handleExportRecording,
    handleImportRecording,
    importStateInputRef,
    importRecordingInputRef,
    executionRecordRef,
    loadRecordRef,
    FileInputElements,
  };
}

export { useGraphImportExport };
export type { UseGraphImportExportOptions, UseGraphImportExportReturn };
