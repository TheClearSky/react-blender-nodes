type OklchColor = {
  l: number;
  c: number;
  h: number;
  alpha: number;
};

type ColorFormat = 'hex' | 'rgb' | 'hsl' | 'hsb' | 'oklch' | 'oklab' | 'p3';

type Gamut = 'srgb' | 'p3' | 'rec2020';

type ContrastResult = {
  wcag: number;
  wcagLevel: {
    aaNormal: boolean;
    aaLarge: boolean;
    aaaNormal: boolean;
    aaaLarge: boolean;
  };
  apca: number;
};

type GamutInfo = {
  inSrgb: boolean;
  inP3: boolean;
  inRec2020: boolean;
};

export type { OklchColor, ColorFormat, Gamut, ContrastResult, GamutInfo };
