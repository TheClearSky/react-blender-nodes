import { useReactFlow, useNodeId } from '@xyflow/react';
import { Input } from '@/components/atoms';
import { SliderNumberInput } from '@/components/molecules';
import type { ConfigurableNodeInput } from '../ConfigurableNode';
import { updateHandleInNodeDataMatchingHandleId } from '@/utils/nodeStateManagement/handles/handleSetters';

/**
 * Props for the ReactFlowAwareInput component
 */
type ReactFlowAwareInputProps = {
  /** The input configuration */
  input: ConfigurableNodeInput;
};

/**
 * ReactFlow-aware input component that automatically updates node data
 *
 * This component renders the appropriate input component (Input or SliderNumberInput)
 * and automatically updates the ReactFlow node data when values change. It integrates
 * with the ReactFlow context to maintain state consistency.
 *
 * @param props - The component props
 * @returns JSX element containing the appropriate input component
 */
const ReactFlowAwareInput = ({ input }: ReactFlowAwareInputProps) => {
  const reactflowContext = useReactFlow();
  const nodeId = useNodeId();
  return input.type === 'string' ? (
    <Input
      placeholder={input.name}
      value={input.value}
      onChange={(newValue) => {
        input.onChange?.(newValue);
        reactflowContext.setNodes((nodes) =>
          nodes.map((currentNode) => {
            if (currentNode.id === nodeId) {
              return {
                ...currentNode,
                data: updateHandleInNodeDataMatchingHandleId(
                  currentNode.data,
                  input.id,
                  { value: newValue },
                  true,
                  false,
                  false,
                ),
              };
            }
            return currentNode;
          }),
        );
      }}
      allowOnlyNumbers={false}
      className='w-full'
    />
  ) : (
    <SliderNumberInput
      name={input.name}
      value={input.value}
      onChange={(newValue) => {
        input.onChange?.(newValue);
        reactflowContext.setNodes((nodes) =>
          nodes.map((currentNode) => {
            if (currentNode.id === nodeId) {
              return {
                ...currentNode,
                data: updateHandleInNodeDataMatchingHandleId(
                  currentNode.data,
                  input.id,
                  { value: newValue },
                  true,
                  false,
                  false,
                ),
              };
            }
            return currentNode;
          }),
        );
      }}
      className='w-full'
    />
  );
};

/**
 * Props for the ContextAwareInput component
 */
type ContextAwareInputProps = {
  /** The input configuration */
  input: ConfigurableNodeInput;
  /** Whether the component is currently inside a ReactFlow context */
  isCurrentlyInsideReactFlow: boolean;
};

/**
 * Context-aware input component that handles both connected and unconnected inputs
 *
 * This component intelligently renders either a label (for connected inputs) or an
 * input component (for unconnected inputs) based on the connection state. It uses
 * the ReactFlow context to determine if an input is connected to other nodes.
 *
 * Features:
 * - Automatically detects input connection state
 * - Renders appropriate UI based on connection status
 * - Integrates with ReactFlow's connection system
 * - Supports both string and number input types
 *
 * @param props - The component props
 * @returns JSX element containing either a label or input component
 *
 * @example
 * ```tsx
 * <ContextAwareInput
 *   input={{
 *     id: 'input1',
 *     name: 'Value',
 *     type: 'string',
 *     dataType: 'stringType',
 *     allowInput: true,
 *     value: 'Hello World',
 *   }}
 *   isCurrentlyInsideReactFlow={true}
 * />
 * ```
 */
const ContextAwareInput = ({
  input,
  isCurrentlyInsideReactFlow,
}: ContextAwareInputProps) => {
  if (isCurrentlyInsideReactFlow) {
    return <ReactFlowAwareInput input={input} />;
  }

  return input.type === 'string' ? (
    <Input
      placeholder={input.name}
      value={input.value}
      onChange={input.onChange}
      allowOnlyNumbers={false}
      className='w-full'
    />
  ) : (
    <SliderNumberInput
      name={input.name}
      value={input.value}
      onChange={input.onChange}
      className='w-full'
    />
  );
};

export { ContextAwareInput, ReactFlowAwareInput };
export type { ContextAwareInputProps, ReactFlowAwareInputProps };
