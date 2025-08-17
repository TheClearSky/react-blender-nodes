import { forwardRef } from 'react';
import {
  type Node as XyFlowNode,
  type NodeProps as XyFlowNodeProps,
} from '@xyflow/react';
import {
  type ConfigurableNodeProps,
  ConfigurableNode,
} from './ConfigurableNode';

type ConfigurableNodeReactFlowWrapperProps = XyFlowNodeProps<
  XyFlowNode<
    Omit<ConfigurableNodeProps, 'isCurrentlyInsideReactFlow'>,
    'blenderLikeNode'
  >
>;

const ConfigurableNodeReactFlowWrapper = forwardRef<
  HTMLDivElement,
  ConfigurableNodeReactFlowWrapperProps
>(({ data = {} }, ref) => {
  return (
    <ConfigurableNode isCurrentlyInsideReactFlow={true} {...data} ref={ref} />
  );
});

ConfigurableNodeReactFlowWrapper.displayName =
  'ConfigurableNodeReactFlowWrapper';

export { ConfigurableNodeReactFlowWrapper };

export type { ConfigurableNodeReactFlowWrapperProps };
