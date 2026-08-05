'use client'

import { useEffect, useId } from 'react'
import { RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useDatasets } from '@/hooks/use-datasets'
import { cn, detachPromise } from '@/lib/utils'

const ALL_DATASETS_VALUE = '__all_datasets__'

export function DatasetSelectField({
  value,
  onChange,
  label = '数据集',
  placeholder = '选择数据集',
  allLabel = '全部数据集',
  allowAll = false,
  autoSelectFirst = false,
  className,
}: Readonly<{
  value: string
  onChange: (value: string) => void
  label?: string
  placeholder?: string
  allLabel?: string
  allowAll?: boolean
  autoSelectFirst?: boolean
  className?: string
}>) {
  const selectId = useId()
  const { datasets, isLoading, error, refreshDatasets } = useDatasets()

  const selectedValue = value || (allowAll ? ALL_DATASETS_VALUE : '')
  const firstDatasetId = String(datasets[0]?.id || '').trim()

  useEffect(() => {
    if (!autoSelectFirst || allowAll || value || !firstDatasetId) return
    onChange(firstDatasetId)
  }, [allowAll, autoSelectFirst, firstDatasetId, onChange, value])

  return (
    <div className={cn('space-y-1', className)}>
      <Label htmlFor={selectId} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      <Select
        value={selectedValue}
        onValueChange={(next) => onChange(next === ALL_DATASETS_VALUE ? '' : next)}
        disabled={isLoading || Boolean(error) || (!allowAll && !datasets.length)}
      >
        <SelectTrigger id={selectId} className="h-8 text-xs">
          <SelectValue placeholder={isLoading ? '加载中...' : placeholder} />
        </SelectTrigger>
        <SelectContent>
          {allowAll ? <SelectItem value={ALL_DATASETS_VALUE}>{allLabel}</SelectItem> : null}
          {datasets.map((dataset) => {
            const id = String(dataset.id || '').trim()
            if (!id) return null
            return (
              <SelectItem key={id} value={id}>
                {dataset.name || id}
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>
      {error ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 pt-1 text-xs text-destructive"
        >
          <span>数据集加载失败。</span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => detachPromise(refreshDatasets())}
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            重新加载
          </Button>
        </div>
      ) : !isLoading && !datasets.length ? (
        <p className="pt-1 text-xs leading-5 text-muted-foreground">暂无可用数据集。</p>
      ) : null}
    </div>
  )
}
