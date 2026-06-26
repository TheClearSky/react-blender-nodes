import { useMemo } from 'react';
import type { z } from 'zod';
import type { SupportedUnderlyingTypes } from '@/utils/nodeStateManagement/types';
import { resolveRunTargets } from '@/utils/nodeRunner/runTargets/resolveRunTargets';
import type { RunTarget } from '@/utils/nodeRunner/runTargets/types';
import { useControllableState } from '@/hooks/useControllableState';

type UseRunTargetsOptions<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
> = {
  /** Consumer-registered targets. The built-in in-process target is always
   *  prepended (unless a consumer target reuses its id). */
  runTargets?: ReadonlyArray<
    RunTarget<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    >
  >;
  /** Controlled active id (mirrors `Input` / `executionRecord`). */
  activeRunTargetId?: string;
  /** Uncontrolled initial active id. */
  defaultRunTargetId?: string;
  /** Notified whenever the active target changes. */
  onActiveRunTargetChange?: (id: string) => void;
};

type UseRunTargetsReturn<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
> = {
  targets: RunTarget<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >[];
  activeRunTargetId: string;
  activeRunTarget: RunTarget<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >;
  setActiveRunTargetId: (id: string) => void;
};

/**
 * Owns run-target SELECTION (SRP): the pure `resolveRunTargets` produces the
 * effective list (default prepended, deduped); `useControllableState` holds the
 * active id (controlled or uncontrolled). `useNodeRunner` stays the state machine
 * and just receives the resolved `activeRunTarget`.
 */
function useRunTargets<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>({
  runTargets,
  activeRunTargetId,
  defaultRunTargetId,
  onActiveRunTargetChange,
}: UseRunTargetsOptions<
  DataTypeUniqueId,
  NodeTypeUniqueId,
  UnderlyingType,
  ComplexSchemaType
>): UseRunTargetsReturn<
  DataTypeUniqueId,
  NodeTypeUniqueId,
  UnderlyingType,
  ComplexSchemaType
> {
  // The pure resolver works over the graph-agnostic default `RunTarget` shape;
  // the concrete generics are re-applied on the way out (it only reads ids).
  const targets = useMemo(
    () =>
      resolveRunTargets(
        runTargets as unknown as ReadonlyArray<RunTarget> | undefined,
      ).targets,
    [runTargets],
  ) as unknown as RunTarget<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >[];

  const [selectedId, setActiveRunTargetId] = useControllableState<string>({
    value: activeRunTargetId,
    defaultValue: defaultRunTargetId ?? targets[0]?.id ?? 'in-process',
    onChange: onActiveRunTargetChange,
  });

  // Resolve the effective active id/target through the SAME pure fallback ladder
  // (`activeRunTargetId → defaultRunTargetId → 'in-process' → first target`),
  // feeding the held id in. This keeps the returned id and target from ever
  // diverging when `runTargets` changes or the selected id disappears — the
  // single fallback site (F1). `useControllableState` only captures `defaultValue`
  // once, so the held `selectedId` can outlive its target; the resolver patches
  // the view truthfully (a controlled host still owns its own reconciliation).
  const resolved = useMemo(
    () =>
      resolveRunTargets(
        runTargets as unknown as ReadonlyArray<RunTarget> | undefined,
        { activeRunTargetId: selectedId, defaultRunTargetId },
      ),
    [runTargets, selectedId, defaultRunTargetId],
  );

  return {
    targets,
    activeRunTargetId: resolved.activeRunTargetId,
    activeRunTarget: resolved.activeRunTarget as unknown as RunTarget<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    >,
    setActiveRunTargetId,
  };
}

export { useRunTargets };
export type { UseRunTargetsOptions, UseRunTargetsReturn };
