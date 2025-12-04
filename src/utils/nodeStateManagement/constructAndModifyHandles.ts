import type {
  DataType,
  State,
  SupportedUnderlyingTypes,
  TypeOfInput,
} from './types';
import type { z } from 'zod';
import type { Nodes, Edges } from '@/components/organisms/FullGraph/types';
import {
  checkComplexTypeCompatibilityAfterEdgeAddition,
  checkTypeConversionCompatibilityAfterEdgeAddition,
  inferTypesAfterEdgeRemoval,
  type ConnectionValidationResult,
} from './newOrRemovedEdgeValidation';
import {
  addEdge,
  applyEdgeChanges,
  getOutgoers,
  type EdgeChange,
} from '@xyflow/react';
import { generateRandomString } from '../randomGeneration';
import type { HandleIndices } from './handles/types';
import { inferTypesAfterEdgeAddition } from './newOrRemovedEdgeValidation';
import type { ConfigurableEdgeState } from '@/components/atoms/ConfigurableEdge/ConfigurableEdge';
import type {
  ConfigurableNodeInput,
  ConfigurableNodeOutput,
} from '@/components/organisms/ConfigurableNode/ConfigurableNode';
import {
  constructInputOrOutputOfType,
  getDirectDependentsOfNodeType,
} from './nodes/constructAndModifyNodes';
import { getHandleFromNodeDataMatchingHandleId } from './handles/handleGetters';
import { insertOrDeleteHandleInNodeDataUsingHandleIndices } from './handles/handleSetters';

/** Length of generated random IDs for edges */
const lengthOfIds = 20;

/**
 * Adds a new edge between two handles with type checking and inference
 *
 * This function validates that a connection is allowed between two handles based on
 * their data types, handles type inference for 'inferFromConnection' types, and
 * validates Zod schema compatibility for complex types.
 *
 * @template DataTypeUniqueId - Unique identifier type for data types
 * @template NodeTypeUniqueId - Unique identifier type for node types
 * @template UnderlyingType - Supported underlying data types
 * @template ComplexSchemaType - Zod schema type for complex data types
 * @param nodes - Array of nodes in the graph
 * @param edges - Array of edges in the graph
 * @param newEdgeSourceNodeId - ID of the source node
 * @param newEdgeSourceHandleId - ID of the source handle
 * @param newEdgeTargetNodeId - ID of the target node
 * @param newEdgeTargetHandleId - ID of the target handle
 * @param state - The current graph state
 * @param allowedConversionsBetweenDataTypes - Optional mapping of allowed conversions
 * @param enableTypeInference - Whether to enable type inference
 * @param enableComplexTypeChecking - Whether to enable complex type checking
 * @returns Object containing updated nodes, edges, and validation result
 */
function addEdgeWithTypeChecking<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  newEdgeSourceNodeId: string,
  newEdgeSourceHandleId: string,
  newEdgeTargetNodeId: string,
  newEdgeTargetHandleId: string,
  state: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  groupInputNodeId: string | undefined,
  groupOutputNodeId: string | undefined,
  unmodifiedState: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
): {
  validation: ConnectionValidationResult;
} {
  const newEdge = {
    id: generateRandomString(lengthOfIds),
    source: newEdgeSourceNodeId,
    target: newEdgeTargetNodeId,
    sourceHandle: newEdgeSourceHandleId,
    targetHandle: newEdgeTargetHandleId,
    type: 'configurableEdge' as const,
  };
  if (addEdge<Edges[number]>(newEdge, state.edges) === state.edges) {
    return {
      validation: {
        isValid: false,
        reason: 'Edge already exists or was rejected by reactflow',
      },
    };
  }
  const isValidationNeeded =
    state.enableTypeInference ||
    state.enableComplexTypeChecking ||
    state.allowedConversionsBetweenDataTypes;
  if (!isValidationNeeded) {
    state.edges.push(newEdge);
    return {
      validation: { isValid: true },
    };
  }

  // Find source and target nodes
  const sourceNodeIndex = state.nodes.findIndex(
    (node) => node.id === newEdgeSourceNodeId,
  );
  const targetNodeIndex = state.nodes.findIndex(
    (node) => node.id === newEdgeTargetNodeId,
  );

  if (sourceNodeIndex === -1 || targetNodeIndex === -1) {
    return {
      validation: {
        isValid: false,
        reason: 'Source or target node not found',
      },
    };
  }

  const sourceNode = state.nodes[sourceNodeIndex];
  const targetNode = state.nodes[targetNodeIndex];

  const sourceHandleIndex = getHandleFromNodeDataMatchingHandleId(
    newEdgeSourceHandleId,
    sourceNode.data,
  )?.handleIndices;
  const targetHandleIndex = getHandleFromNodeDataMatchingHandleId(
    newEdgeTargetHandleId,
    targetNode.data,
  )?.handleIndices;

  if (!sourceHandleIndex || !targetHandleIndex) {
    return {
      validation: {
        isValid: false,
        reason: 'Source or target handle not found',
      },
    };
  }
  let validation = { isValid: true };

  if (state.enableTypeInference) {
    const { validation: validationTemp } = inferTypesAfterEdgeAddition(
      state,
      sourceNodeIndex,
      targetNodeIndex,
      sourceHandleIndex,
      targetHandleIndex,
      newEdge,
      groupInputNodeId,
      groupOutputNodeId,
      unmodifiedState,
    );
    validation = validationTemp;
  }

  if (state.enableComplexTypeChecking && validation.isValid) {
    const { validation: validationTemp } =
      checkComplexTypeCompatibilityAfterEdgeAddition(
        { ...state, nodes: state.nodes },
        sourceNodeIndex,
        targetNodeIndex,
        sourceHandleIndex,
        targetHandleIndex,
        newEdge,
      );
    validation = validationTemp;
  }

  if (state.allowedConversionsBetweenDataTypes && validation.isValid) {
    const { validation: validationTemp } =
      checkTypeConversionCompatibilityAfterEdgeAddition(
        { ...state, nodes: state.nodes },
        sourceNodeIndex,
        targetNodeIndex,
        sourceHandleIndex,
        targetHandleIndex,
        newEdge,
      );
    validation = validationTemp;
  }

  state.edges.push(newEdge);
  return {
    validation,
  };
}

/**
 * Removes an edge between two handles with type checking and inference
 *
 * This function validates that a connection is removed between two handles based on
 * their data types, handles type inference for 'inferFromConnection' types, and
 * validates Zod schema compatibility for complex types.
 *
 * @template DataTypeUniqueId - Unique identifier type for data types
 * @template NodeTypeUniqueId - Unique identifier type for node types
 * @template UnderlyingType - Supported underlying data types
 * @template ComplexSchemaType - Zod schema type for complex data types
 * @param nodes - Array of nodes in the graph
 * @param edges - Array of edges in the graph
 * @param removedEdgeSourceNodeId - ID of the source node
 * @param removedEdgeSourceHandleId - ID of the source handle
 * @param removedEdgeTargetNodeId - ID of the target node
 * @param removedEdgeTargetHandleId - ID of the target handle
 * @param state - The current graph state
 * @param allowedConversionsBetweenDataTypes - Optional mapping of allowed conversions
 * @param enableTypeInference - Whether to enable type inference
 * @param enableComplexTypeChecking - Whether to enable complex type checking
 * @returns Object containing updated nodes, edges, and validation result
 */
function removeEdgeWithTypeChecking<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  removedEdge: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['edges'][number],
  state: Pick<
    State<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    >,
    | 'nodes'
    | 'edges'
    | 'enableTypeInference'
    | 'enableComplexTypeChecking'
    | 'allowedConversionsBetweenDataTypes'
    | 'dataTypes'
    | 'typeOfNodes'
  >,
  removedEdgeChange: EdgeChange<ConfigurableEdgeState>,
): {
  updatedNodes: Nodes<
    UnderlyingType,
    NodeTypeUniqueId,
    ComplexSchemaType,
    DataTypeUniqueId
  >;
  updatedEdges: Edges;
  validation: ConnectionValidationResult;
} {
  if (
    applyEdgeChanges<Edges[number]>([removedEdgeChange], state.edges) ===
    state.edges
  ) {
    return {
      updatedNodes: state.nodes,
      updatedEdges: state.edges,
      validation: {
        isValid: false,
        reason: 'Edge already exists or was rejected by reactflow',
      },
    };
  }
  const isValidationNeeded =
    state.enableTypeInference ||
    state.enableComplexTypeChecking ||
    state.allowedConversionsBetweenDataTypes;
  if (!isValidationNeeded) {
    return {
      updatedNodes: state.nodes,
      updatedEdges: applyEdgeChanges<Edges[number]>(
        [removedEdgeChange],
        state.edges,
      ),
      validation: { isValid: true },
    };
  }

  const sourceNodeIndex = state.nodes.findIndex(
    (node) => node.id === removedEdge.source,
  );
  const targetNodeIndex = state.nodes.findIndex(
    (node) => node.id === removedEdge.target,
  );

  if (sourceNodeIndex === -1 || targetNodeIndex === -1) {
    return {
      updatedNodes: state.nodes,
      updatedEdges: state.edges,
      validation: { isValid: false, reason: 'Source or target node not found' },
    };
  }
  if (!removedEdge.sourceHandle || !removedEdge.targetHandle) {
    return {
      updatedNodes: state.nodes,
      updatedEdges: state.edges,
      validation: {
        isValid: false,
        reason: 'Source or target handle not found',
      },
    };
  }

  const sourceNode = state.nodes[sourceNodeIndex];
  const targetNode = state.nodes[targetNodeIndex];

  const sourceHandleIndex = getHandleFromNodeDataMatchingHandleId(
    removedEdge.sourceHandle,
    sourceNode.data,
  )?.handleIndices;

  const targetHandleIndex = getHandleFromNodeDataMatchingHandleId(
    removedEdge.targetHandle,
    targetNode.data,
  )?.handleIndices;

  if (!sourceHandleIndex || !targetHandleIndex) {
    return {
      updatedNodes: state.nodes,
      updatedEdges: state.edges,
      validation: {
        isValid: false,
        reason: 'Source or target handle not found',
      },
    };
  }

  let updatedNodes = state.nodes;
  let validation = { isValid: true };

  if (state.enableTypeInference) {
    const { updatedNodes: updatedNodesTemp, validation: validationTemp } =
      inferTypesAfterEdgeRemoval(
        state,
        sourceNodeIndex,
        targetNodeIndex,
        sourceHandleIndex,
        targetHandleIndex,
        removedEdge,
      );
    updatedNodes = updatedNodesTemp;
    validation = validationTemp;
  }

  return {
    updatedNodes,
    updatedEdges: applyEdgeChanges<Edges[number]>(
      [removedEdgeChange],
      state.edges,
    ),
    validation,
  };
}

function getResultantDataTypeOfHandleConsideringInferredType<
  DataTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  handle:
    | ConfigurableNodeInput<UnderlyingType, ComplexSchemaType, DataTypeUniqueId>
    | ConfigurableNodeOutput<
        UnderlyingType,
        ComplexSchemaType,
        DataTypeUniqueId
      >
    | undefined,
):
  | {
      dataTypeObject: DataType<UnderlyingType, ComplexSchemaType>;
      dataTypeUniqueId: DataTypeUniqueId;
    }
  | undefined {
  const handleMainDataType = handle?.dataType;
  const handleInferredDataType = handle?.inferredDataType;

  if (!handleMainDataType) {
    return undefined;
  }
  if (
    handleMainDataType.dataTypeObject.underlyingType !== 'inferFromConnection'
  ) {
    return handleMainDataType;
  }
  return handleInferredDataType || undefined;
}

/**
 * Checks if adding an edge will create a cycle in the graph
 *
 * @template DataTypeUniqueId - Unique identifier type for data types
 * @template NodeTypeUniqueId - Unique identifier type for node types
 * @template UnderlyingType - Supported underlying data types
 * @template ComplexSchemaType - Zod schema type for complex data types
 * @param state - The current graph state
 * @param newEdge - The edge to check
 * @returns Whether the edge will create a cycle
 */
function willAddingEdgeCreateCycle<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  state: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  sourceNodeId: string,
  targetNodeId: string,
): boolean {
  //Find target node
  const target = state.nodes.find((node) => node.id === targetNodeId);

  //Cycle cannot be created if target node is not found
  if (!target) return false;

  //Self connection is a cycle
  if (target.id === sourceNodeId) return true;

  //Check if there is a cycle, this is typical DFS traversal to find a cycle
  const hasCycle = (
    node: (typeof state.nodes)[number],
    visited = new Set(),
  ) => {
    //Already visited, ignore
    if (visited.has(node.id)) return false;

    //Mark as visited, lets process it
    visited.add(node.id);

    //For every outgoer of the node, check if it is the source node or if it has a cycle (recursively)
    for (const outgoer of getOutgoers(node, state.nodes, state.edges)) {
      if (outgoer.id === sourceNodeId) return true;
      if (hasCycle(outgoer, visited)) return true;
    }
    //None of the outgoers is the source node and none of them have a cycle, so no cycle (from this node atleast)
    return false;
  };

  return hasCycle(target);
}

function addAnInputOrOutputToAllNodesOfANodeTypeAcrossSubtree<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  allDataTypes: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['dataTypes'],
  subtree: Pick<
    NonNullable<
      State<
        DataTypeUniqueId,
        NodeTypeUniqueId,
        UnderlyingType,
        ComplexSchemaType
      >['typeOfNodes'][NodeTypeUniqueId]['subtree']
    >,
    'nodes' | 'edges'
  >,
  nodeType: NodeTypeUniqueId,
  typeOfInputOrOutput: TypeOfInput<DataTypeUniqueId>,
  addAtIndex: HandleIndices,
  beforeOrAfterIndex: 'before' | 'after',
): Pick<
  NonNullable<
    State<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    >['typeOfNodes'][NodeTypeUniqueId]['subtree']
  >,
  'nodes' | 'edges'
> {
  const newNodes: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['nodes'] = [];
  const newEdges: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['edges'] = [];

  for (const currentNode of subtree.nodes) {
    if (currentNode.data.nodeTypeUniqueId !== nodeType) {
      newNodes.push(currentNode);
      continue;
    }
    insertOrDeleteHandleInNodeDataUsingHandleIndices<
      UnderlyingType,
      NodeTypeUniqueId,
      ComplexSchemaType,
      DataTypeUniqueId
    >(
      currentNode.data,
      addAtIndex,
      0,
      constructInputOrOutputOfType<
        DataTypeUniqueId,
        NodeTypeUniqueId,
        UnderlyingType,
        ComplexSchemaType
      >(typeOfInputOrOutput, allDataTypes),
      undefined,
      beforeOrAfterIndex,
    );
    newNodes.push(currentNode);
  }

  for (const currentEdge of subtree.edges) {
    newEdges.push(currentEdge);
  }

  return {
    ...subtree,
    nodes: newNodes,
    edges: newEdges,
  };
}

function addAnInputOrOutputToAllNodesOfANodeTypeAcrossStateIncludingSubtrees<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  state: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  nodeType: NodeTypeUniqueId,
  typeOfInputOrOutput: TypeOfInput<DataTypeUniqueId>,
  addAtIndex: HandleIndices,
  beforeOrAfterIndex: 'before' | 'after' = 'before',
): Pick<
  State<DataTypeUniqueId, NodeTypeUniqueId, UnderlyingType, ComplexSchemaType>,
  'typeOfNodes' | 'nodes' | 'edges'
> {
  const nodeTypeData = state.typeOfNodes[nodeType];
  if (!nodeTypeData) {
    return state;
  }

  //Modify the node type itself
  insertOrDeleteHandleInNodeDataUsingHandleIndices<
    UnderlyingType,
    NodeTypeUniqueId,
    ComplexSchemaType,
    DataTypeUniqueId
  >(
    nodeTypeData,
    addAtIndex,
    0,
    typeOfInputOrOutput,
    undefined,
    beforeOrAfterIndex,
  );

  //Change all direct dependents (recursive ones don't store it)
  const dependents = getDirectDependentsOfNodeType(state, nodeType);
  for (const dependent of dependents) {
    const dependentNodeTypeData = state.typeOfNodes[dependent];
    if (!dependentNodeTypeData) {
      continue;
    }
    if (!dependentNodeTypeData.subtree) {
      continue;
    }
    state.typeOfNodes[dependent] = {
      ...dependentNodeTypeData,
      //Merge changes to inputs and outputs into the dependent node type's subtree
      subtree: {
        ...dependentNodeTypeData.subtree,
        ...addAnInputOrOutputToAllNodesOfANodeTypeAcrossSubtree(
          state.dataTypes,
          dependentNodeTypeData.subtree,
          nodeType,
          typeOfInputOrOutput,
          addAtIndex,
          beforeOrAfterIndex,
        ),
      },
    };
  }

  //Merge changes to inputs and outputs into root nodes and edges
  const { nodes: updatedNodes, edges: updatedEdges } =
    addAnInputOrOutputToAllNodesOfANodeTypeAcrossSubtree(
      state.dataTypes,
      {
        nodes: state.nodes,
        edges: state.edges,
      },
      nodeType,
      typeOfInputOrOutput,
      addAtIndex,
      beforeOrAfterIndex,
    );
  return {
    typeOfNodes: state.typeOfNodes,
    nodes: updatedNodes,
    edges: updatedEdges,
  };
}

export {
  addEdgeWithTypeChecking,
  removeEdgeWithTypeChecking,
  getResultantDataTypeOfHandleConsideringInferredType,
  willAddingEdgeCreateCycle,
  addAnInputOrOutputToAllNodesOfANodeTypeAcrossStateIncludingSubtrees,
};
