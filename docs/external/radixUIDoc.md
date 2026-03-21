# Radix UI

## Overview

Radix UI is a collection of unstyled, accessible UI primitives for React. This
project uses three Radix packages to provide foundational behavior for
interactive components while applying custom Blender-inspired styling via
Tailwind CSS.

**Packages used:**

| Package                  | Version | Purpose                             |
| ------------------------ | ------- | ----------------------------------- |
| @radix-ui/react-checkbox | ^1.3.3  | Accessible checkbox toggle behavior |
| @radix-ui/react-select   | ^2.2.6  | Accessible dropdown select behavior |
| @radix-ui/react-slot     | ^1.2.3  | Component composition (asChild)     |

## Components Used

### @radix-ui/react-checkbox

**Used in:** `src/components/atoms/Checkbox/Checkbox.tsx`

Provides accessible checkbox behavior including:

- Checked / unchecked / indeterminate state management
- Keyboard toggle (Space key)
- ARIA attributes (`role="checkbox"`, `aria-checked`)
- `data-state` attribute for CSS styling (`checked` | `unchecked`)

**Radix primitives consumed:**

```
CheckboxPrimitive.Root         -- The clickable checkbox container
CheckboxPrimitive.Indicator    -- Renders children only when checked
```

**Integration pattern:**

```
+----------------------------------------------+
| CheckboxPrimitive.Root                       |
|  - Manages checked state                     |
|  - Emits onCheckedChange(CheckedState)       |
|  - Exposes data-[state=checked|unchecked]    |
|                                              |
|  +----------------------------------------+  |
|  | CheckboxPrimitive.Indicator            |  |
|  |  - Mounts/unmounts based on state      |  |
|  |  +----------------------------------+  |  |
|  |  | <CheckIcon /> (lucide-react)     |  |  |
|  |  +----------------------------------+  |  |
|  +----------------------------------------+  |
+----------------------------------------------+
```

The project wraps the Radix primitive with `forwardRef`, extends props via
`ComponentProps<typeof CheckboxPrimitive.Root>`, and applies Tailwind classes
for Blender-style dark theme visuals.

**Key Tailwind classes applied to Root:**

- `bg-primary-gray` -- default unchecked background
- `data-[state=checked]:bg-primary-blue` -- checked state background
- `data-[state=checked]:text-primary-white` -- checked state icon color
- `size-7` -- fixed 28px dimensions
- `rounded-[4px]` -- subtle rounding

### @radix-ui/react-select

**Used in:** `src/components/molecules/Select/Select.tsx`

Provides a full accessible dropdown select with:

- Trigger button with current value display
- Portaled dropdown content (avoids z-index/overflow issues)
- Keyboard navigation (arrow keys, type-ahead)
- Scroll buttons for long lists
- ARIA combobox/listbox semantics

**Radix primitives consumed:**

```
SelectPrimitive.Root             -- State management and context provider
SelectPrimitive.Trigger          -- The button that opens the dropdown
SelectPrimitive.Icon             -- Chevron icon slot within the trigger
SelectPrimitive.Value            -- Displays selected value or placeholder
SelectPrimitive.Portal           -- Portals content to document.body
SelectPrimitive.Content          -- The dropdown panel
SelectPrimitive.Viewport         -- Scrollable area inside content
SelectPrimitive.ScrollUpButton   -- Scroll indicator (top)
SelectPrimitive.ScrollDownButton -- Scroll indicator (bottom)
SelectPrimitive.Group            -- Semantic grouping of items
SelectPrimitive.Label            -- Group label
SelectPrimitive.Item             -- Individual selectable option
SelectPrimitive.ItemText         -- Text content of an item
SelectPrimitive.ItemIndicator    -- Checkmark for selected item
SelectPrimitive.Separator        -- Visual divider between groups
```

**Composition structure:**

```
SelectPrimitive.Root
 |
 +-- SelectPrimitive.Trigger
 |    +-- SelectPrimitive.Value
 |    +-- SelectPrimitive.Icon
 |         +-- <ChevronDownIcon />
 |
 +-- SelectPrimitive.Portal
      +-- SelectPrimitive.Content
           +-- SelectPrimitive.ScrollUpButton
           +-- SelectPrimitive.Viewport
           |    +-- SelectPrimitive.Group
           |    |    +-- SelectPrimitive.Label
           |    |    +-- SelectPrimitive.Item
           |    |         +-- SelectPrimitive.ItemText
           |    |         +-- SelectPrimitive.ItemIndicator
           |    +-- SelectPrimitive.Separator
           +-- SelectPrimitive.ScrollDownButton
```

The project wraps each sub-primitive into its own named, forwardRef-wrapped
component (SelectTrigger, SelectContent, SelectItem, etc.) and applies Tailwind
classes for the Blender dark theme.

**Key styling decisions:**

- Content uses `bg-[#181818]` with `border-secondary-dark-gray`
- Items use `focus:bg-[#3F3F3F]` for hover/focus highlight
- Trigger height fixed at `h-[44px]` to match other input heights
- CSS animations via `data-[state=open|closed]` for enter/exit transitions
- Viewport width synced to trigger via `--radix-select-trigger-width` CSS
  variable

### @radix-ui/react-slot

**Used in:** `src/components/atoms/Button/Button.tsx`

Provides the `asChild` composition pattern. When `asChild={true}`, the Slot
component merges the Button's props (className, event handlers, ref) onto its
child element instead of rendering a `<button>`.

**Pattern:**

```
// asChild = false (default)
<button className={...} {...props} />

// asChild = true
<Slot className={...} {...props}>
  {children}    <-- props merged onto this element
</Slot>
```

This allows rendering a Button that is actually an `<a>`, `<Link>`, or any other
element while preserving all Button styling and behavior.

## Integration Pattern (Unstyled + Tailwind)

All three Radix packages follow the same integration pattern in this project:

```
+-------------------+     +---------------------+     +-------------------+
| Radix Primitive   |     | Project Wrapper     |     | Tailwind Classes  |
| (behavior + a11y) | --> | (forwardRef + type  | --> | (Blender-style    |
|                   |     |  extension + cn())  |     |  dark theme)      |
+-------------------+     +---------------------+     +-------------------+
```

**Step-by-step pattern:**

1. Import Radix primitives as a namespace (`import * as XPrimitive from '...'`)
2. Create a wrapper component using `forwardRef`
3. Extract `className` from props
4. Use `cn()` (clsx + tailwind-merge) to merge default Tailwind classes with any
   passed className
5. Spread remaining props onto the Radix primitive
6. Forward the ref
7. Set `displayName` to match the Radix primitive's displayName
8. Export wrapper component and its props type

**Type extension pattern:**

```typescript
// Extend Radix props with optional overrides
type CheckboxProps = ComponentProps<typeof CheckboxPrimitive.Root> & {
  className?: string;
};
```

**Styling via data attributes:**

Radix primitives expose state through `data-*` attributes. The project uses
Tailwind's `data-[]` variant to style based on component state without managing
CSS classes in JavaScript:

```
data-[state=checked]:bg-primary-blue    -- Checkbox checked state
data-[state=open]:animate-in            -- Select open animation
data-[disabled]:opacity-50              -- Disabled state
data-[placeholder]:text-[#6B6B6B]      -- Placeholder text color
```

## Anti-Patterns and Limitations

### Do NOT override Radix internal behavior

Radix manages focus, keyboard handling, and ARIA attributes internally. Avoid:

- Adding custom `onKeyDown` handlers that duplicate Radix keyboard behavior
- Setting `role`, `aria-checked`, or other ARIA attributes that Radix already
  manages
- Using `tabIndex` overrides that conflict with Radix focus management

### Do NOT use native HTML elements as replacements

Switching from Radix Checkbox to `<input type="checkbox">` or from Radix Select
to `<select>` would lose:

- The `data-[state=*]` styling system
- Consistent keyboard navigation
- The `CheckedState` type (includes `'indeterminate'`)
- Portal-based rendering (Select)

### Limitations of the current integration

- **No Radix Tooltip or Popover**: The project uses custom tooltip/popover
  implementations rather than Radix equivalents. Mixing custom and Radix
  positioning could conflict.
- **No Radix Dialog**: Context menus and panels use custom implementations.
- **Checkbox lacks indeterminate UI**: The `CheckedState` type supports
  `'indeterminate'` but the Indicator only renders a `CheckIcon` -- there is no
  dash/minus icon for the indeterminate visual.
- **Select does not support multi-select**: Radix Select is single-value only.
  Multi-select would require a different approach.

### Version constraints

The project pins to `^1.x` for checkbox/slot and `^2.x` for select. Major
version bumps may change the primitive API surface.

## Relationships with Project Features

### -> [Checkbox Component](../ui/inputComponentsDoc.md)

```
src/components/atoms/Checkbox/Checkbox.tsx
 |
 +-- Wraps: @radix-ui/react-checkbox (Root + Indicator)
 +-- Exports: Checkbox, CheckboxProps
 +-- Re-exported from: src/components/atoms/index.ts
```

The Checkbox is a thin wrapper that adds Blender-style dark theme visuals. It
accepts all Radix Checkbox props (checked, defaultChecked, onCheckedChange,
disabled, required, name, value) plus an optional className override.

### -> [ConfigurableNode (Boolean Input)](../ui/configurableNodeDoc.md)

```
src/components/organisms/ConfigurableNode/
  SupportingSubcomponents/ContextAwareInput.tsx
   |
   +-- Imports Checkbox from '@/components/atoms/Checkbox/Checkbox'
   +-- Renders Checkbox for boolean-type handle inputs
   +-- Passes: checked, onCheckedChange, disabled
```

When a ConfigurableNode has a handle with `inputType: 'boolean'`, the
ContextAwareInput renders a Checkbox. The checked state is managed by the node's
data state, and changes propagate through `onCheckedChange` back to the node
state reducer.

```
ConfigurableNode
 +-- ContextAwareInput (inputType === 'boolean')
      +-- Checkbox
           +-- CheckboxPrimitive.Root    (Radix: state + a11y)
                +-- CheckboxPrimitive.Indicator
                     +-- CheckIcon       (lucide-react: visual)
```

### -> [Select Component (Enum Input)](../ui/inputComponentsDoc.md)

```
src/components/molecules/Select/Select.tsx
 |
 +-- Wraps: @radix-ui/react-select (full compound component set)
 +-- Exports: Select, SelectTrigger, SelectContent, SelectItem,
 |            SelectValue, SelectGroup, SelectLabel, SelectSeparator,
 |            SelectScrollUpButton, SelectScrollDownButton
 +-- Re-exported from: src/components/molecules/index.ts
```

The Select is used for dropdown/enum-type inputs in the node editor. It follows
the Radix compound component pattern where each sub-component is individually
importable and composable.

### -> [Button Component (asChild Composition)](../ui/inputComponentsDoc.md)

```
src/components/atoms/Button/Button.tsx
 |
 +-- Uses: @radix-ui/react-slot (Slot)
 +-- Enables: asChild prop for polymorphic rendering
 +-- Exports: Button, ButtonProps
```

The Slot primitive allows the Button to render as any element while keeping all
Button styling. This is used throughout the UI where buttons need to act as
links or other interactive elements.
