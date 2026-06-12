import { ColorPickerRoot } from './parts/Root';
import { ColorPickerArea } from './parts/Area';
import { ColorPickerHue } from './parts/Hue';
import { ColorPickerLightness } from './parts/Lightness';
import { ColorPickerAlpha } from './parts/Alpha';
import { ColorPickerPreview } from './parts/Preview';
import { ColorPickerCssInput } from './parts/CssInput';
import { ColorPickerChannelInput } from './parts/ChannelInput';
import { ColorPickerSwatches } from './parts/Swatches';
import { ColorPickerEyeDropper } from './parts/EyeDropper';
import { ColorPickerFormatSwitcher } from './parts/FormatSwitcher';
import { ColorPickerGamutBadge } from './parts/GamutBadge';
import { ColorPickerContrastReadout } from './parts/ContrastReadout';

const ColorPicker = {
  Root: ColorPickerRoot,
  Area: ColorPickerArea,
  Hue: ColorPickerHue,
  Lightness: ColorPickerLightness,
  Alpha: ColorPickerAlpha,
  Preview: ColorPickerPreview,
  CssInput: ColorPickerCssInput,
  ChannelInput: ColorPickerChannelInput,
  Swatches: ColorPickerSwatches,
  EyeDropper: ColorPickerEyeDropper,
  FormatSwitcher: ColorPickerFormatSwitcher,
  GamutBadge: ColorPickerGamutBadge,
  ContrastReadout: ColorPickerContrastReadout,
};

export { ColorPicker };
