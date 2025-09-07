import type { Meta, StoryObj } from '@storybook/react-vite';

import { FullGraph, useFullGraph } from './FullGraph';
import { Position } from '@xyflow/react';
import { type Nodes, type Edges } from './types';
import {
  makeDataTypeWithAutoInfer,
  makeTypeOfNodeWithAutoInfer,
} from '@/utils/nodeStateManagement/types';
import { Button } from '@/components/atoms';
import { handleShapesMap } from '@/components/organisms/ConfigurableNode/ContextAwareHandle';

const meta = {
  component: FullGraph,
} satisfies Meta<typeof FullGraph>;

export default meta;

const dataTypesExample1Data = {
  dataType1: makeDataTypeWithAutoInfer({
    name: 'String Data',
    underlyingType: 'string',
    color: '#4A90E2',
  }),
  dataType2: makeDataTypeWithAutoInfer({
    name: 'Number Data',
    underlyingType: 'number',
    color: '#7ED321',
  }),
};

const typeOfNodesExample1Data = {
  nodeType1: makeTypeOfNodeWithAutoInfer<keyof typeof dataTypesExample1Data>({
    name: 'Data Processor',
    headerColor: '#C44536',
    inputs: [
      { name: 'Text Input', dataType: 'dataType1' },
      { name: 'Numeric Input', dataType: 'dataType2' },
    ],
    outputs: [{ name: 'Processed Output', dataType: 'dataType1' }],
  }),
  nodeType2: makeTypeOfNodeWithAutoInfer<keyof typeof dataTypesExample1Data>({
    name: 'String Transformer',
    headerColor: '#2D5A87',
    inputs: [{ name: 'Input String', dataType: 'dataType1' }],
    outputs: [{ name: 'Transformed String', dataType: 'dataType1' }],
  }),
  nodeTypeWithPanels: makeTypeOfNodeWithAutoInfer<
    keyof typeof dataTypesExample1Data
  >({
    name: 'Advanced Node',
    headerColor: '#B8860B',
    inputs: [
      { name: 'Direct Input', dataType: 'dataType1' },
      {
        name: 'Advanced Settings',
        inputs: [
          { name: 'Setting One', dataType: 'dataType2' },
          { name: 'Setting Two', dataType: 'dataType1' },
        ],
      },
      {
        name: 'Debug Options',
        inputs: [{ name: 'Debug Mode', dataType: 'dataType1' }],
      },
    ],
    outputs: [{ name: 'Final Result', dataType: 'dataType1' }],
  }),
  inputValidator: makeTypeOfNodeWithAutoInfer<
    keyof typeof dataTypesExample1Data
  >({
    name: 'Input Validator',
    headerColor: '#C44536',
    inputs: [
      { name: 'Raw Data', dataType: 'dataType1' },
      { name: 'Validation Rules', dataType: 'dataType1' },
    ],
    outputs: [
      { name: 'Validated Data', dataType: 'dataType1' },
      { name: 'Validation Status', dataType: 'dataType1' },
      { name: 'Error Messages', dataType: 'dataType1' },
    ],
  }),
  dataSource: makeTypeOfNodeWithAutoInfer<keyof typeof dataTypesExample1Data>({
    name: 'Data Source',
    headerColor: '#C44536',
    inputs: [
      { name: 'Text Input', dataType: 'dataType1', allowInput: true },
      { name: 'Numeric Input', dataType: 'dataType2', allowInput: true },
    ],
    outputs: [
      { name: 'Primary Output', dataType: 'dataType2' },
      { name: 'Secondary Output', dataType: 'dataType2' },
      { name: 'Metadata Output', dataType: 'dataType1' },
    ],
  }),
  dataTransformer: makeTypeOfNodeWithAutoInfer<
    keyof typeof dataTypesExample1Data
  >({
    name: 'Data Transformer',
    headerColor: '#2D5A87',
    inputs: [
      { name: 'Input String', dataType: 'dataType1' },
      { name: 'Input Number', dataType: 'dataType2' },
      { name: 'Config Input', dataType: 'dataType1' },
    ],
    outputs: [
      { name: 'Transformed String', dataType: 'dataType1' },
      { name: 'Transformed Number', dataType: 'dataType2' },
      { name: 'Status Output', dataType: 'dataType1' },
    ],
  }),
  dataSink: makeTypeOfNodeWithAutoInfer<keyof typeof dataTypesExample1Data>({
    name: 'Data Sink',
    headerColor: '#B8860B',
    inputs: [
      { name: 'Final Input', dataType: 'dataType1' },
      { name: 'Result Input', dataType: 'dataType2' },
      { name: 'Status Input', dataType: 'dataType1' },
    ],
    outputs: [
      { name: 'Final Output', dataType: 'dataType1' },
      { name: 'Debug Output', dataType: 'dataType1' },
    ],
  }),
};

const nodesExample1Data: Nodes = [
  {
    id: 'n5',
    position: { x: -150, y: 440 },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    type: 'configurableNode',
    width: 400,
    data: {
      name: 'Input Validator',
      headerColor: '#C44536',
      inputs: [
        {
          name: 'Raw Data',
          id: 'input1node5',
          type: 'string',
          handleColor: '#00BFFF',
          handleShape: handleShapesMap.square,
        },
        {
          name: 'Validation Rules',
          id: 'input2node5',
          type: 'string',
          handleColor: '#96CEB4',
        },
      ],
      outputs: [
        {
          name: 'Validated Data',
          id: 'output1node5',
          type: 'string',
          handleColor: '#00FFFF',
          handleShape: handleShapesMap.list,
        },
        {
          name: 'Validation Status',
          id: 'output2node5',
          type: 'string',
          handleColor: '#FECA57',
        },
        {
          name: 'Error Messages',
          id: 'output3node5',
          type: 'string',
          handleColor: '#FF6B6B',
          handleShape: handleShapesMap.rectangle,
        },
      ],
    },
  },
  {
    id: 'n1',
    position: { x: 400, y: -20 },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    type: 'configurableNode',
    width: 400,
    data: {
      name: 'Data Source',
      headerColor: '#C44536',
      outputs: [
        {
          name: 'Primary Output',
          id: 'output1node1',
          type: 'number',
          handleColor: '#FF6B6B',
          handleShape: handleShapesMap.grid,
        },
        {
          name: 'Secondary Output',
          id: 'output2node1',
          type: 'number',
          handleColor: '#00FFFF',
        },
        {
          name: 'Metadata Output',
          id: 'output3node1',
          type: 'string',
          handleColor: '#FECA57',
        },
      ],
      inputs: [
        {
          name: 'Text Input',
          id: 'input1node1',
          type: 'string',
          handleColor: '#00BFFF',
          handleShape: handleShapesMap.rectangle,
          allowInput: true,
        },
        {
          name: 'Numeric Input',
          id: 'input2node1',
          type: 'number',
          handleColor: '#96CEB4',
          allowInput: true,
        },
      ],
    },
  },
  {
    id: 'n2',
    position: { x: 1000, y: 200 },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    type: 'configurableNode',
    width: 400,
    data: {
      name: 'Data Transformer',
      headerColor: '#2D5A87',
      inputs: [
        {
          name: 'Input String',
          id: 'input1node2',
          type: 'string',
          handleColor: '#00BFFF',
          handleShape: handleShapesMap.diamond,
        },
        {
          name: 'Input Number',
          id: 'input2node2',
          type: 'number',
          handleColor: '#96CEB4',
          handleShape: handleShapesMap.hexagon,
        },
        {
          name: 'Config Input',
          id: 'input3node2',
          type: 'string',
          handleColor: '#00FFFF',
        },
      ],
      outputs: [
        {
          name: 'Transformed String',
          id: 'output1node2',
          type: 'string',
          handleColor: '#FECA57',
          handleShape: handleShapesMap.square,
        },
        {
          name: 'Transformed Number',
          id: 'output2node2',
          type: 'number',
          handleColor: '#FF9FF3',
          handleShape: handleShapesMap.star,
        },
        {
          name: 'Status Output',
          id: 'output3node2',
          type: 'string',
          handleColor: '#A8E6CF',
          handleShape: handleShapesMap.cross,
        },
      ],
    },
  },
  {
    id: 'n4',
    position: { x: 1660, y: 588 },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    type: 'configurableNode',
    width: 400,
    data: {
      name: 'Advanced Processor',
      headerColor: '#B8860B',
      inputs: [
        {
          name: 'Primary Input',
          id: 'input1node4',
          type: 'string',
          handleColor: '#00BFFF',
          allowInput: true,
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
              handleShape: handleShapesMap.trapezium,
              allowInput: true,
            },
            {
              id: 'panel1_input2',
              name: 'Configuration String',
              type: 'string',
              handleColor: '#00FFFF',
              allowInput: true,
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
        {
          id: 'output2',
          name: 'Debug Output',
          type: 'string',
          handleColor: '#FF6B6B',
        },
      ],
    },
  },
  {
    id: 'n3',
    position: { x: 2000, y: 70 },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    type: 'configurableNode',
    width: 400,
    data: {
      name: 'Data Sink',
      headerColor: '#B8860B',
      inputs: [
        {
          name: 'Final Input',
          id: 'input1node3',
          type: 'string',
          handleColor: '#FECA57',
          handleShape: handleShapesMap.sparkle,
        },
        {
          name: 'Result Input',
          id: 'input2node3',
          type: 'number',
          handleColor: '#FF9FF3',
          handleShape: handleShapesMap.parallelogram,
        },
        {
          name: 'Status Input',
          id: 'input3node3',
          type: 'string',
          handleColor: '#A8E6CF',
          handleShape: handleShapesMap.zigzag,
        },
      ],
      outputs: [
        {
          name: 'Final Output',
          id: 'output1node3',
          type: 'string',
          handleColor: '#A8E6CF',
        },
        {
          name: 'Result Output',
          id: 'output2node3',
          type: 'number',
          handleColor: '#FFD93D',
        },
      ],
    },
  },
];

const edgesExample1Data: Edges = [
  {
    id: 'n1-n2',
    source: 'n1',
    sourceHandle: 'output2node1',
    target: 'n2',
    targetHandle: 'input1node2',
    type: 'configurableEdge',
  },
  {
    id: 'n2-n3',
    source: 'n2',
    sourceHandle: 'output1node2',
    target: 'n3',
    targetHandle: 'input1node3',
    type: 'configurableEdge',
  },
  {
    id: 'n2-n3-2',
    source: 'n2',
    sourceHandle: 'output2node2',
    target: 'n3',
    targetHandle: 'input2node3',
    type: 'configurableEdge',
  },
  {
    id: 'n2-n4',
    source: 'n2',
    sourceHandle: 'output3node2',
    target: 'n4',
    targetHandle: 'input1node4',
    type: 'configurableEdge',
  },
  {
    id: 'n5-n1',
    source: 'n5',
    sourceHandle: 'output1node5',
    target: 'n1',
    targetHandle: 'input1node1',
    type: 'configurableEdge',
  },
  {
    id: 'n5-n2',
    source: 'n5',
    sourceHandle: 'output2node5',
    target: 'n2',
    targetHandle: 'input3node2',
    type: 'configurableEdge',
  },
];

export const Playground: StoryObj<typeof FullGraph> = {
  args: {},
  render: () => {
    const { state, dispatch } = useFullGraph({
      dataTypes: dataTypesExample1Data,
      typeOfNodes: typeOfNodesExample1Data,
      nodes: nodesExample1Data,
      edges: edgesExample1Data,
      nodeIdToNodeType: {},
    });
    console.log('State', state);

    return (
      <>
        <FullGraph state={state} dispatch={dispatch} />
        <div className='absolute top-0 left-0 p-1 flex gap-1 items-center'>
          <Button
            onClick={() => {
              dispatch({
                type: 'ADD_NODE',
                payload: { type: 'nodeType1', position: { x: 0, y: 0 } },
              });
            }}
            className='text-[15px] leading-[15px]'
          >
            Add Data Processor
          </Button>
          <Button
            onClick={() => {
              dispatch({
                type: 'ADD_NODE',
                payload: {
                  type: 'nodeTypeWithPanels',
                  position: { x: 200, y: 0 },
                },
              });
            }}
            className='text-[15px] leading-[15px]'
          >
            Add Advanced Node
          </Button>
          {/* <Button
            onClick={() => {
              setNodesInner(nodes ?? []);
              setEdgesInner(edges ?? []);
            }}
            className='text-[15px] leading-[15px]'
          >
            Update graph from args
          </Button> */}
          <div className='text-primary-white'>
            {'<- Note: These are part of the story, not the component'}
          </div>
        </div>
      </>
    );
  },
};

export const WithControlledInputs: StoryObj<typeof FullGraph> = {
  args: {},
  render: () => {
    const { state, dispatch } = useFullGraph({
      dataTypes: dataTypesExample1Data,
      typeOfNodes: typeOfNodesExample1Data,
      nodes: [
        {
          id: 'n1',
          position: { x: 0, y: 200 },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          type: 'configurableNode',
          width: 400,
          data: {
            name: 'Interactive Data Source',
            headerColor: '#C44536',
            outputs: [
              {
                name: 'Processed Output',
                id: 'output1',
                type: 'string',
                handleColor: '#FF6B6B',
              },
            ],
            inputs: [
              {
                name: 'Text Input',
                id: 'input1',
                type: 'string',
                handleColor: '#00BFFF',
                allowInput: true,
                value: 'Interactive Text',
                // onChange: (value: string) => {
                //   dispatch({
                //     type: 'UPDATE_INPUT_VALUE',
                //     payload: { nodeId: 'n1', inputId: 'input1', value }
                //   });
                // }
              },
              {
                name: 'Number Input',
                id: 'input2',
                type: 'number',
                handleColor: '#96CEB4',
                allowInput: true,
                value: 42,
                // onChange: (value: number) => {
                //   dispatch({
                //     type: 'UPDATE_INPUT_VALUE',
                //     payload: { nodeId: 'n1', inputId: 'input2', value }
                //   });
                // }
              },
            ],
          },
        },
        {
          id: 'n2',
          position: { x: 500, y: 200 },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          type: 'configurableNode',
          width: 400,
          data: {
            name: 'Advanced Processor',
            headerColor: '#2D5A87',
            inputs: [
              {
                name: 'Primary Input',
                id: 'input1',
                type: 'string',
                handleColor: '#00BFFF',
                allowInput: true,
                value: 'Configuration',
                // onChange: (value: string) => {
                //   dispatch({
                //     type: 'UPDATE_INPUT_VALUE',
                //     payload: { nodeId: 'n2', inputId: 'input1', value }
                //   });
                // }
              },
              {
                id: 'panel1',
                name: 'Settings Panel',
                inputs: [
                  {
                    name: 'Threshold',
                    id: 'panel1_input1',
                    type: 'number',
                    handleColor: '#96CEB4',
                    allowInput: true,
                    value: 75,
                    // onChange: (value: number) => {
                    //   dispatch({
                    //     type: 'UPDATE_INPUT_VALUE',
                    //     payload: { nodeId: 'n2', inputId: 'panel1_input1', value }
                    //   });
                    // }
                  },
                  {
                    name: 'Read-only Setting',
                    id: 'panel1_input2',
                    type: 'string',
                    handleColor: '#00FFFF',
                    allowInput: false,
                  },
                ],
              },
            ],
            outputs: [
              {
                name: 'Final Result',
                id: 'output1',
                type: 'string',
                handleColor: '#FECA57',
              },
            ],
          },
        },
      ],
      edges: [
        {
          id: 'n1-n2',
          source: 'n1',
          sourceHandle: 'output1',
          target: 'n2',
          targetHandle: 'input1',
          type: 'configurableEdge',
        },
      ],
      nodeIdToNodeType: {},
    });

    return (
      <>
        <FullGraph state={state} dispatch={dispatch} />
        <div className='absolute top-0 left-0 p-1 flex gap-1 items-center'>
          <Button
            onClick={() => {
              dispatch({
                type: 'ADD_NODE',
                payload: { type: 'nodeType1', position: { x: 1000, y: 0 } },
              });
            }}
            className='text-[15px] leading-[15px]'
          >
            Add Data Processor
          </Button>
          <div className='text-primary-white'>
            {'<- Interactive inputs managed by state management'}
          </div>
        </div>
      </>
    );
  },
};

export const WithHandleShapes: StoryObj<typeof FullGraph> = {
  args: {},
  render: () => {
    const { state, dispatch } = useFullGraph({
      dataTypes: dataTypesExample1Data,
      typeOfNodes: typeOfNodesExample1Data,
      nodes: [
        {
          id: 'shape-showcase-1',
          position: { x: 0, y: 390 },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          type: 'configurableNode',
          width: 400,
          data: {
            name: 'Handle Shapes Node 1',
            headerColor: '#8B5CF6',
            inputs: [
              {
                id: 'circle-input',
                name: 'Circle Input',
                type: 'string',
                handleColor: '#FF6B6B',
                handleShape: handleShapesMap.circle,
                allowInput: true,
              },
              {
                id: 'square-input',
                name: 'Square Input',
                type: 'string',
                handleColor: '#00FFFF',
                handleShape: handleShapesMap.square,
                allowInput: true,
              },
              {
                id: 'rectangle-input',
                name: 'Rectangle Input',
                type: 'string',
                handleColor: '#00BFFF',
                handleShape: handleShapesMap.rectangle,
                allowInput: true,
              },
            ],
            outputs: [
              {
                id: 'list-output',
                name: 'List Output',
                type: 'string',
                handleColor: '#96CEB4',
                handleShape: handleShapesMap.list,
              },
              {
                id: 'grid-output',
                name: 'Grid Output',
                type: 'string',
                handleColor: '#FECA57',
                handleShape: handleShapesMap.grid,
              },
            ],
          },
        },
        {
          id: 'shape-showcase-2',
          position: { x: 600, y: 200 },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          type: 'configurableNode',
          width: 400,
          data: {
            name: 'Handle Shapes Node 2',
            headerColor: '#2D5A87',
            inputs: [
              {
                id: 'list-input',
                name: 'List Input',
                type: 'string',
                handleColor: '#96CEB4',
                handleShape: handleShapesMap.list,
                allowInput: false,
              },
              {
                id: 'grid-input',
                name: 'Grid Input',
                type: 'string',
                handleColor: '#FECA57',
                handleShape: handleShapesMap.grid,
                allowInput: false,
              },
            ],
            outputs: [
              {
                id: 'circle-output',
                name: 'Circle Output',
                type: 'string',
                handleColor: '#FF9FF3',
                handleShape: handleShapesMap.circle,
              },
              {
                id: 'square-output',
                name: 'Square Output',
                type: 'string',
                handleColor: '#A8E6CF',
                handleShape: handleShapesMap.square,
              },
              {
                id: 'rectangle-output',
                name: 'Rectangle Output',
                type: 'string',
                handleColor: '#FFD93D',
                handleShape: handleShapesMap.rectangle,
              },
            ],
          },
        },
        {
          id: 'shape-showcase-3',
          position: { x: 1200, y: 120 },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          type: 'configurableNode',
          width: 400,
          data: {
            name: 'Mixed Shapes Node',
            headerColor: '#B8860B',
            inputs: [
              {
                id: 'mixed-input-1',
                name: 'Circle Input',
                type: 'string',
                handleColor: '#FF6B6B',
                handleShape: handleShapesMap.circle,
                allowInput: false,
              },
              {
                id: 'mixed-input-2',
                name: 'Square Input',
                type: 'string',
                handleColor: '#00FFFF',
                handleShape: handleShapesMap.square,
                allowInput: false,
              },
            ],
            outputs: [
              {
                id: 'mixed-output',
                name: 'Final Output',
                type: 'string',
                handleColor: '#00FFFF',
                handleShape: handleShapesMap.grid,
              },
            ],
          },
        },
      ],
      edges: [
        {
          id: 'edge-1',
          source: 'shape-showcase-1',
          sourceHandle: 'list-output',
          target: 'shape-showcase-2',
          targetHandle: 'list-input',
          type: 'configurableEdge',
        },
        {
          id: 'edge-2',
          source: 'shape-showcase-1',
          sourceHandle: 'grid-output',
          target: 'shape-showcase-2',
          targetHandle: 'grid-input',
          type: 'configurableEdge',
        },
        {
          id: 'edge-3',
          source: 'shape-showcase-2',
          sourceHandle: 'circle-output',
          target: 'shape-showcase-3',
          targetHandle: 'mixed-input-1',
          type: 'configurableEdge',
        },
        {
          id: 'edge-4',
          source: 'shape-showcase-2',
          sourceHandle: 'square-output',
          target: 'shape-showcase-3',
          targetHandle: 'mixed-input-2',
          type: 'configurableEdge',
        },
      ],
      nodeIdToNodeType: {},
    });

    return (
      <>
        <FullGraph state={state} dispatch={dispatch} />
        <div className='absolute top-0 left-0 p-1 flex gap-1 items-center'>
          <Button
            onClick={() => {
              dispatch({
                type: 'ADD_NODE',
                payload: { type: 'nodeType1', position: { x: 1800, y: 0 } },
              });
            }}
            className='text-[15px] leading-[15px]'
          >
            Add Data Processor
          </Button>
          <Button
            onClick={() => {
              dispatch({
                type: 'ADD_NODE',
                payload: {
                  type: 'nodeTypeWithPanels',
                  position: { x: 1800, y: 200 },
                },
              });
            }}
            className='text-[15px] leading-[15px]'
          >
            Add Advanced Node
          </Button>
          <div className='text-primary-white'>
            {'<- Handle shapes working in ReactFlow! Try connecting the nodes.'}
          </div>
        </div>
      </>
    );
  },
};
