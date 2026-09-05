# Tailwind CSS + Styling

## Overview

react-blender-nodes uses **Tailwind CSS v4** for all component styling,
configured entirely through CSS (no `tailwind.config.ts`). The library ships a
Blender-inspired dark theme with custom color tokens, animations, and utilities
defined in `src/index.css` via the `@theme inline` block.

Key packages (`tailwindcss`, `@tailwindcss/vite`, and `tw-animate-css` are
`devDependencies` — build/compile-time only; `clsx`, `tailwind-merge`, and
`class-variance-authority` are runtime `dependencies`):

| Package                    | Role                                      | Version | Dependency type   |
| -------------------------- | ----------------------------------------- | ------- | ----------------- |
| `tailwindcss`              | Utility-first CSS framework (v4)          | ^4.1.12 | `devDependencies` |
| `@tailwindcss/vite`        | Vite plugin for Tailwind v4               | ^4.1.13 | `devDependencies` |
| `clsx`                     | Conditional class string builder          | ^2.1.1  | `dependencies`    |
| `tailwind-merge`           | Deduplicates conflicting Tailwind classes | ^3.3.1  | `dependencies`    |
| `class-variance-authority` | Variant-based component styling           | ^0.7.1  | `dependencies`    |
| `tw-animate-css`           | Animation utilities for Tailwind          | ^1.3.8  | `devDependencies` |

Styling architecture:

```
+-----------------------------------------------------+
|                  src/index.css                       |
|  +-----------------------------------------------+  |
|  | @import 'tailwindcss'                         |  |
|  | @import 'tw-animate-css'                      |  |
|  +-----------------------------------------------+  |
|  | @theme inline { ... }   <-- color tokens,     |  |
|  |                             fonts, animations  |  |
|  +-----------------------------------------------+  |
|  | @keyframes ...          <-- custom animations  |  |
|  | @utility no-scrollbar   <-- custom utilities   |  |
|  | .btn-press, etc.        <-- vanilla CSS rules  |  |
|  +-----------------------------------------------+  |
|  | :root { ... }           <-- shadcn/ui vars     |  |
|  | .dark { ... }           <-- dark mode overrides|  |
|  +-----------------------------------------------+  |
+-----------------------------------------------------+
          |                          |
          v                          v
  Component files              Vite build
  (cn(), cva())           (react-blender-nodes.css)
```

## Custom Color Tokens

All custom colors are defined in the `@theme inline` block in `src/index.css`
and are usable as standard Tailwind classes (e.g., `bg-primary-black`,
`text-primary-white`).

### Core Palette

| Token                  | Hex       | Usage                           |
| ---------------------- | --------- | ------------------------------- |
| `primary-white`        | `#e6e6e6` | Text color                      |
| `primary-black`        | `#1d1d1d` | Base background                 |
| `secondary-black`      | `#282828` | Dark button background          |
| `primary-dark-gray`    | `#303030` | Node background, hover state    |
| `secondary-dark-gray`  | `#444444` | Dark button border              |
| `primary-gray`         | `#545454` | Light button background         |
| `secondary-light-gray` | `#656565` | Light button non-priority hover |
| `primary-light-gray`   | `#797979` | Light button priority hover     |
| `primary-blue`         | `#4772b3` | Slider highlight color          |

### Transparent Overlay Tokens

These tokens provide the same visual result as their opaque counterparts but use
transparency so they can overlay `primary-gray` backgrounds:

| Token                                                           | Value       |
| --------------------------------------------------------------- | ----------- |
| `secondary-light-gray-as-transparent-overlay-over-primary-gray` | `#ffffff1a` |
| `primary-light-gray-as-transparent-overlay-over-primary-gray`   | `#ffffff38` |

### Status Colors

Used by the node runner execution system:

| Token              | Hex       | Meaning         |
| ------------------ | --------- | --------------- |
| `status-completed` | `#4caf50` | Successful step |
| `status-errored`   | `#ff4444` | Failed step     |
| `status-warning`   | `#ffa500` | Warning state   |
| `status-skipped`   | `#555555` | Skipped step    |

### Other Theme Tokens

| Token        | Value                                 |
| ------------ | ------------------------------------- |
| `tooltip-bg` | `#181818`                             |
| `font-main`  | `'DejaVu Sans', 'Roboto', sans-serif` |

### Runner UI Tokens

The node runner panel/timeline define their own surface and accent tokens (used
as `bg-runner-*`, `border-runner-*`, etc.):

| Token                        | Value                   |
| ---------------------------- | ----------------------- |
| `runner-panel-bg`            | `#222222`               |
| `runner-toolbar-bg`          | `#262626`               |
| `runner-inset-bg`            | `#161616`               |
| `runner-pill-bg`             | `#383838`               |
| `runner-timeline-box-bg`     | `#1a1a1a`               |
| `runner-timeline-box-border` | `#333333`               |
| `runner-ruler-bg`            | `#2c2c2c`               |
| `runner-section-header-bg`   | `#2a2a2a`               |
| `runner-value-bg`            | `#2a2a2a`               |
| `runner-value-border`        | `#444444`               |
| `runner-grid-line`           | `rgba(255,255,255,.04)` |
| `runner-handle-dot`          | `#555555`               |
| `runner-bar-completed`       | `#4f8a4f`               |
| `runner-bar-errored`         | `#a64141`               |
| `runner-scrubber-blue`       | `#4a85ff`               |

### Animation Tokens

The `@theme inline` block also exposes two named animation tokens (usable as
`animate-slide-in-right` / `animate-tooltip`):

| Token                      | Value                          |
| -------------------------- | ------------------------------ |
| `--animate-slide-in-right` | `slide-in-right 0.2s ease-out` |
| `--animate-tooltip`        | `tooltip-in 0.15s ease-out`    |

The `running-glow` and `edge-brightness-pulse` keyframes have no `--animate-*`
token; they are applied inline (e.g.
`animate-[running-glow_2s_ease-in-out_infinite]`).

### Color hierarchy (dark to light)

```
Darkest                                              Lightest
  |                                                      |
  v                                                      v
#1d1d1d  #282828  #303030  #444444  #545454  #656565  #797979  #e6e6e6
primary  secondary primary  secondary primary  secondary primary  primary
-black   -black    -dark    -dark     -gray    -light    -light   -white
                   -gray    -gray              -gray     -gray
```

### Themeable component tokens (plain `@theme static` block)

A second, plain (non-`inline`) `@theme static` block in `src/index.css` declares
the themeable component tokens (`--color-graph-menu-bg`,
`--color-graph-elevated-surface-bg`, `--color-timeline-loop-accent`,
`--color-graph-scrollbar-thumb`, the `--color-edge-value-pill-*` family, and
friends — generic surface tokens carry the `graph-` namespace so they cannot
collide with a consumer app's own `--color-*` theme tokens, since the block
compiles into `:root` of the shipped stylesheet). Because the block is not
`inline`, its generated utilities reference `var()` at runtime, so a
`GraphTheme` root slot can recolor them with arbitrary-property classes like
`[--color-graph-menu-bg:#f5f5f5]`. `static` forces every variable to be emitted
even when it is referenced only from JS string literals (inline styles, SVG
attributes) — never rely on the source scanner to keep a token alive.

For the `@theme inline` block above, the distinction is finer: the generated
UTILITIES inline the hex and are therefore not var-driven, but the VARIABLES are
still emitted at `:root` — so `var()`-consuming sites (inline-style gradients,
SVG attributes) do respond to overrides of inline tokens. Themes restyle
inline-token utilities via appended slot classes instead. See
[themingDoc.md](../ui/themingDoc.md).

## cn() Helper (clsx + tailwind-merge)

Defined in `src/utils/cnHelper.ts`, the `cn()` function is the primary way
components build class strings. It wraps `clsx` (conditional logic) with
`tailwind-merge` (conflict resolution).

```typescript
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

### Common usage patterns

**1. Base classes + external className prop (most common)**

```tsx
function MyComponent({ className }: { className?: string }) {
  return (
    <div
      className={cn('flex items-center gap-2 bg-primary-dark-gray', className)}
    />
  );
}
```

This allows consumers to override default styles since `tailwind-merge` resolves
conflicts in favor of the last class.

**2. Conditional classes**

```tsx
<div
  className={cn(
    'rounded-md border transition-colors',
    isActive && 'border-primary-blue',
    isDisabled && 'opacity-50 cursor-not-allowed',
  )}
/>
```

**3. With cva variants**

```tsx
<button
  className={cn(buttonVariants({ color, applyHoverStyles }), className)}
/>
```

### Data flow

```
Component props
      |
      v
cn('base-classes', condition && 'conditional', className)
      |
      v
clsx(inputs)            -- resolves booleans, arrays, objects
      |
      v
twMerge(result)         -- deduplicates conflicting Tailwind classes
      |                    e.g. 'px-4 px-6' -> 'px-6'
      v
Final class string      -- applied to DOM element
```

## Dark Mode

The library is designed exclusively for dark mode. There is no light mode
toggle.

### How it works

1. The `@custom-variant dark (&:is(.dark *))` directive in `index.css` defines a
   `dark:` variant that applies when an ancestor has the `.dark` class. In
   practice almost no component uses `dark:` -- the only occurrence is a
   vestigial `dark:aria-invalid:ring-destructive/40` in `Checkbox` carried over
   from shadcn/ui boilerplate.

2. The `:root` block defines light-mode shadcn/ui variables (unused in
   practice).

3. The `.dark` class block overrides these with dark-mode values using the
   `oklch` color space.

4. The FullGraph component (the main entry point) does not add a `.dark`
   className itself; it passes React Flow's `colorMode='dark'` prop, which
   drives React Flow's own dark theming. The Blender look comes from the custom
   color tokens being applied directly (e.g. `bg-primary-black`,
   `bg-primary-dark-gray`), not from the `.dark` shadcn cascade. Because no
   container carries the `.dark` class, the shadcn `dark:` overrides in the
   `.dark` block are effectively dormant.

### Shadcn/ui variable layers

The project includes two layers of color tokens:

```
Layer 1: Custom Blender tokens         Layer 2: shadcn/ui tokens
(used by all components)               (defined but effectively unused)

@theme inline {                        .dark {
  --color-primary-black: #1d1d1d;        --background: oklch(0.145 0 0);
  --color-primary-white: #e6e6e6;        --foreground: oklch(0.985 0 0);
  --color-primary-blue: #4772b3;         --primary: oklch(0.922 0 0);
  ...                                    ...
}                                      }
```

Components use the Blender tokens directly (`bg-primary-dark-gray`). The
shadcn-derived primitives in `src/components/atoms` (such as `Button`,
`Checkbox`, `Modal`) are restyled with Blender tokens too, so the shadcn token
layer (`bg-background`, `text-foreground`, etc.) is not referenced by any
component class in `src` -- those variables exist for completeness but are
effectively unused.

## CSS Export (react-blender-nodes.css)

The library exports all styles as a single CSS file that consumers must import.

### Build configuration (vite.config.ts)

The Vite build produces a named CSS file via the `cssFileName` option:

```typescript
build: {
  lib: {
    entry: { index: 'src/index.ts', contract: 'src/contract.ts' },
    cssFileName: 'react-blender-nodes',  // -> react-blender-nodes.css
    formats: ['es'],
  }
}
```

The `@tailwindcss/vite` plugin processes all Tailwind classes used across
components and bundles them into this single file.

### Consumer usage

```typescript
// In the consuming application's entry point:
import '@theclearsky/react-blender-nodes/style.css';
```

This maps to the package.json export:

```json
{
  "exports": {
    "./style.css": "./dist/react-blender-nodes.css"
  }
}
```

### What the CSS file contains

```
react-blender-nodes.css
  |
  +-- Tailwind base/reset styles
  +-- tw-animate-css animation utilities
  +-- Custom @theme tokens (colors, fonts, radii)
  +-- Custom @keyframes (running-glow, edge-brightness-pulse,
  |                      slide-in-right, tooltip-in)
  +-- Custom utility: no-scrollbar
  +-- Vanilla CSS classes (.btn-press, .timeline-block, etc.)
  +-- shadcn/ui CSS variables (:root and .dark)
  +-- All Tailwind utility classes used by components
```

## Common Styling Patterns

### Pattern 1: Flexbox layouts with custom colors

The most common pattern across components. Nearly every component uses flex with
the custom color tokens:

```tsx
<div className="flex items-center gap-2 bg-primary-dark-gray text-primary-white rounded-md px-4 py-2">
```

### Pattern 2: Arbitrary values for Blender-accurate sizing

Components frequently use Tailwind's arbitrary value syntax to match Blender's
exact measurements:

```tsx
<div className="text-[27px] leading-[27px] h-[44px]">
```

### Pattern 3: cva for multi-variant components

Used in `Button` and `Modal` -- components with multiple visual variants. The
`Button` defines `color`, `applyHoverStyles`, and `size` variants, and resolves
hover styles through `compoundVariants` (so the base `color` classes set only
the resting appearance):

```tsx
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 cursor-pointer \
  rounded-md transition-all font-main whitespace-nowrap text-primary-white \
  disabled:cursor-not-allowed disabled:bg-secondary-dark-gray disabled:opacity-50 outline-none focus-visible:outline-none border',
  {
    variants: {
      color: {
        dark: 'bg-secondary-black border-secondary-dark-gray',
        lightNonPriority: 'bg-primary-gray border-transparent',
        lightPriority: 'bg-primary-gray border-transparent',
        lightParentGroupBasedHover: 'bg-primary-gray border-transparent',
      },
      applyHoverStyles: { true: '', false: '' },
      size: {
        normal: 'py-2 px-4 text-[27px] leading-[27px]',
        small: 'py-2 px-3 text-[16px] leading-[13px] rounded-sm',
      },
    },
    defaultVariants: { color: 'dark', applyHoverStyles: true, size: 'normal' },
    compoundVariants: [
      /* color + applyHoverStyles -> hover:bg-* combinations */
    ],
  },
);
```

`Modal` uses a smaller `modalContentVariants` with a single `size` variant (`sm`
/ `md` / `lg`) controlling `max-w-*`.

### Pattern 4: Named group hover states

Used for parent-driven hover effects:

```tsx
// Parent
<div className="group/lightParentGroupBasedHover">
  {/* Child reacts to parent hover */}
  <button className="group-hover/lightParentGroupBasedHover:bg-secondary-light-gray-as-transparent-overlay-over-primary-gray">
```

### Pattern 5: Transition + duration pairs

Interactive elements consistently use transition utilities:

```tsx
<div className="transition-colors duration-150">    {/* color changes */}
<div className="transition-all duration-200">        {/* multi-property */}
<div className="transition-transform duration-150">  {/* transforms */}
```

### Pattern 6: Custom vanilla CSS for complex effects

Effects that cannot be expressed as Tailwind utilities are defined as vanilla
CSS classes in `index.css`:

| Class                    | Effect                                     |
| ------------------------ | ------------------------------------------ |
| `.btn-press`             | `transform: scale(0.95)` on `:active`      |
| `.timeline-block`        | `filter: brightness(1.15)` on `:hover`     |
| `.node-runner-scrollbar` | Thin custom scrollbar (4px, #444444 thumb) |
| `.timeline-scrollbar`    | Thin custom scrollbar (6px, #555 thumb)    |
| `.no-scrollbar`          | Hides scrollbar completely (utility)       |

### Pattern 7: Inline styles for dynamic values

When values depend on runtime calculations (positions, gradients), components
use inline styles:

```tsx
<div
  style={{
    background: `linear-gradient(to right, ...)`,
    left: `${percentage}%`,
  }}
/>
```

## Anti-Patterns and Limitations

### Do not use light mode classes

The library is dark-mode only. Using `bg-white`, `text-black`, or other
light-mode classes will break the visual consistency. Always use the custom
color tokens.

### Do not hardcode hex values in className

Prefer the semantic tokens over raw hex values when one exists for the color:

```tsx
// Bad
<div className="bg-[#303030]">

// Good
<div className="bg-primary-dark-gray">
```

This is an aspirational guideline rather than a universally enforced rule: a few
existing components still hardcode a hex that has an equivalent token. For
example, `Modal` (`modalContentVariants` in
`src/components/atoms/Modal/Modal.tsx`) uses `bg-[#222222]`, which is the same
value as the existing `runner-panel-bg` token
(`--color-runner-panel-bg: #222222`) and could be written `bg-runner-panel-bg`.

### Avoid conflicting with the exported CSS

Consumers importing `react-blender-nodes.css` should be aware it includes
Tailwind's base reset. If the consumer also uses Tailwind, the reset may already
be present. Conflicts are unlikely with Tailwind v4 but should be tested.

### No runtime theme switching

The color tokens are compile-time constants in the `@theme inline` block. There
is no mechanism for consumers to swap the color palette at runtime. The
shadcn/ui CSS variables in `.dark` can theoretically be overridden, but the
custom Blender tokens cannot be easily swapped without rebuilding.

### tailwind-merge limitations

`tailwind-merge` does not recognize custom utilities (e.g., `no-scrollbar`) as
conflicting. This is generally fine since custom utilities don't overlap, but be
aware that `cn('no-scrollbar', 'no-scrollbar')` will produce both (harmless but
redundant).

### Transparent overlay tokens are context-dependent

The tokens `secondary-light-gray-as-transparent-overlay-over-primary-gray` and
`primary-light-gray-as-transparent-overlay-over-primary-gray` only produce
correct visual results when layered over a `primary-gray` background. Using them
over other backgrounds will yield incorrect colors.

## Relationships with Project Features

### [Node System (ConfigurableNode)](../ui/configurableNodeDoc.md)

Nodes use the core color tokens for their layered appearance:

```
+--------------------------------------------+
| Node container: bg-primary-dark-gray       |
|  +--------------------------------------+  |
|  | Header: bg-[nodeColor]              |  |
|  +--------------------------------------+  |
|  | Body fields: bg-primary-gray         |  |
|  |   Buttons: bg-secondary-black        |  |
|  |   Sliders: bg-primary-blue fill      |  |
|  +--------------------------------------+  |
+--------------------------------------------+
  Border: border-secondary-dark-gray
  Selected: ring-primary-blue
```

### [Node Runner (Execution System)](../runner/runnerHookDoc.md)

The runner UI introduces status-specific colors and custom animations:

- `status-completed` / `status-errored` / `status-skipped` tokens color
  execution step indicators
- `@keyframes running-glow` animates the active-step indicator
- `@keyframes slide-in-right` animates panel entry
- `.timeline-block`, `.node-runner-scrollbar` style the execution timeline

### [Context Menu](../ui/contextMenuDoc.md)

Menus use the dark background palette with hover transitions:

```
bg-primary-black (menu background)
  -> hover:bg-primary-dark-gray (item hover)
  -> text-primary-white (item text)
  -> border-secondary-dark-gray (separator)
```

### [Import/Export](../importExport/importExportDoc.md)

The import/export dialogs and controls follow the same Button variant system
(`dark`, `lightNonPriority`, `lightPriority`) for action hierarchy.

### [FullGraph (Top-Level Container)](../ui/fullGraphDoc.md)

The FullGraph component is the root, but it does **not** add a `.dark` className
(see "Dark Mode" above). Instead it passes React Flow's `colorMode='dark'` prop,
which drives React Flow's own dark theming. The Blender look comes from the
custom color tokens being applied directly on individual elements (e.g.
`bg-primary-dark-gray`), not from a `.dark` cascade. The canvas background is
rendered by React Flow's own `<Background />` component (combined with
`colorMode='dark'`), rather than a `bg-primary-black` utility on the wrapper.
