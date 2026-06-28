import { cn } from '@/utils';
import type { ExecutionStepRecord } from '@/utils/nodeRunner/types';
import { NodeIdentityLabel } from '@/components/atoms/NodeIdentityLabel';
import { statusTooltipClass, statusLabel, formatDuration } from './types';

function BlockTooltipContent({ step }: { step: ExecutionStepRecord }) {
  return (
    <>
      <div className='flex items-center gap-2'>
        <NodeIdentityLabel
          typeName={step.nodeTypeName}
          customName={step.customName}
          className='min-w-0 text-[12px] font-semibold text-primary-white'
        />
        <span
          className={cn(
            'text-[10px] font-medium',
            statusTooltipClass[step.status],
          )}
        >
          {statusLabel[step.status]}
        </span>
      </div>
      <div className='mt-1 flex items-center gap-2 text-[10px] text-secondary-light-gray'>
        <span className='font-mono tabular-nums'>{formatDuration(step)}</span>
        <span className='text-secondary-dark-gray'>&middot;</span>
        <span>Step {step.stepIndex}</span>
        {step.loopIteration !== undefined && (
          <>
            <span className='text-secondary-dark-gray'>&middot;</span>
            <span>Iter {step.loopIteration}</span>
          </>
        )}
        {step.switchPhase === 'trueBranch' && (
          <>
            <span className='text-secondary-dark-gray'>&middot;</span>
            <span className='text-status-completed'>True Branch</span>
          </>
        )}
        {step.switchPhase === 'falseBranch' && (
          <>
            <span className='text-secondary-dark-gray'>&middot;</span>
            <span className='text-secondary-light-gray'>False Branch</span>
          </>
        )}
      </div>
    </>
  );
}

export { BlockTooltipContent };
