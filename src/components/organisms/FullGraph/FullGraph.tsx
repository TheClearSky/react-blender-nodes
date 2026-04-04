import {
  useState,
  useCallback,
  useRef,
  type ActionDispatch,
  useMemo,
  useEffect,
} from 'react';
import { z } from 'zod';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  SelectionMode,
  type XYPosition,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ConfigurableConnection } from '@/components/atoms/ConfiguableConnection/ConfigurableConnection';
import { createNodeContextMenu } from '../../molecules/ContextMenu/createNodeContextMenu';
import { FullGraphContextMenu } from './FullGraphContextMenu';
import { createImportExportMenuItems } from './createImportExportMenuItems';
import { FullGraphNodeGroupSelector } from './FullGraphNodeGroupSelector';
import {
  actionTypesMap,
  type Action,
} from '@/utils/nodeStateManagement/mainReducer';
import {
  type State,
  type SupportedUnderlyingTypes,
} from '@/utils/nodeStateManagement/types';
import { getCurrentNodesAndEdgesFromState } from '@/utils';
import {
  FullGraphContext,
  RecordContext,
  createContextValue,
} from './FullGraphState';
import { RecordingViewStateProvider } from './RecordingViewStateContext';
import { nodeTypes, edgeTypes } from './FullGraphCustomNodesAndEdges';
import type {
  FunctionImplementations,
  ExecutionRecord,
} from '@/utils/nodeRunner/types';
import type { UseNodeRunnerReturn } from '@/utils/nodeRunner/useNodeRunner';
import { RunnerOverlay } from './RunnerOverlay';
import { canRemoveLoopNodesAndEdges } from '@/utils/nodeStateManagement/nodes/loops';
import { hasKey } from '@/utils/nodeRunner/groupCompiler';
import { exportGraphState, importGraphState } from '@/utils/importExport';
import {
  exportExecutionRecord,
  importExecutionRecord,
} from '@/utils/importExport';

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

/**
 * Props for the FullGraph component
 *
 * @template DataTypeUniqueId - Unique identifier type for data types
 * @template NodeTypeUniqueId - Unique identifier type for node types
 * @template UnderlyingType - Supported underlying data types ('string' | 'number' | 'complex')
 * @template ComplexSchemaType - Zod schema type for complex data types
 */
type FullGraphProps<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
> = {
  /** The current state of the graph including nodes, edges, and type definitions */
  state: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >;
  /** Dispatch function for updating the graph state */
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
  functionImplementations?: FunctionImplementations<NodeTypeUniqueId>;
  /** Called when state is successfully imported. Receives the raw parsed state. */
  onStateImported?: (
    importedState: State<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    >,
  ) => void;
  /** Called when a recording is successfully imported. Receives the parsed ExecutionRecord. */
  onRecordingImported?: (record: ExecutionRecord) => void;
  /** Called when import validation fails. Receives the error messages. */
  onImportError?: (errors: string[]) => void;
  /** Controlled execution record. When provided, FullGraph uses this instead of internal state. */
  executionRecord?: ExecutionRecord | null;
  /** Called whenever the execution record changes (run completes, reset, load, etc.). */
  onExecutionRecordChange?: (record: ExecutionRecord | null) => void;
};

// ─────────────────────────────────────────────────────
// FullGraphWithReactFlowProvider
// ─────────────────────────────────────────────────────

/**
 * Internal component that provides the actual graph functionality
 *
 * This component handles the ReactFlow integration and context menu functionality.
 * It's wrapped by the main FullGraph component to provide ReactFlowProvider context.
 */
function FullGraphWithReactFlowProvider<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>({
  state,
  dispatch,
  functionImplementations,
  onStateImported,
  onRecordingImported,
  onImportError,
}: Omit<
  FullGraphProps<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  'executionRecord' | 'onExecutionRecordChange'
>) {
  const executionRecordRef = useRef<(() => ExecutionRecord | null) | null>(
    null,
  );
  const loadRecordRef = useRef<
    | ((
        record: ExecutionRecord,
      ) => ReturnType<UseNodeRunnerReturn['loadRecord']>)
    | null
  >(null);
  const [reactFlowKey, setReactFlowKey] = useState(0);
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
        onStateImported?.(importedState);
      } else {
        onImportError?.(result.errors.map((e) => `${e.path}: ${e.message}`));
      }
    },
    [
      state.dataTypes,
      state.typeOfNodes,
      dispatch,
      onStateImported,
      onImportError,
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
        onRecordingImported?.(result.data);
      } else {
        onImportError?.(result.errors.map((e) => `${e.path}: ${e.message}`));
      }
    },
    [onRecordingImported, onImportError],
  );

  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    position: XYPosition;
  }>({
    isOpen: false,
    position: { x: 0, y: 0 },
  });

  const nodeGroups = useMemo(() => {
    const result: { id: string; name: string }[] = [];
    for (const key of Object.keys(state.typeOfNodes)) {
      if (!hasKey(state.typeOfNodes, key)) continue;
      const nodeType = state.typeOfNodes[key];
      if (nodeType?.subtree !== undefined) {
        result.push({ id: key, name: nodeType.name });
      }
    }
    return result;
  }, [state.typeOfNodes]);

  const currentNodeGroup = useMemo(() => {
    return state.openedNodeGroupStack?.[state.openedNodeGroupStack.length - 1];
  }, [state.openedNodeGroupStack]);

  const { screenToFlowPosition, fitView } = useReactFlow();

  // ── Build context menu items from multiple sources ──
  const closeMenu = useCallback(() => {
    setContextMenu({ isOpen: false, position: { x: 0, y: 0 } });
  }, []);

  const contextMenuItems = useMemo(
    () => [
      ...createNodeContextMenu({
        typeOfNodes: state.typeOfNodes,
        dispatch,
        setContextMenu,
        contextMenuPosition: screenToFlowPosition(contextMenu.position),
        currentNodeType: currentNodeGroup?.nodeType,
        isRecursionAllowed: !state.enableRecursionChecking,
      }),
      ...createImportExportMenuItems({
        onExportState: handleExportState,
        onImportState: () => importStateInputRef.current?.click(),
        onExportRecording: handleExportRecording,
        onImportRecording: () => importRecordingInputRef.current?.click(),
        closeMenu,
      }),
    ],
    [
      state.typeOfNodes,
      dispatch,
      setContextMenu,
      contextMenu.position,
      currentNodeGroup?.nodeType,
      state.enableRecursionChecking,
      handleExportState,
      handleExportRecording,
      closeMenu,
      screenToFlowPosition,
    ],
  );

  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    const position = { x: event.clientX, y: event.clientY };
    setContextMenu({ isOpen: true, position });
  }, []);

  const currentNodesAndEdges = useMemo(() => {
    return getCurrentNodesAndEdgesFromState(state);
  }, [state.nodes, state.edges, state.openedNodeGroupStack, state.typeOfNodes]);

  useEffect(() => {
    if (state.viewport === undefined) {
      if (currentNodesAndEdges.nodes.length > 0) {
        fitView({
          maxZoom: 0.5,
          minZoom: 0.1,
        });
      } else {
        dispatch({
          type: actionTypesMap.SET_VIEWPORT,
          payload: { viewport: { x: 0, y: 0, zoom: 0.45 } },
        });
      }
    }
  }, [state.viewport]);

  // ── Graph content (shared between runner and non-runner modes) ──
  const graphContent = (
    <>
      <ReactFlow
        key={reactFlowKey}
        nodes={currentNodesAndEdges.nodes}
        edges={currentNodesAndEdges.edges}
        onNodesChange={(changes) =>
          dispatch({
            type: actionTypesMap.UPDATE_NODE_BY_REACT_FLOW,
            payload: { changes },
          })
        }
        onEdgesChange={(changes) =>
          dispatch({
            type: actionTypesMap.UPDATE_EDGES_BY_REACT_FLOW,
            payload: { changes },
          })
        }
        onConnect={(newConnection) =>
          dispatch({
            type: actionTypesMap.ADD_EDGE_BY_REACT_FLOW,
            payload: { edge: newConnection },
          })
        }
        maxZoom={1}
        minZoom={0.1}
        proOptions={{
          hideAttribution: true,
        }}
        colorMode='dark'
        selectNodesOnDrag={true}
        elevateNodesOnSelect={true}
        elevateEdgesOnSelect={true}
        selectionMode={SelectionMode.Partial}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        deleteKeyCode={['Backspace', 'Delete', 'x']}
        connectionLineComponent={ConfigurableConnection}
        onContextMenu={handleContextMenu}
        onClick={closeMenu}
        viewport={state.viewport}
        onViewportChange={(viewport) =>
          dispatch({
            type: actionTypesMap.SET_VIEWPORT,
            payload: { viewport },
          })
        }
        onBeforeDelete={async ({ nodes, edges }) => {
          const nodesAndEdgesInCurrentNodeGroup =
            getCurrentNodesAndEdgesFromState(state);
          const validation = canRemoveLoopNodesAndEdges(
            { ...state, ...nodesAndEdgesInCurrentNodeGroup },
            nodes,
            edges,
          );
          if (!validation.validation.isValid) {
            return false;
          }

          return true;
        }}
      >
        <Controls />
        <Background />
        <MiniMap pannable />
      </ReactFlow>

      {/* Context Menu */}
      <FullGraphContextMenu
        isOpen={contextMenu.isOpen}
        position={contextMenu.position}
        onClose={closeMenu}
        items={contextMenuItems}
      />

      <FullGraphNodeGroupSelector
        nodeGroups={nodeGroups}
        value={currentNodeGroup?.nodeType ?? ''}
        setValue={(value) => {
          if (!hasKey(state.typeOfNodes, value)) return;
          dispatch({
            type: actionTypesMap.OPEN_NODE_GROUP,
            payload: {
              nodeType: value,
            },
          });
        }}
        handleAddNewGroup={() =>
          dispatch({
            type: actionTypesMap.ADD_NODE_GROUP,
          })
        }
        enableBackButton={(state.openedNodeGroupStack?.length || 0) > 0}
        handleBack={() =>
          dispatch({
            type: actionTypesMap.CLOSE_NODE_GROUP,
          })
        }
        openedNodeGroupStack={(state.openedNodeGroupStack || []).map(
          (nodeGroup) => ({
            id:
              nodeGroup.nodeType +
              ('nodeId' in nodeGroup ? nodeGroup.nodeId : ''),
            name: state.typeOfNodes[nodeGroup.nodeType].name,
          }),
        )}
      />
    </>
  );

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
      }}
      className='relative'
    >
      {functionImplementations ? (
        <RecordingViewStateProvider>
          <RunnerOverlay
            state={state}
            dispatch={dispatch}
            functionImplementations={functionImplementations}
            onExecutionRecordRef={executionRecordRef}
            loadRecordRef={loadRecordRef}
          >
            {graphContent}
          </RunnerOverlay>
        </RecordingViewStateProvider>
      ) : (
        graphContent
      )}

      {/* Hidden file inputs for import actions triggered by context menu */}
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
    </div>
  );
}

/**
 * Main graph editor component inspired by Blender's node editor
 *
 * This is the primary component for creating interactive node-based graph editors.
 * It provides a complete ReactFlow-based interface with custom nodes, edges, and
 * context menu functionality for adding new nodes.
 *
 * Features:
 * - Pan, zoom, and select nodes with intuitive controls
 * - Drag and drop node connections
 * - Right-click context menu for adding new nodes
 * - Custom node types with configurable inputs and outputs
 * - Real-time node manipulation and state management
 *
 * @template DataTypeUniqueId - Unique identifier type for data types
 * @template NodeTypeUniqueId - Unique identifier type for node types
 * @template UnderlyingType - Supported underlying data types ('string' | 'number' | 'complex')
 * @template ComplexSchemaType - Zod schema type for complex data types
 * @param props - The component props
 * @returns JSX element containing the complete graph editor
 *
 * @example
 * ```tsx
 * import {
 *   FullGraph,
 *   useFullGraph,
 *   makeStateWithAutoInfer,
 *   makeTypeOfNodeWithAutoInfer,
 *   makeDataTypeWithAutoInfer
 * } from 'react-blender-nodes';
 *
 * function MyNodeEditor() {
 *   // Define data types with auto-infer for type safety
 *   const dataTypes = {
 *     stringType: makeDataTypeWithAutoInfer({
 *       name: 'String',
 *       underlyingType: 'string',
 *       color: '#4A90E2',
 *     }),
 *     numberType: makeDataTypeWithAutoInfer({
 *       name: 'Number',
 *       underlyingType: 'number',
 *       color: '#E74C3C',
 *     }),
 *   };
 *
 *   // Define node types with auto-infer for type safety
 *   const typeOfNodes = {
 *     inputNode: makeTypeOfNodeWithAutoInfer({
 *       name: 'Input Node',
 *       headerColor: '#C44536',
 *       inputs: [
 *         { name: 'Input', dataType: 'stringType', allowInput: true }
 *       ],
 *       outputs: [
 *         { name: 'Output', dataType: 'stringType' }
 *       ],
 *     }),
 *     outputNode: makeTypeOfNodeWithAutoInfer({
 *       name: 'Output Node',
 *       headerColor: '#2D5A87',
 *       inputs: [
 *         { name: 'Input', dataType: 'stringType' }
 *       ],
 *       outputs: [],
 *     }),
 *   };
 *
 *   // Create state with auto-infer for complete type safety
 *   const initialState = makeStateWithAutoInfer({
 *     dataTypes,
 *     typeOfNodes,
 *     nodes: [],
 *     edges: [],
 *   });
 *
 *   const { state, dispatch } = useFullGraph(initialState);
 *
 *   return (
 *     <div style={{ height: '600px', width: '100%' }}>
 *       <FullGraph state={state} dispatch={dispatch} />
 *     </div>
 *   );
 * }
 * ```
 */
function FullGraph<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>({
  state,
  dispatch,
  functionImplementations,
  onStateImported,
  onRecordingImported,
  onImportError,
  executionRecord,
  onExecutionRecordChange,
}: FullGraphProps<
  DataTypeUniqueId,
  NodeTypeUniqueId,
  UnderlyingType,
  ComplexSchemaType
>) {
  const noop = useCallback(() => {}, []);
  const recordContextValue = useMemo(
    () => ({
      executionRecord: executionRecord ?? null,
      setExecutionRecord: onExecutionRecordChange ?? noop,
    }),
    [executionRecord, onExecutionRecordChange, noop],
  );

  return (
    <ReactFlowProvider>
      <FullGraphContext.Provider
        value={createContextValue({ state, dispatch })}
      >
        <RecordContext.Provider value={recordContextValue}>
          <FullGraphWithReactFlowProvider
            state={state}
            dispatch={dispatch}
            functionImplementations={functionImplementations}
            onStateImported={onStateImported}
            onRecordingImported={onRecordingImported}
            onImportError={onImportError}
          />
        </RecordContext.Provider>
      </FullGraphContext.Provider>
    </ReactFlowProvider>
  );
}

export { FullGraph };

export { type FullGraphProps };
