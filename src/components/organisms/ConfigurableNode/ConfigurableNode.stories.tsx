import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import {
  ConfigurableNode,
  type ConfigurableNodeProps,
} from './ConfigurableNode';
import { cn } from '@/utils/cnHelper';

const meta = {
  component: ConfigurableNode,
  argTypes: {},
  tags: ['autodocs'],
} satisfies Meta<ConfigurableNodeProps>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground = {} satisfies Story;

export const WithInputsAndOutputs = {
  args: {
    name: 'Data Processing Node',
    headerColor: '#C44536',
    inputs: [
      {
        id: 'input1',
        name: 'Text Input',
        type: 'string',
        handleColor: '#45B7D1',
      },
      {
        id: 'input2',
        name: 'Numeric Input',
        type: 'number',
        handleColor: '#96CEB4',
      },
    ],
    outputs: [
      {
        id: 'output1',
        name: 'Processed Text',
        type: 'string',
        handleColor: '#FECA57',
      },
      {
        id: 'output2',
        name: 'Processed Number',
        type: 'number',
        handleColor: '#FF9FF3',
      },
    ],
  },
} satisfies Story;

export const WithCollapsiblePanels = {
  args: {
    name: 'Advanced Configuration Node',
    headerColor: '#2D5A87',
    inputs: [
      {
        id: 'input1',
        name: 'Primary Input',
        type: 'string',
        handleColor: '#45B7D1',
      },
      {
        id: 'panel1',
        name: 'Advanced Settings',
        inputs: [
          {
            id: 'panel1_input1',
            name: 'Threshold Value',
            type: 'number',
            handleColor: '#96CEB4',
          },
          {
            id: 'panel1_input2',
            name: 'Configuration String',
            type: 'string',
            handleColor: '#4ECDC4',
          },
          {
            id: 'panel1_input3',
            name: 'Max Iterations',
            type: 'number',
            handleColor: '#FF6B6B',
          },
        ],
      },
      {
        id: 'panel2',
        name: 'Debug Options',
        inputs: [
          {
            id: 'panel2_input1',
            name: 'Debug Mode',
            type: 'string',
            handleColor: '#FECA57',
          },
          {
            id: 'panel2_input2',
            name: 'Verbose Logging',
            type: 'string',
            handleColor: '#FF9FF3',
          },
        ],
      },
      {
        id: 'input2',
        name: 'Secondary Input',
        type: 'number',
        handleColor: '#A8E6CF',
      },
    ],
    outputs: [
      {
        id: 'output1',
        name: 'Final Result',
        type: 'string',
        handleColor: '#FFD93D',
      },
    ],
  },
} satisfies Story;

export const WithInputComponents = {
  args: {
    name: 'Interactive Input Node',
    headerColor: '#7B2CBF',
    inputs: [
      {
        id: 'input1',
        name: 'Text Input',
        type: 'string',
        handleColor: '#45B7D1',
        allowInput: true,
      },
      {
        id: 'input2',
        name: 'Numeric Input',
        type: 'number',
        handleColor: '#96CEB4',
        allowInput: true,
      },
      {
        id: 'input3',
        name: 'Read-only Input',
        type: 'string',
        handleColor: '#FECA57',
        allowInput: false,
      },
    ],
    outputs: [
      {
        id: 'output1',
        name: 'Processed Text',
        type: 'string',
        handleColor: '#FF6B6B',
      },
      {
        id: 'output2',
        name: 'Processed Number',
        type: 'number',
        handleColor: '#4ECDC4',
      },
    ],
  },
  render: (args) => {
    const [textValue, setTextValue] = useState('Hello World');
    const [numberValue, setNumberValue] = useState(42);

    const inputsWithState = args.inputs?.map((input) => {
      // Check if this is a regular Input (not InputPanel) and has allowInput
      if ('type' in input && 'allowInput' in input && input.allowInput) {
        if (input.type === 'string') {
          return {
            ...input,
            value: textValue,
            onChange: (value: string) => setTextValue(value),
          };
        } else if (input.type === 'number') {
          return {
            ...input,
            value: numberValue,
            onChange: (value: number) => setNumberValue(value),
          };
        }
      }
      return input;
    });

    return (
      <div className='space-y-4'>
        <div className='text-primary-white text-sm'>
          <p>Text Value: {textValue}</p>
          <p>Number Value: {numberValue}</p>
        </div>
        <ConfigurableNode {...args} inputs={inputsWithState} />
      </div>
    );
  },
} satisfies Story;

export const WithInputComponentsInPanels = {
  args: {
    name: 'Advanced Interactive Node',
    headerColor: '#8B5CF6',
    inputs: [
      {
        id: 'input1',
        name: 'Direct Input',
        type: 'string',
        handleColor: '#45B7D1',
        allowInput: true,
      },
      {
        id: 'panel1',
        name: 'Settings Panel',
        inputs: [
          {
            id: 'panel1_input1',
            name: 'Threshold',
            type: 'number',
            handleColor: '#96CEB4',
            allowInput: true,
          },
          {
            id: 'panel1_input2',
            name: 'Config String',
            type: 'string',
            handleColor: '#4ECDC4',
            allowInput: true,
          },
          {
            id: 'panel1_input3',
            name: 'Read-only Setting',
            type: 'string',
            handleColor: '#FF6B6B',
            allowInput: false,
          },
        ],
      },
    ],
    outputs: [
      { id: 'output1', name: 'Result', type: 'string', handleColor: '#FFD93D' },
    ],
  },
  render: (args) => {
    const [directValue, setDirectValue] = useState('Direct Input Value');
    const [thresholdValue, setThresholdValue] = useState(75);
    const [configValue, setConfigValue] = useState('Configuration');

    const inputsWithState = args.inputs?.map((input) => {
      if ('inputs' in input) {
        // This is a panel
        return {
          ...input,
          inputs: input.inputs.map((panelInput) => {
            if (panelInput.allowInput) {
              if (panelInput.type === 'string') {
                return {
                  ...panelInput,
                  value:
                    panelInput.id === 'panel1_input2'
                      ? configValue
                      : directValue,
                  onChange: (value: string) => {
                    if (panelInput.id === 'panel1_input2') {
                      setConfigValue(value);
                    } else {
                      setDirectValue(value);
                    }
                  },
                };
              } else if (panelInput.type === 'number') {
                return {
                  ...panelInput,
                  value: thresholdValue,
                  onChange: (value: number) => setThresholdValue(value),
                };
              }
            }
            return panelInput;
          }),
        };
      } else if ('type' in input && 'allowInput' in input && input.allowInput) {
        if (input.type === 'string') {
          return {
            ...input,
            value: directValue,
            onChange: (value: string) => setDirectValue(value),
          };
        }
      }
      return input;
    });

    return (
      <div className='space-y-4'>
        <div className='text-primary-white text-sm'>
          <p>Direct Value: {directValue}</p>
          <p>Threshold: {thresholdValue}</p>
          <p>Config: {configValue}</p>
        </div>
        <ConfigurableNode {...args} inputs={inputsWithState} />
      </div>
    );
  },
} satisfies Story;

export const AdjustableParentWidthWithFullWidth = {
  argTypes: {
    parentWidth: { control: { type: 'range', min: 1, max: 1000, step: 30 } },
    parentBorder: { control: { type: 'boolean' } },
  },
  args: {
    parentWidth: 300,
    parentBorder: true,

    name: 'Responsive Data Node',
    headerColor: '#B8860B',
    inputs: [
      {
        id: 'input1',
        name: 'Text Input',
        type: 'string',
        handleColor: '#45B7D1',
      },
      {
        id: 'input2',
        name: 'Numeric Input',
        type: 'number',
        handleColor: '#96CEB4',
      },
    ],
    outputs: [
      {
        id: 'output1',
        name: 'Processed Text',
        type: 'string',
        handleColor: '#FECA57',
      },
      {
        id: 'output2',
        name: 'Processed Number',
        type: 'number',
        handleColor: '#FF9FF3',
      },
    ],
  },
  render: ({ parentWidth, parentBorder, ...args }) => {
    return (
      <div
        className={cn(
          'flex flex-col gap-2 border-5',
          parentBorder ? 'border-red-900' : 'border-transparent',
        )}
        style={{ width: parentWidth }}
      >
        <ConfigurableNode className='w-full' {...args} />
      </div>
    );
  },
} satisfies StoryObj<
  Meta<ConfigurableNodeProps & { parentWidth: number; parentBorder: boolean }>
>;
