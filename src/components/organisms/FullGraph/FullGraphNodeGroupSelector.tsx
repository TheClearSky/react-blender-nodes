import { PlusIcon } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/molecules';

type FullGraphNodeGroupSelectorProps = {
  nodeGroups: ReadonlyArray<{ id: string; name: string }>;
  value: string;
  setValue: (value: string) => void;
  handleAddNewGroup?: () => void;
};

const ADD_NEW_GROUP_VALUE = 'add-new-node-group-hjbhbhuvhbhgjbnkjbkhfre';

const FullGraphNodeGroupSelector = ({
  value,
  setValue,
  nodeGroups,
  handleAddNewGroup,
}: FullGraphNodeGroupSelectorProps) => {
  const handleChange = (value: string) => {
    if (value === ADD_NEW_GROUP_VALUE) {
      handleAddNewGroup?.();
      return;
    }
    setValue(value);
  };

  return (
    <div className='absolute top-0 left-0 scale-75 origin-top-left'>
      <Select value={value} onValueChange={handleChange}>
        <SelectTrigger>
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
    </div>
  );
};

export { FullGraphNodeGroupSelector };
export type { FullGraphNodeGroupSelectorProps };
