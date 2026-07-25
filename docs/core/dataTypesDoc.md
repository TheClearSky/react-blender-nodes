# Data Types

## Overview

Data types are the foundation of the entire type system in
`react-blender-nodes`. Every handle (input/output port) on every node references
a data type, making data types the single most pervasive abstraction in the
library. A `DataType` definition controls the underlying runtime type of data
that flows through a connection, the visual appearance of the handle (color,
shape), and behavior flags like whether a handle allows direct UI input or has a
maximum connection count.

The system supports exactly six underlying types, each serving a distinct role:
`'string'`, `'number'`, and `'boolean'` are primitive types with direct UI input
support; `'complex'` represents user-defined types validated by Zod schemas;
`'inferFromConnection'` is a polymorphic placeholder resolved at connection time
by the type inference system; and `'noEquivalent'` represents structural-only
connections that carry no runtime value (used by the loop/switch bind handles).
This design allows the library to handle everything from simple scalar data to
richly-typed domain objects with compile-time and connection-time validation.

Data types are stored as a top-level field (`dataTypes`) in the `State` object,
keyed by unique string identifiers (e.g., `'stringType'`, `'condition'`). They
are referenced by ID throughout the system -- in node type definitions
(`typeOfNodes`), in instantiated handle data on nodes, in edge validation logic,
and in the runner's value resolution. Six standard data types (`groupInfer`,
`loopInfer`, `switchInfer`, `condition`, `bindLoopNodes`, `bindSwitchNodes`) are
defined internally to support node groups, loops, and switches.

The full data type generic surface is parameterised over four type params used
throughout the library: `DataTypeUniqueId extends string`,
`NodeTypeUniqueId extends string`,
`UnderlyingType extends SupportedUnderlyingTypes`, and
`ComplexSchemaType extends UnderlyingType extends 'complex' ? z.ZodType : never`.

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
    | allowedStrings?: string[]   |  (non-complex string)  |           |
    +-----------------------------+                        v           v
         |          |                          +-----------+    +------------+
         |          |                          | TypeOfNode|    | TypeOfNode |
         |          |                          | .inputs[] |    | .outputs[] |
         |          |                          +-----------+    +------------+
         |          |
         |          +----> HandleShape (13 variants: circle, square, ... )
         |
         v
    +------------------------------------+
    | ConfigurableNodeInput / Output     |
    |------------------------------------|
    | type: 'string'|'number'|'boolean'  |  <-- discriminant
    |       |'unsupportedDirectly'       |      (complex/noEquivalent/infer
    |                                    |       all collapse to last one)
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
    | validateAddEdge           (validates type compat)      |
    | planInferenceForEdgeAddition (resolves infer types)    |
    | inferTypesAfterEdgeRemoval  (resets infer types)       |
    | checkComplexTypeCompat... (compares Zod schema refs)   |
    | checkTypeConversionCompat (reads conversion map)       |
    | ValueStore.resolveInputs  (reads dataTypeUniqueId)     |
    | ValueStore.buildOutputInfo(reads dataTypeUniqueId)     |
    | Import/Export system      (strips/rehydrates schemas)  |
    +-------------------------------------------------------+

    +-------------------------------------------------------+
    | DataType DEPENDS ON                                    |
    |                                                        |
    | SupportedUnderlyingTypes  (the 6-value union)          |
    | HandleShape               (13-variant visual enum)     |
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
    |   type: <number|string|boolean|unsupportedDirectly>|
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
    5. HANDLE RENDERING          6. EDGE VALIDATION (Plan/Apply)
    +--------------------+       +--------------------------------+
    | ContextAwareHandle |       | validateAddEdge()              |
    | color -> CSS bg    |       |   -> planInferenceForEdgeAdd() |
    | shape -> visual    |       |   -> applyInferencePlan...()   |
    +--------------------+       |   -> checkComplexTypeCompat()  |
                                 |   -> checkTypeConversion()     |
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
    |  | standard (6):    |     |  TypeOfInput      |     | .dataTypes       |--+  |
    |  |  - groupInfer    |     |  TypeOfInputPanel |     | .typeOfNodes     |  |  |
    |  |  - loopInfer     |     +------------------+     | .nodes / .edges  |  |  |
    |  |  - switchInfer   |                               | .zones / history |  |  |
    |  |  - condition     |                               +-------------------+  |  |
    |  |  - bindLoopNodes |                                                      |  |
    |  |  - bindSwitchNodes|<----------------------------------------------------+  |
    |  +------------------+                                                          |
    |         |    |                                                                 |
    |         |    +---------------------------+                                     |
    |         v                                v                                     |
    |  +------------------+     +-----------------------------+                      |
    |  | Handle Rendering |     |    Edge Validation          |                      |
    |  |------------------|     |    (planApply/ pipeline)    |                      |
    |  | ContextAwareHandle|    | Type Inference (plan/apply)  |                      |
    |  | color, shape from |    | Complex Type Checking        |                      |
    |  | DataType           |    | Type Conversion Checking     |                      |
    |  +------------------+     | Cycle / Loop / Switch checks |                      |
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

Defined in `src/utils/nodeStateManagement/types.ts` ›
`SupportedUnderlyingTypes`:

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

The tuple has **exactly 6** members. `supportedUnderlyingTypes` itself is not
exported; the object-form `supportedUnderlyingTypesMap`
(`src/utils/nodeStateManagement/types.ts` › `supportedUnderlyingTypesMap`) is
exported for `in`-based checks, and is what the type guard reads.

| Underlying Type         | Purpose                                                                                             | Direct UI Input | Runtime Value       |
| ----------------------- | --------------------------------------------------------------------------------------------------- | --------------- | ------------------- |
| `'string'`              | Text data. Renders a text input (or a select if `allowedStrings` is set) when `allowInput` is true. | Yes             | Yes                 |
| `'number'`              | Numeric data. Renders a number input when `allowInput` is true.                                     | Yes             | Yes                 |
| `'boolean'`             | Boolean data. Renders a checkbox when `allowInput` is true.                                         | Yes             | Yes                 |
| `'complex'`             | User-defined structured data described by a Zod schema.                                             | No              | Yes                 |
| `'inferFromConnection'` | Polymorphic placeholder resolved when a connection is made.                                         | No              | No (until inferred) |
| `'noEquivalent'`        | Structural-only connection carrying no runtime value (loop/switch bind handles).                    | No              | No                  |

A type guard function `isSupportedUnderlyingType(type: string)` is provided for
runtime checks (`src/utils/nodeStateManagement/types.ts` ›
`isSupportedUnderlyingType`). It is implemented as
`type in supportedUnderlyingTypesMap`.

> Note: when a node is instantiated, every underlying type that is **not**
> `'number'`, `'string'`, or `'boolean'` (i.e. `'complex'`, `'noEquivalent'`,
> and `'inferFromConnection'`) collapses to the instantiated handle discriminant
> `type: 'unsupportedDirectly'`. See
> [Handle Instantiation](#in-handle-rendering).

### DataType\<UnderlyingType, ComplexSchemaType\>

Defined in `src/utils/nodeStateManagement/types.ts` › `DataType`:

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
      // Only the non-complex branch carries this:
      allowedStrings?: readonly string[];
    };
```

The type uses a conditional type to enforce that `complexSchema` is **required**
when `underlyingType` is `'complex'` and **forbidden** (must be `undefined`) for
all other underlying types. This is enforced at compile time by TypeScript. The
non-complex branch additionally carries the optional `allowedStrings` field
(only meaningful for `'string'` types).

**Fields:**

| Field            | Type                       | Required         | Description                                                                                          |
| ---------------- | -------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------- |
| `name`           | `string`                   | Yes              | Display name shown in the UI                                                                         |
| `underlyingType` | `SupportedUnderlyingTypes` | Yes              | The runtime category of this data type                                                               |
| `complexSchema`  | `z.ZodType`                | Complex only     | Zod validation schema (required for complex, forbidden otherwise)                                    |
| `color`          | `string`                   | Yes              | CSS color string used for handle rendering                                                           |
| `shape`          | `HandleShape`              | No               | Handle shape (one of 13 variants). Defaults to `'circle'`.                                           |
| `allowInput`     | `boolean`                  | No               | Whether handles of this type show a direct input widget when unconnected                             |
| `maxConnections` | `number`                   | No               | Maximum number of connections allowed per handle of this type                                        |
| `allowedStrings` | `readonly string[]`        | No (string only) | When set on a non-complex `'string'` type, the handle renders a select dropdown instead of free text |

### makeDataTypeWithAutoInfer

Defined in `src/utils/nodeStateManagement/types.ts` ›
`makeDataTypeWithAutoInfer`:

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

Defined in `src/utils/nodeStateManagement/types.ts` › `isValidDataTypeId`. A
type guard that checks whether a string is a valid key in a `dataTypes` record,
narrowing the type to `DataTypeUniqueId`. It is exported as part of the public
API but is not used internally by the library.

### AllowedConversionsBetweenDataTypes

Defined in `src/utils/nodeStateManagement/types.ts` ›
`AllowedConversionsBetweenDataTypes`:

```typescript
type AllowedConversionsBetweenDataTypes<
  DataTypeUniqueId extends string = string,
> = Partial<
  Record<DataTypeUniqueId, Partial<Record<DataTypeUniqueId, boolean>>>
>;
```

A two-dimensional partial map from source data type ID to target data type ID.
When `true`, conversion from source to target is allowed during edge validation.
Used by `checkTypeConversionCompatibilityAfterEdgeAddition`. A
`makeAllowedConversionsBetweenDataTypesWithAutoInfer` identity helper
(`src/utils/nodeStateManagement/types.ts` ›
`makeAllowedConversionsBetweenDataTypesWithAutoInfer`) is provided for type-safe
construction.

## Standard Data Types

Defined in `src/utils/nodeStateManagement/standardNodes.ts` ›
`standardDataTypes`. There are **six** standard data types
(`standardDataTypeNames`):

| ID                | Name              | Underlying Type       | Color     | Flags               | Purpose                                                                                                      |
| ----------------- | ----------------- | --------------------- | --------- | ------------------- | ------------------------------------------------------------------------------------------------------------ |
| `groupInfer`      | Group Infer       | `inferFromConnection` | `#333333` | --                  | Polymorphic handles on Group Input/Output nodes. Resolved when connected to a concrete type.                 |
| `loopInfer`       | Loop Infer        | `inferFromConnection` | `#333333` | --                  | Polymorphic handles on Loop Start/Stop/End nodes. Resolved when connected to a concrete type.                |
| `switchInfer`     | Switch Infer      | `inferFromConnection` | `#333333` | --                  | Polymorphic handles on Switch Start/End nodes. Resolved when connected to a concrete type.                   |
| `condition`       | Condition         | `boolean`             | `#cca6d6` | `allowInput: true`  | Boolean condition input on Loop Stop ("Continue If Condition Is True") and Switch Start ("Condition") nodes. |
| `bindLoopNodes`   | Bind Loop Nodes   | `noEquivalent`        | `#8c52d1` | `maxConnections: 1` | Structural-only connection binding Loop Start -> Loop Stop -> Loop End together. Carries no runtime value.   |
| `bindSwitchNodes` | Bind Switch Nodes | `noEquivalent`        | `#8c52d1` | `maxConnections: 1` | Structural-only connection binding Switch Start -> Switch End together. Carries no runtime value.            |

These standard data types are used by the **seven** standard node types
(`standardNodeTypeNames`: `groupInput`, `groupOutput`, `loopStart`, `loopEnd`,
`loopStop`, `switchStart`, `switchEnd`) defined in the same file
(`src/utils/nodeStateManagement/standardNodes.ts` › `standardNodeTypes`). The
companion exports `standardHiddenNodeTypesInContextMenu` (hides all 7 from the
"Add Node" menu) and `standardNodeCountConstraints` (constrains only
`groupInput`/`groupOutput` to exactly 1 per group and 0 in root) live alongside
them.

## How Data Types Are Used

### In Node Type Definitions

Node types (`TypeOfNode`) reference data types by their unique ID string in the
`inputs` and `outputs` arrays via the `TypeOfInput.dataType` field
(`src/utils/nodeStateManagement/types.ts` › `TypeOfInput`):

```typescript
type TypeOfInput<DataTypeUniqueId extends string = string> = {
  name: string;
  dataType: DataTypeUniqueId; // <-- references a key in state.dataTypes
  allowInput?: boolean; // <-- can override the DataType's allowInput
  maxConnections?: number; // <-- can override the DataType's maxConnections
};
```

For example, a standard Loop Start node references `loopInfer` and
`bindLoopNodes` data types (`src/utils/nodeStateManagement/standardNodes.ts` ›
`standardNodeTypes`):

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
per-handle customization. Inputs may also be grouped under a `TypeOfInputPanel`
(a `{ name, inputs: TypeOfInput[] }` collapsible panel); panels are only allowed
in `inputs`, never in `outputs`.

### In Handle Rendering

When a node is instantiated, the `constructInputOrOutputOfType` function
(`src/utils/nodeStateManagement/nodes/constructAndModifyNodes.ts` ›
`constructInputOrOutputOfType`) reads the data type from `state.dataTypes`,
resolves the effective `allowInput`/`maxConnections`
(`TypeOfInput.x ?? DataType.x`), mints a 20-char random id, and branches on
`underlyingType` to produce the discriminated handle:

- `'number'` -> `type: 'number'`
- `'string'` -> `type: 'string'` (and copies `allowedStrings` through)
- `'boolean'` -> `type: 'boolean'`
- everything else (`'complex'`, `'noEquivalent'`, `'inferFromConnection'`) ->
  `type: 'unsupportedDirectly'`

Every branch populates:

- `dataType.dataTypeObject` -- the full `DataType` object
- `dataType.dataTypeUniqueId` -- the string key
- `handleColor` -- from `DataType.color`
- `handleShape` -- from `DataType.shape`
- `allowInput` -- from `TypeOfInput.allowInput ?? DataType.allowInput`
- `maxConnections` -- from
  `TypeOfInput.maxConnections ?? DataType.maxConnections`

The instantiated handle types are `ConfigurableNodeInput` /
`ConfigurableNodeOutput`
(`src/components/organisms/ConfigurableNode/ConfigurableNode.tsx` ›
`ConfigurableNodeInput`), each a common-fields object intersected with a
discriminated `type` union
(`'string' | 'number' | 'boolean' | 'unsupportedDirectly'`).

The `ContextAwareHandle` component
(`src/components/organisms/ConfigurableNode/SupportingSubcomponents/ContextAwareHandle.tsx`
› `ContextAwareHandle`) renders the visual handle using:

- `color` prop -> CSS `backgroundColor` on the handle shape
- `shape` prop -> selects from the 13 shape variants defined in
  `src/components/atoms/HandleShapeSwatch/handleShapes.ts` › `handleShapes`:
  `circle`, `square`, `rectangle`, `list`, `grid`, `diamond`, `trapezium`,
  `hexagon`, `star`, `cross`, `zigzag`, `sparkle`, `parallelogram`
- `maxConnections` prop -> controls `isConnectable` on the ReactFlow `Handle`

### In Edge Validation

> **Architecture note:** Edge validation now runs through the pure
> **Plan/Apply** pipeline under `src/utils/nodeStateManagement/planApply/`. The
> reducer's `validateAction`
> (`src/utils/nodeStateManagement/planApply/validators.ts` › `validateAction`)
> routes `ADD_EDGE_BY_REACT_FLOW` to
> `src/utils/nodeStateManagement/planApply/validateAddEdge.ts` ›
> `validateAddEdge`, which returns a `Result<AddEdgePlan, ValidationError>`; the
> actual mutation is performed later by `applyPlan`. The legacy mutating helper
> `addEdgeWithTypeChecking`
> (`src/utils/nodeStateManagement/constructAndModifyHandles.ts` ›
> `addEdgeWithTypeChecking`) still exists and is exported, but is **no longer
> called by production code** (only by `edgeValidation.test.ts`). Edge _removal_
> still flows through the pure `removeEdgeWithTypeChecking`
> (`src/utils/nodeStateManagement/constructAndModifyHandles.ts` ›
> `removeEdgeWithTypeChecking`), invoked from `validateAction`'s
> `UPDATE_EDGES_BY_REACT_FLOW` case.

`validateAddEdge` (`src/utils/nodeStateManagement/planApply/validateAddEdge.ts`
› `validateAddEdge`) runs, in order: endpoint null-checks, cycle check (if
`enableCycleChecking`), duplicate-edge check, loop validation, switch
validation, then the three data-type-aware steps below. Steps that involve data
types operate against a **projected** post-inference state:

1. **Type Inference** (`planInferenceForEdgeAddition` in
   `src/utils/nodeStateManagement/planApply/planInference.ts` ›
   `planInferenceForEdgeAddition`): When `enableTypeInference` is on, builds an
   `InferencePlan` of `nodeDataReplacements` via dry-run inference. The plan is
   applied to a shallow projection (`applyInferencePlanToProjection`) so the
   next two checks see the resolved types. Inference fails (rejecting the edge
   with `TYPE_INFERENCE_FAILED`) when neither handle can be resolved to a
   concrete type.

2. **Complex Type Compatibility**
   (`checkComplexTypeCompatibilityAfterEdgeAddition` in
   `src/utils/nodeStateManagement/newOrRemovedEdgeValidation.ts` ›
   `checkComplexTypeCompatibilityAfterEdgeAddition`): When
   `enableComplexTypeChecking` is true, checks that:
   - Complex types cannot connect to non-complex types
   - Two complex types can connect only if they have the same `dataTypeUniqueId`
     **OR** their `complexSchema` **references are identical** (`===`). Data
     types are immutable singletons defined once in state, so reference equality
     is sufficient -- two handles sharing a data type point to the same object.

3. **Type Conversion Compatibility**
   (`checkTypeConversionCompatibilityAfterEdgeAddition` in
   `src/utils/nodeStateManagement/newOrRemovedEdgeValidation.ts` ›
   `checkTypeConversionCompatibilityAfterEdgeAddition`): When
   `allowedConversionsBetweenDataTypes` is provided, allows the connection if
   the source and target resolve to the same data type ID, or the
   source-to-target conversion is explicitly `true` in the map, or both handles
   are complex **and**
   `allowConversionBetweenComplexTypesUnlessDisallowedByComplexTypeChecking` is
   true.

### In Type Inference

The type inference system resolves `inferFromConnection` data types when edges
are added or removed.

**On edge addition** (planned by `planInferenceForEdgeAddition`, applied by
`applyPlan`):

- If one handle is `inferFromConnection` and the other is a concrete type, the
  infer handle adopts the concrete handle's type as its `inferredDataType`
- If both handles are `inferFromConnection`, inference proceeds only if one
  already has an inferred type
- The inferred type propagates to **all** handles on the same node that share
  the same `dataTypeUniqueId`, via `inferTypeAcrossTheNodeForHandleOfDataType`
  (`src/utils/nodeStateManagement/edges/typeInference.ts` ›
  `inferTypeAcrossTheNodeForHandleOfDataType`), which calls the module-local
  `inferTypeOnHandleAfterConnectingWithAnotherHandle`
  (`src/utils/nodeStateManagement/edges/typeInference.ts` ›
  `inferTypeOnHandleAfterConnectingWithAnotherHandle`) per matching handle. The
  latter takes a `mutate` flag: when `false` it returns a new handle via Immer
  `produce` (used for the dry-run plan); when `true` it mutates in place.
- For group input/output nodes and loop/switch nodes, inference can also
  override the `dataType` (not just `inferredDataType`) and the handle `name`
  (`overrideDataType`/`overrideName`), and `applyPlan` adds duplicate handles
  for subsequent connections.

**On edge removal** (`inferTypesAfterEdgeRemoval` in
`src/utils/nodeStateManagement/newOrRemovedEdgeValidation.ts` ›
`inferTypesAfterEdgeRemoval`):

- If the removed edge was the last connection to any handle of an
  `inferFromConnection` data type on a node, the inferred type is **reset** (set
  back to the original template) across all handles of that data type on the
  node

The `getResultantDataTypeOfHandleConsideringInferredType` function
(`src/utils/nodeStateManagement/constructAndModifyHandles.ts` ›
`getResultantDataTypeOfHandleConsideringInferredType`) is used throughout
validation to get the "effective" data type of a handle:

- If the handle's data type is NOT `inferFromConnection`, returns the main
  `dataType`
- If it IS `inferFromConnection` and has an `inferredDataType`, returns the
  inferred type
- If it IS `inferFromConnection` and has NO inferred type, returns `undefined`
  (or the original `inferFromConnection` type if
  `fallbackToInferFromConnectionTypeWhenNotInferred` is true)

### In the Runner

During graph execution, the `ValueStore` class
(`src/utils/nodeRunner/valueStore.ts` › `ValueStore`) resolves input and output
handle values using data type IDs.

**Input resolution** (`resolveInputs`, `src/utils/nodeRunner/valueStore.ts` ›
`resolveInputs`):

- For each input handle, reads `dataTypeId` from the handle's
  `inferredDataType.dataTypeUniqueId` (preferred) or `dataType.dataTypeUniqueId`
  (fallback), defaulting to `''`
- This `dataTypeId` is stored in `InputHandleValue.dataTypeId` and passed to the
  `FunctionImplementation`. Each `InputConnectionValue` also carries the source
  output's resolved id as `sourceDataTypeId`.

**Output info** (`buildOutputInfo`, `src/utils/nodeRunner/valueStore.ts` ›
`buildOutputInfo`):

- For each output handle, reads `dataTypeId` the same way
- Stored in `OutputHandleInfo.dataTypeId`

The runner types (`src/utils/nodeRunner/types.ts` › `InputHandleValue`) carry
`dataTypeId` through multiple recording types:

- `InputHandleValue.dataTypeId` -- the data type ID of each input during
  execution
- `OutputHandleInfo.dataTypeId` -- the data type ID of each output during
  execution
- `InputConnectionValue.sourceDataTypeId` -- the source output's data type ID
- `RecordedInputHandleValue.dataTypeId` -- persisted in execution recordings
- `RecordedOutputHandleValue.dataTypeId` -- persisted in execution recordings

## Limitations and Deprecated Patterns

1. **Complex type comparison uses reference equality**: Complex type
   compatibility (`src/utils/nodeStateManagement/newOrRemovedEdgeValidation.ts`
   › `checkComplexTypeCompatibilityAfterEdgeAddition`) considers two complex
   types the same if their `dataTypeUniqueId` matches OR their `complexSchema`
   object **references** are identical (`===`). This relies on data types being
   immutable singletons registered once in `state.dataTypes`. Two
   structurally-identical but separately-constructed Zod schemas are treated as
   **different** types.

2. **No runtime validation during execution**: The runner does not validate
   values against `complexSchema` at runtime. Data type information flows
   through as metadata (`dataTypeId`), but no Zod `.parse()` calls are made
   during execution. Validation is purely a connection-time concern.

3. **`allowInput` on DataType vs TypeOfInput**: Both `DataType` and
   `TypeOfInput` have `allowInput` and `maxConnections` fields. The
   `TypeOfInput` values take precedence when constructing node instances, but
   this precedence logic (`?? DataType`) is in `constructInputOrOutputOfType`,
   not in the type system itself.

4. **Infer types require at least one concrete connection**: Two
   `inferFromConnection` handles cannot connect unless at least one has already
   been inferred. This means the first connection to an infer handle must always
   come from a concrete type.

5. **`complexSchema` is not serializable**: Zod schemas are class instances and
   cannot be JSON-serialized. The import/export system strips `complexSchema` on
   export and rehydrates it on import from user-provided data types.

6. **Legacy edge-add helper still exported**: `addEdgeWithTypeChecking` remains
   exported for backward compatibility and is exercised only by tests; the live
   editor uses the pure `validateAddEdge` -> `applyPlan` path. Treat
   `addEdgeWithTypeChecking` as legacy.

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

### Defining a String Type with a Select Dropdown

```typescript
import { makeDataTypeWithAutoInfer } from 'react-blender-nodes';

// allowedStrings turns the unconnected input into a <select> dropdown
const operatorType = makeDataTypeWithAutoInfer({
  name: 'Operator',
  underlyingType: 'string',
  color: '#4A90E2',
  allowInput: true,
  allowedStrings: ['+', '-', '*', '/'],
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
`ContextAwareHandle` React component. The handle shape supports 13 variants
defined in `ContextAwareHandleShapes.ts`: circle, square, rectangle, list, grid,
diamond, trapezium, hexagon, star, cross, zigzag, sparkle, and parallelogram.

### -> [Type Inference](typeInferenceDoc.md)

Data types with `underlyingType: 'inferFromConnection'` are the trigger for the
type inference system. When such a handle is connected to a handle with a
concrete type, `inferTypeAcrossTheNodeForHandleOfDataType`
(`src/utils/nodeStateManagement/edges/typeInference.ts` ›
`inferTypeAcrossTheNodeForHandleOfDataType`) sets the `inferredDataType` field
on **all** handles on the same node that share the same `dataTypeUniqueId`. This
is how a Group Input node's single infer handle can adopt the type of whatever
it's connected to, and all its sibling handles update simultaneously. Under the
Plan/Apply pipeline, this is first run as a non-mutating dry run
(`mutate=false`) to build the inference plan, then applied to the Immer draft.

### -> [Connection Validation](../features/connectionValidationDoc.md)

Data types are central to the data-type-aware validation checks during edge
addition (`validateAddEdge`):

1. **Type inference validation**: Checks
   `underlyingType === 'inferFromConnection'` on both handles to determine if
   inference is needed; rejects with `TYPE_INFERENCE_FAILED` if it cannot
   resolve.
2. **Complex type checking**: Compares `underlyingType === 'complex'` and then
   checks `complexSchema` reference equality; rejects with
   `COMPLEX_TYPE_MISMATCH`.
3. **Type conversion checking**: Looks up `dataTypeUniqueId` of source and
   target in the `allowedConversionsBetweenDataTypes` map; rejects with
   `CONVERSION_NOT_ALLOWED`.

The validation order matters: inference runs first (to resolve infer types and
build a projected state), then complex checking, then conversion checking. The
latter two checks read the _resultant_ data type (considering inference) via
`getResultantDataTypeOfHandleConsideringInferredType` against the projected
post-inference nodes.

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
the `State` type (`src/utils/nodeStateManagement/types.ts` › `State`). The state
also contains several flags that control how data types are validated:

- `enableTypeInference` -- enables/disables the `inferFromConnection` resolution
  system
- `enableComplexTypeChecking` -- enables/disables complex-type compatibility
  checking
- `allowedConversionsBetweenDataTypes` -- the conversion allowlist between data
  type IDs
- `allowConversionBetweenComplexTypesUnlessDisallowedByComplexTypeChecking` --
  special flag for complex-to-complex conversion

The `makeStateWithAutoInfer` helper (`src/utils/nodeStateManagement/types.ts` ›
`makeStateWithAutoInfer`) ensures all four generic parameters
(`DataTypeUniqueId`, `NodeTypeUniqueId`, `UnderlyingType`, `ComplexSchemaType`)
are inferred consistently across `dataTypes`, `typeOfNodes`, `nodes`, and
`edges`.

### -> [Runner](../runner/runnerHookDoc.md)

During execution, data type IDs flow through the runner as metadata but do not
affect execution logic directly. The `ValueStore.resolveInputs` method reads
`dataTypeUniqueId` from each handle's `inferredDataType` (preferred) or
`dataType` (fallback) to populate `InputHandleValue.dataTypeId`. Similarly,
`buildOutputInfo` populates `OutputHandleInfo.dataTypeId`. These IDs are
available to `FunctionImplementation` callbacks for type-aware processing and
are persisted in execution records for replay/inspection. The runner does not
perform Zod validation -- it trusts that connection-time validation has already
ensured type safety.

### -> [Edges](edgesDoc.md)

Edges connect source output handles to target input handles. Edge validation
(`validateAddEdge`) reads the data types of both handles to determine whether
the connection is allowed. The `ConfigurableEdgeState` type stores the edge
metadata but does not directly reference data types -- the data type information
lives on the handles at each end of the edge. When an edge is removed
(`removeEdgeWithTypeChecking`), the system checks if the removed edge was the
last connection to an `inferFromConnection` handle, and if so, resets the
inferred type.

### -> [Import/Export](../importExport/importExportDoc.md)

The import/export system handles the non-serializable nature of Zod schemas in
`DataType.complexSchema`:

**Export** (`src/utils/importExport/stateExport.ts` › `exportGraphState`, via
`src/utils/importExport/stateSerializer.ts` › `StateSerializer`): Strips
`complexSchema` from every entry in `state.dataTypes` and from every handle's
`dataType.dataTypeObject` (and `inferredDataType.dataTypeObject`) on all nodes.
This produces a JSON-serializable snapshot. UI-only fields such as `zones`,
`zoneIndex`, `activeDrawer`, and `history` are also stripped.

**Import** (`src/utils/importExport/stateImport.ts` › `importGraphState`):
Requires the caller to provide the original `dataTypes` record (with live Zod
schemas). The import process:

1. Validates the imported data has a `dataTypes` field
2. Rehydrates `complexSchema` on each `state.dataTypes` entry from the
   user-provided `dataTypes`
3. Rehydrates `dataType.dataTypeObject` on every handle of every node from the
   same `dataTypes` lookup

This design means exported state is portable as JSON, but importing requires the
original data type definitions to restore full type validation capability.
