// Handle-classifier helpers — pure, React-free functions that classify a node's
// handles by their (possibly inferred) data type. Extracted out of
// `executionHelpers.ts` so they can be re-exported through the React-free
// `@theclearsky/react-blender-nodes/contract` subpath without dragging the
// editor's node-construction core (which value-imports `@xyflow/react`) into the
// codegen boundary. Their only dependency is `standardDataTypeNamesMap`, itself
// React-free. `executionHelpers.ts` re-exports the two public ones for back-compat.

import { standardDataTypeNamesMap } from '../../nodeStateManagement/standardNodes';

/** Data type IDs that are structural (not user data) on structural nodes. */
const STRUCTURAL_HANDLE_TYPES: ReadonlySet<string> = new Set([
  standardDataTypeNamesMap.bindLoopNodes,
  standardDataTypeNamesMap.loopInfer,
  standardDataTypeNamesMap.bindSwitchNodes,
  standardDataTypeNamesMap.switchInfer,
  standardDataTypeNamesMap.condition,
]);

/** Get the resolved dataTypeUniqueId from a handle, considering inferred types. */
function resolveHandleDataTypeId(handle: {
  dataType?: { dataTypeUniqueId?: string };
  inferredDataType?: { dataTypeUniqueId?: string } | null;
}): string | undefined {
  return (
    handle.inferredDataType?.dataTypeUniqueId ??
    handle.dataType?.dataTypeUniqueId
  );
}

/** Extract handle IDs for user data handles (not bindLoopNodes, loopInfer, or condition). */
function getDataHandleIds(
  handles: ReadonlyArray<{
    id?: string;
    dataType?: { dataTypeUniqueId?: string };
    inferredDataType?: { dataTypeUniqueId?: string } | null;
  }>,
): string[] {
  return handles
    .filter((h) => {
      const dtId = resolveHandleDataTypeId(h);
      return h.id && dtId && !STRUCTURAL_HANDLE_TYPES.has(dtId);
    })
    .map((h) => h.id!);
}

/** Find the condition input handle on Loop Stop (the one with dataType 'condition'). */
function findConditionInputId(
  handles: ReadonlyArray<{
    id?: string;
    dataType?: { dataTypeUniqueId?: string };
    inferredDataType?: { dataTypeUniqueId?: string } | null;
  }>,
): string | undefined {
  return handles.find(
    (h) => resolveHandleDataTypeId(h) === standardDataTypeNamesMap.condition,
  )?.id;
}

// `STRUCTURAL_HANDLE_TYPES` and `resolveHandleDataTypeId` stay module-private (as
// they were in `executionHelpers`); only the two public classifiers are exported.
export { getDataHandleIds, findConditionInputId };
