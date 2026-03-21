import type {
  InputHandleValue,
  InputConnectionValue,
  OutputHandleInfo,
  InputResolutionEntry,
  OutputDistributionEntry,
} from './types';

/**
 * Minimal structural types for reading node handle data without
 * importing the full generic ConfigurableNode types (avoids variance issues).
 */
type MinimalInput = {
  id?: string;
  name?: string;
  allowInput?: boolean;
  value?: unknown;
  dataType?: { dataTypeUniqueId?: string };
  inferredDataType?: { dataTypeUniqueId?: string } | null;
};

type MinimalInputPanel = {
  id?: string;
  name?: string;
  inputs: ReadonlyArray<MinimalInput>;
};

type MinimalOutput = {
  id?: string;
  name?: string;
  dataType?: { dataTypeUniqueId?: string };
  inferredDataType?: { dataTypeUniqueId?: string } | null;
};

type MinimalNodeData = {
  inputs?: ReadonlyArray<MinimalInput | MinimalInputPanel>;
  outputs?: ReadonlyArray<MinimalOutput>;
  nodeTypeUniqueId?: string;
};

/**
 * Builds the qualified handle ID used as a key in the ValueStore.
 * Format: "nodeId:handleId"
 */
function qualifiedId(nodeId: string, handleId: string): string {
  return `${nodeId}:${handleId}`;
}

/**
 * Flattens inputs (which may contain panels) into a flat array of
 * individual input handles, preserving index order.
 */
function flattenInputs(
  inputs: ReadonlyArray<MinimalInput | MinimalInputPanel> | undefined,
): MinimalInput[] {
  const result: MinimalInput[] = [];
  if (!inputs) return result;
  for (const item of inputs) {
    if ('inputs' in item) {
      for (const inner of item.inputs) {
        result.push(inner);
      }
    } else {
      result.push(item);
    }
  }
  return result;
}

/**
 * Store and retrieve computed values during graph execution using
 * qualified handle IDs ("nodeId:handleId").
 *
 * Supports scoped stores for group execution — a scoped store
 * prefixes all IDs with "groupNodeId>" to prevent collisions
 * between inner and outer node IDs.
 */
class ValueStore {
  private readonly store: Map<string, unknown>;
  private readonly prefix: string;
  private readonly parent: ValueStore | null;

  constructor(prefix: string = '', parent: ValueStore | null = null) {
    this.store = new Map();
    this.prefix = prefix;
    this.parent = parent;
  }

  /**
   * Store a value for an output handle.
   */
  set(nodeId: string, handleId: string, value: unknown): void {
    this.store.set(this.prefix + qualifiedId(nodeId, handleId), value);
  }

  /**
   * Get a value from a specific output handle.
   * Falls back to parent scope if not found locally.
   */
  get(nodeId: string, handleId: string): unknown | undefined {
    const key = this.prefix + qualifiedId(nodeId, handleId);
    if (this.store.has(key)) {
      return this.store.get(key);
    }
    if (this.parent) {
      return this.parent.get(nodeId, handleId);
    }
    return undefined;
  }

  /**
   * Check if a value exists for the given handle.
   */
  has(nodeId: string, handleId: string): boolean {
    const key = this.prefix + qualifiedId(nodeId, handleId);
    if (this.store.has(key)) {
      return true;
    }
    if (this.parent) {
      return this.parent.has(nodeId, handleId);
    }
    return false;
  }

  /**
   * Resolve all input values for a node based on the inputResolutionMap.
   *
   * Returns a Map keyed by handle **name** (as required by the
   * FunctionImplementation contract).
   *
   * Fan-in: multiple edges into one handle → connections array has N entries.
   * No edges + allowInput → isDefault=true, defaultValue from the UI.
   */
  resolveInputs(
    nodeId: string,
    nodeData: MinimalNodeData,
    inputResolutionMap: ReadonlyMap<
      string,
      ReadonlyArray<InputResolutionEntry>
    >,
    nodesById: ReadonlyMap<
      string,
      { data: MinimalNodeData; typeOfNode?: { name?: string } }
    >,
  ): Map<string, InputHandleValue> {
    const result = new Map<string, InputHandleValue>();
    const flatInputs = flattenInputs(nodeData.inputs);

    for (const input of flatInputs) {
      if (!input.id || !input.name) continue;

      const handleId = input.id;
      const handleName = input.name;
      const dataTypeId =
        input.inferredDataType?.dataTypeUniqueId ??
        input.dataType?.dataTypeUniqueId ??
        '';

      const key = qualifiedId(nodeId, handleId);
      const entries = inputResolutionMap.get(key);

      if (entries && entries.length > 0) {
        // Build connections from edges
        const connections: InputConnectionValue[] = [];

        for (const entry of entries) {
          const sourceInfo = nodesById.get(entry.sourceNodeId);
          const sourceOutputs = sourceInfo?.data.outputs ?? [];
          const sourceHandle = sourceOutputs.find(
            (o) => o.id === entry.sourceHandleId,
          );

          connections.push({
            value: this.get(entry.sourceNodeId, entry.sourceHandleId),
            sourceNodeId: entry.sourceNodeId,
            sourceNodeName: sourceInfo?.typeOfNode?.name ?? '',
            sourceNodeTypeId: sourceInfo?.data.nodeTypeUniqueId ?? '',
            sourceHandleId: entry.sourceHandleId,
            sourceHandleName: sourceHandle?.name ?? '',
            sourceDataTypeId:
              sourceHandle?.inferredDataType?.dataTypeUniqueId ??
              sourceHandle?.dataType?.dataTypeUniqueId ??
              '',
            edgeId: entry.edgeId,
          });
        }

        result.set(handleName, {
          connections,
          handleId,
          handleName,
          dataTypeId,
          isDefault: false,
        });
      } else if (input.allowInput && input.value !== undefined) {
        // No connection but user entered a value in the UI
        result.set(handleName, {
          connections: [],
          handleId,
          handleName,
          dataTypeId,
          isDefault: true,
          defaultValue: input.value,
        });
      } else {
        // No value available at all
        result.set(handleName, {
          connections: [],
          handleId,
          handleName,
          dataTypeId,
          isDefault: true,
          defaultValue: undefined,
        });
      }
    }

    return result;
  }

  /**
   * Build output handle info for a node.
   *
   * Returns a Map keyed by handle **name** (as required by the
   * FunctionImplementation contract).
   */
  buildOutputInfo(
    nodeId: string,
    nodeData: MinimalNodeData,
    outputDistributionMap: ReadonlyMap<
      string,
      ReadonlyArray<OutputDistributionEntry>
    >,
  ): Map<string, OutputHandleInfo> {
    const result = new Map<string, OutputHandleInfo>();
    const outputs = nodeData.outputs;
    if (!outputs) return result;

    for (const output of outputs) {
      if (!output.id || !output.name) continue;

      const handleId = output.id;
      const handleName = output.name;
      const dataTypeId =
        output.inferredDataType?.dataTypeUniqueId ??
        output.dataType?.dataTypeUniqueId ??
        '';

      const key = qualifiedId(nodeId, handleId);
      const entries = outputDistributionMap.get(key) ?? [];

      result.set(handleName, {
        handleId,
        handleName,
        dataTypeId,
        connections: entries.map((e) => ({
          targetNodeId: e.targetNodeId,
          targetHandleId: e.targetHandleId,
          edgeId: e.edgeId,
        })),
      });
    }

    return result;
  }

  /**
   * Snapshot the entire store for recording in ExecutionRecord.
   */
  snapshot(): ReadonlyMap<string, unknown> {
    return new Map(this.store);
  }

  /**
   * Create a scoped store for group execution.
   * The scoped store prefixes all IDs with "groupNodeId>" and
   * falls back to the parent store for reads.
   */
  createScope(prefix: string): ValueStore {
    return new ValueStore(`${prefix}>`, this);
  }

  /**
   * Clear all values with the given prefix (for loop iteration reset).
   */
  clearScope(prefix: string): void {
    const scopePrefix = `${prefix}>`;
    for (const key of this.store.keys()) {
      if (key.startsWith(scopePrefix)) {
        this.store.delete(key);
      }
    }
  }
}

export { ValueStore, qualifiedId, flattenInputs };
export type { MinimalNodeData, MinimalInput, MinimalInputPanel, MinimalOutput };
