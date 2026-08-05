'use client'

import { LoaderCircle } from 'lucide-react'

import { cn } from '@/lib/utils'

type GraphLoadingIndicatorProps = Readonly<{
  className?: string
  message?: string
  srMessage?: string
  hint?: string
}>

export function GraphLoadingIndicator({
  className,
  message = '正在加载图谱...',
  srMessage = '正在加载图谱',
  hint,
}: GraphLoadingIndicatorProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex flex-col items-center justify-center gap-3 text-center',
        className
      )}
    >
      <div
        className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary"
        aria-hidden="true"
      >
        <LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" />
      </div>

      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{message}</p>
        {hint ? (
          <p className="text-xs leading-5 text-muted-foreground">{hint}</p>
        ) : null}
      </div>

      <span className="sr-only">{srMessage}</span>
    </div>
  )
}
