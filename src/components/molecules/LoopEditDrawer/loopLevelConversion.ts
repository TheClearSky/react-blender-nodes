import { getLoopNodeInferHandleIndex } from '@/utils/nodeStateManagement/nodes/loops/loopIdentification';
import { standardNodeTypeNamesMap } from '@/utils/nodeStateManagement/standardNodes';
import type { HandleShape } from '@/components/atoms/HandleShapeSwatch/handleShapes';

type HandleInfo = { id: string; name: string };

type LoopHandleLevel = {
  id: string;
  dataTypeUniqueId: string;
  dataTypeColor: string;
  dataTypeShape?: HandleShape;
  handles: {
    loopStartIn: HandleInfo;
    loopStartOut: HandleInfo;
    loopStopIn: HandleInfo;
    loopStopOut: HandleInfo;
    loopEndIn: HandleInfo;
    loopEndOut: HandleInfo;
  };
};

type NodeData = {
  inputs?: ReadonlyArray<Record<string, unknown>>;
  outputs?: ReadonlyArray<Record<string, unknown>>;
};

function getInferHandles(
  nodeData: NodeData,
  nodeType: string,
): { inputs: Record<string, unknown>[]; outputs: Record<string, unknown>[] } {
  const inputs = Array.isArray(nodeData.inputs) ? [...nodeData.inputs] : [];
  const outputs = Array.isArray(nodeData.outputs) ? [...nodeData.outputs] : [];

  const inputStartIndex = getLoopNodeInferHandleIndex(nodeType, 'input');
  const outputStartIndex = getLoopNodeInferHandleIndex(nodeType, 'output');

  const inferInputs = inputs.slice(inputStartIndex, inputs.length - 1);
  const inferOutputs = outputs.slice(outputStartIndex, outputs.length - 1);

  return { inputs: inferInputs, outputs: inferOutputs };
}

function extractHandleInfo(handle: Record<string, unknown>): HandleInfo {
  return {
    id: (handle.id as string) ?? '',
    name: (handle.name as string) ?? '',
  };
}

function extractDataTypeInfo(handle: Record<string, unknown>): {
  dataTypeUniqueId: string;
  dataTypeColor: string;
  dataTypeShape: HandleShape | undefined;
} {
  const dataType = handle.dataType as
    | {
        dataTypeUniqueId?: string;
        dataTypeObject?: { color?: string; shape?: HandleShape };
      }
    | undefined;
  // Source the swatch from the handle's OWN instance fields — the exact fields the
  // canvas paints (ConfigurableNode -> handleColor/handleShape) — so the editor
  // mirrors the canvas; fall back to the resolved data-type object when absent.
  return {
    dataTypeUniqueId: dataType?.dataTypeUniqueId ?? '',
    dataTypeColor:
      (handle.handleColor as string | undefined) ??
      dataType?.dataTypeObject?.color ??
      '#666666',
    dataTypeShape:
      (handle.handleShape as HandleShape | undefined) ??
      dataType?.dataTypeObject?.shape,
  };
}

function extractLevelsFromLoopNodes(
  loopStartData: NodeData,
  loopStopData: NodeData,
  loopEndData: NodeData,
): LoopHandleLevel[] {
  const startHandles = getInferHandles(
    loopStartData,
    standardNodeTypeNamesMap.loopStart,
  );
  const stopHandles = getInferHandles(
    loopStopData,
    standardNodeTypeNamesMap.loopStop,
  );
  const endHandles = getInferHandles(
    loopEndData,
    standardNodeTypeNamesMap.loopEnd,
  );

  const levelCount = Math.min(
    startHandles.inputs.length,
    startHandles.outputs.length,
    stopHandles.inputs.length,
    stopHandles.outputs.length,
    endHandles.inputs.length,
    endHandles.outputs.length,
  );

  const levels: LoopHandleLevel[] = [];
  for (let i = 0; i < levelCount; i++) {
    const startIn = startHandles.inputs[i];
    const { dataTypeUniqueId, dataTypeColor, dataTypeShape } =
      extractDataTypeInfo(startIn);

    levels.push({
      id: extractHandleInfo(startIn).id,
      dataTypeUniqueId,
      dataTypeColor,
      dataTypeShape,
      handles: {
        loopStartIn: extractHandleInfo(startIn),
        loopStartOut: extractHandleInfo(startHandles.outputs[i]),
        loopStopIn: extractHandleInfo(stopHandles.inputs[i]),
        loopStopOut: extractHandleInfo(stopHandles.outputs[i]),
        loopEndIn: extractHandleInfo(endHandles.inputs[i]),
        loopEndOut: extractHandleInfo(endHandles.outputs[i]),
      },
    });
  }

  return levels;
}

function getCommonName(level: LoopHandleLevel): string | null {
  const names = new Set([
    level.handles.loopStartIn.name,
    level.handles.loopStartOut.name,
    level.handles.loopStopIn.name,
    level.handles.loopStopOut.name,
    level.handles.loopEndIn.name,
    level.handles.loopEndOut.name,
  ]);
  return names.size === 1 ? [...names][0] : null;
}

export { extractLevelsFromLoopNodes, getCommonName };
export type { LoopHandleLevel, HandleInfo };
