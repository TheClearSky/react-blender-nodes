import { z } from 'zod';
import {
  type State,
  type SupportedUnderlyingTypes,
  type TypeOfNode,
  type TypeOfInput,
} from '../types';
import { Position, type XYPosition } from '@xyflow/react';
import { generateRandomString } from '../../randomGeneration';
import type {
  ConfigurableNodeInput,
  ConfigurableNodeInputPanel,
  ConfigurableNodeOutput,
} from '@/components/organisms/ConfigurableNode/ConfigurableNode';
import type { HandleIndices } from '../handles/types';

const lengthOfIds = 20;

/**
 * Constructs a ConfigurableNodeInput or ConfigurableNodeOutput from a type definition
 *
 * This function creates the appropriate input or output instance based on the data type's
 * underlying type (string or number). It generates a unique ID and applies the correct
 * configuration including handle color and input allowance.
 *
 * @template DataTypeUniqueId - Unique identifier type for data types
 * @template NodeTypeUniqueId - Unique identifier type for node types
 * @template UnderlyingType - Supported underlying data types ('string' | 'number' | 'complex')
 * @template ComplexSchemaType - Zod schema type for complex data types
 * @param typeOfDataType - The type definition for the input or output
 * @param dataTypes - Map of data type definitions
 * @returns Constructed input or output instance
 *
 * @example
 * ```tsx
 * import {
 *   constructInputOrOutputOfType,
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
 * };
 *
 * // Construct input with type safety
 * const input = constructInputOrOutputOfType(
 *   { name: 'Value', dataType: 'stringType', allowInput: true },
 *   dataTypes
 * );
 * ```
 */
function constructInputOrOutputOfType<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  typeOfDataTypeInNode:
    | TypeOfInput<DataTypeUniqueId>
    | TypeOfNode<
        DataTypeUniqueId,
        NodeTypeUniqueId,
        UnderlyingType,
        ComplexSchemaType
      >['outputs'][number],
  allDataTypes: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['dataTypes'],
):
  | ConfigurableNodeInput<UnderlyingType, ComplexSchemaType, DataTypeUniqueId>
  | ConfigurableNodeOutput<
      UnderlyingType,
      ComplexSchemaType,
      DataTypeUniqueId
    > {
  const matchingDataTypeFromAllDataTypes =
    allDataTypes[typeOfDataTypeInNode.dataType];

  const resultantAllowInput =
    typeOfDataTypeInNode.allowInput ??
    matchingDataTypeFromAllDataTypes.allowInput;

  if (matchingDataTypeFromAllDataTypes.underlyingType === 'number') {
    return {
      id: generateRandomString(lengthOfIds),
      name: typeOfDataTypeInNode.name,
      handleColor: matchingDataTypeFromAllDataTypes.color,
      allowInput: resultantAllowInput,
      type: 'number' as const,
      handleShape: matchingDataTypeFromAllDataTypes.shape,
      dataType: {
        dataTypeObject: matchingDataTypeFromAllDataTypes,
        dataTypeUniqueId: typeOfDataTypeInNode.dataType,
      },
    };
  } else {
    return {
      id: generateRandomString(lengthOfIds),
      name: typeOfDataTypeInNode.name,
      handleColor: matchingDataTypeFromAllDataTypes.color,
      allowInput:
        matchingDataTypeFromAllDataTypes.underlyingType === 'string'
          ? resultantAllowInput
          : false,
      type: 'string' as const,
      handleShape: matchingDataTypeFromAllDataTypes.shape,
      dataType: {
        dataTypeObject: matchingDataTypeFromAllDataTypes,
        dataTypeUniqueId: typeOfDataTypeInNode.dataType,
      },
    };
  }
}

/**
 * Constructs a ConfigurableNodeInputPanel from a type definition
 *
 * This function creates an input panel with multiple inputs based on the panel type
 * definition. It generates a unique panel ID and constructs all the inputs within
 * the panel using the constructInputOrOutputOfType function.
 *
 * @template DataTypeUniqueId - Unique identifier type for data types
 * @template NodeTypeUniqueId - Unique identifier type for node types
 * @template UnderlyingType - Supported underlying data types ('string' | 'number' | 'complex')
 * @template ComplexSchemaType - Zod schema type for complex data types
 * @param typeOfPanel - The type definition for the input panel
 * @param dataTypes - Map of data type definitions
 * @returns Constructed input panel instance
 *
 * @example
 * ```tsx
 * import {
 *   constructInputPanelOfType,
 *   makeDataTypeWithAutoInfer
 * } from 'react-blender-nodes';
 *
 * // Define data types with auto-infer for type safety
 * const dataTypes = {
 *   numberType: makeDataTypeWithAutoInfer({
 *     name: 'Number',
 *     underlyingType: 'number',
 *     color: '#E74C3C',
 *   }),
 * };
 *
 * // Construct panel with type safety
 * const panel = constructInputPanelOfType(
 *   {
 *     name: 'Settings',
 *     inputs: [
 *       { name: 'Width', dataType: 'numberType' },
 *       { name: 'Height', dataType: 'numberType' }
 *     ]
 *   },
 *   dataTypes
 * );
 * ```
 */
function constructInputPanelOfType<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  typeOfPanelInNode: {
    name: string;
    inputs: { name: string; dataType: DataTypeUniqueId }[];
  },
  allDataTypes: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['dataTypes'],
): ConfigurableNodeInputPanel<
  UnderlyingType,
  ComplexSchemaType,
  DataTypeUniqueId
> {
  const panelId = generateRandomString(lengthOfIds);
  const inputs = typeOfPanelInNode.inputs.map((input) =>
    constructInputOrOutputOfType(input, allDataTypes),
  );

  return {
    id: panelId,
    name: typeOfPanelInNode.name,
    inputs,
  };
}

/**
 * Constructs a complete node from a node type definition
 *
 * This function creates a fully configured ReactFlow node based on the node type
 * definition. It processes all inputs (including panels) and outputs, generates
 * unique IDs, and sets up the node with the correct position and configuration.
 *
 * @template DataTypeUniqueId - Unique identifier type for data types
 * @template NodeTypeUniqueId - Unique identifier type for node types
 * @template UnderlyingType - Supported underlying data types ('string' | 'number' | 'complex')
 * @template ComplexSchemaType - Zod schema type for complex data types
 * @param dataTypes - Map of data type definitions
 * @param nodeType - The unique identifier of the node type
 * @param typeOfNodes - Map of node type definitions
 * @param nodeId - Unique identifier for the new node instance
 * @param position - Position where the node should be placed
 * @returns Complete ReactFlow node instance
 *
 * @example
 * ```tsx
 * import {
 *   constructNodeOfType,
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
 * };
 *
 * // Define node types with auto-infer for type safety
 * const typeOfNodes = {
 *   inputNode: makeTypeOfNodeWithAutoInfer({
 *     name: 'Input Node',
 *     headerColor: '#C44536',
 *     inputs: [{ name: 'Input', dataType: 'stringType', allowInput: true }],
 *     outputs: [{ name: 'Output', dataType: 'stringType' }]
 *   }),
 * };
 *
 * // Construct node with type safety
 * const node = constructNodeOfType(
 *   dataTypes,
 *   'inputNode',
 *   typeOfNodes,
 *   'node-123',
 *   { x: 100, y: 100 }
 * );
 * ```
 */
function constructNodeOfType<
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
  nodeType: NodeTypeUniqueId,
  typeOfNodes: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['typeOfNodes'],
  nodeId: string,
  position: XYPosition,
): State<
  DataTypeUniqueId,
  NodeTypeUniqueId,
  UnderlyingType,
  ComplexSchemaType
>['nodes'][number] {
  const nodeTypeData = typeOfNodes[nodeType];

  // Process inputs - can be either regular inputs or panels
  const inputs = nodeTypeData.inputs.map((input) => {
    if ('inputs' in input) {
      // This is a panel
      return constructInputPanelOfType(input, allDataTypes);
    } else {
      // This is a regular input
      return constructInputOrOutputOfType(input, allDataTypes);
    }
  });

  const outputs = nodeTypeData.outputs.map((output) =>
    constructInputOrOutputOfType(output, allDataTypes),
  );
  return {
    id: nodeId,
    position,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    type: 'configurableNode',
    width: 400,
    data: {
      name: nodeTypeData.name,
      headerColor: nodeTypeData.headerColor,
      inputs,
      outputs,
      nodeTypeUniqueId: nodeType,
      showNodeOpenButton: nodeTypeData.subtree !== undefined,
    },
  };
}

/**
 * Constructs the type of a handle from indices
 *
 * This function constructs the type of a handle from indices, handling both regular inputs and inputs within panels.
 *
 * @param allDataTypes - The all data types
 * @param nodeType - The node type
 * @param typeOfNodes - The type of nodes
 * @param indices - The indices of the handle
 * @returns The type of the handle
 */
function constructTypeOfHandleFromIndices<
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
  nodeType: NodeTypeUniqueId,
  typeOfNodes: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['typeOfNodes'],
  indices: HandleIndices | undefined,
):
  | ConfigurableNodeInput<UnderlyingType, ComplexSchemaType, DataTypeUniqueId>
  | ConfigurableNodeOutput<UnderlyingType, ComplexSchemaType, DataTypeUniqueId>
  | undefined {
  const nodeTypeData = typeOfNodes[nodeType];

  if (!indices) {
    return undefined;
  }
  if (indices.type === 'input') {
    const inputOrPanel = nodeTypeData?.inputs?.[indices.index1];
    if (!inputOrPanel) {
      return undefined;
    }
    if (indices.index2 !== undefined && 'inputs' in inputOrPanel) {
      return constructInputOrOutputOfType(
        inputOrPanel.inputs?.[indices.index2],
        allDataTypes,
      );
    } else if (indices.index2 === undefined && !('inputs' in inputOrPanel)) {
      return constructInputOrOutputOfType(inputOrPanel, allDataTypes);
    }
  } else {
    return constructInputOrOutputOfType(
      nodeTypeData?.outputs?.[indices.index1],
      allDataTypes,
    );
  }
}

function getCurrentNodesAndEdgesFromState<
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
): {
  nodes: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['nodes'];
  edges: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['edges'];
  inputNodeId?: string;
  outputNodeId?: string;
} {
  const topOpenedNodeGroup =
    state.openedNodeGroupStack?.[state.openedNodeGroupStack.length - 1];
  if (!topOpenedNodeGroup) {
    return { nodes: state.nodes, edges: state.edges };
  }
  const subtree = state.typeOfNodes[topOpenedNodeGroup.nodeType].subtree;
  if (!subtree) {
    return { nodes: state.nodes, edges: state.edges };
  }
  return {
    nodes: subtree.nodes,
    edges: subtree.edges,
    inputNodeId: subtree.inputNodeId,
    outputNodeId: subtree.outputNodeId,
  };
}

function setCurrentNodesAndEdgesToStateWithMutatingState<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  state: Pick<
    State<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    >,
    'nodes' | 'edges' | 'typeOfNodes' | 'openedNodeGroupStack' | 'dataTypes'
  >,
  nodes?: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['nodes'],
  edges?: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['edges'],
): State<
  DataTypeUniqueId,
  NodeTypeUniqueId,
  UnderlyingType,
  ComplexSchemaType
> {
  const topOpenedNodeGroup =
    state.openedNodeGroupStack?.[state.openedNodeGroupStack.length - 1];
  if (!topOpenedNodeGroup) {
    if (nodes) {
      state.nodes = [...nodes];
    }
    if (edges) {
      state.edges = [...edges];
    }
    return state;
  }
  const subtree = state.typeOfNodes[topOpenedNodeGroup.nodeType].subtree;
  const references =
    state.typeOfNodes[topOpenedNodeGroup.nodeType].subtree?.numberOfReferences;
  if (!subtree || references !== 0) {
    if (nodes) {
      state.nodes = [...nodes];
    }
    if (edges) {
      state.edges = [...edges];
    }
    return state;
  }
  if (nodes) {
    subtree.nodes = [...nodes];
  }
  if (edges) {
    subtree.edges = [...edges];
  }
  return state;
}

function getDependencyGraphBetweenNodeTypes<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  state: Pick<
    State<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    >,
    'typeOfNodes'
  >,
): {
  nodeToNodeDependents: Partial<
    Record<NodeTypeUniqueId, Set<NodeTypeUniqueId>>
  >;
  nodeToNodeDependencies: Partial<
    Record<NodeTypeUniqueId, Set<NodeTypeUniqueId>>
  >;
} {
  const nodeToNodeDependents: Partial<
    Record<NodeTypeUniqueId, Set<NodeTypeUniqueId>>
  > = {};
  const nodeToNodeDependencies: Partial<
    Record<NodeTypeUniqueId, Set<NodeTypeUniqueId>>
  > = {};
  for (const nodeType of Object.keys(state.typeOfNodes)) {
    const nodeTypeData = state.typeOfNodes[nodeType as NodeTypeUniqueId];
    const subtree = nodeTypeData.subtree;
    if (!subtree || subtree.nodes.length === 0) {
      continue;
    }
    for (const node of subtree.nodes) {
      const nodeTypeOfDependency = node.data.nodeTypeUniqueId;
      if (!nodeTypeOfDependency) {
        continue;
      }
      nodeToNodeDependencies[nodeType as NodeTypeUniqueId] =
        nodeToNodeDependencies[nodeType as NodeTypeUniqueId] || new Set();
      nodeToNodeDependencies[nodeType as NodeTypeUniqueId]?.add(
        nodeTypeOfDependency,
      );
      nodeToNodeDependents[nodeTypeOfDependency] =
        nodeToNodeDependents[nodeTypeOfDependency] || new Set();
      nodeToNodeDependents[nodeTypeOfDependency]?.add(
        nodeType as NodeTypeUniqueId,
      );
    }
  }
  return { nodeToNodeDependents, nodeToNodeDependencies };
}

/**
 * Gets the direct dependents of a node type
 * - Basically, it returns the node types that are directly dependent on the given node type
 * - Doesn't include itself
 *
 * @param stateOrNodeToNodeDependents - The state or the node to node dependents
 * @param nodeType - The node type
 * @returns The direct dependents of the node type as a set
 */
function getDirectDependentsOfNodeType<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  stateOrNodeToNodeDependents:
    | Pick<
        State<
          DataTypeUniqueId,
          NodeTypeUniqueId,
          UnderlyingType,
          ComplexSchemaType
        >,
        'typeOfNodes'
      >
    | Partial<Record<NodeTypeUniqueId, Set<NodeTypeUniqueId>>>,
  nodeType: NodeTypeUniqueId,
): Set<NodeTypeUniqueId> {
  const nodeToNodeDependents =
    'typeOfNodes' in stateOrNodeToNodeDependents
      ? getDependencyGraphBetweenNodeTypes(stateOrNodeToNodeDependents)
          .nodeToNodeDependents
      : stateOrNodeToNodeDependents;
  return nodeToNodeDependents[nodeType] || new Set();
}

/**
 * Gets the direct dependencies of a node type
 * - Basically, it returns the node types that this node type directly depends on
 * - Doesn't include itself
 *
 * @param stateOrNodeToNodeDependencies - The state or the node to node dependencies
 * @param nodeType - The node type
 * @returns The direct dependencies of the node type as a set
 */
function getDirectDependenciesOfNodeType<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  stateOrNodeToNodeDependencies:
    | Pick<
        State<
          DataTypeUniqueId,
          NodeTypeUniqueId,
          UnderlyingType,
          ComplexSchemaType
        >,
        'typeOfNodes'
      >
    | Partial<Record<NodeTypeUniqueId, Set<NodeTypeUniqueId>>>,
  nodeType: NodeTypeUniqueId,
): Set<NodeTypeUniqueId> {
  const nodeToNodeDependencies =
    'typeOfNodes' in stateOrNodeToNodeDependencies
      ? getDependencyGraphBetweenNodeTypes(stateOrNodeToNodeDependencies)
          .nodeToNodeDependencies
      : stateOrNodeToNodeDependencies;
  return nodeToNodeDependencies[nodeType] || new Set();
}

/**
 * Gets all the dependents of a node type recursively
 * - Basically, it returns the node types that are dependent on the given node type and all their dependents recursively
 * - Includes itself
 *
 * @param stateOrNodeToNodeDependents - The state or the node to node dependents
 * @param nodeType - The node type
 * @returns All dependents of the node type as a set
 */
function getAllDependentsOfNodeTypeRecursively<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  stateOrNodeToNodeDependents:
    | Pick<
        State<
          DataTypeUniqueId,
          NodeTypeUniqueId,
          UnderlyingType,
          ComplexSchemaType
        >,
        'typeOfNodes'
      >
    | Partial<Record<NodeTypeUniqueId, Set<NodeTypeUniqueId>>>,
  nodeType: NodeTypeUniqueId,
): Set<NodeTypeUniqueId> {
  const nodeToNodeDependents =
    'typeOfNodes' in stateOrNodeToNodeDependents
      ? getDependencyGraphBetweenNodeTypes(stateOrNodeToNodeDependents)
          .nodeToNodeDependents
      : stateOrNodeToNodeDependents;
  const setOfAllDependents = new Set<NodeTypeUniqueId>();
  const queue = [nodeType];
  while (queue.length > 0) {
    const currentNodeType = queue.shift();
    if (!currentNodeType) {
      continue;
    }
    setOfAllDependents.add(currentNodeType);
    const directDependents = getDirectDependentsOfNodeType(
      nodeToNodeDependents,
      currentNodeType,
    );
    for (const dependent of directDependents) {
      if (setOfAllDependents.has(dependent)) {
        continue;
      }
      queue.push(dependent);
    }
  }
  return setOfAllDependents;
}

/**
 * Gets all the dependencies of a node type recursively
 * - Basically, it returns the node types that this node type directly depends on and all their dependencies recursively
 * - Includes itself
 *
 * @param stateOrNodeToNodeDependencies - The state or the node to node dependencies
 * @param nodeType - The node type
 * @returns All dependencies of the node type as a set
 */
function getAllDependenciesOfNodeTypeRecursively<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  stateOrNodeToNodeDependencies:
    | Pick<
        State<
          DataTypeUniqueId,
          NodeTypeUniqueId,
          UnderlyingType,
          ComplexSchemaType
        >,
        'typeOfNodes'
      >
    | Partial<Record<NodeTypeUniqueId, Set<NodeTypeUniqueId>>>,
  nodeType: NodeTypeUniqueId,
): Set<NodeTypeUniqueId> {
  const nodeToNodeDependencies =
    'typeOfNodes' in stateOrNodeToNodeDependencies
      ? getDependencyGraphBetweenNodeTypes(stateOrNodeToNodeDependencies)
          .nodeToNodeDependencies
      : stateOrNodeToNodeDependencies;
  const setOfAllDependencies = new Set<NodeTypeUniqueId>();
  const queue = [nodeType];
  while (queue.length > 0) {
    const currentNodeType = queue.shift();
    if (!currentNodeType) {
      continue;
    }
    setOfAllDependencies.add(currentNodeType);
    const directDependencies = getDirectDependenciesOfNodeType(
      nodeToNodeDependencies,
      currentNodeType,
    );
    for (const dependency of directDependencies) {
      if (setOfAllDependencies.has(dependency)) {
        continue;
      }
      queue.push(dependency);
    }
  }
  return setOfAllDependencies;
}

export {
  constructNodeOfType,
  constructInputOrOutputOfType,
  constructInputPanelOfType,
  constructTypeOfHandleFromIndices,
  getCurrentNodesAndEdgesFromState,
  setCurrentNodesAndEdgesToStateWithMutatingState,
  getDependencyGraphBetweenNodeTypes,
  getDirectDependentsOfNodeType,
  getDirectDependenciesOfNodeType,
  getAllDependentsOfNodeTypeRecursively,
  getAllDependenciesOfNodeTypeRecursively,
};
