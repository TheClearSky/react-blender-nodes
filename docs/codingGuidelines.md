# Coding Guidelines & Patterns

Every coding pattern used in this repository, documented with file references
and examples.

---

## Table of Contents

1. [TypeScript Generics System](#typescript-generics-system)
2. [Type Patterns](#type-patterns)
3. [Function Patterns](#function-patterns)
4. [React Component Patterns](#react-component-patterns)
5. [Hook Patterns](#hook-patterns)
6. [State Management Patterns](#state-management-patterns)
7. [Ref Patterns](#ref-patterns)
8. [Context Patterns](#context-patterns)
9. [Styling Patterns](#styling-patterns)
10. [Module & Export Patterns](#module--export-patterns)
11. [Error Handling Patterns](#error-handling-patterns)
12. [Data Structure Patterns](#data-structure-patterns)
13. [Naming Conventions](#naming-conventions)
14. [Anti-Patterns to Avoid](#anti-patterns-to-avoid)

---

## TypeScript Generics System

### The Four-Parameter Generic Signature

The entire codebase is threaded with a recurring 4-parameter generic signature
that flows from state definition down to UI components. This is the project's
most distinctive pattern.

```
<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>
```

**Where it appears (every one of these uses the exact same 4-parameter
signature):**

| Layer             | Examples                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------- |
| Type definitions  | `State<D,N,U,C>`, `DataType<U,C>`, `TypeOfNode<D,N,U,C>`, `Action<D,N,U,C>`               |
| Factory functions | `makeStateWithAutoInfer`, `makeDataTypeWithAutoInfer`, `makeTypeOfNodeWithAutoInfer`      |
| Reducer           | `mainReducer<D,N,U,C>`                                                                    |
| Hook              | `useFullGraph<D,N,U,C>`, `useNodeRunner` (via `UseNodeRunnerParams<D,N,U,C>`)             |
| Components        | `FullGraph<D,N,U,C>`, `RunnerOverlay<D,N,U,C>`, `FullGraphWithReactFlowProvider<D,N,U,C>` |
| Compiler/Executor | `compile<D,N,U,C>`, `execute<D,N,U,C>`, `buildNodeInfoMap<D,N,U,C>`                       |

**Source:** `src/utils/nodeStateManagement/types.ts` › `State`,
`src/utils/nodeStateManagement/mainReducer.ts` › `mainReducer`,
`src/components/organisms/FullGraph/FullGraph.tsx` › `FullGraph`

**Key rules:**

- All 4 parameters always have defaults (`= string`,
  `= SupportedUnderlyingTypes`, `= never`), so consumers can omit them entirely
- `ComplexSchemaType` uses a conditional default: it is `z.ZodType` when
  `UnderlyingType extends 'complex'`, otherwise `never`
- When a function doesn't need all 4, it may use a subset (e.g.
  `FunctionImplementations<NodeTypeUniqueId>` uses only 1)

### Conditional Type on Generic Parameters

The `DataType` type itself is a conditional type that varies its shape based on
`UnderlyingType`:

```typescript
type DataType<UnderlyingType, ComplexSchemaType> =
  UnderlyingType extends 'complex'
    ? { underlyingType: UnderlyingType; complexSchema: ComplexSchemaType; ... }
    : { underlyingType: UnderlyingType; complexSchema?: undefined; ... };
```

This ensures `complexSchema` is required for `'complex'` types and forbidden for
others at compile time.

**Source:** `src/utils/nodeStateManagement/types.ts` › `DataType`

### Identity-Function Auto-Infer Pattern

Factory functions that exist solely for type inference. They accept a value and
return it unchanged, but their generic signature forces TypeScript to narrow the
type:

```typescript
function makeDataTypeWithAutoInfer<
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(input: DataType<UnderlyingType, ComplexSchemaType>) {
  return input; // identity — type inference is the only purpose
}
```

This pattern appears for every major definition:

- `makeDataTypeWithAutoInfer` — `src/utils/nodeStateManagement/types.ts` ›
  `makeDataTypeWithAutoInfer`
- `makeTypeOfNodeWithAutoInfer` — `src/utils/nodeStateManagement/types.ts` ›
  `makeTypeOfNodeWithAutoInfer`
- `makeStateWithAutoInfer` — `src/utils/nodeStateManagement/types.ts` ›
  `makeStateWithAutoInfer`
- `makeAllowedConversionsBetweenDataTypesWithAutoInfer` —
  `src/utils/nodeStateManagement/types.ts` ›
  `makeAllowedConversionsBetweenDataTypesWithAutoInfer`

### Generic Components (function declarations, not arrow)

All generic React components use the `function` keyword (not arrow functions)
because TypeScript can't parse `<T>` in `.tsx` arrow functions:

```typescript
function FullGraph<
  DataTypeUniqueId extends string = string,
  ...
>({ state, dispatch }: FullGraphProps<DataTypeUniqueId, ...>) {
  return (
    <ReactFlowProvider>
      ...
    </ReactFlowProvider>
  );
}
```

**This applies to:** `FullGraph`, `FullGraphWithReactFlowProvider`,
`RunnerOverlay`, `useFullGraph`, `mainReducer`, and all compiler/executor
functions.

---

## Type Patterns

### `as const` Arrays → Union Types

String literal unions are derived from `as const` arrays, keeping runtime values
and types in sync:

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
// = 'string' | 'number' | 'boolean' | 'complex' | 'noEquivalent' | 'inferFromConnection'
```

**Used for:** `supportedUnderlyingTypes`
(`src/utils/nodeStateManagement/types.ts` › `supportedUnderlyingTypes`),
`actionTypes` (`src/utils/nodeStateManagement/mainReducer.ts` › `actionTypes`),
`runnerStates` (`src/utils/nodeRunner/types.ts` › `runnerStates`),
`nodeVisualStates` (`src/utils/nodeRunner/types.ts` › `nodeVisualStates`)

### `as const` Maps (runtime lookup + type safety)

Alongside the array, a map object is created for O(1) runtime lookup while
preserving literal types:

```typescript
const actionTypesMap = {
  [actionTypes[0]]: actionTypes[0],
  [actionTypes[1]]: actionTypes[1],
  ...
} as const;
```

Switch cases then use `actionTypesMap.ADD_NODE` instead of raw strings. This
ensures actions are always valid and enables IDE autocomplete.

**Source:** `src/utils/nodeStateManagement/mainReducer.ts` › `actionTypesMap`,
`src/utils/nodeStateManagement/standardNodes.ts` › `standardNodeTypeNamesMap`

### Discriminated Unions

Action types use `type` as the discriminant:

```typescript
type Action<D, N, U, C> =
  | { type: typeof actionTypesMap.ADD_NODE; payload: { type: N; position: XYPosition } }
  | { type: typeof actionTypesMap.UPDATE_INPUT_VALUE; payload: { nodeId: string; inputId: string; value: string | number } }
  | { type: typeof actionTypesMap.CLOSE_NODE_GROUP }  // no payload
  | ...;
```

Node input types use `type` as the discriminant with different
`value`/`onChange` shapes:

```typescript
type ConfigurableNodeInput = {
  id: string; name: string; ...
} & (
  | { type: 'string'; value?: string; onChange?: (value: string) => void }
  | { type: 'number'; value?: number; onChange?: (value: number) => void }
  | { type: 'boolean'; value?: boolean; onChange?: (value: boolean) => void }
  | { type: 'unsupportedDirectly'; value?: unknown; onChange?: (value: unknown) => void }
);
```

Execution steps use `kind` as discriminant:

```typescript
type ExecutionStep =
  | StandardExecutionStep // { kind: 'standard'; nodeId: string; ... }
  | LoopExecutionBlock // { kind: 'loop'; loopStartNodeId: string; preStopSteps: ReadonlyArray<ExecutionStep>; postStopSteps: ...; ... }
  | SwitchExecutionBlock // { kind: 'switch'; switchStartNodeId: string; trueBranchSteps: ...; falseBranchSteps: ...; ... }
  | GroupExecutionScope; // { kind: 'group'; groupNodeId: string; innerPlan: ExecutionPlan; ... }
```

Context menu items also use `kind`:

```typescript
type MenuTreeNode = MenuTreeLeaf | MenuTreeFolder;
// MenuTreeLeaf:   { kind: 'leaf'; item: ContextMenuItem; priority: number; insertionIndex: number }
// MenuTreeFolder: { kind: 'folder'; label: string; children: MenuTreeNode[] }
```

HandleIndices uses `type`:

```typescript
type HandleIndices =
  | { type: 'input'; index1: number; index2: number | undefined }
  | { type: 'output'; index1: number; index2: undefined };
```

`Plan` (the validate→apply intent) uses `kind`, and `ValidationError` uses
`code` (machine-readable rejection reasons, not message strings):

```typescript
type Plan =
  | { kind: 'ADD_NODE'; nodeType: string; position: XYPosition; selectExclusively: boolean }
  | { kind: 'ADD_EDGE'; connection: {...}; inference: InferencePlan; handleInsertions: HandleInsertion[] }
  | { kind: 'UNDO'; entry: HistoryEntry }
  | ...;

type ValidationError =
  | { code: 'CYCLE_DETECTED'; sourceNodeId: string; targetNodeId: string }
  | { code: 'NODE_TYPE_NOT_FOUND'; nodeType: string }
  | { code: 'SWITCH_PATH_INVALID'; reason: string }
  | { code: 'NODE_COUNT_CONSTRAINT_VIOLATED'; nodeType: string; constraintKind: ...; limit: number; currentCount: number }
  | { code: 'NOOP'; reason: string }
  | ...;
```

`GraphEvent` (observability) is a union on `kind` too — `'action:applied'` /
`'action:rejected'` / `'state:committed'` / `'ui:*'` / `'history:*'`. (The
`'history:*'` members are declared in the union but never emitted by any code
path — only the others appear on the live stream.)

**Source:** `src/utils/nodeStateManagement/mainReducer.ts` › `Action`,
`src/components/organisms/ConfigurableNode/ConfigurableNode.tsx` ›
`ConfigurableNodeInput`, `src/utils/nodeRunner/types.ts` › `ExecutionStep`,
`src/components/molecules/ContextMenu/createNodeContextMenu.ts` ›
`MenuTreeNode`, `src/utils/nodeStateManagement/handles/types.ts` ›
`HandleIndices`, `src/utils/nodeStateManagement/planApply/types.ts` ›
`ValidationError`, `src/utils/nodeStateManagement/planApply/types.ts` › `Plan`,
`src/utils/nodeStateManagement/graphEvent.ts` › `GraphEvent`

### Intersection Types for Props Composition

`Button` uses an intersection of native HTML props + variant props + custom
props:

```typescript
type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    /** Whether to render as a child component using Radix Slot */
    asChild?: boolean;
  };
```

**Source:** `src/components/atoms/Button/Button.tsx` › `ButtonProps`

### Type Guards (`is` return type)

Custom type guards for narrowing at runtime:

```typescript
function isSupportedUnderlyingType(
  type: string,
): type is SupportedUnderlyingTypes {
  return type in supportedUnderlyingTypesMap;
}

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
```

**Source:** `src/utils/nodeStateManagement/types.ts` ›
`isSupportedUnderlyingType`, `src/utils/nodeStateManagement/types.ts` ›
`isValidDataTypeId`

Also `in` operator narrowing for discriminated payloads:

```typescript
if ('nodeId' in action.payload) {
  // TypeScript narrows to the variant with nodeId
}
```

**Source:** `src/utils/nodeStateManagement/planApply/validators.ts` ›
`validateAction`

### Utility Types Used

| Utility                         | Where                                              | Purpose                                                        |
| ------------------------------- | -------------------------------------------------- | -------------------------------------------------------------- |
| `Partial<Record<K, V>>`         | `AllowedConversionsBetweenDataTypes`               | Sparse matrix of type conversions                              |
| `Record<K, V>`                  | `State.dataTypes`, `State.typeOfNodes`             | Keyed object maps                                              |
| `ReadonlyMap<K, V>`             | `useNodeRunner` return, `ValueStore`               | Immutable runtime maps                                         |
| `ReadonlyArray<T>`              | `ExecutionStep[]`, error paths                     | Immutable arrays in public APIs                                |
| `NonNullable<T>`                | `RunnerOverlay` prop for `functionImplementations` | Strip undefined from optional prop                             |
| `ReturnType<T>`                 | `loadRecordRef` typing                             | Extract return type of `loadRecord`                            |
| `ComponentProps<'button'>`      | Button                                             | Native HTML element props                                      |
| `VariantProps<typeof cva>`      | Button                                             | CVA variant prop inference                                     |
| `React.RefObject<T>`            | Multiple                                           | Typed refs                                                     |
| `Exclude<T, U>`                 | `FunctionImplementations`                          | Remove standard node types from implementation map keys        |
| `Omit<T, K> & { ... }`          | Serialization types                                | Replace non-serializable fields with serializable alternatives |
| `ReturnType<typeof setTimeout>` | `useSubmenuManager`                                | Timer ref type for `setTimeout`/`clearTimeout`                 |

### Custom Utility Types

A custom `Optional` utility makes selected keys optional while keeping the rest
required:

```typescript
type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>;
```

**Source:** `src/components/organisms/FullGraph/types.ts` › `Optional`

Used to make certain node props optional for the `Nodes` array type.

### Mapped Key Types with Exclude

`FunctionImplementations` uses a mapped type with `Exclude` to remove standard
node types:

```typescript
type FunctionImplementations<NodeTypeUniqueId extends string = string> = {
  [K in Exclude<
    NodeTypeUniqueId,
    (typeof standardNodeTypeNames)[number]
  >]?: FunctionImplementation;
};
```

This means consumers only need to provide implementations for their own nodes,
not for built-in ones like `groupInput`/`loopStart`.

**Source:** `src/utils/nodeRunner/types.ts` › `FunctionImplementations`

### Omit + Extend for Serialization

When serializing types that contain non-serializable fields, `Omit` strips them
and `&` adds serializable replacements:

```typescript
type SerializedGraphError = Omit<GraphError, 'originalError' | 'path'> & {
  originalError: unknown;
  path: ReadonlyArray<GraphErrorPathEntry>;
};
```

**Source:** `src/utils/importExport/serialization.ts` › `SerializedGraphError`

### Generic Import Result

Import operations return a generic discriminated union:

```typescript
type ImportResult<T> =
  | { success: true; data: T; warnings: ValidationIssue[] }
  | { success: false; errors: ValidationIssue[]; warnings: ValidationIssue[] };
```

**Source:** `src/utils/importExport/types.ts` › `ImportResult`

### Type Guard with Intersection Narrowing

Type guards can narrow to an intersection of the original type with a literal:

```typescript
function isStandardNodeType<T extends string>(
  nodeTypeId: T,
): nodeTypeId is T & StandardNodeTypeName { ... }

function isGroupBoundaryNode<T extends string>(
  nodeTypeId: T,
): nodeTypeId is T & ('groupInput' | 'groupOutput') { ... }

function hasKey<K extends string>(
  obj: Partial<Record<K, unknown>>,
  key: string,
): key is K { ... }
```

**Source:** `src/utils/nodeRunner/groupCompiler.ts` › `isStandardNodeType`,
`src/utils/nodeRunner/groupCompiler.ts` › `isGroupBoundaryNode`,
`src/utils/nodeRunner/groupCompiler.ts` › `hasKey`

### `as const` on Individual Values

When constructing objects for discriminated unions, `as const` narrows string
values to literal types:

```typescript
type: 'number' as const,
type: 'string' as const,
type: 'configurableEdge' as const,
```

**Source:** `src/utils/nodeStateManagement/nodes/constructAndModifyNodes.ts` ›
`constructInputOrOutputOfType`,
`src/utils/nodeStateManagement/constructAndModifyHandles.ts` ›
`addEdgeWithTypeChecking`

### instanceof for Runtime Type Checks

Used in serialization to detect non-plain objects:

```typescript
if (value instanceof Map) {
  /* serialize as entries */
}
if (value instanceof Set) {
  /* serialize as array */
}
if (value instanceof Error) {
  /* serialize as message */
}
```

**Source:** `src/utils/importExport/serialization.ts` › `safeSerializeValue`

### `typeof` for Type Extraction

Extracting types from runtime values:

```typescript
const newNode = constructNodeOfType(...) as (typeof currentView.nodes)[number];
```

This gets the element type of the `nodes` array without importing it separately.

**Source:** `src/utils/nodeStateManagement/planApply/applyPlan.ts` › `ADD_NODE`,
`src/utils/nodeStateManagement/planApply/applyPlan.ts` › `ADD_EDGE`,
`src/utils/nodeStateManagement/planApply/applyPlan.ts` › `ADD_LOOP`

---

## Function Patterns

### Function Declarations (Not Arrow Functions)

The entire codebase uses `function` declarations, never `const fn = () => {}` at
the module level:

```typescript
// YES — used everywhere
function mainReducer<D, N, U, C>(oldState: State, action: Action) { ... }
function useFullGraph<D, N, U, C>(initialState: State) { ... }
function cn(...inputs: ClassValue[]) { ... }

// NO — never used for top-level declarations
const mainReducer = <D, N, U, C>(oldState: State, action: Action) => { ... }
```

Arrow functions are only used for:

- Inline callbacks: `nodes.map((node) => ...)`
- Event handlers: `onClick={() => dispatch(...)}`
- `useCallback` bodies: `useCallback(() => { ... }, [deps])`

### Pure Functions

Compiler and utility functions are pure — no side effects, no mutations:

```typescript
function compile(state, functionImplementations) {
  // reads state, returns ExecutionPlan — never mutates input
  return { steps, warnings, ... };
}
```

**Source:** `src/utils/nodeRunner/compiler.ts` › `compile`,
`src/utils/nodeRunner/topologicalSort.ts` › `topologicalSortWithLevels`,
`src/utils/nodeRunner/errors.ts` › `createGraphError`,
`src/utils/nodeRunner/valueStore.ts` › `ValueStore` (all pure utilities)

### Parameter Objects Pattern

Complex functions use a single options/params object instead of positional
arguments:

```typescript
function useNodeRunner({
  state,
  functionImplementations,
  options,
}: UseNodeRunnerParams) { ... }

function useResizeHandle({
  initialSize, minSize, maxSize, direction = 'up',
}: UseResizeHandleOptions) { ... }

function useSlideAnimation(isOpen: boolean, options: {
  durationMs?: number;
  hiddenTransform?: string;
  ...
} = {}) { ... }
```

### Factory Functions with Structured Return

Factory functions return typed objects, not tuples:

```typescript
function createGraphError(params: { error: unknown; nodeId: string; ... }): GraphError {
  return { message: extractErrorMessage(params.error), nodeId: params.nodeId, ... };
}
```

---

## React Component Patterns

### Component Declaration

Components are `function` declarations (or `forwardRef` wrappers) with named
exports at the bottom:

```typescript
function Accordion({
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Root>) {
  return <AccordionPrimitive.Root data-slot='accordion' {...props} />;
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
```

No default exports. No `React.FC`. No arrow function components (callbacks
passed to `forwardRef` are the only exception).

**Source:** `src/components/atoms/Accordion/Accordion.tsx` › `Accordion`

### forwardRef

Used when a component needs to expose its DOM element to a parent:

```typescript
const ConfigurableNode = forwardRef<
  HTMLDivElement,
  ConfigurableNodeProps
>(({ name, headerColor, inputs, outputs, ...props }, ref) => {
  return <div ref={ref} {...props}>...</div>;
});
```

**Source:** `src/components/organisms/ConfigurableNode/ConfigurableNode.tsx` ›
`ConfigurableNode` (the main node component uses forwardRef)

### Props: Inline Types on Functions vs Separate Type Aliases

**Pattern 1 — Separate named type (for complex/reusable props):**

```typescript
type FullGraphProps<D, N, U, C> = {
  state: State<D, N, U, C>;
  dispatch: ActionDispatch<[Action<D, N, U, C>]>;
  functionImplementations?: FunctionImplementations<N>;
  ...
};

function FullGraph<D, N, U, C>(props: FullGraphProps<D, N, U, C>) { ... }
```

**Pattern 2 — Inline on destructured parameter (for one-off internal
components):**

```typescript
function RunnerOverlay<D, N, U, C>({
  state, dispatch, functionImplementations, children,
}: {
  state: FullGraphProps<D, N, U, C>['state'];
  dispatch: FullGraphProps<D, N, U, C>['dispatch'];
  children: React.ReactNode;
  ...
}) { ... }
```

Note the use of indexed access types (`FullGraphProps<...>['state']`) to derive
prop types from the parent's props type.

### Conditional Rendering

**Ternary for choosing between two subtrees:**

```typescript
{functionImplementations ? (
  <RunnerOverlay ...>{graphContent}</RunnerOverlay>
) : (
  graphContent
)}
```

**`&&` for show/hide:**

```typescript
{!isRunnerPanelOpen && (
  <button onClick={() => setIsRunnerPanelOpen(true)}>Runner</button>
)}
```

**Early return for mount guard:**

```typescript
const { mounted, ref, style } = useSlideAnimation(isOpen);
if (!mounted) return null;
```

### Render Variable Pattern

Complex JSX subtrees are extracted into a local variable, not a sub-component:

```typescript
const graphContent = (
  <>
    <ReactFlow nodes={...} edges={...} ... />
    <FullGraphContextMenu ... />
    <FullGraphNodeGroupSelector ... />
  </>
);

return (
  <div>
    {functionImplementations ? (
      <RunnerOverlay>{graphContent}</RunnerOverlay>
    ) : graphContent}
  </div>
);
```

**Source:** `src/components/organisms/FullGraph/FullGraph.tsx` › `graphContent`

### Component Composition (Slot / asChild Pattern)

The shadcn/Radix `asChild` pattern for polymorphic rendering:

```typescript
const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, color, size, asChild = false, applyHoverStyles, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp ref={ref} data-slot='button' {...props} />;
  },
);
```

**Source:** `src/components/atoms/Button/Button.tsx` › `Button`

### Compound Components (shared-context pattern)

Compound components (e.g. `Select`) are built with a shared React Context plus a
Floating UI core, NOT Radix primitives. The root provides a `SelectContext`; the
sub-components (`SelectTrigger`, `SelectValue`, etc.) read it via a
`useSelectContext()` hook that throws if used outside the root:

```typescript
const SelectContext = createContext<SelectContextValue | null>(null);

function useSelectContext() {
  const context = useContext(SelectContext);
  if (!context)
    throw new Error('Select compound components must be used within <Select>');
  return context;
}

type SelectTriggerProps = ComponentPropsWithoutRef<'button'>;

const SelectTrigger = forwardRef<HTMLButtonElement, SelectTriggerProps>(
  ({ className, children, ...props }, _ref) => {
    const { refs, getReferenceProps } = useInternals();
    const { size } = useSelectContext();
    return (
      <button ref={refs.setReference} type='button' className={cn('...', className)} {...getReferenceProps(props)}>
        {children}
      </button>
    );
  },
);
SelectTrigger.displayName = 'SelectTrigger';
```

Each `forwardRef` sub-component sets a string-literal `displayName` for React
DevTools debugging.

**Source:** `src/components/molecules/Select/Select.tsx` › `SelectContext`,
`src/components/molecules/Select/Select.tsx` › `useSelectContext`,
`src/components/molecules/Select/Select.tsx` › `SelectTrigger`

### forwardRef + useImperativeHandle

Used when a component needs to expose a different ref interface than the
internal DOM element:

```typescript
const ScrollableButtonContainer = forwardRef<HTMLDivElement, Props>((props, ref) => {
  const { listRef } = useAutoScroll({ ... });
  useImperativeHandle(ref, () => listRef.current!);
  return <div ref={listRef}>...</div>;
});
```

**Source:**
`src/components/atoms/ScrollableButtonContainer/ScrollableButtonContainer.tsx` ›
`ScrollableButtonContainer`

### Ref Callback for Multiple Refs

When a single element needs to be stored in both a local ref and a forwarded
ref:

```typescript
ref={(refInner) => {
  setInputRef(refInner);
  if (typeof ref === 'function') {
    ref(refInner);
  } else if (ref) {
    ref.current = refInner;
  }
}}
```

**Source:** `src/components/atoms/Input/Input.tsx` › `Input`

---

## Hook Patterns

### Custom Hook Naming & Structure

All custom hooks follow the pattern:

1. Named `use<Name>` with `function` declaration
2. Accept a single options object (or a few named params)
3. Return a typed object (not a tuple)
4. Exported with explicit `export { useHookName }`
5. Types exported separately: `export type { OptionsType, ReturnType }`

```typescript
type UseResizeHandleOptions = { initialSize: number; minSize: number; ... };
type UseResizeHandleReturn = { size: number; onMouseDown: (e: React.MouseEvent) => void };

function useResizeHandle(options: UseResizeHandleOptions): UseResizeHandleReturn {
  const [size, setSize] = useState(options.initialSize);
  ...
  return { size, onMouseDown };
}

export { useResizeHandle };
export type { UseResizeHandleOptions, UseResizeHandleReturn };
```

### useCallback for Event Handlers

All event handlers passed as props are wrapped in `useCallback`:

```typescript
const handleModeChange = useCallback(
  (m: 'instant' | 'stepByStep') => {
    runner.setMode(m);
  },
  [runner.setMode],
);

const handleRun = useCallback(() => {
  if (runner.runnerState === 'paused') runner.resume();
  else runner.run();
}, [runner.runnerState, runner.run, runner.resume]);
```

### useMemo for Derived Data

Any computation that derives data from state is wrapped in `useMemo`:

```typescript
const nodeGroups = useMemo(() => {
  const result: { id: string; name: string }[] = [];
  for (const key of Object.keys(state.typeOfNodes)) {
    if (state.typeOfNodes[key]?.subtree !== undefined) {
      result.push({ id: key, name: state.typeOfNodes[key].name });
    }
  }
  return result;
}, [state.typeOfNodes]);
```

### useEffect Patterns

**Sync ref to value (expose to parent):**

```typescript
useEffect(() => {
  if (onExecutionRecordRef) {
    onExecutionRecordRef.current = () => runner.executionRecord;
  }
  return () => {
    if (onExecutionRecordRef) {
      onExecutionRecordRef.current = null;
    }
  };
}, [onExecutionRecordRef, runner.executionRecord]);
```

**One-shot trigger (fitView on mount):**

```typescript
useEffect(() => {
  if (state.viewport === undefined) {
    fitView({ maxZoom: 0.5, minZoom: 0.1 });
  }
}, [state.viewport]);
```

**Animation lifecycle (Web Animations API):**

```typescript
useEffect(() => {
  const el = ref.current;
  if (!el || !mounted) return;
  // commit current position, cancel old animation, start new one
  const anim = el.animate([{ transform: targetTransform }], { duration, easing, fill: 'forwards' });
  if (!isOpen) anim.onfinish = () => setMounted(false);
}, [isOpen, mounted, ...]);
```

### useLayoutEffect for Synchronous DOM Updates

Used when a DOM mutation must happen synchronously before paint (e.g., restoring
scroll position after zoom):

```typescript
useLayoutEffect(() => {
  if (pendingScrollLeftRef.current !== null && scrollContainerRef.current) {
    scrollContainerRef.current.scrollLeft = pendingScrollLeftRef.current;
    pendingScrollLeftRef.current = null;
  }
});
```

**Source:** `src/components/molecules/ExecutionTimeline/useTimelineZoomPan.ts` ›
`useTimelineZoomPan`

### Browser Observer Patterns

**IntersectionObserver** (off-viewport edge optimization):

```typescript
useEffect(() => {
  const observer = new IntersectionObserver(
    (entries) => {
      setIsVisible(entries[0].isIntersecting);
    },
    { root: store.getState().domNode, threshold: 0 },
  );
  observer.observe(element);
  return () => observer.disconnect();
}, []);
```

**Source:** `src/components/atoms/ConfigurableEdge/ConfigurableEdge.tsx` ›
`ConfigurableEdge`

**ResizeObserver** (scroll state updates on container resize):

```typescript
const resizeObserver = new ResizeObserver(() => updateScrollState());
resizeObserver.observe(el);
return () => resizeObserver.disconnect();
```

**Source:** `src/hooks/useAutoScroll.ts` › `useAutoScroll`

**MutationObserver** (scroll state updates on child changes):

```typescript
const mo = new MutationObserver(() => updateScrollState());
mo.observe(el, { childList: true, subtree: true });
return () => mo.disconnect();
```

**Source:** `src/hooks/useAutoScroll.ts` › `useAutoScroll`

### requestAnimationFrame for Smooth Scrolling

Continuous animations use `requestAnimationFrame` loops with cleanup:

```typescript
const scrollRafRef = useRef<number | null>(null);

function tickScroll() {
  // update scroll position
  scrollRafRef.current = requestAnimationFrame(tickScroll);
}

// Cleanup
if (scrollRafRef.current !== null) {
  cancelAnimationFrame(scrollRafRef.current);
  scrollRafRef.current = null;
}
```

**Source:** `src/hooks/useAutoScroll.ts` › `useAutoScroll`

### Stable Empty References

Constant empty collections are defined outside components to avoid re-renders:

```typescript
const EMPTY_VISUAL_STATES: ReadonlyMap<string, NodeVisualState> = new Map();
const EMPTY_WARNINGS: ReadonlyMap<string, ReadonlyArray<string>> = new Map();
const EMPTY_ERRORS: ReadonlyMap<string, ReadonlyArray<GraphError>> = new Map();
```

**Source:** `src/utils/nodeRunner/useNodeRunner.ts` › `EMPTY_VISUAL_STATES`,
`src/utils/nodeRunner/useNodeRunner.ts` › `EMPTY_WARNINGS`,
`src/utils/nodeRunner/useNodeRunner.ts` › `EMPTY_ERRORS`

### AbortController for Cancellation

The runner uses `AbortController` to support cancellation of in-flight
execution:

```typescript
const abortRef = useRef<AbortController | null>(null);

function run() {
  abortRef.current?.abort();
  abortRef.current = new AbortController();
  executeGraph(compiledGraph, { signal: abortRef.current.signal });
}

function stop() {
  abortRef.current?.abort();
  abortRef.current = null;
}
```

**Source:** `src/utils/nodeRunner/useNodeRunner.ts` › `useNodeRunner`

### AsyncGenerator for Step-by-Step Execution

The executor yields execution steps one at a time via `AsyncGenerator`, enabling
pause/resume and timeline scrubbing:

```typescript
async function* executeStepByStep(
  compiledGraph: CompiledGraph,
  valueStore: ValueStore,
  signal?: AbortSignal,
): AsyncGenerator<ExecutionStep> {
  for (const node of compiledGraph.executionOrder) {
    if (signal?.aborted) return;
    const step = await executeNode(node, valueStore);
    yield step;
  }
}
```

Consumers iterate with `for await...of`:

```typescript
for await (const step of executeStepByStep(graph, store, signal)) {
  recorder.record(step);
  updateVisualState(step);
}
```

**Source:** `src/utils/nodeRunner/executor/stepByStep.ts` › `executeStepByStep`

### Mutable Ref + Snapshot Pattern

For frequently-updated data that must also trigger renders at controlled points,
the pattern is: mutate a ref for live state, then snapshot it into a new
collection to trigger a render:

```typescript
// Mutable live state (no re-renders)
liveVisualStatesRef.current.set(nodeId, newState);

// Snapshot to trigger render when needed
setVisualStates(new Map(liveVisualStatesRef.current));
```

This avoids re-rendering on every execution step while still allowing the UI to
update at key moments.

**Source:** `src/utils/nodeRunner/useNodeRunner.ts` › `useNodeRunner`

### performance.now() for Execution Timing

All execution timing uses `performance.now()` for sub-millisecond precision:

```typescript
const startTime = performance.now();
const result = await userFunction(inputValues);
const duration = performance.now() - startTime;
```

Duration is stored on each `ExecutionStep` and on `GraphError` objects.

**Source:** `src/utils/nodeRunner/executor/executeStandardNode.ts` ›
`executeStandardNode`, `src/utils/nodeRunner/errors.ts` › `createGraphError`

---

## State Management Patterns

### Validate → Plan → Apply Pipeline

State transitions are NOT a single Immer switch. They are split into three pure
stages so id-minting, validation, and mutation never tangle:

```
action ─▶ validateAction(state, action) ─▶ Result<Plan, ValidationError> | null
                                                   │
                              ok ◀────────────────┘
                                                   │
         applyValidatedAction(state, action, plan.value) ─▶ new State
                              │
              (chooses produce vs produceWithPatches by undoability)
                              │
                    applyPlan(draft, plan) ─▶ mutates the Immer draft
```

1. **`validateAction`** (`src/utils/nodeStateManagement/planApply/validators.ts`
   › `validateAction`) — pure, deterministic. Reads `Readonly<State>`, returns a
   discriminated-union `Plan` (on `kind`) describing the intended change, or
   `err({ code })`, or `null` for an unrecognized action. It mints **no** random
   ids and runs **no** `Math.random()` — calling it twice for the same
   `(state, action)` yields the same `Plan`.
2. **`applyPlan`** (`src/utils/nodeStateManagement/planApply/applyPlan.ts` ›
   `applyPlan`) — mutates an Immer draft from a `Plan`. This is where ids are
   minted (`generateRandomString(lengthOfIds)`), nodes/edges are constructed,
   and `REPLACE_STATE` returns a fresh state. All randomness lives here so it
   runs exactly once per dispatch, inside `produce`.
3. **`applyValidatedAction`**
   (`src/utils/nodeStateManagement/applyWithHistory.ts` ›
   `applyValidatedAction`) — the single orchestrator both `mainReducer` and the
   store call. It wraps `applyPlan` in `produce` or `produceWithPatches`
   depending on `isUndoable(action, plan)`.

```typescript
// validators.ts — pure intent, no id minting
case actionTypesMap.ADD_NODE:
  if (!(nodeType in _state.typeOfNodes)) {
    return err({ code: 'NODE_TYPE_NOT_FOUND', nodeType: String(nodeType) });
  }
  return ok({ kind: 'ADD_NODE', nodeType, position, selectExclusively });

// applyPlan.ts — minting + construction happen here, once, inside produce
case 'ADD_NODE': {
  const newNodeId = generateRandomString(lengthOfIds);
  const newNode = constructNodeOfType(/* ... */ newNodeId, plan.position);
  // ...push into the current scope's nodes
  return;
}
```

**Key rules:**

- `Plan` is a non-generic discriminated union on `kind`
  (`src/utils/nodeStateManagement/planApply/types.ts` › `Plan`). Generic-typed
  payloads (node data, handles, imported state) are carried as `unknown` at the
  Plan boundary and re-asserted inside `applyPlan`'s generic.
- `ValidationError` is a discriminated union on `code` (machine-readable, not
  message strings) — e.g. `'CYCLE_DETECTED'`, `'NODE_TYPE_NOT_FOUND'`,
  `'SWITCH_PATH_INVALID'`, `'NODE_COUNT_CONSTRAINT_VIOLATED'`, `'NOOP'`.
- Use the `Result<T, E>` sum type plus the `ok()` / `err()` constructors. A
  `null` return is reserved for actions `validateAction` does not recognize.
- `applyPlan` returns `void` for in-place mutations, or returns a value to
  replace the whole draft (only `REPLACE_STATE`).

**Source:** `src/utils/nodeStateManagement/planApply/validators.ts` ›
`validateAction`, `src/utils/nodeStateManagement/planApply/applyPlan.ts` ›
`applyPlan`, `src/utils/nodeStateManagement/planApply/types.ts` › `Plan`,
`src/utils/nodeStateManagement/planApply/types.ts` › `Result`,
`src/utils/nodeStateManagement/planApply/types.ts` › `ValidationError`,
`src/utils/nodeStateManagement/planApply/types.ts` › `ok`,
`src/utils/nodeStateManagement/planApply/types.ts` › `err`,
`src/utils/nodeStateManagement/applyWithHistory.ts` › `applyValidatedAction`

### Immer `produce()` / `produceWithPatches()` in `applyValidatedAction`

Immer is no longer invoked inside `mainReducer` directly. `mainReducer` is a
thin delegator, and `applyValidatedAction` owns the single
`produce`/`produceWithPatches` call:

```typescript
function mainReducer(oldState, action) {
  const planResult = validateAction(oldState, action);
  if (planResult === null || !planResult.ok) return oldState;
  return applyValidatedAction(oldState, action, planResult.value);
}

function applyValidatedAction(state, action, plan) {
  if (!isUndoable(action, plan)) {
    // Non-undoable: plain produce, no patch capture
    return produce(state, (draft) => {
      const returnValue = applyPlan(draft, plan);
      if (returnValue !== undefined) return returnValue; // REPLACE_STATE etc.
    });
  }
  // Undoable: capture forward/inverse patches for the history stacks
  const [next, patches, inversePatches] = produceWithPatches(state, (draft) => {
    const returnValue = applyPlan(draft, plan);
    if (returnValue !== undefined) return returnValue;
  });
  // ...filter out history-path patches, then record them in a second produce
}
```

**Key rules:**

- Mutate the draft directly for incremental changes; `return` only to replace
  the entire state (`REPLACE_STATE`). The draft is typed `Draft<State<D,N,U,C>>`
  and re-asserted as `StateT` (a compile-time no-op cast — `State` has no
  `readonly` fields).
- `enablePatches()` is called once at module load in
  `src/utils/nodeStateManagement/applyWithHistory.ts` › `applyValidatedAction`.
- Never call `produce` inside `mainReducer` anymore — go through
  `applyValidatedAction`.

**Source:** `src/utils/nodeStateManagement/mainReducer.ts` › `mainReducer`,
`src/utils/nodeStateManagement/applyWithHistory.ts` › `applyValidatedAction`

### Undo/Redo via `produceWithPatches`

History is part of `State` (`state.history`), not a separate store. Each
undoable dispatch captures Immer patches:

- `produceWithPatches` returns `[next, patches, inversePatches]`.
- `filterHistoryPatches` drops any patch whose `path[0] === 'history'` (so
  history recording never records itself into an infinite loop).
- `recordInHistory` pushes a `HistoryEntry` ({ patches, inversePatches,
  actionType, timestamp }) onto `history.undoStack` and clears `redoStack` (a
  new edit invalidates the redo branch). `config.maxSize` caps the stack via
  `slice(-maxSize)`.
- `UNDO`/`REDO` are themselves non-undoable plans. `applyPlan` pops the entry
  and replays patches with `applyPatchesToDraft` — a hand-rolled patch applier
  that mutates the draft in place (Immer's built-in `applyPatches` returns a new
  object and can't operate on a draft proxy).
- `BEGIN_BATCH`/`END_BATCH` coalesce many dispatches into one `HistoryEntry` via
  `history.activeBatch`; inverse patches are `unshift`-ed so the batch undoes in
  reverse order.

`isUndoable(action, plan)` decides the path. A `NON_UNDOABLE_PLAN_KINDS` set
excludes `SET_VIEWPORT`, `REPLACE_STATE`, `OPEN_DRAWER`/`CLOSE_DRAWER`, the
history ops themselves, etc. Two plans are conditionally undoable:
`UPDATE_NODES_RF` only when the changes include a `position` or `remove` (not
`select`/`dimensions`), and `UPDATE_EDGES_RF` only when a `removal` step is
present.

**Source:** `src/components/organisms/FullGraph/historyTypes.ts` ›
`HistoryEntry`, `src/components/organisms/FullGraph/historyTypes.ts` ›
`isUndoable`, `src/components/organisms/FullGraph/historyTypes.ts` ›
`filterHistoryPatches`, `src/components/organisms/FullGraph/historyTypes.ts` ›
`recordInHistory`, `src/components/organisms/FullGraph/historyTypes.ts` ›
`applyPatchesToDraft`, `src/utils/nodeStateManagement/planApply/applyPlan.ts` ›
`UNDO`, `src/utils/nodeStateManagement/planApply/applyPlan.ts` › `REDO`,
`src/utils/nodeStateManagement/planApply/applyPlan.ts` › `BEGIN_BATCH`,
`src/utils/nodeStateManagement/planApply/applyPlan.ts` › `END_BATCH`,
`src/utils/nodeStateManagement/planApply/applyPlan.ts` › `CLEAR_HISTORY`,
`src/utils/nodeStateManagement/types.ts` › `State`

### External Store: `createGraphStore` + `useSyncExternalStore`

The recommended path (`useFullGraph`) is a Redux-style external store, NOT
`useReducer`. `createGraphStore` owns state in a closure and notifies
subscribers:

```typescript
function createGraphStore(initialState, getOnGraphEvent) {
  let state = initialState;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch(action) {
      const planResult = validateAction(state, action);
      if (planResult === null) return; // unrecognized
      if (!planResult.ok) {
        // rejected — emit, no state change
        getOnGraphEvent()?.(deriveRejectedEvent(action, planResult.error));
        return;
      }
      const prev = state;
      const next = applyValidatedAction(prev, action, planResult.value);
      if (next === prev) return; // identity short-circuit
      state = next; // update BEFORE emitting
      getOnGraphEvent()?.(
        deriveAppliedEvent(action, planResult.value, prev, next),
      );
      listeners.forEach((l) => l());
    },
  };
}
```

`useFullGraph` creates the store exactly once (lazy `useRef`) and subscribes via
React 18's `useSyncExternalStore`:

```typescript
function useFullGraph(initialState, options) {
  const onGraphEventRef = useRef(options?.onGraphEvent);
  onGraphEventRef.current = options?.onGraphEvent; // latest-value ref

  const storeRef = useRef(null);
  if (storeRef.current === null) {
    storeRef.current = createGraphStore(
      initialState,
      () => onGraphEventRef.current,
    );
  }
  const store = storeRef.current;

  const state = useSyncExternalStore(
    store.subscribe,
    store.getState,
    store.getState,
  );
  return { state, dispatch: store.dispatch };
}
```

**Why this shape (load-bearing):**

- `dispatch` is a plain closure function, run once per call and never replayed
  by React — so the `onGraphEvent` side effect fires exactly once with ids
  derived from the **committed** state (`deriveAppliedEvent` diffs
  `prev`/`next`). This fixed the "wrapper-emits-with-stale-id" bug.
- The store closes over a **getter** for `onGraphEvent` (not the value) so an
  inline callback whose identity changes per render never forces store
  recreation.
- `mainReducer` still exists and works with `useReducer(mainReducer, ...)` for
  direct consumers, but `useFullGraph` is the recommended path.

**Source:** `src/components/organisms/FullGraph/graphStore.ts` ›
`createGraphStore`, `src/components/organisms/FullGraph/FullGraphState.ts` ›
`useFullGraph`

### Graph Event Stream (observability)

`onGraphEvent` receives a single `GraphEvent` union
(`src/utils/nodeStateManagement/graphEvent.ts` › `GraphEvent`) discriminated on
`kind`. The events actually emitted are: reducer events (`action:applied` /
`action:rejected`, emitted by `graphStore.ts`), the render-commit barrier
(`state:committed`, fired from a `useEffect` keyed on node/edge counts in
`FullGraphState.ts`), and UI-only events (`ui:drag:ended`,
`ui:delete:attempted`, `ui:state:imported`, `ui:recording:imported`). The
history kinds (`history:undo` / `history:redo` / `history:cleared`) are declared
as `GraphEvent` union members but **no code path emits them** — they are not
part of the live observable stream (the source comment on them in
`graphEvent.ts` is stale). `action:applied` carries a per-action `detail` (also
a discriminated union on `kind`); `action:rejected` carries the
`ValidationError` so consumers switch on `.code`. Newly-minted ids in `detail`
come from `deriveAppliedEvent` diffing `prev`/`next` — never from the `Plan`.

**Source:** `src/utils/nodeStateManagement/graphEvent.ts` › `GraphEvent`,
`src/utils/nodeStateManagement/graphEvent.ts` › `deriveAppliedEvent`,
`src/utils/nodeStateManagement/graphEvent.ts` › `deriveRejectedEvent`,
`src/utils/nodeStateManagement/graphEvent.ts` › `ActionDetail`

### Action Typing with `typeof actionTypesMap.X`

Actions reference the map's literal types, not raw strings:

```typescript
dispatch({
  type: actionTypesMap.ADD_NODE_AND_SELECT,
  payload: { type: 'inputNode', position: { x: 100, y: 100 } },
});
```

This ensures misspelled action types are caught at compile time.

### State Navigation (getCurrentNodesAndEdgesFromState)

Since node groups store their own nodes/edges in subtrees, a helper navigates
the `openedNodeGroupStack` to return the currently visible nodes and edges:

```typescript
const currentNodesAndEdges = getCurrentNodesAndEdgesFromState(state);
// Returns { nodes, edges, inputNodeId?, outputNodeId?, zones?, zoneIndex? }
```

Because zones are scope-local (root zones on `state.zones`, group zones on
`subtree.zones`), this getter returns the current scope's `zones`/`zoneIndex`
alongside its nodes/edges. The companion
`setCurrentNodesAndEdgesToStateWithMutatingState` and `setCurrentZonesToState`
write back to the matching scope. All three are called inside `applyPlan`, in
components, and in the runner.

### `mainReducer` Is a Thin Delegator (Not the Owner of Logic)

`mainReducer` no longer contains the action switch. It validates then applies,
returning `oldState` unchanged on rejection. The real logic lives in
`validateAction` + `applyPlan` (see the Validate → Plan → Apply pipeline above).
`useReducer(mainReducer, ...)` still works for direct consumers, but
`useFullGraph` (external store) is the recommended path.

**Source:** `src/utils/nodeStateManagement/mainReducer.ts` › `mainReducer`

---

## Ref Patterns

### useRef for DOM Elements

Standard DOM ref for file inputs, animated elements, etc.:

```typescript
const importStateInputRef = useRef<HTMLInputElement>(null);
// later: importStateInputRef.current?.click()
```

### useRef for Mutable Values (non-rendering)

Refs that hold non-rendered state to avoid re-renders:

```typescript
const isResizingRef = useRef(false);
const startPosRef = useRef(0);
const animRef = useRef<Animation | null>(null);
```

### Ref as Callback Channel (Parent ↔ Child)

Refs are used to pass functions between parent and child without re-rendering:

```typescript
// Parent creates the ref
const executionRecordRef = useRef<(() => ExecutionRecord | null) | null>(null);

// Child populates it via useEffect
useEffect(() => {
  if (onExecutionRecordRef) {
    onExecutionRecordRef.current = () => runner.executionRecord;
  }
  return () => {
    if (onExecutionRecordRef) onExecutionRecordRef.current = null;
  };
}, [onExecutionRecordRef, runner.executionRecord]);

// Parent reads it
const record = executionRecordRef.current?.();
```

The ref type is `React.RefObject<(() => T) | null>` — a ref to a nullable
function.

**Source:** `src/components/organisms/FullGraph/useGraphImportExport.tsx` ›
`UseGraphImportExportReturn` (type),
`src/components/organisms/FullGraph/RunnerOverlay.tsx` › `RunnerOverlay` (ref),
`src/components/organisms/FullGraph/useGraphImportExport.tsx` ›
`useGraphImportExport` (read)

### SVG Arrow Ref (Floating UI)

```typescript
const arrowRef = useRef<SVGSVGElement>(null);
// passed to floating-ui: arrow({ element: arrowRef })
```

**Source:** `src/hooks/useFloatingTooltip.ts` › `useFloatingTooltip`

---

## Context Patterns

### createContext with null! Assertion

Context is created with `null!` as the default, since the provider always wraps
consumers:

```typescript
const FullGraphContext = createContext<{
  allProps: FullGraphProps;
}>(null!);
```

The comment explicitly explains this choice:
`//the not-null assertion (null!) is because we are creating a context that is always provided`

**Source:** `src/components/organisms/FullGraph/FullGraphState.ts` ›
`FullGraphContext`

### Split Contexts (graph props vs runner state vs record)

Runner visual state is NOT carried on `FullGraphContext`. It is split into three
separate contexts so the graph tree doesn't re-render on every runner tick:

- `FullGraphContext` — `{ allProps }` only (graph state + dispatch + props).
- `RunnerContext` —
  `{ nodeRunnerStates, selectedStepRecord, edgeValuesAnimated }`, provided by
  `RunnerOverlay`. Typed `| undefined` (no provider when no runner).
- `RecordContext` — controlled execution record
  (`{ executionRecord, setExecutionRecord }`), with a real default object (not
  `null!`).

**Source:** `src/components/organisms/FullGraph/FullGraphState.ts` ›
`FullGraphContext`, `src/components/organisms/FullGraph/FullGraphState.ts` ›
`RunnerContext`, `src/components/organisms/FullGraph/FullGraphState.ts` ›
`RecordContext`

### Generic Variance Bridge

React's `createContext` doesn't support generics. To provide a concrete
`FullGraphProps<'andGate', ...>` to a context typed as
`FullGraphProps<string, ...>`, a variance bridge function is used. It now takes
only `{ state, dispatch }` (runner state moved to `RunnerContext`):

```typescript
function createContextValue(props: {
  state: unknown;
  dispatch: unknown;
}): React.ContextType<typeof FullGraphContext> {
  const allProps = props as unknown as FullGraphProps;
  return { allProps };
}
```

The `unknown` → `as unknown as` double cast is documented with a safety
justification comment explaining why the contravariance on dispatch is safe.

**Source:** `src/components/organisms/FullGraph/FullGraphState.ts` ›
`createContextValue`

### Context Consumption via useContext

Components read from the relevant context directly:

```typescript
const { allProps } = useContext(FullGraphContext);
const runner = useContext(RunnerContext); // undefined when no runner is mounted
```

**Source:**
`src/components/organisms/ConfigurableNode/SupportingSubcomponents/ConfigurableNodeReactFlowWrapper.tsx`
› `ConfigurableNodeReactFlowWrapper`

---

## Styling Patterns

### cn() Helper (clsx + tailwind-merge)

Every component uses `cn()` for class composition:

```typescript
import { cn } from '@/utils/cnHelper';

<div className={cn(
  'base-class px-4',
  isActive && 'ring-2 ring-blue-500',
  className  // allow parent override
)} />
```

**Source:** `src/utils/cnHelper.ts` › `cn`

### cva() for Multi-Variant Components

`class-variance-authority` defines variant matrices. `Button` uses `variants` +
`defaultVariants` + `compoundVariants`:

```typescript
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 cursor-pointer rounded-md ...', // base
  {
    variants: {
      color: {
        dark: 'bg-secondary-black border-secondary-dark-gray',
        lightNonPriority: 'bg-primary-gray border-transparent',
        lightPriority: 'bg-primary-gray border-transparent',
        lightParentGroupBasedHover: 'bg-primary-gray border-transparent',
      },
      applyHoverStyles: { true: '', false: '' }, // handled in compoundVariants
      size: {
        normal: 'py-2 px-4 text-[27px] leading-[27px]',
        small: 'py-2 px-3 text-[16px] leading-[13px] rounded-sm',
      },
    },
    defaultVariants: { color: 'dark', applyHoverStyles: true, size: 'normal' },
    compoundVariants: [
      {
        color: 'dark',
        applyHoverStyles: true,
        className: 'hover:bg-primary-dark-gray',
      },
      // ...
    ],
  },
);
```

Component uses:
`cn(buttonVariants({ color, size, className, applyHoverStyles }))`

**Source:** `src/components/atoms/Button/Button.tsx` › `buttonVariants`

### data-slot Attributes

Components add a `data-slot` attribute for CSS targeting and testing:

```typescript
<Comp data-slot='button' ... />
```

**Source:** `src/components/atoms/Button/Button.tsx` › `Button`,
`src/components/atoms/Modal/Modal.tsx` › `Modal` (every sub-component sets
`data-slot`)

### Inline Styles for Dynamic Values Only

Tailwind handles all static styles. Inline `style` is reserved for values
computed at runtime:

```typescript
<div style={{ backgroundColor: headerColor }}>  // dynamic color from props
<div style={{ transform: hiddenTransform }}>     // animation initial state
```

### Custom Color Tokens

Tailwind theme extends with project-specific tokens used everywhere:

```
bg-primary-black, bg-primary-dark-gray, bg-secondary-dark-gray
text-primary-white, text-secondary-light-gray
border-secondary-dark-gray
```

**Source:** `src/index.css` (@theme inline block)

---

## Module & Export Patterns

### Named Exports Only

No default exports anywhere. Everything uses named exports:

```typescript
export { Button };
export type { ButtonProps };
```

### Separate Value and Type Exports

Values and types are exported in separate statements:

```typescript
export { mainReducer, actionTypesMap };
export type { Action };
```

### Barrel Files (index.ts)

Each directory has a barrel file re-exporting its contents:

```typescript
// src/components/atoms/index.ts
export * from './Accordion';
export * from './Button';
export * from './ConfigurableEdge';
export * from './ErrorBoundary';
export * from './Input';
export * from './Modal';
...

// src/utils/index.ts
export * from './cnHelper';
export * from './geometry';
export * from './conversions';
export * from './nodeStateManagement';
export * from './importExport';
```

### Path Aliases

The `@/` alias maps to `src/`:

```typescript
import { cn } from '@/utils/cnHelper';
import { FullGraphContext } from '@/components/organisms/FullGraph/FullGraphState';
import type { NodeVisualState } from '@/utils/nodeRunner/types';
```

Relative imports are used within the same directory or for sibling files:

```typescript
import { compile } from './compiler';
import { execute } from './executor';
```

### `type` Import Specifier

Type-only imports use the `type` keyword:

```typescript
import type { z } from 'zod';
import type { Viewport } from '@xyflow/react';
import { type State, type SupportedUnderlyingTypes } from './types';
```

Both `import type { X }` and `import { type X }` are used. The inline `type`
form is preferred when mixing value and type imports from the same module.

---

## Error Handling Patterns

### Structured Error Objects (Not Exceptions)

The runner uses structured `GraphError` objects with full context:

```typescript
type GraphError = {
  message: string;
  nodeId: string;
  nodeTypeId: string;
  nodeTypeName: string;
  handleId?: string;
  path: ReadonlyArray<GraphErrorPathEntry>;  // upstream trace
  loopContext?: { iteration: number; maxIterations: number; ... };
  groupContext?: { groupNodeTypeId: string; depth: number; ... };
  timestamp: number;
  duration: number;
  originalError: unknown;
};
```

**Source:** `src/utils/nodeRunner/types.ts` › `GraphError`,
`src/utils/nodeRunner/errors.ts` › `createGraphError`,
`src/utils/nodeRunner/errors.ts` › `formatGraphError`

### extractErrorMessage for Unknown Catches

A helper normalizes `unknown` caught values:

```typescript
function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}
```

### Validation Result Objects

Import/export and edge operations return result objects rather than throwing:

```typescript
// Import returns
type ImportResult = { success: true; data: State } | { success: false; errors: ValidationError[] };

// Edge operations return
const result = addEdgeWithTypeChecking(...);
if (!result.validation.isValid) break;  // silently reject invalid edge
```

### @ts-expect-error for Known Safe Casts

Used sparingly, with comments explaining why (the codebase uses
`@ts-expect-error` exclusively — never `@ts-ignore`):

```typescript
// @ts-expect-error standard node types are always present in state.typeOfNodes
standardNodeTypeNamesMap.groupInput,
```

**Source:** `src/utils/nodeStateManagement/planApply/applyPlan.ts` ›
`ADD_NODE_GROUP`

---

## Data Structure Patterns

### Map over Object for Runtime Data

Runtime data uses `Map` and `ReadonlyMap`:

```typescript
const nodeVisualStates: ReadonlyMap<string, NodeVisualState> = new Map();
const combined = new Map<string, NodeRunnerState>();
```

### Record for Static Definitions

Static type/data definitions use `Record`:

```typescript
dataTypes: Record<
  DataTypeUniqueId,
  DataType<UnderlyingType, ComplexSchemaType>
>;
typeOfNodes: Record<NodeTypeUniqueId, TypeOfNode<D, N, U, C>>;
```

**Configuration maps** — `Record` with a union key for exhaustive lookup:

```typescript
const statusBlockClass: Record<ExecutionStepRecordStatus, string> = {
  completed: 'bg-runner-bar-completed',
  errored: 'bg-runner-bar-errored',
  skipped: 'bg-status-skipped',
};
```

TypeScript ensures every status variant has an entry.

**Source:**
`src/components/molecules/ExecutionTimeline/SupportingSubcomponents/types.ts` ›
`statusBlockClass`

### Qualified ID Strings

Composite keys use `nodeId:handleId` format:

```typescript
function qualifiedId(nodeId: string, handleId: string): string {
  return `${nodeId}:${handleId}`;
}
```

**Source:** `src/utils/nodeRunner/valueStore.ts` › `qualifiedId`

### Flatten Utility for Nested Arrays

Inputs can be flat or nested in panels. A flatten function normalizes them:

```typescript
function flattenInputs(
  inputs: ReadonlyArray<MinimalInput | MinimalInputPanel> | undefined,
): MinimalInput[] {
  const result: MinimalInput[] = [];
  if (!inputs) return result;
  for (const item of inputs) {
    if ('inputs' in item) {
      // it's a panel
      for (const inner of item.inputs) result.push(inner);
    } else {
      result.push(item);
    }
  }
  return result;
}
```

**Source:** `src/utils/nodeRunner/valueStore.ts` › `flattenInputs`

### ValueStore Class (Only Class in Codebase)

The `ValueStore` is the sole class-based abstraction. It provides a scoped
key-value store for runtime execution values, using qualified `nodeId:handleId`
keys:

```typescript
class ValueStore {
  private readonly store: Map<string, unknown>;
  private readonly prefix: string; // scope prefix ("groupNodeId>") for group execution
  private readonly parent: ValueStore | null;

  set(nodeId: string, handleId: string, value: unknown): void {
    this.store.set(this.prefix + qualifiedId(nodeId, handleId), value);
  }

  get(nodeId: string, handleId: string): unknown | undefined {
    // looks up the scoped key, falling back to the parent scope if absent
    return this.store.get(this.prefix + qualifiedId(nodeId, handleId));
  }

  resolveInputs(
    nodeId: string,
    nodeData: MinimalNodeData,
    inputResolutionMap: ReadonlyMap<string, ReadonlyArray<InputResolutionEntry>>,
    nodesById: ReadonlyMap<string, { data: MinimalNodeData; ... }>,
  ): Map<string, InputHandleValue> {
    // Resolves all input values for a node, keyed by handle name
  }

  buildOutputInfo(/* ... */): Map<string, OutputHandleInfo> {
    // Builds the output-handle info map for a node
  }
}
```

The full surface is
`set`/`get`/`has`/`resolveInputs`/`buildOutputInfo`/`snapshot`/`createScope`/`clearScope`.
A class is used here (instead of a plain object/closure) because it encapsulates
a mutable `Map` with methods that enforce the qualified-key convention (and the
optional scope `prefix` for group execution).

**Source:** `src/utils/nodeRunner/valueStore.ts` › `ValueStore`

### Recursive Execution for Loop Bodies

The executor uses recursion to process loop body steps. `processSteps` calls
itself when it encounters a loop node whose body contains more steps:

```typescript
async function* processSteps(steps, valueStore, signal) {
  for (const step of steps) {
    if (step.type === 'loop') {
      for (let i = 0; i < step.maxIterations; i++) {
        yield* processSteps(step.bodySteps, valueStore, signal);
      }
    } else {
      yield await executeNode(step, valueStore);
    }
  }
}
```

**Source:** `src/utils/nodeRunner/executor/executeLoopBlock.ts` ›
`executeLoopBlock`, `src/utils/nodeRunner/executor/executeOneStep.ts` ›
`executeOneStep`

### Minimal Types to Avoid Variance Issues

When reading node data in the runner (which doesn't need full generics), minimal
structural types are defined:

```typescript
type MinimalInput = { id?: string; name?: string; allowInput?: boolean; value?: unknown; ... };
type MinimalNodeData = { inputs?: ReadonlyArray<MinimalInput | MinimalInputPanel>; ... };
```

This avoids importing the generic `ConfigurableNodeInput<U,C,D>` type and its
variance requirements.

**Source:** `src/utils/nodeRunner/valueStore.ts` › `MinimalInput`,
`src/utils/nodeRunner/valueStore.ts` › `MinimalNodeData`

### Zones (Scope-Local Regions + Reverse Index)

Zones are first-class graph regions (rendered as frame polygons, optionally
enforcing connection boundaries). They follow several conventions:

- **Scope-local storage.** Root zones live on `state.zones`; node-group zones
  live on `subtree.zones`. Always go through `getCurrentNodesAndEdgesFromState`
  (read) and `setCurrentZonesToState` (write) so the correct scope is targeted —
  never assign `draft.zones` directly when a group is open.
- **`Record<string, Zone>` keyed by opaque UUID.** Zone ids are
  `generateRandomString(ZONE_ID_LENGTH)`, NOT derived from node ids. A `Zone`
  links back to its structure via
  `structureLink: { structureType, structureId, zoneRole }` (e.g. `'switch'` +
  switchStartId + `'trueBranch'`).
- **Reverse index for O(1) validation.** `ZoneIndex.handleToZone` maps each
  boundary handle id → owning zone id. Rebuild it with `buildZoneIndex(zones)`
  whenever zones change; connection validation (`validateAddEdge`) reads it to
  reject boundary-crossing edges in `enforced` zones (`SWITCH_PATH_INVALID`).
- **System vs user zones.** System zones (switch/loop) carry `boundaryHandles`,
  `structureLink`, and `enforced: true`, and are created/recomputed
  automatically: `createSwitchZones` / `createLoopZones` on ADD,
  `recomputeAllZoneMemberships` on every edge change, `rehydrateAllZones` on
  `REPLACE_STATE` import. User zones (future) omit
  `boundaryHandles`/`structureLink` and are visual-only.
- **Membership is derived, never authored.** `nodeIds` (the nodes inside a zone)
  are recomputed via BFS from boundary handles (`discoverZoneNodesFromHandles`)
  — treat them as cache, not source of truth.
- **Lookup helpers, not id math.** Use
  `findZoneByStructure(zones, structureId, zoneRole)` and
  `getBoundaryNodeIds(zone)` rather than reconstructing keys.

**Source:** `src/utils/nodeStateManagement/zones/types.ts` › `Zone`,
`src/utils/nodeStateManagement/zones/types.ts` › `ZoneIndex`,
`src/utils/nodeStateManagement/zones/types.ts` › `buildZoneIndex`,
`src/utils/nodeStateManagement/zones/types.ts` › `findZoneByStructure`,
`src/utils/nodeStateManagement/zones/types.ts` › `getBoundaryNodeIds`,
`src/utils/nodeStateManagement/zones/zoneLifecycle.ts` › `createSwitchZones`,
`src/utils/nodeStateManagement/zones/zoneLifecycle.ts` › `createLoopZones`,
`src/utils/nodeStateManagement/zones/zoneLifecycle.ts` ›
`recomputeAllZoneMemberships`,
`src/utils/nodeStateManagement/zones/zoneLifecycle.ts` › `rehydrateAllZones`,
`src/utils/nodeStateManagement/types.ts` › `State`

---

## Naming Conventions

### Files

| Type       | Convention                  | Example                              |
| ---------- | --------------------------- | ------------------------------------ |
| Component  | PascalCase directory + file | `Button/Button.tsx`                  |
| Story      | PascalCase + `.stories.tsx` | `Button/Button.stories.tsx`          |
| Barrel     | `index.ts`                  | `atoms/index.ts`                     |
| Hook       | camelCase `use` prefix      | `useSlideAnimation.ts`               |
| Utility    | camelCase                   | `cnHelper.ts`, `randomGeneration.ts` |
| Types file | camelCase                   | `types.ts`                           |
| State file | PascalCase + `State`        | `FullGraphState.ts`                  |

### Types and Interfaces

| Convention                       | Example                                               |
| -------------------------------- | ----------------------------------------------------- |
| PascalCase type aliases          | `State`, `DataType`, `TypeOfNode`, `Action`           |
| `Type` prefix for definitions    | `TypeOfNode`, `TypeOfInput`, `TypeOfInputPanel`       |
| `Props` suffix                   | `FullGraphProps`, `ConfigurableNodeProps`             |
| `Return` suffix for hook returns | `UseNodeRunnerReturn`, `UseResizeHandleReturn`        |
| `Options` suffix for hook params | `UseResizeHandleOptions`, `UseFloatingTooltipOptions` |

### Functions

| Convention                         | Example                                                        |
| ---------------------------------- | -------------------------------------------------------------- |
| camelCase                          | `mainReducer`, `compile`, `execute`                            |
| `make` prefix for factories        | `makeStateWithAutoInfer`, `makeDataTypeWithAutoInfer`          |
| `is` prefix for type guards        | `isSupportedUnderlyingType`, `isValidDataTypeId`, `isLoopNode` |
| `create` prefix for constructors   | `createGraphError`, `createContextValue`                       |
| `get`/`set` prefix for accessors   | `getCurrentNodesAndEdgesFromState`                             |
| `handle` prefix for event handlers | `handleRun`, `handleModeChange`, `handleImportState`           |
| `build` prefix for map builders    | `buildNodeInfoMap`, `buildErrorPath`                           |
| `compute` prefix for derivations   | `computeVisualStatesAtStep`                                    |
| `extract` prefix for parsers       | `extractErrorMessage`                                          |
| `format` prefix for formatters     | `formatGraphError`                                             |
| `download` prefix for I/O          | `downloadJson`                                                 |

### Constants

All-caps with underscores for module-level constants:

```typescript
const DEFAULT_MAX_LOOP_ITERATIONS = 100;
const EMPTY_VISUAL_STATES: ReadonlyMap<...> = new Map();
```

Regular `camelCase const` for computed values and maps:

```typescript
const actionTypesMap = { ... } as const;
const lengthOfIds = 20;
```

### displayName for forwardRef Components

All `forwardRef` components set `displayName` for React DevTools:

```typescript
const Button = forwardRef<HTMLButtonElement, ButtonProps>((...) => { ... });
Button.displayName = 'Button';
```

Compound sub-components set a string-literal `displayName`:

```typescript
SelectTrigger.displayName = 'SelectTrigger';
```

**Source:** `src/components/atoms/Button/Button.tsx` › `Button`,
`src/components/molecules/Select/Select.tsx` › `SelectTrigger`

### Section Comments

Runner files use horizontal rule comments to organize sections:

```typescript
// ─────────────────────────────────────────────────────
// Runner State Machine
// ─────────────────────────────────────────────────────
```

---

## Anti-Patterns to Avoid

### Do Not Use Arrow Functions for Components or Top-Level Functions

TypeScript cannot parse `<T>` in `.tsx` arrow functions. Use `function`
declarations.

### Do Not Use Default Exports

Every export is named. This enables tree-shaking and consistent imports.

### Do Not Use `React.FC`

Components are typed via their parameter destructuring, not via `React.FC`.

### Do Not Use Raw Strings for Action Types

Always use `actionTypesMap.ADD_NODE`, never `'ADD_NODE'`.

### Do Not Create Contexts Without Providers

If using `createContext(null!)`, the provider MUST always be above consumers.
Document this with a comment.

### Do Not Skip the Auto-Infer Helpers

Always use `makeStateWithAutoInfer`, `makeDataTypeWithAutoInfer`,
`makeTypeOfNodeWithAutoInfer` for type safety. Never create state/types as raw
object literals.

### Do Not Import Full Generic Types in the Runner

Use minimal structural types (e.g. `MinimalNodeData`) to avoid generic variance
issues when only structural access is needed.

### Do Not Use Inline Styles for Static Values

All static styles go through Tailwind classes. Inline `style` is only for
dynamic runtime values.

### Do Not Use Enums

Use `as const` arrays with derived union types instead.
