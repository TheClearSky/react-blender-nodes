import {
  useState,
  useCallback,
  useMemo,
  useEffect,
  type ActionDispatch,
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
  useUpdateNodeInternals,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ConfigurableConnection } from '@/components/atoms/ConfigurableConnection/ConfigurableConnection';
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
  type TypeOfInput,
  type TypeOfInputPanel,
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
import { RunnerOverlay } from './RunnerOverlay';
import { canRemoveLoopNodesAndEdges } from '@/utils/nodeStateManagement/nodes/loops';
import { hasKey } from '@/utils/nodeRunner/groupCompiler';
import { useGraphImportExport } from './useGraphImportExport';
import { ErrorBoundary } from '@/components/atoms/ErrorBoundary';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import type { GraphEvent } from '@/utils/nodeStateManagement/graphEvent';
import {
  InputComponentRegistryContext,
  type InputComponentRegistry,
} from './InputComponentRegistryContext';
import { NodeTypeEditDrawer } from '@/components/molecules/NodeTypeEditDrawer/NodeTypeEditDrawer';
import { createLoopMenuItem } from '@/components/molecules/ContextMenu/createLoopMenuItem';

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
  /**
   * Unified observability stream — fires for every UI lifecycle moment
   * that bypasses the reducer (drag end, delete-attempt verdict, import
   * outcomes). Pair with `useFullGraph(initial, { onGraphEvent })` (the
   * SAME handler) to also receive reducer-layer events
   * (`action:applied`/`action:rejected`/`state:committed`).
   *
   * See `src/utils/nodeStateManagement/graphEvent.ts` for the full
   * event taxonomy.
   */
  onGraphEvent?: (
    event: GraphEvent<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    >,
  ) => void;
  /**
   * Registry of custom input components keyed by DataTypeUniqueId.
   * Only applies to data types whose `underlyingType` resolves to
   * `'unsupportedDirectly'` — built-in types (string, number, boolean)
   * always use their native components.
   *
   * Follows the same pattern as `functionImplementations`: a map passed
   * as a prop, kept out of serialized state.
   */
  inputComponents?: InputComponentRegistry<DataTypeUniqueId>;
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
  onGraphEvent,
  inputComponents,
}: Omit<
  FullGraphProps<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  'executionRecord' | 'onExecutionRecordChange'
>) {
  const [reactFlowKey, setReactFlowKey] = useState(0);

  const {
    handleExportState,
    handleExportRecording,
    importStateInputRef,
    importRecordingInputRef,
    executionRecordRef,
    loadRecordRef,
    FileInputElements,
  } = useGraphImportExport({
    state,
    dispatch,
    onStateImported,
    onRecordingImported,
    onImportError,
    onGraphEvent,
    setReactFlowKey,
  });

  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    position: XYPosition;
  }>({
    isOpen: false,
    position: { x: 0, y: 0 },
  });

  const [editDrawerNodeTypeId, setEditDrawerNodeTypeId] = useState<
    string | null
  >(null);

  const editDrawerNodeType = editDrawerNodeTypeId
    ? state.typeOfNodes[editDrawerNodeTypeId as NodeTypeUniqueId]
    : null;

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

  const { screenToFlowPosition, fitView, getNodes } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();

  const handleSaveNodeType = useCallback(
    (
      nodeTypeId: string,
      updates: {
        name?: string;
        headerColor?: string;
        inputs?: (TypeOfInput | TypeOfInputPanel)[];
        outputs?: TypeOfInput[];
      },
    ) => {
      dispatch({
        type: actionTypesMap.UPDATE_NODE_TYPE,
        payload: {
          nodeTypeId: nodeTypeId as NodeTypeUniqueId,
          updates: updates as {
            name?: string;
            headerColor?: string;
            inputs?: (
              | TypeOfInput<DataTypeUniqueId>
              | TypeOfInputPanel<DataTypeUniqueId>
            )[];
            outputs?: TypeOfInput<DataTypeUniqueId>[];
          },
        },
      });

      if (updates.inputs !== undefined || updates.outputs !== undefined) {
        requestAnimationFrame(() => {
          const nodeIds = getNodes().map((n) => n.id);
          updateNodeInternals(nodeIds);
        });
      }
    },
    [dispatch, getNodes, updateNodeInternals],
  );

  // ── Build context menu items from multiple sources ──
  const closeMenu = useCallback(() => {
    setContextMenu({ isOpen: false, position: { x: 0, y: 0 } });
  }, []);

  const contextMenuItems = useMemo(
    () => [
      ...createLoopMenuItem({
        dispatch,
        setContextMenu,
        contextMenuPosition: screenToFlowPosition(contextMenu.position),
      }),
      ...createNodeContextMenu({
        typeOfNodes: state.typeOfNodes,
        dispatch,
        setContextMenu,
        contextMenuPosition: screenToFlowPosition(contextMenu.position),
        currentNodeType: currentNodeGroup?.nodeType,
        isRecursionAllowed: !state.enableRecursionChecking,
        hiddenNodeTypesInContextMenu: state.hiddenNodeTypesInContextMenu,
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
      state.hiddenNodeTypesInContextMenu,
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
  }, [state.viewport, currentNodesAndEdges.nodes.length]);

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
        onConnectEnd={(_event, connectionState) =>
          onGraphEvent?.({
            kind: 'ui:drag:ended',
            isValid: connectionState.isValid ?? null,
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
          const success = validation.validation.isValid;
          onGraphEvent?.({
            kind: 'ui:delete:attempted',
            success,
            reason: success ? undefined : validation.validation.reason,
            nodeIds: nodes.map((n) => n.id),
            edgeIds: edges.map((e) => e.id),
          });
          return success;
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
            nodeType: nodeGroup.nodeType,
          }),
        )}
        onEditNodeType={setEditDrawerNodeTypeId}
      />
    </>
  );

  return (
    <ErrorBoundary
      fallback={({ error, reset }) => (
        <div
          data-slot='error-boundary-graph'
          className='flex h-full w-full flex-col items-center justify-center gap-3 bg-zinc-900 text-zinc-300'
        >
          <AlertTriangle className='h-10 w-10 text-red-400' />
          <p className='text-sm font-medium text-red-400'>
            Graph rendering error
          </p>
          <p className='max-w-md text-center text-xs text-zinc-500'>
            {error.message}
          </p>
          <button
            type='button'
            onClick={reset}
            className='mt-2 inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-700'
          >
            <RotateCcw className='h-3 w-3' />
            Retry
          </button>
        </div>
      )}
      onError={(error, errorInfo) => {
        console.error('[FullGraph] Render error:', error, errorInfo);
      }}
    >
      <InputComponentRegistryContext.Provider value={inputComponents}>
        <div
          style={{
            width: '100%',
            height: '100%',
          }}
          className='relative'
        >
          {functionImplementations ? (
            <RecordingViewStateProvider>
              <ErrorBoundary
                fallback={({ error, reset }) => (
                  <div
                    data-slot='error-boundary-runner'
                    className='flex h-full w-full flex-col items-center justify-center gap-3 rounded-md border border-red-500/50 bg-zinc-900 p-6 text-zinc-300'
                  >
                    <AlertTriangle className='h-8 w-8 text-red-400' />
                    <p className='text-sm font-medium text-red-400'>
                      Runner panel error
                    </p>
                    <p className='max-w-md text-center text-xs text-zinc-500'>
                      {error.message}
                    </p>
                    <button
                      type='button'
                      onClick={reset}
                      className='mt-2 inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-700'
                    >
                      <RotateCcw className='h-3 w-3' />
                      Retry
                    </button>
                  </div>
                )}
                onError={(error, errorInfo) => {
                  console.error(
                    '[RunnerOverlay] Render error:',
                    error,
                    errorInfo,
                  );
                }}
              >
                <RunnerOverlay
                  state={state}
                  dispatch={dispatch}
                  functionImplementations={functionImplementations}
                  onExecutionRecordRef={executionRecordRef}
                  loadRecordRef={loadRecordRef}
                >
                  {graphContent}
                </RunnerOverlay>
              </ErrorBoundary>
            </RecordingViewStateProvider>
          ) : (
            graphContent
          )}

          {/* Hidden file inputs for import actions triggered by context menu */}
          <FileInputElements />

          <NodeTypeEditDrawer
            isOpen={editDrawerNodeTypeId !== null}
            onClose={() => setEditDrawerNodeTypeId(null)}
            nodeTypeId={editDrawerNodeTypeId}
            nodeTypeName={editDrawerNodeType?.name ?? null}
            nodeTypeHeaderColor={editDrawerNodeType?.headerColor ?? null}
            nodeTypeInputs={editDrawerNodeType?.inputs ?? null}
            nodeTypeOutputs={editDrawerNodeType?.outputs ?? null}
            onSave={handleSaveNodeType}
          />
        </div>
      </InputComponentRegistryContext.Provider>
    </ErrorBoundary>
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
  onGraphEvent,
  inputComponents,
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
            onGraphEvent={onGraphEvent}
            inputComponents={inputComponents}
          />
        </RecordContext.Provider>
      </FullGraphContext.Provider>
    </ReactFlowProvider>
  );
}

export { FullGraph };

export { type FullGraphProps };
