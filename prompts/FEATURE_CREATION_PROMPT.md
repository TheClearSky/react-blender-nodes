# Feature Creation Prompt for react-blender-nodes

This is a self-contained prompt for creating new features in
react-blender-nodes. It includes full product knowledge and all coding patterns
so you can write code that matches the existing codebase without consulting
other files.

---

# PART 1: PRODUCT KNOWLEDGE

## What This Library Is

react-blender-nodes is a React component library that provides a **node-based
graph editor** inspired by Blender's node editor. Published as
`@theclearsky/react-blender-nodes` on npm. Consumers embed a `<FullGraph>`
component and get:

- An interactive canvas where users place nodes, draw connections, and build
  data-flow graphs
- A type-safe system that validates connections between nodes
- Optional execution: the graph can be compiled and run, with each node calling
  a user-provided function
- Dark theme UI matching Blender's aesthetic

Library consumers define:

1. **Data types** (what kinds of data flow through the graph)
2. **Node types** (what operations exist)
3. **Function implementations** (what each node does when executed)

## Core Concepts

### Data Types

A **data type** defines a kind of data that can flow through the graph. Every
handle references a data type. Each data type has: `name`, `underlyingType`,
`color`, optional `shape`, `allowInput`, `maxConnections`.

**6 Supported Underlying Types:**

| Type                  | Meaning                                                                      |
| --------------------- | ---------------------------------------------------------------------------- |
| `string`              | Text data. Shows text input when `allowInput` is true                        |
| `number`              | Numeric data. Shows slider input when `allowInput` is true                   |
| `boolean`             | True/false. Shows checkbox when `allowInput` is true                         |
| `complex`             | Structured data validated by a Zod schema                                    |
| `inferFromConnection` | Polymorphic -- actual type inferred from whatever is connected               |
| `noEquivalent`        | Structural-only connection (e.g., "Bind Loop Nodes"). Cannot carry user data |

Data types are defined once in initial state and are immutable.

**Real example** (from `FullGraph.stories.tsx`):

```typescript
const exampleDataTypes = {
  rawData: makeDataTypeWithAutoInfer({
    name: 'Raw Data',
    underlyingType: 'string',
    color: '#00BFFF',
    shape: handleShapesMap.square,
  }),
  // ... more data types
};
```

### Handles

A **handle** is a connection port on a node. Inputs on left, outputs on right.
Each has: `name`, `dataType` (references a data type ID), optional `allowInput`,
`maxConnections`.

Handles can be **grouped into panels** -- collapsible sections of inputs with
their own label. Panels are purely visual.

**13 Handle shapes:** `circle` (default), `square`, `rectangle`, `diamond`,
`hexagon`, `star`, `cross`, `list`, `grid`, `trapezium`, `zigzag`, `sparkle`,
`parallelogram`

**Panel example** (handles grouped into collapsible sections, from
`FullGraph.stories.tsx`):

```typescript
advancedProcessor: makeTypeOfNodeWithAutoInfer<keyof typeof exampleDataTypes>({
  name: 'Advanced Processor',
  inputs: [
    { name: 'Primary Input', dataType: 'primaryInput' },
    {
      name: 'Advanced Settings',        // Panel label
      inputs: [                          // Nested inputs = panel
        { name: 'Threshold Value', dataType: 'thresholdValue' },
        { name: 'Configuration String', dataType: 'configurationString' },
      ],
    },
    {
      name: 'Debug Options',
      inputs: [
        { name: 'Debug Mode', dataType: 'debugMode' },
      ],
    },
  ],
}),
```

### Nodes

Two levels: **TypeOfNode** (blueprint defining name, header color, inputs,
outputs, context menu placement) and **Node instance** (placed on canvas with
own ID, handle IDs, input values).

**5 Built-in node types:** `groupInput`, `groupOutput` (group boundaries),
`loopStart`, `loopStop`, `loopEnd` (loop triplet).

TypeOfNode properties: `headerColor`, `locationInContextMenu` (path array),
`priorityInContextMenu` (number), `subtree` (if present, it's a node group).

**Real example** (from `FullGraph.stories.tsx`):

```typescript
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
  ],
}),
```

### Edges

Directed connections from output handle to input handle. When created, pass
through **7-layer validation**:

1. Duplicate check
2. Cycle detection (`enableCycleChecking`)
3. Loop boundary validation
4. Type inference resolution (`enableTypeInference`)
5. Complex type checking (`enableComplexTypeChecking`)
6. Type conversion checking (`allowedConversionsBetweenDataTypes`)
7. Max connections check

Rendered as bezier curves with gradient between source/target handle colors.

**Validation pipeline example** (from `constructAndModifyHandles.ts`):

```typescript
// Layer 1: Loop boundary validation
const loopPathValidation = isLoopConnectionValid(state, sourceNode, targetNode, ...);
if (!loopPathValidation.validation.isValid) return loopPathValidation;

// Layer 2: Type inference
if (state.enableTypeInference) {
  const { validation: validationTemp } = inferTypesAfterEdgeAddition(...);
  validation = validationTemp;
}

// Layer 3: Complex type checking
if (state.enableComplexTypeChecking && validation.isValid) {
  const { validation: validationTemp } = checkComplexTypeCompatibilityAfterEdgeAddition(...);
  validation = validationTemp;
}

// Layer 4: Type conversion compatibility
if (state.allowedConversionsBetweenDataTypes && validation.isValid) {
  const { validation: validationTemp } = checkTypeConversionCompatibilityAfterEdgeAddition(...);
  validation = validationTemp;
}
```

### State

Single state object containing:

| Field                                | What It Holds                                            |
| ------------------------------------ | -------------------------------------------------------- |
| `dataTypes`                          | Registry of all data type definitions                    |
| `typeOfNodes`                        | Registry of all node type definitions (including groups) |
| `nodes`                              | Array of node instances on current canvas                |
| `edges`                              | Array of edges on current canvas                         |
| `viewport`                           | Current pan/zoom position                                |
| `openedNodeGroupStack`               | Navigation stack when editing inside node groups         |
| `allowedConversionsBetweenDataTypes` | Type conversion rules (optional)                         |
| `enableTypeInference`                | Polymorphic type resolution                              |
| `enableComplexTypeChecking`          | Zod schema compatibility checking                        |
| `enableCycleChecking`                | Cycle prevention                                         |
| `enableRecursionChecking`            | Recursive group nesting prevention                       |
| `enableDebugMode`                    | Debug overlays                                           |

**11 reducer actions:** `ADD_NODE`, `ADD_NODE_AND_SELECT`, `REMOVE_NODE`,
`UPDATE_NODE`, `UPDATE_NODE_BY_REACT_FLOW`, `ADD_EDGE_BY_REACT_FLOW`,
`UPDATE_EDGES_BY_REACT_FLOW`, `SET_VIEWPORT`, `OPEN_NODE_GROUP`,
`CLOSE_NODE_GROUP`, `REPLACE_STATE`

All mutations go through the reducer. Reducer uses Immer for immutable updates.

**State initialization example** (from `types.ts`):

```typescript
const state = makeStateWithAutoInfer({
  dataTypes: {
    stringType: makeDataTypeWithAutoInfer({
      name: 'String',
      underlyingType: 'string',
      color: '#4A90E2',
    }),
  },
  typeOfNodes: {
    inputNode: makeTypeOfNodeWithAutoInfer({
      name: 'Input',
      inputs: [],
      outputs: [],
    }),
  },
  nodes: [],
  edges: [],
});
```

**Dispatch example** (from `FullGraph.tsx`):

```typescript
dispatch({
  type: actionTypesMap.REPLACE_STATE,
  payload: { state: importedState },
});

dispatch({
  type: actionTypesMap.UPDATE_NODE_BY_REACT_FLOW,
  payload: { changes },
});
```

## Type System

**Type Inference:** `inferFromConnection` handles resolve their type when an
edge connects. Cascades through the graph. Resets when edge removed.

**Type Conversion:** `allowedConversionsBetweenDataTypes` restricts which types
can connect. If not provided, all allowed. If provided (even empty), only
explicit entries permitted.

**Complex Type Checking:** When enabled, Zod schemas compared for structural
compatibility.
`allowConversionBetweenComplexTypesUnlessDisallowedByComplexTypeChecking`
controls interaction with conversion rules.

**Cycle Checking:** DFS from target to source through existing edges. Loops are
exceptions via triplet system.

## Node Groups

Reusable sub-graphs. TypeOfNode with `subtree` property. Subtree has own
`nodes`, `edges`, plus boundary nodes (`groupInput`, `groupOutput`).
`openedNodeGroupStack` tracks navigation depth. `numberOfReferences` tracks
instances.

Rules: boundary nodes can't be deleted/duplicated, recursion prevented if
`enableRecursionChecking` is true.

**Group navigation example** (from `mainReducer.ts`):

```typescript
// Opening a node group instance — pushes onto the stack
newState.openedNodeGroupStack = [
  ...(newState.openedNodeGroupStack || []),
  {
    nodeType: nodeType,
    nodeId: openNodeId,
    previousViewport: newState.viewport,
  },
];

// Opening original node group definition — replaces history
newState.openedNodeGroupStack = [
  {
    nodeType: nodeType,
    previousViewport:
      newState.openedNodeGroupStack?.[0]?.previousViewport || newState.viewport,
  },
];
```

## Loops

Triplet system: `loopStart` -> `loopStop` -> `loopEnd` bound by `bindLoopNodes`
structural edges (`noEquivalent` type, `maxConnections: 1`).

```
                   Loop Body
                 +-----------+
   data in       |           |       data out
---->[loopStart]---> ... --->[loopStop]--->[loopEnd]--->
       |                        ^  |
       | Bind Loop Nodes        |  | condition
       +------------------------+  | (continue?)
```

Data flows through `inferFromConnection` handles. loopStop has a boolean
"Continue If Condition Is True" input. Loop body can contain nested loops and
group instances.

**Loop triplet definitions** (from `standardNodes.ts`):

```typescript
loopStart: makeTypeOfNodeWithAutoInfer<...>({
  name: 'Loop Start',
  inputs: [
    { name: '', dataType: standardDataTypeNamesMap.loopInfer },
  ],
  outputs: [
    { name: 'Bind Loop Nodes', dataType: standardDataTypeNamesMap.bindLoopNodes },
    { name: '', dataType: standardDataTypeNamesMap.loopInfer },
  ],
}),
loopStop: makeTypeOfNodeWithAutoInfer<...>({
  name: 'Loop Stop',
  inputs: [
    { name: 'Bind Loop Nodes', dataType: standardDataTypeNamesMap.bindLoopNodes },
    { name: 'Continue If Condition Is True', dataType: standardDataTypeNamesMap.condition },
    { name: '', dataType: standardDataTypeNamesMap.loopInfer },
  ],
}),
loopEnd: makeTypeOfNodeWithAutoInfer<...>({
  name: 'Loop End',
  inputs: [
    { name: 'Bind Loop Nodes', dataType: standardDataTypeNamesMap.bindLoopNodes },
    { name: '', dataType: standardDataTypeNamesMap.loopInfer },
  ],
}),
```

## Execution (Runner)

Optional. Consumer provides `FunctionImplementations` map. Each function
receives
`(inputs: Map<handleName, InputHandleValue>, outputs: Map<handleName, OutputHandleInfo>, context: ExecutionContext)`
and returns `Map<handleName, value>`.

**Compilation** (5 phases): graph analysis -> node classification -> loop/group
compilation -> topological sort -> execution plan emission. Produces
`ExecutionPlan` with concurrency levels.

**Execution modes:** Instant (all at once) and Step-by-step (pause after each
step).

**Runner state machine:** `idle` -> `compiling` -> `running` <-> `paused` ->
`completed` (or `errored`).

**Execution recording:** Every step recorded with timing, input/output
snapshots, errors, loop/group context. Enables timeline visualization, step
inspection, scrubbing, and export.

**Visual feedback per node:** `idle`, `running` (blue dashed + glow),
`completed` (green solid), `errored` (red + tooltip), `skipped` (dimmed),
`warning` (orange).

**FunctionImplementation example** (from `FullGraph.stories.tsx`):

```typescript
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
  });
```

## Import / Export

State export/import: complete graph serialization to JSON with validation and
repair strategies. Recording export/import: execution recording serialization to
JSON for replay.

**Export/Import signatures** (from `stateExport.ts` and `stateImport.ts`):

```typescript
// Export: serialize state to JSON string
function exportGraphState<DataTypeUniqueId, NodeTypeUniqueId, UnderlyingType, ComplexSchemaType>(
  state: State<DataTypeUniqueId, NodeTypeUniqueId, UnderlyingType, ComplexSchemaType>,
  options?: ExportOptions,
): string

// Import: parse JSON with validation, returns result object
function importGraphState<DataTypeUniqueId, NodeTypeUniqueId, UnderlyingType, ComplexSchemaType>(
  json: string,
  options: StateImportOptions<DataTypeUniqueId, NodeTypeUniqueId, UnderlyingType, ComplexSchemaType>,
): ImportResult<State<...>>
```

## UI Surface

**Graph Canvas (FullGraph):** ReactFlow-based. Pan, zoom, minimap, context menu,
edge drawing, multi-select, delete keys, group navigation.

**Context Menu:** Right-click for "Add Node" submenus (organized by
`locationInContextMenu`), groups, import/export.

**Node Runner Panel:** Slide-out drawer with Run Controls
(play/pause/step/stop/reset, mode toggle), Execution Timeline (multi-track,
zoom/pan, scrubber), Execution Step Inspector (input/output values, errors).

## System Invariants

- Graph is always a DAG (no directed cycles)
- Each input handle has at most one incoming edge
- Output handles can feed any number of targets
- Loop triplets must be fully connected
- Data crosses group boundaries only through groupInput/groupOutput
- Groups cannot be recursive
- All edges satisfy type compatibility
- All mutations go through dispatch (never direct state mutation)
- All state updates produce new objects (Immer)

## Consumer API

```tsx
import { FullGraph, useFullGraph, makeStateWithAutoInfer, makeDataTypeWithAutoInfer, makeTypeOfNodeWithAutoInfer } from 'react-blender-nodes';
import 'react-blender-nodes/style.css';

const dataTypes = { myType: makeDataTypeWithAutoInfer({ name: '...', underlyingType: '...', color: '...' }) };
const typeOfNodes = { myNode: makeTypeOfNodeWithAutoInfer({ name: '...', inputs: [...], outputs: [...] }) };
const initialState = makeStateWithAutoInfer({ dataTypes, typeOfNodes, nodes: [], edges: [] });
const { state, dispatch } = useFullGraph(initialState);
<FullGraph state={state} dispatch={dispatch} />

// Optional execution:
const functionImplementations = makeFunctionImplementationsWithAutoInfer({
  myNode: (inputs, outputs, context) => new Map([['outputName', computedValue]]),
});
<FullGraph state={state} dispatch={dispatch} functionImplementations={functionImplementations} />
```

**Auto-infer helpers** (identity functions for type inference):
`makeDataTypeWithAutoInfer`, `makeTypeOfNodeWithAutoInfer`,
`makeStateWithAutoInfer`, `makeAllowedConversionsBetweenDataTypesWithAutoInfer`,
`makeFunctionImplementationsWithAutoInfer`.

---

# PART 2: CODING GUIDELINES

Every pattern used in this repo. Follow these exactly when writing new code.

## TypeScript Generics System

### The Four-Parameter Generic Signature

The entire codebase threads a recurring 4-parameter generic signature:

```typescript
<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex' ? z.ZodType : never = never,
>
```

Appears on: `State<D,N,U,C>`, `DataType<U,C>`, `TypeOfNode<D,N,U,C>`,
`Action<D,N,U,C>`, `mainReducer<D,N,U,C>`, `useFullGraph<D,N,U,C>`,
`FullGraph<D,N,U,C>`, `compile<D,N,U,C>`, `execute<D,N,U,C>`.

Rules:

- All 4 parameters always have defaults so consumers can omit them
- `ComplexSchemaType` uses conditional default: `z.ZodType` when
  `UnderlyingType extends 'complex'`, otherwise `never`
- When only a subset is needed, use fewer params (e.g.,
  `FunctionImplementations<NodeTypeUniqueId>`)

### Conditional Type on Generic Parameters

```typescript
type DataType<UnderlyingType, ComplexSchemaType> =
  UnderlyingType extends 'complex'
    ? { underlyingType: UnderlyingType; complexSchema: ComplexSchemaType; ... }
    : { underlyingType: UnderlyingType; complexSchema?: undefined; ... };
```

### Identity-Function Auto-Infer Pattern

Factory functions that exist solely for type inference -- accept a value and
return it unchanged:

```typescript
function makeDataTypeWithAutoInfer<U extends SupportedUnderlyingTypes, C extends ...>(
  input: DataType<U, C>
) {
  return input;  // identity -- type inference is the only purpose
}
```

## Type Patterns

### `as const` Arrays -> Union Types (NOT enums)

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

**Real example** (from `nodeStateManagement/types.ts`):

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

### `as const` Maps (runtime lookup + type safety)

```typescript
const actionTypesMap = {
  [actionTypes[0]]: actionTypes[0],
  [actionTypes[1]]: actionTypes[1],
  ...
} as const;
```

### Discriminated Unions

- Action types use `type` as discriminant
- Execution steps use `kind` as discriminant
- Node inputs use `type` with different `value`/`onChange` shapes
- Context menu items use `kind` (`'leaf'` | `'folder'`)
- `'inputs' in item` structural check for panels vs flat inputs

**Real example** — reducer switching on action type (from `mainReducer.ts`):

```typescript
switch (action.type) {
  case actionTypesMap.ADD_NODE:
    const nodeType = action.payload.type;
    const nodeId = generateRandomString(lengthOfIds);
    const node: (typeof newState.nodes)[number] = constructNodeOfType(
      newState.dataTypes,
      nodeType,
      newState.typeOfNodes,
      nodeId,
      action.payload.position,
    );
    newState = setCurrentNodesAndEdgesToStateWithMutatingState(newState, [
      ...getCurrentNodesAndEdgesFromState(newState).nodes,
      node,
    ]);
    break;
  case actionTypesMap.REPLACE_STATE:
    return action.payload.state; // return replaces entire Immer draft
}
```

### Key Utility Types Used

`Partial<Record<K,V>>`, `Record<K,V>`, `ReadonlyMap<K,V>`, `ReadonlyArray<T>`,
`NonNullable<T>`, `ReturnType<T>`, `React.ComponentProps<'span'>`,
`VariantProps<typeof cva>`, `Exclude<T,U>`, `Omit<T,K> & {...}`

Custom:
`type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>;`

### Type Guards

```typescript
function isSupportedUnderlyingType(
  type: string,
): type is SupportedUnderlyingTypes {
  return Boolean(supportedUnderlyingTypesMap[type as SupportedUnderlyingTypes]);
}
```

Also `in` operator narrowing: `if ('nodeId' in action.payload) { ... }`

### `as const` on Individual Values

```typescript
type: 'number' as const,
type: 'configurableEdge' as const,
```

### `typeof` for Type Extraction

```typescript
const node: (typeof newState.nodes)[number] = constructNodeOfType(...);
```

## Function Patterns

### Function Declarations (Not Arrow Functions)

All module-level functions use `function` keyword. Arrow functions only for
inline callbacks, event handlers, and `useCallback` bodies.

```typescript
// YES
function mainReducer<D, N, U, C>(oldState: State, action: Action) { ... }
// NO
const mainReducer = <D, N, U, C>(oldState: State, action: Action) => { ... }
```

### Pure Functions

Compiler and utility functions are pure -- no side effects, no mutations.

### Parameter Objects Pattern

Complex functions use a single options/params object:

```typescript
function useNodeRunner({ state, functionImplementations, options }: UseNodeRunnerParams) { ... }
```

### Factory Functions with Structured Return

Return typed objects, not tuples:

```typescript
function createGraphError(params: { error: unknown; nodeId: string; ... }): GraphError {
  return { message: extractErrorMessage(params.error), ... };
}
```

## React Component Patterns

### Component Declaration

All components are `function` declarations with named exports at the bottom. No
default exports. No `React.FC`. No arrow function components.

```typescript
function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
export { Badge, badgeVariants };
```

### forwardRef

```typescript
const ConfigurableNode = forwardRef<HTMLDivElement, ConfigurableNodeProps>(
  ({ name, headerColor, inputs, outputs, ...props }, ref) => {
    return <div ref={ref} {...props}>...</div>;
  }
);
ConfigurableNode.displayName = 'ConfigurableNode';
```

All `forwardRef` components set `displayName`.

### Props Patterns

- Complex/reusable props: separate named type
  (`type FullGraphProps<D,N,U,C> = { ... }`)
- One-off internal components: inline types with indexed access
  (`FullGraphProps<...>['state']`)

### Conditional Rendering

- Ternary for choosing between two subtrees
- `&&` for show/hide
- Early return for mount guard (`if (!mounted) return null`)

### Render Variable Pattern

Complex JSX subtrees extracted into local variable, not a sub-component:

```typescript
const graphContent = (<> <ReactFlow .../> <FullGraphContextMenu .../> </>);
return <div>{functionImplementations ? <RunnerOverlay>{graphContent}</RunnerOverlay> : graphContent}</div>;
```

### Component Composition (Slot / asChild)

```typescript
function Badge({ asChild = false, ...props }) {
  const Comp = asChild ? Slot.Root : 'span';
  return <Comp data-slot="badge" {...props} />;
}
```

### Compound Components (Radix UI Wrappers)

```typescript
const Select = SelectPrimitive.Root;
const SelectTrigger = forwardRef<...>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger ref={ref} className={cn('...', className)} {...props}>{children}</SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;
```

### useImperativeHandle

```typescript
useImperativeHandle(ref, () => listRef.current as HTMLDivElement);
```

### Ref Callback for Multiple Refs

```typescript
ref={(refInner) => {
  setInputRef(refInner);
  if (typeof ref === 'function') ref(refInner);
  else if (ref) ref.current = refInner;
}}
```

## Hook Patterns

### Custom Hook Structure

1. Named `use<Name>` with `function` declaration
2. Accept options object (or a few named params)
3. Return a typed object (not a tuple)
4. Export:
   `export { useHookName }; export type { UseNameOptions, UseNameReturn };`

**Real example** (from `useResizeHandle.ts`):

```typescript
type UseResizeHandleOptions = {
  initialSize: number;
  minSize: number;
  maxSize: number;
  direction?: 'up' | 'down' | 'left' | 'right';
};

type UseResizeHandleReturn = {
  size: number;
  onMouseDown: (e: React.MouseEvent) => void;
};

function useResizeHandle({
  initialSize,
  minSize,
  maxSize,
  direction = 'up',
}: UseResizeHandleOptions): UseResizeHandleReturn {
  const [size, setSize] = useState(initialSize);
  const isResizingRef = useRef(false);
  const startPosRef = useRef(0);
  const startSizeRef = useRef(0);

  const isVertical = direction === 'up' || direction === 'down';
  const sign = direction === 'up' || direction === 'left' ? -1 : 1;

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isResizingRef.current = true;
      startPosRef.current = isVertical ? e.clientY : e.clientX;
      startSizeRef.current = size;

      const handleMove = (moveEvent: MouseEvent) => {
        if (!isResizingRef.current) return;
        const currentPos = isVertical ? moveEvent.clientY : moveEvent.clientX;
        const delta = (currentPos - startPosRef.current) * sign;
        setSize(
          Math.max(minSize, Math.min(maxSize, startSizeRef.current + delta)),
        );
      };

      const handleUp = () => {
        isResizingRef.current = false;
        document.removeEventListener('mousemove', handleMove);
        document.removeEventListener('mouseup', handleUp);
      };

      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleUp);
    },
    [size, minSize, maxSize, isVertical, sign],
  );

  return { size, onMouseDown };
}
```

### useCallback for Event Handlers

All event handlers passed as props wrapped in `useCallback`.

**Real example** (from `useAutoScroll.ts`):

```typescript
const startAutoScroll = useCallback(
  (direction: 'start' | 'end') => {
    if (disabled) return;
    if (scrollingDirectionRef.current === direction) return;
    scrollingDirectionRef.current = direction;
    if (scrollRafRef.current !== null)
      cancelAnimationFrame(scrollRafRef.current);
    scrollRafRef.current = requestAnimationFrame(tickScroll);
  },
  [disabled, tickScroll],
);
```

### useMemo for Derived Data

Any computation deriving data from state wrapped in `useMemo`.

**Real example** (from `Input.tsx`):

```typescript
const sanitizedValue = useMemo(() => {
  if (
    discriminatedProps.allowOnlyNumbers &&
    discriminatedProps.value !== undefined
  ) {
    return sanitizeNumberToShowAsText(
      discriminatedProps.value,
      discriminatedProps.numberOfDecimals ?? 5,
    );
  }
  return discriminatedProps.value?.toString();
}, [
  discriminatedProps.value,
  discriminatedProps.allowOnlyNumbers,
  discriminatedProps.numberOfDecimals,
]);
```

### useEffect Patterns

- **Sync ref to value:** populate ref in effect, clean up on unmount
- **One-shot trigger:** conditional effect (e.g., fitView on mount)
- **Animation lifecycle:** Web Animations API with mount/unmount control

### useLayoutEffect

For synchronous DOM mutations before paint (e.g., restoring scroll position).

### Browser Observers

- `IntersectionObserver` for off-viewport edge optimization
- `ResizeObserver` for scroll state updates on container resize
- `MutationObserver` for scroll state updates on child changes
- All with cleanup in effect return

### requestAnimationFrame

Continuous animations use rAF loops with `useRef<number | null>` and
`cancelAnimationFrame` cleanup.

### Stable Empty References

Module-level constants to avoid re-renders (from `useNodeRunner.ts`):

```typescript
const EMPTY_VISUAL_STATES: ReadonlyMap<string, NodeVisualState> = new Map();
const EMPTY_WARNINGS: ReadonlyMap<string, ReadonlyArray<string>> = new Map();
const EMPTY_ERRORS: ReadonlyMap<string, ReadonlyArray<GraphError>> = new Map();
```

### AbortController for Cancellation

**Real example** (from `useNodeRunner.ts`):

```typescript
const abortControllerRef = useRef<AbortController | null>(null);

// In run function:
abortControllerRef.current?.abort();
abortControllerRef.current = new AbortController();
const signal = abortControllerRef.current.signal;

// Cleanup on unmount:
useEffect(() => {
  isMountedRef.current = true;
  return () => {
    isMountedRef.current = false;
    abortControllerRef.current?.abort();
    generatorRef.current = null;
    shouldContinueRef.current = false;
  };
}, []);
```

### AsyncGenerator for Step-by-Step Execution

```typescript
async function* executeStepByStep(...): AsyncGenerator<ExecutionStep> {
  for (const node of compiledGraph.executionOrder) {
    if (signal?.aborted) return;
    yield await executeNode(node, valueStore);
  }
}
// Consumer: for await (const step of executeStepByStep(...)) { ... }
```

### Mutable Ref + Snapshot Pattern

Mutate a ref for live state, snapshot into new collection to trigger render:

```typescript
liveVisualStatesRef.current.set(nodeId, newState); // no re-render
setVisualStates(new Map(liveVisualStatesRef.current)); // triggers render
```

### performance.now() for Timing

All execution timing uses `performance.now()`.

## State Management Patterns

### Immer `produce()` in Reducer

**Real example** (from `mainReducer.ts`):

```typescript
const newState = produce(
  oldState,
  (newState: State<DataTypeUniqueId, NodeTypeUniqueId, UnderlyingType, ComplexSchemaType>) => {
    switch (action.type) {
      case actionTypesMap.ADD_NODE:
        // Mutate draft directly — Immer handles immutability
        const node = constructNodeOfType(newState.dataTypes, ...);
        newState = setCurrentNodesAndEdgesToStateWithMutatingState(newState, [
          ...getCurrentNodesAndEdgesFromState(newState).nodes, node,
        ]);
        break;
      case actionTypesMap.REPLACE_STATE:
        return action.payload.state;  // return replaces entire draft
    }
  },
);
```

### Action Typing

Always `actionTypesMap.ADD_NODE`, never raw strings.

### State Navigation

`getCurrentNodesAndEdgesFromState(state)` navigates `openedNodeGroupStack` to
return current visible nodes/edges.

### useReducer for Complex State

```typescript
function useFullGraph<D, N, U, C>(initialState: State<D, N, U, C>) {
  const [state, dispatch] = useReducer(mainReducer<D, N, U, C>, initialState);
  return { state, dispatch };
}
```

## Ref Patterns

- **DOM refs:** `useRef<HTMLInputElement>(null)`
- **Mutable values (non-rendering):** `useRef(false)`,
  `useRef<Animation | null>(null)`
- **Ref as callback channel (parent <-> child):** `RefObject<(() => T) | null>`
  -- child populates via useEffect, parent reads `ref.current?.()`
- **SVG refs:** `useRef<SVGSVGElement>(null)` for floating-ui arrows

## Context Patterns

### createContext with null! Assertion

```typescript
const FullGraphContext = createContext<{ allProps: FullGraphProps; nodeRunnerStates?: ReadonlyMap<...> }>(null!);
```

Always document with comment:
`// null! because provider is always above consumers`

### Generic Variance Bridge

```typescript
function createContextValue(
  props: { state: unknown; dispatch: unknown },
  nodeRunnerStates?: ReadonlyMap<string, NodeRunnerState>,
): React.ContextType<typeof FullGraphContext> {
  const allProps = props as unknown as FullGraphProps;
  return { allProps, nodeRunnerStates };
}
```

Double cast (`unknown` -> `as unknown as`) with safety justification comment.

## Styling Patterns

### cn() Helper (clsx + tailwind-merge)

```typescript
import { cn } from '@/utils/cnHelper';
<div className={cn('base-class px-4', isActive && 'ring-2', className)} />
```

**Real example** (from `ScrollableButtonContainer.tsx`):

```typescript
<div className={cn('relative w-full h-full', className)}>
  {showStart && (
    <Button
      className={cn(
        'h-[44px] border-secondary-dark-gray bg-primary-black absolute z-10',
        orientation === 'horizontal'
          ? 'left-0 top-1/2 -translate-y-1/2'
          : 'top-0 left-1/2 -translate-x-1/2',
      )}
    />
  )}
```

### cva() for Multi-Variant Components

Only for components with multiple visual variants (Button, Badge).

**Real example** (from `Badge.tsx`):

```typescript
const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 [&>svg]:pointer-events-none [&>svg]:size-3',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground [a&]:hover:bg-primary/90',
        secondary:
          'bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90',
        destructive:
          'bg-destructive text-white focus-visible:ring-destructive/20 dark:bg-destructive/60 [a&]:hover:bg-destructive/90',
        outline: 'border-border text-foreground [a&]:hover:bg-accent',
        ghost: '[a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 [a&]:hover:underline',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);
// Usage: cn(badgeVariants({ variant }), className)
```

### data-slot / data-variant Attributes

```typescript
<Comp data-slot="badge" data-variant={variant} ... />
```

### Inline Styles for Dynamic Values Only

Tailwind for all static styles. `style` only for runtime-computed values
(positions, gradients, dynamic colors from props).

### Custom Color Tokens

```
bg-primary-black, bg-primary-dark-gray, bg-secondary-dark-gray, bg-primary-gray
text-primary-white, text-secondary-light-gray
border-secondary-dark-gray
status-completed (#4caf50), status-errored (#ff4444), status-warning (#ffa500), status-skipped (#555555)
```

Dark hierarchy:
`#1d1d1d -> #282828 -> #303030 -> #444444 -> #545454 -> #656565 -> #797979 -> #e6e6e6`

**Dark mode only.** Never use `bg-white`, `text-black`.

## Module & Export Patterns

### Named Exports Only

```typescript
export { Badge, badgeVariants };
export type { ConfigurableNodeInput, ConfigurableNodeOutput };
```

### Separate Value and Type Exports

```typescript
export { mainReducer, actionTypesMap };
export type { Action };
```

### Barrel Files (index.ts)

Each directory re-exports its contents.

**Real example** (from `atoms/index.ts`):

```typescript
export * from './Badge';
export * from './Button';
export * from './Collapsible';
export * from './ConfigurableEdge';
export * from './Input';
export * from './NodeResizerWithMoreControls';
export * from './NodeStatusIndicator';
export * from './ScrollableButtonContainer';
export * from './Separator';
```

### Path Aliases

`@/` maps to `src/`. Relative imports for same-directory siblings.

### `type` Import Specifier

```typescript
import type { z } from 'zod';
import { type State, type SupportedUnderlyingTypes } from './types';
```

Inline `type` preferred when mixing value and type imports.

## Error Handling Patterns

### Structured GraphError Objects

**Real example** (from `errors.ts`):

```typescript
function createGraphError(params: {
  error: unknown;
  nodeId: string;
  nodeTypeId: string;
  nodeTypeName: string;
  handleId?: string;
  path: ReadonlyArray<GraphErrorPathEntry>;
  loopContext?: GraphError['loopContext'];
  groupContext?: GraphError['groupContext'];
  timestamp: number;
  duration: number;
}): GraphError {
  return {
    message: extractErrorMessage(params.error),
    nodeId: params.nodeId,
    nodeTypeId: params.nodeTypeId,
    nodeTypeName: params.nodeTypeName,
    handleId: params.handleId,
    path: params.path,
    loopContext: params.loopContext,
    groupContext: params.groupContext,
    timestamp: params.timestamp,
    duration: params.duration,
    originalError: params.error,
  };
}
```

### extractErrorMessage for Unknown Catches

```typescript
function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}
```

### Validation Result Objects (Not Exceptions)

```typescript
type ImportResult<T> =
  | { success: true; data: T; warnings: ValidationIssue[] }
  | { success: false; errors: ValidationIssue[]; warnings: ValidationIssue[] };
```

## Data Structure Patterns

- **Map/ReadonlyMap** for runtime data
- **Record** for static definitions and exhaustive configuration maps
- **Qualified ID strings:** `nodeId:handleId` composite keys
- **Flatten utility** for nested panel inputs: `if ('inputs' in item)` check
- **ValueStore class** (only class in codebase): scoped key-value store for
  execution
- **Recursive execution** for loop bodies: `processSteps` yields itself for
  nested loops
- **MinimalNodeData/MinimalInput** structural types: avoid generic variance
  issues in runner code

**ValueStore example** (from `valueStore.ts`):

```typescript
class ValueStore {
  private readonly store: Map<string, unknown>;
  private readonly prefix: string;
  private readonly parent: ValueStore | null;

  constructor(prefix: string = '', parent: ValueStore | null = null) {
    this.store = new Map();
    this.prefix = prefix;
    this.parent = parent;
  }

  set(nodeId: string, handleId: string, value: unknown): void {
    this.store.set(this.prefix + qualifiedId(nodeId, handleId), value);
  }

  get(nodeId: string, handleId: string): unknown | undefined {
    const key = this.prefix + qualifiedId(nodeId, handleId);
    if (this.store.has(key)) return this.store.get(key);
    if (this.parent) return this.parent.get(nodeId, handleId);
    return undefined;
  }
}
```

**MinimalNodeData** (from `valueStore.ts`):

```typescript
type MinimalNodeData = {
  inputs?: ReadonlyArray<MinimalInput | MinimalInputPanel>;
  outputs?: ReadonlyArray<MinimalOutput>;
  nodeTypeUniqueId?: string;
};
```

**Record with union key for exhaustive maps** (from `ExecutionTimeline.tsx`):

```typescript
const statusBlockClass: Record<ExecutionStepRecordStatus, string> = {
  completed: 'bg-status-completed',
  errored: 'bg-status-errored',
  skipped: 'bg-status-skipped',
};
```

(from `RunControls.tsx`):

```typescript
const STATUS_CONFIG: Record<
  RunnerState,
  { color: string; pulse: boolean; label: string }
> = {
  idle: { color: 'bg-secondary-dark-gray', pulse: false, label: 'Idle' },
  compiling: { color: 'bg-primary-blue', pulse: true, label: 'Compiling' },
  running: { color: 'bg-status-completed', pulse: true, label: 'Running' },
  paused: { color: 'bg-status-warning', pulse: false, label: 'Paused' },
  completed: { color: 'bg-status-completed', pulse: false, label: 'Completed' },
  errored: { color: 'bg-status-errored', pulse: false, label: 'Error' },
};
```

## Naming Conventions

### Files

| Type       | Convention                  | Example                   |
| ---------- | --------------------------- | ------------------------- |
| Component  | PascalCase directory + file | `Badge/Badge.tsx`         |
| Story      | PascalCase + `.stories.tsx` | `Badge/Badge.stories.tsx` |
| Barrel     | `index.ts`                  | `atoms/index.ts`          |
| Hook       | camelCase `use` prefix      | `useSlideAnimation.ts`    |
| Utility    | camelCase                   | `cnHelper.ts`             |
| Types file | camelCase                   | `types.ts`                |
| State file | PascalCase + `State`        | `FullGraphState.ts`       |

### Types

PascalCase. `Type` prefix for definitions (`TypeOfNode`). `Props` suffix for
props. `Return`/`Options` suffix for hook types.

### Functions

| Prefix      | Meaning       | Example                            |
| ----------- | ------------- | ---------------------------------- |
| `make`      | factory       | `makeStateWithAutoInfer`           |
| `is`        | type guard    | `isSupportedUnderlyingType`        |
| `create`    | constructor   | `createGraphError`                 |
| `get`/`set` | accessor      | `getCurrentNodesAndEdgesFromState` |
| `handle`    | event handler | `handleRun`, `handleModeChange`    |
| `build`     | map builder   | `buildNodeInfoMap`                 |
| `compute`   | derivation    | `computeVisualStatesAtStep`        |
| `extract`   | parser        | `extractErrorMessage`              |
| `format`    | formatter     | `formatGraphError`                 |
| `download`  | I/O           | `downloadJson`                     |

### Constants

`UPPER_SNAKE_CASE` for module-level (`DEFAULT_MAX_LOOP_ITERATIONS`). `camelCase`
for computed values/maps (`actionTypesMap`).

### displayName

All `forwardRef` components: `Button.displayName = 'Button'`. Radix wrappers:
`SelectTrigger.displayName = SelectPrimitive.Trigger.displayName`.

### Section Comments (Runner Files)

```typescript
// ─────────────────────────────────────────────────────
// Runner State Machine
// ─────────────────────────────────────────────────────
```

## Anti-Patterns to Avoid

- **No arrow function components or top-level arrow functions** -- TypeScript
  can't parse `<T>` in `.tsx`
- **No default exports** -- all named exports
- **No `React.FC`** -- type via parameter destructuring
- **No raw string action types** -- use `actionTypesMap.X`
- **No `createContext()` without guaranteed provider** -- always `null!` with
  comment
- **No skipping auto-infer helpers** -- never create state/types as raw object
  literals
- **No full generic types in runner** -- use `MinimalNodeData` etc.
- **No inline styles for static values** -- Tailwind only
- **No TypeScript enums** -- use `as const` arrays
- **No direct state mutation** -- everything through dispatch

---

# PART 3: KEY SOURCE FILE LOCATIONS

```
src/
+-- utils/
|   +-- nodeStateManagement/
|   |   +-- types.ts                  State, DataType, TypeOfNode, auto-infer helpers
|   |   +-- mainReducer.ts           11-action reducer, Immer produce()
|   |   +-- standardNodes.ts         Standard data types & 5 built-in node types
|   |   +-- constructAndModifyHandles.ts  Edge add/remove with validation
|   |   +-- nodes/
|   |       +-- constructAndModifyNodes.ts  Node construction from TypeOfNode
|   |       +-- nodeGroups.ts         Group subtree operations
|   |       +-- loops.ts             Loop triplet operations
|   +-- nodeRunner/
|   |   +-- types.ts                  RunnerState, ExecutionStep, FunctionImplementation, GraphError
|   |   +-- compiler.ts              5-phase compilation pipeline
|   |   +-- executor.ts              Async execution engine
|   |   +-- useNodeRunner.ts         React hook state machine
|   |   +-- executionRecorder.ts     Execution recording
|   |   +-- valueStore.ts            ValueStore class, MinimalNodeData
|   |   +-- errors.ts                createGraphError, extractErrorMessage, buildErrorPath
|   |   +-- topologicalSort.ts       Topological sort for execution order
|   |   +-- loopCompiler.ts          Loop structure compilation
|   |   +-- groupCompiler.ts         Group structure compilation
|   +-- importExport/
|   |   +-- stateExport.ts / stateImport.ts
|   |   +-- recordExport.ts / recordImport.ts
|   |   +-- serialization.ts / validation.ts / types.ts
|   +-- cnHelper.ts                   cn() (clsx + tailwind-merge)
+-- components/
|   +-- organisms/
|   |   +-- FullGraph/
|   |   |   +-- FullGraph.tsx         Main graph component (3-layer architecture)
|   |   |   +-- FullGraphState.ts     Context, useFullGraph, variance bridge
|   |   |   +-- FullGraphContextMenu.tsx
|   |   |   +-- FullGraphCustomNodesAndEdges.ts  nodeTypes, edgeTypes registration
|   |   +-- ConfigurableNode/
|   |   |   +-- ConfigurableNode.tsx  Node rendering with forwardRef
|   |   |   +-- SupportingSubcomponents/
|   |   +-- NodeRunnerPanel/
|   |       +-- NodeRunnerPanel.tsx   Runner drawer
|   +-- molecules/
|   |   +-- ContextMenu/             Context menu + useSubmenuManager
|   |   +-- RunControls/             Transport bar
|   |   +-- ExecutionTimeline/        Timeline + zoom/pan + scrub hooks
|   |   +-- ExecutionStepInspector/   Step detail panel
|   +-- atoms/
|       +-- Badge/, Button/, Input/, Separator/, Collapsible/
|       +-- NodeStatusIndicator/      Visual state overlay
|       +-- ConfigurableEdge/         Edge rendering
|       +-- ScrollableButtonContainer/
+-- hooks/
|   +-- useSlideAnimation.ts, useResizeHandle.ts, useFloatingTooltip.ts
|   +-- useAutoScroll.ts, useClickedOutside.ts, useDrag.ts
+-- index.css                         Theme tokens, animations, custom utilities
+-- index.ts                          Main barrel export
```

---

# PART 4: INSTRUCTIONS FOR FEATURE CREATION

When creating a new feature:

1. **Read existing code first.** Before writing anything, read the files your
   feature will touch or extend. Understand the existing patterns in that area.

2. **Follow the generic signature.** If your feature touches State, nodes,
   edges, types, or the reducer, thread the 4-parameter generic signature
   correctly.

3. **Use auto-infer helpers.** Any new definition types should have a
   `make<Name>WithAutoInfer` identity function.

4. **Add new reducer actions to the existing pattern.** Add to the `actionTypes`
   array, `actionTypesMap`, `Action` union, and the `switch` in `mainReducer`.
   Use Immer's draft.

5. **Use the `as const` array pattern** for any new set of string literals.

6. **For new components:**
   - `function` declaration, not arrow
   - Named export at bottom
   - Props as separate type if reusable, inline if one-off
   - `cn()` for all class composition
   - Custom color tokens, never hardcoded hex in className
   - `data-slot` attribute for shadcn-style components
   - Create a `.stories.tsx` file

7. **For new hooks:**
   - `function use<Name>(options: Use<Name>Options): Use<Name>Return`
   - Export the hook and its types separately
   - `useCallback` for event handlers, `useMemo` for derived data

8. **For new runner features:**
   - Use `MinimalNodeData` / `MinimalInput` structural types
   - Structured `GraphError` objects for errors
   - `performance.now()` for timing
   - `AbortSignal` for cancellation support

9. **Update barrel files.** Add re-exports to the appropriate `index.ts`.

10. **Maintain invariants.** All graph mutations through dispatch. No cycles.
    Type compatibility on all edges. Loop/group boundaries respected.

---

# PART 5: SYSTEM ARCHITECTURE DIAGRAM

```
+===========================================================================+
|                        react-blender-nodes                                |
+===========================================================================+
|                                                                           |
|  CORE SYSTEMS (Tier 1)                                                    |
|  ~~~~~~~~~~~~~~~~~~~~~~                                                   |
|                                                                           |
|  +-------------+    referenced by    +-------------+                      |
|  |  DataTypes  |<--------------------|   Handles   |                      |
|  | string      |                     | input/output|                      |
|  | number      |    +-------------+  | ports with  |                      |
|  | boolean     |    |    Type     |  | data types  |                      |
|  | complex     |    |  Inference  |  +------+------+                      |
|  | inferFrom   |--->| resolves    |         |                             |
|  |  Connection |    | polymorphic |         | attached to                  |
|  | noEquivalent|    | handles     |         |                             |
|  +------+------+    +-------------+         v                             |
|         |                            +-------------+    +-------------+   |
|         | types flow through         |    Nodes    |--->|    Edges    |   |
|         +--------------------------->| TypeOfNode  |    | connections |   |
|                                      | instances   |    | between     |   |
|                                      +------+------+    | handles     |   |
|                                             |           +------+------+   |
|                                             |                  |          |
|                                             v                  v          |
|                                      +-----------------------------+      |
|                                      |    State Management         |      |
|                                      | mainReducer (11 actions)    |      |
|                                      | Immer produce() immutable   |      |
|                                      +-----------------------------+      |
|                                                                           |
+---------------------------------------------------------------------------+
|                                                                           |
|  FEATURE SYSTEMS (Tier 2)                                                 |
|  ~~~~~~~~~~~~~~~~~~~~~~~~~                                                |
|                                                                           |
|  +-------------------+  +-------------------+  +---------------------+    |
|  |   Node Groups     |  |      Loops        |  | Connection          |    |
|  | subtree-based     |  | loopStart/Stop/End|  | Validation          |    |
|  | composable groups |  | triplet system    |  | cycle check         |    |
|  | groupInput/Output |  | iteration data    |  | type conversion     |    |
|  | boundary nodes    |  | flow, bindLoop    |  | complex type check  |    |
|  | stack navigation  |  | structural edges  |  | loop/group rules    |    |
|  +-------------------+  +-------------------+  +---------------------+    |
|                                                                           |
+---------------------------------------------------------------------------+
|                                                                           |
|  RUNNER SYSTEMS (Tier 3)                                                  |
|  ~~~~~~~~~~~~~~~~~~~~~~~~~                                                |
|                                                                           |
|  +------------------+     +------------------+     +------------------+   |
|  | Runner Compiler  |---->| Runner Executor  |---->| Execution        |   |
|  | 5-phase pipeline |     | async engine     |     | Recording        |   |
|  | State -> Plan    |     | ValueStore       |     | step records     |   |
|  |                  |     | concurrent exec  |     | value snapshots  |   |
|  +------------------+     +--------+---------+     +------------------+   |
|                                    |                                      |
|                                    v                                      |
|                           +------------------+                            |
|                           | useNodeRunner    |                            |
|                           | state machine    |                            |
|                           | run/pause/step   |                            |
|                           | replay/replayTo  |                            |
|                           +------------------+                            |
|                                                                           |
+---------------------------------------------------------------------------+
|                                                                           |
|  UI LAYER (Tier 4)                                                        |
|  ~~~~~~~~~~~~~~~~~~                                                       |
|                                                                           |
|  +================================================================+      |
|  |                     FullGraph Component                         |      |
|  |  +---------------------------+  +---------------------------+  |      |
|  |  |   ConfigurableNode        |  |   ConfigurableEdge        |  |      |
|  |  | +-----+ +-----+ +------+ |  | gradient bezier curves    |  |      |
|  |  | |Hndls| |Inpts| |Status| |  | viewport optimization     |  |      |
|  |  | +-----+ +-----+ +------+ |  +---------------------------+  |      |
|  |  +---------------------------+                                 |      |
|  |  +---------------------------+  +---------------------------+  |      |
|  |  |     Context Menu          |  |  NodeGroupSelector       |  |      |
|  |  | nested submenus           |  |  breadcrumb navigation   |  |      |
|  |  | node creation             |  +---------------------------+  |      |
|  |  | import/export actions     |                                 |      |
|  |  +---------------------------+                                 |      |
|  +================================================================+      |
|                                                                           |
|  +================================================================+      |
|  |                   NodeRunnerPanel                               |      |
|  |  +--------------+  +----------------+  +--------------------+  |      |
|  |  | RunControls  |  | Execution      |  | ExecutionStep      |  |      |
|  |  | play/pause   |  | Timeline       |  | Inspector          |  |      |
|  |  | step/stop    |  | zoom/pan       |  | input/output vals  |  |      |
|  |  | mode toggle  |  | scrubber       |  | error display      |  |      |
|  |  +--------------+  +----------------+  +--------------------+  |      |
|  +================================================================+      |
|                                                                           |
+---------------------------------------------------------------------------+
|                                                                           |
|  UI ATOMS & HOOKS (Tier 5)           IMPORT/EXPORT (Tier 6)              |
|  ~~~~~~~~~~~~~~~~~~~~~~~~~~          ~~~~~~~~~~~~~~~~~~~~~                |
|                                                                           |
|  NodeStatusIndicator                 State export/import                  |
|  Input, Button, Checkbox             Recording export/import              |
|  Badge, Separator, Collapsible       Validation & repair                  |
|  ScrollableButtonContainer           JSON serialization                   |
|  useDrag, useClickedOutside                                               |
|  useSlideAnimation, useResizeHandle                                       |
|  useFloatingTooltip, useAutoScroll                                        |
|                                                                           |
+---------------------------------------------------------------------------+
|                                                                           |
|  EXTERNAL SYSTEMS (Tier 7)                                                |
|  ~~~~~~~~~~~~~~~~~~~~~~~~~~                                               |
|                                                                           |
|  ReactFlow    Immer     Zod       Tailwind    Radix UI    Storybook       |
|  (@xyflow/    produce() schema    CSS dark    checkbox    component       |
|   react)      immut.    valid.    theme       primitive   dev/test        |
|                                                                           |
+---------------------------------------------------------------------------+
```

## Data Flow Diagram

```
User defines         User connects         User clicks "Run"
DataTypes &          handles via                  |
TypeOfNodes          edges                        v
     |                  |              +--------------------+
     v                  v              | Runner Compiler    |
+---------+     +------------+         | (5 phases)         |
| State   |---->| Connection |         +--------+-----------+
| Mgmt    |     | Validation |                  |
| Reducer |     | Pipeline   |         ExecutionPlan
+---------+     +------------+                  |
     |                                          v
     v                              +--------------------+
+---------+                         | Runner Executor    |
| FullGraph|                        | (async, ValueStore)|
| renders  |                        +--------+-----------+
| nodes &  |                                 |
| edges    |                        ExecutionRecord
+---------+                                  |
     |                                       v
     |                              +--------------------+
     +------ visual state --------->| NodeStatusIndicator|
              feedback              | NodeRunnerPanel    |
                                    +--------------------+
```

## Cross-Feature Dependency Map

```
DataTypes ----> Handles ----> Type Inference
    |               |
    v               v
  Nodes -------> Edges -------> Connection Validation
    |               |
    |    +----------+----------+
    v    v                     v
Node Groups              Loops
    |                      |
    +----------+-----------+
               |
               v
        State Management
               |
       +-------+-------+
       |               |
       v               v
Runner Compiler    FullGraph
       |               |
       v               +----> ConfigurableNode
Runner Executor   |           ConfigurableEdge
       |               |      Context Menu
       v               |
Execution Recording    +----> NodeRunnerPanel
       |                        |
       v                  +-----+-----+
useNodeRunner             |     |     |
       |              RunCtrl  Timeline Inspector
       v
NodeStatusIndicator
```

---

# PART 6: DOCUMENTATION REFERENCE

For deep dives into specific areas, consult these docs.

## Reference Documents

| Document            | Path                                    | Purpose                                                  |
| ------------------- | --------------------------------------- | -------------------------------------------------------- |
| Product Knowledge   | `docs/productKnowledge.md`              | What the product is, domain concepts, system invariants  |
| Coding Guidelines   | `docs/codingGuidelines.md`              | Every coding pattern with examples and source references |
| Documentation Index | `docs/index.md`                         | Architecture diagram, doc map, "what to read" guide      |
| Feature List        | `prompts/FEATURE_LIST_AND_HIERARCHY.md` | Master list of 32 features across 7 tiers                |

## Feature Docs by Area

### Core

| Doc                               | Covers                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------- |
| `docs/core/dataTypesDoc.md`       | Type system foundation: string, number, boolean, complex, inferFromConnection, noEquivalent |
| `docs/core/handlesDoc.md`         | Input/output ports, HandleIndices addressing, panels, dynamic handle addition               |
| `docs/core/nodesDoc.md`           | TypeOfNode definitions, Node instances, 5 standard node types                               |
| `docs/core/edgesDoc.md`           | Connection management, type-checked add/remove, DFS cycle detection                         |
| `docs/core/stateManagementDoc.md` | mainReducer, 11 action types, Immer-based immutable updates                                 |
| `docs/core/typeInferenceDoc.md`   | inferFromConnection resolution, cascading inference on edge changes                         |

### Features

| Doc                                        | Covers                                                                  |
| ------------------------------------------ | ----------------------------------------------------------------------- |
| `docs/features/nodeGroupsDoc.md`           | Subtree-based composable groups, boundary nodes, handle synchronization |
| `docs/features/loopsDoc.md`                | Loop triplet (loopStart/Stop/End), bindLoopNodes, iteration data flow   |
| `docs/features/connectionValidationDoc.md` | Cycle check, type conversion, complex type check, loop/group rules      |

### Runner

| Doc                                    | Covers                                                         |
| -------------------------------------- | -------------------------------------------------------------- |
| `docs/runner/runnerCompilerDoc.md`     | 5-phase pipeline: State -> ExecutionPlan                       |
| `docs/runner/runnerExecutorDoc.md`     | Async execution engine, ValueStore, concurrent level execution |
| `docs/runner/runnerHookDoc.md`         | useNodeRunner state machine, run/pause/step/stop/reset/replay  |
| `docs/runner/executionRecordingDoc.md` | ExecutionRecord, step records, value snapshots, replay support |

### UI Components

| Doc                                    | Covers                                                                |
| -------------------------------------- | --------------------------------------------------------------------- |
| `docs/ui/fullGraphDoc.md`              | Top-level graph editor, ReactFlow integration, 3-layer architecture   |
| `docs/ui/configurableNodeDoc.md`       | Node rendering: header, handles, inputs, panels, resizing             |
| `docs/ui/configurableEdgeDoc.md`       | Edge rendering: gradient colors, bezier curves, viewport optimization |
| `docs/ui/contextMenuDoc.md`            | Right-click menu: nested submenus, node creation, import/export       |
| `docs/ui/nodeRunnerPanelDoc.md`        | Runner UI drawer: RunControls + Timeline + Inspector                  |
| `docs/ui/runControlsDoc.md`            | Transport bar: play/pause/step/stop/reset, mode toggle                |
| `docs/ui/executionTimelineDoc.md`      | Multi-track timeline: zoom/pan, step blocks, scrubber                 |
| `docs/ui/executionStepInspectorDoc.md` | Step detail panel: input/output values, error display                 |

### Atoms, Hooks & Utilities

| Doc                                 | Covers                                                               |
| ----------------------------------- | -------------------------------------------------------------------- |
| `docs/ui/nodeStatusIndicatorDoc.md` | Visual state overlay: running/completed/errored/warning borders      |
| `docs/ui/inputComponentsDoc.md`     | Text input, number slider, checkbox, button atoms                    |
| `docs/ui/uiPrimitivesDoc.md`        | Badge, Separator, Collapsible, ScrollableButtonContainer             |
| `docs/hooks/hooksDoc.md`            | useDrag, useClickedOutside, useSlideAnimation, useResizeHandle, etc. |

### Import/Export

| Doc                                    | Covers                                                         |
| -------------------------------------- | -------------------------------------------------------------- |
| `docs/importExport/importExportDoc.md` | State & recording serialization, validation, repair strategies |

### External Systems

| Doc                             | Covers                                                       |
| ------------------------------- | ------------------------------------------------------------ |
| `docs/external/reactFlowDoc.md` | Core graph rendering engine: nodes, edges, viewport, minimap |
| `docs/external/immerDoc.md`     | Immutable state management via produce() in mainReducer      |
| `docs/external/zodDoc.md`       | Schema validation for complex data types                     |
| `docs/external/tailwindDoc.md`  | Utility CSS, custom dark theme, cn() helper, color tokens    |
| `docs/external/radixUIDoc.md`   | UI primitives: checkbox component                            |
| `docs/external/storybookDoc.md` | Component development, stories, visual testing               |

## What to Read Based on What You're Building

| If you're building... | Read these docs                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| New data type         | dataTypesDoc, handlesDoc, typeInferenceDoc, connectionValidationDoc                                |
| New node type         | nodesDoc, handlesDoc, configurableNodeDoc, stateManagementDoc, contextMenuDoc                      |
| Runner integration    | runnerCompilerDoc, runnerExecutorDoc, runnerHookDoc, executionRecordingDoc, nodeStatusIndicatorDoc |
| Node group            | nodeGroupsDoc, nodesDoc, typeInferenceDoc, stateManagementDoc, fullGraphDoc                        |
| Loop                  | loopsDoc, nodesDoc, connectionValidationDoc, runnerCompilerDoc                                     |
| Graph editor UI       | fullGraphDoc, configurableNodeDoc, configurableEdgeDoc, contextMenuDoc, reactFlowDoc               |
| Runner panel UI       | nodeRunnerPanelDoc, runControlsDoc, executionTimelineDoc, executionStepInspectorDoc, runnerHookDoc |
| New input component   | inputComponentsDoc, configurableNodeDoc, dataTypesDoc, tailwindDoc                                 |
| Import/export         | importExportDoc, stateManagementDoc, executionRecordingDoc, fullGraphDoc                           |
| New UI atom           | uiPrimitivesDoc, hooksDoc, tailwindDoc, storybookDoc, radixUIDoc                                   |
| State/reducer changes | stateManagementDoc, immerDoc, edgesDoc, typeInferenceDoc                                           |
