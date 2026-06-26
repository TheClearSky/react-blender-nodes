import { qualifiedId, flattenInputs } from './contract';
import type { MinimalNodeData } from './contract';
import type { ExecutionPlan } from './contract';
import type { CodeWriter } from './codeWriter';
import { toLiteral } from './literals';
import type { NameRegistry } from './nameRegistry';

/** Minimal structural view of a group's subtree the emitter needs (recursion). */
type GroupSubtreeShape = {
  inputNodeId?: string;
  outputNodeId?: string;
  nodes: ReadonlyArray<{ id: string; data: MinimalNodeData }>;
};

/** Minimal structural view of a node-type definition the emitter reads. Codegen
 *  behavior (emit/embed/valueApiStyle) is NO LONGER here — it comes via the
 *  `CodegenMetadata` registry (Decision 6); this view carries only the subtree. */
type EmittableTypeOfNode = {
  subtree?: GroupSubtreeShape;
};

/**
 * One emission scope. The value store is flat (`values["nodeId:handleId"]`); a
 * group nests by prefixing every key with `"groupNodeId>"` (mirrors
 * `ValueStore.createScope`). `plan`/`nodesById` switch to the inner plan and
 * subtree nodes inside a group.
 */
/** Run-wide naming state (the SAME reference in every scope): the readable-name
 *  registry + a nodeId → display-label map used to derive those names. */
type NamingContext = {
  registry: NameRegistry;
  nodeLabels: ReadonlyMap<string, string>;
};

type EmitScope = {
  /** Value-key prefix ('' at root, 'g1>' inside group g1, 'g1>g2>' when nested). */
  prefix: string;
  /** The plan whose `inputResolutionMap` governs reads in this scope. */
  plan: ExecutionPlan;
  /** Handle defs + UI defaults for the nodes addressable in this scope. */
  nodesById: ReadonlyMap<string, MinimalNodeData>;
  /** Shared readable-name registry + labels (constant across scopes). */
  naming: NamingContext;
};

/** Run-wide emitter context, constant across every scope. */
type EmitterContext = {
  writer: CodeWriter;
  /** Group node-type id → its subtree, for recursive group emission. */
  typesById: ReadonlyMap<string, EmittableTypeOfNode>;
};

function buildNodeDataMap(
  nodes: ReadonlyArray<{ id: string; data: MinimalNodeData }>,
): Map<string, MinimalNodeData> {
  const map = new Map<string, MinimalNodeData>();
  for (const node of nodes) map.set(node.id, node.data);
  return map;
}

/** The fully-qualified, scope-prefixed value-store key for a handle. */
function scopedKey(scope: EmitScope, nodeId: string, handleId: string): string {
  return scope.prefix + qualifiedId(nodeId, handleId);
}

/** The handle's display name within a scope (used to derive a readable value name). */
function handleNameOf(
  scope: EmitScope,
  nodeId: string,
  handleId: string,
): string {
  const data = scope.nodesById.get(nodeId);
  if (!data) return handleId;
  for (const input of flattenInputs(data.inputs)) {
    if (input.id === handleId) return input.name ?? handleId;
  }
  for (const output of data.outputs ?? []) {
    if (output.id === handleId) return output.name ?? handleId;
  }
  return handleId;
}

/**
 * The local-variable identifier for a handle's value in this scope — a stable
 * READABLE name (e.g. `bitInputOut`) from the shared registry. Used as both a
 * read expression and an assignment target.
 */
function valueRef(scope: EmitScope, nodeId: string, handleId: string): string {
  const key = scopedKey(scope, nodeId, handleId);
  return (
    scope.naming.registry.existing(key) ??
    scope.naming.registry.nameFor(key, {
      nodeLabel: scope.naming.nodeLabels.get(nodeId) ?? '',
      handleName: handleNameOf(scope, nodeId, handleId),
    })
  );
}

/**
 * `values[…]` ref for the FIRST edge feeding (targetNodeId, targetHandleId), or
 * `null` when there is no incoming edge. `excludeSourceNodeId` drops feedback
 * edges (used for a loop's initial upstream resolution).
 */
function firstConnectedSourceRef(
  scope: EmitScope,
  targetNodeId: string,
  targetHandleId: string,
  excludeSourceNodeId?: string,
): string | null {
  let entries =
    scope.plan.inputResolutionMap.get(
      qualifiedId(targetNodeId, targetHandleId),
    ) ?? [];
  if (excludeSourceNodeId) {
    entries = entries.filter(
      (entry) => entry.sourceNodeId !== excludeSourceNodeId,
    );
  }
  const entry = entries[0];
  if (!entry) return null;
  return valueRef(scope, entry.sourceNodeId, entry.sourceHandleId);
}

/**
 * ALL `values[…]` refs feeding (targetNodeId, targetHandleId), in resolution
 * order — i.e. fan-in. Empty when unconnected. The order matches the runtime
 * `connections` array (both read `plan.inputResolutionMap`), so a fan-in handle's
 * emitted array is element-for-element identical to the executor's.
 */
function allConnectedSourceRefs(
  scope: EmitScope,
  targetNodeId: string,
  targetHandleId: string,
): string[] {
  const entries =
    scope.plan.inputResolutionMap.get(
      qualifiedId(targetNodeId, targetHandleId),
    ) ?? [];
  return entries.map((entry) =>
    valueRef(scope, entry.sourceNodeId, entry.sourceHandleId),
  );
}

/**
 * Expression for an UNCONNECTED input handle (Masterplan §11): the handle is
 * initialized INLINE with its current value in state — a plain constant in the
 * generated code, with NO runtime-override object. An absent value emits
 * `undefined`, matching the executor (which feeds the impl the handle's own
 * `value` as the default). This is what removes the legacy `initialInputValues`
 * parameter from `runGraph` — nothing references it anymore.
 */
function defaultValueExpression(handle: { value?: unknown }): string {
  return toLiteral(handle.value);
}

/**
 * Expression for a structural condition input (LoopStop / SwitchStart), mirroring
 * `resolveConditionValue`: edge source → inline `allowInput` default → `false`.
 */
function conditionValueExpression(
  scope: EmitScope,
  nodeId: string,
  conditionInputId: string | undefined,
): string {
  if (!conditionInputId) return 'false';
  const connected = firstConnectedSourceRef(scope, nodeId, conditionInputId);
  if (connected) return connected;
  const handle = flattenInputs(scope.nodesById.get(nodeId)?.inputs).find(
    (input) => input.id === conditionInputId,
  );
  if (handle?.allowInput && handle.value !== undefined) {
    // Masterplan #6: baked condition value is inlined as a constant.
    return toLiteral(handle.value);
  }
  return 'false';
}

export {
  buildNodeDataMap,
  scopedKey,
  valueRef,
  firstConnectedSourceRef,
  allConnectedSourceRefs,
  defaultValueExpression,
  conditionValueExpression,
};
export type {
  EmitScope,
  EmitterContext,
  EmittableTypeOfNode,
  GroupSubtreeShape,
  NamingContext,
};
