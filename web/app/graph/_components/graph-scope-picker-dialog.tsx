'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { Database, Loader2, Network, RefreshCw, Search } from 'lucide-react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { QueryErrorState } from '@/components/ui/query-error-state'
import { datasetApi } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { cn } from '@/lib/utils'

type GraphScopePickerDialogProps = Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
  currentDatasetId: string | null
  currentPipelineHash: string | null
  currentDocumentCount: number
  onTriggerManualKgUpload: () => void
}>

export function GraphScopePickerDialog({
  open,
  onOpenChange,
  currentDatasetId,
  currentPipelineHash,
  currentDocumentCount,
  onTriggerManualKgUpload,
}: GraphScopePickerDialogProps) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>(currentDatasetId ?? '')

  const datasetsQuery = useQuery({
    queryKey: queryKeys.datasets.exhaustive({ purpose: 'graph-scope-picker' }),
    queryFn: () => datasetApi.listAll(),
    enabled: open,
  })
  const datasets = useMemo(() => datasetsQuery.data ?? [], [datasetsQuery.data])
  const loading = datasetsQuery.isFetching
  const loadFailed = Boolean(datasetsQuery.error)
  const { refetch: refetchDatasets } = datasetsQuery

  useEffect(() => {
    if (!open) return
    setSelectedDatasetId(currentDatasetId ?? '')
  }, [currentDatasetId, open])

  const filteredDatasets = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const items = [...datasets].sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id))
    if (!needle) return items
    return items.filter((dataset) => {
      const name = String(dataset.name || '').toLowerCase()
      const id = String(dataset.id || '').toLowerCase()
      const description = String(dataset.description || '').toLowerCase()
      return name.includes(needle) || id.includes(needle) || description.includes(needle)
    })
  }, [datasets, query])

  const handleOpenSelectedScope = useCallback(() => {
    if (!selectedDatasetId) return
    const params = new URLSearchParams()
    params.set('dataset_id', selectedDatasetId)
    router.push(`/graph?${params.toString()}`)
    onOpenChange(false)
  }, [onOpenChange, router, selectedDatasetId])

  const handleResetScope = useCallback(() => {
    router.push('/graph')
    onOpenChange(false)
  }, [onOpenChange, router])

  let currentScopeSummary = '当前未指定图谱范围'
  if (currentDatasetId) {
    currentScopeSummary = `当前已选知识库：${currentDatasetId}`
  } else if (currentPipelineHash) {
    currentScopeSummary = '当前按指定解析批次查看'
  } else if (currentDocumentCount > 0) {
    currentScopeSummary = `当前按 ${currentDocumentCount} 篇文档范围查看`
  }

  let datasetListContent = filteredDatasets.map((dataset) => {
    const isSelected = selectedDatasetId === dataset.id
    return (
      <button
        key={dataset.id}
        type="button"
        aria-pressed={isSelected}
        className={cn(
          'w-full rounded-md border px-3 py-3 text-left transition-colors',
          isSelected
            ? 'border-primary/40 bg-primary/5'
            : 'border-border bg-background hover:bg-muted'
        )}
        onClick={() => setSelectedDatasetId(dataset.id)}
      >
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md',
              isSelected ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
            )}
          >
            <Database className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-foreground">
              {dataset.name || dataset.id}
            </div>
            <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
              {dataset.id}
            </div>
            {dataset.description ? (
              <div className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                {dataset.description}
              </div>
            ) : null}
          </div>
        </div>
      </button>
    )
  })
  if (loading && datasets.length === 0) {
    datasetListContent = [
      <div
        key="loading"
        className="flex min-h-40 items-center justify-center text-sm text-muted-foreground"
      >
        <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />
        正在读取知识库列表...
      </div>,
    ]
  } else if (loadFailed && datasets.length === 0) {
    datasetListContent = [
      <QueryErrorState
        key="error"
        title="无法加载知识库"
        description="知识库列表暂时不可用，请检查连接后重新加载。"
        onRetry={() => void refetchDatasets()}
        retrying={loading}
        className="min-h-40 rounded-md border-0"
      />,
    ]
  } else if (filteredDatasets.length === 0) {
    datasetListContent = [
      <div
        key="empty"
        className="flex min-h-40 items-center justify-center px-6 text-center text-sm text-muted-foreground"
      >
        {query.trim()
          ? '没有匹配的知识库，请调整搜索关键词。'
          : '还没有可用的知识库。可以先创建知识库，或导入图谱文件。'}
      </div>,
    ]
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[42rem] gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border/60 px-6 py-5">
          <DialogTitle className="text-base font-semibold text-foreground">
            选择图谱范围
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            选择已有知识库，或导入 JSON、JSONL 格式的图谱文件。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 py-5">
          <div className="border-b border-border pb-3">
            <div className="text-xs font-medium text-muted-foreground">当前范围</div>
            <div className="mt-1 text-sm text-foreground">{currentScopeSummary}</div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索知识库名称或 ID…"
                className="h-9 rounded-md border-border bg-background pl-9 shadow-none"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 px-3 text-muted-foreground"
              onClick={() => void refetchDatasets()}
              disabled={loading}
            >
              <RefreshCw
                className={cn('h-4 w-4', loading ? 'animate-spin motion-reduce:animate-none' : '')}
                aria-hidden="true"
              />
              {loading ? '刷新中…' : '刷新'}
            </Button>
          </div>

          {loadFailed && datasets.length > 0 ? (
            <div
              role="alert"
              className="flex flex-col gap-2 rounded-md border border-warning/25 bg-warning/5 px-3 py-2 text-sm text-foreground sm:flex-row sm:items-center sm:justify-between"
            >
              <span>知识库列表刷新失败，当前保留最近一次结果。</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 shrink-0"
                onClick={() => void refetchDatasets()}
                disabled={loading}
              >
                重新加载
              </Button>
            </div>
          ) : null}

          <div className="rounded-md border border-border bg-background p-1">
            <div className="max-h-[22rem] space-y-1 overflow-auto">{datasetListContent}</div>
          </div>
        </div>

        <DialogFooter className="border-t border-border/60 px-6 py-4 sm:justify-between sm:space-x-0">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
            <Button
              type="button"
              onClick={() => {
                onOpenChange(false)
                onTriggerManualKgUpload()
              }}
            >
              <Network className="h-4 w-4" />
              导入图谱文件
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="text-muted-foreground"
              onClick={handleResetScope}
            >
              清空范围
            </Button>
          </div>

          <Button type="button" onClick={handleOpenSelectedScope} disabled={!selectedDatasetId}>
            打开图谱
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
