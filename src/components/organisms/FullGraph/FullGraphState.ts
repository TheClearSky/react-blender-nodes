import { createContext, useReducer } from 'react';
import type { FullGraphProps } from './FullGraph';
import {
  mainReducer,
  type State,
  type SupportedUnderlyingTypes,
} from '@/utils';
import type z from 'zod';

const FullGraphContext = createContext<{
  allProps: FullGraphProps;
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

export { FullGraphContext, useFullGraph };
