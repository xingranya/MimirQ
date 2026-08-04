import { AlertCircle, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type QueryErrorStateProps = {
  title: string
  description: string
  onRetry: () => void
  retrying?: boolean
  className?: string
}

/** 显示可恢复的数据加载错误，并提供就地重试入口。 */
export function QueryErrorState({
  title,
  description,
  onRetry,
  retrying = false,
  className,
}: Readonly<QueryErrorStateProps>) {
  return (
    <div
      role="alert"
      className={cn(
        'flex min-w-0 flex-col gap-3 rounded-md border border-destructive/25 bg-destructive/5 p-4 sm:flex-row sm:items-center',
        className
      )}
    >
      <AlertCircle className="size-4 shrink-0 text-destructive" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-1 break-words text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9 shrink-0 rounded-md"
        onClick={onRetry}
        disabled={retrying}
      >
        <RefreshCw
          className={cn(
            'size-4',
            retrying && 'animate-spin motion-reduce:animate-none'
          )}
          aria-hidden="true"
        />
        {retrying ? '重新加载中…' : '重新加载'}
      </Button>
    </div>
  )
}
