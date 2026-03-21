import type { Meta, StoryObj } from '@storybook/react-vite';

import { FullGraph, useFullGraph } from './';
import { Position } from '@xyflow/react';
import { type Nodes, type Edges } from './types';
import {
  makeDataTypeWithAutoInfer,
  makeTypeOfNodeWithAutoInfer,
} from '@/utils/nodeStateManagement/types';
import { handleShapesMap } from '@/components/organisms/ConfigurableNode';
import state1 from './PlaygroundState1.json';
import { z } from 'zod';
import { standardDataTypes, standardNodeTypes } from '@/utils';
import { makeFunctionImplementationsWithAutoInfer } from '@/utils/nodeRunner/types';
import { constructNodeOfType } from '@/utils/nodeStateManagement/nodes/constructAndModifyNodes';
import type { InputHandleValue } from '@/utils/nodeRunner/types';

const meta = {
  title: 'Organisms/FullGraph',
  component: FullGraph,
} satisfies Meta<typeof FullGraph>;

export default meta;

const exampleDataTypes = {
  rawData: makeDataTypeWithAutoInfer({
    name: 'Raw Data',
    underlyingType: 'string',
    color: '#00BFFF',
    shape: handleShapesMap.square,
  }),
  validationRules: makeDataTypeWithAutoInfer({
    name: 'Validation Rules',
    underlyingType: 'string',
    color: '#96CEB4',
  }),
  validatedData: makeDataTypeWithAutoInfer({
    name: 'Validated Data',
    underlyingType: 'string',
    color: '#00FFFF',
    shape: handleShapesMap.list,
  }),
  validationStatus: makeDataTypeWithAutoInfer({
    name: 'Validation Status',
    underlyingType: 'string',
    color: '#FECA57',
  }),
  errorMessages: makeDataTypeWithAutoInfer({
    name: 'Error Messages',
    underlyingType: 'string',
    color: '#FF6B6B',
    shape: handleShapesMap.rectangle,
  }),
  primaryOutput: makeDataTypeWithAutoInfer({
    name: 'Primary Output',
    underlyingType: 'number',
    color: '#FF6B6B',
    shape: handleShapesMap.grid,
  }),
  secondaryOutput: makeDataTypeWithAutoInfer({
    name: 'Secondary Output',
    underlyingType: 'number',
    color: '#00FFFF',
  }),
  metadataOutput: makeDataTypeWithAutoInfer({
    name: 'Metadata Output',
    underlyingType: 'string',
    color: '#FECA57',
  }),
  textInput: makeDataTypeWithAutoInfer({
    name: 'Text Input',
    underlyingType: 'string',
    color: '#00BFFF',
    shape: handleShapesMap.rectangle,
  }),
  numericInput: makeDataTypeWithAutoInfer({
    name: 'Numeric Input',
    underlyingType: 'number',
    color: '#96CEB4',
  }),
  inputString: makeDataTypeWithAutoInfer({
    name: 'Input String',
    underlyingType: 'string',
    color: '#00BFFF',
    shape: handleShapesMap.diamond,
  }),
  inputNumber: makeDataTypeWithAutoInfer({
    name: 'Input Number',
    underlyingType: 'number',
    color: '#96CEB4',
    shape: handleShapesMap.hexagon,
  }),
  configInput: makeDataTypeWithAutoInfer({
    name: 'Config Input',
    underlyingType: 'string',
    color: '#00FFFF',
  }),
  transformedString: makeDataTypeWithAutoInfer({
    name: 'Transformed String',
    underlyingType: 'string',
    color: '#FECA57',
    shape: handleShapesMap.square,
  }),
  transformedNumber: makeDataTypeWithAutoInfer({
    name: 'Transformed Number',
    underlyingType: 'number',
    color: '#FF9FF3',
    shape: handleShapesMap.star,
  }),
  statusOutput: makeDataTypeWithAutoInfer({
    name: 'Status Output',
    underlyingType: 'string',
    color: '#A8E6CF',
    shape: handleShapesMap.cross,
  }),
  primaryInput: makeDataTypeWithAutoInfer({
    name: 'Primary Input',
    underlyingType: 'string',
    color: '#00BFFF',
    shape: handleShapesMap.diamond,
  }),
  thresholdValue: makeDataTypeWithAutoInfer({
    name: 'Threshold Value',
    underlyingType: 'number',
    color: '#96CEB4',
    shape: handleShapesMap.trapezium,
    allowInput: true,
  }),
  configurationString: makeDataTypeWithAutoInfer({
    name: 'Configuration String',
    underlyingType: 'string',
    color: '#00FFFF',
    allowInput: true,
  }),
  maxIterations: makeDataTypeWithAutoInfer({
    name: 'Max Iterations',
    underlyingType: 'number',
    color: '#FF6B6B',
    shape: handleShapesMap.cross,
  }),
  debugMode: makeDataTypeWithAutoInfer({
    name: 'Debug Mode',
    underlyingType: 'string',
    color: '#FECA57',
  }),
  verboseLogging: makeDataTypeWithAutoInfer({
    name: 'Verbose Logging',
    underlyingType: 'string',
    color: '#FF9FF3',
  }),
  secondaryInput: makeDataTypeWithAutoInfer({
    name: 'Secondary Input',
    underlyingType: 'number',
    color: '#A8E6CF',
  }),
  finalResult: makeDataTypeWithAutoInfer({
    name: 'Final Result',
    underlyingType: 'string',
    color: '#FFD93D',
  }),
  debugOutput: makeDataTypeWithAutoInfer({
    name: 'Debug Output',
    underlyingType: 'string',
    color: '#FF6B6B',
  }),
  finalInput: makeDataTypeWithAutoInfer({
    name: 'Final Input',
    underlyingType: 'string',
    color: '#FECA57',
    shape: handleShapesMap.sparkle,
  }),
  resultInput: makeDataTypeWithAutoInfer({
    name: 'Result Input',
    underlyingType: 'number',
    color: '#FF9FF3',
    shape: handleShapesMap.parallelogram,
  }),
  statusInput: makeDataTypeWithAutoInfer({
    name: 'Status Input',
    underlyingType: 'string',
    color: '#A8E6CF',
    shape: handleShapesMap.zigzag,
  }),
  finalOutput: makeDataTypeWithAutoInfer({
    name: 'Final Output',
    underlyingType: 'string',
    color: '#A8E6CF',
  }),
  resultOutput: makeDataTypeWithAutoInfer({
    name: 'Result Output',
    underlyingType: 'number',
    color: '#FFD93D',
  }),
  inferredDataType: makeDataTypeWithAutoInfer({
    name: 'Inferred Data',
    underlyingType: 'inferFromConnection',
    color: '#C06062',
    shape: handleShapesMap.list,
  }),
  secondInferredDataType: makeDataTypeWithAutoInfer({
    name: 'Second Inferred Data',
    underlyingType: 'inferFromConnection',
    color: '#A98AD9',
    shape: handleShapesMap.diamond,
  }),
  thirdInferredDataType: makeDataTypeWithAutoInfer({
    name: 'Third Inferred Data',
    underlyingType: 'inferFromConnection',
    color: '#08B49F',
    shape: handleShapesMap.diamond,
  }),
  complexDataType: makeDataTypeWithAutoInfer({
    name: 'Complex Data',
    underlyingType: 'complex',
    color: '#59BE26',
    complexSchema: z.object({
      name: z.string(),
      age: z.number(),
    }),
    shape: handleShapesMap.trapezium,
  }),
  complexDataType2: makeDataTypeWithAutoInfer({
    name: 'Complex Data 2',
    underlyingType: 'complex',
    color: '#C40E1E',
    complexSchema: z.object({
      name: z.string(),
      age: z.number(),
    }),
    shape: handleShapesMap.trapezium,
  }),
  complexDataType3: makeDataTypeWithAutoInfer({
    name: 'Complex Data 3',
    underlyingType: 'complex',
    color: '#DCEF88',
    complexSchema: z.object({
      name: z.string(),
    }),
    shape: handleShapesMap.trapezium,
  }),
  booleanDataType: makeDataTypeWithAutoInfer({
    name: 'Boolean Data',
    underlyingType: 'boolean',
    color: '#FF6B6B',
    shape: handleShapesMap.diamond,
    allowInput: true,
  }),
  ...standardDataTypes,
};

const exampleTypeOfNodes = {
  inputValidator: makeTypeOfNodeWithAutoInfer<keyof typeof exampleDataTypes>({
    name: 'Input Validator',
    headerColor: '#C44536',
    locationInContextMenu: ['Data'],
    inputs: [
      { name: 'Raw Data', dataType: 'rawData' },
      { name: 'Validation Rules', dataType: 'validationRules' },
    ],
    outputs: [
      { name: 'Validated Data', dataType: 'validatedData' },
      { name: 'Validation Status', dataType: 'validationStatus' },
      { name: 'Error Messages', dataType: 'errorMessages' },
    ],
  }),
  dataSource: makeTypeOfNodeWithAutoInfer<keyof typeof exampleDataTypes>({
    name: 'Data Source',
    headerColor: '#C44536',
    locationInContextMenu: ['Data'],
    inputs: [
      { name: 'Text Input', dataType: 'textInput' },
      { name: 'Numeric Input', dataType: 'numericInput' },
    ],
    outputs: [
      { name: 'Primary Output', dataType: 'primaryOutput' },
      { name: 'Secondary Output', dataType: 'secondaryOutput' },
      { name: 'Metadata Output', dataType: 'metadataOutput' },
    ],
  }),
  dataTransformer: makeTypeOfNodeWithAutoInfer<keyof typeof exampleDataTypes>({
    name: 'Data Transformer',
    headerColor: '#2D5A87',
    locationInContextMenu: ['Processing'],
    inputs: [
      { name: 'Input String', dataType: 'inputString' },
      { name: 'Input Number', dataType: 'inputNumber' },
      { name: 'Config Input', dataType: 'configInput' },
    ],
    outputs: [
      { name: 'Transformed String', dataType: 'transformedString' },
      { name: 'Transformed Number', dataType: 'transformedNumber' },
      { name: 'Status Output', dataType: 'statusOutput' },
    ],
  }),
  advancedProcessor: makeTypeOfNodeWithAutoInfer<keyof typeof exampleDataTypes>(
    {
      name: 'Advanced Processor',
      headerColor: '#B8860B',
      locationInContextMenu: ['Processing'],
      inputs: [
        { name: 'Primary Input', dataType: 'primaryInput' },
        {
          name: 'Advanced Settings',
          inputs: [
            { name: 'Threshold Value', dataType: 'thresholdValue' },
            { name: 'Configuration String', dataType: 'configurationString' },
            { name: 'Max Iterations', dataType: 'maxIterations' },
          ],
        },
        {
          name: 'Debug Options',
          inputs: [
            { name: 'Debug Mode', dataType: 'debugMode' },
            { name: 'Verbose Logging', dataType: 'verboseLogging' },
          ],
        },
        { name: 'Secondary Input', dataType: 'secondaryInput' },
      ],
      outputs: [
        { name: 'Final Result', dataType: 'finalResult' },
        { name: 'Debug Output', dataType: 'debugOutput' },
      ],
    },
  ),
  dataSink: makeTypeOfNodeWithAutoInfer<keyof typeof exampleDataTypes>({
    name: 'Data Sink',
    headerColor: '#B8860B',
    locationInContextMenu: ['Data'],
    inputs: [
      { name: 'Final Input', dataType: 'finalInput' },
      { name: 'Result Input', dataType: 'resultInput' },
      { name: 'Status Input', dataType: 'statusInput' },
    ],
    outputs: [
      { name: 'Final Output', dataType: 'finalOutput' },
      { name: 'Result Output', dataType: 'resultOutput' },
    ],
  }),
  inferNode: makeTypeOfNodeWithAutoInfer<keyof typeof exampleDataTypes>({
    name: 'Infer Node',
    headerColor: '#AB3126',
    locationInContextMenu: ['Inference'],
    inputs: [
      { name: 'Inferred Data Input', dataType: 'inferredDataType' },
      {
        name: 'Second Inferred Data Input',
        dataType: 'secondInferredDataType',
      },
      {
        name: 'Second Inferred Data Input 2',
        dataType: 'secondInferredDataType',
      },
    ],
    outputs: [
      { name: 'Inferred Data Output', dataType: 'inferredDataType' },
      { name: 'Inferred Data Output 2', dataType: 'inferredDataType' },
      { name: 'Third Inferred Data Output', dataType: 'thirdInferredDataType' },
      {
        name: 'Third Inferred Data Output 2',
        dataType: 'thirdInferredDataType',
      },
    ],
  }),
  complexDataTypeNode: makeTypeOfNodeWithAutoInfer<
    keyof typeof exampleDataTypes
  >({
    name: 'Complex Data Type Node',
    headerColor: '#A64622',
    locationInContextMenu: ['Complex Types'],
    inputs: [
      { name: 'Complex Input Of Type 1', dataType: 'complexDataType' },
      { name: 'Complex Input Of Type 2', dataType: 'complexDataType2' },
    ],
    outputs: [
      { name: 'Complex Output Of Type 2', dataType: 'complexDataType2' },
      { name: 'Complex Output Of Type 1', dataType: 'complexDataType' },
    ],
  }),
  complexDataTypeNode2: makeTypeOfNodeWithAutoInfer<
    keyof typeof exampleDataTypes
  >({
    name: 'Complex Data Type Node 2',
    headerColor: '#A64622',
    locationInContextMenu: ['Complex Types'],
    inputs: [
      { name: 'Complex Input Of Type 3', dataType: 'complexDataType3' },
      { name: 'Complex Input Of Type 2', dataType: 'complexDataType2' },
    ],
    outputs: [
      { name: 'Complex Output Of Type 2', dataType: 'complexDataType2' },
      { name: 'Complex Output Of Type 3', dataType: 'complexDataType3' },
    ],
  }),
  booleanNode: makeTypeOfNodeWithAutoInfer<keyof typeof exampleDataTypes>({
    name: 'Boolean Node',
    headerColor: '#A64622',
    locationInContextMenu: ['Utility'],
    inputs: [{ name: 'Boolean Input', dataType: 'booleanDataType' }],
    outputs: [{ name: 'Boolean Output', dataType: 'booleanDataType' }],
  }),
  ...standardNodeTypes,
};

export const Playground: StoryObj<typeof FullGraph> = {
  args: {},
  render: () => {
    const { state, dispatch } = useFullGraph({
      dataTypes: exampleDataTypes,
      typeOfNodes: exampleTypeOfNodes,
      enableTypeInference: true,
      nodes: state1.nodes as Nodes,
      edges: state1.edges as Edges,
    });

    return <FullGraph state={state} dispatch={dispatch} />;
  },
};

export const WithControlledInputs: StoryObj<typeof FullGraph> = {
  args: {},
  render: () => {
    const { state, dispatch } = useFullGraph({
      dataTypes: exampleDataTypes,
      typeOfNodes: exampleTypeOfNodes,
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
              },
              {
                name: 'Number Input',
                id: 'input2',
                type: 'number',
                handleColor: '#96CEB4',
                allowInput: true,
                value: 42,
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
    });

    return <FullGraph state={state} dispatch={dispatch} />;
  },
};

export const WithHandleShapes: StoryObj<typeof FullGraph> = {
  args: {},
  render: () => {
    const { state, dispatch } = useFullGraph({
      dataTypes: exampleDataTypes,
      typeOfNodes: exampleTypeOfNodes,
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
    });

    return <FullGraph state={state} dispatch={dispatch} />;
  },
};

export const WithTypeCheckingAndConversions: StoryObj<typeof FullGraph> = {
  args: {},
  render: () => {
    // Create initial state with allowed conversions
    const { state, dispatch } = useFullGraph({
      dataTypes: exampleDataTypes,
      typeOfNodes: exampleTypeOfNodes,
      nodes: [],
      edges: [],
      // Define allowed conversions between data types
      allowedConversionsBetweenDataTypes: {
        validatedData: {
          textInput: true,
        },
      },
      allowConversionBetweenComplexTypesUnlessDisallowedByComplexTypeChecking: true,
      enableComplexTypeChecking: true,
      enableTypeInference: true,
      enableDebugMode: true,
    });

    return (
      <div
        style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}
      >
        <div
          style={{
            padding: '10px',
            backgroundColor: '#1a1a1a',
            color: 'white',
            borderBottom: '1px solid #333',
          }}
        >
          <h3 style={{ margin: '0 0 10px 0' }}>
            Type Checking & Conversion Demo
          </h3>
          <p style={{ margin: '0', fontSize: '14px', opacity: 0.8 }}>
            This demo shows type checking and conversion capabilities.
            Connections will be added automatically:
          </p>
          <ul
            style={{
              margin: '5px 0 0 0',
              paddingLeft: '20px',
              fontSize: '12px',
              opacity: 0.7,
            }}
          >
            <li>String → Infer Type (with type inference)</li>
            <li>Infer Type → String (maintains inferred type)</li>
            <li>Number → Number (direct connection)</li>
          </ul>
        </div>
        <div style={{ flex: 1 }}>
          <FullGraph state={state} dispatch={dispatch} />
        </div>
      </div>
    );
  },
};

export const WithCycleChecking: StoryObj<typeof FullGraph> = {
  args: {},
  render: () => {
    const { state, dispatch } = useFullGraph({
      dataTypes: exampleDataTypes,
      typeOfNodes: exampleTypeOfNodes,
      nodes: [],
      edges: [],
      //Enable cycle checking
      enableCycleChecking: true,
    });

    return (
      <div
        style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}
      >
        <div
          style={{
            padding: '10px',
            backgroundColor: '#1a1a1a',
            color: 'white',
            borderBottom: '1px solid #333',
          }}
        >
          <h3 style={{ margin: '0 0 10px 0' }}>Cycle Checking Demo</h3>
          <p style={{ margin: '0', fontSize: '14px', opacity: 0.8 }}>
            This demo shows cycle checking, it won't allow a connection that
            creates a cycle
          </p>
        </div>
        <div style={{ flex: 1 }}>
          <FullGraph state={state} dispatch={dispatch} />
        </div>
      </div>
    );
  },
};

// ─────────────────────────────────────────────────────
// Circuit Gate Demo — Data Types, Node Types, Implementations
// ─────────────────────────────────────────────────────

const circuitExampleDataTypes = {
  bit: makeDataTypeWithAutoInfer({
    name: 'Bit',
    underlyingType: 'boolean',
    color: '#00BFFF',
    shape: handleShapesMap.rectangle,
    allowInput: true,
  }),
  number: makeDataTypeWithAutoInfer({
    name: 'Number',
    underlyingType: 'number',
    color: '#FF6B6B',
    shape: handleShapesMap.circle,
    allowInput: true,
  }),
  ...standardDataTypes,
} as const;

type CircuitDataTypeId = keyof typeof circuitExampleDataTypes;

const circuitExampleTypeOfNodes = {
  andGate: makeTypeOfNodeWithAutoInfer<CircuitDataTypeId>({
    name: 'AND Gate',
    headerColor: '#C44536',
    locationInContextMenu: ['Logic Gates'],
    inputs: [
      { name: 'A', dataType: 'bit' },
      { name: 'B', dataType: 'bit' },
    ],
    outputs: [{ name: 'Out', dataType: 'bit' }],
  }),
  orGate: makeTypeOfNodeWithAutoInfer<CircuitDataTypeId>({
    name: 'OR Gate',
    headerColor: '#2D5A87',
    locationInContextMenu: ['Logic Gates'],
    inputs: [
      { name: 'A', dataType: 'bit' },
      { name: 'B', dataType: 'bit' },
    ],
    outputs: [{ name: 'Out', dataType: 'bit' }],
  }),
  notGate: makeTypeOfNodeWithAutoInfer<CircuitDataTypeId>({
    name: 'NOT Gate',
    headerColor: '#8B5CF6',
    locationInContextMenu: ['Logic Gates'],
    inputs: [{ name: 'In', dataType: 'bit' }],
    outputs: [{ name: 'Out', dataType: 'bit' }],
  }),
  xorGate: makeTypeOfNodeWithAutoInfer<CircuitDataTypeId>({
    name: 'XOR Gate',
    headerColor: '#B8860B',
    locationInContextMenu: ['Logic Gates'],
    inputs: [
      { name: 'A', dataType: 'bit' },
      { name: 'B', dataType: 'bit' },
    ],
    outputs: [{ name: 'Out', dataType: 'bit' }],
  }),
  nandGate: makeTypeOfNodeWithAutoInfer<CircuitDataTypeId>({
    name: 'NAND Gate',
    headerColor: '#C44536',
    locationInContextMenu: ['Logic Gates'],
    inputs: [
      { name: 'A', dataType: 'bit' },
      { name: 'B', dataType: 'bit' },
    ],
    outputs: [{ name: 'Out', dataType: 'bit' }],
  }),
  norGate: makeTypeOfNodeWithAutoInfer<CircuitDataTypeId>({
    name: 'NOR Gate',
    headerColor: '#2D5A87',
    locationInContextMenu: ['Logic Gates'],
    inputs: [
      { name: 'A', dataType: 'bit' },
      { name: 'B', dataType: 'bit' },
    ],
    outputs: [{ name: 'Out', dataType: 'bit' }],
  }),
  buffer: makeTypeOfNodeWithAutoInfer<CircuitDataTypeId>({
    name: 'Buffer',
    headerColor: '#4A9D4A',
    locationInContextMenu: ['Utility'],
    inputs: [{ name: 'In', dataType: 'bit' }],
    outputs: [{ name: 'Out', dataType: 'bit' }],
  }),
  bitConstant: makeTypeOfNodeWithAutoInfer<CircuitDataTypeId>({
    name: 'Bit Constant',
    headerColor: '#555555',
    locationInContextMenu: ['I/O'],
    inputs: [{ name: 'Value', dataType: 'bit', allowInput: true }],
    outputs: [{ name: 'Out', dataType: 'bit' }],
  }),
  bitDisplay: makeTypeOfNodeWithAutoInfer<CircuitDataTypeId>({
    name: 'Bit Display',
    headerColor: '#555555',
    locationInContextMenu: ['I/O'],
    inputs: [{ name: 'In', dataType: 'bit' }],
    outputs: [],
  }),
  counter: makeTypeOfNodeWithAutoInfer<CircuitDataTypeId>({
    name: 'Counter',
    headerColor: '#B8860B',
    locationInContextMenu: ['Utility'],
    inputs: [
      { name: 'Count', dataType: 'number', allowInput: true },
      { name: 'Max', dataType: 'number', allowInput: true },
    ],
    outputs: [
      { name: 'Count + 1', dataType: 'number' },
      { name: 'Reached Max', dataType: 'bit' },
    ],
  }),
  ...standardNodeTypes,
} as const;

type CircuitNodeTypeId = keyof typeof circuitExampleTypeOfNodes;

/**
 * Extract the first connection value from an input handle,
 * falling back to the user-entered default, then to a provided fallback.
 */
function getFirstInputVal(
  handle: InputHandleValue | undefined,
  fallback: unknown = undefined,
): unknown {
  if (!handle) return fallback;
  if (handle.connections.length > 0) return handle.connections[0].value;
  if (handle.isDefault) return handle.defaultValue;
  return fallback;
}

const circuitImplementations =
  makeFunctionImplementationsWithAutoInfer<CircuitNodeTypeId>({
    andGate: (inputs) => {
      const a = Boolean(getFirstInputVal(inputs.get('A'), false));
      const b = Boolean(getFirstInputVal(inputs.get('B'), false));
      return new Map([['Out', a && b]]);
    },
    orGate: (inputs) => {
      const a = Boolean(getFirstInputVal(inputs.get('A'), false));
      const b = Boolean(getFirstInputVal(inputs.get('B'), false));
      return new Map([['Out', a || b]]);
    },
    notGate: (inputs) => {
      const val = Boolean(getFirstInputVal(inputs.get('In'), false));
      return new Map([['Out', !val]]);
    },
    xorGate: (inputs) => {
      const a = Boolean(getFirstInputVal(inputs.get('A'), false));
      const b = Boolean(getFirstInputVal(inputs.get('B'), false));
      return new Map([['Out', a !== b]]);
    },
    nandGate: (inputs) => {
      const a = Boolean(getFirstInputVal(inputs.get('A'), false));
      const b = Boolean(getFirstInputVal(inputs.get('B'), false));
      return new Map([['Out', !(a && b)]]);
    },
    norGate: (inputs) => {
      const a = Boolean(getFirstInputVal(inputs.get('A'), false));
      const b = Boolean(getFirstInputVal(inputs.get('B'), false));
      return new Map([['Out', !(a || b)]]);
    },
    buffer: (inputs) => {
      const val = Boolean(getFirstInputVal(inputs.get('In'), false));
      return new Map([['Out', val]]);
    },
    bitConstant: (inputs) => {
      const val = Boolean(getFirstInputVal(inputs.get('Value'), false));
      return new Map([['Out', val]]);
    },
    bitDisplay: () => {
      return new Map();
    },
    counter: (inputs) => {
      const count = Number(getFirstInputVal(inputs.get('Count'), 0));
      const max = Number(getFirstInputVal(inputs.get('Max'), 10));
      return new Map<string, unknown>([
        ['Count + 1', count + 1],
        ['Reached Max', count + 1 >= max],
      ]);
    },
  });

// ─────────────────────────────────────────────────────
// Pre-built Half-Adder Circuit
//
//   BitConstant(A=true) ──┬──> AND Gate ──> BitDisplay (Carry)
//                         └──> XOR Gate ──> BitDisplay (Sum)
//   BitConstant(B=true) ──┬──> AND Gate
//                         └──> XOR Gate
//
// Demonstrates: fan-out, concurrent execution, function implementations
// ─────────────────────────────────────────────────────

/**
 * Build the pre-wired half-adder graph using constructNodeOfType
 * so handle IDs are generated correctly and edges are valid.
 */
function buildHalfAdderGraph() {
  const dt = circuitExampleDataTypes;
  const nt = circuitExampleTypeOfNodes;

  const constA = constructNodeOfType(dt, 'bitConstant', nt, 'const-a', {
    x: 0,
    y: 100,
  });
  const constB = constructNodeOfType(dt, 'bitConstant', nt, 'const-b', {
    x: 0,
    y: 350,
  });
  const andNode = constructNodeOfType(dt, 'andGate', nt, 'and-gate', {
    x: 550,
    y: 100,
  });
  const xorNode = constructNodeOfType(dt, 'xorGate', nt, 'xor-gate', {
    x: 550,
    y: 350,
  });
  const displayCarry = constructNodeOfType(
    dt,
    'bitDisplay',
    nt,
    'display-carry',
    { x: 1100, y: 100 },
  );
  const displaySum = constructNodeOfType(dt, 'bitDisplay', nt, 'display-sum', {
    x: 1100,
    y: 350,
  });

  // Set initial values on the bit constants (A=true, B=true)
  const setInputValue = (node: typeof constA, idx: number, value: boolean) => {
    const input = node.data.inputs?.[idx];
    if (input && 'type' in input && input.type === 'boolean') {
      input.value = value;
    }
  };
  setInputValue(constA, 0, true);
  setInputValue(constB, 0, true);

  // Helpers to extract handle IDs from constructed nodes
  const outId = (node: typeof constA, idx: number): string =>
    node.data.outputs?.[idx]?.id ?? '';
  const inId = (node: typeof constA, idx: number): string =>
    node.data.inputs?.[idx]?.id ?? '';

  const nodes = [constA, constB, andNode, xorNode, displayCarry, displaySum];

  const edges = [
    // A → AND.A, A → XOR.A (fan-out from Bit Constant A)
    {
      id: 'e1',
      source: 'const-a',
      sourceHandle: outId(constA, 0),
      target: 'and-gate',
      targetHandle: inId(andNode, 0),
      type: 'configurableEdge' as const,
    },
    {
      id: 'e2',
      source: 'const-a',
      sourceHandle: outId(constA, 0),
      target: 'xor-gate',
      targetHandle: inId(xorNode, 0),
      type: 'configurableEdge' as const,
    },
    // B → AND.B, B → XOR.B (fan-out from Bit Constant B)
    {
      id: 'e3',
      source: 'const-b',
      sourceHandle: outId(constB, 0),
      target: 'and-gate',
      targetHandle: inId(andNode, 1),
      type: 'configurableEdge' as const,
    },
    {
      id: 'e4',
      source: 'const-b',
      sourceHandle: outId(constB, 0),
      target: 'xor-gate',
      targetHandle: inId(xorNode, 1),
      type: 'configurableEdge' as const,
    },
    // AND → Carry Display, XOR → Sum Display
    {
      id: 'e5',
      source: 'and-gate',
      sourceHandle: outId(andNode, 0),
      target: 'display-carry',
      targetHandle: inId(displayCarry, 0),
      type: 'configurableEdge' as const,
    },
    {
      id: 'e6',
      source: 'xor-gate',
      sourceHandle: outId(xorNode, 0),
      target: 'display-sum',
      targetHandle: inId(displaySum, 0),
      type: 'configurableEdge' as const,
    },
  ];

  return { nodes, edges };
}

const halfAdderGraph = buildHalfAdderGraph();

// ─────────────────────────────────────────────────────
// WithRunner Story
// ─────────────────────────────────────────────────────

export const WithRunner: StoryObj<typeof FullGraph> = {
  args: {},
  render: () => {
    const { state, dispatch } = useFullGraph({
      dataTypes: circuitExampleDataTypes,
      typeOfNodes: circuitExampleTypeOfNodes,
      nodes: halfAdderGraph.nodes,
      edges: halfAdderGraph.edges,
      allowedConversionsBetweenDataTypes: {},
      allowConversionBetweenComplexTypesUnlessDisallowedByComplexTypeChecking: true,
      enableComplexTypeChecking: true,
      enableTypeInference: true,
      enableCycleChecking: true,
    });

    return (
      <div
        style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ flex: 1 }}>
          <FullGraph
            state={state}
            dispatch={dispatch}
            functionImplementations={circuitImplementations}
            onStateImported={(imported) =>
              console.log('State imported:', imported)
            }
            onRecordingImported={(record) =>
              console.log('Recording imported:', record)
            }
            onImportError={(errors) => console.error('Import errors:', errors)}
          />
        </div>
      </div>
    );
  },
};

// ─────────────────────────────────────────────────────
// Full Adder Circuit
//
//   A ────┬──> XOR1 ──┬──> XOR2 ──> Sum Display
//         │           │
//   B ──┬─┼──> XOR1   │
//       │ │           │
//       │ └──> AND1 ──┼──────────> OR ──> Cout Display
//       │             │
//       └──> AND1     │
//                     │
//   Cin ──────┬──> XOR2
//             │
//             └──> AND2 ──────> OR
//
// Full adder = two half adders + OR gate for carry.
// A XOR B XOR Cin = Sum
// (A AND B) OR ((A XOR B) AND Cin) = Cout
// ─────────────────────────────────────────────────────

function buildFullAdderGraph() {
  const dt = circuitExampleDataTypes;
  const nt = circuitExampleTypeOfNodes;

  // Inputs
  const constA = constructNodeOfType(dt, 'bitConstant', nt, 'fa-const-a', {
    x: 0,
    y: 0,
  });
  const constB = constructNodeOfType(dt, 'bitConstant', nt, 'fa-const-b', {
    x: 0,
    y: 250,
  });
  const constCin = constructNodeOfType(dt, 'bitConstant', nt, 'fa-const-cin', {
    x: 0,
    y: 500,
  });

  // Stage 1: Half adder 1 (A, B)
  const xor1 = constructNodeOfType(dt, 'xorGate', nt, 'fa-xor1', {
    x: 550,
    y: 0,
  });
  const and1 = constructNodeOfType(dt, 'andGate', nt, 'fa-and1', {
    x: 550,
    y: 300,
  });

  // Stage 2: Half adder 2 (partial_sum, Cin)
  const xor2 = constructNodeOfType(dt, 'xorGate', nt, 'fa-xor2', {
    x: 1100,
    y: 0,
  });
  const and2 = constructNodeOfType(dt, 'andGate', nt, 'fa-and2', {
    x: 1100,
    y: 300,
  });

  // Stage 3: Carry OR
  const or1 = constructNodeOfType(dt, 'orGate', nt, 'fa-or1', {
    x: 1650,
    y: 300,
  });

  // Displays
  const dispSum = constructNodeOfType(dt, 'bitDisplay', nt, 'fa-disp-sum', {
    x: 1650,
    y: 0,
  });
  const dispCout = constructNodeOfType(dt, 'bitDisplay', nt, 'fa-disp-cout', {
    x: 2200,
    y: 300,
  });

  // Set initial values: A=1, B=1, Cin=1 → Sum=1, Cout=1
  const setVal = (node: typeof constA, idx: number, value: boolean) => {
    const input = node.data.inputs?.[idx];
    if (input && 'type' in input && input.type === 'boolean')
      input.value = value;
  };
  setVal(constA, 0, true);
  setVal(constB, 0, true);
  setVal(constCin, 0, true);

  const outId = (node: typeof constA, idx: number): string =>
    node.data.outputs?.[idx]?.id ?? '';
  const inId = (node: typeof constA, idx: number): string =>
    node.data.inputs?.[idx]?.id ?? '';

  const nodes = [
    constA,
    constB,
    constCin,
    xor1,
    and1,
    xor2,
    and2,
    or1,
    dispSum,
    dispCout,
  ];

  const edge = (
    id: string,
    src: string,
    srcH: string,
    tgt: string,
    tgtH: string,
  ) => ({
    id,
    source: src,
    sourceHandle: srcH,
    target: tgt,
    targetHandle: tgtH,
    type: 'configurableEdge' as const,
  });

  const edges = [
    // A → XOR1.A, AND1.A (fan-out)
    edge('fa-e1', 'fa-const-a', outId(constA, 0), 'fa-xor1', inId(xor1, 0)),
    edge('fa-e2', 'fa-const-a', outId(constA, 0), 'fa-and1', inId(and1, 0)),
    // B → XOR1.B, AND1.B (fan-out)
    edge('fa-e3', 'fa-const-b', outId(constB, 0), 'fa-xor1', inId(xor1, 1)),
    edge('fa-e4', 'fa-const-b', outId(constB, 0), 'fa-and1', inId(and1, 1)),
    // Cin → XOR2.B, AND2.B (fan-out)
    edge('fa-e5', 'fa-const-cin', outId(constCin, 0), 'fa-xor2', inId(xor2, 1)),
    edge('fa-e6', 'fa-const-cin', outId(constCin, 0), 'fa-and2', inId(and2, 1)),
    // XOR1.Out → XOR2.A, AND2.A (partial sum fans out)
    edge('fa-e7', 'fa-xor1', outId(xor1, 0), 'fa-xor2', inId(xor2, 0)),
    edge('fa-e8', 'fa-xor1', outId(xor1, 0), 'fa-and2', inId(and2, 0)),
    // AND1.Out → OR1.A (generate carry)
    edge('fa-e9', 'fa-and1', outId(and1, 0), 'fa-or1', inId(or1, 0)),
    // AND2.Out → OR1.B (propagate carry)
    edge('fa-e10', 'fa-and2', outId(and2, 0), 'fa-or1', inId(or1, 1)),
    // XOR2.Out → Sum Display
    edge('fa-e11', 'fa-xor2', outId(xor2, 0), 'fa-disp-sum', inId(dispSum, 0)),
    // OR1.Out → Cout Display
    edge('fa-e12', 'fa-or1', outId(or1, 0), 'fa-disp-cout', inId(dispCout, 0)),
  ];

  return { nodes, edges };
}

const fullAdderGraph = buildFullAdderGraph();

/**
 * Full Adder circuit: A=1, B=1, Cin=1 → Sum=1, Cout=1.
 * Demonstrates: 3-level deep DAG, fan-out (each input feeds two gates),
 * carry propagation through two half-adder stages + OR gate.
 */
export const FullAdderCircuit: StoryObj<typeof FullGraph> = {
  args: {},
  render: () => {
    const { state, dispatch } = useFullGraph({
      dataTypes: circuitExampleDataTypes,
      typeOfNodes: circuitExampleTypeOfNodes,
      nodes: fullAdderGraph.nodes,
      edges: fullAdderGraph.edges,
      allowedConversionsBetweenDataTypes: {},
      allowConversionBetweenComplexTypesUnlessDisallowedByComplexTypeChecking: true,
      enableComplexTypeChecking: true,
      enableTypeInference: true,
      enableCycleChecking: true,
    });

    return (
      <div
        style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ flex: 1 }}>
          <FullGraph
            state={state}
            dispatch={dispatch}
            functionImplementations={circuitImplementations}
          />
        </div>
      </div>
    );
  },
};

// ─────────────────────────────────────────────────────
// 4-Bit Ripple Carry Adder
//
// Chains four full adders: each bit-position gets its own
// XOR1, AND1, XOR2, AND2, OR gate. The carry output of one
// feeds the carry input of the next.
//
//   A0,B0 ──> FA0 ──carry──> FA1 ──carry──> FA2 ──carry──> FA3 ──> Cout
//               │              │              │              │
//              S0             S1             S2             S3
//
// Example: A=0101 (5), B=0011 (3) → S=1000 (8), Cout=0
// Demonstrates: large concurrent execution, carry chain serialization
// ─────────────────────────────────────────────────────

function buildRippleCarryAdder(aVal: boolean[], bVal: boolean[]) {
  const dt = circuitExampleDataTypes;
  const nt = circuitExampleTypeOfNodes;

  type N = ReturnType<typeof constructNodeOfType>;
  const allNodes: N[] = [];
  const allEdges: {
    id: string;
    source: string;
    sourceHandle: string;
    target: string;
    targetHandle: string;
    type: 'configurableEdge';
  }[] = [];

  const outId = (node: N, idx: number): string =>
    node.data.outputs?.[idx]?.id ?? '';
  const inId = (node: N, idx: number): string =>
    node.data.inputs?.[idx]?.id ?? '';
  const setVal = (node: N, idx: number, value: boolean | number) => {
    const input = node.data.inputs?.[idx];
    if (!input || !('type' in input)) return;
    if (input.type === 'boolean' && typeof value === 'boolean')
      input.value = value;
    else if (input.type === 'number' && typeof value === 'number')
      input.value = value;
  };
  const e = (
    id: string,
    src: string,
    srcH: string,
    tgt: string,
    tgtH: string,
  ) => ({
    id,
    source: src,
    sourceHandle: srcH,
    target: tgt,
    targetHandle: tgtH,
    type: 'configurableEdge' as const,
  });

  let eid = 0;

  // Carry-in for bit 0 is always false
  const cinConst = constructNodeOfType(dt, 'bitConstant', nt, 'rca-cin', {
    x: 0,
    y: 550,
  });
  setVal(cinConst, 0, false);
  allNodes.push(cinConst);

  // Track carry output node + handle for chaining
  let carrySource = { nodeId: 'rca-cin', handleId: outId(cinConst, 0) };

  for (let i = 0; i < 4; i++) {
    // Each full-adder bit occupies 4 columns (550px each) = 2200px wide
    const startX = i * 2200;

    // Input constants for this bit
    const constAi = constructNodeOfType(dt, 'bitConstant', nt, `rca-a${i}`, {
      x: startX,
      y: 0,
    });
    const constBi = constructNodeOfType(dt, 'bitConstant', nt, `rca-b${i}`, {
      x: startX,
      y: 250,
    });
    setVal(constAi, 0, aVal[i]);
    setVal(constBi, 0, bVal[i]);

    // Full adder gates for this bit
    const xor1 = constructNodeOfType(dt, 'xorGate', nt, `rca-xor1-${i}`, {
      x: startX + 550,
      y: 0,
    });
    const and1 = constructNodeOfType(dt, 'andGate', nt, `rca-and1-${i}`, {
      x: startX + 550,
      y: 300,
    });
    const xor2 = constructNodeOfType(dt, 'xorGate', nt, `rca-xor2-${i}`, {
      x: startX + 1100,
      y: 0,
    });
    const and2 = constructNodeOfType(dt, 'andGate', nt, `rca-and2-${i}`, {
      x: startX + 1100,
      y: 300,
    });
    const or1 = constructNodeOfType(dt, 'orGate', nt, `rca-or-${i}`, {
      x: startX + 1650,
      y: 300,
    });

    // Sum display
    const dispS = constructNodeOfType(dt, 'bitDisplay', nt, `rca-disp-s${i}`, {
      x: startX + 1650,
      y: 0,
    });

    allNodes.push(constAi, constBi, xor1, and1, xor2, and2, or1, dispS);

    // A → XOR1.A, AND1.A
    allEdges.push(
      e(
        `rca-e${eid++}`,
        `rca-a${i}`,
        outId(constAi, 0),
        `rca-xor1-${i}`,
        inId(xor1, 0),
      ),
    );
    allEdges.push(
      e(
        `rca-e${eid++}`,
        `rca-a${i}`,
        outId(constAi, 0),
        `rca-and1-${i}`,
        inId(and1, 0),
      ),
    );
    // B → XOR1.B, AND1.B
    allEdges.push(
      e(
        `rca-e${eid++}`,
        `rca-b${i}`,
        outId(constBi, 0),
        `rca-xor1-${i}`,
        inId(xor1, 1),
      ),
    );
    allEdges.push(
      e(
        `rca-e${eid++}`,
        `rca-b${i}`,
        outId(constBi, 0),
        `rca-and1-${i}`,
        inId(and1, 1),
      ),
    );
    // Cin → XOR2.B, AND2.B
    allEdges.push(
      e(
        `rca-e${eid++}`,
        carrySource.nodeId,
        carrySource.handleId,
        `rca-xor2-${i}`,
        inId(xor2, 1),
      ),
    );
    allEdges.push(
      e(
        `rca-e${eid++}`,
        carrySource.nodeId,
        carrySource.handleId,
        `rca-and2-${i}`,
        inId(and2, 1),
      ),
    );
    // XOR1 → XOR2.A, AND2.A
    allEdges.push(
      e(
        `rca-e${eid++}`,
        `rca-xor1-${i}`,
        outId(xor1, 0),
        `rca-xor2-${i}`,
        inId(xor2, 0),
      ),
    );
    allEdges.push(
      e(
        `rca-e${eid++}`,
        `rca-xor1-${i}`,
        outId(xor1, 0),
        `rca-and2-${i}`,
        inId(and2, 0),
      ),
    );
    // AND1 → OR.A, AND2 → OR.B
    allEdges.push(
      e(
        `rca-e${eid++}`,
        `rca-and1-${i}`,
        outId(and1, 0),
        `rca-or-${i}`,
        inId(or1, 0),
      ),
    );
    allEdges.push(
      e(
        `rca-e${eid++}`,
        `rca-and2-${i}`,
        outId(and2, 0),
        `rca-or-${i}`,
        inId(or1, 1),
      ),
    );
    // XOR2 → Sum display
    allEdges.push(
      e(
        `rca-e${eid++}`,
        `rca-xor2-${i}`,
        outId(xor2, 0),
        `rca-disp-s${i}`,
        inId(dispS, 0),
      ),
    );

    // Update carry chain for next bit
    carrySource = { nodeId: `rca-or-${i}`, handleId: outId(or1, 0) };
  }

  // Final carry display (after the last bit's OR gate)
  const dispCout = constructNodeOfType(dt, 'bitDisplay', nt, 'rca-disp-cout', {
    x: 3 * 2200 + 2200,
    y: 300,
  });
  allNodes.push(dispCout);
  allEdges.push(
    e(
      `rca-e${eid++}`,
      carrySource.nodeId,
      carrySource.handleId,
      'rca-disp-cout',
      inId(dispCout, 0),
    ),
  );

  return { nodes: allNodes, edges: allEdges };
}

// 5 + 3 = 8 in binary: A=0101, B=0011
// LSB-first: A=[1,0,1,0], B=[1,1,0,0] → S=[0,0,0,1], Cout=0 → 8
const rippleCarryAdderGraph = buildRippleCarryAdder(
  [true, false, true, false], // A = 0101 = 5 (LSB first)
  [true, true, false, false], // B = 0011 = 3 (LSB first)
);

/**
 * 4-bit Ripple Carry Adder: computes 5 + 3 = 8.
 * 34 nodes across 4 chained full adders.
 * Demonstrates: large graph, carry chain serialization,
 * massive fan-out/fan-in, and multi-level concurrent execution.
 */
export const RippleCarryAdder: StoryObj<typeof FullGraph> = {
  args: {},
  render: () => {
    const { state, dispatch } = useFullGraph({
      dataTypes: circuitExampleDataTypes,
      typeOfNodes: circuitExampleTypeOfNodes,
      nodes: rippleCarryAdderGraph.nodes,
      edges: rippleCarryAdderGraph.edges,
      allowedConversionsBetweenDataTypes: {},
      allowConversionBetweenComplexTypesUnlessDisallowedByComplexTypeChecking: true,
      enableComplexTypeChecking: true,
      enableTypeInference: true,
      enableCycleChecking: true,
    });

    return (
      <div
        style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ flex: 1 }}>
          <FullGraph
            state={state}
            dispatch={dispatch}
            functionImplementations={circuitImplementations}
          />
        </div>
      </div>
    );
  },
};

// ─────────────────────────────────────────────────────
// Loop Counter Circuit
//
//   Number(0) ──> LoopStart ──> Counter ──> NOT ──> LoopStop ──> LoopEnd ──> Display
//   Number(5) ──────────────────> Counter (Max input)
//
// The counter increments each iteration. When count reaches
// max, NOT(Reached Max) = false and the loop terminates.
// Demonstrates: loop nodes, condition handling, iterative computation
// ─────────────────────────────────────────────────────

function buildLoopCounterGraph() {
  const dt = circuitExampleDataTypes;
  const nt = circuitExampleTypeOfNodes;

  type N = ReturnType<typeof constructNodeOfType>;

  const outId = (node: N, idx: number): string =>
    node.data.outputs?.[idx]?.id ?? '';
  const inId = (node: N, idx: number): string =>
    node.data.inputs?.[idx]?.id ?? '';
  const setVal = (node: N, idx: number, value: boolean | number) => {
    const input = node.data.inputs?.[idx];
    if (!input || !('type' in input)) return;
    if (input.type === 'boolean' && typeof value === 'boolean')
      input.value = value;
    else if (input.type === 'number' && typeof value === 'number')
      input.value = value;
  };
  const e = (
    id: string,
    src: string,
    srcH: string,
    tgt: string,
    tgtH: string,
  ) => ({
    id,
    source: src,
    sourceHandle: srcH,
    target: tgt,
    targetHandle: tgtH,
    type: 'configurableEdge' as const,
  });

  // Initial value (false = 0 for the counter's starting count)
  const initConst = constructNodeOfType(dt, 'bitConstant', nt, 'lc-init', {
    x: 0,
    y: 150,
  });
  setVal(initConst, 0, false);

  // Loop nodes
  const loopStart = constructNodeOfType(dt, 'loopStart', nt, 'lc-loop-start', {
    x: 550,
    y: 150,
  });
  const loopStop = constructNodeOfType(dt, 'loopStop', nt, 'lc-loop-stop', {
    x: 2200,
    y: 150,
  });
  const loopEnd = constructNodeOfType(dt, 'loopEnd', nt, 'lc-loop-end', {
    x: 2750,
    y: 150,
  });

  // Counter node (body of the loop)
  const counter = constructNodeOfType(dt, 'counter', nt, 'lc-counter', {
    x: 1100,
    y: 150,
  });
  setVal(counter, 1, 5); // Max = 5

  // NOT gate to invert "Reached Max" for "continue" condition
  const notGate = constructNodeOfType(dt, 'notGate', nt, 'lc-not', {
    x: 1650,
    y: 400,
  });

  // Final display
  const display = constructNodeOfType(dt, 'bitDisplay', nt, 'lc-display', {
    x: 3300,
    y: 150,
  });

  const nodes = [
    initConst,
    loopStart,
    counter,
    notGate,
    loopStop,
    loopEnd,
    display,
  ];

  let eid = 0;
  const edges = [
    // Initial value → loopStart (loopInfer input, index 0)
    e(
      `lc-e${eid++}`,
      'lc-init',
      outId(initConst, 0),
      'lc-loop-start',
      inId(loopStart, 0),
    ),
    // loopStart (bindLoopNodes, output index 0) → loopStop (bindLoopNodes, input index 0)
    e(
      `lc-e${eid++}`,
      'lc-loop-start',
      outId(loopStart, 0),
      'lc-loop-stop',
      inId(loopStop, 0),
    ),
    // loopStop (bindLoopNodes, output index 0) → loopEnd (bindLoopNodes, input index 0)
    e(
      `lc-e${eid++}`,
      'lc-loop-stop',
      outId(loopStop, 0),
      'lc-loop-end',
      inId(loopEnd, 0),
    ),
    // loopStart (loopInfer, output index 1) → counter Count input (index 0)
    e(
      `lc-e${eid++}`,
      'lc-loop-start',
      outId(loopStart, 1),
      'lc-counter',
      inId(counter, 0),
    ),
    // counter Count+1 (output index 0) → loopStop (loopInfer, input index 2)
    e(
      `lc-e${eid++}`,
      'lc-counter',
      outId(counter, 0),
      'lc-loop-stop',
      inId(loopStop, 2),
    ),
    // counter Reached Max (output index 1) → NOT.In
    e(
      `lc-e${eid++}`,
      'lc-counter',
      outId(counter, 1),
      'lc-not',
      inId(notGate, 0),
    ),
    // NOT.Out → loopStop condition input (index 1)
    e(
      `lc-e${eid++}`,
      'lc-not',
      outId(notGate, 0),
      'lc-loop-stop',
      inId(loopStop, 1),
    ),
    // loopEnd (loopInfer, output index 0) → display
    e(
      `lc-e${eid++}`,
      'lc-loop-end',
      outId(loopEnd, 0),
      'lc-display',
      inId(display, 0),
    ),
  ];

  return { nodes, edges };
}

const loopCounterGraph = buildLoopCounterGraph();

/**
 * Loop Counter: counts from 0 to 5 using a loop structure.
 * Demonstrates: Loop Start/Stop/End triplet, condition inversion
 * with NOT gate, iterative carry of values, and loop termination.
 */
export const LoopCounterCircuit: StoryObj<typeof FullGraph> = {
  args: {},
  render: () => {
    const { state, dispatch } = useFullGraph({
      dataTypes: circuitExampleDataTypes,
      typeOfNodes: circuitExampleTypeOfNodes,
      nodes: loopCounterGraph.nodes,
      edges: loopCounterGraph.edges,
      allowedConversionsBetweenDataTypes: {
        bit: { condition: true, number: true, loopInfer: true },
        number: { loopInfer: true, bit: true },
        loopInfer: { number: true, bit: true },
      },
      allowConversionBetweenComplexTypesUnlessDisallowedByComplexTypeChecking: true,
      enableComplexTypeChecking: true,
      enableTypeInference: true,
      enableCycleChecking: true,
    });

    return (
      <div
        style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ flex: 1 }}>
          <FullGraph
            state={state}
            dispatch={dispatch}
            functionImplementations={circuitImplementations}
          />
        </div>
      </div>
    );
  },
};
