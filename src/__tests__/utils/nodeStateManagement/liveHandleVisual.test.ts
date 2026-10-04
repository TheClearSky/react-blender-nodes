import { describe, it, expect } from 'vitest';
import {
  liveHandleColor,
  liveHandleShape,
} from '@/utils/nodeStateManagement/handles/liveHandleVisual';

// A saved node keeps the colour/shape copied onto its handles when it was
// built; the socket must be drawn from the data type as it is NOW.
describe('live handle visuals', () => {
  const saved = {
    handleColor: '#22c55e',
    handleShape: 'circle' as const,
    dataType: {
      dataTypeObject: { color: '#2ECC71', shape: 'zigzag' as const },
    },
  };

  it('the data type wins over the copy saved on the handle', () => {
    expect(liveHandleColor(saved)).toBe('#2ECC71');
    expect(liveHandleShape(saved)).toBe('zigzag');
  });

  it('an inferred type (loop/switch/group pass-through) wins over the declared one', () => {
    const inferred = {
      ...saved,
      inferredDataType: {
        dataTypeObject: { color: '#F1C40F', shape: 'diamond' as const },
      },
    };
    expect(liveHandleColor(inferred)).toBe('#F1C40F');
    expect(liveHandleShape(inferred)).toBe('diamond');
  });

  it('falls back to the handle copy when there is no data type', () => {
    expect(liveHandleColor({ handleColor: '#E74C3C' })).toBe('#E74C3C');
    expect(liveHandleShape({ handleShape: 'square' })).toBe('square');
    expect(liveHandleColor({})).toBeUndefined();
  });
});
