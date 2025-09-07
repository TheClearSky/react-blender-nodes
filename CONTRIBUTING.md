# Contributing to React Blender Nodes

Thank you for your interest in contributing to React Blender Nodes! This guide
will help you get started with development and understand our contribution
process.

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm
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

3. **Start the development server**

   ```bash
   npm run dev
   ```

4. **Run Storybook for component development**
   ```bash
   npm run storybook
   ```

## 🛠️ Development Commands

```bash
# Development
npm run storybook        # Start Storybook documentation
npm run build            # Build the library
npm run type-check       # Run TypeScript type checking

# Code Quality
npm run lint             # Run ESLint
npm run lint:fix         # Fix ESLint issues
npm run pretty           # Format code with Prettier
npm run pretty:check     # Check code formatting

# Testing
npm run test             # Run tests (when implemented)
npm run test:watch       # Run tests in watch mode
```

## 📁 Project Structure

```
react-blender-nodes/
├── src/
│   ├── components/                 # Component library organized by atomic design
│   │   ├── atoms/                  # Basic building blocks
│   │   │   ├── Button/             # Reusable button component
│   │   │   ├── ConfigurableConnection/ # Node connection line component
│   │   │   ├── ConfigurableEdge/   # Edge/connection rendering component
│   │   │   ├── Input/              # Text/number input component
│   │   │   └── NodeResizerWithMoreControls/ # Node resizing controls
│   │   ├── molecules/              # Composed components
│   │   │   ├── SliderNumberInput/  # Combined slider and number input
│   │   │   └── ContextMenu/        # Context menu component
│   │   └── organisms/              # Complex components
│   │       ├── ConfigurableNode/   # Main node component
│   │       └── FullGraph/          # Complete graph editor
│   ├── hooks/                      # Custom React hooks
│   │   ├── useClickedOutside.ts    # Click outside detection
│   │   └── useDrag.ts              # Drag interaction hook
│   ├── utils/                      # Utility functions
│   │   ├── nodeStateManagement/    # State management
│   │   ├── cnHelper.ts             # Class name utility
│   │   ├── geometry.ts             # Geometric calculations
│   │   └── conversions.ts          # Type conversions
│   ├── @types/                     # TypeScript definitions
│   ├── index.ts                    # Main library entry point
│   └── index.css                   # Global styles
├── .storybook/                     # Storybook configuration
├── .github/                        # GitHub workflows
├── docs/                           # Documentation and screenshots
└── dist/                           # Built library (generated)
```

## 🧩 Component Architecture

### Atomic Design Pattern

This library follows atomic design methodology:

- **Atoms**: Basic UI elements (Button, Handle, Edge, Input)
- **Molecules**: Simple component groups (SliderNumberInput, ContextMenu)
- **Organisms**: Complex components (ConfigurableNode, FullGraph)

### Key Design Principles

1. **Composition over Inheritance**: Components are built by composing smaller
   parts
2. **Props Interface**: Clear, typed interfaces for all component props
3. **Forward Refs**: All components support ref forwarding
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

- Use `forwardRef` for all components that render DOM elements
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

### Component Testing

- Write Storybook stories for all components
- Include interactive controls for props
- Test edge cases and error states
- Document component behavior

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

1. **Automated checks** must pass (linting, type checking, build)
2. **Code review** by maintainers
3. **Testing** in Storybook
4. **Approval** and merge

## 🏗️ Building and Publishing

### Local Build

```bash
npm run build
```

This creates the `dist/` folder with:

- `react-blender-nodes.es.js` - ES module build
- `react-blender-nodes.umd.js` - UMD build
- `react-blender-nodes.css` - Compiled styles
- `index.d.ts` - TypeScript declarations

### Publishing (Maintainers Only)

```bash
npm version patch|minor|major
npm publish
```

## 🎨 Design System

### Color Palette

The library uses a Blender-inspired color scheme:

```css
:root {
  --primary-black: #181818;
  --primary-dark-gray: #272727;
  --primary-gray: #3f3f3f;
  --primary-white: #ffffff;
  --secondary-black: #0d1117;
  --secondary-dark-gray: #21262d;
  --secondary-light-gray: #f0f6fc;
}
```

### Typography

- **Font Family**: System fonts with fallbacks
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
