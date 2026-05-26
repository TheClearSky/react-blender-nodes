import type { State, SupportedUnderlyingTypes } from '../../types';
import type { z } from 'zod';
import { constructTypeOfHandleFromIndices } from '../constructAndModifyNodes';
import { insertOrDeleteHandleInNodeDataUsingHandleIndices } from '../../handles/handleSetters';
import { getHandleFromNodeDataFromIndices } from '../../handles/handleGetters';
import { inferTypeAcrossTheNodeForHandleOfDataType } from '../../edges/typeInference';
import type { ConnectionValidationResult } from '../../newOrRemovedEdgeValidation';
import { isSwitchNode } from './switchIdentification';
import { getSwitchStructureFromNode } from './switchStructure';
import {
  standardDataTypeNamesMap,
  standardNodeTypeNamesMap,
} from '../../standardNodes';

function addSwitchInferDuplicateToNode<
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
  node: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['nodes'][number],
): boolean {
  const nodeType = node.data.nodeTypeUniqueId;
  if (!nodeType) return false;

  const inputs = node.data?.inputs instanceof Array ? node.data.inputs : [];
  const outputs = node.data?.outputs instanceof Array ? node.data.outputs : [];

  const isSwitchStart =
    nodeType === standardDataTypeNamesMap.switchInfer
      ? false
      : nodeType === 'switchStart';

  if (isSwitchStart) {
    // SwitchStart: add 1 input template + 2 output templates (true zone end, false zone end)
    const newInputHandle = constructTypeOfHandleFromIndices(
      state.dataTypes,
      nodeType as NodeTypeUniqueId,
      state.typeOfNodes,
      { type: 'input', index1: 0, index2: undefined },
    );
    if (newInputHandle) {
      // Insert before the condition handle (which is second-to-last, template is last)
      // Actually, inputs are: [data1, data2..., condition, template]
      // New data handle goes before condition. Find condition index.
      const conditionIndex = inputs.findIndex(
        (h: Record<string, unknown>) =>
          (h as { dataType?: { dataTypeUniqueId?: string } }).dataType
            ?.dataTypeUniqueId === standardDataTypeNamesMap.condition,
      );
      if (conditionIndex >= 0) {
        insertOrDeleteHandleInNodeDataUsingHandleIndices<
          UnderlyingType,
          NodeTypeUniqueId,
          ComplexSchemaType,
          DataTypeUniqueId
        >(
          node.data,
          { type: 'input', index1: conditionIndex, index2: undefined },
          0,
          newInputHandle,
          true,
          'before',
          false,
        );
      }
    }

    // Add true-zone output template: insert before the false zone starts
    // Outputs: [bind, true1, true2..., false1, false2..., template]
    // The false zone starts at index = 1 + trueCount
    // trueCount = falseCount = (totalOutputs - 2) / 2  (excluding bind and template)
    const totalOutputs = outputs.length;
    const dataOutputCount = totalOutputs - 2; // exclude bind + template
    const trueZoneCount = Math.ceil(dataOutputCount / 2);
    const trueZoneEndIndex = 1 + trueZoneCount; // insert after last true handle

    const newTrueOutputHandle = constructTypeOfHandleFromIndices(
      state.dataTypes,
      nodeType as NodeTypeUniqueId,
      state.typeOfNodes,
      { type: 'output', index1: 1, index2: undefined },
    );
    if (newTrueOutputHandle) {
      insertOrDeleteHandleInNodeDataUsingHandleIndices<
        UnderlyingType,
        NodeTypeUniqueId,
        ComplexSchemaType,
        DataTypeUniqueId
      >(
        node.data,
        { type: 'output', index1: trueZoneEndIndex, index2: undefined },
        0,
        newTrueOutputHandle,
        true,
        'before',
        false,
      );
    }

    // Add false-zone output template: insert at end (before the last template)
    const newFalseOutputHandle = constructTypeOfHandleFromIndices(
      state.dataTypes,
      nodeType as NodeTypeUniqueId,
      state.typeOfNodes,
      { type: 'output', index1: 1, index2: undefined },
    );
    if (newFalseOutputHandle) {
      insertOrDeleteHandleInNodeDataUsingHandleIndices<
        UnderlyingType,
        NodeTypeUniqueId,
        ComplexSchemaType,
        DataTypeUniqueId
      >(
        node.data,
        { type: 'output', index1: -1, index2: undefined },
        0,
        newFalseOutputHandle,
        true,
        'after',
        false,
      );
    }
  } else {
    // SwitchEnd: add 2 input templates (true zone end, false zone end) + 1 output template
    const totalInputs = inputs.length;
    const dataInputCount = totalInputs - 2; // exclude bind + template
    const trueZoneCount = Math.ceil(dataInputCount / 2);
    const trueZoneEndIndex = 1 + trueZoneCount;

    const newTrueInputHandle = constructTypeOfHandleFromIndices(
      state.dataTypes,
      nodeType as NodeTypeUniqueId,
      state.typeOfNodes,
      { type: 'input', index1: 1, index2: undefined },
    );
    if (newTrueInputHandle) {
      insertOrDeleteHandleInNodeDataUsingHandleIndices<
        UnderlyingType,
        NodeTypeUniqueId,
        ComplexSchemaType,
        DataTypeUniqueId
      >(
        node.data,
        { type: 'input', index1: trueZoneEndIndex, index2: undefined },
        0,
        newTrueInputHandle,
        true,
        'before',
        false,
      );
    }

    const newFalseInputHandle = constructTypeOfHandleFromIndices(
      state.dataTypes,
      nodeType as NodeTypeUniqueId,
      state.typeOfNodes,
      { type: 'input', index1: 1, index2: undefined },
    );
    if (newFalseInputHandle) {
      insertOrDeleteHandleInNodeDataUsingHandleIndices<
        UnderlyingType,
        NodeTypeUniqueId,
        ComplexSchemaType,
        DataTypeUniqueId
      >(
        node.data,
        { type: 'input', index1: -1, index2: undefined },
        0,
        newFalseInputHandle,
        true,
        'after',
        false,
      );
    }

    // Add output template
    const newOutputHandle = constructTypeOfHandleFromIndices(
      state.dataTypes,
      nodeType as NodeTypeUniqueId,
      state.typeOfNodes,
      { type: 'output', index1: 0, index2: undefined },
    );
    if (newOutputHandle) {
      insertOrDeleteHandleInNodeDataUsingHandleIndices<
        UnderlyingType,
        NodeTypeUniqueId,
        ComplexSchemaType,
        DataTypeUniqueId
      >(
        node.data,
        { type: 'output', index1: -1, index2: undefined },
        0,
        newOutputHandle,
        true,
        'after',
        false,
      );
    }
  }

  return true;
}

function addDuplicateHandlesToSwitchNodesAfterInference<
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
  sourceNodeIndex: number,
  targetNodeIndex: number,
  isSourceHandleInferredFromConnection: boolean,
  isTargetHandleInferredFromConnection: boolean,
): {
  validation: ConnectionValidationResult;
} {
  const sourceNode = state.nodes[sourceNodeIndex];
  const targetNode = state.nodes[targetNodeIndex];
  const sourceNodeType = sourceNode.data.nodeTypeUniqueId;
  const targetNodeType = targetNode.data.nodeTypeUniqueId;

  if (!sourceNodeType || !targetNodeType) {
    return {
      validation: {
        isValid: false,
        reason: 'Source or target node type not found',
      },
    };
  }

  const isSourceNodeSwitchNode = isSwitchNode(sourceNodeType);
  const isTargetNodeSwitchNode = isSwitchNode(targetNodeType);

  if (!isSourceNodeSwitchNode && !isTargetNodeSwitchNode) {
    return { validation: { isValid: true } };
  }

  const processedNodeIds = new Set<string>();

  if (isSourceNodeSwitchNode && isSourceHandleInferredFromConnection) {
    if (addSwitchInferDuplicateToNode(state, sourceNode)) {
      processedNodeIds.add(sourceNode.id);
    }
  }

  if (isTargetNodeSwitchNode && isTargetHandleInferredFromConnection) {
    if (addSwitchInferDuplicateToNode(state, targetNode)) {
      processedNodeIds.add(targetNode.id);
    }
  }

  if (processedNodeIds.size > 0) {
    const processedNode = processedNodeIds.has(sourceNode.id)
      ? sourceNode
      : targetNode;

    // Get the just-inferred handle from the processed node.
    // SwitchStart inputs: [data..., condition, template] → second-to-last is condition, third-to-last is last data
    // SwitchEnd inputs: [bind, data..., template] → second-to-last is last data
    // Use -3 for SwitchStart (skip template + condition), -2 for SwitchEnd (skip template only)
    const processedNodeType = processedNode.data.nodeTypeUniqueId;
    const isSwitchStartNode =
      processedNodeType === standardNodeTypeNamesMap.switchStart;
    const inferIndex = isSwitchStartNode ? -3 : -2;
    const inferIndices = {
      type: 'input' as const,
      index1: inferIndex,
      index2: undefined,
    };
    const inferredHandleResult = getHandleFromNodeDataFromIndices<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType,
      typeof processedNode.data,
      typeof inferIndices
    >(inferIndices, processedNode.data);
    if (!inferredHandleResult?.value) return { validation: { isValid: true } };

    const switchStructure = getSwitchStructureFromNode(state, processedNode);
    if (switchStructure) {
      const sibling = processedNodeIds.has(switchStructure.switchStart.id)
        ? switchStructure.switchEnd
        : switchStructure.switchStart;

      if (!processedNodeIds.has(sibling.id)) {
        inferTypeAcrossTheNodeForHandleOfDataType<
          DataTypeUniqueId,
          NodeTypeUniqueId,
          UnderlyingType,
          ComplexSchemaType
        >(
          sibling.data,
          standardDataTypeNamesMap.switchInfer as DataTypeUniqueId,
          {
            handle: inferredHandleResult.value,
            resetInferredType: false,
            overrideDataType: true,
            overrideName: true,
          },
          true,
        );

        addSwitchInferDuplicateToNode(state, sibling);
      }
    }
  }

  return { validation: { isValid: true } };
}

export { addDuplicateHandlesToSwitchNodesAfterInference };
