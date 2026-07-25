import type { HandleShape } from '@/components/atoms/HandleShapeSwatch/handleShapes';

type HandleInfo = { id: string; name: string };

type SwitchHandleLevel = {
  id: string;
  dataTypeUniqueId: string;
  dataTypeColor: string;
  dataTypeShape?: HandleShape;
  handles: {
    switchStartIn: HandleInfo;
    switchStartTrueOut: HandleInfo;
    switchStartFalseOut: HandleInfo;
    switchEndTrueIn: HandleInfo;
    switchEndFalseIn: HandleInfo;
    switchEndOut: HandleInfo;
  };
};

type NodeData = {
  inputs?: ReadonlyArray<Record<string, unknown>>;
  outputs?: ReadonlyArray<Record<string, unknown>>;
};

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

function getDataHandles(
  nodeData: NodeData,
  type: 'input' | 'output',
  isCondition: (h: Record<string, unknown>) => boolean,
): Record<string, unknown>[] {
  const handles =
    type === 'input'
      ? Array.isArray(nodeData.inputs)
        ? [...nodeData.inputs]
        : []
      : Array.isArray(nodeData.outputs)
        ? [...nodeData.outputs]
        : [];

  return handles.filter((h) => {
    const dt = (
      h as {
        dataType?: {
          dataTypeObject?: { underlyingType?: string };
          dataTypeUniqueId?: string;
        };
      }
    ).dataType;
    if (!dt) return false;
    if (dt.dataTypeObject?.underlyingType === 'noEquivalent') return false;
    if (isCondition(h)) return false;
    return true;
  });
}

function isConditionHandle(h: Record<string, unknown>): boolean {
  const dt = (h as { dataType?: { dataTypeUniqueId?: string } }).dataType;
  return dt?.dataTypeUniqueId === 'condition';
}

function extractLevelsFromSwitchNodes(
  switchStartData: NodeData,
  switchEndData: NodeData,
): SwitchHandleLevel[] {
  // SwitchStart inputs: [data1, data2..., condition, template]
  // SwitchStart outputs: [bind, trueData1, trueData2..., falseData1, falseData2..., template]
  // SwitchEnd inputs: [bind, trueData1, trueData2..., falseData1, falseData2..., template]
  // SwitchEnd outputs: [data1, data2..., template]

  const startDataInputs = getDataHandles(
    switchStartData,
    'input',
    isConditionHandle,
  );
  // Remove last one (template)
  const startInputs = startDataInputs.slice(0, -1);

  const startOutputs = Array.isArray(switchStartData.outputs)
    ? [...switchStartData.outputs]
    : [];
  // Remove bind (first) and template (last)
  const startDataOutputs = startOutputs.slice(1, -1);
  const trueOutputCount = Math.ceil(startDataOutputs.length / 2);
  const startTrueOutputs = startDataOutputs.slice(0, trueOutputCount);
  const startFalseOutputs = startDataOutputs.slice(trueOutputCount);

  const endInputs = Array.isArray(switchEndData.inputs)
    ? [...switchEndData.inputs]
    : [];
  const endDataInputs = endInputs.slice(1, -1);
  const trueInputCount = Math.ceil(endDataInputs.length / 2);
  const endTrueInputs = endDataInputs.slice(0, trueInputCount);
  const endFalseInputs = endDataInputs.slice(trueInputCount);

  const endDataOutputs = getDataHandles(switchEndData, 'output', () => false);
  const endOutputs = endDataOutputs.slice(0, -1);

  const levelCount = Math.min(
    startInputs.length,
    startTrueOutputs.length,
    startFalseOutputs.length,
    endTrueInputs.length,
    endFalseInputs.length,
    endOutputs.length,
  );

  const levels: SwitchHandleLevel[] = [];
  for (let i = 0; i < levelCount; i++) {
    const startIn = startInputs[i];
    const { dataTypeUniqueId, dataTypeColor, dataTypeShape } =
      extractDataTypeInfo(startIn);

    levels.push({
      id: extractHandleInfo(startIn).id,
      dataTypeUniqueId,
      dataTypeColor,
      dataTypeShape,
      handles: {
        switchStartIn: extractHandleInfo(startIn),
        switchStartTrueOut: extractHandleInfo(startTrueOutputs[i]),
        switchStartFalseOut: extractHandleInfo(startFalseOutputs[i]),
        switchEndTrueIn: extractHandleInfo(endTrueInputs[i]),
        switchEndFalseIn: extractHandleInfo(endFalseInputs[i]),
        switchEndOut: extractHandleInfo(endOutputs[i]),
      },
    });
  }

  return levels;
}

function stripZonePrefix(name: string): string {
  if (name.startsWith('True: ')) return name.slice(6);
  if (name.startsWith('False: ')) return name.slice(7);
  return name;
}

function getCommonName(level: SwitchHandleLevel): string | null {
  const names = new Set([
    stripZonePrefix(level.handles.switchStartIn.name),
    stripZonePrefix(level.handles.switchStartTrueOut.name),
    stripZonePrefix(level.handles.switchStartFalseOut.name),
    stripZonePrefix(level.handles.switchEndTrueIn.name),
    stripZonePrefix(level.handles.switchEndFalseIn.name),
    stripZonePrefix(level.handles.switchEndOut.name),
  ]);
  return names.size === 1 ? [...names][0] : null;
}

export { extractLevelsFromSwitchNodes, getCommonName, stripZonePrefix };
export type { SwitchHandleLevel, HandleInfo };
