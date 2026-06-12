// Import from the component's own module rather than the `@/components` barrel:
// the barrel re-exports FullGraph (which imports this file), so the barrel path
// forms a circular dependency that left ConfigurableNodeReactFlowWrapper in its
// TDZ here (crashing standalone ConfigurableNode stories).
import { ConfigurableNodeReactFlowWrapper } from '@/components/organisms/ConfigurableNode/SupportingSubcomponents/ConfigurableNodeReactFlowWrapper';
import { ConfigurableEdge } from '@/components/atoms/ConfigurableEdge/ConfigurableEdge';

const nodeTypes = {
  configurableNode: ConfigurableNodeReactFlowWrapper,
};

const edgeTypes = {
  configurableEdge: ConfigurableEdge,
};

export { nodeTypes, edgeTypes };
