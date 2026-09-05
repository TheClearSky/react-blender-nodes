// Type-only: `z` is used here solely in type positions (`z.ZodType`), so this
// must not become a runtime import — the React-free `/contract` bundle
// transitively includes this module and would otherwise carry `import "zod"`.
import type { z } from 'zod';
import type { Nodes, Edges } from '@/components/organisms/FullGraph/types';
import type { HandleShape } from '@/components/atoms/HandleShapeSwatch/handleShapes';
import type { Viewport } from '@xyflow/react';
import type { Zone, ZoneIndex } from './zones/types';
import type { RunnerViewPreferences } from './runnerViewPreferences';
import type { Patch } from 'immer';
import type {
  HistoryEntry,
  HistoryConfig,
} from '@/components/organisms/FullGraph/historyTypes';

/**
 * Array of supported underlying data types
 */
const supportedUnderlyingTypes = [
  'string',
  'number',
  'boolean',
  'complex',
  'noEquivalent',
  'inferFromConnection',
] as const;

/**
 * Union type of all supported underlying data types
 */
type SupportedUnderlyingTypes = (typeof supportedUnderlyingTypes)[number];

/**
 * Map of supported underlying types for type checking
 */
const supportedUnderlyingTypesMap = {
  [supportedUnderlyingTypes[0]]: supportedUnderlyingTypes[0],
  [supportedUnderlyingTypes[1]]: supportedUnderlyingTypes[1],
  [supportedUnderlyingTypes[2]]: supportedUnderlyingTypes[2],
  [supportedUnderlyingTypes[3]]: supportedUnderlyingTypes[3],
  [supportedUnderlyingTypes[4]]: supportedUnderlyingTypes[4],
  [supportedUnderlyingTypes[5]]: supportedUnderlyingTypes[5],
} as const;

/**
 * Type guard to check if a string is a supported underlying type
 *
 * @param type - The string to check
 * @returns True if the string is a supported underlying type
 *
 * @example
 * ```tsx
 * if (isSupportedUnderlyingType('string')) {
 *   // type is now 'string'
 * }
 * ```
 */
function isSupportedUnderlyingType(
  type: string,
): type is SupportedUnderlyingTypes {
  return type in supportedUnderlyingTypesMap;
}

/**
 * Definition of a data type in the graph system
 *
 * @template UnderlyingType - The underlying type of the data
 * @template ComplexSchemaType - Zod schema type for complex data types
 */
type DataType<
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
> = UnderlyingType extends 'complex'
  ? {
      /** Display name of the data type */
      name: string;
      /** The underlying type of the data */
      underlyingType: UnderlyingType;
      /** Zod schema for complex data validation */
      complexSchema: ComplexSchemaType;
      /** Color used for visual representation */
      color: string;
      /** Shape of the handle */
      shape?: HandleShape;
      /** Whether this input allows direct user input */
      allowInput?: boolean;
      /** Maximum number of connections for this data type */
      maxConnections?: number;
    }
  : {
      /** Display name of the data type */
      name: string;
      /** The underlying type of the data */
      underlyingType: UnderlyingType;
      /** Complex schema is not used for non-complex types */
      complexSchema?: undefined;
      /** Color used for visual representation */
      color: string;
      /** Shape of the handle */
      shape?: HandleShape;
      /** Whether this input allows direct user input */
      allowInput?: boolean;
      /** Maximum number of connections for this data type */
      maxConnections?: number;
      /** When set on a string type, renders a select dropdown instead of a free-text input. */
      allowedStrings?: readonly string[];
    };

/**
 * Helper function to create a data type with automatic type inference
 *
 * This function is essential for type safety when defining data types. It ensures
 * that TypeScript can properly infer and validate the types throughout your graph
 * system, preventing runtime errors and providing better IDE support.
 *
 * @template UnderlyingType - The underlying type of the data
 * @template ComplexSchemaType - Zod schema type for complex data types
 * @param input - The data type definition
 * @returns The data type definition with proper typing
 *
 * @example
 * ```tsx
 * // ✅ Type-safe - TypeScript will validate dataType references
 * const stringType = makeDataTypeWithAutoInfer({
 *   name: 'String',
 *   underlyingType: 'string',
 *   color: '#4A90E2',
 * });
 *
 * // ❌ Without auto-infer - TypeScript can't validate references
 * const stringType = {
 *   name: 'String',
 *   underlyingType: 'string',
 *   color: '#4A90E2',
 * };
 * ```
 */
function makeDataTypeWithAutoInfer<
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(input: DataType<UnderlyingType, ComplexSchemaType>) {
  return input;
}

/**
 * Type guard to check if a string is a valid DataTypeUniqueId
 */
function isValidDataTypeId<
  DataTypeUniqueId extends string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  id: string,
  dataTypes: Record<
    DataTypeUniqueId,
    DataType<UnderlyingType, ComplexSchemaType>
  >,
): id is DataTypeUniqueId {
  return id in dataTypes;
}

/**
 * Definition of an input type in a node
 *
 * @template DataTypeUniqueId - Unique identifier type for data types
 */
type TypeOfInput<DataTypeUniqueId extends string = string> = {
  /** Display name of the input */
  name: string;
  /** The data type identifier this input uses */
  dataType: DataTypeUniqueId;
  /** Whether this input allows direct user input */
  allowInput?: boolean;
  /** Maximum number of connections for this input */
  maxConnections?: number;
  /**
   * Initial value seeded onto a freshly-constructed node's input handle
   * (`node.data.inputs[].value`). Copied at construction only for
   * `number`/`string`/`boolean` underlying types whose runtime value matches;
   * ignored for `complex`/`inferFromConnection`/`noEquivalent`. Lets a node
   * type declare its own defaults instead of the consumer seeding them via
   * `UPDATE_INPUT_VALUE` after every add.
   */
  defaultValue?: string | number | boolean;
};

/**
 * Definition of an input panel type in a node
 *
 * @template DataTypeUniqueId - Unique identifier type for data types
 */
type TypeOfInputPanel<DataTypeUniqueId extends string = string> = {
  /** Display name of the input panel */
  name: string;
  /** Array of inputs within this panel */
  inputs: TypeOfInput<DataTypeUniqueId>[];
};

/**
 * Definition of a node type in the graph system
 *
 * @template DataTypeUniqueId - Unique identifier type for data types
 */
type TypeOfNode<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
> = {
  /** Display name of the node type */
  name: string;
  /** Color used for the node header */
  headerColor?: string;
  /** Array of inputs (can be regular inputs or input panels) */
  inputs: (
    | TypeOfInput<DataTypeUniqueId>
    | TypeOfInputPanel<DataTypeUniqueId>
  )[];
  /** Array of outputs */
  outputs: TypeOfInput<DataTypeUniqueId>[];
  /** Path in the "Add Node" context menu. e.g. ["Math", "Trig"] nests under Math > Trig.
   * Omit to place at root level of "Add Node". */
  locationInContextMenu?: string[];
  /** Ordering priority in the context menu. Higher values appear first. Default: 0. */
  priorityInContextMenu?: number;
  /** Subtree of the node type (if this exists, this is a node group) */
  subtree?: {
    nodes: State<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    >['nodes'];
    edges: State<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    >['edges'];
    /**
     * Number of references to this node group
     * This subtree can only be edited or deleted if there are no references to it
     */
    numberOfReferences: number;
    /**
     * Input node id of the node group
     * - It is used to connect the node group to the rest of the graph
     * - Not allowed to be deleted or duplicated, must always be one
     */
    inputNodeId: string;
    /**
     * Output node id of the node group
     * - It is used to connect the node group to the rest of the graph
     * - Not allowed to be deleted or duplicated, must always be one
     */
    outputNodeId: string;
    /** Scope-local zone definitions for structures inside this subtree. UI-only — stripped on export. */
    zones?: Record<string, Zone>;
    /** Reverse index from boundary handle IDs to zone IDs for this subtree. UI-only — stripped on export. */
    zoneIndex?: ZoneIndex;
    /**
     * Scope-local USER-AUTHORED zones for this subtree (named/colored visual frames
     * the user wraps around selected nodes). Unlike `zones` (derived from loop/switch
     * structures, recomputed/stripped/rehydrated), these are AUTHORED: membership is an
     * explicit `nodeIds` set, never recomputed. Persisted (NOT stripped on export, NOT
     * rehydrated on import). Visual-only — `enforced: false`, no boundaryHandles/structureLink.
     */
    userZones?: Record<string, Zone>;
  };
};

/**
 * Helper function to create a node type with automatic type inference
 *
 * This function is essential for type safety when defining node types. It ensures
 * that TypeScript can properly validate dataType references in inputs and outputs,
 * preventing runtime errors when creating nodes and providing better IDE support.
 *
 * @template DataTypeUniqueId - Unique identifier type for data types
 * @param input - The node type definition
 * @returns The node type definition with proper typing
 *
 * @example
 * ```tsx
 * // ✅ Type-safe - TypeScript will validate dataType references
 * const inputNodeType = makeTypeOfNodeWithAutoInfer({
 *   name: 'Input Node',
 *   headerColor: '#C44536',
 *   inputs: [{ name: 'Input', dataType: 'stringType', allowInput: true }],
 *   outputs: [{ name: 'Output', dataType: 'stringType' }],
 * });
 *
 * // ❌ Without auto-infer - TypeScript can't validate dataType references
 * const inputNodeType = {
 *   name: 'Input Node',
 *   headerColor: '#C44536',
 *   inputs: [{ name: 'Input', dataType: 'stringType', allowInput: true }],
 *   outputs: [{ name: 'Output', dataType: 'stringType' }],
 * };
 * ```
 */
function makeTypeOfNodeWithAutoInfer<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  input: TypeOfNode<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
) {
  return input;
}

/**
 * Mapping of allowed conversions between data types
 *
 * @template DataTypeUniqueId - Unique identifier type for data types
 */
type AllowedConversionsBetweenDataTypes<
  DataTypeUniqueId extends string = string,
> = Partial<
  Record<DataTypeUniqueId, Partial<Record<DataTypeUniqueId, boolean>>>
>;

/**
 * Helper function to create a mapping of allowed conversions between data types with automatic type inference
 *
 * This function is essential for type safety when creating a mapping of allowed conversions between data types.
 * It ensures that TypeScript can properly infer and validate the types throughout your graph system,
 * preventing runtime errors and providing better IDE support.
 *
 * @template DataTypeUniqueId - Unique identifier type for data types
 * @param input - The mapping of allowed conversions between data types
 * @returns The mapping with proper typing
 *
 * @example
 * ```tsx
 * // ✅ Type-safe - TypeScript will validate node type references
 * const allowedConversionsBetweenDataTypes = makeAllowedConversionsBetweenDataTypesWithAutoInfer({
 *   'inputDataType': {
 *     'outputDataType': true,
 *   },
 * });
 *
 * // ❌ Without auto-infer - TypeScript can't validate node type references
 * const allowedConversionsBetweenDataTypes = {
 *   'inputDataType': {
 *     'outputDataType': true,
 *   },
 * };
 * ```
 */
function makeAllowedConversionsBetweenDataTypesWithAutoInfer<
  DataTypeUniqueId extends string = string,
>(input: AllowedConversionsBetweenDataTypes<DataTypeUniqueId>) {
  return input;
}

/**
 * Constraints on how many nodes of each type may exist in different scopes.
 *
 * - If undefined on State: no constraints at all
 * - If a node type has no entry: no constraints for that type
 * - Each field is optional; only provided fields are enforced (AND-ed together)
 * - Only checked during ADD_NODE (max) and node deletion (min)
 *
 * @template NodeTypeUniqueId - Unique identifier type for node types
 */
type NodeCountConstraints<NodeTypeUniqueId extends string = string> = Partial<
  Record<
    NodeTypeUniqueId,
    {
      /** Minimum count across root + all group subtrees combined */
      minAcrossAllNodes?: number;
      /** Maximum count across root + all group subtrees combined */
      maxAcrossAllNodes?: number;
      /** Minimum count within each individual group subtree (checked per-group) */
      minWithinANodeGroup?: number;
      /** Maximum count within each individual group subtree (checked per-group) */
      maxWithinANodeGroup?: number;
      /** Minimum count in the root scope only */
      minInRoot?: number;
      /** Maximum count in the root scope only */
      maxInRoot?: number;
    }
  >
>;

/**
 * Helper function to create node count constraints with automatic type inference
 *
 * @template NodeTypeUniqueId - Unique identifier type for node types
 * @param input - The node count constraints
 * @returns The constraints with proper typing
 *
 * @example
 * ```tsx
 * const constraints = makeNodeCountConstraintsWithAutoInfer({
 *   dataSource: { maxAcrossAllNodes: 3, maxInRoot: 2 },
 *   outputNode: { minInRoot: 1, maxInRoot: 1 },
 * });
 * ```
 */
function makeNodeCountConstraintsWithAutoInfer<
  NodeTypeUniqueId extends string = string,
>(input: NodeCountConstraints<NodeTypeUniqueId>) {
  return input;
}

/**
 * Currently open drawer. UI-only state — stripped during export.
 * Managed by OPEN_DRAWER / CLOSE_DRAWER actions.
 */
type ActiveDrawer =
  | { type: 'editLoop'; nodeId: string }
  | { type: 'editNodeType'; nodeTypeId: string }
  | { type: 'editSwitch'; nodeId: string }
  | { type: 'editGraphInput'; nodeId: string }
  | { type: 'editGraphOutput'; nodeId: string }
  | null;

/**
 * Complete state definition for the graph system
 *
 * @template DataTypeUniqueId - Unique identifier type for data types
 * @template NodeTypeUniqueId - Unique identifier type for node types
 * @template UnderlyingType - Supported underlying data types ('string' | 'number' | 'complex')
 * @template ComplexSchemaType - Zod schema type for complex data types
 */
type State<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
> = {
  openedNodeGroupStack?: //Opening the original node group case
  (
    | {
        nodeType: NodeTypeUniqueId;
        previousViewport?: Viewport;
      }
    //Opening the instance of the node group case
    | {
        nodeType: NodeTypeUniqueId;
        /**
         * If not provided, it means that this node group isn't instantiated yet and we are editing the original node group
         */
        nodeId: string;
        previousViewport?: Viewport;
      }
  )[];
  /** Map of data type definitions */
  dataTypes: Record<
    DataTypeUniqueId,
    DataType<UnderlyingType, ComplexSchemaType>
  >;
  /** Current viewport of the graph */
  viewport?: Viewport;
  /** Map of node type definitions */
  typeOfNodes: Record<
    NodeTypeUniqueId,
    TypeOfNode<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    >
  >;
  /** Array of nodes in the graph */
  nodes: Nodes<
    UnderlyingType,
    NodeTypeUniqueId,
    ComplexSchemaType,
    DataTypeUniqueId
  >;
  /** Array of edges in the graph */
  edges: Edges;
  /**
   * Optional mapping of allowed conversions between data types
   * - When not provided, all conversions are allowed
   * - If provided, only the conversions that are explicitly allowed will be allowed (happens even with empty object)
   * - By default, it will not allow conversion between complex types unless explicitly allowed here (even if complex type checking is enabled)
   * - If you want to allow conversion between complex types unless disallowed by complex type checking, you can set `allowConversionBetweenComplexTypesUnlessDisallowedByComplexTypeChecking` to true
   *
   * @default undefined
   */
  allowedConversionsBetweenDataTypes?: AllowedConversionsBetweenDataTypes<DataTypeUniqueId>;
  /**
   * Whether to allow conversion between complex types unless disallowed by complex type checking
   * - If not provided, is considered disabled
   * - Only takes effect if complex type checking is enabled (`allowedConversionsBetweenDataTypes` is provided)
   * - If enabled, it will allow conversion between complex types unless disallowed by complex type checking
   * - If disabled, it will not allow conversion between complex types unless explicitly allowed by `allowedConversionsBetweenDataTypes`, even if complex type checking is enabled
   *
   * @default undefined
   */
  allowConversionBetweenComplexTypesUnlessDisallowedByComplexTypeChecking?: boolean;
  /**
   * Whether to enable type inference
   * - If not provided, is considered disabled
   * - When disabled, the types of the nodes are not inferred from the connections
   * - When enabled, the types of the nodes are inferred from the connections and reset when edges are removed
   *
   * @default undefined
   */
  enableTypeInference?: boolean;
  /**
   * Whether to enable complex type checking
   * - If not provided, is considered disabled
   * - When disabled, the complex types are not checked for compatibility, all connections are allowed
   * - When enabled, the complex types are checked for compatibility, and connections are not allowed if the complex types are not compatible
   * - Complex types are compatible if they are the same type or if they have exactly the same schema
   *
   * @default undefined
   */
  enableComplexTypeChecking?: boolean;
  /**
   * Whether to enable cycle checking
   * - If not provided, is considered disabled
   * - When disabled, the cycles are not checked, all connections are allowed
   * - When enabled, the cycles are checked, and connections are not allowed if they create a cycle
   *
   * @default undefined
   */
  enableCycleChecking?: boolean;

  /**
   * Whether to enable recursion checking
   * - If not provided, is considered disabled
   * - When disabled, the recursion is not checked, all nesting of node groups is allowed
   * - When enabled, the recursion is checked, and nesting of node groups is not allowed if it creates a recursion
   *
   * @default undefined
   */
  enableRecursionChecking?: boolean;

  /**
   * Optional constraints on how many nodes of each type may exist.
   * If not provided, no constraints are enforced.
   * Only checked during ADD_NODE (max) and node deletion (min).
   *
   * @default undefined
   */
  nodeCountConstraints?: NodeCountConstraints<NodeTypeUniqueId>;

  /**
   * Node types to hide from the "Add Node" context menu.
   * If not provided, all node types are shown.
   * Use `standardHiddenNodeTypesInContextMenu` from standardNodes for the default set.
   *
   * @default undefined
   */
  hiddenNodeTypesInContextMenu?: Partial<Record<NodeTypeUniqueId, true>>;

  /**
   * Whether to enable debugging mode
   * - If not provided, is considered disabled
   * - When disabled, no debug information is displayed in the graph
   * - When enabled, debug information is displayed in the graph
   *
   * @default undefined
   */
  enableDebugMode?: boolean;

  /**
   * Currently open drawer. UI-only state — stripped during export.
   * Managed by OPEN_DRAWER / CLOSE_DRAWER actions.
   * @default undefined
   */
  activeDrawer?: ActiveDrawer;

  /**
   * Root-level zone definitions for structures at the top scope.
   * Each zone defines a region with boundary handles, visual frame, and
   * optional connection enforcement. UI-only — stripped on export,
   * rehydrated on import via REPLACE_STATE.
   * @default undefined
   */
  zones?: Record<string, Zone>;
  /**
   * Reverse index from boundary handle IDs to zone IDs for O(1)
   * lookups during connection validation. Rebuilt whenever zones change.
   * UI-only — stripped on export.
   * @default undefined
   */
  zoneIndex?: ZoneIndex;

  /**
   * Root-level USER-AUTHORED zones (named/colored visual frames the user creates
   * around selected nodes). Unlike `zones` (derived from loop/switch structures,
   * recomputed/stripped/rehydrated), these are AUTHORED: membership is an explicit
   * `nodeIds` set, never recomputed. Persisted in export (NOT stripped) and forwarded
   * on import (NOT rehydrated). Visual-only — `enforced: false`, no
   * boundaryHandles/structureLink. Scope-local like `zones` (root vs subtree).
   * @default undefined
   */
  userZones?: Record<string, Zone>;

  /**
   * Document-level runner-panel view preferences: `autoScroll` (auto-scroll the
   * timeline/canvas to the selected step) and `followIntoGroups` (follow the scrub
   * head into executing group instances). Toggled by UPDATE_RUNNER_VIEW_PREFERENCE.
   * Persisted on export and forwarded on import (NOT stripped, NOT rehydrated) like
   * `userZones`; GLOBAL (root-only, not scope-local — no subtree copy). The
   * per-recording snapshot lives in `RecordingViewState`; `autoScroll` is mirrored
   * there with graph state authoritative and NOT restored on load. Inner fields
   * REQUIRED — read via `getRunnerViewPreferences`, which defaults per-field.
   * @default undefined → read as { autoScroll: true, followIntoGroups: true }
   */
  runnerViewPreferences?: RunnerViewPreferences;

  /**
   * Undo/redo history. Stores Immer patches for each undoable action.
   * Managed by UNDO, REDO, BEGIN_BATCH, END_BATCH, CLEAR_HISTORY actions.
   * Stripped on export by default; optionally preserved via "Export with History".
   * @default undefined
   */
  history?: {
    undoStack: HistoryEntry[];
    redoStack: HistoryEntry[];
    config: HistoryConfig;
    activeBatch: {
      patches: Patch[];
      inversePatches: Patch[];
      actionTypes: string[];
      startTimestamp: number;
    } | null;
  };
};

/**
 * Helper function to create a state with automatic type inference
 *
 * This function is essential for complete type safety when creating the graph state.
 * It ensures that TypeScript can properly infer and validate all type relationships
 * throughout your graph system, providing compile-time type checking and better IDE support.
 *
 * @template DataTypeUniqueId - Unique identifier type for data types
 * @template NodeTypeUniqueId - Unique identifier type for node types
 * @template UnderlyingType - Supported underlying data types ('string' | 'number' | 'complex')
 * @template ComplexSchemaType - Zod schema type for complex data types
 * @param input - The state definition
 * @returns The state with proper typing
 *
 * @example
 * ```tsx
 * // ✅ Type-safe - Complete type inference and validation
 * const state = makeStateWithAutoInfer({
 *   dataTypes: {
 *     stringType: makeDataTypeWithAutoInfer({
 *       name: 'String',
 *       underlyingType: 'string',
 *       color: '#4A90E2'
 *     })
 *   },
 *   typeOfNodes: {
 *     inputNode: makeTypeOfNodeWithAutoInfer({
 *       name: 'Input',
 *       inputs: [],
 *       outputs: []
 *     })
 *   },
 *   nodes: [],
 *   edges: [],
 * });
 *
 * // ❌ Without auto-infer - No type validation
 * const state = {
 *   dataTypes: { stringType: { name: 'String', underlyingType: 'string', color: '#4A90E2' } },
 *   typeOfNodes: { inputNode: { name: 'Input', inputs: [], outputs: [] } },
 *   nodes: [],
 *   edges: [],
 * };
 * ```
 */
function makeStateWithAutoInfer<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  input: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
) {
  return input;
}

export {
  isSupportedUnderlyingType,
  makeDataTypeWithAutoInfer,
  makeTypeOfNodeWithAutoInfer,
  makeAllowedConversionsBetweenDataTypesWithAutoInfer,
  makeNodeCountConstraintsWithAutoInfer,
  makeStateWithAutoInfer,
  supportedUnderlyingTypesMap,
  isValidDataTypeId,
};
export type {
  SupportedUnderlyingTypes,
  DataType,
  TypeOfNode,
  TypeOfInput,
  TypeOfInputPanel,
  NodeCountConstraints,
  ActiveDrawer,
  State,
};
