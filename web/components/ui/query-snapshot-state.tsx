import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

import { QueryErrorState } from '@/components/ui/query-error-state'
import { cn } from '@/lib/utils'

export type QuerySnapshotStateProps = {
  areaName: string
  errorMessage: string | null
  hasSnapshot: boolean
  loading: boolean
  onRetry: () => void
  children: ReactNode
  className?: string
  contentClassName?: string
}

/** 区分首次加载、首次失败和保留旧快照后的刷新失败。 */
export function QuerySnapshotState({
  areaName,
  errorMessage,
  hasSnapshot,
  loading,
  onRetry,
  children,
  className,
  contentClassName,
}: Readonly<QuerySnapshotStateProps>) {
  if (errorMessage && !hasSnapshot) {
    return (
      <div className={cn('h-full min-h-0 p-3', className)}>
        <QueryErrorState
          title={`${areaName}加载失败`}
          description={errorMessage}
          onRetry={onRetry}
          retrying={loading}
          className="min-h-[220px]"
        />
      </div>
    )
  }

  if (!hasSnapshot) {
    return (
      <div
        role="status"
        aria-live="polite"
        className={cn(
          'flex h-full min-h-[320px] items-center justify-center gap-3 p-6 text-sm font-medium text-muted-foreground',
          className
        )}
      >
        <Loader2
          className="size-5 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
        正在加载{areaName}…
      </div>
    )
  }

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      {errorMessage ? (
        <QueryErrorState
          title={`${areaName}刷新失败`}
          description={`${errorMessage} 当前仍显示上次加载的数据。`}
          onRetry={onRetry}
          retrying={loading}
          className="mx-3 mb-3 shrink-0"
        />
      ) : null}
      <div className={cn('h-full min-h-0 flex-1', contentClassName)}>{children}</div>
    </div>
  )
}
