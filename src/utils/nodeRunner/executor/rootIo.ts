import type {
  State,
  SupportedUnderlyingTypes,
} from '../../nodeStateManagement/types';
import type { z } from 'zod';
import type { ExecutionPlan } from '../types';
import type { ValueStore, MinimalNodeData } from '../valueStore';

// ─────────────────────────────────────────────────────
// Root Graph I/O — shared seed / collect helpers
// ─────────────────────────────────────────────────────

/**
 * Shared root Graph I/O plumbing for BOTH executor entry points (`execute` and
 * `executeStepByStep`), so the two stay in lockstep by construction rather than
 * by duplicated copies that can drift (the latter is exactly how step mode fell
 * behind before).
 *
 * - `seedRootInputs`: feeds `rootInputs[…]` into the root Graph Input node's
 *   output handles, keyed by handle NAME (mirrors codegen's `runGraph(a, b)`
 *   parameters) OR, as a fallback, by stable handle ID — so a caller who keys
 *   by id is immune to rename-on-connect. The Graph Input is a no-impl boundary
 *   node excluded from `levels`, so its handle data is read from `state`.
 * - `collectRootOutputs`: reads the value feeding each input handle of the root
 *   Graph Output node, keyed by handle NAME (mirrors codegen's `runGraph`
 *   return — outputs are name-only so the interpreter result stays byte-equal
 *   to the emitted `runGraph`; see the note in the function). Fan-in (multiple
 *   edges into one handle) ⇒ the ARRAY of all values.
 */

function seedRootInputs<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  plan: ExecutionPlan,
  state: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  valueStore: ValueStore,
  rootInputs: Record<string, unknown> | undefined,
): void {
  if (!plan.rootInputNodeId || !rootInputs) return;
  const graphInput = state.nodes.find(
    (node) => node.id === plan.rootInputNodeId,
  );
  for (const output of graphInput?.data.outputs ?? []) {
    if (!output.id) continue;
    // Name-or-id keying: prefer the handle NAME (matches codegen's runGraph
    // params and the documented contract), fall back to the stable handle ID so
    // a caller who keys `rootInputs` by id is immune to rename-on-connect. A
    // membership (`in`) test — NOT `??` — preserves an explicit `undefined`
    // value as an intentional seed, exactly as before.
    const key =
      output.name && output.name in rootInputs
        ? output.name
        : output.id in rootInputs
          ? output.id
          : undefined;
    if (key !== undefined) {
      valueStore.set(plan.rootInputNodeId, output.id, rootInputs[key]);
    }
  }
}

function collectRootOutputs<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  plan: ExecutionPlan,
  state: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  valueStore: ValueStore,
  nodeInfoMap: ReadonlyMap<
    string,
    { data: MinimalNodeData; typeOfNode?: { name?: string } }
  >,
): Record<string, unknown> | undefined {
  if (!plan.rootOutputNodeId) return undefined;
  const graphOutput = state.nodes.find(
    (node) => node.id === plan.rootOutputNodeId,
  );
  if (!graphOutput) return undefined;

  const inputMap = valueStore.resolveInputs(
    plan.rootOutputNodeId,
    graphOutput.data,
    plan.inputResolutionMap,
    nodeInfoMap,
  );
  const rootOutputs: Record<string, unknown> = {};
  for (const [name, handleValue] of inputMap) {
    // Fan-in (multiple edges into one Graph Output handle) ⇒ the ARRAY of all
    // connected values; a single edge ⇒ the scalar; none ⇒ undefined.
    // Parity with codegen's `runGraph` return.
    //
    // Outputs are keyed by NAME only — NOT also by id. The whole runner
    // contract is that the interpreter's `rootOutputs` is byte-for-byte the
    // object codegen's `runGraph` returns, and `runGraph` keys its return by
    // the readable handle NAME (a stable random id would be unreadable in
    // generated code). Adding id keys here would diverge from `runGraph` and
    // break that parity. To keep an output NAME stable across connects, set
    // `allowRootIORename={false}`. (The INPUT side accepts name-or-id because
    // there the CALLER supplies the keys, which never reaches generated code.)
    rootOutputs[name] =
      handleValue.connections.length > 1
        ? handleValue.connections.map((connection) => connection.value)
        : handleValue.connections[0]?.value;
  }
  return rootOutputs;
}

export { seedRootInputs, collectRootOutputs };
