import { useNodeId } from '@xyflow/react';
import { useContext } from 'react';
import { cn } from '@/utils';
import { Input } from '@/components/atoms';
import { useGraphTheme } from '@/utils/theme/GraphThemeContext';
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
import { Checkbox } from '@/components/atoms/Checkbox/Checkbox';
import { useInputComponentRegistry } from '@/components/organisms/FullGraph/InputComponentRegistryContext';
import { FullGraphContext } from '@/components/organisms/FullGraph/FullGraphState';
import { actionTypesMap } from '@/utils/nodeStateManagement/mainReducer';

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
  const theme = useGraphTheme();
  return (
    <Select
      value={input.value ?? ''}
      onValueChange={onValueChange}
      allowDeselect
      renderInline
    >
      <SelectTrigger className={theme?.select?.trigger}>
        <SelectValue placeholder={input.name} unsupportedLabel='unsupported' />
      </SelectTrigger>
      <SelectContent className={theme?.select?.content}>
        <SelectUnsupportedItem />
        {input.allowedStrings.map((option) => (
          <SelectItem
            key={option}
            value={option}
            className={theme?.select?.item}
          >
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const ReactFlowAwareInput = ({ input }: ReactFlowAwareInputProps) => {
  const nodeId = useNodeId();
  const { allProps } = useContext(FullGraphContext);
  const inputComponentRegistry = useInputComponentRegistry();
  const theme = useGraphTheme();
  const updateNodeValue = (newValue: unknown) => {
    if (!nodeId) return;
    allProps.dispatch({
      type: actionTypesMap.UPDATE_INPUT_VALUE,
      payload: {
        nodeId,
        inputId: input.id,
        value: newValue as string | number,
      },
    });
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
        className={cn('w-full', theme?.node?.inputField)}
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
        className={cn('w-full', theme?.node?.inputField)}
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
        {/* No own color: inherits the row (inputRow slot recolors it in themes). */}
        <p className='text-[27px] leading-[27px] font-main truncate'>
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
  const theme = useGraphTheme();

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
        <SelectTrigger className={theme?.select?.trigger}>
          <SelectValue
            placeholder={input.name}
            unsupportedLabel='unsupported'
          />
        </SelectTrigger>
        <SelectContent className={theme?.select?.content}>
          <SelectUnsupportedItem />
          {input.allowedStrings.map((option) => (
            <SelectItem
              key={option}
              value={option}
              className={theme?.select?.item}
            >
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
        className={cn('w-full', theme?.node?.inputField)}
      />
    );
  }

  if (input.type === 'number') {
    return (
      <SliderNumberInput
        name={input.name}
        value={input.value}
        onChange={input.onChange}
        className={cn('w-full', theme?.node?.inputField)}
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
        {/* No own color: inherits the row (inputRow slot recolors it in themes). */}
        <p className='text-[27px] leading-[27px] font-main truncate'>
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
