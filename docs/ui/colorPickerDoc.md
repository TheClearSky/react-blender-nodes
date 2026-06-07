# ColorPicker

## Overview

The ColorPicker subsystem is an **OKLCH-native** color-picking toolkit. Every
color it tracks is stored as an `OklchColor` (`l`, `c`, `h`, `alpha`) regardless
of which CSS format the user is editing in, so hue stays stable and chroma is
preserved across format switches, gamut clamps, and lightness changes. Format
strings (hex / rgb / hsl / hsb / oklch / oklab / p3) are derived on demand from
that canonical OKLCH state via `culori`.

It ships in two consumable shapes:

```
+--------------------------------------------------------------+
|  PopoverColorPicker  (the recommended, batteries-included    |
|  trigger-swatch + floating-ui popover; one `value` string    |
|  in, one formatted string out)                               |
+--------------------------------------------------------------+
                         |  composes
                         v
+--------------------------------------------------------------+
|  ColorPicker.*  (compound parts: Root + Area/Hue/Lightness/  |
|  Alpha/Preview/CssInput/ChannelInput/Swatches/EyeDropper/    |
|  FormatSwitcher/GamutBadge/ContrastReadout)                  |
+--------------------------------------------------------------+
                         |  share state through
                         v
+--------------------------------------------------------------+
|  useColorPicker  (headless hook: canonical OklchColor +      |
|  format + derived gamut/contrast + setters)                  |
+--------------------------------------------------------------+
                         |  built on
                         v
+--------------------------------------------------------------+
|  lib/color.ts  +  lib/channels.ts  (pure color math:         |
|  parse/format, gamut mapping, channel descriptors)           |
+--------------------------------------------------------------+
```

All of the above are re-exported from the package barrel
(`src/components/molecules/ColorPicker/index.ts`, a single
`export * from './ColorPicker'` that forwards everything declared in
`src/components/molecules/ColorPicker/ColorPicker.tsx` › `ColorPicker`), which
exposes the compound object, the hook, the pure utils, and the public types.

The whole folder lives under `src/components/molecules/ColorPicker/` and depends
on `culori` for the heavy color-space conversions, on `@floating-ui/react` for
the popover, and on the project's `Select` molecule for format dropdowns.

## Canonical state: why OKLCH

OKLCH is a perceptually-uniform cylindrical space (Lightness, Chroma, Hue). The
picker keeps the color in OKLCH the entire time so that:

- **Hue is an independent axis.** Dragging the Area or changing lightness never
  shifts the hue, which is the classic failure mode of HSV-backed pickers.
- **Format round-tripping is lossless-ish.** The picker never stores hex and
  re-parses it; it stores OKLCH and only formats outward. `PopoverColorPicker`
  goes further and keeps its own internal `OklchColor` to avoid the hex
  round-trip when its own sliders move (see the `selfSetRef` guard below).
- **Gamut awareness is first-class.** Because the canonical value can describe
  colors outside sRGB, the subsystem can report (and optionally clamp) sRGB / P3
  / Rec.2020 membership rather than silently truncating.

The `OklchColor` shape (`src/components/molecules/ColorPicker/lib/types.ts` ›
`OklchColor`):

| Field   | Range (canonical)   | Notes                                          |
| ------- | ------------------- | ---------------------------------------------- |
| `l`     | `0`–`1`             | Lightness (clamped on parse / component edits) |
| `c`     | `0`–unbounded       | Chroma (kept `>= 0`)                           |
| `h`     | `0`–`360` (wrapped) | Hue in degrees; `0` for achromatic colors      |
| `alpha` | `0`–`1`             | Opacity                                        |

## The compound API (`ColorPicker.*`)

`ColorPicker` (`src/components/molecules/ColorPicker/ColorPicker.tsx` ›
`ColorPicker`) is a plain object whose keys are the parts. You compose them
freely inside a single `ColorPicker.Root`; the Root owns the state and every
other part reads it from context. This is the Radix-style "compound component"
pattern (no required ordering, no prop drilling).

```
ColorPicker.Root            (state owner + context provider)
  ├─ ColorPicker.Area       (2D lightness × chroma canvas + bead)
  ├─ ColorPicker.Hue        (hue strip)
  ├─ ColorPicker.Lightness  (lightness strip)
  ├─ ColorPicker.Alpha      (alpha strip over checkerboard)
  ├─ ColorPicker.Preview    (fg-over-bg swatch on checkerboard)
  ├─ ColorPicker.CssInput   (single free-text CSS color field)
  ├─ ColorPicker.ChannelInput (per-channel numeric fields + format select)
  ├─ ColorPicker.Swatches   (preset grid, optional "add")
  ├─ ColorPicker.EyeDropper  (native EyeDropper button; self-hides if absent)
  ├─ ColorPicker.FormatSwitcher (standalone format dropdown)
  ├─ ColorPicker.GamutBadge  (sRGB / P3 / Rec.2020 / Out-of-gamut label)
  └─ ColorPicker.ContrastReadout (WCAG / APCA against `backgroundColor`)
```

### Root

`ColorPickerRoot` (`src/components/molecules/ColorPicker/parts/Root.tsx` ›
`ColorPickerRoot`) takes every `UseColorPickerProps` field plus `children` and
`className`. It calls `useColorPicker(pickerProps)` and publishes the resulting
`ColorPickerState` through `ColorPickerContext`
(`src/components/molecules/ColorPicker/ColorPickerContext.ts` ›
`ColorPickerContext`). Any part rendered outside a Root throws via
`useColorPickerContext`
(`src/components/molecules/ColorPicker/ColorPickerContext.ts` ›
`useColorPickerContext`). The Root's wrapper is a `flex w-full flex-col gap-3`
column.

### Interactive parts (Area / Hue / Lightness / Alpha)

| Part        | File (› symbol)                                                                     | Reads from state | Writes via                         |
| ----------- | ----------------------------------------------------------------------------------- | ---------------- | ---------------------------------- |
| `Area`      | `src/components/molecules/ColorPicker/parts/Area.tsx` › `ColorPickerArea`           | `color, format`  | `setColor` (chroma × lightness)    |
| `Hue`       | `src/components/molecules/ColorPicker/parts/Hue.tsx` › `ColorPickerHue`             | `color, format`  | `setColor` (hue, chroma re-scaled) |
| `Lightness` | `src/components/molecules/ColorPicker/parts/Lightness.tsx` › `ColorPickerLightness` | `color`          | `setComponent('l', …)`             |
| `Alpha`     | `src/components/molecules/ColorPicker/parts/Alpha.tsx` › `ColorPickerAlpha`         | `color`          | `setComponent('alpha', …)`         |

All four are pointer-driven sliders/canvases (`setPointerCapture`,
`onPointerMove` gated on `e.buttons !== 1`, `touch-none select-none`). Notable
behaviors:

- **Area** paints an OKLCH gradient into a `<canvas>` (default `resolution=128`)
  using a per-row max-chroma lookup table and the direct `oklchToLinearSrgb` +
  `srgbEncode` math from `lib/color.ts`, so the per-pixel cost is a single
  multiply. Its gamut follows the active format (`p3` → P3, `oklch`/`oklab` →
  Rec.2020, else sRGB). The X axis is **chroma as a fraction of the row's max
  chroma** and the Y axis is `1 - lightness`. Because every X collapses to
  chroma 0 at the lightness poles, Area tracks the user's picked bead position
  in local `pickPos` state and only clears it on a genuinely external color
  change (a `selfSetRef` flag distinguishes self-originated updates).
- **Hue** re-scales chroma when hue changes so perceived saturation is preserved
  (`saturation = oldChroma / oldMaxChroma`, then
  `newChroma = saturation × newMaxChroma`), using `findMaxChroma` /
  `gamutFromFormat`.
- **Lightness** rebuilds an 8-stop OKLCH gradient memoized on `color.h` /
  `color.c`.
- **Alpha** renders a checkerboard under a transparent→opaque gradient of the
  current color.

### Readout parts (Preview / GamutBadge / ContrastReadout)

- `Preview` (`src/components/molecules/ColorPicker/parts/Preview.tsx` ›
  `ColorPickerPreview`) stacks the current `color` over `background` on a
  checkerboard so alpha is visible.
- `GamutBadge` (`src/components/molecules/ColorPicker/parts/GamutBadge.tsx` ›
  `ColorPickerGamutBadge`) reads `gamut` and renders the tightest containing
  space: `sRGB` → `P3` → `Rec.2020` → `Out of gamut`.
- `ContrastReadout`
  (`src/components/molecules/ColorPicker/parts/ContrastReadout.tsx` ›
  `ColorPickerContrastReadout`) reads `contrast` and shows WCAG (and/or APCA)
  numbers, AA/AAA badges, and a `Tooltip` with pass/fail rows. `metrics` is
  togglable (`['wcag', 'apca']`); clicking cycles the active metric. Note: APCA
  is currently reported as `0` (see Limitations).

### Text/numeric entry parts (CssInput / ChannelInput / Swatches / EyeDropper / FormatSwitcher)

- `CssInput` (`src/components/molecules/ColorPicker/parts/CssInput.tsx` ›
  `ColorPickerCssInput`) is a single free-text field bound to `formatted`. It
  keeps a local `draft`, commits on blur/Enter via `setFromString`, reverts on
  Escape, and sets `aria-invalid` when the string does not parse.
- `ChannelInput` (`src/components/molecules/ColorPicker/parts/ChannelInput.tsx`
  › `ColorPickerChannelInput`) is the per-format numeric editor. It calls
  `colorChannels(color, format)` to get the channel list, renders a
  `ChannelField` per channel (with `↑`/`↓` arrow stepping, Shift for `bigStep`,
  paste-a-color detection), and writes back through `setColorChannel`. For `hex`
  it shows a single `HexField` instead. With `showFormat` (default `true`) it
  embeds a compact `Select` of `formats` that calls `setFormat`.
- `Swatches` (`src/components/molecules/ColorPicker/parts/Swatches.tsx` ›
  `ColorPickerSwatches`) renders a 10-column grid of `presets` (default
  `DEFAULT_PRESETS`); clicking one calls `setColor(preset)`. An optional `onAdd`
  callback adds a dashed "+" button that emits `(color, hex)`.
- `EyeDropper` (`src/components/molecules/ColorPicker/parts/EyeDropper.tsx` ›
  `ColorPickerEyeDropper`) feature-detects `window.EyeDropper`; it renders
  `null` when unsupported, otherwise a `Button` that opens the native dropper
  and feeds the sampled `sRGBHex` to `setColor`.
- `FormatSwitcher`
  (`src/components/molecules/ColorPicker/parts/FormatSwitcher.tsx` ›
  `ColorPickerFormatSwitcher`) is a standalone format `Select` (rendered inline
  for canvas/popover use) for layouts that keep the channel editor's own
  switcher off.

Each part accepts `className`; the size-bearing parts (`CssInput`,
`ChannelInput`, `EyeDropper`, `FormatSwitcher`) accept
`size?: 'normal' | 'small'` (default `'small'`).

## The hook (`useColorPicker`)

`useColorPicker` (`src/components/molecules/ColorPicker/hooks/useColorPicker.ts`
› `useColorPicker`) is the headless engine. Use it directly when you want a
bespoke layout without `ColorPicker.Root`, or read its shape to understand what
the parts consume.

### Props (`UseColorPickerProps`)

`src/components/molecules/ColorPicker/hooks/useColorPicker.ts` ›
`UseColorPickerProps`:

| Prop              | Type                                  | Default | Description                                                                                                             |
| ----------------- | ------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------- |
| `value`           | `string \| OklchColor`                | —       | Controlled color (presence makes the color controlled)                                                                  |
| `defaultValue`    | `string \| OklchColor`                | `BLACK` | Uncontrolled initial color                                                                                              |
| `onValueChange`   | `(color, formatted, formats) => void` | —       | Fires on any change; gets the OKLCH color, the active-format string, and a `Record<ColorFormat, string>` of all formats |
| `format`          | `ColorFormat`                         | —       | Controlled active format                                                                                                |
| `defaultFormat`   | `ColorFormat`                         | `'hex'` | Uncontrolled initial format (falls back to `formats[0]` if excluded)                                                    |
| `onFormatChange`  | `(format: ColorFormat) => void`       | —       | Fires when the format changes                                                                                           |
| `formats`         | `ColorFormat[]`                       | all 7   | Restrict the offered formats                                                                                            |
| `backgroundColor` | `string \| OklchColor`                | `WHITE` | Backdrop used for `Preview` and contrast math                                                                           |

Both color and format support the **controlled / uncontrolled** convention
independently (a defined `value`/`format` makes that axis controlled).

### Returned state (`ColorPickerState`)

`src/components/molecules/ColorPicker/hooks/useColorPicker.ts` ›
`ColorPickerState`:

| Member            | Type                                   | Purpose                                                                   |
| ----------------- | -------------------------------------- | ------------------------------------------------------------------------- |
| `color`           | `OklchColor`                           | Canonical current color                                                   |
| `format`          | `ColorFormat`                          | Active format                                                             |
| `formatted`       | `string`                               | `color` rendered in the active format                                     |
| `formats`         | `ColorFormat[]`                        | Offered formats                                                           |
| `formatStrings`   | `Record<ColorFormat, string>`          | All formats precomputed (memoized via `formatAll`)                        |
| `setColor`        | `(next: string \| OklchColor) => void` | Replace the color (strings are parsed; unparseable falls back)            |
| `setComponent`    | `(key, value: number) => void`         | Set one OKLCH component (`'l' \| 'c' \| 'h' \| 'alpha'`), clamped/wrapped |
| `adjustComponent` | `(key, delta: number) => void`         | Nudge one OKLCH component by a delta                                      |
| `setFormat`       | `(f: ColorFormat) => void`             | Switch format, clamping into the target gamut if needed                   |
| `setFromString`   | `(s: string) => boolean`               | Parse + commit a CSS string; returns `false` (and no-ops) on failure      |
| `gamut`           | `GamutInfo`                            | sRGB / P3 / Rec.2020 membership (memoized)                                |
| `contrast`        | `ContrastResult`                       | WCAG ratio + level flags + APCA, vs. `background` (memoized)              |
| `background`      | `OklchColor`                           | Resolved backdrop                                                         |

The component key type is `ColorComponent`
(`src/components/molecules/ColorPicker/hooks/useColorPicker.ts` ›
`ColorComponent`).

### Behavioral notes

- **Achromatic-hue preservation.** When the input is a controlled string and the
  resolved color is achromatic (chroma ≈ 0, or lightness at a pole), the hook
  substitutes the last non-achromatic hue (`lastGoodHueRef`) so the Hue strip
  and Area don't snap to red whenever the user passes through gray/black/white.
- **Format switch clamps gamut.** `setFormat` checks whether the current color
  is already inside the new format's gamut (`gamutFromFormat`) and, if not,
  calls `mapToGamut` (preserving hue) before committing — so switching to
  `hex`/`rgb` brings a wide-gamut color into sRGB.
- **`commitColor`** only writes internal state when the relevant axis is
  uncontrolled, and always notifies `onValueChange` with the full format map.

## Pure utilities

### `lib/color.ts` (parse / format / gamut)

`src/components/molecules/ColorPicker/lib/color.ts` is dependency-only on
`culori`. The three publicly re-exported functions:

| Function       | Signature                                            | Notes                                                                                                                                                                      |
| -------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parseColor`   | `(input: string) => OklchColor \| null`              | Parses any CSS color via `culori`, converts to OKLCH, clamps/sanitizes; `null` if unparseable (`src/components/molecules/ColorPicker/lib/color.ts` › `parseColor`)         |
| `formatColor`  | `(color: OklchColor, format: ColorFormat) => string` | Renders OKLCH into the target format; sRGB-family formats clamp into sRGB first, `p3` clamps into P3 (`src/components/molecules/ColorPicker/lib/color.ts` › `formatColor`) |
| `isValidColor` | `(input: string) => boolean`                         | `parseColor(input) !== null` (`src/components/molecules/ColorPicker/lib/color.ts` › `isValidColor`)                                                                        |

Internally (and used by the parts, not re-exported from the barrel) the file
also provides `formatAll`, `gamutInfo`, `mapToGamut`, `findMaxChroma`,
`gamutFromFormat`, `contrast`, and the fast-path canvas helpers
`oklchToLinearSrgb` / `srgbEncode` / `clampByte`. `mapToGamut`
(`src/components/molecules/ColorPicker/lib/color.ts` › `mapToGamut`) uses
`culori`'s `toGamut`; `findMaxChroma`
(`src/components/molecules/ColorPicker/lib/color.ts` › `findMaxChroma`) does a
14-iteration bisection for the cusp chroma at a given lightness/hue/gamut.

### `lib/channels.ts` (per-format channel descriptors)

`colorChannels` (`src/components/molecules/ColorPicker/lib/channels.ts` ›
`colorChannels`) returns the editable channels for a `(color, format)` pair, and
`setColorChannel` (`src/components/molecules/ColorPicker/lib/channels.ts` ›
`setColorChannel`) writes one channel back into a new `OklchColor`. The channel
shape is `ChannelDescriptor`
(`src/components/molecules/ColorPicker/lib/channels.ts` › `ChannelDescriptor`):

| Field       | Type      | Meaning                                 |
| ----------- | --------- | --------------------------------------- |
| `key`       | `string`  | Channel id (`'r'`, `'h'`, `'alpha'`, …) |
| `label`     | `string`  | Display label (`'R'`, `'H'`, `'α'`, …)  |
| `value`     | `number`  | Current display value                   |
| `min`/`max` | `number`  | Editable range                          |
| `step`      | `number`  | Arrow-key step                          |
| `bigStep`   | `number`  | Shift+arrow step                        |
| `precision` | `number`  | Decimal places (`0` = integer)          |
| `suffix`    | `string?` | Unit suffix (`'%'`)                     |

By format: `hex` → `[]` (single text field, handled by the part); `rgb` → R/G/B
(0–255) + α; `hsl`/`hsb` → H (0–360) + S/B|L (%) + α; `oklch` → L (%) / C
(float) / H + α; `oklab` → L (%) / a / b + α; `p3` → R/G/B (0–1 floats) + α.
Alpha is always the last channel, expressed as a `0`–`100` percentage.

## Public types

Re-exported from the barrel (`src/components/molecules/ColorPicker/index.ts`),
with the sole exception of `ContrastResult` (defined in `lib/types.ts` but not
forwarded by the barrel — see the note below the table):

| Type                      | Source (› symbol)                                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OklchColor`              | `src/components/molecules/ColorPicker/lib/types.ts` › `OklchColor`                                                                                |
| `ColorFormat`             | `src/components/molecules/ColorPicker/lib/types.ts` › `ColorFormat` (`'hex'\|'rgb'\|'hsl'\|'hsb'\|'oklch'\|'oklab'\|'p3'`)                        |
| `Gamut`                   | `src/components/molecules/ColorPicker/lib/types.ts` › `Gamut` (`'srgb'\|'p3'\|'rec2020'`)                                                         |
| `GamutInfo`               | `src/components/molecules/ColorPicker/lib/types.ts` › `GamutInfo` (`inSrgb`/`inP3`/`inRec2020`)                                                   |
| `ContrastResult`          | `src/components/molecules/ColorPicker/lib/types.ts` › `ContrastResult` (used by `ColorPickerState.contrast`; **not** re-exported from the barrel) |
| `ChannelDescriptor`       | `src/components/molecules/ColorPicker/lib/channels.ts` › `ChannelDescriptor`                                                                      |
| `UseColorPickerProps`     | `src/components/molecules/ColorPicker/hooks/useColorPicker.ts` › `UseColorPickerProps`                                                            |
| `ColorPickerState`        | `src/components/molecules/ColorPicker/hooks/useColorPicker.ts` › `ColorPickerState`                                                               |
| `PopoverColorPickerProps` | `src/components/molecules/ColorPicker/PopoverColorPicker.tsx` › `PopoverColorPickerProps`                                                         |

(`ContrastResult` is the type of `ColorPickerState.contrast`; `GamutInfo` is the
type of `ColorPickerState.gamut`. The barrel's type re-export forwards only
`OklchColor`, `ColorFormat`, `GamutInfo`, and `Gamut` from `lib/types.ts`, so
`ContrastResult` is reachable as a structural type only — it cannot be imported
by name from the barrel.)

## PopoverColorPicker

`PopoverColorPicker`
(`src/components/molecules/ColorPicker/PopoverColorPicker.tsx` ›
`PopoverColorPicker`) is the high-level, recommended entry point: a trigger
swatch that opens a floating panel pre-composed from the compound parts (Area,
Hue, optional Alpha, Preview + CssInput + EyeDropper row, ChannelInput, optional
Swatches).

### Props (`PopoverColorPickerProps`)

| Prop            | Type                    | Default          | Description                                                                                               |
| --------------- | ----------------------- | ---------------- | --------------------------------------------------------------------------------------------------------- |
| `value`         | `string`                | —                | Current color as a CSS string                                                                             |
| `onChange`      | `(hex: string) => void` | —                | Fires with the formatted string on every change (despite the param name, it is the active-format string)  |
| `defaultFormat` | `ColorFormat`           | `'hex'`          | Initial editing format                                                                                    |
| `showAlpha`     | `boolean`               | `false`          | Render the Alpha strip                                                                                    |
| `showSwatches`  | `boolean`               | `false`          | Render the preset Swatches grid                                                                           |
| `swatchPresets` | `string[]`              | part default     | Custom preset list when `showSwatches`                                                                    |
| `placement`     | `Placement`             | `'bottom-start'` | floating-ui placement                                                                                     |
| `renderInline`  | `boolean`               | `false`          | Render the popover inline (absolute) instead of via portal — used inside ReactFlow / transformed canvases |
| `className`     | `string`                | —                | Wrapper class                                                                                             |
| `size`          | `'normal' \| 'small'`   | `'small'`        | Trigger + panel density                                                                                   |

### Internal state design

The component holds its own `internalColor: OklchColor` and only re-syncs from
the external `value` prop on **external** changes. Self-originated edits (its
own sliders/area) set a `selfSetRef` flag that skips the next sync `useEffect`,
which prevents a hex round-trip from quantizing the user's in-progress OKLCH
value. Positioning uses `useFloating` with `offset(4)` / `flip` / `shift` and
`useTransitionStyles` (150ms scale/opacity), gated by `useClick` + `useDismiss`.
When `renderInline` is false the panel is portaled (`FloatingPortal`); when true
it is rendered in place with `position: absolute`.

## Usage example

Compound usage (full control over layout):

```tsx
import { ColorPicker } from '@/components/molecules/ColorPicker';
import type { OklchColor } from '@/components/molecules/ColorPicker';

function MyPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (formatted: string) => void;
}) {
  return (
    <ColorPicker.Root
      value={value}
      onValueChange={(_color: OklchColor, formatted) => onChange(formatted)}
      defaultFormat='hex'
      className='w-[260px]'
    >
      <ColorPicker.Area className='w-full aspect-square' />
      <ColorPicker.Hue />
      <ColorPicker.Alpha />
      <div className='flex items-center gap-1.5'>
        <ColorPicker.Preview className='w-5 h-5' />
        <ColorPicker.CssInput size='small' />
        <ColorPicker.EyeDropper size='small' />
      </div>
      <ColorPicker.ChannelInput size='small' />
      <ColorPicker.GamutBadge />
    </ColorPicker.Root>
  );
}
```

Popover usage (the common case):

```tsx
import { PopoverColorPicker } from '@/components/molecules/ColorPicker';

<PopoverColorPicker value={color} onChange={setColor} size='small' />;
```

Headless usage (your own UI, no parts):

```tsx
import { useColorPicker } from '@/components/molecules/ColorPicker';

const picker = useColorPicker({
  defaultValue: '#3366CC',
  defaultFormat: 'oklch',
});
// picker.color, picker.formatted, picker.setComponent('h', 200), picker.setFormat('rgb'), …
```

## Storybook stories (`title: 'Molecules/ColorPicker'`)

`src/components/molecules/ColorPicker/ColorPicker.stories.tsx` covers both
shapes via an `InlinePickerShell` helper:

- `Popover (recommended)`, `PopoverWithAlphaAndSwatches` — the
  `PopoverColorPicker` paths.
- `Canonical`, `Compact`, `Minimal`, `SlidersOnly`, `AreaOnly`, `Framer`,
  `Figma`, `A11yReview`, `WithPreview`, `AllParts` — different compound-part
  compositions (the recurring layout names mirror popular pickers).

## Consumer context (editor drawers)

The subsystem's primary in-app consumer is the **NodeType edit drawer**:
`NodeTypeEditDrawer`
(`src/components/molecules/NodeTypeEditDrawer/NodeTypeEditDrawer.tsx` ›
`NodeTypeEditDrawer`) renders a `PopoverColorPicker` (`size='small'`) under a
"Header Color" label, but only when the node type actually carries a header
color (`localHeaderColor !== null`). The drawer keeps the picked string in local
draft state and persists it through its save handler. See
[editorsDoc.md](editorsDoc.md) for the drawer skeleton and save flow.

## Limitations and notes

1. **APCA is a placeholder.** `contrast` returns `apca: 0`
   (`src/components/molecules/ColorPicker/lib/color.ts` › `contrast`), so the
   `ContrastReadout`'s APCA metric and `Lc` readout are not yet real values even
   though the UI can toggle to them.
2. **`onChange`/`onValueChange` emit the active-format string.** Despite the
   `(hex: string)` parameter name on `PopoverColorPickerProps.onChange`, the
   emitted string follows the current format, not necessarily hex.
3. **No keyboard interaction on Area/Hue/Lightness/Alpha.** These are
   pointer-only (`onPointerDown`/`onPointerMove`); arrow-key stepping exists
   only on the numeric `ChannelInput` fields.
4. **Eye dropper is browser-gated.** `EyeDropper` self-hides where
   `window.EyeDropper` is unavailable (currently Chromium-family browsers).
5. **Wide-gamut display fidelity depends on the environment.** The picker can
   represent and report P3 / Rec.2020 colors, but CSS rendering of those
   swatches still depends on the display and browser; sRGB-family format strings
   are gamut clamped on output.

## Relationships with other features

### -> [Input Components](inputComponentsDoc.md)

ColorPicker is a molecule in the same `@/components/molecules` family as
`Select` and `SliderNumberInput`. It is **not** wired into `ContextAwareInput`'s
type dispatch as a built-in handle widget; a color handle would surface it
through the `unsupportedDirectly` input registry (a registered component keyed
by `dataType.dataTypeUniqueId`) rather than a dedicated input `type`.

### -> [Editor Drawers](editorsDoc.md)

`NodeTypeEditDrawer` embeds `PopoverColorPicker` for the node-type header color.
The drawer owns the open/close lifecycle and the save; the picker only emits the
formatted string.

### -> [Select molecule](inputComponentsDoc.md)

`ChannelInput` and `FormatSwitcher` build their format dropdowns from the
project `Select` (`src/components/molecules/Select/Select.tsx` › `Select`),
reusing its `compact`/`normal` sizing and inline-render mode.

### -> [Tooltip primitive](uiPrimitivesDoc.md)

`ContrastReadout` uses the `Tooltip` atom
(`src/components/atoms/Tooltip/Tooltip.tsx` › `Tooltip`) to surface its
WCAG/APCA pass-fail detail panel.

### -> [floating-ui (external)](../external/storybookDoc.md)

`PopoverColorPicker` is built on `@floating-ui/react` (`useFloating`, `offset` /
`flip` / `shift`, `useClick`, `useDismiss`, `useTransitionStyles`,
`FloatingPortal`) — the same positioning stack the `Select` molecule uses — and
relies on `culori` for all color-space conversion math.
