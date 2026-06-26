import type { z } from 'zod';
import type { SupportedUnderlyingTypes } from '../../nodeStateManagement/types';
import { downloadTextArtifact } from './downloadTextArtifact';
import { serializeExecutionPlan } from './serializeExecutionPlan';
import type { ArtifactRunContext, ArtifactRunTarget } from './types';

/**
 * `run` is kept GENERIC (the object is fixed via `satisfies`, not an annotation)
 * so the target is assignable to any graph's `RunTarget<…>` — a non-generic arrow
 * would both break that variance AND leak a relative `./types` import into
 * dist/index.d.ts (caught by check-dist-types). It needs no impls, so it consumes
 * only the read-only `ArtifactRunContext`.
 */
function runJsonIr<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  context: ArtifactRunContext<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
): Promise<void> {
  const serializedPlan = serializeExecutionPlan(context.executionPlan);
  const json = JSON.stringify(serializedPlan, null, 2);
  downloadTextArtifact('graph-execution-plan.json', json, 'application/json');
  return Promise.resolve();
}

/**
 * Built-in `artifact` run target that exports the compiled `ExecutionPlan` as a
 * JSON file — the graph's intermediate representation, losslessly. Delivery
 * (download) is owned by the target; nothing is fed to the timeline.
 */
const jsonIrRunTarget = {
  id: 'json-ir',
  label: 'Export JSON IR',
  mode: 'artifact' as const,
  run: runJsonIr,
} satisfies ArtifactRunTarget;

export { jsonIrRunTarget };
