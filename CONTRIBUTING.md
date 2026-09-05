# Contributing to React Blender Nodes

Thank you for your interest in contributing to React Blender Nodes! This guide
will help you get started with development and understand our contribution
process.

## 🚀 Getting Started

### Prerequisites

- Node.js 20+ and npm
- Git
- A code editor (VS Code recommended)

### Development Setup

1. **Fork and clone the repository**

   ```bash
   git clone https://github.com/your-username/react-blender-nodes.git
   cd react-blender-nodes
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Run Storybook for development**

   Storybook is the primary development environment — it renders every component
   (including the full graph editor and runner) in isolation with live controls.

   ```bash
   npm run storybook
   ```

   Visit `http://localhost:6006` once it starts.

## 🛠️ Development Commands

```bash
# Development
npm run storybook        # Start Storybook (primary dev environment)
npm run build-storybook  # Build the static Storybook site
npm run build            # Build the library (tsc -b, vite build, then the two dist gates)
npm run type-check       # Run TypeScript type checking (tsc --noEmit)

# Code Quality
npm run lint             # Run ESLint
npm run lint:fix         # Fix ESLint issues
npm run pretty           # Format code with Prettier
npm run pretty:check     # Check code formatting
npm run find-dead-code   # Find unused exports/files with Knip (alias: ded)

# Testing
npm run test             # Run unit tests once (Vitest)
npm run test:unit        # Run unit tests once
npm run test:unit:watch  # Run unit tests in watch mode
npm run test:e2e:dev     # Run Playwright e2e tests against dev Storybook
npm run test:e2e:build   # Run e2e tests against a freshly built Storybook
npm run test:e2e:built   # Run e2e tests against an already-built Storybook
npm run test:e2e:ui      # Open the Playwright UI runner
npm run report           # Open the last Playwright HTML report

# Convenience
npm run checklist        # Full pre-publish check: install, prepare hooks, format, build, build Storybook (alias: cl)
```

Append `:h` to any `test:e2e:*` command (e.g. `npm run test:e2e:dev:h`) to run
it in headed mode.

## 📁 Project Structure

```
react-blender-nodes/
├── src/
│   ├── components/                 # Component library organized by atomic design
│   │   ├── atoms/                  # Basic building blocks
│   │   │   ├── Button/             # Reusable button component
│   │   │   ├── Accordion/          # Collapsible sections
│   │   │   ├── Checkbox/           # Checkbox control
│   │   │   ├── ConfigurableConnection/ # In-progress connection line
│   │   │   ├── ConfigurableEdge/   # Edge/connection rendering
│   │   │   ├── ErrorBoundary/      # Render error boundary
│   │   │   ├── Input/              # Text/number input
│   │   │   ├── Modal/              # Modal dialog
│   │   │   ├── NodeResizerWithMoreControls/ # Node resizing controls
│   │   │   ├── NodeStatusIndicator/ # Runner status badge on nodes
│   │   │   ├── ScrollableButtonContainer/
│   │   │   └── Tooltip/
│   │   ├── molecules/              # Composed components
│   │   │   ├── ButtonToggle/
│   │   │   ├── ColorPicker/
│   │   │   ├── ContextMenu/        # Right-click add-node menu
│   │   │   ├── DragList/           # Reorderable list (handle editing)
│   │   │   ├── ExecutionStepInspector/ # Per-step input/output inspector
│   │   │   ├── ExecutionTimeline/  # Multi-track runner timeline
│   │   │   ├── LoopEditDrawer/     # Loop structure editor
│   │   │   ├── NodeTypeEditDrawer/ # Node type editor
│   │   │   ├── PresetModal/
│   │   │   ├── RunControls/        # Run / step / pause / resume controls
│   │   │   ├── Select/
│   │   │   ├── SliderNumberInput/  # Combined slider + number input
│   │   │   ├── SwitchEditDrawer/   # Switch structure editor
│   │   │   └── ZoneFrameOverlay/   # Loop/switch zone frame rendering
│   │   └── organisms/              # Complex components
│   │       ├── ConfigurableNode/   # Main node component
│   │       ├── FullGraph/          # Complete graph editor (state, history, drawers)
│   │       └── NodeRunnerPanel/    # Runner UI shell (timeline + inspector + controls)
│   ├── hooks/                      # Custom React hooks
│   │   ├── useAutoScroll.ts        # Auto-scroll a container during live runs
│   │   ├── useClickedOutside.ts    # Click-outside detection
│   │   ├── useDrag.ts              # Drag interaction hook
│   │   ├── useFloatingTooltip.ts   # Floating UI tooltip positioning
│   │   ├── useResizeHandle.ts      # Resize-handle drag hook
│   │   └── useSlideAnimation.ts    # Drawer slide animation
│   ├── utils/                      # Utility functions
│   │   ├── nodeStateManagement/    # State, reducer, validation, history
│   │   │   ├── planApply/          # validateAction → plan → applyPlan pipeline
│   │   │   ├── nodes/              # Node construction + switch structures
│   │   │   ├── edges/              # Edge helpers
│   │   │   ├── handles/            # Handle construction
│   │   │   ├── zones/              # First-class zone discovery + lifecycle
│   │   │   ├── graphEvent.ts       # Graph event stream taxonomy
│   │   │   ├── applyWithHistory.ts # Undo/redo patch recording
│   │   │   └── standardNodes.ts    # Built-in loop/switch/group nodes & data types
│   │   ├── nodeRunner/             # Graph execution
│   │   │   ├── compiler.ts         # Graph → execution plan
│   │   │   ├── loopCompiler.ts     # Loop body compilation
│   │   │   ├── switchCompiler.ts   # Branch resolution
│   │   │   ├── groupCompiler.ts    # Node group subtree resolution
│   │   │   ├── executor/           # Plan execution engine
│   │   │   ├── executionRecorder.ts# Per-step timing + I/O recording
│   │   │   └── useNodeRunner.ts    # Runner hook (entry point of the runner module)
│   │   ├── importExport/           # JSON state + recording import/export & repair
│   │   ├── cnHelper.ts             # Class name utility
│   │   ├── geometry.ts             # Geometric calculations
│   │   └── conversions.ts          # Type conversions
│   ├── index.ts                    # Main library entry point
│   └── index.css                   # Global styles
├── e2e/                            # Playwright end-to-end tests (against Storybook)
├── .storybook/                     # Storybook configuration
├── .github/                        # GitHub workflows
├── docs/                           # Architecture docs (see docs/index.md) and screenshots
└── dist/                           # Built library (generated)
```

## 🧩 Component Architecture

### Atomic Design Pattern

This library follows atomic design methodology:

- **Atoms**: Basic UI elements (Button, Input, ConfigurableEdge, Tooltip,
  NodeStatusIndicator)
- **Molecules**: Simple component groups (SliderNumberInput, ContextMenu, the
  edit drawers, ExecutionTimeline, RunControls)
- **Organisms**: Complex components (ConfigurableNode, FullGraph,
  NodeRunnerPanel)

### Key Design Principles

1. **Composition over Inheritance**: Components are built by composing smaller
   parts
2. **Props Interface**: Clear, typed interfaces for all component props
3. **Forward Refs**: Components that need to expose their DOM element use
   `forwardRef` (it is the exception, not the default)
4. **TypeScript First**: Full type safety throughout the codebase

## 📝 Code Style Guidelines

### TypeScript

- Use explicit types for all function parameters and return values
- Prefer `const` over `function` declarations
- Use discriminated unions for complex type scenarios
- Avoid `any` - use `unknown` or specific types instead

```tsx
// ✅ Good
const MyComponent = forwardRef<HTMLDivElement, MyComponentProps>(
  ({ name, value, onChange }, ref) => {
    // Component implementation
  },
);

// ❌ Avoid
function MyComponent(props: any) {
  // Implementation
}
```

### React Patterns

- Declare components as plain `function`s; use `forwardRef` only when a
  component needs to expose its DOM element to a parent
- Implement proper `displayName` for debugging
- Use `useCallback` and `useMemo` for performance optimization
- Follow the custom hook naming convention (`use` prefix)

### Styling

- Use Tailwind CSS utility classes
- Follow the `cn()` helper pattern for conditional classes
- Maintain consistent spacing and color usage
- Use CSS variables for theme customization

```tsx
// ✅ Good
<div className={cn(
  'flex items-center gap-2 px-3 py-2',
  isActive && 'bg-primary-gray',
  className
)} />

// ❌ Avoid
<div className={`flex items-center gap-2 px-3 py-2 ${isActive ? 'bg-primary-gray' : ''}`} />
```

## 🧪 Testing Strategy

The project uses three complementary layers. Run all three (plus type-check and
build) before opening a PR.

### Unit Tests (Vitest)

- Cover state management, validation, the runner compiler/executor, and
  import/export logic
- Live under `src/__tests__/` (mirroring the `src/utils/` tree) as `*.test.ts`
  files, configured via `vitest.config.ts`
- Run with `npm run test` (single run) or `npm run test:unit:watch` (watch mode)

### Stories (Storybook)

- Write Storybook stories for all components
- Include interactive controls for props
- Test edge cases and error states
- Document component behavior

### End-to-End Tests (Playwright)

- Live in `e2e/` and drive the rendered Storybook to verify real interactions
  (adding nodes, connecting handles, running graphs, undo/redo)
- Run against the dev server with `npm run test:e2e:dev`, or against a built
  Storybook with `npm run test:e2e:build`
- View the last report with `npm run report`

### Story Structure

```tsx
// Component.stories.tsx
export const Playground = {
  args: {
    // Default props
  },
} satisfies Story;

export const WithCustomProps = {
  args: {
    // Custom configuration
  },
} satisfies Story;
```

## 🐛 Bug Reports

When reporting bugs, please include:

1. **Clear description** of the issue
2. **Steps to reproduce** the problem
3. **Expected vs actual behavior**
4. **Environment details** (OS, browser, Node version)
5. **Code example** if applicable
6. **Screenshots** for visual issues

## 💡 Feature Requests

For new features, please:

1. **Check existing issues** to avoid duplicates
2. **Describe the use case** and motivation
3. **Provide examples** of how it would work
4. **Consider backward compatibility**
5. **Discuss implementation approach** if you have ideas

## 🔄 Pull Request Process

### Before Submitting

1. **Create a feature branch** from `main`

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following the code style guidelines

3. **Add tests/stories** for new functionality

4. **Update documentation** if needed

5. **Run quality checks**
   ```bash
   npm run lint
   npm run pretty:check
   npm run type-check
   npm run test
   npm run build
   ```

### PR Guidelines

- **Clear title** describing the change
- **Detailed description** of what was changed and why
- **Link related issues** using keywords like "Fixes #123"
- **Include screenshots** for UI changes
- **Keep PRs focused** - one feature/fix per PR
- **Update documentation** as needed

### Review Process

1. **Automated checks** must pass (linting, type checking, unit + e2e tests,
   build)
2. **Code review** by maintainers
3. **Manual verification** in Storybook
4. **Approval** and merge

## 🏗️ Building and Publishing

### Local Build

```bash
npm run build
```

This creates the `dist/` folder with:

- `react-blender-nodes.es.js` - the library, ES module (`main` / `module` /
  `exports["."].default`)
- `react-blender-nodes-contract.es.js` - the React-free `/contract` subpath
  (`exports["./contract"].default`)
- `*-[hash].js` - chunks holding the modules the two entries share (Rollup
  hoists them; consumers never import these directly)
- `react-blender-nodes.css` - Compiled styles (`exports["./style.css"]`)
- `index.d.ts` - TypeScript declarations (rolled, self-contained)
- `contract.d.ts` - TypeScript declarations for `/contract` (rolled,
  self-contained)

The package is **ESM-only** (since 0.0.13). The `default` export condition
serves both `import` and `require`: Node ≥ 20.19 / 22.12 `require()`s an ES
module natively, and older Node gets a clear `ERR_REQUIRE_ESM` rather than a
silently wrong bundle. Both entries come out of ONE `vite build`; there is no
separate contract build.

### Build gates

`npm run build` is more than compile-and-bundle — it ends with two
artifact-level gates that run on every build (locally and in CI, and therefore
on the exact workspace the deploy job publishes from):

- **`scripts/check-dist-types.ts`** — re-type-checks the rolled
  `dist/index.d.ts` + `dist/contract.d.ts` with `skipLibCheck: false`, the way a
  consumer compiles against them. Catches import specifiers that escape the
  published package (which silently degrade exported types to `any` for
  consumers).
- **`scripts/check-dist-loads.ts`** — verifies every file the manifest points at
  exists in `dist/`, that `main`/`module` cohere with the ESM root entry in
  `exports["."]`, that the `/contract` entry and every chunk it imports stay
  React-free, then EXECUTES both entry bundles (root + `/contract`) in isolated
  child processes and checks export sentinels. Catches manifest/filename
  mismatches, a React module leaking into the headless surface through a shared
  chunk, and import-time crashes such as circular-import TDZ `ReferenceError`s —
  classes of breakage that type-checking and unit tests never touch.

If a gate fails, fix the cause — never weaken or skip the gate.

### Publishing (Maintainers Only)

Publishing is **CI-only**. Pushing to `main` runs the deploy workflow, which
re-runs `npm ci` + `npm run build` (including both gates above) in a clean
environment and publishes that same workspace to npm under OIDC trusted
publishing (`npm publish --provenance`, no long-lived token). There is no manual
publish path: bump the version in `package.json`, land the change on `main`, and
CI publishes. Never push `main` without a version bump — the publish step fails
on an already-published version.

### Codegen plugin — how the two packages relate

Code generation lives in a SEPARATE package,
`@theclearsky/react-blender-nodes-codegen`, which peer-depends on THIS library
(`>=0.0.13 <1`) and imports only its React-free
`@theclearsky/react-blender-nodes/contract` subpath at runtime. The dependency
is strictly one-way: **this library does not depend on the plugin** — no `file:`
link, no devDependency, no imports. The plugin owns its Storybook (the
CodegenStudio) and its host-contract tests; this library's Storybook embeds the
studio by URL (an `<iframe>` into the plugin's own GitHub Pages site), so no
AGPL code enters this MIT artifact.

For that, this library exports `compile` and `serializeExecutionPlan` from its
root barrel (`src/utils/index.ts`) — the plugin's studio compiles a graph and
inspects the resulting `ExecutionPlan` through public API, never internals.

Release order (every step is an ordinary single-checkout CI publish; nothing is
bootstrapped):

1. **This library publishes first** — it has no upstream. `npm run build` ends
   by EXECUTING both dist bundles (`scripts/check-dist-loads.ts`), so an
   import-time barrel-cycle `ReferenceError` cannot ship again (0.0.9–0.0.11
   did, and are deprecated on the registry).
2. **The plugin publishes second**, resolving this library from the registry.
3. A later change to the contract surface is an additive publish here, then a
   peer-range bump there.

## 🎨 Design System

### Color Palette

The library uses a Blender-inspired color scheme, defined as Tailwind theme
tokens (`--color-*`) in `src/index.css`:

```css
@theme inline {
  --color-primary-white: #e6e6e6; /* text */
  --color-primary-black: #1d1d1d; /* base background */
  --color-secondary-black: #282828; /* dark button background */
  --color-primary-dark-gray: #303030; /* node background, hover dark button */
  --color-secondary-dark-gray: #444444; /* dark button border */
  --color-primary-gray: #545454; /* light button background */
  --color-secondary-light-gray: #656565; /* light button non-priority hover */
  --color-primary-light-gray: #797979; /* light button priority hover */
  --color-primary-blue: #4772b3; /* slider blue */
}
```

### Typography

- **Font Family**: `DejaVu Sans` (bundled via `@fontsource/dejavu-sans`),
  falling back to `Roboto` then `sans-serif` (exposed as the `--font-main` token
  / `font-main` utility)
- **Font Sizes**: Consistent scale using Tailwind classes
- **Line Heights**: Optimized for readability

### Spacing

- **Base Unit**: 4px (Tailwind's default)
- **Component Padding**: 12px (3 units)
- **Gap Between Elements**: 8px (2 units)

## 🔧 Development Tools

### VS Code Extensions

Recommended extensions for development:

- **ES7+ React/Redux/React-Native snippets**
- **Tailwind CSS IntelliSense**
- **TypeScript Importer**
- **Prettier - Code formatter**
- **ESLint**

### Debugging

- Use React DevTools for component debugging
- Storybook provides isolated component testing
- Browser DevTools for styling and performance

## 📚 Resources

- [React Documentation](https://react.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Tailwind CSS Docs](https://tailwindcss.com/docs)
- [ReactFlow Documentation](https://reactflow.dev/)
- [Storybook Documentation](https://storybook.js.org/docs)

## ❓ Questions?

- **GitHub Discussions**: For general questions and ideas
- **GitHub Issues**: For bugs and feature requests
- **Discord/Slack**: (If available) for real-time chat

Thank you for contributing to React Blender Nodes! 🎉
