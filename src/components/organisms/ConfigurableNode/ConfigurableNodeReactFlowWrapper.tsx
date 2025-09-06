import { forwardRef } from 'react';
import { type NodeProps, type Node } from '@xyflow/react';
import {
  type ConfigurableNodeProps,
  ConfigurableNode,
} from './ConfigurableNode';

type ConfigurableNodeState = Node<
  Omit<ConfigurableNodeProps, 'isCurrentlyInsideReactFlow'>,
  'configurableNode'
>;

type ConfigurableNodeReactFlowWrapperProps = NodeProps<ConfigurableNodeState>;

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
