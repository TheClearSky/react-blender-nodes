import { useReactFlow, useNodeId } from '@xyflow/react';
import { Input } from '@/components/atoms';
import { SliderNumberInput } from '@/components/molecules';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectUnsupportedItem,
} from '@/components/molecules/Select/Select';
import type { ConfigurableNodeInput } from '../ConfigurableNode';
import { updateHandleInNodeDataMatchingHandleId } from '@/utils/nodeStateManagement/handles/handleSetters';
import { Checkbox } from '@/components/atoms/Checkbox/Checkbox';
import { useInputComponentRegistry } from '@/components/organisms/FullGraph/InputComponentRegistryContext';

type ReactFlowAwareInputProps = {
  input: ConfigurableNodeInput;
};

function StringSelectForNode({
  input,
  onValueChange,
}: {
  input: ConfigurableNodeInput & {
    type: 'string';
    allowedStrings: readonly string[];
  };
  onValueChange: (value: string | undefined) => void;
}) {
  return (
    <Select
      value={input.value ?? ''}
      onValueChange={onValueChange}
      allowDeselect
      renderInline
    >
      <SelectTrigger>
        <SelectValue placeholder={input.name} unsupportedLabel='unsupported' />
      </SelectTrigger>
      <SelectContent>
        <SelectUnsupportedItem />
        {input.allowedStrings.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const ReactFlowAwareInput = ({ input }: ReactFlowAwareInputProps) => {
  const reactflowContext = useReactFlow();
  const nodeId = useNodeId();
  const inputComponentRegistry = useInputComponentRegistry();
  const updateNodeValue = (newValue: unknown) => {
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
  };

  if (input.type === 'string') {
    return input.allowedStrings && input.allowedStrings.length > 0 ? (
      <StringSelectForNode
        input={
          input as ConfigurableNodeInput & {
            type: 'string';
            allowedStrings: readonly string[];
          }
        }
        onValueChange={(newValue) => {
          if (newValue !== undefined) input.onChange?.(newValue);
          updateNodeValue(newValue);
        }}
      />
    ) : (
      <Input
        placeholder={input.name}
        value={input.value}
        onChange={(newValue) => {
          input.onChange?.(newValue);
          updateNodeValue(newValue);
        }}
        allowOnlyNumbers={false}
        className='w-full'
      />
    );
  }

  if (input.type === 'number') {
    return (
      <SliderNumberInput
        name={input.name}
        value={input.value}
        onChange={(newValue) => {
          input.onChange?.(newValue);
          updateNodeValue(newValue);
        }}
        className='w-full'
      />
    );
  }

  if (input.type === 'boolean') {
    return (
      <div className='flex items-center gap-2 w-full'>
        <Checkbox
          checked={input.value}
          onCheckedChange={(newValue) => {
            if (newValue !== 'indeterminate') {
              input.onChange?.(newValue);
              updateNodeValue(newValue);
            }
          }}
        />
        <p className='text-primary-white text-[27px] leading-[27px] font-main truncate'>
          {input.name}
        </p>
      </div>
    );
  }

  if (input.type === 'unsupportedDirectly' && input.dataType) {
    const CustomComponent =
      inputComponentRegistry?.[input.dataType.dataTypeUniqueId];
    if (CustomComponent) {
      return (
        <CustomComponent
          value={input.value}
          onChange={(newValue) => {
            input.onChange?.(newValue);
            updateNodeValue(newValue);
          }}
          name={input.name}
          dataTypeId={input.dataType.dataTypeUniqueId}
        />
      );
    }
  }

  return null;
};

type ContextAwareInputProps = {
  input: ConfigurableNodeInput;
  isCurrentlyInsideReactFlow: boolean;
};

const ContextAwareInput = ({
  input,
  isCurrentlyInsideReactFlow,
}: ContextAwareInputProps) => {
  const inputComponentRegistry = useInputComponentRegistry();

  if (isCurrentlyInsideReactFlow) {
    return <ReactFlowAwareInput input={input} />;
  }

  if (input.type === 'string') {
    return input.allowedStrings && input.allowedStrings.length > 0 ? (
      <Select
        value={input.value ?? ''}
        onValueChange={(newValue) => {
          if (newValue !== undefined) input.onChange?.(newValue);
        }}
        allowDeselect
      >
        <SelectTrigger>
          <SelectValue
            placeholder={input.name}
            unsupportedLabel='unsupported'
          />
        </SelectTrigger>
        <SelectContent>
          <SelectUnsupportedItem />
          {input.allowedStrings.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : (
      <Input
        placeholder={input.name}
        value={input.value}
        onChange={input.onChange}
        allowOnlyNumbers={false}
        className='w-full'
      />
    );
  }

  if (input.type === 'number') {
    return (
      <SliderNumberInput
        name={input.name}
        value={input.value}
        onChange={input.onChange}
        className='w-full'
      />
    );
  }

  if (input.type === 'boolean') {
    return (
      <div className='flex items-center gap-2 w-full'>
        <Checkbox
          checked={input.value}
          onCheckedChange={(newValue) => {
            if (newValue !== 'indeterminate') {
              input.onChange?.(newValue);
            }
          }}
        />
        <p className='text-primary-white text-[27px] leading-[27px] font-main truncate'>
          {input.name}
        </p>
      </div>
    );
  }

  if (input.type === 'unsupportedDirectly' && input.dataType) {
    const CustomComponent =
      inputComponentRegistry?.[input.dataType.dataTypeUniqueId];
    if (CustomComponent) {
      return (
        <CustomComponent
          value={input.value}
          onChange={(newValue) => {
            input.onChange?.(newValue);
          }}
          name={input.name}
          dataTypeId={input.dataType.dataTypeUniqueId}
        />
      );
    }
  }

  return null;
};

export { ContextAwareInput, ReactFlowAwareInput };
export type { ContextAwareInputProps, ReactFlowAwareInputProps };
