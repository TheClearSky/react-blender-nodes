import type {
  ConfigurableNodeProps,
  ConfigurableNodeInput,
  ConfigurableNodeInputPanel,
} from './ConfigurableNode';

/**
 * Get the input or output for a given handle id
 *
 * This function searches through all inputs (including those within panels) and outputs
 * to find the handle with the specified ID. It handles both regular inputs and inputs
 * within collapsible panels.
 *
 * @param handleId - The id of the handle to get the input or output for
 * @param nodeData - The data of the node to get the input or output for
 * @returns The input or output for the given handle id, or undefined if not found
 *
 * @example
 * ```tsx
 * const handle = getInputOrOutputFromNodeData('input-123', nodeData);
 * if (handle) {
 *   console.log('Found handle:', handle.name);
 * }
 * ```
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

/**
 * Modifies an array of inputs without mutating the original array
 *
 * This function creates a new array with the specified input updated to have
 * the new value. It preserves immutability by creating new objects for the
 * modified input while keeping other inputs unchanged.
 *
 * @param handleId - The ID of the handle to update
 * @param inputs - Array of inputs to modify
 * @param newValue - The new value to set for the specified input
 * @returns New array with the updated input
 *
 * @example
 * ```tsx
 * const updatedInputs = modifyInputsArrayWithoutMutating(
 *   'input-123',
 *   inputs,
 *   'new value'
 * );
 * ```
 */
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
/**
 * Modifies either a single input or a panel of inputs without mutating the original
 *
 * This function handles both regular inputs and input panels. For panels, it recursively
 * calls modifyInputsArrayWithoutMutating to update the specific input within the panel.
 * For regular inputs, it directly updates the input if the ID matches.
 *
 * @param handleId - The ID of the handle to update
 * @param inputOrPanel - Either a single input or an input panel
 * @param newValue - The new value to set for the specified input
 * @returns New input or panel with the updated value
 *
 * @example
 * ```tsx
 * const updated = modifyInputsOrPanelWithoutMutating(
 *   'input-123',
 *   inputOrPanel,
 *   'new value'
 * );
 * ```
 */
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

/**
 * Modifies an input value in node data without mutating the original data
 *
 * This function creates a new node data object with the specified input updated
 * to have the new value. It handles both regular inputs and inputs within panels,
 * preserving immutability throughout the data structure.
 *
 * @param handleId - The ID of the handle to update
 * @param nodeData - The node data to modify
 * @param newValue - The new value to set for the specified input
 * @returns New node data with the updated input value
 *
 * @example
 * ```tsx
 * const updatedNodeData = modifyInputsInNodeDataWithoutMutating(
 *   'input-123',
 *   nodeData,
 *   'new value'
 * );
 * ```
 */
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
