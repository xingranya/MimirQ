'use client'

import { useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { cn } from '@/lib/utils'

type IngestionView = 'operation' | 'execution-monitor'

type IngestionViewSwitchProps = {
  className?: string
  compact?: boolean
}

const VIEW_OPTIONS: Array<{ value: IngestionView; label: string }> = [
  { value: 'operation', label: '入库操作' },
  { value: 'execution-monitor', label: '执行监控' },
]

export function IngestionViewSwitch({ className, compact = false }: Readonly<IngestionViewSwitchProps>) {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const activeView: IngestionView =
    searchParams.get('mode') === 'execution-monitor' ? 'execution-monitor' : 'operation'

  const handleChangeView = useCallback(
    (nextView: IngestionView) => {
      const params = new URLSearchParams(searchParams.toString())
      if (nextView === 'execution-monitor') {
        params.set('mode', 'execution-monitor')
      } else {
        params.delete('mode')
      }
      const query = params.toString()
      router.replace(query ? `${pathname}?${query}` : pathname)
    },
    [pathname, router, searchParams]
  )

  return (
    <div
      className={cn(
        'inline-flex rounded-md border border-border bg-muted/40 p-0.5',
        compact && 'p-0.5',
        className
      )}
    >
      {VIEW_OPTIONS.map((option) => {
        const selected = activeView === option.value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => handleChangeView(option.value)}
            className={cn(
              'h-8 rounded-md px-3 text-sm font-medium transition-colors',
              compact && 'h-7 px-2 text-xs',
              selected
                ? 'bg-background text-primary'
                : 'text-muted-foreground hover:bg-background/70 hover:text-foreground'
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
