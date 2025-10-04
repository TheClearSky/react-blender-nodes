import { useContext } from 'react';
import { useNodeId } from '@xyflow/react';
import { SquareMousePointerIcon } from 'lucide-react';
import { FullGraphContext } from '../FullGraph/FullGraph';
import { actionTypesMap } from '@/utils/nodeStateManagement/mainReducer';

/**
 * Props for the ReactFlowAwareOpenButton component
 */
type ReactFlowAwareOpenButtonProps = {};

/**
 * ReactFlow-aware open button component that dispatches open node group action
 *
 * This component renders the open button and dispatches the OPEN_NODE_GROUP action
 * when clicked. It integrates with the ReactFlow context to maintain state consistency.
 *
 * @param props - The component props
 * @returns JSX element containing the open button
 */
const ReactFlowAwareOpenButton = ({}: ReactFlowAwareOpenButtonProps) => {
  const fullGraphContext = useContext(FullGraphContext);
  const nodeId = useNodeId();

  const handleOpenNodeGroup = () => {
    if (fullGraphContext?.allProps?.dispatch && nodeId) {
      fullGraphContext.allProps.dispatch({
        type: actionTypesMap.OPEN_NODE_GROUP,
        payload: {
          nodeId,
        },
      });
    }
  };

  return (
    <SquareMousePointerIcon
      strokeWidth={2.5}
      className='shrink-0 w-7 h-7 aspect-square cursor-pointer hover:opacity-80'
      onClick={handleOpenNodeGroup}
    />
  );
};

/**
 * Props for the ContextAwareOpenButton component
 */
type ContextAwareOpenButtonProps = {
  /**
   * Whether the button should be shown
   * @default false
   */
  showButton?: boolean;
  /** Whether the component is currently inside a ReactFlow context */
  isCurrentlyInsideReactFlow: boolean;
};

/**
 * Context-aware open button component that handles both ReactFlow and standalone contexts
 *
 * This component intelligently renders either a ReactFlow-aware button (for ReactFlow context)
 * or a simple button (for standalone usage) based on the context.
 *
 * Features:
 * - Automatically detects ReactFlow context
 * - Renders appropriate button based on context
 * - Integrates with FullGraph's dispatch system
 * - Supports conditional rendering
 *
 * @param props - The component props
 * @returns JSX element containing the appropriate open button
 *
 * @example
 * ```tsx
 * <ContextAwareOpenButton
 *   nodeId="node-123"
 *   showButton={true}
 *   isCurrentlyInsideReactFlow={true}
 * />
 * ```
 */
const ContextAwareOpenButton = ({
  showButton = false,
  isCurrentlyInsideReactFlow,
}: ContextAwareOpenButtonProps) => {
  if (!showButton) {
    return <></>;
  }

  if (isCurrentlyInsideReactFlow) {
    return <ReactFlowAwareOpenButton />;
  }

  return (
    <SquareMousePointerIcon
      strokeWidth={2.5}
      className='shrink-0 w-7 h-7 aspect-square cursor-pointer hover:opacity-80'
    />
  );
};

export { ContextAwareOpenButton, ReactFlowAwareOpenButton };
export type { ContextAwareOpenButtonProps, ReactFlowAwareOpenButtonProps };
