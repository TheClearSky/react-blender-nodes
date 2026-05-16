import type { ReactNode } from 'react';
import { cn } from '@/utils/cnHelper';
import { ColorPickerContext } from '../ColorPickerContext';
import {
  useColorPicker,
  type UseColorPickerProps,
} from '../hooks/useColorPicker';

type ColorPickerRootProps = UseColorPickerProps & {
  children: ReactNode;
  className?: string;
};

function ColorPickerRoot({
  children,
  className,
  ...pickerProps
}: ColorPickerRootProps) {
  const state = useColorPicker(pickerProps);
  return (
    <ColorPickerContext.Provider value={state}>
      <div className={cn('flex w-full flex-col gap-3', className)}>
        {children}
      </div>
    </ColorPickerContext.Provider>
  );
}

export { ColorPickerRoot };
export type { ColorPickerRootProps };
