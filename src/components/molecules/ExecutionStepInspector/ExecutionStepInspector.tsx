import { X, Package } from 'lucide-react';
import { resolveStructureRecord } from '@/utils/nodeRunner/executionRecorder';
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
import { NodeIdentityLabel } from '@/components/atoms/NodeIdentityLabel';
import { useGraphTheme } from '@/utils/theme/GraphThemeContext';

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
  if (typeof value === 'object' && value !== null) {
    return `Object(${Object.keys(value).length})`;
  }
  return `Object(?)`;
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
    text: 'text-inspector-badge-completed-text',
    label: 'Completed',
  },
  errored: {
    bg: 'bg-runner-bar-errored',
    text: 'text-inspector-badge-errored-text',
    label: 'Error',
  },
  skipped: {
    bg: 'bg-inspector-skipped/30',
    text: 'text-inspector-skipped',
    label: 'Skipped',
  },
};

function StatusBadge({ status }: { status: ExecutionStepRecord['status'] }) {
  const c = statusBadgeConfig[status];
  const theme = useGraphTheme();
  return (
    <span
      className={cn(
        'rbn:rounded-full rbn:px-3 rbn:py-1 rbn:text-[13px] rbn:font-medium',
        c.bg,
        c.text,
        theme?.inspector?.statusBadge,
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
  const theme = useGraphTheme();
  return (
    <div className='rbn:flex rbn:flex-col rbn:gap-1.5'>
      <div className='rbn:flex rbn:min-w-0 rbn:items-baseline rbn:gap-1 rbn:text-[13px] rbn:text-primary-white/80'>
        <span className='rbn:shrink-0 rbn:text-runner-muted-text'>
          Coming From–
        </span>
        <NodeIdentityLabel
          typeName={conn.sourceNodeName}
          customName={conn.sourceNodeCustomName}
          className='rbn:min-w-0'
        />
        <span className='rbn:min-w-0 rbn:shrink-[9999] rbn:truncate'>
          / {conn.sourceHandleName}
        </span>
      </div>
      {debugMode && (
        <div className='rbn:text-[9px] rbn:text-secondary-dark-gray'>
          nodeId: {conn.sourceNodeId} &middot; handleId: {conn.sourceHandleId}
        </div>
      )}
      <div
        className={cn(
          'rbn:rounded-md rbn:border rbn:border-runner-value-border rbn:bg-runner-value-bg rbn:px-3 rbn:py-2 rbn:font-mono rbn:text-[14px] rbn:text-primary-white',
          theme?.inspector?.valueBox,
        )}
      >
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
  const theme = useGraphTheme();
  return (
    <div className='rbn:flex rbn:flex-col rbn:gap-1.5'>
      <div className='rbn:truncate rbn:text-[14px] rbn:text-primary-white'>
        {handleName}{' '}
        <span className='rbn:text-secondary-light-gray'>
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
        <div
          className={cn(
            'rbn:rounded-md rbn:border rbn:border-runner-value-border rbn:bg-runner-value-bg rbn:px-3 rbn:py-2 rbn:font-mono rbn:text-[14px] rbn:text-primary-white',
            theme?.inspector?.valueBox,
          )}
        >
          {formatValue(handleValue.defaultValue, hideComplex)}
        </div>
      ) : (
        <span className='rbn:text-[13px] rbn:italic rbn:text-secondary-light-gray'>
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
  const theme = useGraphTheme();
  return (
    <div className='rbn:flex rbn:flex-col rbn:gap-1.5'>
      <div className='rbn:truncate rbn:text-[14px] rbn:text-primary-white'>
        {handleName}{' '}
        <span className='rbn:text-secondary-light-gray'>
          ({handleValue.dataTypeId})
        </span>
      </div>
      <div
        className={cn(
          'rbn:rounded-md rbn:border rbn:border-runner-value-border rbn:bg-runner-value-bg rbn:px-3 rbn:py-2 rbn:font-mono rbn:text-[14px] rbn:text-primary-white',
          theme?.inspector?.valueBox,
        )}
      >
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
  const theme = useGraphTheme();
  if (!stepRecord) return null;

  const inputEntries = Array.from(stepRecord.inputValues.entries());
  const outputEntries = Array.from(stepRecord.outputValues.entries());

  return (
    <div
      className={cn(
        'rbn:flex rbn:w-full rbn:@min-[832px]/runnerpanel:w-[340px] rbn:animate-slide-in-right rbn:flex-col rbn:bg-runner-panel-bg',
        theme?.inspector?.container,
      )}
    >
      {/* Header */}
      <div
        className={cn(
          'rbn:flex rbn:items-center rbn:justify-between rbn:border-b rbn:border-secondary-dark-gray rbn:px-4 rbn:py-3',
          theme?.inspector?.header,
        )}
      >
        <div className='rbn:flex rbn:min-w-0 rbn:items-center rbn:gap-2.5'>
          <Package className='rbn:h-5 rbn:w-5 rbn:shrink-0 rbn:text-primary-white' />
          <NodeIdentityLabel
            typeName={stepRecord.nodeTypeName}
            customName={stepRecord.customName}
            className='rbn:min-w-0 rbn:text-[15px] rbn:tracking-wide rbn:text-primary-white'
          />
        </div>
        <div className='rbn:flex rbn:shrink-0 rbn:items-center rbn:gap-3'>
          {onEdgeValuesAnimatedChange && (
            <Tooltip content='Animate edge value badges along the connection path instead of showing them statically'>
              <label className='rbn:flex rbn:cursor-pointer rbn:items-center rbn:gap-1.5 rbn:text-[12px] rbn:text-secondary-light-gray rbn:select-none'>
                <input
                  type='checkbox'
                  checked={edgeValuesAnimated ?? true}
                  onChange={(e) => onEdgeValuesAnimatedChange(e.target.checked)}
                  className='rbn:h-3 rbn:w-3 rbn:accent-primary-blue'
                />
                <span className='rbn:text-primary-white'>Animate</span>
              </label>
            </Tooltip>
          )}
          <button
            type='button'
            onClick={onClose}
            className='btn-press rbn:rounded rbn:p-1 rbn:text-secondary-light-gray rbn:transition-colors rbn:hover:text-primary-white'
            aria-label='Close'
          >
            <X className='rbn:h-3.5 rbn:w-3.5' />
          </button>
        </div>
      </div>

      {/* Execution info */}
      <div className='rbn:flex rbn:flex-col rbn:gap-3 rbn:border-b rbn:border-secondary-dark-gray rbn:px-4 rbn:py-3.5'>
        {/* Status row */}
        <div className='rbn:flex rbn:items-center rbn:justify-between rbn:rounded-md rbn:border rbn:border-runner-value-border rbn:px-3 rbn:py-2'>
          <StatusBadge status={stepRecord.status} />
          <span className='rbn:font-mono rbn:text-[13px] rbn:text-secondary-light-gray'>
            {stepRecord.estimatedTiming
              ? '< 0.1ms'
              : `${stepRecord.duration.toFixed(2)}ms`}
          </span>
        </div>

        {/* Timeline box */}
        <div
          className={cn(
            'rbn:rounded-md rbn:border rbn:border-runner-value-border rbn:bg-runner-timeline-box-bg rbn:px-3 rbn:py-2.5',
            theme?.inspector?.timelineBox,
          )}
        >
          <div className='rbn:text-center rbn:text-[13px] rbn:text-secondary-light-gray'>
            {stepRecord.startTime.toFixed(2)}ms{' '}
            <span className='rbn:text-secondary-dark-gray'>&rarr;</span>{' '}
            {stepRecord.endTime.toFixed(2)}ms
          </div>
          <div className='rbn:relative rbn:mt-2 rbn:h-1.5 rbn:w-full rbn:overflow-hidden rbn:rounded-full rbn:bg-inspector-progress-track'>
            <div
              className='rbn:absolute rbn:h-full rbn:rounded-full rbn:bg-secondary-light-gray/50'
              style={{
                left: '20%',
                width: '55%',
              }}
            />
            <div
              className='rbn:absolute rbn:h-full rbn:w-0.5 rbn:bg-secondary-light-gray'
              style={{ left: '77%' }}
            />
          </div>
        </div>

        {/* Loop/Group context */}
        {(stepRecord.loopIteration !== undefined || stepRecord.groupNodeId) && (
          <div className='rbn:flex rbn:flex-col rbn:gap-2'>
            {stepRecord.loopIteration !== undefined &&
              (() => {
                // Resolve by IDENTITY (owning instance path + structure
                // id): two instances of one group template share the
                // template's loop id, so a bare lookup would show a
                // namesake instance's iteration totals.
                const loopRecord =
                  stepRecord.loopStructureId && loopRecords
                    ? resolveStructureRecord(
                        loopRecords,
                        stepRecord.loopStructureId,
                        stepRecord.instancePath,
                      )?.record
                    : undefined;
                const iterationRecord =
                  loopRecord?.iterations[stepRecord.loopIteration];
                return (
                  <div
                    className={cn(
                      'rbn:rounded-md rbn:border rbn:border-runner-value-border rbn:px-3 rbn:py-2',
                      theme?.inspector?.contextBox,
                    )}
                  >
                    <div className='rbn:text-[12px] rbn:text-primary-white'>
                      Loop iteration {stepRecord.loopIteration + 1}
                      {loopRecord ? ` of ${loopRecord.totalIterations}` : ''}
                    </div>
                    {iterationRecord && (
                      <div className='rbn:mt-1 rbn:text-[10px] rbn:text-secondary-light-gray'>
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
              <div className='rbn:text-[11px] rbn:text-secondary-light-gray'>
                Group: {stepRecord.groupNodeId}
                {stepRecord.groupDepth !== undefined &&
                  ` (depth ${stepRecord.groupDepth})`}
              </div>
            )}
          </div>
        )}

        {debugMode && (
          <div className='rbn:text-[9px] rbn:text-secondary-dark-gray'>
            nodeId: {stepRecord.nodeId} &middot; typeId: {stepRecord.nodeTypeId}
          </div>
        )}
      </div>

      {/* Scrollable content */}
      <Accordion
        type='multiple'
        defaultValue={['inputs', 'outputs']}
        className='rbn:w-full'
      >
        {/* Inputs section */}
        <AccordionItem
          value='inputs'
          className='rbn:border-b rbn:border-secondary-dark-gray'
        >
          <AccordionTrigger
            className={cn(
              'rbn:gap-1.5 rbn:border-b rbn:border-secondary-dark-gray rbn:bg-runner-section-header-bg rbn:px-4 rbn:py-2.5 rbn:text-[14px] rbn:text-primary-white rbn:hover:no-underline rbn:[&>svg]:text-secondary-light-gray',
              theme?.inspector?.sectionHeader,
            )}
          >
            Inputs
          </AccordionTrigger>
          <AccordionContent className='rbn:p-4'>
            <div className='rbn:flex rbn:flex-col rbn:gap-4 rbn:bg-runner-panel-bg'>
              {inputEntries.length > 0 ? (
                inputEntries.map(([name, value], idx) => (
                  <div key={name}>
                    {idx > 0 && (
                      <div className='rbn:-mx-4 rbn:mb-4 rbn:h-px rbn:bg-secondary-dark-gray' />
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
                <div className='rbn:text-[13px] rbn:italic rbn:text-secondary-light-gray'>
                  No inputs
                </div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Outputs section */}
        <AccordionItem
          value='outputs'
          className='rbn:border-b rbn:border-secondary-dark-gray'
        >
          <AccordionTrigger
            className={cn(
              'rbn:gap-1.5 rbn:border-b rbn:border-secondary-dark-gray rbn:bg-runner-section-header-bg rbn:px-4 rbn:py-2.5 rbn:text-[14px] rbn:text-primary-white rbn:hover:no-underline rbn:[&>svg]:text-secondary-light-gray',
              theme?.inspector?.sectionHeader,
            )}
          >
            Outputs
          </AccordionTrigger>
          <AccordionContent className='rbn:p-4'>
            <div className='rbn:flex rbn:flex-col rbn:gap-4 rbn:bg-runner-panel-bg'>
              {outputEntries.length > 0 ? (
                outputEntries.map(([name, value], idx) => (
                  <div key={name}>
                    {idx > 0 && (
                      <div className='rbn:-mx-4 rbn:mb-4 rbn:h-px rbn:bg-secondary-dark-gray' />
                    )}
                    <OutputHandleDisplay
                      handleName={name}
                      handleValue={value}
                      hideComplex={hideComplexValues}
                    />
                  </div>
                ))
              ) : (
                <div className='rbn:text-[13px] rbn:italic rbn:text-secondary-light-gray'>
                  No outputs
                </div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Error section */}
      {stepRecord.error && (
        <div className='rbn:p-4'>
          <div
            className={cn(
              'rbn:rounded-md rbn:border rbn:border-status-errored/30 rbn:bg-status-errored/10 rbn:p-2.5',
              theme?.inspector?.errorBox,
            )}
          >
            <div className='rbn:mb-1.5 rbn:text-[10px] rbn:font-semibold rbn:uppercase rbn:tracking-wider rbn:text-status-errored'>
              Error
            </div>
            <div className='rbn:whitespace-pre-wrap rbn:font-mono rbn:text-[11px] rbn:text-status-errored'>
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
