import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { NodeTypeEditDrawer } from './NodeTypeEditDrawer';
import { Button } from '@/components/atoms';
import type {
  TypeOfInput,
  TypeOfInputPanel,
} from '@/utils/nodeStateManagement/types';

const meta = {
  title: 'Molecules/NodeTypeEditDrawer',
  component: NodeTypeEditDrawer,
  args: {
    isOpen: false,
    onClose: () => {},
    nodeTypeId: null,
    nodeTypeName: null,
    nodeTypeHeaderColor: null,
    nodeTypeInputs: null,
    nodeTypeOutputs: null,
    onSave: () => {},
  },
  decorators: [
    (Story) => (
      <div className='relative w-full h-[700px] bg-primary-black overflow-hidden'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof NodeTypeEditDrawer>;

export default meta;
type Story = StoryObj<typeof meta>;

function FlatInputsTemplate() {
  const [isOpen, setIsOpen] = useState(false);
  const [inputs, setInputs] = useState<(TypeOfInput | TypeOfInputPanel)[]>([
    { name: 'Position X', dataType: 'number' },
    { name: 'Position Y', dataType: 'number' },
    { name: 'Label', dataType: 'string', allowInput: true },
    { name: 'Opacity', dataType: 'number' },
  ]);
  const [outputs, setOutputs] = useState<TypeOfInput[]>([
    { name: 'Result', dataType: 'string' },
    { name: 'Status', dataType: 'number' },
  ]);

  return (
    <>
      <Button size='small' onClick={() => setIsOpen(true)} className='m-4'>
        Edit Node Type
      </Button>
      <div className='absolute top-0 right-0 m-4 text-primary-white text-xs font-main'>
        <div className='font-medium mb-1'>Current order:</div>
        <div className='text-secondary-light-gray'>
          Inputs:{' '}
          {inputs
            .map((i) => ('inputs' in i ? `[${i.name}]` : i.name))
            .join(', ')}
        </div>
        <div className='text-secondary-light-gray'>
          Outputs: {outputs.map((o) => o.name).join(', ')}
        </div>
      </div>
      <NodeTypeEditDrawer
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        nodeTypeId='test-node-type'
        nodeTypeName='Data Processor'
        nodeTypeHeaderColor='#C44536'
        nodeTypeInputs={inputs}
        nodeTypeOutputs={outputs}
        onSave={(_nodeTypeId, updates) => {
          if (updates.inputs) setInputs(updates.inputs);
          if (updates.outputs) setOutputs(updates.outputs);
          setIsOpen(false);
        }}
      />
    </>
  );
}

export const FlatInputs: Story = {
  render: () => <FlatInputsTemplate />,
};

function WithPanelsTemplate() {
  const [isOpen, setIsOpen] = useState(false);
  const [inputs, setInputs] = useState<(TypeOfInput | TypeOfInputPanel)[]>([
    { name: 'Primary Input', dataType: 'string', allowInput: true },
    {
      name: 'Transform',
      inputs: [
        { name: 'Scale X', dataType: 'number' },
        { name: 'Scale Y', dataType: 'number' },
        { name: 'Rotation', dataType: 'number' },
      ],
    },
    {
      name: 'Color Settings',
      inputs: [
        { name: 'Hue', dataType: 'number' },
        { name: 'Saturation', dataType: 'number' },
      ],
    },
    { name: 'Secondary Input', dataType: 'number' },
  ]);
  const [outputs, setOutputs] = useState<TypeOfInput[]>([
    { name: 'Final Result', dataType: 'string' },
    { name: 'Debug Output', dataType: 'number' },
  ]);

  return (
    <>
      <Button size='small' onClick={() => setIsOpen(true)} className='m-4'>
        Edit Advanced Processor
      </Button>
      <div className='absolute top-0 right-0 m-4 text-primary-white text-xs font-main max-w-[300px]'>
        <div className='font-medium mb-1'>Current structure:</div>
        <div className='text-secondary-light-gray flex flex-col gap-0.5'>
          {inputs.map((input, index) =>
            'inputs' in input ? (
              <div key={index}>
                <span className='text-primary-white'>[{input.name}]</span>:{' '}
                {input.inputs.map((i) => i.name).join(', ')}
              </div>
            ) : (
              <div key={index}>{input.name}</div>
            ),
          )}
        </div>
      </div>
      <NodeTypeEditDrawer
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        nodeTypeId='advanced-processor'
        nodeTypeName='Advanced Processor'
        nodeTypeHeaderColor='#8B6914'
        nodeTypeInputs={inputs}
        nodeTypeOutputs={outputs}
        onSave={(_nodeTypeId, updates) => {
          if (updates.inputs) setInputs(updates.inputs);
          if (updates.outputs) setOutputs(updates.outputs);
          setIsOpen(false);
        }}
      />
    </>
  );
}

export const WithPanels: Story = {
  render: () => <WithPanelsTemplate />,
};

function ManyInputsTemplate() {
  const [isOpen, setIsOpen] = useState(false);
  const [inputs, setInputs] = useState<(TypeOfInput | TypeOfInputPanel)[]>([
    { name: 'Input A', dataType: 'string' },
    { name: 'Input B', dataType: 'number' },
    { name: 'Input C', dataType: 'string' },
    {
      name: 'Settings Panel',
      inputs: [
        { name: 'Threshold', dataType: 'number' },
        { name: 'Mode', dataType: 'string' },
        { name: 'Iterations', dataType: 'number' },
        { name: 'Tolerance', dataType: 'number' },
      ],
    },
    { name: 'Input D', dataType: 'number' },
    { name: 'Input E', dataType: 'string' },
    {
      name: 'Debug Panel',
      inputs: [
        { name: 'Verbose', dataType: 'string' },
        { name: 'Log Level', dataType: 'number' },
      ],
    },
    { name: 'Input F', dataType: 'number' },
  ]);
  const [outputs, setOutputs] = useState<TypeOfInput[]>([
    { name: 'Output 1', dataType: 'string' },
    { name: 'Output 2', dataType: 'number' },
    { name: 'Output 3', dataType: 'string' },
    { name: 'Output 4', dataType: 'number' },
    { name: 'Output 5', dataType: 'string' },
  ]);

  return (
    <>
      <Button size='small' onClick={() => setIsOpen(true)} className='m-4'>
        Edit Complex Node
      </Button>
      <NodeTypeEditDrawer
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        nodeTypeId='complex-node'
        nodeTypeName='Complex Node'
        nodeTypeHeaderColor='#2D5A27'
        nodeTypeInputs={inputs}
        nodeTypeOutputs={outputs}
        onSave={(_nodeTypeId, updates) => {
          if (updates.inputs) setInputs(updates.inputs);
          if (updates.outputs) setOutputs(updates.outputs);
          setIsOpen(false);
        }}
      />
    </>
  );
}

export const ManyInputs: Story = {
  render: () => <ManyInputsTemplate />,
};

function NameAndColorOnlyTemplate() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button size='small' onClick={() => setIsOpen(true)} className='m-4'>
        Edit (No Inputs/Outputs)
      </Button>
      <NodeTypeEditDrawer
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        nodeTypeId='simple-node'
        nodeTypeName='Simple Node'
        nodeTypeHeaderColor='#4772B3'
        nodeTypeInputs={null}
        nodeTypeOutputs={null}
        onSave={() => setIsOpen(false)}
      />
    </>
  );
}

export const NameAndColorOnly: Story = {
  render: () => <NameAndColorOnlyTemplate />,
};

function EmptyNodeGroupTemplate() {
  const [isOpen, setIsOpen] = useState(false);
  const [inputs, setInputs] = useState<(TypeOfInput | TypeOfInputPanel)[]>([]);
  const [outputs, setOutputs] = useState<TypeOfInput[]>([]);

  return (
    <>
      <Button size='small' onClick={() => setIsOpen(true)} className='m-4'>
        Edit Empty Group
      </Button>
      <NodeTypeEditDrawer
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        nodeTypeId='empty-group'
        nodeTypeName='New Node Group'
        nodeTypeHeaderColor='#344621'
        nodeTypeInputs={inputs}
        nodeTypeOutputs={outputs}
        onSave={(_nodeTypeId, updates) => {
          if (updates.inputs) setInputs(updates.inputs);
          if (updates.outputs) setOutputs(updates.outputs);
          setIsOpen(false);
        }}
      />
    </>
  );
}

export const EmptyNodeGroup: Story = {
  render: () => <EmptyNodeGroupTemplate />,
};
