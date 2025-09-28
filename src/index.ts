/**
 * @fileoverview Main entry point for React Blender Nodes library
 *
 * This module exports all components, utilities, and hooks from the library,
 * providing a complete node-based graph editor solution inspired by Blender.
 *
 * @example
 * ```tsx
 * import {
 *   FullGraph,
 *   useFullGraph,
 *   makeStateWithAutoInfer,
 *   makeTypeOfNodeWithAutoInfer,
 *   makeDataTypeWithAutoInfer
 * } from 'react-blender-nodes';
 * import 'react-blender-nodes/style.css';
 *
 * function MyNodeEditor() {
 *   // Define data types with auto-infer for type safety
 *   const dataTypes = {
 *     stringType: makeDataTypeWithAutoInfer({
 *       name: 'String',
 *       underlyingType: 'string',
 *       color: '#4A90E2',
 *     }),
 *     numberType: makeDataTypeWithAutoInfer({
 *       name: 'Number',
 *       underlyingType: 'number',
 *       color: '#E74C3C',
 *     }),
 *   };
 *
 *   // Define node types with auto-infer for type safety
 *   const typeOfNodes = {
 *     inputNode: makeTypeOfNodeWithAutoInfer({
 *       name: 'Input Node',
 *       headerColor: '#C44536',
 *       inputs: [
 *         { name: 'Input', dataType: 'stringType', allowInput: true }
 *       ],
 *       outputs: [
 *         { name: 'Output', dataType: 'stringType' }
 *       ],
 *     }),
 *     outputNode: makeTypeOfNodeWithAutoInfer({
 *       name: 'Output Node',
 *       headerColor: '#2D5A87',
 *       inputs: [
 *         { name: 'Input', dataType: 'stringType' }
 *       ],
 *       outputs: [],
 *     }),
 *   };
 *
 *   // Create state with auto-infer for complete type safety
 *   const initialState = makeStateWithAutoInfer({
 *     dataTypes,
 *     typeOfNodes,
 *     nodes: [],
 *     edges: [],
 *   });
 *
 *   const { state, dispatch } = useFullGraph(initialState);
 *
 *   return (
 *     <div style={{ height: '600px' }}>
 *       <FullGraph state={state} dispatch={dispatch} />
 *     </div>
 *   );
 * }
 * ```
 */

// Export all components (atoms, molecules, organisms)
export * from './components';

// Export all utility functions and types
export * from './utils';

// Export all custom hooks
export * from './hooks';

// Import global styles and fonts
import './index.css';
import '@fontsource/dejavu-sans';
