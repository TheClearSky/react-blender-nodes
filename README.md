# React Blender Nodes

A React component library inspired by Blender's node editor interface, providing
a flexible and customizable node-based graph editor for web applications.

## 🎯 Overview

React Blender Nodes is a React library that recreates the iconic Blender node
editor experience on the web. Built with modern React patterns and TypeScript,
it offers a complete solution for creating interactive node-based interfaces
with support for custom nodes, connections, and real-time manipulation.

## ✨ Features

- **Blender-inspired UI**: Authentic node editor experience with dark theme and
  familiar interactions
- **Fully Customizable Nodes**: Create nodes with custom inputs, outputs, and
  styling
- **Interactive Graph Editor**: Pan, zoom, select, and manipulate nodes with
  intuitive controls
- **TypeScript Support**: Full type safety with comprehensive type definitions
- **Storybook Integration**: Interactive component documentation and testing
- **Modular Architecture**: Atomic design pattern with reusable components
- **Modern React**: Built with React 19+ and modern hooks patterns

## 🚀 Quick Start

```bash
npm install react-blender-nodes
```

```tsx
import { FullGraph } from 'react-blender-nodes';
import 'react-blender-nodes/style.css';

function App() {
  const nodes = [
    {
      id: '1',
      type: 'configurableNode',
      position: { x: 100, y: 100 },
      data: {
        name: 'Input Node',
        outputs: [{ id: 'output-1', name: 'Value', type: 'number' }],
      },
    },
  ];

  return (
    <div style={{ height: '500px' }}>
      <FullGraph nodes={nodes} edges={[]} />
    </div>
  );
}
```

## 📁 Project Structure

```
react-blender-nodes/
├── src/
│   ├── components/                 # Component library organized by atomic design
│   │   ├── atoms/                  # Basic building blocks (buttons, handles, etc.)
│   │   │   ├── Button/             # Reusable button component
│   │   │   ├── ConfigurableConnection/ # Node connection line component
│   │   │   ├── ConfigurableEdge/   # Edge/connection rendering component
│   │   │   └── NodeResizerWithMoreControls/ # Node resizing controls
│   │   ├── molecules/              # Composed components (input groups, controls)
│   │   │   └── SliderNumberInput/  # Combined slider and number input
│   │   └── organisms/              # Complex components (full nodes, graph)
│   │       ├── ConfigurableNode/   # Main node component with inputs/outputs
│   │       └── FullGraph/          # Complete graph editor with ReactFlow
│   ├── hooks/                      # Custom React hooks
│   │   ├── useClickedOutside.ts    # Click outside detection hook
│   │   └── index.ts                # Hook exports
│   ├── utils/                      # Utility functions and helpers
│   │   ├── nodeStateManagement/    # State management for node operations
│   │   │   ├── mainReducer.ts      # Main state reducer
│   │   │   └── types.ts            # State management types
│   │   ├── cnHelper.ts             # Class name utility (tailwind-merge)
│   │   ├── geometry.ts             # Geometric calculations
│   │   └── index.ts                # Utility exports
│   ├── @types/                     # TypeScript type definitions
│   │   └── globals.d.ts            # Global type declarations
│   ├── index.ts                    # Main library entry point
│   └── index.css                   # Global styles and CSS variables
├── dist/                           # Built library files (generated)
├── storybook-static/               # Built Storybook documentation (generated)
├── .storybook/                     # Storybook configuration
├── .github/                        # GitHub workflows and templates
├── node_modules/                   # Dependencies (generated)
├── package.json                    # Project configuration and dependencies
├── vite.config.ts                  # Vite bundler configuration
├── tsconfig.json                   # TypeScript configuration
├── components.json                 # Shadcn/ui component configuration
├── eslint.config.js               # ESLint linting rules
└── .prettierrc                    # Code formatting configuration
```

## 🧩 Component Architecture

### Atomic Design Pattern

This library follows the atomic design methodology:

- **Atoms**: Basic UI elements that cannot be broken down further (Button,
  Handle, Edge)
- **Molecules**: Simple groups of atoms functioning together (SliderNumberInput)
- **Organisms**: Complex UI components composed of molecules and atoms
  (ConfigurableNode, FullGraph)

### Key Components

- **FullGraph**: The main graph editor component with pan, zoom, and node
  management
- **ConfigurableNode**: Customizable node component with dynamic inputs and
  outputs
- **SliderNumberInput**: Combined slider and number input for precise value
  control
- **NodeResizerWithMoreControls**: Enhanced node resizing with additional
  controls

## 🛠️ Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run Storybook
npm run storybook

# Build library
npm run build

# Run linting
npm run lint

# Format code
npm run pretty
```

## 📚 Documentation

Interactive component documentation is available via Storybook:

```bash
npm run storybook
```

Visit `http://localhost:6006` to explore all components with live examples and
controls.

## 🎨 Styling

The library uses:

- **Tailwind CSS** for utility-first styling
- **React flow** for nodes base

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines and ensure
all tests pass before submitting a PR.

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

- **Blender Foundation**: For creating the amazing Blender software that
  inspired this project
- **ReactFlow**: For providing the foundation for the graph editor functionality
- **Shadcn/ui**: For the component design system and utilities

> **Note**: This project is not affiliated with Blender Foundation. If you find
> Blender useful, consider
> [donating to support their work](https://fund.blender.org/).

## 🔗 Links

- [Blender Official Repository](https://projects.blender.org/blender/blender.git)
- [Support Blender Foundation](https://fund.blender.org/)
