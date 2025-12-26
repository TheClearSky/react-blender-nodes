import { ConfigurableNodeReactFlowWrapper } from '@/components';
import { ConfigurableEdge } from '@/components/atoms/ConfigurableEdge/ConfigurableEdge';

const nodeTypes = {
  configurableNode: ConfigurableNodeReactFlowWrapper,
};

const edgeTypes = {
  configurableEdge: ConfigurableEdge,
};

export { nodeTypes, edgeTypes };
