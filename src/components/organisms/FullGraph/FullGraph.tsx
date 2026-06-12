import {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
  type ActionDispatch,
} from 'react';
import { z } from 'zod';
import { ZoneFrameOverlay } from '@/components/molecules/ZoneFrameOverlay';
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
import { cn, getCurrentNodesAndEdgesFromState } from '@/utils';
import {
  FullGraphContext,
  RecordContext,
  createContextValue,
} from './FullGraphState';
import { RecordingViewStateProvider } from './RecordingViewStateProvider';
import { useGraphTheme } from './GraphThemeContext';
import { nodeTypes, edgeTypes } from './FullGraphCustomNodesAndEdges';
import type {
  FunctionImplementations,
  ExecutionRecord,
} from '@/utils/nodeRunner/types';
import { RunnerOverlay } from './RunnerOverlay';
import { canRemoveStructuredNodesAndEdges } from '@/utils/nodeStateManagement/nodes/loops';
import { standardNodeTypeNamesMap } from '@/utils/nodeStateManagement/standardNodes';
import { hasKey } from '@/utils/nodeRunner/groupCompiler';
import { useGraphImportExport } from './useGraphImportExport';
import { ErrorBoundary } from '@/components/atoms/ErrorBoundary';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import type { GraphEvent } from '@/utils/nodeStateManagement/graphEvent';
import {
  InputComponentRegistryContext,
  type InputComponentRegistry,
} from './InputComponentRegistryContext';
import {
  NodeTypeEditDrawer,
  type SaveUpdates,
} from '@/components/molecules/NodeTypeEditDrawer/NodeTypeEditDrawer';
import {
  computeHandleBlastRadius,
  getConnectionNeighborhood,
  getConnectionScopeGraph,
  type HandleDeletionTarget,
} from '@/utils/nodeStateManagement/handles/handleDeletionAnalysis';
import {
  computeChannelBlastRadius,
  loopChannelToRequest,
  switchChannelToRequest,
} from '@/utils/nodeStateManagement/handles/channelDeletionAnalysis';
import { getCurrentScope } from '@/utils/nodeStateManagement/nodeCountHelpers';
import { LoopEditDrawer } from '@/components/molecules/LoopEditDrawer';
import type { LoopHandleLevel } from '@/components/molecules/LoopEditDrawer';
import { getLoopStructureFromNode } from '@/utils/nodeStateManagement/nodes/loops/loopStructure';
import { getSwitchStructureFromNode } from '@/utils/nodeStateManagement/nodes/switches/switchStructure';
import { SwitchEditDrawer } from '@/components/molecules/SwitchEditDrawer';
import type { SwitchHandleLevel } from '@/components/molecules/SwitchEditDrawer';
import { createLoopMenuItem } from '@/components/molecules/ContextMenu/createLoopMenuItem';
import { createSwitchMenuItem } from '@/components/molecules/ContextMenu/createSwitchMenuItem';

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
  /**
   * Whether the component should listen for Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y
   * keyboard shortcuts for undo/redo. Defaults to `true`.
   */
  enableUndoRedoShortcuts?: boolean;
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
  enableUndoRedoShortcuts = true,
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
  const theme = useGraphTheme();

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

  const editDrawerNodeTypeId =
    state.activeDrawer?.type === 'editNodeType'
      ? state.activeDrawer.nodeTypeId
      : null;

  const editDrawerNodeType = editDrawerNodeTypeId
    ? // ActiveDrawer is non-generic, so its nodeTypeId is `string`; re-assert the brand to index typeOfNodes.
      state.typeOfNodes[editDrawerNodeTypeId as NodeTypeUniqueId]
    : null;

  const editLoopNodeId =
    state.activeDrawer?.type === 'editLoop' ? state.activeDrawer.nodeId : null;

  const editSwitchNodeId =
    state.activeDrawer?.type === 'editSwitch'
      ? state.activeDrawer.nodeId
      : null;

  const editLoopTriplet = useMemo(() => {
    if (!editLoopNodeId) return null;
    const currentView = getCurrentNodesAndEdgesFromState(state);
    const node = currentView.nodes.find((n) => n.id === editLoopNodeId);
    if (!node) return null;
    const structure = getLoopStructureFromNode(
      { ...state, nodes: currentView.nodes, edges: currentView.edges },
      node,
    );
    if (!structure) return null;
    return {
      loopStartId: structure.loopStart.id,
      loopStopId: structure.loopStop.id,
      loopEndId: structure.loopEnd.id,
      loopStartData: structure.loopStart.data,
      loopStopData: structure.loopStop.data,
      loopEndData: structure.loopEnd.data,
    };
  }, [editLoopNodeId, state]);

  const { screenToFlowPosition, fitView, getNodes } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();

  // The scope (root, or the open group's subtree) that the loop/switch being
  // edited lives in — used to resolve breaking connections and the mini-map.
  const currentScope = useMemo(() => {
    const typeId = getCurrentScope(state);
    return {
      scopeId: typeId ?? 'root',
      scopeLabel: typeId
        ? `Inside group "${state.typeOfNodes[typeId].name}"`
        : 'Root graph',
    };
  }, [state]);

  const handleSaveLoop = useCallback(
    (keptLevels: LoopHandleLevel[], deletedLevels: LoopHandleLevel[]) => {
      if (!editLoopTriplet) return;
      const nodeIds = {
        loopStartNodeId: editLoopTriplet.loopStartId,
        loopStopNodeId: editLoopTriplet.loopStopId,
        loopEndNodeId: editLoopTriplet.loopEndId,
      };
      const updateLoop = () =>
        dispatch({
          type: actionTypesMap.UPDATE_LOOP,
          payload: {
            ...nodeIds,
            levels: keptLevels.map((l) => ({ handles: l.handles })),
          },
        });
      if (deletedLevels.length > 0) {
        // Deletion (cascading edges) + the residual reorder/rename as a single
        // undoable step. DELETE runs first so UPDATE reorders only survivors.
        dispatch({ type: actionTypesMap.BEGIN_BATCH });
        dispatch({
          type: actionTypesMap.DELETE_LOOP_CHANNELS,
          payload: {
            ...nodeIds,
            channels: deletedLevels.map((l) => ({
              dataTypeUniqueId: l.dataTypeUniqueId,
              handles: l.handles,
            })),
          },
        });
        updateLoop();
        dispatch({ type: actionTypesMap.END_BATCH });
      } else {
        updateLoop();
      }
      requestAnimationFrame(() => {
        updateNodeInternals([
          editLoopTriplet.loopStartId,
          editLoopTriplet.loopStopId,
          editLoopTriplet.loopEndId,
        ]);
      });
    },
    [editLoopTriplet, dispatch, updateNodeInternals],
  );

  const getLoopChannelBlastRadius = useCallback(
    (level: LoopHandleLevel) => {
      const ids = editLoopTriplet
        ? {
            loopStartId: editLoopTriplet.loopStartId,
            loopStopId: editLoopTriplet.loopStopId,
            loopEndId: editLoopTriplet.loopEndId,
          }
        : { loopStartId: '', loopStopId: '', loopEndId: '' };
      return computeChannelBlastRadius(
        state,
        loopChannelToRequest(
          currentScope.scopeId,
          currentScope.scopeLabel,
          ids,
          {
            handles: level.handles,
            dataTypeUniqueId: level.dataTypeUniqueId,
          },
        ),
      );
    },
    [state, editLoopTriplet, currentScope],
  );

  const editSwitchPair = useMemo(() => {
    if (!editSwitchNodeId) return null;
    const currentView = getCurrentNodesAndEdgesFromState(state);
    const node = currentView.nodes.find((n) => n.id === editSwitchNodeId);
    if (!node) return null;
    const structure = getSwitchStructureFromNode(
      { ...state, nodes: currentView.nodes, edges: currentView.edges },
      node,
    );
    if (!structure) return null;
    return {
      switchStartId: structure.switchStart.id,
      switchEndId: structure.switchEnd.id,
      switchStartData: structure.switchStart.data,
      switchEndData: structure.switchEnd.data,
    };
  }, [editSwitchNodeId, state]);

  const handleSaveSwitch = useCallback(
    (keptLevels: SwitchHandleLevel[], deletedLevels: SwitchHandleLevel[]) => {
      if (!editSwitchPair) return;
      const nodeIds = {
        switchStartNodeId: editSwitchPair.switchStartId,
        switchEndNodeId: editSwitchPair.switchEndId,
      };
      const updateSwitch = () =>
        dispatch({
          type: actionTypesMap.UPDATE_SWITCH,
          payload: {
            ...nodeIds,
            levels: keptLevels.map((l) => ({ handles: l.handles })),
          },
        });
      if (deletedLevels.length > 0) {
        // Deletion (cascading edges in both branches) + the residual reorder/
        // rename as a single undoable step. DELETE first, UPDATE over survivors.
        dispatch({ type: actionTypesMap.BEGIN_BATCH });
        dispatch({
          type: actionTypesMap.DELETE_SWITCH_CHANNELS,
          payload: {
            ...nodeIds,
            channels: deletedLevels.map((l) => ({
              dataTypeUniqueId: l.dataTypeUniqueId,
              handles: l.handles,
            })),
          },
        });
        updateSwitch();
        dispatch({ type: actionTypesMap.END_BATCH });
      } else {
        updateSwitch();
      }
      requestAnimationFrame(() => {
        updateNodeInternals([
          editSwitchPair.switchStartId,
          editSwitchPair.switchEndId,
        ]);
      });
    },
    [editSwitchPair, dispatch, updateNodeInternals],
  );

  const getSwitchChannelBlastRadius = useCallback(
    (level: SwitchHandleLevel) => {
      const ids = editSwitchPair
        ? {
            switchStartId: editSwitchPair.switchStartId,
            switchEndId: editSwitchPair.switchEndId,
          }
        : { switchStartId: '', switchEndId: '' };
      return computeChannelBlastRadius(
        state,
        switchChannelToRequest(
          currentScope.scopeId,
          currentScope.scopeLabel,
          ids,
          { handles: level.handles, dataTypeUniqueId: level.dataTypeUniqueId },
        ),
      );
    },
    [state, editSwitchPair, currentScope],
  );

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

  const handleSaveNodeType = useCallback(
    (nodeTypeId: string, updates: SaveUpdates) => {
      // The drawer is generic-agnostic: it hands back plain `string` ids and
      // default-`D` TypeOfInput/HandleDeletionTarget. Re-assert FullGraph's
      // brands (NodeTypeUniqueId / DataTypeUniqueId) at this dispatch boundary.
      const typeId = nodeTypeId as NodeTypeUniqueId;
      const { deletions, ...typeUpdates } = updates;
      const hasTypeUpdates = Object.keys(typeUpdates).length > 0;
      const hasDeletions = !!deletions && deletions.length > 0;

      const dispatchTypeUpdate = () =>
        dispatch({
          type: actionTypesMap.UPDATE_NODE_TYPE,
          payload: {
            nodeTypeId: typeId,
            updates: typeUpdates as {
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

      if (hasDeletions) {
        // Apply the handle deletion (cascading edges) and the residual reorder
        // as a single undoable step. DELETE runs first so the subsequent
        // UPDATE_NODE_TYPE validates against the already-shrunk type.
        dispatch({ type: actionTypesMap.BEGIN_BATCH });
        dispatch({
          type: actionTypesMap.DELETE_NODE_TYPE_HANDLES,
          payload: {
            nodeTypeId: typeId,
            deletions: deletions as {
              direction: 'input' | 'output';
              handleName: string;
              handleDataTypeId: DataTypeUniqueId;
            }[],
          },
        });
        if (hasTypeUpdates) dispatchTypeUpdate();
        dispatch({ type: actionTypesMap.END_BATCH });
      } else if (hasTypeUpdates) {
        dispatchTypeUpdate();
      }

      if (
        hasDeletions ||
        updates.inputs !== undefined ||
        updates.outputs !== undefined
      ) {
        requestAnimationFrame(() => {
          const affectedNodeIds = getNodes()
            .filter((node) => {
              const typeId = node.data?.nodeTypeUniqueId;
              return (
                typeId === nodeTypeId ||
                typeId === standardNodeTypeNamesMap.groupInput ||
                typeId === standardNodeTypeNamesMap.groupOutput
              );
            })
            .map((node) => node.id);
          if (affectedNodeIds.length > 0) {
            updateNodeInternals(affectedNodeIds);
          }
        });
      }
    },
    [dispatch, getNodes, updateNodeInternals],
  );

  const getHandleBlastRadiusForType = useCallback(
    // nodeTypeId arrives as a plain `string` from the drawer; re-assert the brand.
    (nodeTypeId: string, target: HandleDeletionTarget) =>
      computeHandleBlastRadius(state, nodeTypeId as NodeTypeUniqueId, target),
    [state],
  );

  const getConnectionNeighborhoodForScope = useCallback(
    (
      scopeId: string,
      edgeId: string,
      mode: 'neighbourhood' | 'tree' = 'neighbourhood',
    ) =>
      mode === 'tree'
        ? getConnectionScopeGraph(state, scopeId, edgeId)
        : getConnectionNeighborhood(state, scopeId, edgeId),
    [state],
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
      ...createSwitchMenuItem({
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

  // ── Drag batching ──
  const isDraggingRef = useRef(false);

  // ── Undo/redo keyboard shortcuts ──
  useEffect(() => {
    if (enableUndoRedoShortcuts === false) return;

    function handleKeyDown(event: KeyboardEvent) {
      const modifier = event.metaKey || event.ctrlKey;
      if (!modifier) return;

      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        dispatch({ type: actionTypesMap.UNDO });
      } else if ((key === 'z' && event.shiftKey) || key === 'y') {
        event.preventDefault();
        dispatch({ type: actionTypesMap.REDO });
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [enableUndoRedoShortcuts, dispatch]);

  // ── Graph content (shared between runner and non-runner modes) ──
  const graphContent = (
    <>
      <ReactFlow
        key={reactFlowKey}
        nodes={currentNodesAndEdges.nodes}
        edges={currentNodesAndEdges.edges}
        onNodesChange={(changes) => {
          const hasDragStart = changes.some(
            (c) =>
              c.type === 'position' && 'dragging' in c && c.dragging === true,
          );
          const hasDragEnd = changes.some(
            (c) =>
              c.type === 'position' && 'dragging' in c && c.dragging === false,
          );

          if (hasDragStart && !isDraggingRef.current) {
            isDraggingRef.current = true;
            dispatch({ type: actionTypesMap.BEGIN_BATCH });
          }

          dispatch({
            type: actionTypesMap.UPDATE_NODE_BY_REACT_FLOW,
            payload: { changes },
          });

          if (hasDragEnd && isDraggingRef.current) {
            isDraggingRef.current = false;
            dispatch({ type: actionTypesMap.END_BATCH });
          }
        }}
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
        colorMode={theme?.reactFlow?.colorMode ?? 'dark'}
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
          const validation = canRemoveStructuredNodesAndEdges(
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
          // S3: bracket the whole delete in one batch so a single undo restores
          // the node AND its edges together. ReactFlow applies a connected-node
          // delete as a separate edge-remove and node-remove (two undoable
          // entries); the batch (closed in onDelete) collapses them into one.
          if (success) dispatch({ type: actionTypesMap.BEGIN_BATCH });
          return success;
        }}
        onDelete={() => dispatch({ type: actionTypesMap.END_BATCH })}
      >
        <Controls className={theme?.reactFlow?.controls?.className} />
        <Background {...theme?.reactFlow?.background} />
        <ZoneFrameOverlay
          zones={currentNodesAndEdges.zones}
          nodes={currentNodesAndEdges.nodes}
        />
        <MiniMap pannable {...theme?.reactFlow?.miniMap} />
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
        onEditNodeType={(nodeTypeId: string) =>
          dispatch({
            type: actionTypesMap.OPEN_DRAWER,
            payload: { activeDrawer: { type: 'editNodeType', nodeTypeId } },
          })
        }
      />
    </>
  );

  return (
    <ErrorBoundary
      fallback={({ error, reset }) => (
        <div
          data-slot='error-boundary-graph'
          className={cn(
            'flex h-full w-full flex-col items-center justify-center gap-3 bg-zinc-900 text-zinc-300',
            theme?.errorBoundary?.container,
          )}
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
            className={cn(
              'mt-2 inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-700',
              theme?.errorBoundary?.retryButton,
            )}
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
          className={cn('relative', theme?.root)}
        >
          {functionImplementations ? (
            <RecordingViewStateProvider>
              <ErrorBoundary
                fallback={({ error, reset }) => (
                  <div
                    data-slot='error-boundary-runner'
                    className={cn(
                      'flex h-full w-full flex-col items-center justify-center gap-3 rounded-md border border-red-500/50 bg-zinc-900 p-6 text-zinc-300',
                      theme?.errorBoundary?.container,
                    )}
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
                      className={cn(
                        'mt-2 inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-700',
                        theme?.errorBoundary?.retryButton,
                      )}
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
            onClose={() => dispatch({ type: actionTypesMap.CLOSE_DRAWER })}
            nodeTypeId={editDrawerNodeTypeId}
            nodeTypeName={editDrawerNodeType?.name ?? null}
            nodeTypeHeaderColor={editDrawerNodeType?.headerColor ?? null}
            nodeTypeInputs={editDrawerNodeType?.inputs ?? null}
            nodeTypeOutputs={editDrawerNodeType?.outputs ?? null}
            onSave={handleSaveNodeType}
            getHandleBlastRadius={getHandleBlastRadiusForType}
            getNeighborhood={getConnectionNeighborhoodForScope}
          />

          <LoopEditDrawer
            isOpen={editLoopNodeId !== null}
            onClose={() => dispatch({ type: actionTypesMap.CLOSE_DRAWER })}
            loopStartNodeData={editLoopTriplet?.loopStartData ?? null}
            loopStopNodeData={editLoopTriplet?.loopStopData ?? null}
            loopEndNodeData={editLoopTriplet?.loopEndData ?? null}
            onSave={handleSaveLoop}
            getChannelBlastRadius={getLoopChannelBlastRadius}
            getNeighborhood={getConnectionNeighborhoodForScope}
          />

          <SwitchEditDrawer
            isOpen={editSwitchNodeId !== null}
            onClose={() => dispatch({ type: actionTypesMap.CLOSE_DRAWER })}
            switchStartNodeData={editSwitchPair?.switchStartData ?? null}
            switchEndNodeData={editSwitchPair?.switchEndData ?? null}
            onSave={handleSaveSwitch}
            getChannelBlastRadius={getSwitchChannelBlastRadius}
            getNeighborhood={getConnectionNeighborhoodForScope}
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
  enableUndoRedoShortcuts,
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

  // R1: memoize the context value on only the slices consumers read. immer keeps
  // identity for untouched slices, so this stays stable across drags / viewport /
  // unrelated dispatches, and nodes stop re-rendering on every state change.
  const fullGraphContextValue = useMemo(
    () =>
      createContextValue({
        typeOfNodes: state.typeOfNodes,
        enableDebugMode: state.enableDebugMode,
        dispatch,
      }),
    [state.typeOfNodes, state.enableDebugMode, dispatch],
  );

  return (
    <ReactFlowProvider>
      <FullGraphContext.Provider value={fullGraphContextValue}>
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
            enableUndoRedoShortcuts={enableUndoRedoShortcuts}
          />
        </RecordContext.Provider>
      </FullGraphContext.Provider>
    </ReactFlowProvider>
  );
}

export { FullGraph };

export { type FullGraphProps };
