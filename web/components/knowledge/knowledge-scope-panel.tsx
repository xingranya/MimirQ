import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Filter, RefreshCw } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { DatasetFolderTree } from '@/components/document-library/dataset-folder-tree'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { WorkbenchPane } from '@/components/workbench'
import { documentApi } from '@/lib/api'
import { formatApiError } from '@/lib/api-errors'
import { queryKeys } from '@/lib/query-keys'
import { cn } from '@/lib/utils'
import type { Dataset } from '@/types'

type DocLifecycleFilter = 'active' | 'archived' | 'disabled' | 'all'
type DocStatusFilter =
  | 'all'
  | 'completed'
  | 'processing'
  | 'failed'
  | 'quarantined'
type DocCountValue = string | number

type KnowledgeScopePanelProps = {
  className?: string
  surface?: 'pane' | 'embedded'
  mode?: 'documents' | 'retrieval' | 'settings'
  datasets: Dataset[]
  datasetsLoading?: boolean

  datasetScope: string
  setDatasetScope: (value: string) => void
  datasetAllValue?: string

  selectedDatasetId?: string
  lifecycleFilter: DocLifecycleFilter
  setLifecycleFilter: (value: DocLifecycleFilter) => void
  folderPath: string | null
  setFolderPath: (value: string | null) => void

  statusFilter: DocStatusFilter
  setStatusFilter: (value: DocStatusFilter) => void
  totalDocs: DocCountValue
  completedDocsValue: DocCountValue
  processingDocsValue: DocCountValue
  failedDocsValue: DocCountValue
  quarantinedDocsValue: DocCountValue
}

export function KnowledgeScopePanel({
  className,
  surface = 'pane',
  mode = 'documents',
  datasets,
  datasetsLoading = false,
  datasetScope,
  setDatasetScope,
  datasetAllValue,
  selectedDatasetId,
  lifecycleFilter,
  setLifecycleFilter,
  folderPath,
  setFolderPath,
  statusFilter,
  setStatusFilter,
  totalDocs,
  completedDocsValue,
  processingDocsValue,
  failedDocsValue,
  quarantinedDocsValue,
}: Readonly<KnowledgeScopePanelProps>) {
  const t = useTranslations('KnowledgeScopePanel')
  const datasetAll = datasetAllValue ?? '__all__'
  const embedded = surface === 'embedded'
  const showDocumentFilters = mode === 'documents'
  const folderTreeParams = useMemo(
    () =>
      selectedDatasetId
        ? {
            dataset_id: selectedDatasetId,
            lifecycle: lifecycleFilter,
            max_depth: 20,
          }
        : null,
    [lifecycleFilter, selectedDatasetId]
  )
  const folderTreeQuery = useQuery({
    queryKey: queryKeys.documents.folders(folderTreeParams ?? undefined),
    enabled: showDocumentFilters && Boolean(folderTreeParams),
    queryFn: () => {
      if (!folderTreeParams) throw new Error('缺少目录查询参数')
      return documentApi.folders(folderTreeParams)
    },
  })
  const hasDirectoryFilter = Boolean(
    selectedDatasetId &&
      folderTreeQuery.data &&
      folderTreeQuery.data.total_with_source_path > 0
  )

  useEffect(() => {
    if (!folderPath || !folderTreeQuery.data) return
    if (folderTreeQuery.data.total_with_source_path > 0) return
    setFolderPath(null)
  }, [folderPath, folderTreeQuery.data, setFolderPath])

  const statusItems = [
    { key: 'all', count: totalDocs },
    { key: 'completed', count: completedDocsValue },
    { key: 'processing', count: processingDocsValue },
    { key: 'failed', count: failedDocsValue },
    { key: 'quarantined', count: quarantinedDocsValue },
  ] satisfies Array<{ key: DocStatusFilter; count: DocCountValue }>
  const datasetItems = [
    { id: datasetAll, name: t('dataset.all') },
    ...datasets.map((dataset) => ({ id: dataset.id, name: dataset.name })),
  ]
  const sectionClassName = cn(
    'space-y-2',
    embedded && 'border-b border-border px-3 py-3 last:border-b-0'
  )
  const selectTriggerClassName =
    'h-9 w-full rounded-md border-border bg-background px-3 text-[13px] shadow-none hover:border-primary/40'

  const header = (
    <div className="flex items-center gap-2">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
        <Filter className="size-4" />
      </div>
      <h2 className="text-sm font-semibold text-foreground">筛选范围</h2>
    </div>
  )

  const body = (
    <div className={cn(embedded ? 'space-y-0' : 'space-y-4 p-4')}>
      <section className={sectionClassName}>
        <label className="text-xs font-medium text-muted-foreground">
          {t('dataset.label')}
        </label>
        <Select
          value={datasetScope}
          onValueChange={setDatasetScope}
          disabled={datasetsLoading}
        >
          <SelectTrigger
            aria-label={t('dataset.ariaLabel')}
            className={selectTriggerClassName}
          >
            <SelectValue
              placeholder={datasetsLoading ? t('dataset.loading') : t('dataset.label')}
            />
          </SelectTrigger>
          <SelectContent className="max-h-72 rounded-md border-border">
            {datasetItems.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      {showDocumentFilters ? (
        <section className={sectionClassName}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              {t('status.label')}
            </span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {statusItems.find((item) => item.key === statusFilter)?.count ?? 0}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {statusItems.map((item) => {
              const active = statusFilter === item.key
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setStatusFilter(item.key)}
                  className={cn(
                    'flex h-9 min-w-0 items-center justify-between gap-2 rounded-md border px-3 text-xs font-medium transition-colors focus-ring',
                    active
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted'
                  )}
                  aria-pressed={active}
                >
                  <span className="truncate">{t(`status.${item.key}.label`)}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {item.count}
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      ) : null}

      {showDocumentFilters && selectedDatasetId && folderTreeQuery.isPending ? (
        <section className={sectionClassName} aria-live="polite">
          <span className="text-xs font-medium text-muted-foreground">
            正在读取目录…
          </span>
        </section>
      ) : null}

      {showDocumentFilters && selectedDatasetId && folderTreeQuery.isError ? (
        <section className={sectionClassName} role="alert">
          <p className="text-xs font-medium text-destructive">
            {formatApiError(folderTreeQuery.error, '目录加载失败')}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-md"
            disabled={folderTreeQuery.isFetching}
            onClick={() => folderTreeQuery.refetch()}
          >
            <RefreshCw
              className={cn(
                'mr-2 size-3.5',
                folderTreeQuery.isFetching &&
                  'animate-spin motion-reduce:animate-none'
              )}
            />
            重新加载
          </Button>
        </section>
      ) : null}

      {showDocumentFilters && selectedDatasetId && hasDirectoryFilter ? (
        <section className={sectionClassName}>
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-medium text-muted-foreground">
                {t('folder.label')}
              </div>
              {folderPath ? (
                <div className="mt-1 truncate text-xs text-foreground" title={folderPath}>
                  {folderPath}
                </div>
              ) : null}
            </div>
            {folderPath ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 rounded-md px-2 text-xs"
                onClick={() => setFolderPath(null)}
              >
                {t('folder.clear')}
              </Button>
            ) : null}
          </div>
          <DatasetFolderTree
            className={embedded ? 'rounded-md border border-border bg-background p-2' : undefined}
            datasetId={selectedDatasetId}
            lifecycle={lifecycleFilter}
            selectedPath={folderPath}
            onSelect={setFolderPath}
            showHeader={false}
          />
        </section>
      ) : null}

      {showDocumentFilters ? (
        <section className={sectionClassName}>
          <label className="text-xs font-medium text-muted-foreground">
            {t('lifecycle.label')}
          </label>
          <Select
            value={lifecycleFilter}
            onValueChange={(value) =>
              setLifecycleFilter(value as DocLifecycleFilter)
            }
          >
            <SelectTrigger
              className={selectTriggerClassName}
              aria-label={t('lifecycle.ariaLabel')}
            >
              <SelectValue placeholder={t('lifecycle.placeholder')} />
            </SelectTrigger>
            <SelectContent className="rounded-md border-border">
              <SelectItem value="active">{t('lifecycle.active')}</SelectItem>
              <SelectItem value="disabled">{t('lifecycle.disabled')}</SelectItem>
              <SelectItem value="archived">{t('lifecycle.archived')}</SelectItem>
              <SelectItem value="all">{t('lifecycle.all')}</SelectItem>
            </SelectContent>
          </Select>
        </section>
      ) : null}
    </div>
  )

  if (embedded) {
    return (
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col border-0 bg-background',
          className
        )}
      >
        <div className="border-b border-border px-3 py-3">{header}</div>
        <div
          data-knowledge-scope-panel="true"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        >
          {body}
        </div>
      </div>
    )
  }

  return (
    <WorkbenchPane className={className} header={header}>
      {body}
    </WorkbenchPane>
  )
}
