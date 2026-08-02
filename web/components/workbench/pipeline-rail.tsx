import { cn } from '@/lib/utils'

import { IngestionWorkflowStepper } from '@/components/ui/ingestion-workflow-stepper'

export function PipelineRail({
  className,
  compact = false,
}: Readonly<{
  className?: string
  compact?: boolean
}>) {
  return (
    <div
      data-testid="pipeline-rail"
      className={cn(
        'flex w-full max-w-full overflow-hidden rounded-md border border-border bg-background p-1',
        className
      )}
    >
      {/* 入库流程: Parse -> Governance -> Chunk -> Chat */}
      <IngestionWorkflowStepper
        compact={compact}
        className={compact ? 'min-w-max' : 'w-full min-w-0'}
      />
    </div>
  )
}
