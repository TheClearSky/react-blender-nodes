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

const meta = {
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
  ...standardDataTypes,
};

const exampleTypeOfNodes = {
  inputValidator: makeTypeOfNodeWithAutoInfer<keyof typeof exampleDataTypes>({
    name: 'Input Validator',
    headerColor: '#C44536',
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
    inputs: [
      { name: 'Complex Input Of Type 3', dataType: 'complexDataType3' },
      { name: 'Complex Input Of Type 2', dataType: 'complexDataType2' },
    ],
    outputs: [
      { name: 'Complex Output Of Type 2', dataType: 'complexDataType2' },
      { name: 'Complex Output Of Type 3', dataType: 'complexDataType3' },
    ],
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
