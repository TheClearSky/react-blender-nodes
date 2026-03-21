import { X } from 'lucide-react';
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
} from '@/utils/nodeRunner/types';
import { formatGraphError } from '@/utils/nodeRunner/errors';

// ─────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────

type ExecutionStepInspectorProps = {
  /** The step record to inspect (null to hide) */
  stepRecord: ExecutionStepRecord | null;
  /** Close the inspector */
  onClose: () => void;
  /** Replace complex values with type summaries */
  hideComplexValues?: boolean;
  /** Show node IDs and handle IDs alongside display names */
  debugMode?: boolean;
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
// NodeIcon — decorative abstract icon
// ─────────────────────────────────────────────────────

function NodeIcon() {
  return (
    <div className='relative h-4 w-4'>
      <div className='absolute left-0 top-0.5 h-1.5 w-1.5 bg-[#c46868]' />
      <div className='absolute bottom-0 right-0 box-border h-[7px] w-[7px] rounded-full border-2 border-[#5b79a8]' />
      <div className='absolute left-2 top-1.5 flex flex-col gap-0.5'>
        <div className='h-0.5 w-0.5 rounded-full bg-secondary-light-gray' />
        <div className='h-0.5 w-0.5 rounded-full bg-secondary-light-gray' />
      </div>
    </div>
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
  hideComplexValues = false,
  debugMode = false,
}: ExecutionStepInspectorProps) {
  if (!stepRecord) return null;

  const inputEntries = Array.from(stepRecord.inputValues.entries());
  const outputEntries = Array.from(stepRecord.outputValues.entries());

  return (
    <div className='flex w-[340px] animate-slide-in-right flex-col bg-runner-panel-bg'>
      {/* Header */}
      <div className='flex items-center justify-between border-b border-secondary-dark-gray px-4 py-3'>
        <div className='flex items-center gap-2.5'>
          <NodeIcon />
          <span className='text-[15px] tracking-wide text-primary-white'>
            {stepRecord.nodeTypeName}
          </span>
        </div>
        <button
          type='button'
          onClick={onClose}
          className='btn-press rounded p-1 text-secondary-light-gray transition-colors hover:text-primary-white'
          aria-label='Close'
        >
          <X className='h-3.5 w-3.5' />
        </button>
      </div>

      {/* Execution info */}
      <div className='flex flex-col gap-3 border-b border-secondary-dark-gray px-4 py-3.5'>
        {/* Status row */}
        <div className='flex items-center justify-between rounded-md border border-runner-value-border px-3 py-2'>
          <StatusBadge status={stepRecord.status} />
          <span className='font-mono text-[13px] text-secondary-light-gray'>
            {stepRecord.duration.toFixed(2)}ms
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
          <div className='text-[11px] text-secondary-light-gray'>
            {stepRecord.loopIteration !== undefined && (
              <div>Loop iteration: {stepRecord.loopIteration}</div>
            )}
            {stepRecord.groupNodeId && (
              <div>
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
      <div className='node-runner-scrollbar max-h-[400px] overflow-y-auto'>
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
            <AccordionContent className='p-4 pb-0'>
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
            <AccordionContent className='p-4 pb-0'>
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
    </div>
  );
}

export { ExecutionStepInspector };

export type { ExecutionStepInspectorProps };
