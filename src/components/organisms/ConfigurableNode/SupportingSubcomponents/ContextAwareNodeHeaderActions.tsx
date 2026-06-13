import { useContext } from 'react';
import type { LucideIcon } from 'lucide-react';
import { FullGraphContext } from '../../FullGraph/FullGraphState';
import { useGraphTheme } from '@/utils/theme/GraphThemeContext';
import { cn } from '@/utils';
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
  const theme = useGraphTheme();

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
            className={cn(
              actionDef.iconClassName ??
                'shrink-0 w-6 h-6 aspect-square cursor-pointer hover:opacity-80',
              theme?.node?.headerActionIcon,
            )}
            onClick={handleClick}
          />
        );
      })}
    </>
  );
}

export { ContextAwareNodeHeaderActions };
export type { NodeHeaderActionDefinition, ContextAwareNodeHeaderActionsProps };
