import { X, Package } from 'lucide-react';
import { cn } from '@/utils';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/atoms/Accordion';
import type {
  ExecutionStepRecord,
  RecordedInputHandleValue,
  RecordedInputConnection,
  RecordedOutputHandleValue,
  LoopRecord,
} from '@/utils/nodeRunner/types';
import { formatGraphError } from '@/utils/nodeRunner/errors';
import { Tooltip } from '@/components/atoms/Tooltip';

// ─────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────

type ExecutionStepInspectorProps = {
  /** The step record to inspect (null to hide) */
  stepRecord: ExecutionStepRecord | null;
  /** Close the inspector */
  onClose: () => void;
  /** Loop records for enriched loop context display */
  loopRecords?: ReadonlyMap<string, LoopRecord>;
  /** Replace complex values with type summaries */
  hideComplexValues?: boolean;
  /** Show node IDs and handle IDs alongside display names */
  debugMode?: boolean;
  /** Whether edge values animate along the path or display statically */
  edgeValuesAnimated?: boolean;
  /** Called when the edge animation toggle changes */
  onEdgeValuesAnimatedChange?: (animated: boolean) => void;
};

// ─────────────────────────────────────────────────────
// Value formatting
// ─────────────────────────────────────────────────────

function typeSummary(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string') return 'string';
  if (value instanceof Map) return `Map(${value.size})`;
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (typeof value === 'function') return 'function';
  return `Object(${Object.keys(value as Record<string, unknown>).length})`;
}

function isComplex(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  const t = typeof value;
  return t === 'object' || t === 'function';
}

function formatValue(value: unknown, hideComplex: boolean): string {
  if (hideComplex && isComplex(value)) return typeSummary(value);
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return `"${value}"`;
  if (value instanceof Map) {
    const entries = Array.from(value.entries())
      .map(([k, v]) => `${String(k)}: ${formatValue(v, hideComplex)}`)
      .join(', ');
    return `Map { ${entries} }`;
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => formatValue(v, hideComplex)).join(', ')}]`;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

// ─────────────────────────────────────────────────────
// StatusBadge — pill-shaped
// ─────────────────────────────────────────────────────

const statusBadgeConfig: Record<
  ExecutionStepRecord['status'],
  { bg: string; text: string; label: string }
> = {
  completed: {
    bg: 'bg-runner-bar-completed',
    text: 'text-[#e0f0e0]',
    label: 'Completed',
  },
  errored: {
    bg: 'bg-runner-bar-errored',
    text: 'text-[#f0e0e0]',
    label: 'Error',
  },
  skipped: {
    bg: 'bg-[#888888]/30',
    text: 'text-[#888888]',
    label: 'Skipped',
  },
};

function StatusBadge({ status }: { status: ExecutionStepRecord['status'] }) {
  const c = statusBadgeConfig[status];
  return (
    <span
      className={cn(
        'rounded-full px-3 py-1 text-[13px] font-medium',
        c.bg,
        c.text,
      )}
    >
      {c.label}
    </span>
  );
}

// ─────────────────────────────────────────────────────
// ConnectionLine
// ─────────────────────────────────────────────────────

function ConnectionLine({
  conn,
  hideComplex,
  debugMode,
}: {
  conn: RecordedInputConnection;
  hideComplex: boolean;
  debugMode: boolean;
}) {
  return (
    <div className='flex flex-col gap-1.5'>
      <div className='text-[13px]'>
        <span className='text-[#9a9a9a]'>Coming From–</span>{' '}
        <span className='text-primary-white/80'>
          {conn.sourceNodeName} / {conn.sourceHandleName}
        </span>
      </div>
      {debugMode && (
        <div className='text-[9px] text-secondary-dark-gray'>
          nodeId: {conn.sourceNodeId} &middot; handleId: {conn.sourceHandleId}
        </div>
      )}
      <div className='rounded-md border border-runner-value-border bg-runner-value-bg px-3 py-2 font-mono text-[14px] text-primary-white'>
        {formatValue(conn.value, hideComplex)}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// InputHandleDisplay
// ─────────────────────────────────────────────────────

function InputHandleDisplay({
  handleName,
  handleValue,
  hideComplex,
  debugMode,
}: {
  handleName: string;
  handleValue: RecordedInputHandleValue;
  hideComplex: boolean;
  debugMode: boolean;
}) {
  return (
    <div className='flex flex-col gap-1.5'>
      <div className='text-[14px] text-primary-white'>
        {handleName}{' '}
        <span className='text-secondary-light-gray'>
          ({handleValue.dataTypeId})
        </span>
      </div>

      {handleValue.connections.length > 0 ? (
        handleValue.connections.map((conn, i) => (
          <ConnectionLine
            key={`${conn.sourceNodeId}-${conn.sourceHandleId}-${i}`}
            conn={conn}
            hideComplex={hideComplex}
            debugMode={debugMode}
          />
        ))
      ) : handleValue.isDefault ? (
        <div className='rounded-md border border-runner-value-border bg-runner-value-bg px-3 py-2 font-mono text-[14px] text-primary-white'>
          {formatValue(handleValue.defaultValue, hideComplex)}
        </div>
      ) : (
        <span className='text-[13px] italic text-secondary-light-gray'>
          No value
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────
// OutputHandleDisplay
// ─────────────────────────────────────────────────────

function OutputHandleDisplay({
  handleName,
  handleValue,
  hideComplex,
}: {
  handleName: string;
  handleValue: RecordedOutputHandleValue;
  hideComplex: boolean;
}) {
  return (
    <div className='flex flex-col gap-1.5'>
      <div className='text-[14px] text-primary-white'>
        {handleName}{' '}
        <span className='text-secondary-light-gray'>
          ({handleValue.dataTypeId})
        </span>
      </div>
      <div className='rounded-md border border-runner-value-border bg-runner-value-bg px-3 py-2 font-mono text-[14px] text-primary-white'>
        {formatValue(handleValue.value, hideComplex)}
      </div>
    </div>
  );
}

// (SectionHeader removed — using AccordionTrigger directly)

// ─────────────────────────────────────────────────────
// ExecutionStepInspector
// ─────────────────────────────────────────────────────

function ExecutionStepInspector({
  stepRecord,
  onClose,
  loopRecords,
  hideComplexValues = false,
  debugMode = false,
  edgeValuesAnimated,
  onEdgeValuesAnimatedChange,
}: ExecutionStepInspectorProps) {
  if (!stepRecord) return null;

  const inputEntries = Array.from(stepRecord.inputValues.entries());
  const outputEntries = Array.from(stepRecord.outputValues.entries());

  return (
    <div className='flex w-[340px] animate-slide-in-right flex-col bg-runner-panel-bg'>
      {/* Header */}
      <div className='flex items-center justify-between border-b border-secondary-dark-gray px-4 py-3'>
        <div className='flex items-center gap-2.5'>
          <Package className='h-5 w-5 text-primary-white' />
          <span className='text-[15px] tracking-wide text-primary-white'>
            {stepRecord.nodeTypeName}
          </span>
        </div>
        <div className='flex items-center gap-3'>
          {onEdgeValuesAnimatedChange && (
            <Tooltip content='Animate edge value badges along the connection path instead of showing them statically'>
              <label className='flex cursor-pointer items-center gap-1.5 text-[12px] text-secondary-light-gray select-none'>
                <input
                  type='checkbox'
                  checked={edgeValuesAnimated ?? true}
                  onChange={(e) => onEdgeValuesAnimatedChange(e.target.checked)}
                  className='h-3 w-3 accent-primary-blue'
                />
                <span className='text-primary-white'>Animate</span>
              </label>
            </Tooltip>
          )}
          <button
            type='button'
            onClick={onClose}
            className='btn-press rounded p-1 text-secondary-light-gray transition-colors hover:text-primary-white'
            aria-label='Close'
          >
            <X className='h-3.5 w-3.5' />
          </button>
        </div>
      </div>

      {/* Execution info */}
      <div className='flex flex-col gap-3 border-b border-secondary-dark-gray px-4 py-3.5'>
        {/* Status row */}
        <div className='flex items-center justify-between rounded-md border border-runner-value-border px-3 py-2'>
          <StatusBadge status={stepRecord.status} />
          <span className='font-mono text-[13px] text-secondary-light-gray'>
            {stepRecord.estimatedTiming
              ? '< 0.1ms'
              : `${stepRecord.duration.toFixed(2)}ms`}
          </span>
        </div>

        {/* Timeline box */}
        <div className='rounded-md border border-runner-value-border bg-runner-timeline-box-bg px-3 py-2.5'>
          <div className='text-center text-[13px] text-secondary-light-gray'>
            {stepRecord.startTime.toFixed(2)}ms{' '}
            <span className='text-secondary-dark-gray'>&rarr;</span>{' '}
            {stepRecord.endTime.toFixed(2)}ms
          </div>
          <div className='relative mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#333]'>
            <div
              className='absolute h-full rounded-full bg-secondary-light-gray/50'
              style={{
                left: '20%',
                width: '55%',
              }}
            />
            <div
              className='absolute h-full w-0.5 bg-secondary-light-gray'
              style={{ left: '77%' }}
            />
          </div>
        </div>

        {/* Loop/Group context */}
        {(stepRecord.loopIteration !== undefined || stepRecord.groupNodeId) && (
          <div className='flex flex-col gap-2'>
            {stepRecord.loopIteration !== undefined &&
              (() => {
                const loopRecord =
                  stepRecord.loopStructureId && loopRecords
                    ? loopRecords.get(stepRecord.loopStructureId)
                    : undefined;
                const iterationRecord =
                  loopRecord?.iterations[stepRecord.loopIteration];
                return (
                  <div className='rounded-md border border-runner-value-border px-3 py-2'>
                    <div className='text-[12px] text-primary-white'>
                      Loop iteration {stepRecord.loopIteration + 1}
                      {loopRecord ? ` of ${loopRecord.totalIterations}` : ''}
                    </div>
                    {iterationRecord && (
                      <div className='mt-1 text-[10px] text-secondary-light-gray'>
                        Condition:{' '}
                        {iterationRecord.conditionValue
                          ? 'true (continues)'
                          : 'false (exits)'}
                      </div>
                    )}
                  </div>
                );
              })()}
            {stepRecord.groupNodeId && (
              <div className='text-[11px] text-secondary-light-gray'>
                Group: {stepRecord.groupNodeId}
                {stepRecord.groupDepth !== undefined &&
                  ` (depth ${stepRecord.groupDepth})`}
              </div>
            )}
          </div>
        )}

        {debugMode && (
          <div className='text-[9px] text-secondary-dark-gray'>
            nodeId: {stepRecord.nodeId} &middot; typeId: {stepRecord.nodeTypeId}
          </div>
        )}
      </div>

      {/* Scrollable content */}
      <Accordion
        type='multiple'
        defaultValue={['inputs', 'outputs']}
        className='w-full'
      >
        {/* Inputs section */}
        <AccordionItem
          value='inputs'
          className='border-b border-secondary-dark-gray'
        >
          <AccordionTrigger className='gap-1.5 border-b border-secondary-dark-gray bg-runner-section-header-bg px-4 py-2.5 text-[14px] text-primary-white hover:no-underline [&>svg]:text-secondary-light-gray'>
            Inputs
          </AccordionTrigger>
          <AccordionContent className='p-4'>
            <div className='flex flex-col gap-4 bg-runner-panel-bg'>
              {inputEntries.length > 0 ? (
                inputEntries.map(([name, value], idx) => (
                  <div key={name}>
                    {idx > 0 && (
                      <div className='-mx-4 mb-4 h-px bg-secondary-dark-gray' />
                    )}
                    <InputHandleDisplay
                      handleName={name}
                      handleValue={value}
                      hideComplex={hideComplexValues}
                      debugMode={debugMode}
                    />
                  </div>
                ))
              ) : (
                <div className='text-[13px] italic text-secondary-light-gray'>
                  No inputs
                </div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Outputs section */}
        <AccordionItem
          value='outputs'
          className='border-b border-secondary-dark-gray'
        >
          <AccordionTrigger className='gap-1.5 border-b border-secondary-dark-gray bg-runner-section-header-bg px-4 py-2.5 text-[14px] text-primary-white hover:no-underline [&>svg]:text-secondary-light-gray'>
            Outputs
          </AccordionTrigger>
          <AccordionContent className='p-4'>
            <div className='flex flex-col gap-4 bg-runner-panel-bg'>
              {outputEntries.length > 0 ? (
                outputEntries.map(([name, value], idx) => (
                  <div key={name}>
                    {idx > 0 && (
                      <div className='-mx-4 mb-4 h-px bg-secondary-dark-gray' />
                    )}
                    <OutputHandleDisplay
                      handleName={name}
                      handleValue={value}
                      hideComplex={hideComplexValues}
                    />
                  </div>
                ))
              ) : (
                <div className='text-[13px] italic text-secondary-light-gray'>
                  No outputs
                </div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Error section */}
      {stepRecord.error && (
        <div className='p-4'>
          <div className='rounded-md border border-status-errored/30 bg-status-errored/10 p-2.5'>
            <div className='mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-status-errored'>
              Error
            </div>
            <div className='whitespace-pre-wrap font-mono text-[11px] text-status-errored'>
              {formatGraphError(stepRecord.error)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { ExecutionStepInspector };

export type { ExecutionStepInspectorProps };
