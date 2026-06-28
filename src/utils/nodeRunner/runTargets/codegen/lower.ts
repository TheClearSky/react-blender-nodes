import type { z } from 'zod';
import { qualifiedId, flattenInputs } from './contract';
import { getDataHandleIds, findConditionInputId } from './contract';
import type {
  State,
  SupportedUnderlyingTypes,
  ExecutionPlan,
  ExecutionStep,
  GroupExecutionScope,
  LoopExecutionBlock,
  StandardExecutionStep,
  SwitchExecutionBlock,
  NodeCodegenMetadata,
} from './contract';
import {
  allConnectedSourceRefs,
  buildNodeDataMap,
  conditionValueExpression,
  defaultValueExpression,
  firstConnectedSourceRef,
  scopedKey,
  valueRef,
} from './emitHelpers';
import type {
  EmitScope,
  EmittableTypeOfNode,
  NamingContext,
} from './emitHelpers';
import { createNameRegistry } from './nameRegistry';
import type {
  CgInput,
  CgModule,
  CgNodeCall,
  CgOutput,
  CgStmt,
  CgStore,
} from './ir';
import type { SourceEmissionPlan } from './analyze/sourceEmit';

type LowerContext = {
  typesById: ReadonlyMap<string, EmittableTypeOfNode>;
  /** node-type id → codegen behavior (the `emit` hook), Decision 6 — supplied via
   *  `CodegenMetadata`, no longer read off `state.typeOfNodes`. */
  nodeTypeMetadata: Readonly<Record<string, NodeCodegenMetadata>>;
  language: 'javascript' | 'typescript';
  /** Loop-carry variable names: registered (for uniqueness) + hoisted like value
   *  vars, but they are INTERNAL loop state — not node outputs — so the compat
   *  keyed return must exclude them. Collected during lowering. */
  loopCarryNames: Set<string>;
  /** node-type id → local fn name for source-emitted impls (empty when the
   *  `emitImplementations: 'source'` feature is off). */
  localNameByTypeId: ReadonlyMap<string, string>;
};

type LowerOptions = {
  exportRunGraph?: boolean;
  language?: 'javascript' | 'typescript';
  nodeTypeMetadata?: Readonly<Record<string, NodeCodegenMetadata>>;
  /** Source-emission plan (`emitImplementations: 'source'`). When present, covered
   *  node types call a local fn and their defs are emitted into the module. */
  sourceEmission?: SourceEmissionPlan;
};

function resolveDataTypeId(handle: {
  dataType?: { dataTypeUniqueId?: string };
  inferredDataType?: { dataTypeUniqueId?: string } | null;
}): string {
  return (
    handle.inferredDataType?.dataTypeUniqueId ??
    handle.dataType?.dataTypeUniqueId ??
    ''
  );
}

/** Loop/switch bodies are flat topologically-sorted arrays; sort by concurrency
 *  level ascending (stable) so a node never precedes a same-body producer. */
function sortByConcurrency(
  steps: ReadonlyArray<ExecutionStep>,
): ExecutionStep[] {
  return [...steps].sort((a, b) => a.concurrencyLevel - b.concurrencyLevel);
}

function lowerSteps(
  steps: ReadonlyArray<ExecutionStep>,
  scope: EmitScope,
  context: LowerContext,
): CgStmt[] {
  const out: CgStmt[] = [];
  for (const step of steps) out.push(...lowerStep(step, scope, context));
  return out;
}

function lowerStep(
  step: ExecutionStep,
  scope: EmitScope,
  context: LowerContext,
): CgStmt[] {
  switch (step.kind) {
    case 'standard':
      return lowerStandardNode(step, scope, context);
    case 'loop':
      return lowerLoop(step, scope, context);
    case 'switch':
      return lowerSwitch(step, scope, context);
    case 'group':
      return lowerGroup(step, scope, context);
  }
}

/**
 * Strip the Unicode line/paragraph separators (U+2028 / U+2029) that
 * `JSON.stringify` leaves UNESCAPED but the JS lexer treats as line terminators, so
 * a custom name or type name — including a value injected via an imported state that
 * bypassed the `UPDATE_NODE_CUSTOM_NAME` validator — can't terminate the `// node …`
 * line comment mid-string.
 */
function sanitizeForLineComment(text: string): string {
  // Strip U+2028 / U+2029 (line & paragraph separators) — JSON.stringify leaves
  // them unescaped but the JS lexer treats them as line terminators, so they could
  // break the `// node …` comment. Built from char codes so no raw separator or
  // fragile escape sits in this source file.
  const lineSeparators = String.fromCharCode(0x2028, 0x2029);
  return Array.from(text)
    .filter((ch) => !lineSeparators.includes(ch))
    .join('');
}

function lowerStandardNode(
  step: StandardExecutionStep,
  scope: EmitScope,
  context: LowerContext,
): CgStmt[] {
  // A custom name (standard nodes only) is shown in the comment ONLY — generated
  // identifiers stay type-derived/stable. JSON.stringify (like nodeTypeName) escapes
  // quotes / newlines / `*/`; sanitizeForLineComment additionally strips the Unicode
  // line separators JSON.stringify does NOT escape (U+2028 / U+2029), so neither
  // field can terminate the `//` line — even a value imported past the validator.
  // Truthiness (not `!== undefined`): an empty-string customName — only reachable
  // via a REPLACE_STATE import that bypassed the validator's empty→undefined — is
  // treated as "no custom name" rather than emitting a degenerate `// node "" : …`.
  const customNamePrefix = step.customName
    ? `${JSON.stringify(sanitizeForLineComment(step.customName))} : `
    : '';
  const comment = `// node ${customNamePrefix}${JSON.stringify(sanitizeForLineComment(step.nodeTypeName))} (${step.nodeTypeId})  [${step.nodeId}]`;
  const data = scope.nodesById.get(step.nodeId);
  if (!data) {
    return [
      { kind: 'raw', line: comment },
      { kind: 'raw', line: '// (node data unavailable — skipped)' },
    ];
  }
  const inputsFlat = flattenInputs(data.inputs);
  const outputsArr = data.outputs ?? [];

  // emitCode hook: render inline when the node type opts in and its `emit` covers
  // every output. A throwing or partial `emit` falls through to the call form.
  const emit = context.nodeTypeMetadata[step.nodeTypeId]?.emit;
  const emitFanInSafe =
    context.nodeTypeMetadata[step.nodeTypeId]?.emitFanInSafe ?? false;
  // Fan-in guard: an OPAQUE author `emit` hook receives only a single
  // first-connection expression per handle (`inputs.X`) and we cannot prove it
  // doesn't also need the rest, so a fan-in input forces the threaded call form to
  // stay value-identical to the executor. A FAN-IN-SAFE hook (auto-derived) sources
  // each input from `inputs` (first) or `inputsAll` (array) exactly as the impl
  // reads it, so it inlines even under fan-in.
  const hasFanIn = inputsFlat.some((input) => {
    if (!input.id) return false;
    const entries =
      scope.plan.inputResolutionMap.get(qualifiedId(step.nodeId, input.id)) ??
      [];
    return entries.length > 1;
  });
  if (emit && (!hasFanIn || emitFanInSafe)) {
    const inputExprs: Record<string, string> = {};
    const inputExprsAll: Record<string, string> = {};
    for (const input of inputsFlat) {
      if (!input.id || !input.name) continue;
      const entries =
        scope.plan.inputResolutionMap.get(qualifiedId(step.nodeId, input.id)) ??
        [];
      if (entries.length > 0) {
        inputExprs[input.name] = valueRef(
          scope,
          entries[0].sourceNodeId,
          entries[0].sourceHandleId,
        );
        // The array-literal of every fan-in connection — the codegen analogue of
        // `readInput(inputs, name)` returning the whole array.
        inputExprsAll[input.name] = `[${entries
          .map((entry) =>
            valueRef(scope, entry.sourceNodeId, entry.sourceHandleId),
          )
          .join(', ')}]`;
      } else {
        // Unconnected: the baked default, scalar and as a one-element array
        // (mirrors `readInput`'s `[bakedDefault]`).
        const fallback = defaultValueExpression(input);
        inputExprs[input.name] = fallback;
        inputExprsAll[input.name] = `[${fallback}]`;
      }
    }
    const outputNames = outputsArr
      .filter((output) => output.id && output.name)
      .map((output) => output.name as string);
    let emitted: Readonly<Record<string, string>> | null = null;
    try {
      emitted = emit({
        inputs: inputExprs,
        inputsAll: inputExprsAll,
        outputs: outputNames,
        nodeId: step.nodeId,
        language: context.language,
      });
    } catch {
      emitted = null;
    }
    if (emitted) {
      const result = emitted;
      if (outputNames.every((name) => typeof result[name] === 'string')) {
        const assignments = outputsArr
          .filter((output) => output.id && output.name)
          .map((output) => ({
            targetRef: valueRef(scope, step.nodeId, output.id as string),
            expr: result[output.name as string],
            dataTypeId: resolveDataTypeId(output),
          }));
        return [{ kind: 'inline', comment, assignments }];
      }
    }
  }

  const inputs: CgInput[] = [];
  for (const input of inputsFlat) {
    if (!input.id || !input.name) continue;
    const meta = {
      handleId: input.id,
      handleName: input.name,
      dataTypeId: resolveDataTypeId(input),
    };
    const entries =
      scope.plan.inputResolutionMap.get(qualifiedId(step.nodeId, input.id)) ??
      [];
    if (entries.length > 0) {
      inputs.push({
        name: input.name,
        connections: entries.map((entry) =>
          valueRef(scope, entry.sourceNodeId, entry.sourceHandleId),
        ),
        isDefault: false,
        meta,
      });
    } else {
      inputs.push({
        name: input.name,
        connections: [],
        isDefault: true,
        defaultExpr: defaultValueExpression(input),
        meta,
      });
    }
  }

  const outputs: CgOutput[] = [];
  const stores: CgStore[] = [];
  for (const output of outputsArr) {
    if (!output.id || !output.name) continue;
    const dataTypeId = resolveDataTypeId(output);
    outputs.push({
      name: output.name,
      meta: { handleId: output.id, handleName: output.name, dataTypeId },
    });
    stores.push({
      outputName: output.name,
      targetRef: valueRef(scope, step.nodeId, output.id),
      dataTypeId,
    });
  }

  const nodeCall: CgNodeCall = {
    kind: 'nodeCall',
    nodeId: step.nodeId,
    nodeTypeId: step.nodeTypeId,
    nodeTypeName: step.nodeTypeName,
    comment,
    inputs,
    outputs,
    stores,
    // Source-emission: a covered type calls its emitted local fn; absent ⇒ the
    // threaded `functionImplementations[…]` form (unchanged default behaviour).
    localCallName: context.localNameByTypeId.get(step.nodeTypeId),
  };
  return [nodeCall];
}

function lowerLoop(
  block: LoopExecutionBlock,
  scope: EmitScope,
  context: LowerContext,
): CgStmt[] {
  const startData = scope.nodesById.get(block.loopStartNodeId);
  const stopData = scope.nodesById.get(block.loopStopNodeId);
  const endData = scope.nodesById.get(block.loopEndNodeId);
  const stopInputs = flattenInputs(stopData?.inputs);

  const startDataInputIds = getDataHandleIds(flattenInputs(startData?.inputs));
  const startDataOutputIds = getDataHandleIds(startData?.outputs ?? []);
  const stopDataInputIds = getDataHandleIds(stopInputs);
  const stopDataOutputIds = getDataHandleIds(stopData?.outputs ?? []);
  const endDataInputIds = getDataHandleIds(flattenInputs(endData?.inputs));
  const endDataOutputIds = getDataHandleIds(endData?.outputs ?? []);
  const conditionInputId = findConditionInputId(stopInputs);
  const count = startDataInputIds.length;

  // Mirror the executor's loop-structure validation (executeLoopBlock): all six
  // data-handle rows must share the same non-zero count and a condition input
  // must exist. Without this, codegen would index out of range and silently emit
  // `<ref> = undefined`, diverging from the executor (which throws on the same
  // malformed structure). Fail here so codegen ≡ executor by construction.
  if (
    count === 0 ||
    startDataOutputIds.length !== count ||
    stopDataInputIds.length !== count ||
    stopDataOutputIds.length !== count ||
    endDataInputIds.length !== count ||
    endDataOutputIds.length !== count ||
    conditionInputId === undefined
  ) {
    throw new Error(
      `Loop structure has mismatched data handle counts ` +
        `(start in=${startDataInputIds.length}, start out=${startDataOutputIds.length}, ` +
        `stop in=${stopDataInputIds.length}, stop out=${stopDataOutputIds.length}, ` +
        `end in=${endDataInputIds.length}, end out=${endDataOutputIds.length})`,
    );
  }

  // Masterplan §12: ONE named variable per loop variable (the carry), declared
  // just before the `for` — not a `currentValues[i]` array. Unique across the
  // module via the name registry (keyed by the loop node + index).
  const carryNames = Array.from({ length: count }, (_, i) =>
    scope.naming.registry.force(
      `${block.loopStartNodeId}:carry${i}`,
      'loopValue',
    ),
  );
  for (const name of carryNames) context.loopCarryNames.add(name);
  const initial: string[] = [];
  for (let i = 0; i < count; i++) {
    initial.push(
      firstConnectedSourceRef(
        scope,
        block.loopStartNodeId,
        startDataInputIds[i],
        block.loopStopNodeId,
      ) ?? 'undefined',
    );
  }

  const forBody: CgStmt[] = [];
  for (let i = 0; i < count; i++) {
    forBody.push({
      kind: 'raw',
      line: `${valueRef(scope, block.loopStartNodeId, startDataOutputIds[i])} = ${carryNames[i]};`,
    });
  }
  forBody.push(
    ...lowerSteps(sortByConcurrency(block.preStopSteps), scope, context),
  );
  forBody.push({
    kind: 'raw',
    line: `condition = Boolean(${conditionValueExpression(scope, block.loopStopNodeId, conditionInputId)});`,
  });
  for (let i = 0; i < count; i++) {
    const ref =
      firstConnectedSourceRef(
        scope,
        block.loopStopNodeId,
        stopDataInputIds[i],
      ) ?? 'undefined';
    forBody.push({ kind: 'raw', line: `${carryNames[i]} = ${ref};` });
    forBody.push({
      kind: 'raw',
      line: `${valueRef(scope, block.loopStopNodeId, stopDataOutputIds[i])} = ${carryNames[i]};`,
    });
  }

  // On stop (condition false): publish the loop-end outputs, then break.
  const stopBody: CgStmt[] = [];
  for (let i = 0; i < count; i++) {
    stopBody.push({
      kind: 'raw',
      line: `${valueRef(scope, block.loopEndNodeId, endDataOutputIds[i])} = ${carryNames[i]};`,
    });
  }
  stopBody.push({ kind: 'raw', line: 'break;' });

  if (block.postStopSteps.length === 0) {
    // No post-stop work ⇒ the "continue" branch is a no-op. Collapse
    // `if (cond) {} else { stop }` to the equivalent `if (!cond) { stop }`.
    forBody.push({
      kind: 'block',
      open: 'if (!condition) {',
      body: stopBody,
      close: '}',
    });
  } else {
    // Post-stop body runs on continue and feeds back into the carry.
    const thenBody: CgStmt[] = [
      ...lowerSteps(sortByConcurrency(block.postStopSteps), scope, context),
    ];
    for (let i = 0; i < count; i++) {
      const ref = firstConnectedSourceRef(
        scope,
        block.loopEndNodeId,
        endDataInputIds[i],
      );
      if (ref)
        thenBody.push({ kind: 'raw', line: `${carryNames[i]} = ${ref};` });
    }
    forBody.push({
      kind: 'ifElse',
      condition: 'condition',
      thenBody,
      elseBody: stopBody,
    });
  }

  // The carry names are registered value identifiers (hoisted as a `let` at the
  // function top like every value var), so INITIALIZE them here with a plain
  // assignment — re-declaring with `let` would shadow the hoisted binding.
  const blockBody: CgStmt[] = [];
  for (let i = 0; i < count; i++) {
    blockBody.push({ kind: 'raw', line: `${carryNames[i]} = ${initial[i]};` });
  }
  blockBody.push(
    { kind: 'raw', line: 'let condition = false;' },
    {
      kind: 'block',
      open: `for (let iteration = 0; iteration < ${block.maxIterations}; iteration++) {`,
      body: forBody,
      close: '}',
    },
    {
      kind: 'raw',
      line: `if (condition) throw new Error(${JSON.stringify(
        `Loop exceeded maximum iterations (${block.maxIterations})`,
      )});`,
    },
  );

  return [
    {
      kind: 'raw',
      line: `// LOOP  [${block.loopStartNodeId}]  (max ${block.maxIterations} iterations)`,
    },
    { kind: 'block', open: '{', body: blockBody, close: '}' },
  ];
}

function lowerSwitch(
  block: SwitchExecutionBlock,
  scope: EmitScope,
  context: LowerContext,
): CgStmt[] {
  const startData = scope.nodesById.get(block.switchStartNodeId);
  const endData = scope.nodesById.get(block.switchEndNodeId);
  const startInputs = flattenInputs(startData?.inputs);

  const startDataInputIds = getDataHandleIds(startInputs);
  const startDataOutputIds = getDataHandleIds(startData?.outputs ?? []);
  const endDataInputIds = getDataHandleIds(flattenInputs(endData?.inputs));
  const endDataOutputIds = getDataHandleIds(endData?.outputs ?? []);
  const conditionInputId = findConditionInputId(startInputs);
  const count = startDataInputIds.length;

  // Mirror the executor's switch-structure validation (executeSwitchBlock): a
  // non-zero data-handle count, an end-output row matching it, and a condition
  // input. Without this, codegen indexes out of range and emits wrong
  // assignments, diverging from the executor (which throws on the same malformed
  // structure). Fail here so codegen ≡ executor by construction.
  if (
    count === 0 ||
    endDataOutputIds.length !== count ||
    conditionInputId === undefined
  ) {
    throw new Error(
      `Switch structure has mismatched data handle counts ` +
        `(start in=${count}, start out=${startDataOutputIds.length}, ` +
        `end in=${endDataInputIds.length}, end out=${endDataOutputIds.length})`,
    );
  }

  const trueOutputCount = Math.ceil(startDataOutputIds.length / 2);
  const trueInputCount = Math.ceil(endDataInputIds.length / 2);

  const blockBody: CgStmt[] = [];
  const inputs: string[] = [];
  for (let i = 0; i < count; i++) {
    inputs.push(
      firstConnectedSourceRef(
        scope,
        block.switchStartNodeId,
        startDataInputIds[i],
      ) ?? 'undefined',
    );
  }
  blockBody.push({
    kind: 'raw',
    line: `const switchInputs = [${inputs.join(', ')}];`,
  });
  for (let i = 0; i < count; i++) {
    if (i < trueOutputCount) {
      blockBody.push({
        kind: 'raw',
        line: `${valueRef(scope, block.switchStartNodeId, startDataOutputIds[i])} = switchInputs[${i}];`,
      });
    }
    const falseIdx = trueOutputCount + i;
    if (falseIdx < startDataOutputIds.length) {
      blockBody.push({
        kind: 'raw',
        line: `${valueRef(scope, block.switchStartNodeId, startDataOutputIds[falseIdx])} = switchInputs[${i}];`,
      });
    }
  }
  blockBody.push({
    kind: 'raw',
    line: `const condition = Boolean(${conditionValueExpression(scope, block.switchStartNodeId, conditionInputId)});`,
  });

  const thenBody: CgStmt[] = [
    ...lowerSteps(sortByConcurrency(block.trueBranchSteps), scope, context),
  ];
  for (let i = 0; i < count; i++) {
    if (i < endDataInputIds.length) {
      const ref =
        firstConnectedSourceRef(
          scope,
          block.switchEndNodeId,
          endDataInputIds[i],
        ) ?? 'undefined';
      thenBody.push({
        kind: 'raw',
        line: `${valueRef(scope, block.switchEndNodeId, endDataOutputIds[i])} = ${ref};`,
      });
    }
  }
  const elseBody: CgStmt[] = [
    ...lowerSteps(sortByConcurrency(block.falseBranchSteps), scope, context),
  ];
  for (let i = 0; i < count; i++) {
    const branchInputIdx = trueInputCount + i;
    if (branchInputIdx < endDataInputIds.length) {
      const ref =
        firstConnectedSourceRef(
          scope,
          block.switchEndNodeId,
          endDataInputIds[branchInputIdx],
        ) ?? 'undefined';
      elseBody.push({
        kind: 'raw',
        line: `${valueRef(scope, block.switchEndNodeId, endDataOutputIds[i])} = ${ref};`,
      });
    }
  }
  blockBody.push({
    kind: 'ifElse',
    condition: 'condition',
    thenBody,
    elseBody,
  });

  return [
    { kind: 'raw', line: `// SWITCH  [${block.switchStartNodeId}]` },
    { kind: 'block', open: '{', body: blockBody, close: '}' },
  ];
}

function lowerGroup(
  scopeStep: GroupExecutionScope,
  scope: EmitScope,
  context: LowerContext,
): CgStmt[] {
  const comment = `// GROUP ${JSON.stringify(scopeStep.groupNodeTypeName)}  [${scopeStep.groupNodeId}]`;
  const head: CgStmt = { kind: 'raw', line: comment };
  const subtree = context.typesById.get(scopeStep.groupNodeTypeId)?.subtree;
  if (!subtree) {
    return [head, { kind: 'raw', line: '// (no subtree — group skipped)' }];
  }
  const innerScope: EmitScope = {
    prefix: scope.prefix + scopeStep.groupNodeId + '>',
    plan: scopeStep.innerPlan,
    nodesById: buildNodeDataMap(subtree.nodes),
    naming: scope.naming,
  };

  const blockBody: CgStmt[] = [];
  const groupInputNodeId = subtree.inputNodeId;
  if (groupInputNodeId) {
    for (const [outerHandleId, innerHandleId] of scopeStep.inputMapping) {
      const ref = firstConnectedSourceRef(
        scope,
        scopeStep.groupNodeId,
        outerHandleId,
      );
      if (ref) {
        blockBody.push({
          kind: 'raw',
          line: `${valueRef(innerScope, groupInputNodeId, innerHandleId)} = ${ref};`,
        });
      }
    }
  }
  for (const level of scopeStep.innerPlan.levels) {
    blockBody.push(...lowerSteps(level, innerScope, context));
  }
  const groupOutputNodeId = subtree.outputNodeId;
  if (groupOutputNodeId) {
    for (const [innerHandleId, outerHandleId] of scopeStep.outputMapping) {
      const ref = firstConnectedSourceRef(
        innerScope,
        groupOutputNodeId,
        innerHandleId,
      );
      if (ref) {
        blockBody.push({
          kind: 'raw',
          line: `${valueRef(scope, scopeStep.groupNodeId, outerHandleId)} = ${ref};`,
        });
      }
    }
  }
  return [head, { kind: 'block', open: '{', body: blockBody, close: '}' }];
}

/** Build a `nodeId → display label` map from the whole plan (recursively),
 *  for deriving readable value names. Standard nodes use their type name;
 *  structural nodes get a role label. */
function collectNodeLabels(
  steps: ReadonlyArray<ExecutionStep>,
  into: Map<string, string>,
): void {
  for (const step of steps) {
    switch (step.kind) {
      case 'standard':
        into.set(step.nodeId, step.nodeTypeName);
        break;
      case 'loop':
        into.set(step.loopStartNodeId, 'loop');
        into.set(step.loopStopNodeId, 'loop');
        into.set(step.loopEndNodeId, 'loop');
        collectNodeLabels(step.preStopSteps, into);
        collectNodeLabels(step.postStopSteps, into);
        break;
      case 'switch':
        into.set(step.switchStartNodeId, 'switch');
        into.set(step.switchEndNodeId, 'switch');
        collectNodeLabels(step.trueBranchSteps, into);
        collectNodeLabels(step.falseBranchSteps, into);
        break;
      case 'group':
        into.set(step.groupNodeId, step.groupNodeTypeName);
        for (const level of step.innerPlan.levels) {
          collectNodeLabels(level, into);
        }
        break;
      default: {
        // Exhaustiveness: a new ExecutionStep.kind must be handled here too (mirrors
        // `collectNodeTypeIds` in emitGraph.ts), else its label silently goes missing.
        const _exhaustive: never = step;
        void _exhaustive;
      }
    }
  }
}

/** Lower a plan + state into the codegen IR module (no strings emitted). */
function lowerModule<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  plan: ExecutionPlan,
  state: Readonly<
    State<DataTypeUniqueId, NodeTypeUniqueId, UnderlyingType, ComplexSchemaType>
  >,
  options: LowerOptions = {},
): CgModule {
  const definitionsByTypeId = state.typeOfNodes as Readonly<
    Record<string, EmittableTypeOfNode>
  >;
  const typesById = new Map<string, EmittableTypeOfNode>();
  for (const typeId of Object.keys(definitionsByTypeId)) {
    typesById.set(typeId, definitionsByTypeId[typeId]);
  }
  // Codegen behavior per node type (the `emit` hook) — supplied via the
  // CodegenMetadata registry, not read off `state.typeOfNodes` (Decision 6).
  const nodeTypeMetadata = options.nodeTypeMetadata ?? {};

  const context: LowerContext = {
    typesById,
    nodeTypeMetadata,
    language: options.language ?? 'javascript',
    loopCarryNames: new Set<string>(),
    localNameByTypeId: options.sourceEmission?.localNameByTypeId ?? new Map(),
  };
  const nodeLabels = new Map<string, string>();
  for (const level of plan.levels) collectNodeLabels(level, nodeLabels);
  const naming: NamingContext = {
    registry: createNameRegistry(),
    nodeLabels,
  };
  // Source-emission: reserve the emitted function names (readInput intrinsic +
  // helpers + impl locals) BEFORE rootParams force / body value-var naming, so
  // those avoid them. The pure analysis already made these names collision-free
  // vs RESERVED_NAMES + each other, so `reserve` returns each unchanged; they are
  // kept OUT of `entries()` (not value-store slots), so the hoisted-`let` list and
  // the keyed return are unaffected.
  for (const emitted of options.sourceEmission?.emittedFunctions ?? []) {
    naming.registry.reserve(emitted.name);
  }
  // Also reserve the structural locals the source-emit analysis treats as taken
  // (CSM-6: `switchInputs`/`loopValue`), so the registry is self-consistent — a
  // defense-in-depth pairing with the analysis denylist (`emitGraph.ts` injects both
  // into `reservedNames`). Gated so feature-off naming is byte-identical.
  if (options.sourceEmission) {
    naming.registry.reserve('switchInputs');
    naming.registry.reserve('loopValue');
  }
  const rootScope: EmitScope = {
    prefix: '',
    plan,
    nodesById: buildNodeDataMap(state.nodes ?? []),
    naming,
  };

  const headerLines = [
    '// Auto-generated from a react-blender-nodes graph. No runtime dependencies.',
    options.sourceEmission
      ? '// Implementations are baked in where possible; any node still threaded (see warnings) needs its impl.'
      : '// Provide node implementations keyed by node-type id, then call runGraph().',
    ...plan.warnings.map((warning) => `// warning: ${warning}`),
    // Source-emission per-node coverage warnings (already `// warning:`-prefixed).
    ...(options.sourceEmission?.warnings ?? []),
  ];

  // Root Graph I/O → the function-model signature. FORCE the Graph Input node's
  // output handles to their param names (so downstream reads resolve to the
  // parameter) BEFORE lowering the body; collect the params (with data type for
  // the TS target). Build the return from the Graph Output node's input handles.
  const nodesArr = state.nodes ?? [];
  let rootParams: Array<{ name: string; dataTypeId: string }> | undefined;
  if (plan.rootInputNodeId) {
    const graphInput = nodesArr.find(
      (node) => node.id === plan.rootInputNodeId,
    );
    if (graphInput) {
      rootParams = [];
      for (const output of graphInput.data.outputs ?? []) {
        if (!output.id || !output.name) continue;
        const paramName = naming.registry.force(
          scopedKey(rootScope, plan.rootInputNodeId, output.id),
          toParamIdentifier(output.name),
        );
        rootParams.push({
          name: paramName,
          dataTypeId: resolveDataTypeId(output),
        });
      }
    }
  }

  const body: CgStmt[] = [];
  for (const level of plan.levels)
    body.push(...lowerSteps(level, rootScope, context));

  let rootReturn: Array<{ outputName: string; expr: string }> | undefined;
  if (plan.rootOutputNodeId) {
    const graphOutput = nodesArr.find(
      (node) => node.id === plan.rootOutputNodeId,
    );
    if (graphOutput) {
      rootReturn = [];
      for (const input of flattenInputs(graphOutput.data.inputs)) {
        if (!input.id || !input.name) continue;
        // Fan-in (multiple edges into one Graph Output handle) ⇒ return the ARRAY
        // of all connected values; a single edge ⇒ the scalar value; none ⇒
        // `undefined`. Parity with the executor's `rootOutputs` collection.
        const refs = allConnectedSourceRefs(
          rootScope,
          plan.rootOutputNodeId,
          input.id,
        );
        const expr =
          refs.length === 0
            ? 'undefined'
            : refs.length === 1
              ? refs[0]
              : `[${refs.join(', ')}]`;
        rootReturn.push({ outputName: input.name, expr });
      }
    }
  }

  return {
    headerLines,
    body,
    exportRunGraph: options.exportRunGraph !== false,
    nameEntries: naming.registry.entries(),
    rootParams,
    rootReturn,
    loopCarryNames: [...context.loopCarryNames],
    emittedFunctions: options.sourceEmission?.emittedFunctions,
  };
}

/** Sanitize a handle name into a valid JS parameter identifier. */
function toParamIdentifier(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9_$]/g, '_');
  return /^[A-Za-z_$]/.test(cleaned) ? cleaned : `p_${cleaned}`;
}

export { lowerModule };
export type { LowerOptions };
