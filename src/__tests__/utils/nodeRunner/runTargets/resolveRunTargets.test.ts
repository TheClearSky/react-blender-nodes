import { describe, expect, it, vi } from 'vitest';
import { resolveRunTargets } from '@/utils/nodeRunner/runTargets/resolveRunTargets';
import { inProcessRunTarget } from '@/utils/nodeRunner/runTargets/inProcessRunTarget';
import { makeRunTargetWithAutoInfer } from '@/utils/nodeRunner/runTargets';

const jsonIrLike = makeRunTargetWithAutoInfer({
  id: 'json-ir',
  label: 'JSON IR',
  mode: 'artifact',
  run: async () => {},
});
const codegenLike = makeRunTargetWithAutoInfer({
  id: 'codegen-js',
  label: 'Codegen JS',
  mode: 'artifact',
  run: async () => {},
});

describe('resolveRunTargets', () => {
  it('prepends the in-process default when no consumer targets are given', () => {
    const { targets, activeRunTargetId, activeRunTarget } =
      resolveRunTargets(undefined);
    expect(targets).toEqual([inProcessRunTarget]);
    expect(activeRunTargetId).toBe('in-process');
    expect(activeRunTarget).toBe(inProcessRunTarget);
  });

  it('prepends the default and preserves consumer order', () => {
    const { targets } = resolveRunTargets([jsonIrLike, codegenLike]);
    expect(targets.map((target) => target.id)).toEqual([
      'in-process',
      'json-ir',
      'codegen-js',
    ]);
  });

  it('lets a consumer target override the built-in in-process id (consumer wins)', () => {
    const customInProcess = makeRunTargetWithAutoInfer({
      id: 'in-process',
      label: 'My In-process',
      mode: 'execute',
      run: async () => {
        throw new Error('not invoked');
      },
    });
    const { targets, activeRunTarget } = resolveRunTargets([customInProcess]);
    expect(targets).toHaveLength(1);
    expect(targets[0]).toBe(customInProcess);
    expect(activeRunTarget).toBe(customInProcess);
  });

  it('drops duplicate ids (keeps first) and dev-warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const dupe = makeRunTargetWithAutoInfer({
      id: 'json-ir',
      label: 'Dupe',
      mode: 'artifact',
      run: async () => {},
    });
    const { targets } = resolveRunTargets([jsonIrLike, dupe]);
    expect(targets.map((target) => target.id)).toEqual([
      'in-process',
      'json-ir',
    ]);
    expect(targets[1]).toBe(jsonIrLike);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('resolves the active id: explicit → default → in-process → first', () => {
    expect(
      resolveRunTargets([jsonIrLike], { activeRunTargetId: 'json-ir' })
        .activeRunTargetId,
    ).toBe('json-ir');
    expect(
      resolveRunTargets([jsonIrLike], { defaultRunTargetId: 'json-ir' })
        .activeRunTargetId,
    ).toBe('json-ir');
    // explicit wins over default
    expect(
      resolveRunTargets([jsonIrLike, codegenLike], {
        activeRunTargetId: 'codegen-js',
        defaultRunTargetId: 'json-ir',
      }).activeRunTargetId,
    ).toBe('codegen-js');
    // unknown candidate → falls back to the first (in-process)
    expect(
      resolveRunTargets([jsonIrLike], { activeRunTargetId: 'does-not-exist' })
        .activeRunTargetId,
    ).toBe('in-process');
  });

  it('keeps the returned id and target consistent when the selected target disappears then returns (F1)', () => {
    // useRunTargets feeds the held `selectedId` in as `activeRunTargetId`; the
    // resolver owns the single fallback ladder, so the returned id and target can
    // never diverge even when the held id is no longer in the list.
    const heldSelectedId = 'codegen-js';

    // codegen-js present → selection holds.
    const present = resolveRunTargets([jsonIrLike, codegenLike], {
      activeRunTargetId: heldSelectedId,
    });
    expect(present.activeRunTargetId).toBe('codegen-js');
    expect(present.activeRunTarget.id).toBe('codegen-js');

    // host removes codegen-js while the held id is still 'codegen-js' → the view
    // falls back consistently (id ≡ target), no divergence.
    const removed = resolveRunTargets([jsonIrLike], {
      activeRunTargetId: heldSelectedId,
    });
    expect(removed.activeRunTargetId).toBe('in-process');
    expect(removed.activeRunTarget.id).toBe('in-process');
    expect(removed.activeRunTargetId).toBe(removed.activeRunTarget.id);

    // host re-adds codegen-js (held id unchanged) → id and target agree again.
    const readded = resolveRunTargets([jsonIrLike, codegenLike], {
      activeRunTargetId: heldSelectedId,
    });
    expect(readded.activeRunTargetId).toBe('codegen-js');
    expect(readded.activeRunTarget.id).toBe('codegen-js');
  });
});
