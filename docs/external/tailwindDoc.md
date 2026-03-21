# Tailwind CSS + Styling

## Overview

react-blender-nodes uses **Tailwind CSS v4** for all component styling,
configured entirely through CSS (no `tailwind.config.ts`). The library ships a
Blender-inspired dark theme with custom color tokens, animations, and utilities
defined in `src/index.css` via the `@theme inline` block.

Key dependencies:

| Package                    | Role                                      | Version |
| -------------------------- | ----------------------------------------- | ------- |
| `tailwindcss`              | Utility-first CSS framework (v4)          | ^4.1.12 |
| `@tailwindcss/vite`        | Vite plugin for Tailwind v4               | ^4.1.13 |
| `clsx`                     | Conditional class string builder          | ^2.1.1  |
| `tailwind-merge`           | Deduplicates conflicting Tailwind classes | ^3.3.1  |
| `class-variance-authority` | Variant-based component styling           | ^0.7.1  |
| `tw-animate-css`           | Animation utilities for Tailwind          | ^1.3.8  |

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

1. The `@custom-variant dark (&:is(.dark *))` directive in `index.css` tells
   Tailwind that `dark:` variants apply when an ancestor has the `.dark` class.

2. The `:root` block defines light-mode shadcn/ui variables (unused in
   practice).

3. The `.dark` class block overrides these with dark-mode values using the
   `oklch` color space.

4. The FullGraph component (the main entry point) renders with
   `className="dark"` on its container, activating dark mode for the entire node
   editor.

### Shadcn/ui variable layers

The project includes two layers of color tokens:

```
Layer 1: Custom Blender tokens         Layer 2: shadcn/ui tokens
(used by most components)              (used by shadcn/ui primitives)

@theme inline {                        .dark {
  --color-primary-black: #1d1d1d;        --background: oklch(0.145 0 0);
  --color-primary-white: #e6e6e6;        --foreground: oklch(0.985 0 0);
  --color-primary-blue: #4772b3;         --primary: oklch(0.922 0 0);
  ...                                    ...
}                                      }
```

Most hand-written components use the Blender tokens directly
(`bg-primary-dark-gray`), while shadcn/ui-based components (Badge, Collapsible)
use the shadcn token layer (`bg-background`, `text-foreground`).

## CSS Export (react-blender-nodes.css)

The library exports all styles as a single CSS file that consumers must import.

### Build configuration (vite.config.ts)

The Vite build produces a named CSS file via the `cssFileName` option:

```typescript
build: {
  lib: {
    entry: ['src/index.ts'],
    cssFileName: 'react-blender-nodes',  // -> react-blender-nodes.css
    formats: ['es', 'umd'],
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
  +-- Custom @keyframes (running-glow, slide-in-right, tooltip-in)
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

Only used in `Button` and `Badge` -- components with multiple visual variants:

```tsx
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 cursor-pointer py-2 px-4 rounded-md',
  {
    variants: {
      color: {
        dark: 'bg-secondary-black border-secondary-dark-gray hover:bg-primary-dark-gray',
        lightNonPriority: 'bg-primary-gray hover:bg-secondary-light-gray',
        lightPriority: 'bg-primary-gray hover:bg-primary-light-gray',
      },
      applyHoverStyles: { true: '', false: '' },
    },
    compoundVariants: [
      /* color + hover combinations */
    ],
    defaultVariants: { color: 'dark', applyHoverStyles: true },
  },
);
```

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
| `.scrubber-glow`         | Blue drop-shadow glow                      |
| `.node-runner-scrollbar` | Thin custom scrollbar (4px, #444444 thumb) |
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

Prefer the semantic tokens over raw hex values:

```tsx
// Bad
<div className="bg-[#303030]">

// Good
<div className="bg-primary-dark-gray">
```

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
- `.timeline-block`, `.scrubber-glow`, `.node-runner-scrollbar` style the
  execution timeline

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

The FullGraph component is the root that applies the `dark` class, activating
the entire dark theme cascade for all child components. The graph background
uses `bg-primary-black` as the canvas color.
