import type { SupportedUnderlyingTypes } from '../types';
import type { State } from '../types';
import type { Plan } from './types';
import type { z } from 'zod';
import type { NodeChanges } from '@/components';
import {
  constructNodeOfType,
  constructInputOrOutputOfType,
  getCurrentNodesAndEdgesFromState,
  setCurrentNodesAndEdgesToStateWithMutatingState,
  getDirectDependentsOfNodeType,
} from '../nodes/constructAndModifyNodes';
import type { TypeOfInput, TypeOfInputPanel } from '../types';
import {
  applyNodeChanges,
  applyEdgeChanges,
  type EdgeChange,
} from '@xyflow/react';
import { addDuplicateHandlesToLoopNodesAfterInference } from '../nodes/loops';
import { addDuplicateHandleToNodeGroupAfterInference } from '../nodes/nodeGroups';
import { generateRandomString } from '@/utils/randomGeneration';
import { typedKeys } from '@/utils/typedKeys';
import {
  standardNodeTypeNamesMap,
  groupNodeContextMenu,
} from '../standardNodes';
import { getHandleFromNodeDataMatchingHandleId } from '../handles/handleGetters';
import { ensureAllHandleNamesUnique } from '../handles/ensureUniqueHandleName';

/**
 * Length of generated random ids for nodes and edges. Lives here (not in
 * `validators.ts`) because id minting is now part of apply, not validate
 * — keeps `validateAction` purely deterministic.
 */
const lengthOfIds = 20;

// ---------------------------------------------------------------------------
// Helpers for input/output reorder reconstruction
// ---------------------------------------------------------------------------

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
  switch (plan.kind) {
    case 'SET_VIEWPORT':
      draft.viewport = plan.viewport;
      return;
    case 'REPLACE_STATE':
      return plan.state as State<
        DataTypeUniqueId,
        NodeTypeUniqueId,
        UnderlyingType,
        ComplexSchemaType
      >;

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
        draft.viewport = plan.restoreViewport as typeof draft.viewport;
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
        // @ts-expect-error standard node types are always present in state.typeOfNodes
        standardNodeTypeNamesMap.groupInput,
        draft.typeOfNodes,
        groupInputNodeId,
        { x: -500, y: 0 },
      );
      const groupOutputNode = constructNodeOfType(
        draft.dataTypes,
        // @ts-expect-error standard node types are always present in state.typeOfNodes
        standardNodeTypeNamesMap.groupOutput,
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

          // 4b. Group handle duplication
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
      return;
    }

    case 'UPDATE_EDGES_RF': {
      type Edges = typeof draft.edges;
      type Nodes = typeof draft.nodes;
      for (const step of plan.steps) {
        const view = getCurrentNodesAndEdgesFromState(draft);
        if (step.kind === 'passthrough') {
          const updatedEdges = applyEdgeChanges(
            [step.change as EdgeChange],
            view.edges,
          ) as unknown as Edges;
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
              step.updatedEdges as Edges,
            );
          }
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
        // @ts-expect-error standard node types are always present in state.typeOfNodes
        standardNodeTypeNamesMap.loopStart,
        draft.typeOfNodes,
        loopStartId,
        plan.position,
      );
      const loopStopNode = constructNodeOfType(
        draft.dataTypes,
        // @ts-expect-error standard node types are always present in state.typeOfNodes
        standardNodeTypeNamesMap.loopStop,
        draft.typeOfNodes,
        loopStopId,
        { x: plan.position.x + spreadX, y: plan.position.y },
      );
      const loopEndNode = constructNodeOfType(
        draft.dataTypes,
        // @ts-expect-error standard node types are always present in state.typeOfNodes
        standardNodeTypeNamesMap.loopEnd,
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
      return;
    }

    default:
      throw new Error(`Unknown plan kind: ${(plan as Plan).kind}`);
  }
}

export { applyPlan };
