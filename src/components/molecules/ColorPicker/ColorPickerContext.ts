import { createContext, useContext } from 'react';
import type { ColorPickerState } from './hooks/useColorPicker';

const ColorPickerContext = createContext<ColorPickerState | null>(null);

function useColorPickerContext(): ColorPickerState {
  const ctx = useContext(ColorPickerContext);
  if (!ctx) {
    throw new Error(
      'ColorPicker parts must be rendered inside <ColorPicker.Root>',
    );
  }
  return ctx;
}

export { ColorPickerContext, useColorPickerContext };
