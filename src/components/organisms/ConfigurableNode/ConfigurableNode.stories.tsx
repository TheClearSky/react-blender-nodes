import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import {
  ConfigurableNode,
  type ConfigurableNodeProps,
} from './ConfigurableNode';
import { cn } from '@/utils/cnHelper';

import { handleShapesMap } from './ContextAwareHandle';

const meta = {
  component: ConfigurableNode,
  argTypes: {},
  decorators: [
    (Story) => (
      <div className='flex justify-center items-center min-h-screen p-8'>
        <Story />
      </div>
    ),
  ],
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
        handleColor: '#00BFFF',
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
        handleColor: '#00BFFF',
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
            handleColor: '#00FFFF',
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
        handleColor: '#00BFFF',
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
        handleColor: '#00FFFF',
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
        handleColor: '#00BFFF',
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
            handleColor: '#00FFFF',
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
        handleColor: '#00BFFF',
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

export const AllHandleShapesAsInputs = {
  args: {
    name: 'All Handle Shapes - Inputs',
    headerColor: '#2C3E50',
    inputs: [
      {
        id: 'panel1',
        name: 'Basic Shapes',
        inputs: [
          {
            id: 'input1',
            name: 'Circle',
            type: 'string',
            handleColor: '#E74C3C',
            handleShape: handleShapesMap.circle,
            allowInput: true,
          },
          {
            id: 'input2',
            name: 'Square',
            type: 'number',
            handleColor: '#3498DB',
            handleShape: handleShapesMap.square,
            allowInput: true,
          },
          {
            id: 'input3',
            name: 'Rectangle',
            type: 'string',
            handleColor: '#2ECC71',
            handleShape: handleShapesMap.rectangle,
            allowInput: false,
          },
        ],
      },
      {
        id: 'panel2',
        name: 'Pattern Shapes',
        inputs: [
          {
            id: 'input4',
            name: 'List',
            type: 'string',
            handleColor: '#F39C12',
            handleShape: handleShapesMap.list,
            allowInput: true,
          },
          {
            id: 'input5',
            name: 'Grid',
            type: 'number',
            handleColor: '#9B59B6',
            handleShape: handleShapesMap.grid,
            allowInput: true,
          },
          {
            id: 'input6',
            name: 'Cross',
            type: 'string',
            handleColor: '#1ABC9C',
            handleShape: handleShapesMap.cross,
            allowInput: false,
          },
        ],
      },
      {
        id: 'panel3',
        name: 'Geometric Shapes',
        inputs: [
          {
            id: 'input7',
            name: 'Diamond',
            type: 'string',
            handleColor: '#E67E22',
            handleShape: handleShapesMap.diamond,
            allowInput: true,
          },
          {
            id: 'input8',
            name: 'Trapezium',
            type: 'number',
            handleColor: '#34495E',
            handleShape: handleShapesMap.trapezium,
            allowInput: true,
          },
          {
            id: 'input9',
            name: 'Hexagon',
            type: 'string',
            handleColor: '#16A085',
            handleShape: handleShapesMap.hexagon,
            allowInput: false,
          },
        ],
      },
      {
        id: 'panel4',
        name: 'Special Shapes',
        inputs: [
          {
            id: 'input10',
            name: 'Star',
            type: 'string',
            handleColor: '#F1C40F',
            handleShape: handleShapesMap.star,
            allowInput: true,
          },
          {
            id: 'input11',
            name: 'Zigzag',
            type: 'number',
            handleColor: '#E91E63',
            handleShape: handleShapesMap.zigzag,
            allowInput: true,
          },
          {
            id: 'input12',
            name: 'Sparkle',
            type: 'string',
            handleColor: '#FF9800',
            handleShape: handleShapesMap.sparkle,
            allowInput: false,
          },
          {
            id: 'input13',
            name: 'Parallelogram',
            type: 'number',
            handleColor: '#607D8B',
            handleShape: handleShapesMap.parallelogram,
            allowInput: true,
          },
        ],
      },
    ],
    outputs: [],
  },
} satisfies Story;

export const AllHandleShapesAsOutputs = {
  args: {
    name: 'All Handle Shapes - Outputs',
    headerColor: '#2C3E50',
    inputs: [],
    outputs: [
      {
        id: 'output1',
        name: 'Circle Output',
        type: 'string',
        handleColor: '#E74C3C',
        handleShape: handleShapesMap.circle,
      },
      {
        id: 'output2',
        name: 'Square Output',
        type: 'number',
        handleColor: '#3498DB',
        handleShape: handleShapesMap.square,
      },
      {
        id: 'output3',
        name: 'Rectangle Output',
        type: 'string',
        handleColor: '#2ECC71',
        handleShape: handleShapesMap.rectangle,
      },
      {
        id: 'output4',
        name: 'List Output',
        type: 'string',
        handleColor: '#F39C12',
        handleShape: handleShapesMap.list,
      },
      {
        id: 'output5',
        name: 'Grid Output',
        type: 'number',
        handleColor: '#9B59B6',
        handleShape: handleShapesMap.grid,
      },
      {
        id: 'output6',
        name: 'Cross Output',
        type: 'string',
        handleColor: '#1ABC9C',
        handleShape: handleShapesMap.cross,
      },
      {
        id: 'output7',
        name: 'Diamond Output',
        type: 'string',
        handleColor: '#E67E22',
        handleShape: handleShapesMap.diamond,
      },
      {
        id: 'output8',
        name: 'Trapezium Output',
        type: 'number',
        handleColor: '#34495E',
        handleShape: handleShapesMap.trapezium,
      },
      {
        id: 'output9',
        name: 'Hexagon Output',
        type: 'string',
        handleColor: '#16A085',
        handleShape: handleShapesMap.hexagon,
      },
      {
        id: 'output10',
        name: 'Star Output',
        type: 'string',
        handleColor: '#F1C40F',
        handleShape: handleShapesMap.star,
      },
      {
        id: 'output11',
        name: 'Zigzag Output',
        type: 'number',
        handleColor: '#E91E63',
        handleShape: handleShapesMap.zigzag,
      },
      {
        id: 'output12',
        name: 'Sparkle Output',
        type: 'string',
        handleColor: '#FF9800',
        handleShape: handleShapesMap.sparkle,
      },
      {
        id: 'output13',
        name: 'Parallelogram Output',
        type: 'number',
        handleColor: '#607D8B',
        handleShape: handleShapesMap.parallelogram,
      },
    ],
  },
} satisfies Story;
