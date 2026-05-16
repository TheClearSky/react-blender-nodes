import { describe, it, expect } from 'vitest';
import {
  isLoopNode,
  getLoopStructureFromNode,
  isLoopConnectionValid,
  canRemoveLoopNodesAndEdges,
} from '@/utils/nodeStateManagement/nodes/loops';

describe('nodeStateManagement/loops', () => {
  it('should export the expected loop utility functions', () => {
    expect(typeof isLoopNode).toBe('function');
    expect(typeof getLoopStructureFromNode).toBe('function');
    expect(typeof isLoopConnectionValid).toBe('function');
    expect(typeof canRemoveLoopNodesAndEdges).toBe('function');
  });
});
