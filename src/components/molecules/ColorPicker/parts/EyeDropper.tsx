import { useState, useEffect } from 'react';
import { Pipette } from 'lucide-react';
import { cn } from '@/utils/cnHelper';
import { Button } from '@/components/atoms';
import { useColorPickerContext } from '../ColorPickerContext';

type EyeDropperLike = {
  open: (opts?: { signal?: AbortSignal }) => Promise<{ sRGBHex: string }>;
};

declare global {
  interface Window {
    EyeDropper?: { new (): EyeDropperLike };
  }
}

type ColorPickerEyeDropperProps = {
  className?: string;
  size?: 'normal' | 'small';
};

function ColorPickerEyeDropper({
  className,
  size = 'small',
}: ColorPickerEyeDropperProps) {
  const { setColor } = useColorPickerContext();
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported(
      typeof window !== 'undefined' && typeof window.EyeDropper === 'function',
    );
  }, []);

  if (!supported) return null;

  const handleClick = async () => {
    try {
      const eyeDropper = new window.EyeDropper!();
      const result = await eyeDropper.open();
      if (result?.sRGBHex) setColor(result.sRGBHex);
    } catch {
      // user cancelled
    }
  };

  return (
    <Button
      size={size}
      onClick={handleClick}
      className={cn(
        'cursor-pointer bg-transparent border-secondary-dark-gray hover:bg-primary-gray',
        className,
      )}
    >
      <Pipette className={size === 'small' ? 'w-3.5 h-3.5' : 'w-5 h-5'} />
    </Button>
  );
}

export { ColorPickerEyeDropper };
export type { ColorPickerEyeDropperProps };
