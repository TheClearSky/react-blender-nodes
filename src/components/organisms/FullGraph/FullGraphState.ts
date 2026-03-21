import { createContext, useReducer } from 'react';
import type { FullGraphProps } from './FullGraph';
import {
  mainReducer,
  type State,
  type SupportedUnderlyingTypes,
} from '@/utils';
import type z from 'zod';
import type { NodeVisualState, GraphError } from '@/utils/nodeRunner/types';

/**
 * Per-node runner state provided via context so the ReactFlow wrapper
 * can apply visual indicators without prop drilling.
 */
type NodeRunnerState = {
  visualState: NodeVisualState;
  errors?: ReadonlyArray<GraphError>;
  warnings?: ReadonlyArray<string>;
};

const FullGraphContext = createContext<{
  allProps: FullGraphProps;
  /** Optional map of nodeId -> runner visual state. Provided by useNodeRunner. */
  nodeRunnerStates?: ReadonlyMap<string, NodeRunnerState>;
}>(null!); //the not-null assertion (null!) is because-
// we are creating a context that is always provided (right below)

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
) {
  const [state, dispatch] = useReducer(
    mainReducer<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    >,
    initialState,
  );

  return { state, dispatch };
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
function createContextValue(
  props: { state: unknown; dispatch: unknown },
  nodeRunnerStates?: ReadonlyMap<string, NodeRunnerState>,
): React.ContextType<typeof FullGraphContext> {
  // The caller passes concrete State<D,N,U,C> + dispatch; we erase the
  // generics to match the context's default-param FullGraphProps type.
  // This is safe per the justification above.
  const allProps = props as unknown as FullGraphProps;
  return { allProps, nodeRunnerStates };
}

export { FullGraphContext, useFullGraph, createContextValue };

export type { NodeRunnerState };
