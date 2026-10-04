import type { HandleShape } from '@/components/organisms/ConfigurableNode/SupportingSubcomponents/ContextAwareHandle';

/** The data-type fields a handle carries that decide how it is DRAWN. */
type HandleVisualSource = {
  handleShape?: HandleShape;
  handleColor?: string;
  dataType?: { dataTypeObject?: { shape?: HandleShape; color?: string } };
  inferredDataType?: {
    dataTypeObject?: { shape?: HandleShape; color?: string };
  } | null;
};

/**
 * The shape a socket is DRAWN with: its data type's current shape (the
 * inferred type for group/loop/switch pass-through handles), falling back to
 * the shape copied onto the handle when it was built. The copy is saved with
 * every node, so reading it alone froze existing graphs at whatever shape
 * their data type had when the node was created — a consumer changing a data
 * type's `shape` only reached nodes created afterwards.
 */
function liveHandleShape(handle: HandleVisualSource): HandleShape | undefined {
  return (
    handle.inferredDataType?.dataTypeObject?.shape ??
    handle.dataType?.dataTypeObject?.shape ??
    handle.handleShape
  );
}

/** The colour a socket (and its edges) is drawn with — live, like the shape. */
function liveHandleColor(handle: HandleVisualSource): string | undefined {
  return (
    handle.inferredDataType?.dataTypeObject?.color ??
    handle.dataType?.dataTypeObject?.color ??
    handle.handleColor
  );
}

export { liveHandleColor, liveHandleShape };
export type { HandleVisualSource };
