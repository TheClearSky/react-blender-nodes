import { useContext } from 'react';
import type { LucideIcon } from 'lucide-react';
import { FullGraphContext } from '../../FullGraph/FullGraphState';
import type { Action } from '@/utils/nodeStateManagement/mainReducer';

type NodeHeaderActionDefinition = {
  id: string;
  icon: LucideIcon;
  iconClassName?: string;
  action: Action;
};

type ContextAwareNodeHeaderActionsProps = {
  actions: NodeHeaderActionDefinition[];
  isCurrentlyInsideReactFlow: boolean;
};

function ContextAwareNodeHeaderActions({
  actions,
  isCurrentlyInsideReactFlow,
}: ContextAwareNodeHeaderActionsProps) {
  const fullGraphContext = useContext(FullGraphContext);

  if (actions.length === 0) return null;

  return (
    <>
      {actions.map((actionDef) => {
        const Icon = actionDef.icon;
        const handleClick = isCurrentlyInsideReactFlow
          ? () => fullGraphContext?.allProps?.dispatch?.(actionDef.action)
          : undefined;

        return (
          <Icon
            key={actionDef.id}
            strokeWidth={2.5}
            className={
              actionDef.iconClassName ??
              'shrink-0 w-6 h-6 aspect-square cursor-pointer hover:opacity-80'
            }
            onClick={handleClick}
          />
        );
      })}
    </>
  );
}

export { ContextAwareNodeHeaderActions };
export type { NodeHeaderActionDefinition, ContextAwareNodeHeaderActionsProps };
