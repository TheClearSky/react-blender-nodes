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
        'rbn:absolute rbn:top-0 rbn:left-0 rbn:scale-75 rbn:origin-top-left rbn:flex rbn:items-center rbn:gap-3 rbn:m-2 rbn:max-w-full',
        theme?.breadcrumbs?.container,
      )}
    >
      <Button
        className={cn(
          'rbn:h-[44px] rbn:border-secondary-dark-gray rbn:bg-primary-black rbn:shrink-0',
          theme?.breadcrumbs?.backButton,
        )}
        disabled={!enableBackButton}
        onClick={handleBack}
      >
        <ArrowLeftIcon />
      </Button>
      <div className='rbn:shrink-0 rbn:relative'>
        <Select value={value} onValueChange={handleChange} renderInline>
          <SelectTrigger
            className={cn(
              'rbn:hover:bg-primary-dark-gray rbn:w-fit',
              theme?.select?.trigger,
              theme?.breadcrumbs?.selectTrigger,
            )}
          >
            <SelectValue placeholder='Node Group' />
          </SelectTrigger>
          <SelectContent
            className={cn(
              'rbn:w-[420px]',
              theme?.select?.content,
              theme?.breadcrumbs?.selectContent,
            )}
          >
            <SelectItem
              value={ADD_NEW_GROUP_VALUE}
              className={cn('rbn:pl-2', theme?.select?.item)}
            >
              <div className='rbn:flex rbn:items-center rbn:gap-2'>
                <PlusIcon className='rbn:shrink-0' />
                <span className='rbn:truncate'>Add New Node Group</span>
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
        className='rbn:relative rbn:flex-1 rbn:min-w-0'
        scrollAreaClassName={cn(
          'rbn:text-[27px] rbn:leading-[27px] rbn:font-main rbn:whitespace-nowrap rbn:text-primary-white rbn:flex rbn:gap-2 rbn:items-center rbn:overflow-x-scroll rbn:no-scrollbar rbn:overflow-y-hidden',
          theme?.breadcrumbs?.list,
        )}
      >
        {openedNodeGroupStack.map((nodeGroup, idx) => (
          <div
            key={nodeGroup.id}
            className={cn(
              'rbn:flex rbn:items-center rbn:gap-2',
              theme?.breadcrumbs?.item,
            )}
          >
            <div>{nodeGroup.name}</div>
            {idx < openedNodeGroupStack.length - 1 ? (
              <ChevronRight className='rbn:shrink-0' />
            ) : (
              onEditNodeType && (
                <Button
                  className={cn(
                    'rbn:bg-transparent rbn:border-none rbn:hover:bg-primary-gray rbn:shrink-0 rbn:h-[44px] rbn:w-[44px] rbn:p-0 rbn:flex rbn:items-center rbn:justify-center',
                    theme?.breadcrumbs?.editButton,
                  )}
                  onClick={() => onEditNodeType(nodeGroup.nodeType)}
                >
                  <Pencil className='rbn:w-6 rbn:h-6' />
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
