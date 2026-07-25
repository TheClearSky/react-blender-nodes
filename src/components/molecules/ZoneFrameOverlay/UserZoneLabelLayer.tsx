import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '@xyflow/react';
import { BoxSelectIcon, Trash2Icon } from 'lucide-react';
import { cn } from '@/utils/cnHelper';
import { normalizeZoneColor } from '@/utils/nodeStateManagement/zones/zoneColor';
import { USER_ZONE_PALETTE } from '@/utils/nodeStateManagement/zones/zoneLifecycle';
import {
  EditableText,
  type EditableTextHandle,
} from '@/components/atoms/EditableText';
import {
  PopoverColorPicker,
  parseColor,
  formatColor,
} from '@/components/molecules/ColorPicker';
import type { ZoneFrame } from './useZoneFrames';

/**
 * DISPLAY-ONLY lightness floor for the caption text. The rest-state caption is
 * drawn in the zone's own color on the dark canvas; a near-black zone color
 * would make the caption invisible in BOTH states — and you cannot hover what
 * you cannot find (rename/recolor have no context-menu fallback). The STORED
 * color, the swatch, and the frame polygon keep the true color.
 */
function toReadableCaptionColor(color: string): string {
  const parsed = parseColor(color);
  if (!parsed) return color;
  if (parsed.l >= 0.6) return color;
  return formatColor({ ...parsed, l: 0.6 }, 'hex');
}

type UserZoneLabelLayerProps = {
  /** Precomputed frames (system ∪ user) from FullGraph's shared memo. */
  frames: ZoneFrame[];
  /** IDs of the USER zones (the only ones this layer renders labels for). */
  userZoneIds: Set<string>;
  onRename: (zoneId: string, name: string) => void;
  onRecolor: (zoneId: string, color: string) => void;
  onDelete: (zoneId: string) => void;
  onSelectMembers: (zoneId: string) => void;
};

/**
 * Interactive HTML labels for USER zones — rename (double-click), recolor (swatch
 * → ColorPicker, committed once on close), delete. Rendered via `createPortal`
 * into ReactFlow's `.react-flow__viewport-portal` so each label inherits the live
 * viewport transform for FREE (spike-verified). Because the portal is inside the
 * SCALED viewport, an inner `scale(1/zoom)` keeps the label a constant visual size.
 * Only the label elements are interactive (`pointerEvents:'auto'`); the frame
 * polygons stay in the non-interactive `ZoneFrameOverlay` SVG.
 */
function UserZoneLabelLayer({
  frames,
  userZoneIds,
  onRename,
  onRecolor,
  onDelete,
  onSelectMembers,
}: UserZoneLabelLayerProps) {
  const zoom = useStore((s) => s.transform[2]);
  const allFrames = frames;

  // ReactFlow renders a `.react-flow__viewport-portal` inside THIS instance's
  // wrapper (`s.domNode`). Scope the lookup to that wrapper (not `document`) so a
  // second <FullGraph> on the page can't render its labels into the first graph's
  // portal; the store subscription re-evaluates each tick, so it picks up the
  // portal the moment it exists (mirrors ReactFlow's own ViewportPortal).
  const portalEl = useStore(
    (s) =>
      (s.domNode?.querySelector(
        '.react-flow__viewport-portal',
      ) as HTMLElement | null) ?? null,
  );

  if (!portalEl) return null;

  const userFrames = allFrames.filter((frame) => userZoneIds.has(frame.id));
  if (userFrames.length === 0) return null;

  // Collision stagger: labels sharing a near-identical anchor (e.g. two zones
  // wrapping the same nodes) get a screen-constant vertical offset so each stays
  // independently editable (PC-4). NEGATIVE = labels pile UPWARD, because each
  // label is bottom-anchored above the hull (translateY(-100%)). Seed the stack
  // with SYSTEM-frame anchors at index 1 so a user zone wrapping a loop/switch's
  // exact node set starts one step above the system SVG label instead of on it.
  const anchorKeyOf = (frame: ZoneFrame) =>
    `${Math.round(frame.labelX)}:${Math.round(frame.labelY)}`;
  const anchorStack = new Map<string, number>();
  for (const frame of allFrames) {
    if (!userZoneIds.has(frame.id)) anchorStack.set(anchorKeyOf(frame), 1);
  }
  const positioned = userFrames.map((frame) => {
    const key = anchorKeyOf(frame);
    const stackIndex = anchorStack.get(key) ?? 0;
    anchorStack.set(key, stackIndex + 1);
    return { frame, offsetY: -(stackIndex * 22) / Math.max(zoom, 0.05) };
  });

  return createPortal(
    <>
      {positioned.map(({ frame, offsetY }) => (
        <UserZoneLabel
          key={frame.id}
          frame={frame}
          offsetY={offsetY}
          zoom={zoom}
          onRename={onRename}
          onRecolor={onRecolor}
          onDelete={onDelete}
          onSelectMembers={onSelectMembers}
        />
      ))}
    </>,
    portalEl,
  );
}

type UserZoneLabelProps = {
  frame: ZoneFrame;
  offsetY: number;
  zoom: number;
  onRename: (zoneId: string, name: string) => void;
  onRecolor: (zoneId: string, color: string) => void;
  onDelete: (zoneId: string) => void;
  onSelectMembers: (zoneId: string) => void;
};

function UserZoneLabel({
  frame,
  offsetY,
  zoom,
  onRename,
  onRecolor,
  onDelete,
  onSelectMembers,
}: UserZoneLabelProps) {
  // Local color during the picker session; committed once on close so a recolor
  // is ONE history entry (not one per drag tick).
  const [localColor, setLocalColor] = useState(frame.color);

  // At rest the label is a lightweight caption in the zone's color (optically a
  // system-label sibling); the swatch + trash controls appear only while
  // hovered — OR while the picker/editor is open (`hold-open`: mouseleave fires
  // when the pointer moves into the portaled picker panel, and collapsing then
  // would UNMOUNT the open picker, orphaning its panel AND silently dropping
  // the pending recolor since onOpenChange(false) never fires on unmount).
  const [hovered, setHovered] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  // Resync local color from the authored value ONLY while the picker is closed:
  // an external recolor mid-session (undo/redo, a second path) must not clobber
  // the user's in-progress pick. The on-close commit still fires. (Declared after
  // `pickerOpen` so the dep array can reference it.)
  useEffect(() => {
    if (!pickerOpen) setLocalColor(frame.color);
  }, [frame.color, pickerOpen]);
  const editableTextRef = useRef<EditableTextHandle>(null);
  const expanded = hovered || pickerOpen || editing;

  const captionColor = useMemo(
    () => toReadableCaptionColor(frame.color),
    [frame.color],
  );

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        transform: `translate(${frame.labelX}px, ${frame.labelY + offsetY}px)`,
        transformOrigin: '0 0',
        pointerEvents: 'none',
        // Above ReactFlow's selected-node elevation (z 1000) so the label never
        // vanishes behind its own auto-selected members at creation.
        zIndex: 1001,
      }}
    >
      <div
        data-slot='user-zone-label'
        // h-[22px] on THIS element is load-bearing: the %-translate below
        // resolves against this element's own border-box, and the label is
        // bottom-anchored — any height change across rest/hover/editing would
        // visibly jump the caption's top edge.
        className={cn(
          'nodrag nopan flex h-[22px] w-max items-center gap-1 rounded px-1.5',
          expanded && 'bg-primary-black/80',
        )}
        style={{
          // ORDER LOAD-BEARING (CSS composes right-to-left): translateY(-100%)
          // resolves against the pill's own layout height FIRST, then the scale
          // maps it — so the pill's BOTTOM lands exactly on the anchor at any
          // zoom, i.e. the label sits ABOVE the hull like the system SVG labels
          // (which draw up from their baseline) instead of hanging down over
          // the top-left member node's header.
          transform: `scale(${1 / Math.max(zoom, 0.05)}) translateY(-100%)`,
          transformOrigin: '0 0',
          pointerEvents: 'auto',
          // The caption inherits the zone's color (with the display-only
          // lightness floor); the editing Input and the trash button carry
          // their own explicit colors and are unaffected.
          color: captionColor,
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onDoubleClick={(event) => {
          // Whole-label rename target; a double-click on the swatch/trash
          // buttons must not open the editor.
          if (
            !(event.target instanceof Element) ||
            event.target.closest('button')
          )
            return;
          event.stopPropagation();
          editableTextRef.current?.beginEditing();
        }}
      >
        <EditableText
          ref={editableTextRef}
          value={frame.name}
          onCommit={(name) => {
            if (name && name !== frame.name) onRename(frame.id, name);
          }}
          onEditingChange={setEditing}
          placeholder='Zone'
          className='inline-block max-w-[180px] truncate text-[12px] font-semibold leading-none'
          inputClassName='text-[12px] leading-none'
        />
        {/* Caption color = the zone's own color (display-only lightness floor);
            controls are TRAILING so their appearance never shifts the name. */}
        {expanded && (
          <>
            <button
              type='button'
              aria-label='Select zone members'
              title='Select zone members'
              className='nodrag nopan flex shrink-0 items-center text-primary-white/80 transition-colors hover:text-primary-white'
              onClick={(event) => {
                event.stopPropagation();
                onSelectMembers(frame.id);
              }}
            >
              <BoxSelectIcon className='h-3.5 w-3.5' />
            </button>
            <span
              className='nodrag nopan inline-flex items-center'
              onClick={(event) => event.stopPropagation()}
            >
              <PopoverColorPicker
                value={localColor}
                onChange={setLocalColor}
                onOpenChange={(open) => {
                  setPickerOpen(open);
                  if (!open) {
                    // Canonicalize before compare+commit so a non-hex picker
                    // format isn't dropped by the validator and a no-change close
                    // (incl. a case-only diff) dispatches nothing.
                    const next = normalizeZoneColor(localColor);
                    if (next && next !== frame.color) onRecolor(frame.id, next);
                  }
                }}
                size='small'
                showSwatches
                swatchPresets={USER_ZONE_PALETTE}
                placement='top-start'
                triggerClassName='h-3.5 w-3.5 rounded-sm'
              />
            </span>
            <button
              type='button'
              aria-label='Delete zone'
              title='Delete zone'
              className='nodrag nopan flex shrink-0 items-center text-primary-white/80 transition-colors hover:text-status-errored'
              onClick={(event) => {
                event.stopPropagation();
                onDelete(frame.id);
              }}
            >
              <Trash2Icon className='h-3.5 w-3.5' />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export { UserZoneLabelLayer };
export type { UserZoneLabelLayerProps };
