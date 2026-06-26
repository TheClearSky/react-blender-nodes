import { describe, expect, it } from 'vitest';
import { formatSource } from '@/utils/nodeRunner/runTargets/codegen/formatSource';

describe('formatSource — Prettier finishing pass', () => {
  it('formats JavaScript', async () => {
    const out = await formatSource('const   x=1   ;\n', 'javascript');
    expect(out).toBe('const x = 1;\n');
  });

  it('formats TypeScript (keeps type annotations)', async () => {
    const out = await formatSource('const x:number=1', 'typescript');
    expect(out).toContain('const x: number = 1;');
  });

  it('returns the source unformatted on a parse error', async () => {
    const broken = 'const = = =';
    expect(await formatSource(broken, 'javascript')).toBe(broken);
  });
});
