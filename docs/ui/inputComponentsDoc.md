# Input Components

## Overview

The input component system provides inline value-editing widgets that appear
directly on node handles within the node graph. When a handle has
`allowInput=true` and no edge is connected to it, the appropriate input widget
is rendered so users can set default values without needing a separate
properties panel.

The system spans three layers of the component hierarchy:

```
+------------------------------------------+
|  Atoms                                   |
|  - Input (text / number field)           |
|  - Checkbox (boolean toggle)             |
|  - Button (action trigger)               |
+------------------------------------------+
            |
            v
+------------------------------------------+
|  Molecules                               |
|  - SliderNumberInput (slider + input)    |
|  - Select (dropdown via Radix UI)        |
+------------------------------------------+
            |
            v
+------------------------------------------+
|  Organism Integration                    |
|  - ContextAwareInput                     |
|    (picks the right widget per type)     |
|  - RenderInput in ConfigurableNode       |
|    (decides show-input vs show-label)    |
+------------------------------------------+
```

The mapping from data type to widget:

```
underlyingType    Widget rendered
--------------    ---------------------------
"string"          Input (allowOnlyNumbers=false)
"number"          SliderNumberInput
"boolean"         Checkbox + label
"unsupportedDirectly"  (nothing rendered)
```

## Input Atom

**File:** `src/components/atoms/Input/Input.tsx`

A text field that supports both string and number entry through a discriminated
union on the `allowOnlyNumbers` prop.

### Props (InputProps)

The props use a TypeScript discriminated union based on `allowOnlyNumbers`:

| Prop               | Type (string mode)        | Type (number mode)        | Description                          |
| ------------------ | ------------------------- | ------------------------- | ------------------------------------ |
| `value`            | `string`                  | `number`                  | Current value                        |
| `allowOnlyNumbers` | `false` (or omitted)      | `true`                    | Switches between modes               |
| `onChange`         | `(value: string) => void` | `(value: number) => void` | Value change callback                |
| `numberOfDecimals` | N/A (`never`)             | `number` (default `5`)    | Decimal precision                    |
| `placeholder`      | `string`                  | `string`                  | Placeholder text (default `"Input"`) |
| `className`        | `string`                  | `string`                  | CSS class override                   |

### Internal Behavior

```
User focuses input
        |
        v
temporaryValueWhenClicked = current value
        |
   User types
        |
        v
  (number mode?)
   /         \
  yes         no
  |           |
  filter      accept
  non-numeric all chars
  chars       |
        \   /
         v v
 temporaryValueWhenClicked updated
        |
   User clicks outside / presses Enter / blurs
        |
        v
  (number mode?)
   /         \
  yes         no
  |           |
  convert     set value
  to number,  directly
  sanitize    |
  decimals    |
        \   /
         v v
  onChange() fires with final value
  internal state updated
```

Key design decisions:

- The input only commits its value on blur, click-outside, or Enter -- not on
  every keystroke. This prevents intermediate invalid states (e.g., typing "-"
  before a number).
- In number mode, clearing the field and clicking outside cancels the edit
  (reverts to previous value).
- Uses the custom `useClickedOutside` hook for outside-click detection.
- Blocks `onMouseMove` propagation to prevent React Flow drag interference.
- Uses `forwardRef` with a dual-ref pattern (internal state ref + forwarded
  ref).

### Storybook Stories

- `Playground` -- uncontrolled default
- `AllowOnlyNumbers` -- number-only mode
- `Controlled` -- controlled string input
- `ControlledAllowOnlyNumbers` -- controlled number input
- `AdjustableParentWidthWithFullWidth` -- demonstrates `w-full` responsive
  behavior

## SliderNumberInput Molecule

**File:** `src/components/molecules/SliderNumberInput/SliderNumberInput.tsx`

A Blender-inspired compound control that combines a drag slider with a
direct-entry number input. The slider is the default view; clicking it switches
to an `Input` field for precise entry.

### Props (SliderNumberInputProps)

| Prop        | Type                      | Default         | Description                   |
| ----------- | ------------------------- | --------------- | ----------------------------- |
| `name`      | `string`                  | `"Input"`       | Label displayed on the slider |
| `value`     | `number`                  | `0` (internal)  | Current value                 |
| `onChange`  | `(value: number) => void` | no-op           | Value change callback         |
| `className` | `string`                  | --              | CSS class override            |
| `min`       | `number`                  | `undefined`     | Minimum allowed value         |
| `max`       | `number`                  | `undefined`     | Maximum allowed value         |
| `step`      | `number`                  | auto-calculated | Step size for changes         |

### Two-Mode UI

```
+------------------------------------------------------+
|  SLIDER MODE (default)                               |
|                                                      |
|  [<] |  Name            Value.0000  | [>]            |
|       \____ drag area ___/                           |
|       click -> switches to INPUT MODE                |
+------------------------------------------------------+

+------------------------------------------------------+
|  INPUT MODE (after click)                            |
|                                                      |
|  [ text input field, allowOnlyNumbers=true ]         |
|  blur/Enter -> switches back to SLIDER MODE          |
+------------------------------------------------------+
```

### Drag Behavior

The `useDrag` hook provides drag-to-adjust:

1. Mouse movement is converted to a ratio of the element width
2. A cumulative drag ratio accumulates small movements
3. When the ratio exceeds 0.05 AND at least 50ms has passed, a step change fires
4. The step size is auto-calculated from `step`, or from `max - min`, or from
   the current value

### Gradient Fill

When both `min` and `max` are provided, the slider background shows a gradient
fill proportional to the current value's position in the range:

```
min=0, max=100, value=40:
[################........................]
     40% blue         60% gray
```

### Storybook Stories

- `Playground` -- controlled slider with default args
- `AdjustableParentWidthWithFullWidth` -- responsive width testing with long
  names

## Checkbox Atom (Radix UI)

**File:** `src/components/atoms/Checkbox/Checkbox.tsx`

A thin wrapper around `@radix-ui/react-checkbox` with Blender-styled visuals.

### Props (CheckboxProps)

Extends `ComponentProps<typeof CheckboxPrimitive.Root>`:

| Key Prop          | Type                              | Description                |
| ----------------- | --------------------------------- | -------------------------- |
| `checked`         | `boolean \| "indeterminate"`      | Current state (from Radix) |
| `onCheckedChange` | `(checked: CheckedState) => void` | State change callback      |
| `disabled`        | `boolean`                         | Disables interaction       |
| `className`       | `string`                          | CSS class override         |

### Visual States

```
[ ] Unchecked   -> bg-primary-gray, no icon
[x] Checked     -> bg-primary-blue, CheckIcon (lucide)
[-] Indeterminate -> (supported by Radix, filtered out in ContextAwareInput)
```

The component is 28px (`size-7`) with a 4px border-radius and uses Tailwind's
`peer` utility for potential sibling styling.

### Storybook Stories

- `Playground` -- uncontrolled toggle
- `Disabled` -- disabled state
- `Controlled` -- controlled with `onCheckedChange`

## Button Atom

**File:** `src/components/atoms/Button/Button.tsx`

A general-purpose button with Blender-inspired color variants. While not
directly used as an input widget on nodes, it is a building block for
SliderNumberInput's increment/decrement controls and other interactive elements.

### Props (ButtonProps)

Extends `ComponentProps<'button'>` plus `VariantProps<typeof buttonVariants>`:

| Prop               | Type                                                                              | Default  | Description                      |
| ------------------ | --------------------------------------------------------------------------------- | -------- | -------------------------------- |
| `color`            | `"dark" \| "lightNonPriority" \| "lightPriority" \| "lightParentGroupBasedHover"` | `"dark"` | Color variant                    |
| `applyHoverStyles` | `boolean`                                                                         | `true`   | Whether to apply hover effects   |
| `asChild`          | `boolean`                                                                         | `false`  | Render as child via Radix `Slot` |

### Color Variants and Hover Behavior

```
Variant                        Base BG              Hover BG
-----------------------------  -------------------  ---------------------------------
dark                           secondary-black      primary-dark-gray
lightNonPriority               primary-gray         secondary-light-gray overlay
lightPriority                  primary-gray         primary-light-gray overlay
lightParentGroupBasedHover     primary-gray         primary-light-gray overlay +
                                                    group-hover secondary overlay
```

The `lightParentGroupBasedHover` variant is used specifically by
SliderNumberInput's chevron buttons, enabling coordinated hover effects across
the slider group.

Hover styles can be disabled (e.g., during drag) via `applyHoverStyles={false}`,
implemented through `class-variance-authority` compound variants.

### Storybook Stories

- `Playground` -- default dark button
- `AdjustableParentWidthWithFullWidth` -- responsive text truncation test

## Select Molecule

**File:** `src/components/molecules/Select/Select.tsx`

A full dropdown select built on `@radix-ui/react-select`. Composed of multiple
sub-components following the Radix compound component pattern.

### Sub-Components

| Component                | Wraps                              | Purpose                               |
| ------------------------ | ---------------------------------- | ------------------------------------- |
| `Select`                 | `SelectPrimitive.Root`             | Root context provider                 |
| `SelectTrigger`          | `SelectPrimitive.Trigger`          | Button that opens dropdown            |
| `SelectValue`            | `SelectPrimitive.Value`            | Displays selected value / placeholder |
| `SelectContent`          | `SelectPrimitive.Content`          | Dropdown panel (portaled)             |
| `SelectItem`             | `SelectPrimitive.Item`             | Individual option                     |
| `SelectLabel`            | `SelectPrimitive.Label`            | Group label                           |
| `SelectGroup`            | `SelectPrimitive.Group`            | Option group container                |
| `SelectSeparator`        | `SelectPrimitive.Separator`        | Visual divider                        |
| `SelectScrollUpButton`   | `SelectPrimitive.ScrollUpButton`   | Scroll indicator (up)                 |
| `SelectScrollDownButton` | `SelectPrimitive.ScrollDownButton` | Scroll indicator (down)               |

### Usage Pattern

```
<Select value={val} onValueChange={setVal}>
  <SelectTrigger>
    <SelectValue placeholder="Choose..." />
  </SelectTrigger>
  <SelectContent>
    <SelectGroup>
      <SelectLabel>Category</SelectLabel>
      <SelectItem value="a">Option A</SelectItem>
      <SelectItem value="b">Option B</SelectItem>
    </SelectGroup>
  </SelectContent>
</Select>
```

### Styling

- Trigger: 44px height, dark background with border, chevron icon
- Content: portaled, animated (fade + zoom + slide), dark theme
- Items: hover/focus highlight at `#3F3F3F`, checkmark indicator for selected
  item
- All sub-components accept `className` for overrides

**Note:** Select is not currently wired into ContextAwareInput. It exists as a
standalone molecule for use in other contexts (e.g., settings panels, toolbar
dropdowns).

## Integration with ConfigurableNode (ContextAwareInput)

**File:**
`src/components/organisms/ConfigurableNode/SupportingSubcomponents/ContextAwareInput.tsx`

ContextAwareInput is the bridge between the input components and the node graph.
It has two responsibilities:

1. **Type dispatch** -- pick the right widget based on `input.type`
2. **ReactFlow integration** -- update node data in the ReactFlow store when
   values change

### Architecture

```
ConfigurableNode
  |
  +-- RenderInput (per handle)
        |
        +-- checks: allowInput && !isConnected
        |     |
        |     +-- true  -> ContextAwareInput
        |     +-- false -> plain text label
        |
        +-- ContextAwareInput
              |
              +-- isCurrentlyInsideReactFlow?
                    |
                    +-- true  -> ReactFlowAwareInput
                    |            (updates ReactFlow node store)
                    +-- false -> Direct input rendering
                                 (calls onChange only, for Storybook)
```

### ReactFlowAwareInput

When inside ReactFlow, every value change triggers:

1. The input's `onChange` callback (if provided)
2. `reactflowContext.setNodes()` to update the handle's value in the node data
   via `updateHandleInNodeDataMatchingHandleId`

This ensures the ReactFlow state stays in sync with the input widget.

### Type-to-Widget Mapping in ContextAwareInput

```
input.type      Component                  Props passed
-----------     -------------------------  ----------------------------
"string"        <Input>                    allowOnlyNumbers=false,
                                           placeholder=input.name,
                                           value, onChange, className
"number"        <SliderNumberInput>        name=input.name,
                                           value, onChange, className
"boolean"       <Checkbox> + <p> label     checked=input.value,
                                           onCheckedChange (filters
                                           "indeterminate")
other           null (nothing rendered)
```

## How allowInput Triggers Input Display

The decision to show an input widget vs. a plain text label happens in
`RenderInput` inside `ConfigurableNode.tsx` (line 253):

```typescript
const shouldShowInput = input.allowInput && !isConnected;
```

The full decision flow:

```
Handle configuration
  |
  +-- allowInput = false?
  |     |
  |     +-- Always show text label (input.name)
  |
  +-- allowInput = true?
        |
        +-- Is an edge connected to this handle?
        |     (checked via useNodeConnections)
        |     |
        |     +-- yes -> Show text label
        |     |          (edge provides the value, no manual input needed)
        |     +-- no  -> Show ContextAwareInput widget
        |                (user can set a default value)
```

When `shouldShowInput` is true:

- The row padding changes from `py-3` to `py-1` to accommodate the input widget
- The text label is hidden
- The ContextAwareInput widget fills the available width (`w-full`)

When `shouldShowInput` is false:

- A truncated text label shows `input.name`
- The handle dot is still visible for connection

## Limitations and Deprecated Patterns

1. **No Select integration in ContextAwareInput** -- The Select molecule exists
   but is not mapped to any `input.type` in ContextAwareInput. Enum-like inputs
   would need a new type variant (e.g., `type: "select"`) to be supported on
   nodes.

2. **`unsupportedDirectly` type renders nothing** -- Inputs with
   `type: "unsupportedDirectly"` are declared in ConfigurableNodeInput but
   produce no widget in ContextAwareInput. They exist for handles that can
   receive connections but have no meaningful inline editor.

3. **Commit-on-blur only for Input** -- The Input atom commits values only on
   blur/Enter/click-outside, not on every keystroke. This is intentional for
   number editing but may surprise users expecting live updates for string
   inputs.

4. **No min/max passthrough for SliderNumberInput** -- ContextAwareInput does
   not forward `min`, `max`, or `step` constraints to SliderNumberInput. These
   constraints are available on the component but not exposed through
   ConfigurableNodeInput's type definition.

5. **Indeterminate checkbox state filtered** -- ContextAwareInput explicitly
   filters out the `"indeterminate"` state from Radix checkbox, only passing
   `true`/`false` to `onChange`. The boolean type in ConfigurableNodeInput does
   not support a tri-state.

6. **Dual rendering paths** -- ContextAwareInput has two near-identical code
   paths (ReactFlow-aware and standalone). This duplication exists to support
   both in-graph and Storybook/isolated usage.

## Relationships with Other Features

### -> [ConfigurableNode (ContextAwareInput)](configurableNodeDoc.md)

ContextAwareInput is a supporting subcomponent of ConfigurableNode. It is
rendered by `RenderInput` when a handle has `allowInput=true` and no edge is
connected. The ConfigurableNode controls the layout, handle positioning, and
connection detection; ContextAwareInput only handles the widget rendering and
value updates.

### -> [Handles (allowInput flag)](../core/handlesDoc.md)

The `allowInput` flag on `ConfigurableNodeInput` is the opt-in mechanism. Each
handle independently declares whether it supports inline editing. The handle's
`type` field (`string`, `number`, `boolean`) determines which widget appears.
Connection state is checked at runtime via `useNodeConnections` to dynamically
toggle between input widget and label.

### -> [Data Types (underlyingType determines input type)](../core/dataTypesDoc.md)

The `ConfigurableNodeInput.type` field (`string`, `number`, `boolean`,
`unsupportedDirectly`) is derived from the data type system's `underlyingType`.
The standard node definitions in `standardNodes.ts` map data types to these
input types when building node configurations. The `underlyingType` of a
`DataType` determines what value the handle carries and therefore what input
widget is appropriate.

### -> [State Management (UPDATE_INPUT_VALUE)](../core/stateManagementDoc.md)

When inside ReactFlow, value changes flow through two paths:

1. **Direct ReactFlow update** -- `ReactFlowAwareInput` calls
   `reactflowContext.setNodes()` with `updateHandleInNodeDataMatchingHandleId`
   to mutate the handle's value in the node store
2. **Reducer action** -- The `UPDATE_INPUT_VALUE` action in `mainReducer.ts`
   provides a reducer-based alternative for updating input values through the
   centralized state management system

### -> [Radix UI (external)](../external/radixUIDoc.md)

Two input components depend on Radix UI primitives:

- **Checkbox** wraps `@radix-ui/react-checkbox` for accessible toggle behavior,
  keyboard handling, and checked/indeterminate state management
- **Select** wraps `@radix-ui/react-select` for accessible dropdown behavior,
  keyboard navigation, portaled content, and scroll management
- **Button** uses `@radix-ui/react-slot` for the `asChild` composition pattern
