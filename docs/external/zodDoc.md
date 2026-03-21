# Zod

## Overview

Zod is a TypeScript-first schema declaration and validation library. In
react-blender-nodes, Zod provides the schema validation layer for **complex data
types** — data types whose structure goes beyond primitive `string`, `number`,
or `boolean` values. When a `DataType` has `underlyingType: 'complex'`, it must
provide a `complexSchema: z.ZodType` that describes the shape of the data
flowing through connections of that type.

Zod is the **only** external runtime validation dependency in the type system.
It is imported across ~30 files in the codebase, but its role is narrowly
scoped: define schemas on complex DataTypes and optionally check compatibility
when edges are added.

## How This Project Uses Zod

### DataType.complexSchema

The `DataType` generic in `src/utils/nodeStateManagement/types.ts` is a
conditional type that branches on `UnderlyingType`:

```
                          DataType<UnderlyingType, ComplexSchemaType>
                                          |
                      +-------------------+-------------------+
                      |                                       |
              UnderlyingType = 'complex'            UnderlyingType != 'complex'
                      |                                       |
          complexSchema: ComplexSchemaType           complexSchema?: undefined
          (required, extends z.ZodType)              (forbidden)
```

When `underlyingType` is `'complex'`, the `complexSchema` field is **required**
and must be a `z.ZodType`. For all other underlying types, `complexSchema` is
`undefined` and cannot be set.

Example usage:

```ts
import { z } from 'zod';
import { makeDataTypeWithAutoInfer } from './types';

// Complex type — schema required
const vectorType = makeDataTypeWithAutoInfer({
  name: 'Vector3',
  underlyingType: 'complex',
  complexSchema: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  color: '#E2A04A',
});

// Primitive type — no schema
const stringType = makeDataTypeWithAutoInfer({
  name: 'String',
  underlyingType: 'string',
  color: '#4A90E2',
});
```

### Complex Type Checking

Complex type checking is **opt-in** via the `enableComplexTypeChecking` flag on
`State`. When enabled, the function
`checkComplexTypeCompatibilityAfterEdgeAddition` in
`src/utils/nodeStateManagement/newOrRemovedEdgeValidation.ts` runs during edge
creation and enforces:

1. **Complex-to-non-complex** connections are rejected
2. **Complex-to-complex** connections are only allowed if the types match

Type matching uses two strategies:

```
  Are source and target both complex?
           |
     +-----+-----+
     |     No     |
     |            v
     |    REJECT: "Can't connect complex
     |     types with non-complex types"
     v
    Yes
     |
     +-- Same DataTypeUniqueId? --> ALLOW
     |
     +-- JSON.stringify(source.complexSchema)
         === JSON.stringify(target.complexSchema)? --> ALLOW
     |
     +-- Otherwise --> REJECT: "Can't connect
         complex types with different types"
```

Schema comparison uses `JSON.stringify` for structural equality. This means two
independently created Zod schemas with identical structure will be considered
compatible.

### Generic Type Parameter (ComplexSchemaType extends z.ZodType)

The `ComplexSchemaType` generic parameter threads through nearly every type in
the system:

```
  State<DataTypeUniqueId, NodeTypeUniqueId, UnderlyingType, ComplexSchemaType>
    |
    +-- dataTypes: Record<DataTypeUniqueId, DataType<UnderlyingType, ComplexSchemaType>>
    |
    +-- typeOfNodes: Record<NodeTypeUniqueId, TypeOfNode<..., ComplexSchemaType>>
    |     |
    |     +-- subtree (optional, recursive State reference)
    |
    +-- nodes, edges, etc.
```

The constraint is:

```ts
ComplexSchemaType extends UnderlyingType extends 'complex' ? z.ZodType : never
```

This ensures that `ComplexSchemaType` is only a valid Zod type when
`UnderlyingType` includes `'complex'`. When no complex types exist,
`ComplexSchemaType` defaults to `never`, and the schema field is effectively
absent from the type system.

Files that carry this generic parameter include:

- `types.ts` — `DataType`, `TypeOfNode`, `State`, and all `makeXxxWithAutoInfer`
  helpers
- `newOrRemovedEdgeValidation.ts` — all validation functions
- `nodes/constructAndModifyNodes.ts` — node creation
- `handles/types.ts`, `handleGetters.ts`, `handleSetters.ts`,
  `handleIterators.ts` — handle manipulation
- `edges/typeInference.ts` — type inference across connections
- `nodes/nodeGroups.ts`, `nodes/loops.ts` — group and loop node handling
- `nodeRunner/` — compiler, executor, and related types
- `importExport/` — export, import, and serialization types

### Type Conversion Between Complex Types

Beyond schema compatibility, the system has a separate conversion-allowance
layer controlled by `allowedConversionsBetweenDataTypes` on `State`. By default,
conversion between different complex types is **not allowed** even if complex
type checking passes. The flag
`allowConversionBetweenComplexTypesUnlessDisallowedByComplexTypeChecking` can
override this:

```
  Are source and target the same DataTypeUniqueId?
           |
     +-----+-----+
     | Yes        | No
     v            v
   ALLOW    Is conversion explicitly allowed
            in allowedConversionsBetweenDataTypes?
                 |
           +-----+-----+
           | Yes        | No
           v            v
         ALLOW    Are both complex AND is
                  allowConversionBetweenComplexTypes...
                  ...UnlessDisallowedByComplexTypeChecking = true?
                       |
                 +-----+-----+
                 | Yes        | No
                 v            v
               ALLOW       REJECT
```

## Anti-Patterns and Limitations

### Zod Schemas Are Not Serializable

Zod schema instances (`z.ZodType`) are class instances with methods, prototypes,
and internal state. They **cannot** be serialized to JSON. The import/export
system handles this by:

- **Export**: `stripComplexSchema()` removes the `complexSchema` field from
  every `DataType` and from every handle's `dataType.dataTypeObject` before JSON
  serialization
- **Import**: `rehydrateHandleDataType()` restores `complexSchema` by looking up
  the `dataTypeUniqueId` in the user-provided `dataTypes` map and copying the
  schema back

This means exported JSON files do **not** carry schema definitions. The
importing application must provide the same `dataTypes` map used at export time.
If the schemas differ, complex type checking may produce unexpected results
after import.

### Complex Type Checking Is Opt-In

By default, `enableComplexTypeChecking` is `undefined` (disabled). When
disabled, **all** complex-to-complex connections are allowed regardless of
schema compatibility. This is a deliberate design choice to avoid breaking
existing graphs that don't need schema validation.

### Schema Comparison Uses JSON.stringify

The `checkComplexTypeCompatibilityAfterEdgeAddition` function compares schemas
via:

```ts
JSON.stringify(source.complexSchema) === JSON.stringify(target.complexSchema);
```

This has implications:

- Property order matters (though Zod schemas typically produce consistent
  output)
- Semantically equivalent schemas defined differently may not match
- Referential identity is checked first (same `DataTypeUniqueId`), so this
  comparison only runs for different data type IDs with complex underlying types

### structuredClone Limitation

During export, `deepClone()` first attempts `structuredClone`, which **cannot**
clone Zod schema instances (they contain methods). The function falls back to a
`JSON.stringify`/`JSON.parse` round-trip that strips non-serializable values.
This is why `complexSchema` is explicitly stripped before cloning — to avoid
silent data loss.

## Relationships with Project Features

### -> [Data Types (complexSchema)](../core/dataTypesDoc.md)

Zod is the mechanism that gives complex data types their validation capability.
Without a `complexSchema`, a complex type is just a label. The schema enables
the system to verify that data flowing through connections of that type conforms
to a specific structure.

```
  DataType
    |
    +-- underlyingType: 'string' | 'number' | 'boolean'   (no Zod involvement)
    |
    +-- underlyingType: 'complex'
    |     |
    |     +-- complexSchema: z.ZodType   <--- Zod schema required
    |
    +-- underlyingType: 'noEquivalent'                     (no Zod involvement)
    |
    +-- underlyingType: 'inferFromConnection'               (no Zod involvement)
```

### -> [Connection Validation (complex type checking)](../features/connectionValidationDoc.md)

When `enableComplexTypeChecking` is `true`, the edge validation pipeline
includes a Zod-schema-aware step:

```
  Edge Addition Pipeline
    |
    1. Basic handle existence checks
    |
    2. inferTypesAfterEdgeAddition()        (type inference, may involve inferred types)
    |
    3. checkComplexTypeCompatibilityAfterEdgeAddition()   <--- Zod schemas compared here
    |
    4. checkTypeConversionCompatibilityAfterEdgeAddition()  (conversion allowlist)
    |
    5. Cycle checking (if enabled)
    |
    6. Edge committed to state
```

### -> [Import/Export (schemas stripped/restored)](../importExport/importExportDoc.md)

The import/export cycle handles Zod's non-serializability transparently:

```
  Export                                    Import
  ------                                    ------
  State (with complexSchema)                JSON string
       |                                         |
       v                                         v
  stripComplexSchema()                      JSON.parse()
  stripHandleNonSerializable()                   |
       |                                         v
       v                                    validateGraphStateStructure()
  JSON.stringify()                               |
       |                                         v
       v                                    Rehydrate complexSchema from
  JSON string                               user-provided dataTypes
  (no Zod schemas)                               |
                                                 v
                                            State (with complexSchema restored)
```

Key functions in `src/utils/importExport/serialization.ts`:

- `stripComplexSchema()` — removes `complexSchema` from a DataType object
- `stripHandleNonSerializable()` — removes `complexSchema` from handle
  `dataType.dataTypeObject` and `inferredDataType.dataTypeObject`, plus
  `onChange` callbacks
- `rehydrateHandleDataType()` — restores `dataTypeObject` (including
  `complexSchema`) from the provided dataTypes map during import

### -> [Node Runner (generic threading)](../runner/runnerHookDoc.md)

The node runner system (`src/utils/nodeRunner/`) carries the `ComplexSchemaType`
generic through its compiler, executor, and type definitions. While the runner
does not directly validate values against Zod schemas at execution time, the
type parameter ensures that the State passed to the runner maintains full type
safety with respect to complex schemas. The runner's types (`compiler.ts`,
`executor.ts`, `groupCompiler.ts`, `loopCompiler.ts`, `types.ts`) all propagate
`ComplexSchemaType extends z.ZodType` to maintain this invariant.
