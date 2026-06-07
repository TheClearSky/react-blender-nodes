# Storybook

## Overview

Storybook serves as the primary development environment for the
react-blender-nodes component library. It provides interactive previews,
auto-generated documentation, accessibility auditing, and visual testing for
every component in the atomic design hierarchy (atoms, molecules, organisms).

The project uses **Storybook 9.x** with the `@storybook/react-vite` framework,
running on the same Vite build pipeline as the library itself.

```
+-----------------------------------------------------------+
|                    Storybook Dev Server                    |
|                      (localhost:6006)                      |
+-----------------------------------------------------------+
|                                                            |
|  +----------+   +------------+   +-----------+             |
|  |  Atoms   |   | Molecules  |   | Organisms |             |
|  +----------+   +------------+   +-----------+             |
|  | Button   |   | RunControls|   | FullGraph |             |
|  | Input    |   | ContextMenu|   | Configur- |             |
|  | Checkbox |   | Select     |   |  ableNode |             |
|  | Accordion|   | SliderNum  |   | NodeRunner|             |
|  | Modal    |   | ExecTime-  |   |  Panel    |             |
|  | Tooltip  |   |  line      |   +-----------+             |
|  | NodeStat-|   | ExecStep-  |                             |
|  |  usInd.  |   |  Inspector |                             |
|  | Scrollab-|   | ColorPicker|                             |
|  |  leBtnC. |   | DragList...|                             |
|  +----------+   +------------+                             |
|                                                            |
|  Addons: autodocs | a11y | vitest | test-codegen           |
+-----------------------------------------------------------+
```

## Configuration

### Directory Structure

```
.storybook/
  main.ts              -- Story discovery, addons, framework, staticDirs, Vite overrides
  preview.ts           -- Global parameters, story sort, docs theme, CSS imports
  preview-head.html    -- Favicon link + custom <style> for full-screen layout
  manager.ts           -- Storybook UI theme (dark mode) + addon-panel collapse
  manager-head.html    -- Manager-side <head> injection
  vitest.setup.ts      -- Portable stories setup for Vitest integration
  static/              -- Static assets served by Storybook (favicon, graph states, colorpicker)
```

### main.ts

The main configuration file defines:

- **Story discovery**: `../src/**/*.mdx` and
  `../src/**/*.stories.@(js|jsx|mjs|ts|tsx)`
- **Addons**:
  - `@storybook/addon-docs` -- Auto-generated documentation pages
  - `@storybook/addon-a11y` -- Accessibility auditing per story
  - `@storybook/addon-vitest` -- In-browser test runner integration
  - `storybook-addon-test-codegen` -- Test code generation from interactions
- **Framework**: `@storybook/react-vite`
- **Static dirs**: `staticDirs: ['./static']` -- serves `.storybook/static`
  (favicon, prebuilt graph-state JSON, color-picker logo HTML)
- **Telemetry**: Disabled (`core.disableTelemetry: true`)
- **Vite override**: `viteFinal` strips the `vite:dts` plugin via
  `withoutVitePlugins` (declaration generation is unnecessary in Storybook
  builds)

### preview.ts

Imports the project's global CSS (`../src/index.css`) and the DejaVu Sans font
(`@fontsource/dejavu-sans`), ensuring stories render with the same styles as the
library.

Parameters:

- **docs.theme**: A dark docs theme created via `create({ base: 'dark' })` from
  `storybook/theming`
- **options.storySort**: Explicit sidebar order
  `['Interactive Fun🎉', 'Atoms', 'Molecules', 'Organisms', '*']`
- **controls.matchers**: Auto-detects color and date controls via regex
  (`color: /(background|color)$/i`, `date: /Date$/i`)
- **a11y.test**: Set to `'todo'` (shows violations in UI only, does not fail CI)

### preview-head.html

Injects a `<style>` block that resets the Storybook root container to full
width/height with a `#1d1d1d` background. This enables the FullGraph organism
story to fill the entire viewport for realistic graph editing.

### manager.ts

Sets the Storybook manager UI to a custom dark theme built with
`create({ base: 'dark', brandTitle: 'react-blender-nodes', brandImage: '/favicon.svg' })`
from `storybook/theming`. It also registers a `collapse-panel` addon that
collapses the bottom addon panel on first load
(`api.setSizes({ bottomPanelHeight: 0 })`).

### vitest.setup.ts

Configures portable stories for Vitest by calling `setProjectAnnotations` with
the a11y addon annotations and the project's preview annotations. This enables
running component stories as Vitest tests outside of the browser.

## Story Patterns

### Atom Stories

Atoms are the smallest UI primitives. Their stories follow a consistent pattern:

| Component                     | Stories                                                                                                                                   | Pattern Notes                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Button**                    | Playground, AdjustableParentWidthWithFullWidth                                                                                            | Uses `fn()` for click actions                                                       |
| **Input**                     | Playground, AllowOnlyNumbers, Controlled, ControlledAllowOnlyNumbers, AdjustableParentWidthWithFullWidth                                  | Uses `useArgs()` for controlled state                                               |
| **Checkbox**                  | Playground, Disabled, Controlled                                                                                                          | Uses `useArgs()` for controlled state                                               |
| **Accordion**                 | Single, Multiple, AllCollapsed                                                                                                            | Compound component (Item/Trigger/Content) on `@radix-ui`                            |
| **Modal**                     | Basic, Sizes, Scrollable                                                                                                                  | Compound dialog (Trigger/Content/Header/Body/Footer/Close); no `tags: ['autodocs']` |
| **Tooltip**                   | Default, WithoutInfoIcon, PlacementTop, PlacementRight, RichContent, StructuredContent, IconTrigger, IconWithText, NarrowWidth, WideWidth | Floating-ui based; ReactNode content + placement gallery                            |
| **NodeStatusIndicator**       | Playground, Idle, Running, Completed, Errored, Skipped, Warning, ErroredWithMultipleErrors, AllStates, InteractiveCycler                  | State gallery + interactive state cycler                                            |
| **ScrollableButtonContainer** | Playground, HorizontalAdjustableWidth, Vertical, Disabled                                                                                 | Orientation + constraint testing                                                    |

**Common atom story conventions:**

1. **Playground story**: Most simple atoms export a `Playground` story as the
   default interactive sandbox (often just `{}`). Compound atoms (Accordion,
   Modal, Tooltip) instead lead with a named scenario (`Single`, `Basic`,
   `Default`).
2. **`tags: ['autodocs']`**: Most atom story files include the autodocs tag,
   enabling auto-generated documentation pages. (The Modal story file is an
   exception and does not set the tag.)
3. **`satisfies Meta<...>`**: Type-safe meta definitions using the `satisfies`
   keyword with component prop types.
4. **`fn()` from `storybook/test`**: Used for action-logged callback props
   (onClick, onChange, etc.).
5. **`useArgs()` pattern**: For controlled components, stories use `useArgs()`
   to sync the Storybook controls panel with component state. The import path is
   not consistent across files: Checkbox and Input import from the internal
   `storybook/internal/preview-api`, while SliderNumberInput and ButtonToggle
   import from the public `storybook/preview-api`. The public path is preferred
   (see Anti-Pattern #1).
6. **AdjustableParentWidth story**: Several atoms include a story with a
   `parentWidth` range control and `parentBorder` toggle to test responsive
   behavior within constrained containers.

### Molecule Stories

Molecules combine atoms into more complex interactive components. Their stories
tend to be richer, with mock data factories and multi-state showcases.

| Component                  | Stories                                                                                                                                                                                                                                                                            | Pattern Notes                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **RunControls**            | Playground, IdleState, RunningState, PausedState, CompletedState, ErroredState, StepByStepMode, CompilingState, AllStatesComparison, InteractiveLifecycle                                                                                                                          | Full state machine demo with action log              |
| **ExecutionTimeline**      | Playground, NoRecord, LinearExecution, ConcurrentExecution, LargeGraph, WithErrors, WithSelectedStep, StressTestLong, InteractiveDemo, FullyCompleted                                                                                                                              | Mock data factories, zoom/pan stress test            |
| **ExecutionStepInspector** | Playground, NoStep, CompletedStep, ErroredStep, SkippedStep, InsideLoop, InsideGroup, MultipleConnections, DefaultInputValues, RichInputsAndOutputs, DeepComplexValues, HideComplexValuesEnabled, DebugModeEnabled, DebugModeWithComplexData, AllStatuses, InteractiveStepSwitcher | Extensive mock data covering all execution scenarios |
| **ContextMenu**            | Playground, WithIcons, DeepNesting, ActionsMenu, InteractiveExample                                                                                                                                                                                                                | Recursive submenu structure, shortcut display        |
| **Select**                 | Playground, Controlled, WithDeselect, WithUnsupportedValue, WithGroups, WithSeparators, Disabled, WithDefaultValue, AdjustableParentWidth                                                                                                                                          | Custom floating-ui compound component pattern        |
| **SliderNumberInput**      | Playground, AdjustableParentWidthWithFullWidth, SizeComparison, SmallInteger, SmallFloat, EdgeCaseSmallValue, EdgeCaseZeroValue, NoConstraints, WithRange, SmallWithRange                                                                                                          | Uses `useArgs()` for value sync; edge-case gallery   |
| **ButtonToggle**           | (see `ButtonToggle.stories.tsx`)                                                                                                                                                                                                                                                   | Two-state toggle button                              |
| **ColorPicker**            | (see `ColorPicker.stories.tsx`)                                                                                                                                                                                                                                                    | OKLCH color picker popover                           |
| **DragList**               | (see `DragList.stories.tsx`)                                                                                                                                                                                                                                                       | Reorderable drag-and-drop list                       |
| **PresetModal**            | (see `PresetModal.stories.tsx`)                                                                                                                                                                                                                                                    | Built on the Modal atom                              |
| **NodeTypeEditDrawer**     | (see `NodeTypeEditDrawer.stories.tsx`)                                                                                                                                                                                                                                             | Node-type editing drawer                             |
| **BlockTooltipContent**    | (in `ExecutionTimeline/SupportingSubcomponents/SupportingSubcomponents.stories.tsx`, titled `Molecules/BlockTooltipContent`)                                                                                                                                                       | Timeline block tooltip content                       |

**Common molecule story conventions:**

1. **Mock data factories**: Complex runner molecules define helper functions at
   the top of the story file to build realistic mock data without repetition.
   Each file declares only the subset it needs: ExecutionTimeline defines
   `makeStep` and `makeRecord`; ExecutionStepInspector defines `conn`,
   `inputWith`, and `output`; the NodeRunnerPanel organism story declares all
   five (`conn`, `inputWith`, `output`, `makeStep`, `makeRecord`).
2. **Multiple scenario variants**: Runner-related molecules include stories for
   every state in the runner state machine (idle, compiling, running, paused,
   completed, errored).
3. **Interactive demos**: Most molecules include at least one story with
   `useState` that wires up real interactivity, demonstrating the component's
   full lifecycle.
4. **Comparison stories**: "AllStates" or "AllStatuses" stories render every
   variant side by side in a single view.
5. **Stress-test stories**: ExecutionTimeline includes `StressTestLong` with 30+
   steps across 8 concurrency levels to validate zoom/pan at scale.

### Organism Stories (FullGraph Playground)

Organisms are the highest-level components. Their stories serve as integration
playgrounds combining multiple atoms and molecules.

| Component            | Stories                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **FullGraph**        | Playground, WithControlledInputs, WithHandleShapes, WithTypeCheckingAndConversions, WithCycleChecking, WithRunner, EmptyRunnerPlayground, FullAdderCircuit, RippleCarryAdder, LoopCounterCircuit, CustomInputComponents                                                                                                                                                                                                                                                                           |
| **ConfigurableNode** | Playground, WithInputsAndOutputs, WithCollapsiblePanels, WithInputComponents, WithInputComponentsInPanels, AdjustableParentWidthWithFullWidth, AllHandleShapesAsInputs, AllHandleShapesAsOutputs                                                                                                                                                                                                                                                                                                  |
| **NodeRunnerPanel**  | IdleNoRecord, CompletedHalfAdder, CompletedLargePipeline, ErroredExecution, LoopExecution, GroupExecution, PausedStepByStep, Running, Compiling, FullAdderExecution, RippleCarryAdderExecution, NestedGroupExecution, LoopWithErrorExecution, LoopInsideGroupExecution, AllStatesComparison, InteractiveLifecycle, InteractiveReplay, InteractiveErrorInspection, InteractiveLoopReplay, InteractiveGroupReplay, InteractiveDisplayOptions, InteractiveModeSwitching, InteractiveScenarioSwitcher |

**Organism story conventions:**

1. **FullGraph as main playground**: The FullGraph story acts as the project's
   primary "kitchen sink" demo. It imports `useFullGraph` hook, defines data
   types, node types, and function implementations, then renders a complete
   interactive graph editor.
2. **Real circuit simulations**: FullGraph stories include realistic digital
   logic circuits (Half Adder, Full Adder, Ripple Carry Adder, Loop Counter)
   using the standard node types and data types from the library.
3. **JSON state import**: FullGraph imports pre-built graph state from
   `PlaygroundState1.json` for rapid scenario setup.
4. **Full-screen layout**: The `preview-head.html` styles ensure FullGraph
   stories occupy the entire viewport, matching real-world usage.
5. **NodeRunnerPanel exhaustive coverage**: With 23 exported stories,
   NodeRunnerPanel has the most comprehensive story coverage in the project,
   testing every combination of runner state, execution scenario, and
   interaction mode.

## Running Storybook

### Development Server

```bash
npm run storybook
```

Starts the Storybook dev server on port **6006** with hot module replacement via
Vite.

### Production Build

```bash
npm run build-storybook
```

Produces a static Storybook site in the `storybook-static/` directory suitable
for deployment.

### Checklist Integration

```bash
npm run checklist    # or: npm run cl
```

The project's checklist script includes `build-storybook` as a validation step,
ensuring all stories compile without errors before any release.

### Vitest Integration

There are two separate Vitest setups in this project, and it is important not to
conflate them:

1. **Standalone unit tests** (what `npm run test` runs):

   ```bash
   npm run test        # alias of: vitest run --config vitest.config.ts
   ```

   This uses `vitest.config.ts`, which is intentionally **separate** from the
   Storybook integration. It runs the standalone unit tests only
   (`include: ['src/__tests__/**/*.test.{ts,tsx}']`, `environment: 'node'`,
   `setupFiles: ['./src/__tests__/setup.ts']`) and does **not** execute any
   stories. The `test:unit` / `test:unit:watch` scripts point at this same
   config.

2. **Storybook portable-stories integration** (defined in `vite.config.ts`):

   Stories configured with portable stories (via `.storybook/vitest.setup.ts`)
   can be executed as Vitest tests in a real browser. This is wired up in the
   `test.projects` array of `vite.config.ts` via the `@storybook/addon-vitest`
   `storybookTest()` plugin (browser mode, `provider: 'playwright'`,
   `setupFiles: ['.storybook/vitest.setup.ts']`), enabling validation of
   component rendering and accessibility. Because `npm run test` targets
   `vitest.config.ts`, it does **not** run this Storybook project.

## Story Writing Conventions

### File Naming and Location

Stories are co-located with their components:

```
src/components/<tier>/<ComponentName>/
  <ComponentName>.tsx           -- Component implementation
  <ComponentName>.stories.tsx   -- Storybook stories
  index.ts                      -- Barrel export
```

### Meta Configuration Pattern

```
const meta = {
  component: MyComponent,
  argTypes: { ... },
  args: { ... },
  decorators: [ ... ],
  tags: ['autodocs'],
} satisfies Meta<MyComponentProps>;

export default meta;
type Story = StoryObj<typeof meta>;
```

All stories use `satisfies Meta<...>` for full type inference without losing the
literal type.

### Required First Story

Every component exports a `Playground` (or equivalent default) story as the
first export. This acts as the primary interactive sandbox.

### Controlled Component Pattern

```
export const Controlled: Story = {
  args: { value: 'initial', onChange: fn() },
  render: (args) => {
    const [, setArgs] = useArgs();
    function onChangeWrapper(value: string) {
      setArgs({ ...args, value });
      args.onChange?.(value);
    }
    return <MyComponent {...args} onChange={onChangeWrapper} />;
  },
};
```

This pattern keeps Storybook controls panel in sync with component internal
state.

### AdjustableParentWidth Pattern

```
export const AdjustableParentWidthWithFullWidth = {
  argTypes: {
    parentWidth: { control: { type: 'range', min: 1, max: 1000, step: 30 } },
    parentBorder: { control: { type: 'boolean' } },
  },
  args: { parentWidth: 300, parentBorder: true },
  render: ({ parentWidth, parentBorder, ...args }) => (
    <div style={{ width: parentWidth }}
         className={parentBorder ? 'border-red-900' : 'border-transparent'}>
      <MyComponent className='w-full' {...args} />
    </div>
  ),
} satisfies StoryObj<Meta<Props & { parentWidth: number; parentBorder: boolean }>>;
```

Used across Button, Input, Select, SliderNumberInput, ScrollableButtonContainer,
and ConfigurableNode to validate responsive behavior.

### Decorator Pattern

Centering decorators are common for isolated component display:

```
decorators: [
  (Story) => (
    <div className='flex justify-center items-center min-h-screen p-8'>
      <Story />
    </div>
  ),
],
```

### Mock Data Factory Pattern

Complex runner/execution stories define reusable factory functions at the top of
the file:

```
function makeStep(overrides: { stepIndex, nodeId, ... }): ExecutionStepRecord { ... }
function makeRecord(steps, overrides?): ExecutionRecord { ... }
function conn(value, sourceName, handleName, opts?): RecordedInputConnection { ... }
```

These are defined per-file (not shared across files) to keep stories
self-contained.

## Anti-Patterns and Limitations

### Known Anti-Patterns to Avoid

1. **Importing `useArgs` from `storybook/internal/preview-api`**: Some stories
   import from the internal path. While functional, this is an implementation
   detail that may break across Storybook major versions.
2. **Mock data duplication**: The mock-data factory functions are duplicated
   across the runner story files rather than shared, though each file declares
   only the subset it needs (ExecutionTimeline: `makeStep`, `makeRecord`;
   ExecutionStepInspector: `conn`, `inputWith`, `output`; NodeRunnerPanel: all
   five). Where they overlap, the implementations are copied per-file. A shared
   test utilities module could reduce this.
3. **Inline JSX in args**: Stories like NodeStatusIndicator pass `<MockNode />`
   as `children` in `args`, which is not serializable and prevents those args
   from appearing in the Storybook controls panel.

### Limitations

1. **No interaction tests**: Despite having the `@storybook/addon-vitest` and
   `storybook-addon-test-codegen` addons installed, no `play` functions are
   defined on any stories. Interaction testing is currently unused.
2. **a11y audit is non-blocking**: The `a11y.test` parameter is set to `'todo'`,
   meaning accessibility violations appear in the UI but do not fail CI. This
   should be promoted to `'error'` when the component library reaches
   accessibility compliance.
3. **Full-screen override is global**: The `preview-head.html` styles reset
   padding/margin for ALL stories, not just FullGraph. This could cause
   unexpected layout behavior for isolated atom stories that expect default
   padding.
4. **No MDX documentation**: The story discovery pattern includes
   `../src/**/*.mdx`, but no MDX files exist in the project. Documentation is
   purely auto-generated via the `autodocs` tag.
5. **`vite:dts` stripping**: The `viteFinal` hook removes the DTS plugin, which
   is correct but means type documentation is not available within Storybook's
   docs addon.

## Relationships with Project Features

### -> All UI Components (stories)

```
+------------------------------------------------------+
|                  Component Library                    |
|                                                      |
|  Atoms ------> Molecules ------> Organisms           |
|  (8 files)     (12 files)       (3 files)            |
|                                                      |
|  Most components have a co-located .stories.tsx file  |
|  (+1 Interactive Fun🎉/Logo Customizer story file)    |
|  Total: 24 story files, ~205 individual stories      |
+------------------------------------------------------+
         |                    |
         v                    v
  +-------------+    +------------------+
  |  autodocs   |    |  a11y auditing   |
  |  (per tag)  |    |  (per story)     |
  +-------------+    +------------------+
```

Most user-facing components have a corresponding story file (several internal
atoms such as ConfigurableConnection, ConfigurableEdge, ErrorBoundary, and
NodeResizerWithMoreControls have no story). Stories serve as:

- **Living documentation**: Auto-generated docs pages via the `autodocs` tag
- **Visual regression baseline**: Each story is a stable, deterministic render
- **Development sandbox**: Interactive controls for rapid iteration
- **Accessibility audit target**: The a11y addon evaluates each story

### -> [FullGraph (main playground)](../ui/fullGraphDoc.md)

```
+------------------------------------------------------------------+
|                    FullGraph Playground Story                      |
+------------------------------------------------------------------+
|                                                                    |
|  Imports:                                                          |
|  - FullGraph + useFullGraph         (./ organism barrel)           |
|  - standardDataTypes, standardNodeTypes, standardNodeCount-        |
|    Constraints, standardHiddenNodeTypesInContextMenu  (@/utils)    |
|  - makeDataTypeWithAutoInfer,                                      |
|    makeTypeOfNodeWithAutoInfer   (nodeStateManagement/types)       |
|  - makeFunctionImplementationsWithAutoInfer (nodeRunner/types)     |
|  - constructNodeOfType   (nodeStateManagement/nodes/...)           |
|  - importExecutionRecord            (utils/importExport)           |
|  - PlaygroundState1.json            (pre-built graph state)        |
|  - graph-state JSON from .storybook/static/graphStates             |
|  - handleShapesMap                  (organisms/ConfigurableNode)   |
|  - ColorPicker                      (molecules/ColorPicker)        |
|  - z (zod)                          (runtime validation)           |
|  - Toaster, toast                   (sonner)                       |
|                                                                    |
|  Defines:                                                          |
|  - Custom example/circuit/color data types (spread with           |
|    ...standardDataTypes)                                           |
|  - Custom node types (data source, validation, transformer, etc.)  |
|  - Function implementations for runner execution                   |
|  - Pre-wired graph topologies (Half Adder, Full Adder, etc.)       |
|                                                                    |
|  Acts as:                                                          |
|  - Integration test for the entire library                         |
|  - Reference implementation for library consumers                  |
|  - Demo for all features: nodes, edges, context menu, runner       |
+------------------------------------------------------------------+
```

The FullGraph story is the most comprehensive integration point in the project.
It exercises:

- Node creation and configuration via node types and data types
- Edge connection with type checking and cycle detection
- Context menu with node-type-aware item generation
- Graph state management (add, remove, update nodes/edges)
- Node runner execution with function implementations
- Import/export of graph state
- Loop and group node structures
