import type { SupportedUnderlyingTypes } from '../types';
import type { State } from '../types';
import type { Plan } from './types';
import type { z } from 'zod';
import { applyPatchesToDraft } from '@/components/organisms/FullGraph/historyTypes';
import type { NodeChanges } from '@/components';
import {
  constructNodeOfType,
  constructInputOrOutputOfType,
  getCurrentNodesAndEdgesFromState,
  setCurrentNodesAndEdgesToStateWithMutatingState,
  setCurrentZonesToState,
  getDirectDependentsOfNodeType,
} from '../nodes/constructAndModifyNodes';
import { removeEdgeWithTypeChecking } from '../constructAndModifyHandles';
import type { TypeOfInput, TypeOfInputPanel } from '../types';
import { applyNodeChanges, applyEdgeChanges } from '@xyflow/react';
import { addDuplicateHandlesToLoopNodesAfterInference } from '../nodes/loops';
import {
  addDuplicateHandlesToSwitchNodesAfterInference,
  isSwitchNode,
  getSwitchStructureFromNode,
} from '../nodes/switches';
import {
  createSwitchZones,
  createLoopZones,
  recomputeAllZoneMemberships,
  rehydrateAllZones,
} from '../zones';

const ZERO_WIDTH_SPACE = '​';

function applySwitchZonePrefixesOnDraft<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  draft: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  nodeId: string,
): void {
  const currentView = getCurrentNodesAndEdgesFromState(draft);
  const node = currentView.nodes.find((n) => n.id === nodeId);
  if (!node) return;
  const nodeType = node.data.nodeTypeUniqueId;
  if (!nodeType) return;

  const isSwitchStartNode = nodeType === standardNodeTypeNamesMap.switchStart;
  const handles = isSwitchStartNode ? node.data.outputs : node.data.inputs;
  if (!Array.isArray(handles) || handles.length <= 2) return;

  const dataCount = handles.length - 2;
  const trueZoneCount = Math.ceil(dataCount / 2);

  for (let i = 1; i < handles.length - 1; i++) {
    const h = handles[i] as Record<string, unknown>;
    if (typeof h.name !== 'string') continue;
    const name = h.name;
    if (!name || name === '' || name === ZERO_WIDTH_SPACE) continue;
    if (!name.startsWith('True: ') && !name.startsWith('False: ')) {
      const dataIdx = i - 1;
      h.name = (dataIdx < trueZoneCount ? 'True: ' : 'False: ') + name;
    }
  }

  // Also do the sibling
  const structure = getSwitchStructureFromNode(
    { ...draft, nodes: currentView.nodes, edges: currentView.edges } as State<
      DataTypeUniqueId,
      NodeTypeUniqueId,
      UnderlyingType,
      ComplexSchemaType
    >,
    node,
  );
  if (structure) {
    const sibling =
      structure.switchStart.id === nodeId
        ? structure.switchEnd
        : structure.switchStart;
    const sibType = sibling.data.nodeTypeUniqueId;
    if (!sibType) return;
    const isSibStart = sibType === standardNodeTypeNamesMap.switchStart;
    const sibHandles = isSibStart ? sibling.data.outputs : sibling.data.inputs;
    if (!Array.isArray(sibHandles) || sibHandles.length <= 2) return;

    const sibDataCount = sibHandles.length - 2;
    const sibTrueCount = Math.ceil(sibDataCount / 2);

    for (let i = 1; i < sibHandles.length - 1; i++) {
      const h = sibHandles[i] as Record<string, unknown>;
      if (typeof h.name !== 'string') continue;
      const name = h.name;
      if (!name || name === '' || name === ZERO_WIDTH_SPACE) continue;
      if (!name.startsWith('True: ') && !name.startsWith('False: ')) {
        const dataIdx = i - 1;
        h.name = (dataIdx < sibTrueCount ? 'True: ' : 'False: ') + name;
      }
    }
  }
}
import { addDuplicateHandleToNodeGroupAfterInference } from '../nodes/nodeGroups';
import { generateRandomString } from '@/utils/randomGeneration';
import { lengthOfIds } from '../constants';
import { typedKeys } from '@/utils/typedKeys';
import {
  standardNodeTypeNamesMap,
  groupNodeContextMenu,
} from '../standardNodes';
import { getHandleFromNodeDataMatchingHandleId } from '../handles/handleGetters';
import { ensureAllHandleNamesUnique } from '../handles/ensureUniqueHandleName';

// ---------------------------------------------------------------------------
// Helpers for input/output reorder reconstruction
// ---------------------------------------------------------------------------
//
// reconstructAllInstances rebuilds each instance's handle arrays by matching
// reused instance handles (opaque, keyed by name::dataType) against freshly
// constructed ones, then writes them back onto the Immer draft's `node.data`.
// Because the arrays are assembled from heterogeneous sources, they flow through
// these minimal structural read-shapes and `unknown[]` accumulators; the final
// `(node.data as Record<string, unknown>).* = ...` write-casts are the
// deliberate, contained boundary of that reconstruction (not gratuitous erasure).

type HandleLike = { name: string; dataType?: { dataTypeUniqueId?: string } };
type PanelLike = { id: string; name: string; inputs: unknown[] };
type BoundaryHandleLike = HandleLike & {
  dataType?: {
    dataTypeObject?: { underlyingType?: string };
    dataTypeUniqueId?: string;
  };
};

function handleKey(handle: HandleLike): string {
  return `${handle.name}::${handle.dataType?.dataTypeUniqueId ?? ''}`;
}

function flattenTypeOfInputsForApply<DataTypeUniqueId extends string = string>(
  inputs: (
    | TypeOfInput<DataTypeUniqueId>
    | TypeOfInputPanel<DataTypeUniqueId>
  )[],
): TypeOfInput<DataTypeUniqueId>[] {
  const result: TypeOfInput<DataTypeUniqueId>[] = [];
  for (const input of inputs) {
    if ('inputs' in input) {
      for (const subInput of input.inputs) {
        result.push(subInput);
      }
    } else {
      result.push(input);
    }
  }
  return result;
}

function collectHandlesFromInstanceInputs(
  inputs: unknown[],
): Map<string, unknown> {
  const map = new Map<string, unknown>();
  for (const entry of inputs) {
    const item = entry as Record<string, unknown>;
    if ('inputs' in item && Array.isArray(item.inputs)) {
      for (const subItem of item.inputs as unknown[]) {
        const handle = subItem as HandleLike;
        map.set(handleKey(handle), subItem);
      }
    } else {
      const handle = item as HandleLike;
      map.set(handleKey(handle), item);
    }
  }
  return map;
}

function collectPanelsFromInstanceInputs(
  inputs: unknown[],
): Map<string, PanelLike> {
  const map = new Map<string, PanelLike>();
  for (const entry of inputs) {
    const item = entry as Record<string, unknown>;
    if ('inputs' in item && Array.isArray(item.inputs)) {
      map.set(item.name as string, item as unknown as PanelLike);
    }
  }
  return map;
}

/**
 * Reconstructs all node instances of a given type after its inputs/outputs
 * have been reordered at the type level. Preserves handle IDs by matching
 * existing handles via `name::dataTypeUniqueId`.
 *
 * Also syncs boundary nodes (groupInput/groupOutput) for node groups.
 */
function reconstructAllInstances<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  draft: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  nodeTypeId: NodeTypeUniqueId,
  newInputs:
    | (TypeOfInput<DataTypeUniqueId> | TypeOfInputPanel<DataTypeUniqueId>)[]
    | undefined,
  newOutputs: TypeOfInput<DataTypeUniqueId>[] | undefined,
): void {
  type NodeType = State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >['nodes'][number];

  function reconstructNodeInstance(node: NodeType): void {
    if (node.data.nodeTypeUniqueId !== nodeTypeId) return;

    if (newInputs !== undefined) {
      const inputs = node.data?.inputs instanceof Array ? node.data.inputs : [];
      const existingHandleMap = collectHandlesFromInstanceInputs(
        inputs as unknown[],
      );
      const existingPanelMap = collectPanelsFromInstanceInputs(
        inputs as unknown[],
      );

      const reconstructedInputs: unknown[] = [];
      for (const typeInput of newInputs) {
        if ('inputs' in typeInput) {
          const existingPanel = existingPanelMap.get(typeInput.name);
          const panelInputs = typeInput.inputs.map((subTypeInput) => {
            const key = `${subTypeInput.name}::${subTypeInput.dataType}`;
            const existing = existingHandleMap.get(key);
            if (existing) {
              existingHandleMap.delete(key);
              return existing;
            }
            return constructInputOrOutputOfType(subTypeInput, draft.dataTypes);
          });
          reconstructedInputs.push({
            id: existingPanel?.id ?? generateRandomString(lengthOfIds),
            name: typeInput.name,
            inputs: panelInputs,
          });
        } else {
          const key = `${typeInput.name}::${typeInput.dataType}`;
          const existing = existingHandleMap.get(key);
          if (existing) {
            existingHandleMap.delete(key);
            reconstructedInputs.push(existing);
          } else {
            reconstructedInputs.push(
              constructInputOrOutputOfType(typeInput, draft.dataTypes),
            );
          }
        }
      }
      (node.data as Record<string, unknown>).inputs = reconstructedInputs;
    }

    if (newOutputs !== undefined) {
      const outputs =
        node.data?.outputs instanceof Array ? node.data.outputs : [];
      const existingOutputMap = new Map<string, unknown>();
      for (const output of outputs as unknown[]) {
        const handle = output as HandleLike;
        existingOutputMap.set(handleKey(handle), output);
      }

      const reconstructedOutputs = newOutputs.map((typeOutput) => {
        const key = `${typeOutput.name}::${typeOutput.dataType}`;
        const existing = existingOutputMap.get(key);
        if (existing) {
          existingOutputMap.delete(key);
          return existing;
        }
        return constructInputOrOutputOfType(typeOutput, draft.dataTypes);
      });
      (node.data as Record<string, unknown>).outputs = reconstructedOutputs;
    }
  }

  // Tier 2: Update instances in dependent subtrees
  const dependents = getDirectDependentsOfNodeType(draft, nodeTypeId);
  for (const dependentType of dependents) {
    const subtree = draft.typeOfNodes[dependentType]?.subtree;
    if (!subtree) continue;
    for (const node of subtree.nodes) {
      reconstructNodeInstance(node);
    }
  }

  // Tier 3: Update instances in root-level nodes
  for (const node of draft.nodes) {
    reconstructNodeInstance(node);
  }

  // Boundary node sync for node groups
  const nodeTypeDef = draft.typeOfNodes[nodeTypeId];
  if (!nodeTypeDef.subtree) return;

  const subtree = nodeTypeDef.subtree;

  if (newInputs !== undefined) {
    const flattenedInputs = flattenTypeOfInputsForApply(newInputs);
    const groupInputNode = subtree.nodes.find(
      (n) => n.id === subtree.inputNodeId,
    );
    if (groupInputNode) {
      const outputs =
        groupInputNode.data?.outputs instanceof Array
          ? (groupInputNode.data.outputs as unknown[])
          : [];

      const existingOutputMap = new Map<string, unknown>();
      const templateOutputs: unknown[] = [];
      for (const output of outputs) {
        const handle = output as BoundaryHandleLike;
        if (
          handle.name === '' &&
          handle.dataType?.dataTypeObject?.underlyingType ===
            'inferFromConnection'
        ) {
          templateOutputs.push(output);
        } else {
          existingOutputMap.set(handleKey(handle), output);
        }
      }

      const reorderedOutputs = flattenedInputs
        .map((typeInput) => {
          const key = `${typeInput.name}::${typeInput.dataType}`;
          return existingOutputMap.get(key);
        })
        .filter(Boolean);

      (groupInputNode.data as Record<string, unknown>).outputs = [
        ...reorderedOutputs,
        ...templateOutputs,
      ];
    }
  }

  if (newOutputs !== undefined) {
    const groupOutputNode = subtree.nodes.find(
      (n) => n.id === subtree.outputNodeId,
    );
    if (groupOutputNode) {
      const inputs =
        groupOutputNode.data?.inputs instanceof Array
          ? (groupOutputNode.data.inputs as unknown[])
          : [];

      const existingInputMap = new Map<string, unknown>();
      const templateInputs: unknown[] = [];
      for (const input of inputs) {
        const handle = input as BoundaryHandleLike;
        if (
          handle.name === '' &&
          handle.dataType?.dataTypeObject?.underlyingType ===
            'inferFromConnection'
        ) {
          templateInputs.push(input);
        } else {
          existingInputMap.set(handleKey(handle), input);
        }
      }

      const reorderedInputs = newOutputs
        .map((typeOutput) => {
          const key = `${typeOutput.name}::${typeOutput.dataType}`;
          return existingInputMap.get(key);
        })
        .filter(Boolean);

      (groupOutputNode.data as Record<string, unknown>).inputs = [
        ...reorderedInputs,
        ...templateInputs,
      ];
    }
  }
}

/**
 * Applies a validated Plan to an Immer draft, mutating it in place.
 *
 * This is the "Apply" half of the Plan/Apply pattern: given a Plan produced
 * by `validateAction()`, it performs the corresponding Immer draft mutations.
 * All validation and computation has already been done in the Plan phase;
 * this function only writes the pre-computed results into the draft.
 *
 * For most plans this function mutates the draft and returns `void`.
 * For plans that replace the entire state (e.g. REPLACE_STATE), it returns
 * the new state directly — Immer supports returning a value from the
 * producer callback to replace the draft entirely.
 */
function applyPlan<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
>(
  draft: State<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
  plan: Plan,
): State<
  DataTypeUniqueId,
  NodeTypeUniqueId,
  UnderlyingType,
  ComplexSchemaType
> | void {
  // Standard node types (groupInput/Output, loop*, switch*) are always merged
  // into typeOfNodes, but their string-literal ids aren't provably in the
  // caller's NodeTypeUniqueId union — assert the brand in one place.
  const asStandardType = (name: string): NodeTypeUniqueId =>
    name as NodeTypeUniqueId;
  switch (plan.kind) {
    case 'SET_VIEWPORT':
      draft.viewport = plan.viewport;
      return;
    case 'REPLACE_STATE': {
      const imported = plan.state as State<
        DataTypeUniqueId,
        NodeTypeUniqueId,
        UnderlyingType,
        ComplexSchemaType
      >;
      const rehydrated = rehydrateAllZones(imported);
      // Reducer purity: return a fresh tree instead of mutating the dispatched
      // action payload. Drop `history` and attach the rehydrated zones without
      // touching `imported`. (The merged dataTypes/typeOfNodes still alias the
      // live type definitions by design, so immer freezes them — harmless today
      // as nothing mutates those schemas, only compares identity.)
      const { history: _history, ...rest } = imported;
      return {
        ...rest,
        zones: rehydrated.zones,
        zoneIndex: rehydrated.zoneIndex,
      };
    }

    case 'OPEN_NODE_GROUP': {
      if (!draft.openedNodeGroupStack) draft.openedNodeGroupStack = [];
      if (plan.pushEntry.nodeId) {
        // Instance opening — push onto existing stack
        draft.openedNodeGroupStack.push(
          plan.pushEntry as (typeof draft.openedNodeGroupStack)[number],
        );
      } else {
        // Original opening — replace the stack
        draft.openedNodeGroupStack = [
          plan.pushEntry as (typeof draft.openedNodeGroupStack)[number],
        ];
      }
      draft.viewport = undefined;
      return;
    }

    case 'CLOSE_NODE_GROUP': {
      if (draft.openedNodeGroupStack && draft.openedNodeGroupStack.length > 0) {
        draft.viewport = plan.restoreViewport;
        draft.openedNodeGroupStack = draft.openedNodeGroupStack.slice(0, -1);
      }
      return;
    }

    case 'ADD_NODE': {
      // Mint id and construct node here (not in validate). Math.random()
      // runs exactly once per dispatch — when applyPlan executes inside
      // Immer's `produce`. validateAction stays pure and replay-safe.
      const newNodeId = generateRandomString(lengthOfIds);
      const newNode = constructNodeOfType(
        draft.dataTypes,
        plan.nodeType as NodeTypeUniqueId,
        draft.typeOfNodes,
        newNodeId,
        plan.position,
      );
      const currentView = getCurrentNodesAndEdgesFromState(draft);
      let updatedNodes = [
        ...currentView.nodes,
        newNode as (typeof currentView.nodes)[number],
      ];
      if (plan.selectExclusively) {
        updatedNodes = updatedNodes.map((n) =>
          n.id === newNodeId
            ? { ...n, selected: true }
            : { ...n, selected: false },
        );
      }
      setCurrentNodesAndEdgesToStateWithMutatingState(draft, updatedNodes);
      return;
    }

    case 'UPDATE_NODES_RF': {
      const currentView = getCurrentNodesAndEdgesFromState(draft);
      const changes = plan.changes as NodeChanges<
        UnderlyingType,
        NodeTypeUniqueId,
        ComplexSchemaType,
        DataTypeUniqueId
      >;
      let updatedNodes = currentView.nodes;
      for (const change of changes) {
        updatedNodes = applyNodeChanges([change], updatedNodes);
      }
      setCurrentNodesAndEdgesToStateWithMutatingState(draft, updatedNodes);

      // Clean up zones for removed structures in the current scope
      {
        const currentViewDel = getCurrentNodesAndEdgesFromState(draft);
        const scopedZones = currentViewDel.zones;
        if (scopedZones) {
          const nodeIdSet = new Set(updatedNodes.map((n) => n.id));
          let zonesChanged = false;
          const cleanedZones = { ...scopedZones };
          for (const zoneId of Object.keys(cleanedZones)) {
            const zone = cleanedZones[zoneId];
            if (zone.structureLink) {
              if (!nodeIdSet.has(zone.structureLink.structureId)) {
                delete cleanedZones[zoneId];
                zonesChanged = true;
              }
            }
          }
          if (zonesChanged || Object.keys(cleanedZones).length > 0) {
            const zr = recomputeAllZoneMemberships({
              ...draft,
              nodes: currentViewDel.nodes,
              edges: currentViewDel.edges,
              zones: cleanedZones,
            });
            setCurrentZonesToState(draft, zr.zones, zr.zoneIndex);
          }
        }
      }

      return;
    }

    case 'ADD_NODE_GROUP': {
      // Mint all three ids here (group node type id + input + output node ids).
      // The number-of-existing-groups count is a deterministic state read.
      const groupNodeTypeId = generateRandomString(lengthOfIds);
      const groupInputNodeId = generateRandomString(lengthOfIds);
      const groupOutputNodeId = generateRandomString(lengthOfIds);

      const groupInputNode = constructNodeOfType(
        draft.dataTypes,
        asStandardType(standardNodeTypeNamesMap.groupInput),
        draft.typeOfNodes,
        groupInputNodeId,
        { x: -500, y: 0 },
      );
      const groupOutputNode = constructNodeOfType(
        draft.dataTypes,
        asStandardType(standardNodeTypeNamesMap.groupOutput),
        draft.typeOfNodes,
        groupOutputNodeId,
        { x: 500, y: 0 },
      );

      const numberOfExistingGroups = typedKeys(draft.typeOfNodes).filter(
        (key) => draft.typeOfNodes[key].subtree,
      ).length;

      const nodeGroupType = {
        name: 'Node Group ' + (numberOfExistingGroups + 1).toString(),
        headerColor: '#344621',
        ...groupNodeContextMenu,
        inputs: [],
        outputs: [],
        subtree: {
          nodes: [groupInputNode, groupOutputNode],
          edges: [],
          numberOfReferences: 0,
          inputNodeId: groupInputNodeId,
          outputNodeId: groupOutputNodeId,
        },
      };

      draft.typeOfNodes[groupNodeTypeId as NodeTypeUniqueId] =
        nodeGroupType as (typeof draft.typeOfNodes)[NodeTypeUniqueId];
      draft.openedNodeGroupStack = [
        {
          nodeType: groupNodeTypeId,
          previousViewport: plan.previousViewport,
        } as NonNullable<typeof draft.openedNodeGroupStack>[number],
      ];
      draft.viewport = undefined;
      return;
    }

    case 'ADD_EDGE': {
      // Mint the edge id here. The plan only carries the validated
      // Connection (source/target/sourceHandle/targetHandle); apply
      // assembles the full Edge object with a fresh id.
      const newEdge = {
        id: generateRandomString(lengthOfIds),
        source: plan.connection.source,
        target: plan.connection.target,
        sourceHandle: plan.connection.sourceHandle,
        targetHandle: plan.connection.targetHandle,
        type: 'configurableEdge' as const,
      };

      const view = getCurrentNodesAndEdgesFromState(draft);

      // 0. Capture pre-inference handle data for group duplication.
      // After inference applies overrideDataType, the handle's dataType
      // changes from 'inferFromConnection' to the concrete type. Group
      // duplication needs the ORIGINAL underlyingType to detect infer handles.
      const preInferenceSourceNode = view.nodes.find(
        (n) => n.id === newEdge.source,
      );
      const preInferenceTargetNode = view.nodes.find(
        (n) => n.id === newEdge.target,
      );
      const preInferenceSourceHandle = preInferenceSourceNode
        ? getHandleFromNodeDataMatchingHandleId(
            plan.connection.sourceHandle,
            preInferenceSourceNode.data,
          )?.value
        : undefined;
      const preInferenceTargetHandle = preInferenceTargetNode
        ? getHandleFromNodeDataMatchingHandleId(
            plan.connection.targetHandle,
            preInferenceTargetNode.data,
          )?.value
        : undefined;

      // 1. Apply inference: replace node data.
      //
      // CRITICAL: deep-clone `newData` before assigning into the draft.
      // The inference plan was computed in `planInferenceForEdgeAddition`
      // which can return frozen objects (Immer's auto-freeze applies to
      // the prior committed state, and inference reads from that frozen
      // tree). If we assigned the frozen `newData` directly, subsequent
      // mutations in step 3 (`addDuplicateHandlesToLoopNodesAfterInference`,
      // which splices into `data.outputs`/`data.inputs`) would fail with
      // "Cannot add property X, object is not extensible".
      //
      // `structuredClone` is the right tool: it produces a mutable deep
      // copy that Immer can subsequently track as a fresh subtree.
      for (const { nodeId, newData } of plan.inference.nodeDataReplacements) {
        const idx = view.nodes.findIndex((n) => n.id === nodeId);
        if (idx !== -1) {
          view.nodes[idx] = {
            ...view.nodes[idx],
            data: structuredClone(
              newData,
            ) as (typeof view.nodes)[number]['data'],
          };
        }
      }

      // 2. Deduplicate handle names after inference. Inference with
      // overrideName can set multiple handles to the same name (e.g. two
      // loopInfer handles both named "Value" after connecting a second
      // source with the same output name). This must run before handle
      // duplication, which inserts new empty-named template handles.
      for (const { nodeId } of plan.inference.nodeDataReplacements) {
        const nodeIndex = view.nodes.findIndex((n) => n.id === nodeId);
        if (nodeIndex !== -1) {
          const nodeTypeId = view.nodes[nodeIndex].data.nodeTypeUniqueId;
          if (nodeTypeId && isSwitchNode(nodeTypeId)) continue;
          ensureAllHandleNamesUnique<
            UnderlyingType,
            NodeTypeUniqueId,
            ComplexSchemaType,
            DataTypeUniqueId
          >(view.nodes[nodeIndex].data);
        }
      }

      // 3. Write back inference changes
      setCurrentNodesAndEdgesToStateWithMutatingState(draft, view.nodes);

      // 4. Run handle duplication on the draft (uses existing mutating functions)
      const sourceNode = view.nodes.find((n) => n.id === newEdge.source);
      const targetNode = view.nodes.find((n) => n.id === newEdge.target);
      if (sourceNode && targetNode) {
        const sourceInferred = plan.inference.nodeDataReplacements.some(
          (r) => r.nodeId === sourceNode.id,
        );
        const targetInferred = plan.inference.nodeDataReplacements.some(
          (r) => r.nodeId === targetNode.id,
        );
        if (sourceInferred || targetInferred) {
          const updatedView = getCurrentNodesAndEdgesFromState(draft);
          const sourceNodeIndex = updatedView.nodes.findIndex(
            (n) => n.id === sourceNode.id,
          );
          const targetNodeIndex = updatedView.nodes.findIndex(
            (n) => n.id === targetNode.id,
          );

          // 4a. Loop handle duplication
          addDuplicateHandlesToLoopNodesAfterInference(
            {
              ...draft,
              nodes: updatedView.nodes,
              edges: updatedView.edges,
            } as State<
              DataTypeUniqueId,
              NodeTypeUniqueId,
              UnderlyingType,
              ComplexSchemaType
            >,
            sourceNodeIndex,
            targetNodeIndex,
            sourceInferred,
            targetInferred,
          );

          // 4b. Switch handle duplication
          addDuplicateHandlesToSwitchNodesAfterInference(
            {
              ...draft,
              nodes: updatedView.nodes,
              edges: updatedView.edges,
            } as State<
              DataTypeUniqueId,
              NodeTypeUniqueId,
              UnderlyingType,
              ComplexSchemaType
            >,
            sourceNodeIndex,
            targetNodeIndex,
            sourceInferred,
            targetInferred,
          );

          // 4b-post. Apply zone prefixes to switch node zoned handles
          if (
            sourceNode &&
            isSwitchNode(sourceNode.data.nodeTypeUniqueId ?? '')
          ) {
            applySwitchZonePrefixesOnDraft(draft, sourceNode.id);
          }
          if (
            targetNode &&
            isSwitchNode(targetNode.data.nodeTypeUniqueId ?? '')
          ) {
            applySwitchZonePrefixesOnDraft(draft, targetNode.id);
          }

          // 4b-post2. Dedup switch node handle names AFTER zone prefixes.
          // Must happen after prefixes so "True: X" and "False: X" are
          // distinct — only true cross-level duplicates (e.g. two
          // "True: Output" in the same zone) get suffixed.
          {
            const switchDeduped = new Set<string>();
            for (const { nodeId } of plan.inference.nodeDataReplacements) {
              const switchView = getCurrentNodesAndEdgesFromState(draft);
              const node = switchView.nodes.find((n) => n.id === nodeId);
              if (!node) continue;
              const ntId = node.data.nodeTypeUniqueId;
              if (!ntId || !isSwitchNode(ntId)) continue;
              if (!switchDeduped.has(nodeId)) {
                ensureAllHandleNamesUnique<
                  UnderlyingType,
                  NodeTypeUniqueId,
                  ComplexSchemaType,
                  DataTypeUniqueId
                >(node.data);
                switchDeduped.add(nodeId);
              }
              const structure = getSwitchStructureFromNode(
                {
                  ...draft,
                  nodes: switchView.nodes,
                  edges: switchView.edges,
                } as State<
                  DataTypeUniqueId,
                  NodeTypeUniqueId,
                  UnderlyingType,
                  ComplexSchemaType
                >,
                node,
              );
              if (structure) {
                const sibling =
                  structure.switchStart.id === nodeId
                    ? structure.switchEnd
                    : structure.switchStart;
                if (!switchDeduped.has(sibling.id)) {
                  ensureAllHandleNamesUnique<
                    UnderlyingType,
                    NodeTypeUniqueId,
                    ComplexSchemaType,
                    DataTypeUniqueId
                  >(sibling.data);
                  switchDeduped.add(sibling.id);
                }
              }
            }
          }

          // 4c. Group handle duplication
          const nodeGroup =
            draft.openedNodeGroupStack?.[draft.openedNodeGroupStack.length - 1];
          if (nodeGroup) {
            const groupView = getCurrentNodesAndEdgesFromState(draft);
            const groupSourceNodeIndex = groupView.nodes.findIndex(
              (n) => n.id === sourceNode.id,
            );
            const groupTargetNodeIndex = groupView.nodes.findIndex(
              (n) => n.id === targetNode.id,
            );
            // Use POST-inference handles for the handle objects (they carry
            // the inferred name/type that the group propagation needs), but
            // use PRE-inference dataType to determine isInferFromConnection
            // (overrideDataType changes it from 'inferFromConnection' to the
            // concrete type, which would make the XOR gate always false).
            const postInferenceSourceHandle =
              getHandleFromNodeDataMatchingHandleId(
                plan.connection.sourceHandle,
                groupView.nodes[groupSourceNodeIndex].data,
              )?.value;
            const postInferenceTargetHandle =
              getHandleFromNodeDataMatchingHandleId(
                plan.connection.targetHandle,
                groupView.nodes[groupTargetNodeIndex].data,
              )?.value;
            if (postInferenceSourceHandle && postInferenceTargetHandle) {
              const isSourceNodeGroupInput =
                sourceNode.data.nodeTypeUniqueId ===
                standardNodeTypeNamesMap.groupInput;
              const isTargetNodeGroupOutput =
                targetNode.data.nodeTypeUniqueId ===
                standardNodeTypeNamesMap.groupOutput;

              const isSourceInferFromConnection =
                preInferenceSourceHandle?.dataType?.dataTypeObject
                  .underlyingType === 'inferFromConnection';
              const isTargetInferFromConnection =
                preInferenceTargetHandle?.dataType?.dataTypeObject
                  .underlyingType === 'inferFromConnection';

              addDuplicateHandleToNodeGroupAfterInference(
                {
                  ...draft,
                  nodes: groupView.nodes,
                  edges: groupView.edges,
                } as State<
                  DataTypeUniqueId,
                  NodeTypeUniqueId,
                  UnderlyingType,
                  ComplexSchemaType
                >,
                groupSourceNodeIndex,
                groupTargetNodeIndex,
                postInferenceSourceHandle,
                postInferenceTargetHandle,
                draft as State<
                  DataTypeUniqueId,
                  NodeTypeUniqueId,
                  UnderlyingType,
                  ComplexSchemaType
                >,
                isSourceInferFromConnection,
                isTargetInferFromConnection,
                isSourceNodeGroupInput,
                isTargetNodeGroupOutput,
                nodeGroup,
              );
            }
          }
        }
      }

      // 5. Push the edge
      const finalView = getCurrentNodesAndEdgesFromState(draft);
      finalView.edges.push(newEdge as (typeof finalView.edges)[number]);
      setCurrentNodesAndEdgesToStateWithMutatingState(
        draft,
        finalView.nodes,
        finalView.edges,
      );

      // 6. Recompute zone memberships for all switch structures
      if (draft.zones && Object.keys(draft.zones).length > 0) {
        {
          const cv = getCurrentNodesAndEdgesFromState(draft);
          const zr = recomputeAllZoneMemberships({
            ...draft,
            nodes: cv.nodes,
            edges: cv.edges,
            zones: cv.zones,
          });
          setCurrentZonesToState(draft, zr.zones, zr.zoneIndex);
        }
      }

      return;
    }

    case 'UPDATE_EDGES_RF': {
      type Nodes = typeof draft.nodes;
      for (const step of plan.steps) {
        const view = getCurrentNodesAndEdgesFromState(draft);
        if (step.kind === 'passthrough') {
          const updatedEdges = applyEdgeChanges([step.change], view.edges);
          setCurrentNodesAndEdgesToStateWithMutatingState(
            draft,
            undefined,
            updatedEdges,
          );
        } else if (step.kind === 'removal') {
          if (step.validation.isValid) {
            setCurrentNodesAndEdgesToStateWithMutatingState(
              draft,
              step.updatedNodes as Nodes,
              step.updatedEdges,
            );
          }
        }
      }

      // Recompute zone memberships after edge changes
      if (draft.zones && Object.keys(draft.zones).length > 0) {
        {
          const cv = getCurrentNodesAndEdgesFromState(draft);
          const zr = recomputeAllZoneMemberships({
            ...draft,
            nodes: cv.nodes,
            edges: cv.edges,
            zones: cv.zones,
          });
          setCurrentZonesToState(draft, zr.zones, zr.zoneIndex);
        }
      }

      return;
    }

    case 'UPDATE_NODE_TYPE': {
      const nodeTypeId = plan.nodeTypeId as NodeTypeUniqueId;
      const nodeTypeDef = draft.typeOfNodes[nodeTypeId];

      // Tier 1: Update the TypeOfNode definition (source of truth)
      if (plan.updates.name !== undefined) {
        nodeTypeDef.name = plan.updates.name;
      }
      if (plan.updates.headerColor !== undefined) {
        nodeTypeDef.headerColor = plan.updates.headerColor;
      }

      const newInputs = plan.updates.inputs as
        | typeof nodeTypeDef.inputs
        | undefined;
      const newOutputs = plan.updates.outputs as
        | typeof nodeTypeDef.outputs
        | undefined;

      if (newInputs !== undefined) {
        nodeTypeDef.inputs = newInputs;
      }
      if (newOutputs !== undefined) {
        nodeTypeDef.outputs = newOutputs;
      }

      // Reconstruct all instances if inputs/outputs changed
      if (newInputs !== undefined || newOutputs !== undefined) {
        reconstructAllInstances(draft, nodeTypeId, newInputs, newOutputs);
      }

      // Tier 2: Update name/headerColor in instances in dependent subtrees
      const dependents = getDirectDependentsOfNodeType(draft, nodeTypeId);
      for (const dependentType of dependents) {
        const subtree = draft.typeOfNodes[dependentType]?.subtree;
        if (!subtree) continue;
        for (const node of subtree.nodes) {
          if (node.data.nodeTypeUniqueId !== nodeTypeId) continue;
          if (plan.updates.name !== undefined) {
            node.data.name = plan.updates.name;
          }
          if (plan.updates.headerColor !== undefined) {
            node.data.headerColor = plan.updates.headerColor;
          }
        }
      }

      // Tier 3: Update name/headerColor in instances in root-level nodes
      for (const node of draft.nodes) {
        if (node.data.nodeTypeUniqueId !== nodeTypeId) continue;
        if (plan.updates.name !== undefined) {
          node.data.name = plan.updates.name;
        }
        if (plan.updates.headerColor !== undefined) {
          node.data.headerColor = plan.updates.headerColor;
        }
      }

      return;
    }

    case 'ADD_LOOP': {
      const spreadX = 600;
      const loopStartId = generateRandomString(lengthOfIds);
      const loopStopId = generateRandomString(lengthOfIds);
      const loopEndId = generateRandomString(lengthOfIds);

      const loopStartNode = constructNodeOfType(
        draft.dataTypes,
        asStandardType(standardNodeTypeNamesMap.loopStart),
        draft.typeOfNodes,
        loopStartId,
        plan.position,
      );
      const loopStopNode = constructNodeOfType(
        draft.dataTypes,
        asStandardType(standardNodeTypeNamesMap.loopStop),
        draft.typeOfNodes,
        loopStopId,
        { x: plan.position.x + spreadX, y: plan.position.y },
      );
      const loopEndNode = constructNodeOfType(
        draft.dataTypes,
        asStandardType(standardNodeTypeNamesMap.loopEnd),
        draft.typeOfNodes,
        loopEndId,
        { x: plan.position.x + spreadX * 2, y: plan.position.y },
      );

      const currentView = getCurrentNodesAndEdgesFromState(draft);
      const updatedNodes = [
        ...currentView.nodes,
        loopStartNode as (typeof currentView.nodes)[number],
        loopStopNode as (typeof currentView.nodes)[number],
        loopEndNode as (typeof currentView.nodes)[number],
      ];

      const loopStartOutputs = loopStartNode.data.outputs!;
      const loopStopInputs = loopStopNode.data.inputs!;
      const loopStopOutputs = loopStopNode.data.outputs!;
      const loopEndInputs = loopEndNode.data.inputs!;

      const bindEdgeStartToStop = {
        id: generateRandomString(lengthOfIds),
        source: loopStartId,
        target: loopStopId,
        sourceHandle: loopStartOutputs[0].id,
        targetHandle: loopStopInputs[0].id,
        type: 'configurableEdge' as const,
      };
      const bindEdgeStopToEnd = {
        id: generateRandomString(lengthOfIds),
        source: loopStopId,
        target: loopEndId,
        sourceHandle: loopStopOutputs[0].id,
        targetHandle: loopEndInputs[0].id,
        type: 'configurableEdge' as const,
      };

      const updatedEdges = [
        ...currentView.edges,
        bindEdgeStartToStop as (typeof currentView.edges)[number],
        bindEdgeStopToEnd as (typeof currentView.edges)[number],
      ];
      setCurrentNodesAndEdgesToStateWithMutatingState(
        draft,
        updatedNodes,
        updatedEdges,
      );

      // Create zones for the new loop structure
      const loopZones = createLoopZones(
        loopStartId,
        loopStopId,
        loopEndId,
        loopStartNode.data,
        loopStopNode.data,
        loopEndNode.data,
      );
      {
        const currentViewForZones = getCurrentNodesAndEdgesFromState(draft);
        setCurrentZonesToState(
          draft,
          { ...(currentViewForZones.zones ?? {}), ...loopZones },
          { handleToZone: {} },
        );
      }

      return;
    }

    case 'UPDATE_LOOP': {
      const currentView = getCurrentNodesAndEdgesFromState(draft);

      function updateNodeHandles(
        nodeId: string,
        inHandleUpdates: Array<{ id: string; name: string }>,
        outHandleUpdates: Array<{ id: string; name: string }>,
        inStartIndex: number,
        outStartIndex: number,
      ): void {
        const node = currentView.nodes.find((n) => n.id === nodeId);
        if (!node) return;
        const inputs = node.data?.inputs;
        const outputs = node.data?.outputs;
        if (!Array.isArray(inputs) || !Array.isArray(outputs)) return;

        const inputIdMap = new Map<string, Record<string, unknown>>();
        for (let i = inStartIndex; i < inputs.length; i++) {
          const handle = inputs[i] as Record<string, unknown>;
          inputIdMap.set(handle.id as string, handle);
        }

        const outputIdMap = new Map<string, Record<string, unknown>>();
        for (let i = outStartIndex; i < outputs.length; i++) {
          const handle = outputs[i] as Record<string, unknown>;
          outputIdMap.set(handle.id as string, handle);
        }

        const fixedInputs = inputs.slice(0, inStartIndex);
        const fixedOutputs = outputs.slice(0, outStartIndex);

        const reorderedInputs = inHandleUpdates
          .map((update) => {
            const existing = inputIdMap.get(update.id);
            if (existing) existing.name = update.name;
            return existing;
          })
          .filter(Boolean);

        const reorderedOutputs = outHandleUpdates
          .map((update) => {
            const existing = outputIdMap.get(update.id);
            if (existing) existing.name = update.name;
            return existing;
          })
          .filter(Boolean);

        const remainingInputs = [...inputIdMap.values()].filter(
          (h) => !inHandleUpdates.some((u) => u.id === (h.id as string)),
        );
        const remainingOutputs = [...outputIdMap.values()].filter(
          (h) => !outHandleUpdates.some((u) => u.id === (h.id as string)),
        );

        (node.data as Record<string, unknown>).inputs = [
          ...fixedInputs,
          ...reorderedInputs,
          ...remainingInputs,
        ];
        (node.data as Record<string, unknown>).outputs = [
          ...fixedOutputs,
          ...reorderedOutputs,
          ...remainingOutputs,
        ];
      }

      const loopStartInStart = 0;
      const loopStartOutStart = 1;
      const loopStopInStart = 2;
      const loopStopOutStart = 1;
      const loopEndInStart = 1;
      const loopEndOutStart = 0;

      updateNodeHandles(
        plan.loopStartNodeId,
        plan.levels.map((l) => l.handles.loopStartIn),
        plan.levels.map((l) => l.handles.loopStartOut),
        loopStartInStart,
        loopStartOutStart,
      );
      updateNodeHandles(
        plan.loopStopNodeId,
        plan.levels.map((l) => l.handles.loopStopIn),
        plan.levels.map((l) => l.handles.loopStopOut),
        loopStopInStart,
        loopStopOutStart,
      );
      updateNodeHandles(
        plan.loopEndNodeId,
        plan.levels.map((l) => l.handles.loopEndIn),
        plan.levels.map((l) => l.handles.loopEndOut),
        loopEndInStart,
        loopEndOutStart,
      );

      return;
    }

    case 'ADD_SWITCH': {
      const spreadX = 600;
      const switchStartId = generateRandomString(lengthOfIds);
      const switchEndId = generateRandomString(lengthOfIds);

      const switchStartNode = constructNodeOfType(
        draft.dataTypes,
        asStandardType(standardNodeTypeNamesMap.switchStart),
        draft.typeOfNodes,
        switchStartId,
        plan.position,
      );
      const switchEndNode = constructNodeOfType(
        draft.dataTypes,
        asStandardType(standardNodeTypeNamesMap.switchEnd),
        draft.typeOfNodes,
        switchEndId,
        { x: plan.position.x + spreadX, y: plan.position.y },
      );

      const currentView = getCurrentNodesAndEdgesFromState(draft);
      const updatedNodes = [
        ...currentView.nodes,
        switchStartNode as (typeof currentView.nodes)[number],
        switchEndNode as (typeof currentView.nodes)[number],
      ];

      const switchStartOutputs = switchStartNode.data.outputs!;
      const switchEndInputs = switchEndNode.data.inputs!;

      const bindEdge = {
        id: generateRandomString(lengthOfIds),
        source: switchStartId,
        target: switchEndId,
        sourceHandle: switchStartOutputs[0].id,
        targetHandle: switchEndInputs[0].id,
        type: 'configurableEdge' as const,
      };

      const updatedEdges = [
        ...currentView.edges,
        bindEdge as (typeof currentView.edges)[number],
      ];
      setCurrentNodesAndEdgesToStateWithMutatingState(
        draft,
        updatedNodes,
        updatedEdges,
      );

      // Create zones for the new switch structure
      const newZones = createSwitchZones(switchStartId, switchEndId);
      {
        const currentViewForZones = getCurrentNodesAndEdgesFromState(draft);
        setCurrentZonesToState(
          draft,
          { ...(currentViewForZones.zones ?? {}), ...newZones },
          { handleToZone: {} },
        );
      }

      return;
    }

    case 'UPDATE_SWITCH': {
      const currentView = getCurrentNodesAndEdgesFromState(draft);

      function reorderSwitchHandles(
        nodeId: string,
        flatUpdates: Array<{ id: string; name: string }>,
        startIndex: number,
        side: 'input' | 'output',
        isZoned: boolean,
        trueZoneUpdates?: Array<{ id: string; name: string }>,
        falseZoneUpdates?: Array<{ id: string; name: string }>,
      ): void {
        const node = currentView.nodes.find((n) => n.id === nodeId);
        if (!node) return;
        const handles =
          side === 'input'
            ? (node.data?.inputs as unknown[] | undefined)
            : (node.data?.outputs as unknown[] | undefined);
        if (!Array.isArray(handles)) return;

        const handleById = new Map<string, Record<string, unknown>>();
        for (let i = startIndex; i < handles.length; i++) {
          const h = handles[i] as Record<string, unknown>;
          handleById.set(h.id as string, h);
        }

        const fixed = handles.slice(0, startIndex);
        const updateIds = new Set(flatUpdates.map((u) => u.id));

        for (const update of flatUpdates) {
          const h = handleById.get(update.id);
          if (h) h.name = update.name;
        }

        const templates = [...handleById.values()].filter(
          (h) => !updateIds.has(h.id as string),
        );

        let reordered: unknown[];
        if (isZoned && trueZoneUpdates && falseZoneUpdates) {
          const trueData = trueZoneUpdates
            .map((u) => handleById.get(u.id))
            .filter(Boolean);
          const falseData = falseZoneUpdates
            .map((u) => handleById.get(u.id))
            .filter(Boolean);
          const trueTemplates = templates.slice(
            0,
            Math.ceil(templates.length / 2),
          );
          const falseTemplates = templates.slice(
            Math.ceil(templates.length / 2),
          );
          reordered = [
            ...trueData,
            ...trueTemplates,
            ...falseData,
            ...falseTemplates,
          ];
        } else {
          const data = flatUpdates
            .map((u) => handleById.get(u.id))
            .filter(Boolean);
          reordered = [...data, ...templates];
        }

        (node.data as Record<string, unknown>)[
          side === 'input' ? 'inputs' : 'outputs'
        ] = [...fixed, ...reordered];
      }

      const trueOuts = plan.levels.map((l) => l.handles.switchStartTrueOut);
      const falseOuts = plan.levels.map((l) => l.handles.switchStartFalseOut);
      const trueIns = plan.levels.map((l) => l.handles.switchEndTrueIn);
      const falseIns = plan.levels.map((l) => l.handles.switchEndFalseIn);

      // SwitchStart inputs: [data..., condition, template] — not zoned
      reorderSwitchHandles(
        plan.switchStartNodeId,
        plan.levels.map((l) => l.handles.switchStartIn),
        0,
        'input',
        false,
      );
      // SwitchStart outputs: [bind, trueData..., trueTemplate, falseData..., falseTemplate] — zoned
      reorderSwitchHandles(
        plan.switchStartNodeId,
        [...trueOuts, ...falseOuts],
        1,
        'output',
        true,
        trueOuts,
        falseOuts,
      );
      // SwitchEnd inputs: [bind, trueData..., trueTemplate, falseData..., falseTemplate] — zoned
      reorderSwitchHandles(
        plan.switchEndNodeId,
        [...trueIns, ...falseIns],
        1,
        'input',
        true,
        trueIns,
        falseIns,
      );
      // SwitchEnd outputs: [data..., template] — not zoned
      reorderSwitchHandles(
        plan.switchEndNodeId,
        plan.levels.map((l) => l.handles.switchEndOut),
        0,
        'output',
        false,
      );

      return;
    }

    case 'UPDATE_INPUT_VALUE': {
      const inputView = getCurrentNodesAndEdgesFromState(draft);
      const targetNode = inputView.nodes.find((n) => n.id === plan.nodeId);
      if (!targetNode) return;
      const handleResult = getHandleFromNodeDataMatchingHandleId(
        plan.inputId,
        targetNode.data,
      );
      if (handleResult?.value) {
        (handleResult.value as Record<string, unknown>).value = plan.value;
      }
      return;
    }

    case 'OPEN_DRAWER':
      draft.activeDrawer = plan.activeDrawer;
      return;

    case 'CLOSE_DRAWER':
      draft.activeDrawer = undefined;
      return;

    case 'UNDO': {
      if (!draft.history) return;
      const undoEntry = draft.history.undoStack.pop();
      if (!undoEntry) return;
      applyPatchesToDraft(draft, undoEntry.inversePatches);
      draft.history.redoStack.push(undoEntry);
      return;
    }

    case 'REDO': {
      if (!draft.history) return;
      const redoEntry = draft.history.redoStack.pop();
      if (!redoEntry) return;
      applyPatchesToDraft(draft, redoEntry.patches);
      draft.history.undoStack.push(redoEntry);
      return;
    }

    case 'BEGIN_BATCH': {
      if (!draft.history) {
        draft.history = {
          undoStack: [],
          redoStack: [],
          config: {},
          activeBatch: null,
        };
      }
      if (draft.history.activeBatch) return;
      draft.history.activeBatch = {
        patches: [],
        inversePatches: [],
        actionTypes: [],
        startTimestamp: Date.now(),
      };
      return;
    }

    case 'END_BATCH': {
      if (!draft.history?.activeBatch) return;
      const batch = draft.history.activeBatch;
      draft.history.activeBatch = null;
      if (batch.patches.length === 0) return;
      draft.history.undoStack.push({
        patches: batch.patches,
        inversePatches: batch.inversePatches,
        actionType: batch.actionTypes.join('+'),
        timestamp: batch.startTimestamp,
      });
      draft.history.redoStack = [];
      const maxSize = draft.history.config.maxSize;
      if (maxSize !== undefined && draft.history.undoStack.length > maxSize) {
        draft.history.undoStack = draft.history.undoStack.slice(-maxSize);
      }
      return;
    }

    case 'CLEAR_HISTORY': {
      if (!draft.history) return;
      draft.history.undoStack = [];
      draft.history.redoStack = [];
      draft.history.activeBatch = null;
      return;
    }

    case 'DELETE_NODE_TYPE_HANDLES': {
      // Plan ids/cascade are non-generic (string / default-`D` TypeOfInput) by
      // design; re-assert FullGraph's brands at this boundary (see types.ts).
      const nodeTypeId = plan.nodeTypeId as NodeTypeUniqueId;
      const nodeTypeDef = draft.typeOfNodes[nodeTypeId];
      if (!nodeTypeDef) return;
      const { cascade } = plan;

      const newInputs = cascade.newInputs as typeof nodeTypeDef.inputs;
      const newOutputs = cascade.newOutputs as typeof nodeTypeDef.outputs;

      // 1. Remove the connected edges in each affected scope through the SAME
      //    routine the disconnect action uses (removeEdgeWithTypeChecking), in a
      //    loop, so the opposite endpoint's inferred type reverts immediately.
      //    Done BEFORE the handles are dropped, while both endpoints are intact.
      const removeEdgesWithInference = (
        scopeNodes: typeof draft.nodes,
        scopeEdges: typeof draft.edges,
        edgeIds: string[],
      ): { nodes: typeof draft.nodes; edges: typeof draft.edges } => {
        let nodes = scopeNodes;
        let edges = scopeEdges;
        for (const edgeId of edgeIds) {
          const edge = edges.find((e) => e.id === edgeId);
          if (!edge) continue;
          const result = removeEdgeWithTypeChecking(
            edge,
            { ...draft, nodes, edges },
            { type: 'remove' as const, id: edgeId },
          );
          nodes = result.updatedNodes as typeof draft.nodes;
          edges = result.updatedEdges;
        }
        return { nodes, edges };
      };

      if (cascade.rootEdgeIds.length > 0) {
        const r = removeEdgesWithInference(
          draft.nodes,
          draft.edges,
          cascade.rootEdgeIds,
        );
        draft.nodes = r.nodes;
        draft.edges = r.edges;
      }
      for (const [scopeTypeId, edgeIds] of Object.entries(
        cascade.subtreeEdgeIds,
      )) {
        if (edgeIds.length === 0) continue;
        const subtree =
          draft.typeOfNodes[scopeTypeId as NodeTypeUniqueId]?.subtree;
        if (!subtree) continue;
        const r = removeEdgesWithInference(
          subtree.nodes,
          subtree.edges,
          edgeIds,
        );
        subtree.nodes = r.nodes;
        subtree.edges = r.edges;
      }
      if (cascade.ownSubtreeEdgeIds.length > 0 && nodeTypeDef.subtree) {
        const r = removeEdgesWithInference(
          nodeTypeDef.subtree.nodes,
          nodeTypeDef.subtree.edges,
          cascade.ownSubtreeEdgeIds,
        );
        nodeTypeDef.subtree.nodes = r.nodes;
        nodeTypeDef.subtree.edges = r.edges;
      }

      // 2. Shrink the type definition (handles removed).
      nodeTypeDef.inputs = newInputs;
      nodeTypeDef.outputs = newOutputs;

      // 3. Rebuild every instance (root + dependent subtrees) and the
      //    groupInput/groupOutput boundary handles to match the shrunk
      //    definition. Handles absent from it are dropped; inferFromConnection
      //    templates are preserved. (reconstructAllInstances does NOT touch
      //    edges — those were already removed above.)
      reconstructAllInstances(draft, nodeTypeId, newInputs, newOutputs);

      // 4. Recompute zone memberships in affected scopes that have zones
      //    (removed edges can change loop/switch membership).
      const recomputeZones = (
        nodes: typeof draft.nodes,
        edges: typeof draft.edges,
        zones: typeof draft.zones,
      ) =>
        zones && Object.keys(zones).length > 0
          ? recomputeAllZoneMemberships({ ...draft, nodes, edges, zones })
          : undefined;

      if (cascade.rootEdgeIds.length > 0) {
        const zr = recomputeZones(draft.nodes, draft.edges, draft.zones);
        if (zr) {
          draft.zones = zr.zones;
          draft.zoneIndex = zr.zoneIndex;
        }
      }
      for (const scopeTypeId of Object.keys(cascade.subtreeEdgeIds)) {
        const subtree =
          draft.typeOfNodes[scopeTypeId as NodeTypeUniqueId]?.subtree;
        if (!subtree) continue;
        const zr = recomputeZones(subtree.nodes, subtree.edges, subtree.zones);
        if (zr) {
          subtree.zones = zr.zones;
          subtree.zoneIndex = zr.zoneIndex;
        }
      }
      if (cascade.ownSubtreeEdgeIds.length > 0 && nodeTypeDef.subtree) {
        const ownSubtree = nodeTypeDef.subtree;
        const zr = recomputeZones(
          ownSubtree.nodes,
          ownSubtree.edges,
          ownSubtree.zones,
        );
        if (zr) {
          ownSubtree.zones = zr.zones;
          ownSubtree.zoneIndex = zr.zoneIndex;
        }
      }

      return;
    }

    case 'DELETE_LOOP_CHANNELS':
    case 'DELETE_SWITCH_CHANNELS': {
      // Loop and switch channel deletion are identical at apply time: remove the
      // cascaded edges (reverting inference on the opposite endpoint), drop the
      // channel's handles by id from their nodes, then recompute zones. Every
      // cascade shares one scope (the loop/switch's current view).
      const { cascades } = plan;
      if (cascades.length === 0) return;
      const scopeId = cascades[0].scopeId;
      const isRoot = scopeId === 'root';
      const subtree = isRoot
        ? undefined
        : draft.typeOfNodes[scopeId as NodeTypeUniqueId]?.subtree;
      if (!isRoot && !subtree) return;

      let nodes = (isRoot ? draft.nodes : subtree!.nodes) as typeof draft.nodes;
      let edges = (isRoot ? draft.edges : subtree!.edges) as typeof draft.edges;

      // 1. Remove every cascaded edge FIRST, through the same routine the
      //    disconnect action uses, so the opposite endpoint's inferred type
      //    reverts while both endpoints are still intact.
      const edgeIds = new Set<string>();
      for (const cascade of cascades) {
        for (const id of cascade.edgeIds) edgeIds.add(id);
      }
      for (const edgeId of edgeIds) {
        const edge = edges.find((e) => e.id === edgeId);
        if (!edge) continue;
        const result = removeEdgeWithTypeChecking(
          edge,
          { ...draft, nodes, edges },
          { type: 'remove' as const, id: edgeId },
        );
        nodes = result.updatedNodes as typeof nodes;
        edges = result.updatedEdges;
      }

      // 2. Drop the channel handle ids from each owning node (order-preserving
      //    filter — never reorder, so the switch true/false split stays valid).
      const removalsByNode = new Map<string, Set<string>>();
      for (const cascade of cascades) {
        for (const removal of cascade.removals) {
          let set = removalsByNode.get(removal.nodeId);
          if (!set) {
            set = new Set<string>();
            removalsByNode.set(removal.nodeId, set);
          }
          for (const id of removal.handleIds) set.add(id);
        }
      }
      nodes = nodes.map((node) => {
        const toRemove = removalsByNode.get(node.id);
        if (!toRemove || toRemove.size === 0) return node;
        const data = node.data as {
          inputs?: unknown[];
          outputs?: unknown[];
        } & Record<string, unknown>;
        const drop = (arr: unknown[] | undefined) =>
          Array.isArray(arr)
            ? arr.filter((h) => !toRemove.has((h as { id: string }).id))
            : arr;
        return {
          ...node,
          data: {
            ...data,
            inputs: drop(data.inputs),
            outputs: drop(data.outputs),
          },
        };
      }) as typeof nodes;

      // 3. Write the shrunk nodes/edges back to the scope.
      if (isRoot) {
        draft.nodes = nodes;
        draft.edges = edges;
      } else {
        subtree!.nodes = nodes;
        subtree!.edges = edges;
      }

      // 4. Recompute zone memberships in this scope (removed edges/handles can
      //    shrink loop pre/post-stop or switch true/false membership).
      const zones = isRoot ? draft.zones : subtree!.zones;
      if (zones && Object.keys(zones).length > 0) {
        const zr = recomputeAllZoneMemberships({
          ...draft,
          nodes,
          edges,
          zones,
        });
        if (isRoot) {
          draft.zones = zr.zones;
          draft.zoneIndex = zr.zoneIndex;
        } else {
          subtree!.zones = zr.zones;
          subtree!.zoneIndex = zr.zoneIndex;
        }
      }
      return;
    }

    default:
      throw new Error(`Unknown plan kind: ${(plan as Plan).kind}`);
  }
}

export { applyPlan };
