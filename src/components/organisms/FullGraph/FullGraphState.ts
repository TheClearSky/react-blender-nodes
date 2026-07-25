import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
} from 'react';
import type { FullGraphProps } from './FullGraph';
import { type State, type SupportedUnderlyingTypes } from '@/utils';
import type z from 'zod';
import type {
  NodeVisualState,
  GraphError,
  ExecutionRecord,
  ExecutionStepRecord,
} from '@/utils/nodeRunner/types';
import type { NodePreviewValueEntry } from '@/utils/nodeRunner/computeNodePreviewValues';
import type { GraphEvent } from '@/utils/nodeStateManagement/graphEvent';
import { createGraphStore, type GraphStore } from './graphStore';

/**
 * Per-node runner state provided via context so the ReactFlow wrapper
 * can apply visual indicators without prop drilling.
 */
type NodeRunnerState = {
  visualState: NodeVisualState;
  errors?: ReadonlyArray<GraphError>;
  warnings?: ReadonlyArray<string>;
};

/**
 * The runtime context value deliberately carries ONLY the state slices that
 * internal node components read (R1: stable identity across unrelated
 * dispatches), so the type promises exactly that instead of a full
 * FullGraphProps whose other state fields would be `undefined` at runtime.
 */
type FullGraphContextValue = {
  allProps: {
    state: Pick<FullGraphProps['state'], 'typeOfNodes' | 'enableDebugMode'>;
    dispatch: FullGraphProps['dispatch'];
    /** True when the canvas is showing the ROOT graph (no node group opened).
     *  Root groupInput/groupOutput nodes are the graph's I/O boundary and get
     *  an edit button; the same node types INSIDE a group are edited via the
     *  group's node-type editor instead. */
    isAtRootScope: boolean;
  };
};

const FullGraphContext = createContext<FullGraphContextValue>(null!); //the not-null assertion (null!) is because-
// we are creating a context that is always provided (right below)

// ─────────────────────────────────────────────────────
// RunnerContext — runner visual state (provided by RunnerOverlay)
// ─────────────────────────────────────────────────────

type RunnerContextValue = {
  nodeRunnerStates: ReadonlyMap<string, NodeRunnerState>;
  selectedStepRecord: ExecutionStepRecord | null;
  edgeValuesAnimated: boolean;
  /**
   * Per-node runner values for the preview panels (`nodePreviews`). `live` = the
   * node's latest computed step; `atStep` = its step at/≤ the current timeline
   * position. Two distinct "nothing" states: the field is ABSENT ⇔ there is no
   * `RunnerOverlay` (no runner at all); it is present but an EMPTY map ⇔ a runner
   * exists yet there is no registry or no record. Under `RunnerOverlay` it is
   * ALWAYS supplied (empty when idle), so every reader still uses `?.`.
   */
  nodePreviewValues?: ReadonlyMap<string, NodePreviewValueEntry>;
};

const RunnerContext = createContext<RunnerContextValue | undefined>(undefined);

// ─────────────────────────────────────────────────────
// RecordContext — controlled execution record state
// ─────────────────────────────────────────────────────

type RecordContextValue = {
  /**
   * Tri-state, mirroring `useNodeRunner`'s controlled/uncontrolled contract:
   * - `undefined` — the consumer did NOT pass `executionRecord` to
   *   `<FullGraph>`: the runner is UNCONTROLLED and owns its record
   *   internally. (Coalescing this to `null` used to make the runner
   *   "controlled with a noop sink", silently discarding every record.)
   * - `null` — controlled, currently empty.
   * - a record — controlled, loaded.
   */
  executionRecord: ExecutionRecord | null | undefined;
  setExecutionRecord: (record: ExecutionRecord | null) => void;
};

const RecordContext = createContext<RecordContextValue>({
  executionRecord: undefined,
  setExecutionRecord: () => {},
});

function useRecordContext(): RecordContextValue {
  return useContext(RecordContext);
}

/**
 * Custom hook for managing the full graph state with reducer
 *
 * This hook provides state management for the entire graph including nodes, edges,
 * data types, and node type definitions. It uses a reducer pattern for predictable
 * state updates.
 *
 * @template DataTypeUniqueId - Unique identifier type for data types
 * @template NodeTypeUniqueId - Unique identifier type for node types
 * @template UnderlyingType - Supported underlying data types ('string' | 'number' | 'complex')
 * @template ComplexSchemaType - Zod schema type for complex data types
 * @param initialState - The initial state of the graph
 * @returns Object containing the current state and dispatch function
 *
 * @example
 * ```tsx
 * import {
 *   useFullGraph,
 *   makeStateWithAutoInfer,
 *   makeTypeOfNodeWithAutoInfer,
 *   makeDataTypeWithAutoInfer
 * } from 'react-blender-nodes';
 *
 * // Define data types with auto-infer for type safety
 * const dataTypes = {
 *   stringType: makeDataTypeWithAutoInfer({
 *     name: 'String',
 *     underlyingType: 'string',
 *     color: '#4A90E2',
 *   }),
 *   numberType: makeDataTypeWithAutoInfer({
 *     name: 'Number',
 *     underlyingType: 'number',
 *     color: '#E74C3C',
 *   }),
 * };
 *
 * // Define node types with auto-infer for type safety
 * const typeOfNodes = {
 *   inputNode: makeTypeOfNodeWithAutoInfer({
 *     name: 'Input Node',
 *     headerColor: '#C44536',
 *     inputs: [
 *       { name: 'Input', dataType: 'stringType', allowInput: true }
 *     ],
 *     outputs: [
 *       { name: 'Output', dataType: 'stringType' }
 *     ],
 *   }),
 * };
 *
 * // Create state with auto-infer for complete type safety
 * const initialState = makeStateWithAutoInfer({
 *   dataTypes,
 *   typeOfNodes,
 *   nodes: [],
 *   edges: [],
 * });
 *
 * const { state, dispatch } = useFullGraph(initialState);
 *
 * // Add a new node (type-safe!)
 * dispatch({
 *   type: actionTypesMap.ADD_NODE,
 *   payload: { type: 'inputNode', position: { x: 100, y: 100 } },
 * });
 * ```
 */
/**
 * Optional configuration for `useFullGraph`.
 *
 * Currently the only field is `onGraphEvent` — a unified observability
 * channel for the entire reducer + commit lifecycle. See
 * `src/utils/nodeStateManagement/graphEvent.ts` for the event taxonomy.
 *
 * The handler is captured via a ref so identity changes don't recreate
 * `dispatch`. Pass an inline function freely.
 */
type UseFullGraphOptions<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
> = {
  /**
   * Fires for every dispatched action (`action:applied`/`action:rejected`)
   * and every render commit (`state:committed`). Combine with
   * `<FullGraph>`'s `onGraphEvent` to also receive UI-only events.
   */
  onGraphEvent?: (
    event: GraphEvent<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    >,
  ) => void;
};

function useFullGraph<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  initialState: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  options?: UseFullGraphOptions<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  // Explicit return type: without it, declaration emit synthesizes a module
  // specifier for the inferred Action type that escapes the rolled-up
  // dist/index.d.ts as an unresolvable relative import (consumer `dispatch`
  // silently degrades to `any`). Guarded by scripts/check-dist-types.ts.
): {
  state: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >;
  dispatch: GraphStore<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['dispatch'];
} {
  // Latest-value ref for the consumer's onGraphEvent callback. The store
  // closes over a getter (not the value) so identity changes from
  // render-to-render don't force store recreation.
  const onGraphEventRef = useRef<
    UseFullGraphOptions<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    >['onGraphEvent']
  >(options?.onGraphEvent);
  onGraphEventRef.current = options?.onGraphEvent;

  // Create the external store EXACTLY ONCE per hook instance. `useRef`
  // with lazy init is the pattern React docs prescribe for this case;
  // initialState is captured at first render (same behavior as
  // `useReducer(mainReducer, initialState)` had — initialState changes
  // after first render are ignored, which is the documented contract).
  const storeRef = useRef<GraphStore<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  > | null>(null);
  if (storeRef.current === null) {
    storeRef.current = createGraphStore<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    >(initialState, () => onGraphEventRef.current);
  }
  const store = storeRef.current;

  // React subscribes to the external store. This is React 18's official
  // primitive for non-React state — concurrent-rendering safe, batch-
  // friendly, tear-resistant. Same hook React-Redux v8+ uses internally.
  // Third arg is the SSR snapshot fallback (we just return the same
  // state — it's serializable).
  const state = useSyncExternalStore(
    store.subscribe,
    store.getState,
    store.getState,
  );

  // Render-commit barrier — fires after React commits any change to the
  // node or edge counts. This is the canonical signal that the new
  // nodes' React fibers (handles, listeners) are fully attached. It
  // CANNOT be moved into the store's dispatch because dispatch runs
  // before React commits to the DOM.
  useEffect(() => {
    onGraphEventRef.current?.({
      kind: 'state:committed',
      nodeCount: state.nodes.length,
      edgeCount: state.edges.length,
    });
  }, [state.nodes.length, state.edges.length]);

  return { state, dispatch: store.dispatch };
}

/**
 * Create a type-safe context value from concrete generic params.
 *
 * This is the single centralized point where generic variance on dispatch
 * is bridged. React's createContext doesn't support generic type parameters,
 * so providing a concrete FullGraphProps<'andGate', ...> to a context typed
 * as FullGraphProps<string, ...> requires a variance bridge.
 *
 * Safety justification: context consumers dispatch actions using
 * actionTypesMap constants which produce valid payloads regardless of
 * the concrete generic params. The contravariance on dispatch is safe
 * because all consumer dispatches originate from user interactions
 * (right-click menu, group selector) that use the correct node type IDs.
 */
function createContextValue(props: {
  typeOfNodes: unknown;
  enableDebugMode: unknown;
  dispatch: unknown;
  isAtRootScope: boolean;
}): React.ContextType<typeof FullGraphContext> {
  // R1: expose only the slices actually read through this context so the value
  // keeps a stable identity across unrelated dispatches — a fresh value here
  // re-renders every node on the canvas. Callers MUST memoize on these slices.
  const allProps = {
    state: {
      typeOfNodes: props.typeOfNodes,
      enableDebugMode: props.enableDebugMode,
    },
    dispatch: props.dispatch,
    isAtRootScope: props.isAtRootScope,
  } as unknown as FullGraphContextValue['allProps'];
  return { allProps };
}

export {
  FullGraphContext,
  RunnerContext,
  useFullGraph,
  createContextValue,
  RecordContext,
  useRecordContext,
};

export type {
  NodeRunnerState,
  RunnerContextValue,
  UseFullGraphOptions,
  FullGraphContextValue,
};
