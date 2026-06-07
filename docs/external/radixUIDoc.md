# Radix UI

## Overview

Radix UI is a collection of unstyled, accessible UI primitives for React. This
project uses three Radix dependencies to provide foundational behavior for
interactive components while applying custom Blender-inspired styling via
Tailwind CSS.

**Packages used (from `package.json`):**

| Package                  | Version | Purpose                                                        |
| ------------------------ | ------- | -------------------------------------------------------------- |
| @radix-ui/react-checkbox | ^1.3.3  | Accessible checkbox toggle behavior (Checkbox atom)            |
| @radix-ui/react-slot     | ^1.2.3  | Component composition (asChild on the Button atom)             |
| radix-ui                 | ^1.4.3  | Umbrella package; provides the Accordion and Dialog primitives |

The umbrella `radix-ui` package is imported as named primitives — for example
`import { Accordion as AccordionPrimitive } from 'radix-ui'` (Accordion atom)
and `import { Dialog as DialogPrimitive } from 'radix-ui'` (Modal atom).

> **Note:** The `Select` component does **not** use `@radix-ui/react-select`. It
> is built on `@floating-ui/react` (see the Select subsection below).
> `@radix-ui/react-select` is **not** a dependency in `package.json`.

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

### Select — built on `@floating-ui/react`, not Radix

**Used in:** `src/components/molecules/Select/Select.tsx`

The `Select` component **does not use `@radix-ui/react-select`**. It is a fully
custom dropdown built on `@floating-ui/react`, so none of the
`SelectPrimitive.*` primitives are consumed. The component exposes a compound
API (`Select`, `SelectTrigger`, `SelectContent`, `SelectItem`, `SelectValue`,
`SelectGroup`, `SelectLabel`, `SelectSeparator`, `SelectUnsupportedItem`), but
the implementation is hand-rolled:

- **Positioning/behavior** via floating-ui hooks: `useFloating` (with
  `autoUpdate`, `offset`, `flip`, `size`), `useClick`, `useDismiss`, `useRole`,
  `useListNavigation`, `useInteractions`, `useTransitionStyles`.
- **Portaling/focus** via `FloatingPortal` + `FloatingFocusManager` (replaces
  `SelectPrimitive.Portal`).
- **State** via a custom React `createContext` (replaces
  `SelectPrimitive.Root`'s context).
- **ARIA** is authored directly (`role='option'`, `role='group'`) rather than
  inherited from Radix.
- **Icons** from `lucide-react` (`CheckIcon`, `ChevronDownIcon`, `XIcon`).

Styling decisions are largely preserved (dark `#181818` content, `h-[44px]`
trigger, focus highlight), but state-driven styling now uses floating-ui's
`useTransitionStyles` rather than Radix `data-[state=open|closed]` attributes,
and the trigger-width sync uses floating-ui's `size` middleware instead of the
`--radix-select-trigger-width` CSS variable.

See the Tailwind/`@floating-ui` documentation for the full implementation; the
Radix-backed atoms documented here are Checkbox (checkbox), Button (slot),
Accordion (Accordion primitive from `radix-ui`), and Modal (Dialog primitive
from `radix-ui`).

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

### radix-ui (Accordion primitive)

**Used in:** `src/components/atoms/Accordion/Accordion.tsx`

Imported as `import { Accordion as AccordionPrimitive } from 'radix-ui'`.
Provides the accessible disclosure/collapsible behavior used by the Accordion
atom.

**Radix primitives consumed:**

```
AccordionPrimitive.Root        -- Manages open/closed item state
AccordionPrimitive.Item        -- A single collapsible section
AccordionPrimitive.Header      -- Wraps the trigger row
AccordionPrimitive.Trigger     -- The clickable header button
AccordionPrimitive.Content     -- The collapsible content region
```

The wrappers (`Accordion`, `AccordionItem`, `AccordionTrigger`,
`AccordionContent`) add `data-slot` markers and Blender-style Tailwind classes,
and rely on Radix's `data-[state=open|closed]` attributes for the chevron
rotation and the `animate-accordion-up/down` transitions.

### radix-ui (Dialog primitive)

**Used in:** `src/components/atoms/Modal/Modal.tsx`

Imported as `import { Dialog as DialogPrimitive } from 'radix-ui'`. The Modal
atom is a thin wrapper over the Radix Dialog primitive.

**Radix primitives consumed:**

```
DialogPrimitive.Root / Trigger / Portal / Overlay / Content
DialogPrimitive.Title / Description / Close
```

The wrappers (`Modal`, `ModalTrigger`, `ModalOverlay`, `ModalContent`,
`ModalTitle`, `ModalDescription`, `ModalClose`, `ModalCloseButton`, plus the
non-Radix layout helpers `ModalHeader`, `ModalBody`, `ModalFooter`) add
`data-slot` markers, a `cva`-based size variant on the content, and
`data-[state=open|closed]` driven enter/exit animations.

## Integration Pattern (Unstyled + Tailwind)

The Radix-backed atoms (checkbox, slot, Accordion primitive, Dialog primitive)
follow the same integration pattern in this project:

```
+-------------------+     +---------------------+     +-------------------+
| Radix Primitive   |     | Project Wrapper     |     | Tailwind Classes  |
| (behavior + a11y) | --> | (forwardRef + type  | --> | (Blender-style    |
|                   |     |  extension + cn())  |     |  dark theme)      |
+-------------------+     +---------------------+     +-------------------+
```

**Step-by-step pattern:**

1. Import the Radix primitive — either as a namespace
   (`import * as CheckboxPrimitive from '@radix-ui/react-checkbox'`), as a named
   import from a per-component package
   (`import { Slot } from '@radix-ui/react-slot'`), or as a renamed primitive
   from the umbrella package
   (`import { Accordion as AccordionPrimitive } from 'radix-ui'`)
2. Create a wrapper component. Checkbox and Button use `forwardRef`; the
   Accordion and Modal wrappers are plain function components that simply
   forward `React.ComponentProps<typeof Primitive.X>`
3. Extract `className` from props
4. Use `cn()` (clsx + tailwind-merge) to merge default Tailwind classes with any
   passed className
5. Spread remaining props onto the Radix primitive
6. Forward the ref where `forwardRef` is used
7. Optionally set `displayName` — Checkbox sets it to the Radix primitive's
   displayName (`CheckboxPrimitive.Root.displayName`), Button sets a literal
   `'Button'`, and the function-component wrappers rely on their inferred name
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
```

Disabled styling, by contrast, uses Tailwind's standard `disabled:` pseudo-class
variant rather than a `data-*` attribute — the Checkbox Root applies
`disabled:cursor-not-allowed disabled:opacity-50` (there is no `data-[disabled]`
variant in the source).

(There are no Select `data-[state=open]` / `data-[placeholder]` examples here —
Select does not use Radix data-attributes; it animates via floating-ui's
`useTransitionStyles`. The Accordion and Modal atoms, however, do use Radix
`data-[state=open|closed]` attributes for their transitions.)

## Anti-Patterns and Limitations

### Do NOT override Radix internal behavior

Radix manages focus, keyboard handling, and ARIA attributes internally. Avoid:

- Adding custom `onKeyDown` handlers that duplicate Radix keyboard behavior
- Setting `role`, `aria-checked`, or other ARIA attributes that Radix already
  manages
- Using `tabIndex` overrides that conflict with Radix focus management

### Do NOT use native HTML elements as replacements

Switching from Radix Checkbox to `<input type="checkbox">` would lose:

- The `data-[state=*]` styling system
- Consistent keyboard navigation
- The `CheckedState` type (includes `'indeterminate'`)

(Select is already a custom `@floating-ui/react` implementation, not Radix.)

### Limitations of the current integration

- **No Radix Select**: The dropdown is a custom `@floating-ui/react` component
  (see the Select subsection). The Radix-backed atoms are Checkbox, Button,
  Accordion, and Modal.
- **No Radix Tooltip or Popover**: The Tooltip atom
  (`src/components/atoms/Tooltip/Tooltip.tsx`) is a custom `@floating-ui/react`
  implementation rather than a Radix equivalent. Mixing custom and Radix
  positioning could conflict.
- **Modal IS a Radix Dialog**: The Modal atom
  (`src/components/atoms/Modal/Modal.tsx`) wraps the Radix `Dialog` primitive
  (from the `radix-ui` umbrella package). Context menus, however, use a custom
  implementation (`src/components/molecules/ContextMenu`), not Radix.
- **Checkbox lacks indeterminate UI**: The `CheckedState` type supports
  `'indeterminate'` but the Indicator only renders a `CheckIcon` -- there is no
  dash/minus icon for the indeterminate visual.

### Version constraints

The project pins to `^1.x` for all three Radix dependencies
(`@radix-ui/react-checkbox` `^1.3.3`, `@radix-ui/react-slot` `^1.2.3`, and the
`radix-ui` umbrella `^1.4.3`). Major version bumps may change the primitive API
surface.

## Relationships with Project Features

### -> [Checkbox Component](../ui/inputComponentsDoc.md)

```
src/components/atoms/Checkbox/Checkbox.tsx
 |
 +-- Wraps: @radix-ui/react-checkbox (Root + Indicator)
 +-- Exports: Checkbox, CheckboxProps
 +-- NOT re-exported from the atoms barrel: src/components/atoms/index.ts does
 |   not export Checkbox, and src/components/atoms/Checkbox/index.ts is empty.
 |   Consumers import it directly from '@/components/atoms/Checkbox/Checkbox'.
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
   +-- Passes: checked, onCheckedChange
```

When a ConfigurableNode has an input with `type === 'boolean'`, the
ContextAwareInput renders a Checkbox. The checked state is managed by the node's
data state, and changes propagate through `onCheckedChange` (which ignores the
`'indeterminate'` value) back to the node state via `input.onChange` and
`updateNodeValue`.

```
ConfigurableNode
 +-- ContextAwareInput (input.type === 'boolean')
      +-- Checkbox
           +-- CheckboxPrimitive.Root    (Radix: state + a11y)
                +-- CheckboxPrimitive.Indicator
                     +-- CheckIcon       (lucide-react: visual)
```

### -> Select Component (Enum Input) — not Radix

```
src/components/molecules/Select/Select.tsx
 |
 +-- Built on: @floating-ui/react (NOT @radix-ui/react-select)
 +-- Exports: Select, SelectTrigger, SelectContent, SelectItem,
 |            SelectValue, SelectGroup, SelectLabel, SelectSeparator,
 |            SelectUnsupportedItem
 +-- Re-exported from: src/components/molecules/index.ts
```

The Select is used for dropdown/enum-type inputs in the node editor. It exposes
a compound component API (each sub-component individually importable), and the
behavior, positioning, focus management, and ARIA are provided by
`@floating-ui/react` plus a custom React context — see the Select subsection
above. This block is retained only to note that Radix is not involved. Note:
`SelectSeparator` here is a plain styled `<div>` defined in `Select.tsx`, not a
Radix primitive.

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
