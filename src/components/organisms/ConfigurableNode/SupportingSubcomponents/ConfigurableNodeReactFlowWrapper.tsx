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
          className='rbn:flex rbn:w-full rbn:flex-col rbn:items-center rbn:justify-center rbn:gap-2 rbn:rounded-lg rbn:border rbn:border-red-500/50 rbn:bg-zinc-900 rbn:p-4 rbn:text-zinc-300'
          style={{ minHeight: 80 }}
        >
          <div className='rbn:flex rbn:items-center rbn:gap-1.5'>
            <AlertTriangle className='rbn:h-4 rbn:w-4 rbn:text-red-400' />
            <span className='rbn:text-xs rbn:font-medium rbn:text-red-400'>
              Render Error
            </span>
          </div>
          <p className='rbn:text-center rbn:text-[10px] rbn:text-zinc-500'>
            {data.customName
              ? `${data.customName} : ${data.name ?? 'Node'}`
              : (data.name ?? 'Node')}{' '}
            &mdash; {error.message}
          </p>
          <button
            type='button'
            onClick={reset}
            className='rbn:mt-1 rbn:rounded rbn:border rbn:border-zinc-700 rbn:bg-zinc-800 rbn:px-2 rbn:py-0.5 rbn:text-[10px] rbn:text-zinc-400 rbn:transition-colors rbn:hover:bg-zinc-700'
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
        className='rbn:w-full'
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
