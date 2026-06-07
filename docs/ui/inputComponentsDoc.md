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
|  - Select (dropdown via floating-ui)     |
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

The mapping from `ConfigurableNodeInput.type` to widget:

```
input.type             Widget rendered
-------------------    ----------------------------------------
"string"               Input (allowOnlyNumbers=false)
"string" + allowedStrings   Select (dropdown of allowed values)
"number"               SliderNumberInput
"boolean"              Checkbox + label
"unsupportedDirectly"  Custom component from the input registry
                       (keyed by dataType.dataTypeUniqueId);
                       nothing if no component is registered
```

The `type` field is part of a discriminated union on `ConfigurableNodeInput`
(see `src/components/organisms/ConfigurableNode/ConfigurableNode.tsx` ›
`ConfigurableNodeInput`), which also carries the per-type `value` and `onChange`
signatures.

## Input Atom

**File:** `src/components/atoms/Input/Input.tsx` › `Input`

A text field that supports both string and number entry through a discriminated
union on the `allowOnlyNumbers` prop. It is exported from `@/components/atoms`.

### Props (InputProps)

The props are a TypeScript discriminated union: a base object (always present)
intersected with one of two `allowOnlyNumbers` branches.

Base props (both modes):

| Prop          | Type                  | Default    | Description                                                       |
| ------------- | --------------------- | ---------- | ----------------------------------------------------------------- |
| `placeholder` | `string`              | `"Input"`  | Placeholder text                                                  |
| `className`   | `string`              | —          | CSS class override (merged via `cn`)                              |
| `size`        | `'normal' \| 'small'` | `'normal'` | `normal` is the canvas-friendly 2x default; `small` is compact    |
| `liveUpdate`  | `boolean`             | `false`    | When true, fires `onChange` on every keystroke (string mode only) |

Discriminated branches:

| Prop               | String mode (`allowOnlyNumbers` false/omitted) | Number mode (`allowOnlyNumbers: true`) |
| ------------------ | ---------------------------------------------- | -------------------------------------- |
| `allowOnlyNumbers` | `false` (or omitted)                           | `true`                                 |
| `value`            | `string` (optional)                            | `number` (optional)                    |
| `onChange`         | `(value: string) => void` (optional)           | `(value: number) => void` (optional)   |
| `numberOfDecimals` | `never` (must not be provided)                 | `number` (default `5`)                 |

### Sizing

`size` switches the height and typography (it does not change behavior):

- `normal`: `h-[44px]`, `px-4`, `text-[27px]` / `leading-[27px]`
- `small`: `h-[28px]`, `px-3`, `text-[16px]` / `leading-[16px]`

### Internal Behavior

```
User focuses input  (onFocus -> isFocusedRef = true)
        |
        v
temporaryValueWhenClicked tracks what the user types
        |
   User types (handleTemporaryValueChange)
        |
        v
  (number mode?)
   /         \
  yes         no
  |           |
  reject keystrokes  accept all chars;
  matching /[^0-9\.\-]/   if liveUpdate -> onChange(value)
        \   /
         v v
 temporaryValueWhenClicked updated
        |
   User blurs / presses Enter / clicks outside
        |
        v   (handleSettingValueFromTemporaryValue)
  (number mode?)
   /         \
  yes         no
  |           |
  convertStringToNumber, set value
  sanitizeNumberToShowAsText  directly
  (decimals)  |
        \   /
         v v
  onChange() fires with final value, internal state synced
```

Key design decisions:

- The input commits its value on blur, click-outside, or Enter -- not on every
  keystroke -- **except** when `liveUpdate` is true in string mode, where
  `onChange` also fires per keystroke. Number mode never live-updates (it always
  defers to blur/Enter/click-outside).
- In number mode, an empty field falls back to the current value
  (`temporaryValueWhenClicked || valueToUse.toString()`), so clearing the field
  and committing keeps the previous value rather than producing `NaN`.
- Number conversion uses `convertStringToNumber` and display formatting uses
  `sanitizeNumberToShowAsText(value, numberOfDecimals ?? 5)`
  (`src/utils/conversions.ts` › `sanitizeNumberToShowAsText`), which strips
  trailing zeros and the dangling decimal point.
- A `useEffect` re-syncs `temporaryValueWhenClicked` from the `value` prop when
  the parent changes it, but only while the input is **not** focused
  (`isFocusedRef`), to avoid clobbering in-progress typing.
- Uses the custom `useClickedOutside` hook (`src/hooks/useClickedOutside.ts` ›
  `useClickedOutside`) for outside-click detection.
- Blocks `onMouseMove` (preventDefault + stopPropagation) to prevent ReactFlow
  drag interference; `onBlur` also stops propagation.
- Uses `forwardRef` with a dual-ref pattern: it stores the node in internal
  state (`setInputRef`, needed by `useClickedOutside`) and forwards it to the
  external `ref` (function or object form).

### Storybook Stories (`title: 'Atoms/Input'`)

- `Playground` -- empty args (string mode default)
- `AllowOnlyNumbers` -- number-only mode (`allowOnlyNumbers: true`)
- `Controlled` -- controlled string input via `useArgs`
- `ControlledAllowOnlyNumbers` -- controlled number input via `useArgs`
- `AdjustableParentWidthWithFullWidth` -- demonstrates `w-full` responsive
  behavior inside a width-adjustable parent

## SliderNumberInput Molecule

**File:** `src/components/molecules/SliderNumberInput/SliderNumberInput.tsx` ›
`SliderNumberInput`

A Blender-inspired compound control that combines a drag slider with a
direct-entry number input. The slider is the default view; clicking it switches
to an `Input` field (with `allowOnlyNumbers`) for precise entry. Exported from
`@/components/molecules`.

### Props (SliderNumberInputProps)

| Prop        | Type                      | Default                     | Description                                           |
| ----------- | ------------------------- | --------------------------- | ----------------------------------------------------- |
| `name`      | `string`                  | `"Input"`                   | Label displayed on the slider                         |
| `value`     | `number`                  | `0` (internal `valueInner`) | Current value                                         |
| `onChange`  | `(value: number) => void` | no-op (`() => {}`)          | Value change callback                                 |
| `className` | `string`                  | —                           | CSS class override                                    |
| `min`       | `number`                  | `undefined`                 | Minimum allowed value (clamps when `newValue <= min`) |
| `max`       | `number`                  | `undefined`                 | Maximum allowed value (clamps when `newValue >= max`) |
| `step`      | `number`                  | auto-calculated             | Step size for a full-width drag                       |
| `size`      | `'normal' \| 'small'`     | `'normal'`                  | Visual density (`small` is compact for toolbars)      |
| `decimals`  | `number`                  | `4` (normal) / `1` (small)  | Decimal places shown via `value.toFixed(decimals)`    |

The displayed decimals (`displayDecimals = decimals ?? (isSmall ? 1 : 4)`) are
also passed to the `Input` as `numberOfDecimals` while in input mode.

### Two-Mode UI

```
+------------------------------------------------------+
|  SLIDER MODE (default, !isClicked)                   |
|                                                      |
|  [<]  |  Name             Value  | [>]               |
|       \____ drag area (dragRef) _/                   |
|       click -> handleSwitchFromSliderToInput()       |
+------------------------------------------------------+

+------------------------------------------------------+
|  INPUT MODE (isClicked)                              |
|                                                      |
|  [ <Input allowOnlyNumbers numberOfDecimals=...> ]   |
|  onChange (blur/Enter) -> handleSwitchFromInputToSlider |
|  -> applies the delta and returns to SLIDER MODE     |
+------------------------------------------------------+
```

The `[<]` / `[>]` chevrons are `Button`s (`color='lightParentGroupBasedHover'`)
that call `handleDecrement(0.1)` / `handleIncrement(0.1)` -- i.e. a 10% step
nudge. The center drag area is also a `Button` carrying the `dragRef`.

### Drag Behavior

The `useDrag` hook (`src/hooks/useDrag.ts` › `useDrag`) provides drag-to-adjust:

1. On each `onMove`, horizontal movement is converted to a ratio of `width + 60`
   (`distanceRatio = movementX / (width + 60)`).
2. A `cumulativeDragRatio` ref accumulates these small movements.
3. When `|cumulativeDragRatio| > 0.05` **and** at least `50ms` has elapsed since
   the last applied tick, a change of `stepToUse * cumulativeDragRatio` fires
   and the accumulator resets.
4. `useDrag` distinguishes click from drag via `clickThreshold` (set to `2` px
   here): a small-movement mouseup triggers `onClick` (switch to input mode).

The effective `stepToUse` is computed in a `useEffect`, in priority order:

1. Explicit `step` prop -> `Math.abs(step)`.
2. Else if both `min` and `max` are set -> `Math.abs(max - min)`.
3. Else -> `Math.max(Math.abs(valueToUse || 1), 10^-displayDecimals)`, so zero
   or tiny values can't trap the drag at zero.

### Gradient Fill

When both `min` and `max` are provided (and `max !== min`), the slider
background shows a gradient fill proportional to the value's position:

```
valuePercentage = ((value - min) / (max - min)) * 100
background = linear-gradient(90deg, #4772b3 <pct>%, #545454 <pct>%)

min=0, max=100, value=40:
[################........................]
     40% blue (#4772b3)   60% gray (#545454)
```

When `min`/`max` are not both set, `valuePercentage` is `-1` and no gradient is
applied.

### Storybook Stories (`title: 'Molecules/SliderNumberInput'`)

- `Playground` -- controlled slider via `useArgs` (default `value: 7.2`)
- `AdjustableParentWidthWithFullWidth` -- responsive width testing with long
  names
- `SizeComparison` -- normal vs `small` side by side
- `SmallInteger`, `SmallFloat` -- `size="small"` integer/float examples
- `EdgeCaseSmallValue`, `EdgeCaseZeroValue` -- drag behavior near tiny/zero
  values
- `NoConstraints` -- no `min`/`max` (fallback step calculation)
- `WithRange`, `SmallWithRange` -- `min`/`max` set (gradient fill active)

## Checkbox Atom (Radix UI)

**File:** `src/components/atoms/Checkbox/Checkbox.tsx` › `Checkbox`

A thin wrapper around `@radix-ui/react-checkbox` with Blender-styled visuals. It
is **not** re-exported from the `@/components/atoms` barrel (its
`Checkbox/index.ts` is empty); the only access path is the direct import
`@/components/atoms/Checkbox/Checkbox`, which is how `ContextAwareInput`
consumes it.

### Props (CheckboxProps)

`CheckboxProps = ComponentProps<typeof CheckboxPrimitive.Root> & { className?: string }`,
so every Radix Checkbox prop is supported:

| Key Prop          | Type                              | Description                |
| ----------------- | --------------------------------- | -------------------------- |
| `checked`         | `boolean \| "indeterminate"`      | Current state (from Radix) |
| `onCheckedChange` | `(checked: CheckedState) => void` | State change callback      |
| `disabled`        | `boolean`                         | Disables interaction       |
| `className`       | `string`                          | CSS class override         |

The root carries `data-slot="checkbox"`; the indicator carries
`data-slot="checkbox-indicator"`.

### Visual States

```
[ ] Unchecked       -> bg-primary-gray, no icon
[x] Checked         -> data-[state=checked]:bg-primary-blue + CheckIcon (lucide,
                       size-6, strokeWidth 3.5)
[-] Indeterminate   -> supported by Radix, but ContextAwareInput filters it out
                       (never forwarded to the boolean input's onChange)
```

The box is `size-7` (28px) with `rounded-[4px]` and uses Tailwind's `peer`
utility plus `focus-visible:ring-[3px]` and `aria-invalid` styling.

### Storybook Stories (`title: 'Atoms/Checkbox'`)

- `Playground` -- uncontrolled toggle (empty args)
- `Disabled` -- disabled state
- `Controlled` -- controlled with `onCheckedChange` (via `useArgs`)

## Button Atom

**File:** `src/components/atoms/Button/Button.tsx` › `Button`

A general-purpose button with Blender-inspired color variants, built with
`class-variance-authority` (CVA). It is not used as a node input widget itself,
but it is a building block for `SliderNumberInput`'s chevron controls and for
panel toggles in `ConfigurableNode`. Exported from `@/components/atoms`.

### Props (ButtonProps)

`ButtonProps = ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }`:

| Prop               | Type                                                                              | Default    | Description                      |
| ------------------ | --------------------------------------------------------------------------------- | ---------- | -------------------------------- |
| `color`            | `"dark" \| "lightNonPriority" \| "lightPriority" \| "lightParentGroupBasedHover"` | `"dark"`   | Color variant                    |
| `size`             | `"normal" \| "small"`                                                             | `"normal"` | Padding/typography density       |
| `applyHoverStyles` | `boolean`                                                                         | `true`     | Whether to apply hover effects   |
| `asChild`          | `boolean`                                                                         | `false`    | Render as child via Radix `Slot` |
| ...rest            | `ComponentProps<'button'>`                                                        | —          | All standard button attributes   |

The button carries `data-slot="button"`.

### Size Variants

| Size     | Classes                                           |
| -------- | ------------------------------------------------- |
| `normal` | `py-2 px-4 text-[27px] leading-[27px]`            |
| `small`  | `py-2 px-3 text-[16px] leading-[13px] rounded-sm` |

### Color Variants and Hover Behavior

```
Variant                      Base BG          Hover BG (applyHoverStyles=true)
---------------------------  ---------------  ----------------------------------------
dark                         secondary-black  primary-dark-gray
lightNonPriority             primary-gray     secondary-light-gray overlay over primary-gray
lightPriority                primary-gray     primary-light-gray overlay over primary-gray
lightParentGroupBasedHover   primary-gray     primary-light-gray overlay (self-hover) +
                                              group-hover/lightParentGroupBasedHover
                                              secondary-light-gray overlay
```

The `lightParentGroupBasedHover` variant is used by SliderNumberInput's chevron
and center buttons, enabling coordinated hover across the slider group (the
group is named `group/lightParentGroupBasedHover` on the slider container).

Hover styles can be disabled (e.g., during drag) via `applyHoverStyles={false}`.
The actual hover classes live in CVA `compoundVariants` keyed on `color` +
`applyHoverStyles: true`.

### Storybook Stories (`title: 'Atoms/Button'`)

- `Playground` -- default dark button (empty args; `argTypes` exposes only
  `dark`, `lightNonPriority`, `lightPriority` in the control)
- `AdjustableParentWidthWithFullWidth` -- responsive text truncation test

## Select Molecule

**File:** `src/components/molecules/Select/Select.tsx` › `Select`

A dropdown select built on **`@floating-ui/react`** (not Radix). It uses
`useFloating` with `offset` / `flip` / `size` middleware, `useClick`,
`useDismiss`, `useRole`, `useListNavigation`, and `useTransitionStyles`, and
manages selection through a `SelectContext` plus an `ItemRegistryContext` that
tracks item values and labels. Exported from `@/components/molecules`.

### Root Props (SelectProps)

| Prop            | Type                                   | Default    | Description                                                                |
| --------------- | -------------------------------------- | ---------- | -------------------------------------------------------------------------- |
| `children`      | `ReactNode`                            | —          | Trigger + content composition                                              |
| `value`         | `string`                               | —          | Controlled value (presence makes it controlled)                            |
| `defaultValue`  | `string`                               | —          | Uncontrolled initial value                                                 |
| `onValueChange` | `(value: string \| undefined) => void` | —          | Fires with the new value, or `undefined` when deselected                   |
| `disabled`      | `boolean`                              | —          | Disables opening                                                           |
| `allowDeselect` | `boolean`                              | `false`    | Clicking the selected item again clears the value (emits `undefined`)      |
| `renderInline`  | `boolean`                              | `false`    | Render the dropdown inline (absolute, not portaled) — used inside RF nodes |
| `size`          | `SelectSize`                           | `'normal'` | `'normal' \| 'small' \| 'compact'` density variant                         |

### Sub-Components

| Component               | Purpose                                                               |
| ----------------------- | --------------------------------------------------------------------- |
| `Select`                | Root: owns floating context, selection state, item registry           |
| `SelectTrigger`         | `<button>` reference element that opens the dropdown; renders chevron |
| `SelectValue`           | Shows selected label / placeholder; can flag an unsupported value     |
| `SelectContent`         | Floating panel; scans children to register item values/labels         |
| `SelectItem`            | Individual option (`value`, optional `disabled`)                      |
| `SelectLabel`           | Group label (non-interactive heading)                                 |
| `SelectSeparator`       | Visual divider                                                        |
| `SelectGroup`           | `role="group"` wrapper                                                |
| `SelectUnsupportedItem` | Renders only when the current value is **not** in the option list;    |
|                         | clicking it re-selects (and visually offers removal via an `X` icon)  |

> There are **no** `SelectScrollUpButton` / `SelectScrollDownButton` components.
> Scrolling is handled by an overflow container in `SelectContent`
> (`overflow-y-auto`, `maxHeight: 384`), and the floating `size` middleware caps
> the panel height to `min(availableHeight, 384)`.

Exported value names: `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`,
`SelectItem`, `SelectLabel`, `SelectSeparator`, `SelectGroup`,
`SelectUnsupportedItem`. Exported types include `SelectProps` and `SelectSize`.

### SelectValue / SelectItem details

- `SelectValue` accepts `placeholder`, `className`, and `unsupportedLabel`. When
  the current value is non-empty and not present in the registry, it renders the
  value in red with the `unsupportedLabel` suffix.
- `SelectItem` looks up its own index from the registry, shows a `CheckIcon`
  when selected, and highlights `bg-[#3F3F3F]` when keyboard-active.

### Usage Pattern

```tsx
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectItem,
} from '@/components/molecules';

<Select value={val} onValueChange={(next) => setVal(next ?? '')} allowDeselect>
  <SelectTrigger>
    <SelectValue placeholder='Choose...' />
  </SelectTrigger>
  <SelectContent>
    <SelectGroup>
      <SelectLabel>Category</SelectLabel>
      <SelectItem value='a'>Option A</SelectItem>
      <SelectItem value='b'>Option B</SelectItem>
    </SelectGroup>
  </SelectContent>
</Select>;
```

### Styling (size-dependent)

- Trigger height: `h-[44px]` (normal), `h-[28px]` (small), `h-[22px]` (compact),
  each with matching typography and rounding; dark background with border and a
  trailing chevron.
- Content: animated (opacity + scale via `useTransitionStyles`, 150ms), dark
  panel (`bg-[#181818]`), portaled by default or rendered inline when
  `renderInline`.
- Items: active/hover highlight at `#3F3F3F`, checkmark for the selected item.
- All sub-components accept `className` for overrides.

### Storybook Stories (`title: 'Molecules/Select'`)

`Playground`, `Controlled`, `WithDeselect`, `WithUnsupportedValue`,
`WithGroups`, `WithSeparators`, `Disabled`, `WithDefaultValue`,
`AdjustableParentWidth`.

## Integration with ConfigurableNode (ContextAwareInput)

**File:**
`src/components/organisms/ConfigurableNode/SupportingSubcomponents/ContextAwareInput.tsx`
› `ContextAwareInput`

ContextAwareInput is the bridge between the input components and the node graph.
It has two responsibilities:

1. **Type dispatch** -- pick the right widget based on `input.type` (and, for
   strings, on whether `allowedStrings` is provided).
2. **State integration** -- when inside the graph, push value changes into the
   centralized FullGraph state via a dispatched action.

### Architecture

```
ConfigurableNode
  |
  +-- RenderInput (per handle)
        |
        +-- shouldShowInput = input.allowInput && !isConnected
        |     |
        |     +-- true  -> ContextAwareInput
        |     +-- false -> plain text label
        |
        +-- ContextAwareInput
              |
              +-- isCurrentlyInsideReactFlow?
                    |
                    +-- true  -> ReactFlowAwareInput
                    |            (dispatches UPDATE_INPUT_VALUE)
                    +-- false -> Direct input rendering
                                 (calls input.onChange only, for Storybook)
```

`ContextAwareInput({ input, isCurrentlyInsideReactFlow })` delegates to
`ReactFlowAwareInput` when inside the graph; otherwise it renders the same
widget set but wires only `input.onChange` (no dispatch). Both are exported,
along with their prop types `ContextAwareInputProps` and
`ReactFlowAwareInputProps`.

### ReactFlowAwareInput

`ReactFlowAwareInput` resolves the current node id with `useNodeId()` (from
`@xyflow/react`) and reads the FullGraph context (`FullGraphContext`,
`src/components/organisms/FullGraph/FullGraphState.ts` › `FullGraphContext`).
Every value change calls `updateNodeValue(newValue)`, which dispatches:

```typescript
allProps.dispatch({
  type: actionTypesMap.UPDATE_INPUT_VALUE,
  payload: {
    nodeId,
    inputId: input.id,
    value: newValue as string | number,
  },
});
```

It also calls the per-input `input.onChange?.(newValue)` for consumers that want
a direct callback. There is **no** direct `setNodes(...)` /
`updateHandleInNodeDataMatchingHandleId(...)` call from this component anymore —
the mutation happens centrally inside the reducer/plan pipeline (see the State
Management relationship below).

### Type-to-Widget Mapping in ContextAwareInput

```
input.type                  Component                       Notes
--------------------------  ------------------------------  -------------------------------
"string" + allowedStrings   <Select> of allowed values      allowDeselect; in the RF path
(length > 0)                                                 renderInline (StringSelectForNode);
                                                             SelectUnsupportedItem + SelectValue
                                                             unsupportedLabel="unsupported"
"string" (no allowedStrings) <Input allowOnlyNumbers=false>  placeholder=input.name, w-full
"number"                    <SliderNumberInput>             name=input.name, w-full
"boolean"                   <Checkbox> + <p> label          "indeterminate" filtered out
"unsupportedDirectly"       registry[dataType               value, onChange, name, dataTypeId;
   (+ input.dataType)        .dataTypeUniqueId]              null if no component registered
otherwise                   null
```

`StringSelectForNode` is a small helper (inside this file) used by the RF path:
it renders a `Select` with `allowDeselect` and `renderInline` so the dropdown
inherits the canvas transform when used inside a ReactFlow node.

### Custom inputs for `unsupportedDirectly` (input registry)

`unsupportedDirectly` handles are no longer always blank. ContextAwareInput
reads a registry via `useInputComponentRegistry()`
(`src/components/organisms/FullGraph/InputComponentRegistryContext.ts` ›
`useInputComponentRegistry`) and, if a component is registered under
`input.dataType.dataTypeUniqueId`, renders it with:

```typescript
type InputComponentProps = {
  value: unknown;
  onChange: (value: unknown) => void;
  name: string;
  dataTypeId: string;
};
```

The registry is supplied through FullGraph's `inputComponents` prop
(`InputComponentRegistry<DataTypeUniqueId>`), provided to the tree via
`InputComponentRegistryContext.Provider` in `FullGraph.tsx`. If no component is
registered for that data type (or `input.dataType` is absent), the widget falls
through to `null`.

## How allowInput Triggers Input Display

The decision to show an input widget vs. a plain text label happens in
`RenderInput` inside `ConfigurableNode.tsx` (the check is at
`src/components/organisms/ConfigurableNode/ConfigurableNode.tsx` ›
`RenderInput`):

```typescript
const shouldShowInput = input.allowInput && !isConnected;
```

Connection state is computed only inside ReactFlow:
`useNodeConnections({ handleId: input.id })` is read and `isConnected` is true
when some connection has `targetHandle === input.id`. The full decision flow:

```
Handle configuration
  |
  +-- allowInput = false / undefined?
  |     |
  |     +-- Always show text label (input.name, or U+200B if empty)
  |
  +-- allowInput = true?
        |
        +-- Is an edge connected to this handle (inside ReactFlow)?
        |     |
        |     +-- yes -> Show text label
        |     |          (edge provides the value, no manual input needed)
        |     +-- no  -> Show ContextAwareInput widget
        |                (user can set a default value)
```

When `shouldShowInput` is true:

- The row padding tightens from `py-3` to `py-1` to accommodate the widget.
- The text label is hidden.
- The ContextAwareInput widget fills the available width (the wrapper is
  `flex-1 w-full`).

When `shouldShowInput` is false:

- A truncated text label shows `input.name` (or a zero-width space if empty).
- The handle dot (`ContextAwareHandle`) is still rendered for connection.

## Limitations and Deprecated Patterns

1. **Select integration is string-only via `allowedStrings`** -- A `string`
   input renders a `Select` only when `allowedStrings` has at least one entry.
   There is no separate `"select"` / enum `type`; number and boolean types do
   not use Select.

2. **`unsupportedDirectly` requires a registered component** -- Inputs with
   `type: "unsupportedDirectly"` render a custom widget only if a component is
   registered for their `dataType.dataTypeUniqueId` via FullGraph's
   `inputComponents` prop. Otherwise nothing is rendered (they can still receive
   connections).

3. **Commit-on-blur is the default for Input** -- The Input atom commits on
   blur/Enter/click-outside, not per keystroke. The exception is string mode
   with `liveUpdate` (per-keystroke `onChange`); number mode never live-updates.

4. **No min/max passthrough for SliderNumberInput on nodes** --
   ContextAwareInput forwards only `name`, `value`, `onChange`, and `className`
   to `SliderNumberInput`. The `min` / `max` / `step` / `size` / `decimals`
   props exist on the component but are not part of `ConfigurableNodeInput`'s
   number variant, so node handles can't constrain the slider range.

5. **Indeterminate checkbox state filtered** -- For boolean inputs,
   ContextAwareInput passes `onCheckedChange` through only when the value is not
   `"indeterminate"`; the boolean type does not support a tri-state.

6. **Dual rendering paths** -- ContextAwareInput has two near-identical branches
   (ReactFlow-aware vs. standalone). The standalone path omits dispatch and is
   used for Storybook/isolated rendering; the only structural difference is the
   RF path's `renderInline` Select and the `updateNodeValue` dispatch.

## Relationships with Other Features

### -> [ConfigurableNode (ContextAwareInput)](configurableNodeDoc.md)

ContextAwareInput is a supporting subcomponent of ConfigurableNode. It is
rendered by `RenderInput` when a handle has `allowInput=true` and no edge is
connected. ConfigurableNode controls the layout, handle positioning, and
connection detection; ContextAwareInput handles widget selection and value
propagation.

### -> [Handles (allowInput flag)](../core/handlesDoc.md)

The `allowInput` flag on `ConfigurableNodeInput` is the opt-in mechanism. Each
handle independently declares whether it supports inline editing. The handle's
`type` field (`string`, `number`, `boolean`, `unsupportedDirectly`) plus
`allowedStrings` (for strings) determines which widget appears. Connection state
is checked at runtime via `useNodeConnections` to toggle between widget and
label.

### -> [Data Types (underlyingType determines input type)](../core/dataTypesDoc.md)

`ConfigurableNodeInput.type` is derived from the data type system's
`underlyingType`. The standard node definitions map data types to these input
types when building node configurations, and an input's
`dataType.dataTypeUniqueId` is the key used to look up a custom component in the
input registry for `unsupportedDirectly` handles.

### -> [State Management (UPDATE_INPUT_VALUE)](../core/stateManagementDoc.md)

Inside the graph, value changes flow through the centralized pipeline rather
than a direct ReactFlow store write:

1. `ReactFlowAwareInput` dispatches
   `{ type: actionTypesMap.UPDATE_INPUT_VALUE, payload: { nodeId, inputId, value } }`.
2. The action is validated
   (`src/utils/nodeStateManagement/planApply/validators.ts` › `validateAction`,
   the `UPDATE_INPUT_VALUE` case produces an `UpdateInputValuePlan`).
3. `applyPlan` (`src/utils/nodeStateManagement/planApply/applyPlan.ts` ›
   `applyPlan`, `case 'UPDATE_INPUT_VALUE'`) looks up the handle via
   `getHandleFromNodeDataMatchingHandleId(inputId, targetNode.data)` and writes
   `handleResult.value.value = plan.value` on the Immer draft.
4. `planToDetail` (`src/utils/nodeStateManagement/graphEvent.ts` ›
   `planToDetail`) emits an `UPDATE_INPUT_VALUE` graph event
   (`{ kind, nodeId, inputId, value }`).

The action's payload `value` type is `string | number`.

### -> [Radix UI / floating-ui (external)](../external/radixUIDoc.md)

Input component external dependencies:

- **Checkbox** wraps `@radix-ui/react-checkbox` for accessible toggle behavior
  and checked/indeterminate state management.
- **Button** uses `@radix-ui/react-slot` for the `asChild` composition pattern.
- **Select** is built on **`@floating-ui/react`** (positioning, dismiss, list
  navigation, focus management, transitions) — it does **not** use Radix.
