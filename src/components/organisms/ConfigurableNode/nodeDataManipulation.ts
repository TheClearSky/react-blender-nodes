import type {
  ConfigurableNodeProps,
  ConfigurableNodeInput,
  ConfigurableNodeInputPanel,
} from './ConfigurableNode';

/**
 * Get the input or output for a given handle id
 * - If the handle id is not found, returns undefined
 * @param handleId - The id of the handle to get the input or output for
 * @param nodeData - The data of the node to get the input or output for
 * @returns The input or output for the given handle id
 */
function getInputOrOutputFromNodeData(
  handleId: string,
  nodeData: ConfigurableNodeProps,
) {
  const inputs = nodeData?.inputs instanceof Array ? nodeData?.inputs : [];
  const outputs = nodeData?.outputs instanceof Array ? nodeData?.outputs : [];

  // Flatten inputs to include both regular inputs and panel inputs
  const flattenedInputs = inputs.flatMap((input) => {
    if ('inputs' in input) {
      // This is an InputPanel, return its inputs
      return input.inputs;
    } else {
      // This is a regular Input
      return [input];
    }
  });

  const allHandles = flattenedInputs.concat(outputs);
  return allHandles.find((handle) => handle?.id === handleId);
}

function modifyInputsArrayWithoutMutating(
  handleId: string,
  inputs: ConfigurableNodeInput[],
  newValue: string | number,
) {
  return inputs.map((input) => {
    if (input.id === handleId) {
      return { ...input, value: newValue };
    }
    return input;
  });
}
function modifyInputsOrPanelWithoutMutating(
  handleId: string,
  inputOrPanel: ConfigurableNodeInput | ConfigurableNodeInputPanel,
  newValue: string | number,
) {
  return 'inputs' in inputOrPanel
    ? {
        ...inputOrPanel,
        inputs: modifyInputsArrayWithoutMutating(
          handleId,
          inputOrPanel.inputs,
          newValue,
        ),
      }
    : inputOrPanel.id === handleId
      ? { ...inputOrPanel, value: newValue }
      : inputOrPanel;
}

function modifyInputsInNodeDataWithoutMutating(
  handleId: string,
  nodeData: ConfigurableNodeProps,
  newValue: string | number,
) {
  const newNodeData = {
    ...nodeData,
    inputs: (nodeData.inputs || []).map((inputOrPanel) => {
      return modifyInputsOrPanelWithoutMutating(
        handleId,
        inputOrPanel,
        newValue,
      );
    }),
  };
  return newNodeData;
}

export { getInputOrOutputFromNodeData, modifyInputsInNodeDataWithoutMutating };
