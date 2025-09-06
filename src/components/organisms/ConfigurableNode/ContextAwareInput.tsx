import { useReactFlow, useNodeId } from '@xyflow/react';
import { Input } from '@/components/atoms';
import { SliderNumberInput } from '@/components/molecules';
import { modifyInputsInNodeDataWithoutMutating } from './nodeDataManipulation';
import type { ConfigurableNodeInput } from './ConfigurableNode';

type ReactFlowAwareInputProps = {
  input: ConfigurableNodeInput;
};

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
                data: modifyInputsInNodeDataWithoutMutating(
                  input.id,
                  currentNode.data,
                  newValue,
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
                data: modifyInputsInNodeDataWithoutMutating(
                  input.id,
                  currentNode.data,
                  newValue,
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

type ContextAwareInputProps = {
  input: ConfigurableNodeInput;
  isCurrentlyInsideReactFlow: boolean;
};

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
