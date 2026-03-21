# Data Types

## Overview

Data types are the foundation of the entire type system in
`react-blender-nodes`. Every handle (input/output port) on every node references
a data type, making data types the single most pervasive abstraction in the
library. A `DataType` definition controls the underlying runtime type of data
that flows through a connection, the visual appearance of the handle (color,
shape), and behavior flags like whether a handle allows direct UI input or has a
maximum connection count.

The system supports six underlying types, each serving a distinct role:
`'string'`, `'number'`, and `'boolean'` are primitive types with direct UI input
support; `'complex'` represents user-defined types validated by Zod schemas;
`'inferFromConnection'` is a polymorphic placeholder resolved at connection time
by the type inference system; and `'noEquivalent'` represents structural-only
connections that carry no runtime value. This design allows the library to
handle everything from simple scalar data to richly-typed domain objects with
compile-time and connection-time validation.

Data types are stored as a top-level field (`dataTypes`) in the `State` object,
keyed by unique string identifiers (e.g., `'stringType'`, `'condition'`). They
are referenced by ID throughout the system -- in node type definitions
(`typeOfNodes`), in instantiated handle data on nodes, in edge validation logic,
and in the runner's value resolution. Four standard data types (`groupInfer`,
`loopInfer`, `condition`, `bindLoopNodes`) are defined internally to support
node groups and loops.

## Entity-Relationship Diagram

```
                            +-------------------+
                            |      State        |
                            |-------------------|
                            | dataTypes    *----+-----+
                            | typeOfNodes       |     |
                            | nodes             |     |
                            | edges             |     |
                            | viewport          |     |
                            | ...flags          |     |
                            +-------------------+     |
                                                      |
              +---------------------------------------+
              |
              v
    +-----------------------------+
    |   DataType<U, C>            |     1         *   +---------------------------+
    |-----------------------------|<----- refs -------|  TypeOfInput               |
    | name: string                |                   |---------------------------|
    | underlyingType: U           |                   | name: string              |
    | complexSchema?: C           |                   | dataType: DataTypeUniqueId|
    | color: string               |                   | allowInput?: boolean      |
    | shape?: HandleShape         |                   | maxConnections?: number   |
    | allowInput?: boolean        |                   +---------------------------+
    | maxConnections?: number     |                        |           |
    +-----------------------------+                        |           |
         |          |                                      v           v
         |          |                          +-----------+    +------------+
         |          |                          | TypeOfNode|    | TypeOfNode |
         |          |                          | .inputs[] |    | .outputs[] |
         |          |                          +-----------+    +------------+
         |          |
         |          +----> HandleShape (circle, square, diamond, star, etc.)
         |
         v
    +------------------------------------+
    | ConfigurableNodeInput / Output     |
    |------------------------------------|
    | dataType: {                        |
    |   dataTypeObject: DataType         |  <-- full DataType object
    |   dataTypeUniqueId: string         |  <-- key into state.dataTypes
    | }                                  |
    | inferredDataType?: { ... } | null  |  <-- resolved type for infer handles
    +------------------------------------+
         |
         v
    +------------------------------------+
    | ContextAwareHandle                 |
    |------------------------------------|
    | color  <-- from dataType.color     |
    | shape  <-- from dataType.shape     |
    +------------------------------------+
```

## Functional Dependency Diagram

```
    +-------------------------------------------------------+
    | DEPENDS ON DataType                                    |
    |                                                        |
    | TypeOfInput / TypeOfNode  (references dataType by ID)  |
    | ConfigurableNodeInput     (stores dataType + inferred) |
    | ConfigurableNodeOutput    (stores dataType + inferred) |
    | ContextAwareHandle        (reads color, shape)         |
    | addEdgeWithTypeChecking   (validates type compat)      |
    | inferTypesAfterEdgeAddition (resolves infer types)     |
    | inferTypesAfterEdgeRemoval  (resets infer types)       |
    | checkComplexTypeCompat... (compares Zod schemas)       |
    | checkTypeConversionCompat (reads conversion map)       |
    | ValueStore.resolveInputs  (reads dataTypeUniqueId)     |
    | ValueStore.buildOutputInfo(reads dataTypeUniqueId)     |
    | Import/Export system      (strips/rehydrates schemas)  |
    +-------------------------------------------------------+

    +-------------------------------------------------------+
    | DataType DEPENDS ON                                    |
    |                                                        |
    | SupportedUnderlyingTypes  (the 6-value union)          |
    | HandleShape               (visual shape enum)          |
    | z.ZodType                 (Zod schema for complex)     |
    +-------------------------------------------------------+
```

## Data Flow Diagram

```
    1. DEFINITION                     2. STATE REGISTRATION
    +--------------------------+      +---------------------------+
    | makeDataTypeWithAutoInfer|      | state.dataTypes = {       |
    | ({                       | ---> |   myType: { name, color,  |
    |   name, underlyingType,  |      |     underlyingType, ... } |
    |   color, shape, ...      |      | }                         |
    | })                       |      +---------------------------+
    +--------------------------+                  |
                                                  |
    3. NODE TYPE DEFINITION                       |
    +----------------------------+                |
    | typeOfNodes.myNode.inputs  | <-- refs by ID |
    |   [{ dataType: 'myType' }] |                |
    +----------------------------+                |
                |                                 |
                v                                 v
    4. NODE INSTANTIATION (constructInputOrOutputOfType)
    +----------------------------------------------------+
    | ConfigurableNodeInput {                             |
    |   dataType: {                                      |
    |     dataTypeObject: state.dataTypes['myType'],     |
    |     dataTypeUniqueId: 'myType'                     |
    |   },                                               |
    |   handleColor: dataTypes['myType'].color,          |
    |   handleShape: dataTypes['myType'].shape,          |
    |   allowInput: dataTypes['myType'].allowInput,      |
    |   maxConnections: dataTypes['myType'].maxConnections|
    | }                                                  |
    +----------------------------------------------------+
                |                       |
                v                       v
    5. HANDLE RENDERING          6. EDGE VALIDATION
    +--------------------+       +--------------------------------+
    | ContextAwareHandle |       | addEdgeWithTypeChecking()      |
    | color -> CSS bg    |       |   -> inferTypesAfterEdgeAdd()  |
    | shape -> visual    |       |   -> checkComplexTypeCompat()  |
    +--------------------+       |   -> checkTypeConversion()     |
                                 +--------------------------------+
                                            |
                                            v
                                 7. RUNNER EXECUTION
                                 +--------------------------------+
                                 | ValueStore.resolveInputs()     |
                                 |   dataTypeId from handle       |
                                 | InputHandleValue.dataTypeId    |
                                 | OutputHandleInfo.dataTypeId    |
                                 +--------------------------------+
```

## System Diagram

```
    +============================================================================+
    |                         react-blender-nodes                                 |
    +============================================================================+
    |                                                                              |
    |  +------------------+     +------------------+     +-------------------+     |
    |  | >>> DataTypes <<< |     |   Node Types     |     |   State Mgmt     |     |
    |  |------------------|     |------------------|     |-------------------|     |
    |  | DataType<U,C>    |<----|  TypeOfNode       |     | State<D,N,U,C>   |     |
    |  | standard:        |     |  TypeOfInput      |     | .dataTypes       |--+  |
    |  |  - groupInfer    |     |  TypeOfInputPanel |     | .typeOfNodes     |  |  |
    |  |  - loopInfer     |     +------------------+     | .nodes / .edges  |  |  |
    |  |  - condition     |                               +-------------------+  |  |
    |  |  - bindLoopNodes |                                                      |  |
    |  +------------------+<-----------------------------------------------------+  |
    |         |    |                                                                 |
    |         |    +---------------------------+                                     |
    |         v                                v                                     |
    |  +------------------+     +-----------------------------+                      |
    |  | Handle Rendering |     |    Edge Validation          |                      |
    |  |------------------|     |-----------------------------|                      |
    |  | ContextAwareHandle|    | Type Inference               |                      |
    |  | color, shape from |    | Complex Type Checking        |                      |
    |  | DataType           |    | Type Conversion Checking     |                      |
    |  +------------------+     | Cycle Checking               |                      |
    |                           +-----------------------------+                      |
    |                                      |                                         |
    |                                      v                                         |
    |                           +-----------------------------+                      |
    |                           |    Runner System            |                      |
    |                           |-----------------------------|                      |
    |                           | Compiler (topological sort) |                      |
    |                           | Executor (ValueStore)       |                      |
    |                           | InputHandleValue.dataTypeId |                      |
    |                           | OutputHandleInfo.dataTypeId |                      |
    |                           +-----------------------------+                      |
    |                                      |                                         |
    |                                      v                                         |
    |                           +-----------------------------+                      |
    |                           |    Import / Export           |                      |
    |                           |-----------------------------|                      |
    |                           | Strips complexSchema on     |                      |
    |                           |   export (not serializable) |                      |
    |                           | Rehydrates from user-       |                      |
    |                           |   provided dataTypes on     |                      |
    |                           |   import                    |                      |
    |                           +-----------------------------+                      |
    |                                                                                |
    +================================================================================+
```

## Type Definitions

### SupportedUnderlyingTypes

Defined in [types.ts:9-21](src/utils/nodeStateManagement/types.ts#L9-L21):

```typescript
const supportedUnderlyingTypes = [
  'string',
  'number',
  'boolean',
  'complex',
  'noEquivalent',
  'inferFromConnection',
] as const;

type SupportedUnderlyingTypes = (typeof supportedUnderlyingTypes)[number];
```

| Underlying Type         | Purpose                                                         | Direct UI Input | Runtime Value       |
| ----------------------- | --------------------------------------------------------------- | --------------- | ------------------- |
| `'string'`              | Text data. Renders a text input when `allowInput` is true.      | Yes             | Yes                 |
| `'number'`              | Numeric data. Renders a number input when `allowInput` is true. | Yes             | Yes                 |
| `'boolean'`             | Boolean data. Renders a checkbox when `allowInput` is true.     | Yes             | Yes                 |
| `'complex'`             | User-defined structured data validated by a Zod schema.         | No              | Yes                 |
| `'inferFromConnection'` | Polymorphic placeholder resolved when a connection is made.     | No              | No (until inferred) |
| `'noEquivalent'`        | Structural-only connection carrying no runtime value.           | No              | No                  |

A type guard function `isSupportedUnderlyingType(type: string)` is provided for
runtime checks
([types.ts:48-52](src/utils/nodeStateManagement/types.ts#L48-L52)).

### DataType\<UnderlyingType, ComplexSchemaType\>

Defined in [types.ts:60-97](src/utils/nodeStateManagement/types.ts#L60-L97):

```typescript
type DataType<
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
> = UnderlyingType extends 'complex'
  ? {
      name: string;
      underlyingType: UnderlyingType;
      complexSchema: ComplexSchemaType; // Required for complex types
      color: string;
      shape?: HandleShape;
      allowInput?: boolean;
      maxConnections?: number;
    }
  : {
      name: string;
      underlyingType: UnderlyingType;
      complexSchema?: undefined; // Forbidden for non-complex types
      color: string;
      shape?: HandleShape;
      allowInput?: boolean;
      maxConnections?: number;
    };
```

The type uses a conditional type to enforce that `complexSchema` is **required**
when `underlyingType` is `'complex'` and **forbidden** (must be `undefined`) for
all other underlying types. This is enforced at compile time by TypeScript.

**Fields:**

| Field            | Type                       | Required     | Description                                                              |
| ---------------- | -------------------------- | ------------ | ------------------------------------------------------------------------ |
| `name`           | `string`                   | Yes          | Display name shown in the UI                                             |
| `underlyingType` | `SupportedUnderlyingTypes` | Yes          | The runtime category of this data type                                   |
| `complexSchema`  | `z.ZodType`                | Complex only | Zod validation schema (required for complex, forbidden otherwise)        |
| `color`          | `string`                   | Yes          | CSS color string used for handle rendering                               |
| `shape`          | `HandleShape`              | No           | Handle shape (circle, square, diamond, star, etc.). Defaults to circle   |
| `allowInput`     | `boolean`                  | No           | Whether handles of this type show a direct input widget when unconnected |
| `maxConnections` | `number`                   | No           | Maximum number of connections allowed per handle of this type            |

### makeDataTypeWithAutoInfer

Defined in [types.ts:128-135](src/utils/nodeStateManagement/types.ts#L128-L135):

```typescript
function makeDataTypeWithAutoInfer<
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(input: DataType<UnderlyingType, ComplexSchemaType>) {
  return input;
}
```

This is an identity function whose sole purpose is to enable TypeScript's
generic inference. By passing a data type definition through this function,
TypeScript narrows the `UnderlyingType` and `ComplexSchemaType` generics,
providing full type safety when the data type ID is later referenced in node
type definitions, state construction, and edge validation.

### isValidDataTypeId

Defined in [types.ts:140-154](src/utils/nodeStateManagement/types.ts#L140-L154).
A type guard that checks whether a string is a valid key in a `dataTypes`
record, narrowing the type to `DataTypeUniqueId`.

### AllowedConversionsBetweenDataTypes

Defined in [types.ts:300-304](src/utils/nodeStateManagement/types.ts#L300-L304):

```typescript
type AllowedConversionsBetweenDataTypes<
  DataTypeUniqueId extends string = string,
> = Partial<
  Record<DataTypeUniqueId, Partial<Record<DataTypeUniqueId, boolean>>>
>;
```

A two-dimensional partial map from source data type ID to target data type ID.
When `true`, conversion from source to target is allowed during edge validation.
Used by `checkTypeConversionCompatibilityAfterEdgeAddition`.

## Standard Data Types

Defined in
[standardNodes.ts:46-69](src/utils/nodeStateManagement/standardNodes.ts#L46-L69):

| ID              | Name            | Underlying Type       | Color     | Flags               | Purpose                                                                                                       |
| --------------- | --------------- | --------------------- | --------- | ------------------- | ------------------------------------------------------------------------------------------------------------- |
| `groupInfer`    | Group Infer     | `inferFromConnection` | `#333333` | --                  | Polymorphic handles on Group Input/Output nodes. Resolved when connected to a concrete type.                  |
| `loopInfer`     | Loop Infer      | `inferFromConnection` | `#333333` | --                  | Polymorphic handles on Loop Start/Stop/End nodes. Resolved when connected to a concrete type.                 |
| `condition`     | Condition       | `boolean`             | `#cca6d6` | `allowInput: true`  | Boolean condition input on Loop Stop nodes ("Continue If Condition Is True").                                 |
| `bindLoopNodes` | Bind Loop Nodes | `noEquivalent`        | `#8c52d1` | `maxConnections: 1` | Structural-only connection that binds Loop Start -> Loop Stop -> Loop End together. Carries no runtime value. |

These standard data types are used by the five standard node types
(`groupInput`, `groupOutput`, `loopStart`, `loopStop`, `loopEnd`) defined in the
same file.

## How Data Types Are Used

### In Node Type Definitions

Node types (`TypeOfNode`) reference data types by their unique ID string in the
`inputs` and `outputs` arrays via the `TypeOfInput.dataType` field
([types.ts:161-170](src/utils/nodeStateManagement/types.ts#L161-L170)):

```typescript
type TypeOfInput<DataTypeUniqueId extends string = string> = {
  name: string;
  dataType: DataTypeUniqueId; // <-- references a key in state.dataTypes
  allowInput?: boolean; // <-- can override the DataType's allowInput
  maxConnections?: number; // <-- can override the DataType's maxConnections
};
```

For example, a standard Loop Start node references `loopInfer` and
`bindLoopNodes` data types
([standardNodes.ts:102-125](src/utils/nodeStateManagement/standardNodes.ts#L102-L125)):

```typescript
loopStart: makeTypeOfNodeWithAutoInfer({
  name: 'Loop Start',
  inputs: [{ name: '', dataType: 'loopInfer' }],
  outputs: [
    { name: 'Bind Loop Nodes', dataType: 'bindLoopNodes' },
    { name: '', dataType: 'loopInfer' },
  ],
});
```

The `TypeOfInput.allowInput` and `TypeOfInput.maxConnections` fields can
override the corresponding fields from the `DataType` definition, allowing
per-handle customization.

### In Handle Rendering

When a node is instantiated, the `constructInputOrOutputOfType` function (in
`constructAndModifyNodes.ts`) reads the data type from `state.dataTypes` and
populates the `ConfigurableNodeInput`/`ConfigurableNodeOutput` with:

- `dataType.dataTypeObject` -- the full `DataType` object
- `dataType.dataTypeUniqueId` -- the string key
- `handleColor` -- from `DataType.color`
- `handleShape` -- from `DataType.shape`
- `allowInput` -- from `TypeOfInput.allowInput ?? DataType.allowInput`
- `maxConnections` -- from
  `TypeOfInput.maxConnections ?? DataType.maxConnections`

The `ContextAwareHandle` component
([ContextAwareHandle.tsx:283-351](src/components/organisms/ConfigurableNode/SupportingSubcomponents/ContextAwareHandle.tsx#L283-L351))
renders the visual handle using:

- `color` prop -> CSS `backgroundColor` on the handle shape
- `shape` prop -> selects from 13+ shape variants (circle, square, rectangle,
  list, grid, diamond, trapezium, hexagon, star, cross, zigzag, sparkle,
  parallelogram)
- `maxConnections` prop -> controls `isConnectable` on the ReactFlow `Handle`

### In Edge Validation

Edge validation is a multi-step process in `addEdgeWithTypeChecking`
([constructAndModifyHandles.ts:63-222](src/utils/nodeStateManagement/constructAndModifyHandles.ts#L63-L222)).
The three validation steps that involve data types are:

1. **Type Inference** (`inferTypesAfterEdgeAddition` in
   [newOrRemovedEdgeValidation.ts:29-298](src/utils/nodeStateManagement/newOrRemovedEdgeValidation.ts#L29-L298)):
   Checks if either handle has `underlyingType === 'inferFromConnection'`. If
   so, it attempts to infer the type from the connected handle. Fails if both
   handles are unresolved infer types with no inferred type. Succeeds and sets
   `inferredDataType` on all handles of the same `dataTypeUniqueId` across the
   node.

2. **Complex Type Compatibility**
   (`checkComplexTypeCompatibilityAfterEdgeAddition` in
   [newOrRemovedEdgeValidation.ts:300-424](src/utils/nodeStateManagement/newOrRemovedEdgeValidation.ts#L300-L424)):
   When `enableComplexTypeChecking` is true, checks that:
   - Complex types cannot connect to non-complex types
   - Two complex types can connect only if they have the same `dataTypeUniqueId`
     OR their `complexSchema` JSON representations are identical

3. **Type Conversion Compatibility**
   (`checkTypeConversionCompatibilityAfterEdgeAddition` in
   [newOrRemovedEdgeValidation.ts:426-532](src/utils/nodeStateManagement/newOrRemovedEdgeValidation.ts#L426-L532)):
   When `allowedConversionsBetweenDataTypes` is provided, checks whether the
   source-to-target data type conversion is explicitly allowed in the conversion
   map. A special flag
   `allowConversionBetweenComplexTypesUnlessDisallowedByComplexTypeChecking` can
   permit all complex-to-complex conversions.

### In Type Inference

The type inference system resolves `inferFromConnection` data types when edges
are added or removed.

**On edge addition**
([newOrRemovedEdgeValidation.ts:29-298](src/utils/nodeStateManagement/newOrRemovedEdgeValidation.ts#L29-L298)):

- If one handle is `inferFromConnection` and the other is a concrete type, the
  infer handle adopts the concrete handle's type as its `inferredDataType`
- If both handles are `inferFromConnection`, inference proceeds only if one
  already has an inferred type
- The inferred type propagates to **all** handles on the same node that share
  the same `dataTypeUniqueId`, via `inferTypeAcrossTheNodeForHandleOfDataType`
  ([typeInference.ts:92-182](src/utils/nodeStateManagement/edges/typeInference.ts#L92-L182))
- For group input/output nodes and loop nodes, the inference also overrides the
  `dataType` (not just `inferredDataType`) and the handle `name`, and adds
  duplicate handles for subsequent connections

**On edge removal**
([newOrRemovedEdgeValidation.ts:534-773](src/utils/nodeStateManagement/newOrRemovedEdgeValidation.ts#L534-L773)):

- If the removed edge was the last connection to any handle of an
  `inferFromConnection` data type on a node, the inferred type is **reset** (set
  back to undefined) across all handles of that data type on the node

The `getResultantDataTypeOfHandleConsideringInferredType` function
([constructAndModifyHandles.ts:391-430](src/utils/nodeStateManagement/constructAndModifyHandles.ts#L391-L430))
is used throughout the system to get the "effective" data type of a handle:

- If the handle's data type is NOT `inferFromConnection`, returns the main
  `dataType`
- If it IS `inferFromConnection` and has an `inferredDataType`, returns the
  inferred type
- If it IS `inferFromConnection` and has NO inferred type, returns `undefined`
  (or the original `inferFromConnection` type if
  `fallbackToInferFromConnectionTypeWhenNotInferred` is true)

### In the Runner

During graph execution, the `ValueStore` class
([valueStore.ts:78-294](src/utils/nodeRunner/valueStore.ts#L78-L294)) resolves
input and output handle values using data type IDs.

**Input resolution** (`resolveInputs`,
[valueStore.ts:134-219](src/utils/nodeRunner/valueStore.ts#L134-L219)):

- For each input handle, reads `dataTypeId` from the handle's
  `inferredDataType.dataTypeUniqueId` (preferred) or `dataType.dataTypeUniqueId`
  (fallback)
- This `dataTypeId` is stored in `InputHandleValue.dataTypeId` and passed to the
  `FunctionImplementation`

**Output info** (`buildOutputInfo`,
[valueStore.ts:227-265](src/utils/nodeRunner/valueStore.ts#L227-L265)):

- For each output handle, reads `dataTypeId` the same way
- Stored in `OutputHandleInfo.dataTypeId`

The runner types ([types.ts](src/utils/nodeRunner/types.ts)) carry `dataTypeId`
through multiple recording types:

- `InputHandleValue.dataTypeId` -- the data type ID of each input during
  execution
- `OutputHandleInfo.dataTypeId` -- the data type ID of each output during
  execution
- `InputConnectionValue.sourceDataTypeId` -- the source output's data type ID
- `RecordedInputHandleValue.dataTypeId` -- persisted in execution recordings
- `RecordedOutputHandleValue.dataTypeId` -- persisted in execution recordings

## Limitations and Deprecated Patterns

1. **Complex type comparison uses JSON.stringify**: Complex type compatibility
   ([newOrRemovedEdgeValidation.ts:399-407](src/utils/nodeStateManagement/newOrRemovedEdgeValidation.ts#L399-L407))
   compares Zod schemas by `JSON.stringify`-ing them. This works for
   structurally identical schemas but may produce false negatives for
   semantically equivalent schemas with different internal representations.

2. **No runtime validation during execution**: The runner does not validate
   values against `complexSchema` at runtime. Data type information flows
   through as metadata (`dataTypeId`), but no Zod `.parse()` calls are made
   during execution. Validation is purely a connection-time concern.

3. **`allowInput` on DataType vs TypeOfInput**: Both `DataType` and
   `TypeOfInput` have `allowInput` and `maxConnections` fields. The
   `TypeOfInput` values take precedence when constructing node instances, but
   this precedence logic is in `constructInputOrOutputOfType`, not in the type
   system itself.

4. **Infer types require at least one concrete connection**: Two
   `inferFromConnection` handles cannot connect unless at least one has already
   been inferred. This means the first connection to an infer handle must always
   come from a concrete type.

5. **`complexSchema` is not serializable**: Zod schemas are class instances and
   cannot be JSON-serialized. The import/export system strips `complexSchema` on
   export and rehydrates it on import from user-provided data types.

## Examples

### Defining Basic Data Types

```typescript
import { makeDataTypeWithAutoInfer } from 'react-blender-nodes';

const stringType = makeDataTypeWithAutoInfer({
  name: 'String',
  underlyingType: 'string',
  color: '#4A90E2',
  allowInput: true,
});

const numberType = makeDataTypeWithAutoInfer({
  name: 'Number',
  underlyingType: 'number',
  color: '#50E3C2',
  allowInput: true,
});

const booleanType = makeDataTypeWithAutoInfer({
  name: 'Boolean',
  underlyingType: 'boolean',
  color: '#cca6d6',
  allowInput: true,
});
```

### Defining Complex Data Types

```typescript
import { z } from 'zod';
import { makeDataTypeWithAutoInfer } from 'react-blender-nodes';

const vector3Schema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

const vector3Type = makeDataTypeWithAutoInfer({
  name: 'Vector3',
  underlyingType: 'complex',
  complexSchema: vector3Schema,
  color: '#9B59B6',
  shape: 'diamond',
});
```

### Using allowInput and maxConnections

```typescript
import { makeDataTypeWithAutoInfer } from 'react-blender-nodes';

// A data type that shows a direct input widget when the handle is unconnected
const editableString = makeDataTypeWithAutoInfer({
  name: 'Editable String',
  underlyingType: 'string',
  color: '#4A90E2',
  allowInput: true, // Shows text input when unconnected
});

// A data type that limits connections to exactly 1 (like bindLoopNodes)
const singleConnection = makeDataTypeWithAutoInfer({
  name: 'Single Link',
  underlyingType: 'noEquivalent',
  color: '#8c52d1',
  maxConnections: 1, // Only one edge allowed per handle
});
```

## Relationships with Other Features

### -> [Handles](handlesDoc.md)

Data types define the visual appearance and connection behavior of handles. When
a node is instantiated, each handle receives its `handleColor` from
`DataType.color`, its `handleShape` from `DataType.shape` (defaulting to
`'circle'`), and its `maxConnections` from `DataType.maxConnections`. These
values flow from `state.dataTypes` through node construction into
`ConfigurableNodeInput`/`ConfigurableNodeOutput` and finally to the
`ContextAwareHandle` React component. The handle shape supports 13+ variants
defined in `ContextAwareHandleShapes.ts`: circle, square, rectangle, list, grid,
diamond, trapezium, hexagon, star, cross, zigzag, sparkle, and parallelogram.

### -> [Type Inference](typeInferenceDoc.md)

Data types with `underlyingType: 'inferFromConnection'` are the trigger for the
type inference system. When such a handle is connected to a handle with a
concrete type, `inferTypeOnHandleAfterConnectingWithAnotherHandle`
([typeInference.ts:12-90](src/utils/nodeStateManagement/edges/typeInference.ts#L12-L90))
sets the `inferredDataType` field on the handle. The function
`inferTypeAcrossTheNodeForHandleOfDataType`
([typeInference.ts:92-182](src/utils/nodeStateManagement/edges/typeInference.ts#L92-L182))
then propagates this inferred type to **all** handles on the same node that
share the same `dataTypeUniqueId`. This is how a Group Input node's single infer
handle can adopt the type of whatever it's connected to, and all its sibling
handles update simultaneously.

### -> [Connection Validation](../features/connectionValidationDoc.md)

Data types are central to all three validation checks during edge addition:

1. **Type inference validation**: Checks
   `underlyingType === 'inferFromConnection'` on both handles to determine if
   inference is needed
2. **Complex type checking**: Compares `underlyingType === 'complex'` and then
   checks `complexSchema` equality via JSON comparison
3. **Type conversion checking**: Looks up `dataTypeUniqueId` of source and
   target in the `allowedConversionsBetweenDataTypes` map

The validation order matters: inference runs first (to resolve infer types),
then complex checking, then conversion checking. Each step uses the _resultant_
data type (considering inference) via
`getResultantDataTypeOfHandleConsideringInferredType`.

### -> [Nodes](nodesDoc.md)

Node type definitions (`TypeOfNode`) reference data type IDs in their `inputs`
and `outputs` arrays. The `TypeOfInput.dataType` field is a string that must
match a key in `state.dataTypes`. When using `makeTypeOfNodeWithAutoInfer` with
explicit generic parameters (e.g.,
`makeTypeOfNodeWithAutoInfer<keyof typeof standardDataTypes, ...>`), TypeScript
enforces that all `dataType` references are valid keys. Node instantiation reads
from `state.dataTypes` to populate the full `DataType` object on each handle.

### -> [State Management](stateManagementDoc.md)

Data types are stored as
`state.dataTypes: Record<DataTypeUniqueId, DataType<...>>`, a top-level field in
the `State` type
([types.ts:373-376](src/utils/nodeStateManagement/types.ts#L373-L376)). The
state also contains several flags that control how data types are validated:

- `enableTypeInference` -- enables/disables the `inferFromConnection` resolution
  system
- `enableComplexTypeChecking` -- enables/disables Zod schema comparison for
  complex types
- `allowedConversionsBetweenDataTypes` -- the conversion allowlist between data
  type IDs
- `allowConversionBetweenComplexTypesUnlessDisallowedByComplexTypeChecking` --
  special flag for complex-to-complex conversion

The `makeStateWithAutoInfer` helper
([types.ts:513-529](src/utils/nodeStateManagement/types.ts#L513-L529)) ensures
all four generic parameters (`DataTypeUniqueId`, `NodeTypeUniqueId`,
`UnderlyingType`, `ComplexSchemaType`) are inferred consistently across
`dataTypes`, `typeOfNodes`, `nodes`, and `edges`.

### -> [Runner](../runner/runnerHookDoc.md)

During execution, data type IDs flow through the runner as metadata but do not
affect execution logic directly. The `ValueStore.resolveInputs` method reads
`dataTypeUniqueId` from each handle's `inferredDataType` (preferred) or
`dataType` (fallback) to populate `InputHandleValue.dataTypeId`. Similarly,
`buildOutputInfo` populates `OutputHandleInfo.dataTypeId`. These IDs are
available to `FunctionImplementation` callbacks for type-aware processing and
are persisted in `ExecutionStepRecord` for replay/inspection. The runner does
not perform Zod validation -- it trusts that connection-time validation has
already ensured type safety.

### -> [Edges](edgesDoc.md)

Edges connect source output handles to target input handles. Edge validation
(`addEdgeWithTypeChecking`) reads the data types of both handles to determine
whether the connection is allowed. The `ConfigurableEdgeState` type stores the
edge metadata but does not directly reference data types -- the data type
information lives on the handles at each end of the edge. When an edge is
removed (`removeEdgeWithTypeChecking`), the system checks if the removed edge
was the last connection to an `inferFromConnection` handle, and if so, resets
the inferred type.

### -> [Import/Export](../importExport/importExportDoc.md)

The import/export system handles the non-serializable nature of Zod schemas in
`DataType.complexSchema`:

**Export** (`stateExport.ts`): Strips `complexSchema` from every entry in
`state.dataTypes` and from every handle's `dataType.dataTypeObject` on all
nodes. This produces a JSON-serializable snapshot.

**Import** (`stateImport.ts`): Requires the caller to provide the original
`dataTypes` record (with live Zod schemas). The import process:

1. Validates the imported data has a `dataTypes` field
2. Rehydrates `complexSchema` on each `state.dataTypes` entry from the
   user-provided `dataTypes`
3. Rehydrates `dataType.dataTypeObject` on every handle of every node from the
   same `dataTypes` lookup

This design means exported state is portable as JSON, but importing requires the
original data type definitions to restore full type validation capability.
