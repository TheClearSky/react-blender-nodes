import { forwardRef } from 'react';
import { type NodeProps, type Node } from '@xyflow/react';
import {
  type ConfigurableNodeProps,
  ConfigurableNode,
} from './ConfigurableNode';

/** State type for configurable nodes in ReactFlow */
type ConfigurableNodeState = Node<
  Omit<ConfigurableNodeProps, 'isCurrentlyInsideReactFlow'>,
  'configurableNode'
>;

/** Props for the ConfigurableNodeReactFlowWrapper component */
type ConfigurableNodeReactFlowWrapperProps = NodeProps<ConfigurableNodeState>;

/**
 * ReactFlow wrapper for the ConfigurableNode component
 *
 * This component wraps the ConfigurableNode for use within ReactFlow.
 * It automatically sets the isCurrentlyInsideReactFlow prop to true and
 * applies ReactFlow-specific styling and behavior.
 *
 * Features:
 * - Automatic ReactFlow integration
 * - Full-width styling for ReactFlow context
 * - Proper handle and interaction setup
 * - Node resizing controls
 * - Connection management
 *
 * @param props - The component props
 * @param ref - Forwarded ref to the node element
 * @returns JSX element containing the wrapped configurable node
 *
 * @example
 * ```tsx
 * // Used as a node type in ReactFlow
 * const nodeTypes = {
 *   configurableNode: ConfigurableNodeReactFlowWrapper,
 * };
 *
 * <ReactFlow
 *   nodeTypes={nodeTypes}
 *   nodes={[
 *     {
 *       id: 'node1',
 *       type: 'configurableNode',
 *       position: { x: 100, y: 100 },
 *       data: {
 *         name: 'My Node',
 *         headerColor: '#C44536',
 *         inputs: [{ id: 'input1', name: 'Input', type: 'string' }],
 *         outputs: [{ id: 'output1', name: 'Output', type: 'string' }],
 *       },
 *     },
 *   ]}
 * />
 * ```
 */
const ConfigurableNodeReactFlowWrapper = forwardRef<
  HTMLDivElement,
  ConfigurableNodeReactFlowWrapperProps
>(({ data = {} }, ref) => {
  return (
    <ConfigurableNode
      isCurrentlyInsideReactFlow={true}
      className='w-full'
      {...data}
      ref={ref}
    />
  );
});

ConfigurableNodeReactFlowWrapper.displayName =
  'ConfigurableNodeReactFlowWrapper';

export { ConfigurableNodeReactFlowWrapper };

export type { ConfigurableNodeReactFlowWrapperProps, ConfigurableNodeState };
