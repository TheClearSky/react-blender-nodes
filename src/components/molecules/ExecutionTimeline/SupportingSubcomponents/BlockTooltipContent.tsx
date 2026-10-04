import { cn } from '@/utils';
import type { ExecutionStepRecord } from '@/utils/nodeRunner/types';
import { NodeIdentityLabel } from '@/components/atoms/NodeIdentityLabel';
import { statusTooltipClass, statusLabel, formatDuration } from './types';

function BlockTooltipContent({ step }: { step: ExecutionStepRecord }) {
  return (
    <>
      <div className='rbn:flex rbn:items-center rbn:gap-2'>
        <NodeIdentityLabel
          typeName={step.nodeTypeName}
          customName={step.customName}
          className='rbn:min-w-0 rbn:text-[12px] rbn:font-semibold rbn:text-primary-white'
        />
        <span
          className={cn(
            'rbn:text-[10px] rbn:font-medium',
            statusTooltipClass[step.status],
          )}
        >
          {statusLabel[step.status]}
        </span>
      </div>
      <div className='rbn:mt-1 rbn:flex rbn:items-center rbn:gap-2 rbn:text-[10px] rbn:text-secondary-light-gray'>
        <span className='rbn:font-mono rbn:tabular-nums'>
          {formatDuration(step)}
        </span>
        <span className='rbn:text-secondary-dark-gray'>&middot;</span>
        <span>Step {step.stepIndex}</span>
        {step.loopIteration !== undefined && (
          <>
            <span className='rbn:text-secondary-dark-gray'>&middot;</span>
            <span>Iter {step.loopIteration}</span>
          </>
        )}
        {step.switchPhase === 'trueBranch' && (
          <>
            <span className='rbn:text-secondary-dark-gray'>&middot;</span>
            <span className='rbn:text-status-completed'>True Branch</span>
          </>
        )}
        {step.switchPhase === 'falseBranch' && (
          <>
            <span className='rbn:text-secondary-dark-gray'>&middot;</span>
            <span className='rbn:text-secondary-light-gray'>False Branch</span>
          </>
        )}
      </div>
    </>
  );
}

export { BlockTooltipContent };
