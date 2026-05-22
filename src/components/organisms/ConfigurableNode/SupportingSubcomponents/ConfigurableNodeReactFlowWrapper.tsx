import { forwardRef, useContext } from 'react';
import { type NodeProps, type Node, type XYPosition } from '@xyflow/react';
import {
  type ConfigurableNodeProps,
  ConfigurableNode,
} from './../ConfigurableNode';
import type { SupportedUnderlyingTypes } from '@/utils';
import { z } from 'zod';
import { RunnerContext } from '../../FullGraph/FullGraphState';
import { ErrorBoundary } from '@/components/atoms/ErrorBoundary';
import { AlertTriangle } from 'lucide-react';

/** State type for configurable nodes in ReactFlow */
type ConfigurableNodeState<
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  NodeTypeUniqueId extends string = string,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
  DataTypeUniqueId extends string = string,
> = Node<
  Omit<
    ConfigurableNodeProps<
      UnderlyingType,
      NodeTypeUniqueId,
      ComplexSchemaType,
      DataTypeUniqueId
    >,
    'isCurrentlyInsideReactFlow'
  >,
  'configurableNode'
>;

/** Props for the ConfigurableNodeReactFlowWrapper component */
type ConfigurableNodeReactFlowWrapperProps<
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  NodeTypeUniqueId extends string = string,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
  DataTypeUniqueId extends string = string,
> = NodeProps<
  ConfigurableNodeState<
    UnderlyingType,
    NodeTypeUniqueId,
    ComplexSchemaType,
    DataTypeUniqueId
  >
> & {
  position: XYPosition;
};

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
  Omit<ConfigurableNodeReactFlowWrapperProps, 'position'>
>(({ data = {}, id }, ref) => {
  const runnerContext = useContext(RunnerContext);
  const nodeRunnerState = runnerContext?.nodeRunnerStates?.get(id);

  return (
    <ErrorBoundary
      resetKey={JSON.stringify(data)}
      fallback={({ error, reset }) => (
        <div
          data-slot='error-boundary-node'
          className='flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-red-500/50 bg-zinc-900 p-4 text-zinc-300'
          style={{ minHeight: 80 }}
        >
          <div className='flex items-center gap-1.5'>
            <AlertTriangle className='h-4 w-4 text-red-400' />
            <span className='text-xs font-medium text-red-400'>
              Render Error
            </span>
          </div>
          <p className='text-center text-[10px] text-zinc-500'>
            {data.name ?? 'Node'} &mdash; {error.message}
          </p>
          <button
            type='button'
            onClick={reset}
            className='mt-1 rounded border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400 transition-colors hover:bg-zinc-700'
          >
            Retry
          </button>
        </div>
      )}
      onError={(error, errorInfo) => {
        console.error(
          `[ConfigurableNode:${id}] Render error:`,
          error,
          errorInfo,
        );
      }}
    >
      <ConfigurableNode
        isCurrentlyInsideReactFlow={true}
        id={id}
        className='w-full'
        {...data}
        runnerVisualState={nodeRunnerState?.visualState}
        runnerErrors={nodeRunnerState?.errors}
        runnerWarnings={nodeRunnerState?.warnings}
        ref={ref}
      />
    </ErrorBoundary>
  );
});

ConfigurableNodeReactFlowWrapper.displayName =
  'ConfigurableNodeReactFlowWrapper';

export { ConfigurableNodeReactFlowWrapper };

export type { ConfigurableNodeReactFlowWrapperProps, ConfigurableNodeState };
