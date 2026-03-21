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

**Source:** `src/utils/nodeStateManagement/types.ts:348-355` (State),
`src/utils/nodeStateManagement/mainReducer.ts:252-258` (mainReducer),
`src/components/organisms/FullGraph/FullGraph.tsx:766-772` (FullGraph)

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

**Source:** `src/utils/nodeStateManagement/types.ts:60-97`

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

- `makeDataTypeWithAutoInfer` — `src/utils/nodeStateManagement/types.ts:128-135`
- `makeTypeOfNodeWithAutoInfer` —
  `src/utils/nodeStateManagement/types.ts:277-293`
- `makeStateWithAutoInfer` — `src/utils/nodeStateManagement/types.ts:513-529`
- `makeAllowedConversionsBetweenDataTypesWithAutoInfer` —
  `src/utils/nodeStateManagement/types.ts:334-338`

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

**Used for:** `supportedUnderlyingTypes` (`types.ts:9-16`), `actionTypes`
(`mainReducer.ts:32-44`), `runnerStates` (`nodeRunner/types.ts:12-19`),
`nodeVisualStates` (`nodeRunner/types.ts:27-34`)

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

**Source:** `src/utils/nodeStateManagement/mainReducer.ts:47-59`,
`src/utils/nodeStateManagement/standardNodes.ts` (standardNodeTypeNamesMap)

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
  | { kind: 'standard'; nodeId: string; ... }
  | { kind: 'loop'; loopStartNodeId: string; bodySteps: ReadonlyArray<ExecutionStep>; ... }
  | { kind: 'group'; groupNodeId: string; innerPlan: ExecutionPlan; ... };
```

Context menu items also use `kind`:

```typescript
type MenuItem =
  | { kind: 'leaf'; label: string; action: () => void }
  | { kind: 'folder'; label: string; children: MenuItem[] };
```

HandleIndices uses `type`:

```typescript
type HandleIndices =
  | { type: 'input'; index1: number; index2: number | undefined }
  | { type: 'output'; index1: number; index2: undefined };
```

**Source:** `mainReducer.ts:69-181` (Action), `ConfigurableNode.tsx:27-90`
(inputs), `nodeRunner/types.ts:255-307` (ExecutionStep),
`ContextMenu/createNodeContextMenu.ts:55-65` (MenuItem), `handles/types.ts:9-11`
(HandleIndices)

### Intersection Types for Props Composition

Badge uses intersection of native HTML props + variant props + custom props:

```typescript
function Badge({
  className, variant = 'default', asChild = false, ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
```

**Source:** `src/components/atoms/Badge/Badge.tsx:29-35`

### Type Guards (`is` return type)

Custom type guards for narrowing at runtime:

```typescript
function isSupportedUnderlyingType(
  type: string,
): type is SupportedUnderlyingTypes {
  return Boolean(supportedUnderlyingTypesMap[type as SupportedUnderlyingTypes]);
}

function isValidDataTypeId<DataTypeUniqueId extends string>(
  id: string,
  dataTypes: Record<DataTypeUniqueId, DataType>,
): id is DataTypeUniqueId {
  return id in dataTypes;
}
```

**Source:** `types.ts:48-52`, `types.ts:140-154`

Also `in` operator narrowing for discriminated payloads:

```typescript
if ('nodeId' in action.payload) {
  // TypeScript narrows to the variant with nodeId
}
```

**Source:** `mainReducer.ts:433`

### Utility Types Used

| Utility                         | Where                                              | Purpose                                                        |
| ------------------------------- | -------------------------------------------------- | -------------------------------------------------------------- |
| `Partial<Record<K, V>>`         | `AllowedConversionsBetweenDataTypes`               | Sparse matrix of type conversions                              |
| `Record<K, V>`                  | `State.dataTypes`, `State.typeOfNodes`             | Keyed object maps                                              |
| `ReadonlyMap<K, V>`             | `useNodeRunner` return, `ValueStore`               | Immutable runtime maps                                         |
| `ReadonlyArray<T>`              | `ExecutionStep[]`, error paths                     | Immutable arrays in public APIs                                |
| `NonNullable<T>`                | `RunnerOverlay` prop for `functionImplementations` | Strip undefined from optional prop                             |
| `ReturnType<T>`                 | `loadRecordRef` typing                             | Extract return type of `loadRecord`                            |
| `React.ComponentProps<'span'>`  | Badge                                              | Native HTML element props                                      |
| `VariantProps<typeof cva>`      | Badge, Button                                      | CVA variant prop inference                                     |
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

**Source:** `src/components/organisms/FullGraph/types.ts:8`

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

**Source:** `src/utils/nodeRunner/types.ts:193-196`

### Omit + Extend for Serialization

When serializing types that contain non-serializable fields, `Omit` strips them
and `&` adds serializable replacements:

```typescript
type SerializedGraphError = Omit<GraphError, 'originalError' | 'path'> & {
  originalError: unknown;
  path: ReadonlyArray<GraphErrorPathEntry>;
};
```

**Source:** `src/utils/importExport/serialization.ts:105-108`

### Generic Import Result

Import operations return a generic discriminated union:

```typescript
type ImportResult<T> =
  | { success: true; data: T; warnings: ValidationIssue[] }
  | { success: false; errors: ValidationIssue[]; warnings: ValidationIssue[] };
```

**Source:** `src/utils/importExport/types.ts:28-30`

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

**Source:** `src/utils/nodeRunner/groupCompiler.ts:247-285`

### `as const` on Individual Values

When constructing objects for discriminated unions, `as const` narrows string
values to literal types:

```typescript
type: 'number' as const,
type: 'string' as const,
type: 'configurableEdge' as const,
```

**Source:** `constructAndModifyNodes.ts:104-146`,
`constructAndModifyHandles.ts:98`

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

**Source:** `src/utils/importExport/serialization.ts:63-75`

### `typeof` for Type Extraction

Extracting types from runtime values:

```typescript
const node: (typeof newState.nodes)[number] = constructNodeOfType(...);
```

This gets the element type of the `nodes` array without importing it separately.

**Source:** `mainReducer.ts:289`, `mainReducer.ts:499`, `mainReducer.ts:509`

---

## Function Patterns

### Function Declarations (Not Arrow Functions)

The entire codebase uses `function` declarations, never `const fn = () => {}` at
the module level:

```typescript
// YES — used everywhere
function mainReducer<D, N, U, C>(oldState: State, action: Action) { ... }
function useFullGraph<D, N, U, C>(initialState: State) { ... }
function Badge({ className, variant }: Props) { ... }
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

**Source:** `compiler.ts`, `topologicalSort.ts`, `errors.ts`, `valueStore.ts`
(all pure utilities)

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

All components are `function` declarations with named exports at the bottom:

```typescript
function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
```

No default exports. No `React.FC`. No arrow function components.

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

**Source:** `ConfigurableNode.tsx` (the main node component uses forwardRef)

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

**Source:** `FullGraph.tsx:509-617`

### Component Composition (Slot / asChild Pattern)

The shadcn/Radix `asChild` pattern for polymorphic rendering:

```typescript
function Badge({ asChild = false, ...props }) {
  const Comp = asChild ? Slot.Root : 'span';
  return <Comp data-slot="badge" {...props} />;
}
```

**Source:** `Badge.tsx:29-46`

### Compound Components (Radix UI Wrappers)

Radix UI primitives are re-exported as styled compound components:

```typescript
const Select = SelectPrimitive.Root;
const SelectGroup = SelectPrimitive.Group;

const SelectTrigger = forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger ref={ref} className={cn('...', className)} {...props}>
    {children}
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;
```

Each wrapped component sets `displayName` for React DevTools debugging.

**Source:** `Select.tsx`

### forwardRef + useImperativeHandle

Used when a component needs to expose a different ref interface than the
internal DOM element:

```typescript
const ScrollableButtonContainer = forwardRef<HTMLDivElement, Props>((props, ref) => {
  const listRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => listRef.current as HTMLDivElement);
  return <div ref={listRef}>...</div>;
});
```

**Source:** `ScrollableButtonContainer.tsx:58`

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

**Source:** `Input.tsx:153-160`

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

**Source:** `useTimelineZoomPan.ts:55-60`

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

**Source:** `ConfigurableEdge.tsx:84-116`

**ResizeObserver** (scroll state updates on container resize):

```typescript
const resizeObserver = new ResizeObserver(() => updateScrollState());
resizeObserver.observe(el);
return () => resizeObserver.disconnect();
```

**Source:** `useAutoScroll.ts:138-142`

**MutationObserver** (scroll state updates on child changes):

```typescript
const mo = new MutationObserver(() => updateScrollState());
mo.observe(el, { childList: true, subtree: true });
return () => mo.disconnect();
```

**Source:** `useAutoScroll.ts:171-172`

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

**Source:** `useAutoScroll.ts:107-125`

### Stable Empty References

Constant empty collections are defined outside components to avoid re-renders:

```typescript
const EMPTY_VISUAL_STATES: ReadonlyMap<string, NodeVisualState> = new Map();
const EMPTY_WARNINGS: ReadonlyMap<string, ReadonlyArray<string>> = new Map();
const EMPTY_ERRORS: ReadonlyMap<string, ReadonlyArray<GraphError>> = new Map();
```

**Source:** `useNodeRunner.ts:93-95`

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

**Source:** `useNodeRunner.ts`

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

**Source:** `executor.ts`

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

**Source:** `useNodeRunner.ts`

### performance.now() for Execution Timing

All execution timing uses `performance.now()` for sub-millisecond precision:

```typescript
const startTime = performance.now();
const result = await userFunction(inputValues);
const duration = performance.now() - startTime;
```

Duration is stored on each `ExecutionStep` and on `GraphError` objects.

**Source:** `executor.ts`, `errors.ts`

---

## State Management Patterns

### Immer `produce()` in the Reducer

The main reducer wraps all mutations in `produce()`:

```typescript
function mainReducer(oldState, action) {
  const newState = produce(oldState, (newState) => {
    switch (action.type) {
      case actionTypesMap.ADD_NODE:
        // Mutate newState directly — Immer handles immutability
        newState.nodes.push(newNode);
        break;
      case actionTypesMap.REPLACE_STATE:
        return action.payload.state; // Return replaces the draft entirely
    }
  });
  return newState;
}
```

**Key rules:**

- Mutate the draft directly for incremental changes
- `return` a new value to replace the entire state (used by `REPLACE_STATE`)
- The produce callback receives a mutable draft typed as `State<D,N,U,C>`

**Source:** `mainReducer.ts:273-554`

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
// Returns { nodes, edges, inputNodeId?, outputNodeId? }
```

This is called in the reducer, in components, and in the runner.

### useReducer (Not useState) for Complex State

The graph state uses `useReducer` with the typed reducer:

```typescript
function useFullGraph<D, N, U, C>(initialState: State<D, N, U, C>) {
  const [state, dispatch] = useReducer(mainReducer<D, N, U, C>, initialState);
  return { state, dispatch };
}
```

Note: `mainReducer` is passed with explicit generic parameters.

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

**Source:** `FullGraph.tsx:169-175` (type), `FullGraph.tsx:183-204` (effect),
`FullGraph.tsx:393` (read)

### SVG Arrow Ref (Floating UI)

```typescript
const arrowRef = useRef<SVGSVGElement>(null);
// passed to floating-ui: arrow({ element: arrowRef })
```

**Source:** `useFloatingTooltip.ts:48`

---

## Context Patterns

### createContext with null! Assertion

Context is created with `null!` as the default, since the provider always wraps
consumers:

```typescript
const FullGraphContext = createContext<{
  allProps: FullGraphProps;
  nodeRunnerStates?: ReadonlyMap<string, NodeRunnerState>;
}>(null!);
```

The comment explicitly explains this choice:
`//the not-null assertion (null!) is because we are creating a context that is always provided`

**Source:** `FullGraphState.ts:21-26`

### Generic Variance Bridge

React's `createContext` doesn't support generics. To provide a concrete
`FullGraphProps<'andGate', ...>` to a context typed as
`FullGraphProps<string, ...>`, a variance bridge function is used:

```typescript
function createContextValue(
  props: { state: unknown; dispatch: unknown },
  nodeRunnerStates?: ReadonlyMap<string, NodeRunnerState>,
): React.ContextType<typeof FullGraphContext> {
  const allProps = props as unknown as FullGraphProps;
  return { allProps, nodeRunnerStates };
}
```

The `unknown` → `as unknown as` double cast is documented with a safety
justification comment explaining why the contravariance on dispatch is safe.

**Source:** `FullGraphState.ts:138-147`

### Context Consumption via useContext

Components read from context directly:

```typescript
const { allProps, nodeRunnerStates } = useContext(FullGraphContext);
```

**Source:** `ConfigurableNodeReactFlowWrapper.tsx`

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

**Source:** `src/utils/cnHelper.ts`

### cva() for Multi-Variant Components

`class-variance-authority` defines variant matrices:

```typescript
const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', // base
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground',
        secondary: 'bg-secondary text-secondary-foreground',
        destructive: 'bg-destructive text-white',
        outline: 'border-border text-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);
```

Component uses: `cn(badgeVariants({ variant }), className)`

**Source:** `Badge.tsx:7-27`, also used in `Button.tsx`

### data-slot / data-variant Attributes

Components add `data-slot` and `data-variant` for CSS targeting and testing:

```typescript
<Comp data-slot="badge" data-variant={variant} ... />
```

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
export { Badge, badgeVariants };
export type { ConfigurableNodeInput, ConfigurableNodeOutput };
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
export * from './Badge';
export * from './Button';
export * from './Collapsible';
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

**Source:** `src/utils/nodeRunner/types.ts` (GraphError type),
`src/utils/nodeRunner/errors.ts` (factory + formatter)

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

### @ts-ignore for Known Safe Casts

Used sparingly, with comments explaining why:

```typescript
//@ts-ignore we assume standard node types are always added in state
standardNodeTypeNamesMap.groupInput,
```

**Source:** `mainReducer.ts:502-503`

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
  completed: 'bg-status-completed',
  errored: 'bg-status-errored',
  skipped: 'bg-status-skipped',
};
```

TypeScript ensures every status variant has an entry.

**Source:** `ExecutionTimeline.tsx:55-71`

### Qualified ID Strings

Composite keys use `nodeId:handleId` format:

```typescript
function qualifiedId(nodeId: string, handleId: string): string {
  return `${nodeId}:${handleId}`;
}
```

**Source:** `valueStore.ts:45-47`

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

**Source:** `valueStore.ts:53-64`

### ValueStore Class (Only Class in Codebase)

The `ValueStore` is the sole class-based abstraction. It provides a scoped
key-value store for runtime execution values, using qualified `nodeId:handleId`
keys:

```typescript
class ValueStore {
  private store = new Map<string, unknown>();

  set(nodeId: string, handleId: string, value: unknown): void {
    this.store.set(qualifiedId(nodeId, handleId), value);
  }

  get(nodeId: string, handleId: string): unknown {
    return this.store.get(qualifiedId(nodeId, handleId));
  }

  getInputValues(
    nodeId: string,
    inputs: MinimalInput[],
  ): Record<string, unknown> {
    // Collects all input values for a node into a single object
  }
}
```

A class is used here (instead of a plain object/closure) because it encapsulates
a mutable `Map` with methods that enforce the qualified-key convention.

**Source:** `valueStore.ts`

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

**Source:** `executor.ts`

### Minimal Types to Avoid Variance Issues

When reading node data in the runner (which doesn't need full generics), minimal
structural types are defined:

```typescript
type MinimalInput = { id?: string; name?: string; allowInput?: boolean; value?: unknown; ... };
type MinimalNodeData = { inputs?: ReadonlyArray<MinimalInput | MinimalInputPanel>; ... };
```

This avoids importing the generic `ConfigurableNodeInput<U,C,D>` type and its
variance requirements.

**Source:** `valueStore.ts:13-39`

---

## Naming Conventions

### Files

| Type       | Convention                  | Example                              |
| ---------- | --------------------------- | ------------------------------------ |
| Component  | PascalCase directory + file | `Badge/Badge.tsx`                    |
| Story      | PascalCase + `.stories.tsx` | `Badge/Badge.stories.tsx`            |
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

For Radix UI wrappers, inherit the primitive's display name:

```typescript
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;
```

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
