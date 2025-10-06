import { ArrowLeftIcon, ChevronRight, PlusIcon } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/molecules';
import { Button, ScrollableButtonContainer } from '@/components/atoms';
import { generateRandomString } from '@/utils/randomGeneration';

type FullGraphNodeGroupSelectorProps = {
  nodeGroups: { id: string; name: string }[];
  value: string;
  setValue: (value: string) => void;
  handleAddNewGroup?: () => void;
  enableBackButton?: boolean;
  handleBack?: () => void;
  openedNodeGroupStack: { id: string; name: string }[];
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
}: FullGraphNodeGroupSelectorProps) => {
  const handleChange = (value: string) => {
    if (value === ADD_NEW_GROUP_VALUE) {
      handleAddNewGroup?.();
      return;
    }
    setValue(value);
  };

  return (
    <div className='absolute top-0 left-0 scale-75 origin-top-left flex items-center gap-3 m-2 max-w-full'>
      <Button
        className='h-[44px] border-secondary-dark-gray bg-primary-black shrink-0'
        disabled={!enableBackButton}
        onClick={handleBack}
      >
        <ArrowLeftIcon />
      </Button>
      <Select value={value} onValueChange={handleChange}>
        <SelectTrigger className='hover:bg-primary-dark-gray shrink-0 w-fit'>
          <SelectValue placeholder='Node Group' />
        </SelectTrigger>
        <SelectContent className='scale-75 origin-top-left'>
          <SelectItem value={ADD_NEW_GROUP_VALUE} className='pl-2'>
            <div className='flex items-center gap-2'>
              <PlusIcon />
              <p className='truncate'>Add New Node Group</p>
            </div>
          </SelectItem>
          {nodeGroups.map((nodeGroup) => (
            <SelectItem key={nodeGroup.id} value={nodeGroup.id}>
              {nodeGroup.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <ScrollableButtonContainer
        orientation='horizontal'
        className='relative flex-1 min-w-0'
        scrollAreaClassName='text-[27px] leading-[27px] font-main whitespace-nowrap text-primary-white flex gap-2 items-center overflow-x-scroll no-scrollbar overflow-y-hidden'
      >
        {openedNodeGroupStack.map((nodeGroup, idx) => (
          <div key={nodeGroup.id} className='flex items-center gap-2'>
            <div>{nodeGroup.name}</div>
            {idx < openedNodeGroupStack.length - 1 && (
              <ChevronRight className='shrink-0' />
            )}
          </div>
        ))}
      </ScrollableButtonContainer>
    </div>
  );
};

export { FullGraphNodeGroupSelector };
export type { FullGraphNodeGroupSelectorProps };
