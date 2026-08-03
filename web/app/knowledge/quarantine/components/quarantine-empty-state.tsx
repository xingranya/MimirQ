'use client'

import { RefreshCw, RotateCcw, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function QuarantineEmptyState({
  hasActiveFilters,
  autoRefresh,
  isFetching,
  onResetFilters,
  onRefresh,
}: Readonly<{
  hasActiveFilters: boolean
  autoRefresh: boolean
  isFetching: boolean
  onResetFilters: () => void
  onRefresh: () => void
}>) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center px-6 py-8 text-center">
      <Search className="mb-3 size-7 text-muted-foreground" aria-hidden="true" />
      <h3 className="text-base font-semibold text-foreground">
        {hasActiveFilters ? '没有符合筛选条件的记录' : '当前没有待审核记录'}
      </h3>
      <p className="mt-1 max-w-lg text-sm leading-5 text-muted-foreground">
        {hasActiveFilters
          ? '调整筛选条件，或同步最新数据后重试。'
          : autoRefresh
            ? '新记录进入隔离区后会自动显示在这里。'
            : '可以手动同步，检查是否有新的隔离记录。'}
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {hasActiveFilters ? (
          <Button type="button" variant="outline" className="h-9 gap-2 rounded-md" onClick={onResetFilters}>
            <RotateCcw className="size-4" aria-hidden="true" />
            清除筛选
          </Button>
        ) : null}
        <Button type="button" className="h-9 gap-2 rounded-md" onClick={onRefresh}>
          <RefreshCw className={cn('size-4', isFetching && 'animate-spin motion-reduce:animate-none')} aria-hidden="true" />
          同步数据
        </Button>
      </div>
    </div>
  )
}
