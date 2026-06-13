import { ArrowLeftIcon, ChevronRight, PlusIcon, Pencil } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/molecules';
import { Button, ScrollableButtonContainer } from '@/components/atoms';
import { generateRandomString } from '@/utils/randomGeneration';
import { cn } from '@/utils';
import { useGraphTheme } from '@/utils/theme/GraphThemeContext';

type FullGraphNodeGroupSelectorProps = {
  nodeGroups: { id: string; name: string }[];
  value: string;
  setValue: (value: string) => void;
  handleAddNewGroup?: () => void;
  enableBackButton?: boolean;
  handleBack?: () => void;
  openedNodeGroupStack: { id: string; name: string; nodeType: string }[];
  onEditNodeType?: (nodeTypeId: string) => void;
};

const ADD_NEW_GROUP_VALUE = 'add-new-node-group' + generateRandomString(10);

const FullGraphNodeGroupSelector = ({
  value,
  setValue,
  nodeGroups,
  handleAddNewGroup,
  enableBackButton,
  handleBack,
  openedNodeGroupStack,
  onEditNodeType,
}: FullGraphNodeGroupSelectorProps) => {
  const theme = useGraphTheme();

  const handleChange = (value: string | undefined) => {
    if (!value) return;
    if (value === ADD_NEW_GROUP_VALUE) {
      handleAddNewGroup?.();
      return;
    }
    setValue(value);
  };

  return (
    <div
      className={cn(
        'absolute top-0 left-0 scale-75 origin-top-left flex items-center gap-3 m-2 max-w-full',
        theme?.breadcrumbs?.container,
      )}
    >
      <Button
        className={cn(
          'h-[44px] border-secondary-dark-gray bg-primary-black shrink-0',
          theme?.breadcrumbs?.backButton,
        )}
        disabled={!enableBackButton}
        onClick={handleBack}
      >
        <ArrowLeftIcon />
      </Button>
      <div className='shrink-0 relative'>
        <Select value={value} onValueChange={handleChange} renderInline>
          <SelectTrigger
            className={cn(
              'hover:bg-primary-dark-gray w-fit',
              theme?.select?.trigger,
              theme?.breadcrumbs?.selectTrigger,
            )}
          >
            <SelectValue placeholder='Node Group' />
          </SelectTrigger>
          <SelectContent
            className={cn(
              'w-[420px]',
              theme?.select?.content,
              theme?.breadcrumbs?.selectContent,
            )}
          >
            <SelectItem
              value={ADD_NEW_GROUP_VALUE}
              className={cn('pl-2', theme?.select?.item)}
            >
              <div className='flex items-center gap-2'>
                <PlusIcon className='shrink-0' />
                <span className='truncate'>Add New Node Group</span>
              </div>
            </SelectItem>
            {nodeGroups.map((nodeGroup) => (
              <SelectItem
                key={nodeGroup.id}
                value={nodeGroup.id}
                className={theme?.select?.item}
              >
                {nodeGroup.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <ScrollableButtonContainer
        orientation='horizontal'
        className='relative flex-1 min-w-0'
        scrollAreaClassName={cn(
          'text-[27px] leading-[27px] font-main whitespace-nowrap text-primary-white flex gap-2 items-center overflow-x-scroll no-scrollbar overflow-y-hidden',
          theme?.breadcrumbs?.list,
        )}
      >
        {openedNodeGroupStack.map((nodeGroup, idx) => (
          <div
            key={nodeGroup.id}
            className={cn('flex items-center gap-2', theme?.breadcrumbs?.item)}
          >
            <div>{nodeGroup.name}</div>
            {idx < openedNodeGroupStack.length - 1 ? (
              <ChevronRight className='shrink-0' />
            ) : (
              onEditNodeType && (
                <Button
                  className={cn(
                    'bg-transparent border-none hover:bg-primary-gray shrink-0 h-[44px] w-[44px] p-0 flex items-center justify-center',
                    theme?.breadcrumbs?.editButton,
                  )}
                  onClick={() => onEditNodeType(nodeGroup.nodeType)}
                >
                  <Pencil className='w-6 h-6' />
                </Button>
              )
            )}
          </div>
        ))}
      </ScrollableButtonContainer>
    </div>
  );
};

export { FullGraphNodeGroupSelector };
export type { FullGraphNodeGroupSelectorProps };
