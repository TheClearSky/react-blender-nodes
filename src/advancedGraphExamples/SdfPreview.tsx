import { useEffect, useRef } from 'react';
import type { NodePreviewProps } from '@/components/organisms/FullGraph';
import {
  MEASURE_RESOLUTION,
  PREVIEW_WORLD_RECT,
  isMaskValue,
  isSdfValue,
  renderMaskToPixels,
  renderSdfToPixels,
  type Mask2d,
  type Sdf2d,
  type SdfRenderStyle,
} from './sdfLib';

// Canvas2D on purpose — browsers cap live WebGL contexts (~8-16/page), and a
// graph shows 10-20 previews at once; a 220px CPU field render costs ~2-10ms
// for SHALLOW fields (composition multiplies: each node's closure walks its
// whole upstream chain, and Repeat/RadialRepeat sample the child 4×/2× per
// pixel) and happens only when the upstream value changes. DPR deliberately
// capped at 1: SDF gradients upscale invisibly.
//
// FIELD_PREVIEW_SIZE === MEASURE_RESOLUTION by construction — the measurement
// nodes' "pixels" unit is honest exactly because both sample the same grid.
const FIELD_PREVIEW_SIZE = MEASURE_RESOLUTION;
const RENDER_PREVIEW_SIZE = 260;

/** `getContext('2d')` can return null under context/memory pressure — warn
 *  once instead of failing silently (the canvas then stays blank). */
let warnedAboutNullContext = false;
function warnNullContextOnce(): void {
  if (warnedAboutNullContext) return;
  warnedAboutNullContext = true;
  console.warn(
    '[sdf-preview] getContext("2d") returned null — previews cannot paint',
  );
}

function paintSdf(
  canvas: HTMLCanvasElement,
  fieldFn: Sdf2d,
  sizePx: number,
  style: SdfRenderStyle,
): void {
  const context = canvas.getContext('2d');
  if (!context) {
    warnNullContextOnce();
    return;
  }
  const pixels = renderSdfToPixels(fieldFn, PREVIEW_WORLD_RECT, sizePx, style);
  // Dimension derived FROM THE BUFFER: the renderer clamps its size
  // internally, so constructing ImageData with the raw argument could
  // mismatch the buffer length and throw.
  const size = Math.sqrt(pixels.length / 4);
  context.putImageData(new ImageData(pixels, size, size), 0, 0);
}

function paintMask(canvas: HTMLCanvasElement, maskFn: Mask2d): void {
  const context = canvas.getContext('2d');
  if (!context) {
    warnNullContextOnce();
    return;
  }
  const pixels = renderMaskToPixels(
    maskFn,
    PREVIEW_WORLD_RECT,
    FIELD_PREVIEW_SIZE,
  );
  const size = Math.sqrt(pixels.length / 4);
  context.putImageData(new ImageData(pixels, size, size), 0, 0);
}

/** Shared empty-state card. Distinguishes "no run yet / value stripped by
 *  import" from "the scrub head sits BEFORE this node's first execution"
 *  (previews strictly track the timeline position — `atStep`-only). */
function emptyStateMessage({
  reachedAtStep,
  everRan,
}: {
  reachedAtStep: boolean;
  everRan: boolean;
}): string {
  // The node HAS a step at the current timeline position but its value isn't a
  // live closure — an imported/reloaded recording strips them. Re-running
  // rebuilds the closures; scrubbing never will.
  if (reachedAtStep) return 'Re-run to render';
  // A record exists and this node ran somewhere, but not by the current head.
  if (everRan) return 'Not reached at this step';
  // No usable record at all.
  return 'Run to render';
}

function SdfPreviewEmptyState({
  reachedAtStep,
  everRan,
}: {
  reachedAtStep: boolean;
  everRan: boolean;
}) {
  return (
    <div
      data-slot='sdf-preview-empty'
      className='p-3 text-center font-main text-[18px] text-secondary-light-gray'
    >
      {emptyStateMessage({ reachedAtStep, everRan })}
    </div>
  );
}

/**
 * Field preview for every sdf-emitting node type: the canonical IQ debug
 * visualization (orange outside / blue inside, isoline bands, white zero
 * contour) of the node's OUTPUT field at the CURRENT timeline position
 * (`atStep` only — scrubbing before the node's first execution shows the
 * empty state instead of a stale final value; `live` is read solely to word
 * that empty state). Null-guards non-functions — an exported/imported
 * recording strips closures, so previews then show the empty state until the
 * graph is re-run.
 */
function SdfFieldPreview({ live, atStep }: NodePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const snapshot = atStep;
  // By handle NAME, per the nodePreview contract — every sdf node names its
  // output 'Out'; a positional read would preview the wrong handle on any
  // future multi-output node type.
  const outputValue = snapshot?.outputValues.get('Out')?.value;
  const fieldFn = isSdfValue(outputValue) ? outputValue.fn : undefined;

  useEffect(() => {
    if (!canvasRef.current || !fieldFn) return;
    paintSdf(canvasRef.current, fieldFn, FIELD_PREVIEW_SIZE, {
      mode: 'debug',
    });
    // `fieldFn` identity changes exactly when a new step record arrives
    // (values are stored by reference per run) — one paint per value change.
  }, [fieldFn]);

  if (!fieldFn) {
    return (
      <SdfPreviewEmptyState
        reachedAtStep={atStep !== null}
        everRan={live !== null}
      />
    );
  }
  return (
    <canvas
      ref={canvasRef}
      data-slot='sdf-field-preview'
      data-testid='sdf-field-canvas'
      width={FIELD_PREVIEW_SIZE}
      height={FIELD_PREVIEW_SIZE}
      className='block w-full'
    />
  );
}

/**
 * Mask preview (Less Than / Greater Than nodes): the node's OUTPUT mask as a
 * strictly binary black/white image — the thresholded field.
 */
function SdfMaskPreview({ live, atStep }: NodePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const snapshot = atStep;
  const outputValue = snapshot?.outputValues.get('Out')?.value;
  const maskFn = isMaskValue(outputValue) ? outputValue.fn : undefined;

  useEffect(() => {
    if (!canvasRef.current || !maskFn) return;
    paintMask(canvasRef.current, maskFn);
  }, [maskFn]);

  if (!maskFn) {
    return (
      <SdfPreviewEmptyState
        reachedAtStep={atStep !== null}
        everRan={live !== null}
      />
    );
  }
  return (
    <canvas
      ref={canvasRef}
      data-slot='sdf-mask-preview'
      data-testid='sdf-mask-canvas'
      width={FIELD_PREVIEW_SIZE}
      height={FIELD_PREVIEW_SIZE}
      className='block w-full'
    />
  );
}

/** Display formatting for measurement outputs: counts are integers, ratios
 *  render as percentages. */
function formatMeasureValue(outputName: string, value: number): string {
  if (outputName.endsWith('Ratio')) return `${(value * 100).toFixed(1)}%`;
  return String(Math.round(value));
}

/**
 * Measurement preview (Measure Mask / Measure Brightness nodes): the recorded
 * OUTPUT numbers rendered as a readable card — pixel counts and ratios over
 * the fixed 220² sampling grid (`MEASURE_RESOLUTION`, shared with the field/
 * mask previews so "pixels" is an honest unit). The same numbers flow out of
 * the node's `number` outputs, so they can drive any parameter downstream.
 */
function SdfMeasurePreview({ live, atStep }: NodePreviewProps) {
  const snapshot = atStep;
  const measuredOutputs: Array<[string, number]> = snapshot
    ? Array.from(snapshot.outputValues.entries()).flatMap(
        ([outputName, entry]) =>
          typeof entry?.value === 'number'
            ? [[outputName, entry.value] as [string, number]]
            : [],
      )
    : [];

  if (measuredOutputs.length === 0) {
    return (
      <SdfPreviewEmptyState
        reachedAtStep={atStep !== null}
        everRan={live !== null}
      />
    );
  }
  return (
    <div
      data-slot='sdf-measure-preview'
      data-testid='sdf-measure-preview'
      className='flex flex-col gap-1 p-3 font-main'
    >
      {measuredOutputs.map(([outputName, measuredValue]) => (
        <div
          key={outputName}
          className='flex items-baseline justify-between gap-3'
        >
          <span className='text-[13px] text-secondary-light-gray'>
            {outputName}
          </span>
          <span className='text-[17px] font-semibold text-primary-white'>
            {formatMeasureValue(outputName, measuredValue)}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * The Render node's preview: an anti-aliased FILL of the incoming field,
 * colored by an IQ cosine palette of the distance, with optional outer glow.
 * Render has no outputs — it reads its `In` INPUT's first connection (input
 * values also survive by reference) plus its own Palette/Glow params.
 */
function SdfRenderPreview({ live, atStep }: NodePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const snapshot = atStep;
  const inputValue = snapshot?.inputValues.get('In')?.connections[0]?.value;
  const fieldFn = isSdfValue(inputValue) ? inputValue.fn : undefined;
  const paletteRaw =
    snapshot?.inputValues.get('Palette')?.connections[0]?.value;
  const glowRaw = snapshot?.inputValues.get('Glow')?.connections[0]?.value;
  // Unconnected allowInput params surface as the recorded `defaultValue`.
  const paletteInline = snapshot?.inputValues.get('Palette')?.defaultValue;
  const glowInline = snapshot?.inputValues.get('Glow')?.defaultValue;
  const palette =
    typeof paletteRaw === 'number'
      ? paletteRaw
      : typeof paletteInline === 'number'
        ? paletteInline
        : 0;
  const glow =
    typeof glowRaw === 'number'
      ? glowRaw
      : typeof glowInline === 'number'
        ? glowInline
        : 1;

  useEffect(() => {
    if (!canvasRef.current || !fieldFn) return;
    paintSdf(canvasRef.current, fieldFn, RENDER_PREVIEW_SIZE, {
      mode: 'filled',
      palette,
      glow,
    });
  }, [fieldFn, palette, glow]);

  if (!fieldFn) {
    return (
      <SdfPreviewEmptyState
        reachedAtStep={atStep !== null}
        everRan={live !== null}
      />
    );
  }
  return (
    <canvas
      ref={canvasRef}
      data-slot='sdf-render-preview'
      data-testid='sdf-render-canvas'
      width={RENDER_PREVIEW_SIZE}
      height={RENDER_PREVIEW_SIZE}
      className='block w-full'
    />
  );
}

export { SdfFieldPreview, SdfMaskPreview, SdfMeasurePreview, SdfRenderPreview };
