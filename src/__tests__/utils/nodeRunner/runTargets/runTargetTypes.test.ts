import { describe, expect, it } from 'vitest';
import { makeRunTargetWithAutoInfer } from '@/utils/nodeRunner/runTargets';
import type {
  ExecutionRecord,
  ExecutionStepRecord,
} from '@/utils/nodeRunner/runTargets';

// These tests exercise the TYPE surface (run bodies are never invoked), so a
// cast stand-in for the heavy record types is fine — `npm run build` (tsc -b)
// type-checks this file, so the discriminant + @ts-expect-error assertions are
// real compile-time gates.
const placeholderRecord = undefined as unknown as ExecutionRecord;
const placeholderStep = undefined as unknown as ExecutionStepRecord;

describe('makeRunTargetWithAutoInfer', () => {
  it('is identity and preserves the literal `mode` discriminant', () => {
    const executeTarget = makeRunTargetWithAutoInfer({
      id: 'in-process',
      label: 'In-process',
      mode: 'execute',
      run: async () => placeholderRecord,
    });
    // Would NOT compile if the factory widened `mode` to the union:
    const executeMode: 'execute' = executeTarget.mode;
    expect(executeMode).toBe('execute');
    expect(executeTarget.id).toBe('in-process');

    const artifactTarget = makeRunTargetWithAutoInfer({
      id: 'json-ir',
      label: 'JSON IR',
      mode: 'artifact',
      run: async () => {},
    });
    const artifactMode: 'artifact' = artifactTarget.mode;
    expect(artifactMode).toBe('artifact');
  });

  it('accepts `runStepwise` on execute targets', () => {
    const stepping = makeRunTargetWithAutoInfer({
      id: 'stepper',
      label: 'Stepper',
      mode: 'execute',
      run: async () => placeholderRecord,
      runStepwise: async function* () {
        yield { stepRecord: placeholderStep, partialRecord: placeholderRecord };
        return placeholderRecord;
      },
    });
    expect(typeof stepping.runStepwise).toBe('function');
  });

  it('segregates the context: execute has impls, artifact does not', () => {
    makeRunTargetWithAutoInfer({
      id: 'execute-ctx',
      label: 'Execute',
      mode: 'execute',
      run: async (context) => {
        void context.functionImplementations;
        return placeholderRecord;
      },
    });

    makeRunTargetWithAutoInfer({
      id: 'artifact-ctx',
      label: 'Artifact',
      mode: 'artifact',
      run: async (context) => {
        // @ts-expect-error artifact context has no `functionImplementations`
        void context.functionImplementations;
      },
    });
  });
});
