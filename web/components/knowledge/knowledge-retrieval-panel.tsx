'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Database,
  FileStack,
  Fingerprint,
  Layers3,
  Loader2,
  RefreshCw,
  SearchCheck,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { useIndexAudit } from '@/hooks/use-index-audit'
import { cn, detachPromise } from '@/lib/utils'

type KnowledgeRetrievalPanelProps = {
  selectedDatasetId?: string
  selectedDatasetLabel?: string
  compact?: boolean
  aggregateDocuments?: number
  aggregateChunks?: number
}

function getChecklistStateLabel(state: string): string {
  if (state === 'ok') return '正常'
  if (state === 'warning') return '需处理'
  return '等待审计'
}

function getDetailsButtonLabel({
  hasIndexDetails,
  detailsExpanded,
  selectedDatasetId,
  indexAuditLoading,
}: {
  hasIndexDetails: boolean
  detailsExpanded: boolean
  selectedDatasetId?: string
  indexAuditLoading: boolean
}): string {
  if (hasIndexDetails) {
    return detailsExpanded ? '收起索引详情' : '查看索引详情'
  }
  if (!selectedDatasetId) return '选择数据集后查看详情'
  if (indexAuditLoading) return '正在运行索引审计'
  return '运行索引审计'
}

export function KnowledgeRetrievalPanel({
  selectedDatasetId,
  selectedDatasetLabel,
  compact = false,
  aggregateDocuments = 0,
  aggregateChunks = 0,
}: Readonly<KnowledgeRetrievalPanelProps>) {
  const t = useTranslations('KnowledgeRetrievalPanel')
  const { indexAudit, indexAuditError, indexAuditLoading, runIndexAudit } =
    useIndexAudit({ selectedDatasetId })
  const [detailsExpanded, setDetailsExpanded] = useState(false)
  const hasAggregateOverview =
    !selectedDatasetId && (aggregateDocuments > 0 || aggregateChunks > 0)
  const overviewDatasetLabel = selectedDatasetId
    ? selectedDatasetLabel?.trim() || '当前数据集'
    : '全部数据集'

  useEffect(() => {
    setDetailsExpanded(false)
  }, [selectedDatasetId])

  const metricRows = useMemo(() => {
    if (indexAudit) {
      return [
        {
          key: 'checkedIds',
          label: '向量总数',
          value: indexAudit.vector_ids_checked.toLocaleString(),
          helper: '已检查的索引向量',
          icon: Fingerprint,
        },
        {
          key: 'activeDocuments',
          label: '文档总数',
          value: indexAudit.active_documents.toLocaleString(),
          helper: '当前入库文档',
          icon: FileStack,
        },
        {
          key: 'activeChunks',
          label: '分片总数',
          value: indexAudit.active_chunks.toLocaleString(),
          helper: '当前检索分片',
          icon: Layers3,
        },
      ]
    }

    if (hasAggregateOverview) {
      return [
        {
          key: 'checkedIds',
          label: '向量总数',
          value: aggregateChunks.toLocaleString(),
          helper: '按全部分片汇总',
          icon: Fingerprint,
        },
        {
          key: 'activeDocuments',
          label: '文档总数',
          value: aggregateDocuments.toLocaleString(),
          helper: '全部数据集汇总',
          icon: FileStack,
        },
        {
          key: 'activeChunks',
          label: '分片总数',
          value: aggregateChunks.toLocaleString(),
          helper: '全部数据集汇总',
          icon: Layers3,
        },
      ]
    }

    return []
  }, [aggregateChunks, aggregateDocuments, hasAggregateOverview, indexAudit])

  const auditStatus = useMemo(() => {
    if (hasAggregateOverview) {
      return { label: '汇总数据', tone: 'info' as const }
    }
    if (!selectedDatasetId) {
      return { label: '等待选择', tone: 'neutral' as const }
    }
    if (indexAuditLoading) {
      return { label: '审计中', tone: 'info' as const }
    }
    if (indexAuditError) {
      return { label: '审计失败', tone: 'danger' as const }
    }
    if (indexAudit) {
      return { label: '审计完成', tone: 'success' as const }
    }
    return { label: '尚未审计', tone: 'neutral' as const }
  }, [
    hasAggregateOverview,
    indexAudit,
    indexAuditError,
    indexAuditLoading,
    selectedDatasetId,
  ])

  const consistencyRows = useMemo(() => {
    if (!indexAudit) return []
    return [
      {
        label: '后端缺失向量',
        value: indexAudit.vector_ids_missing_in_backend ?? 0,
      },
      {
        label: '文档缺少向量标识',
        value: indexAudit.vector_id_missing ?? 0,
      },
      {
        label: '孤立向量样本',
        value: indexAudit.milvus_orphan_ids_sample?.length ?? 0,
      },
    ].map((item) => ({
      ...item,
      state: item.value > 0 ? ('warning' as const) : ('ok' as const),
    }))
  }, [indexAudit])

  const hasIndexDetails = Boolean(indexAudit || hasAggregateOverview)
  const detailsButtonLabel = getDetailsButtonLabel({
    hasIndexDetails,
    detailsExpanded,
    selectedDatasetId,
    indexAuditLoading,
  })
  const indexDetailRows = useMemo(() => {
    if (indexAudit) {
      return [
        ['向量服务', indexAudit.vector_backend || '未返回'],
        ['已检查向量', indexAudit.vector_ids_checked.toLocaleString()],
        ['入库文档', indexAudit.active_documents.toLocaleString()],
        ['检索分片', indexAudit.active_chunks.toLocaleString()],
        ['文档缺少向量标识', String(indexAudit.vector_id_missing ?? 0)],
        [
          '后端缺失向量',
          String(indexAudit.vector_ids_missing_in_backend ?? 0),
        ],
        [
          '孤立向量样本',
          String(indexAudit.milvus_orphan_ids_sample?.length ?? 0),
        ],
      ]
    }

    if (hasAggregateOverview) {
      return [
        ['统计范围', '全部数据集汇总'],
        ['文档总数', aggregateDocuments.toLocaleString()],
        ['分片总数', aggregateChunks.toLocaleString()],
      ]
    }

    return []
  }, [aggregateChunks, aggregateDocuments, hasAggregateOverview, indexAudit])

  const statusToneClassName = {
    success: 'border-success/30 bg-success/10 text-success',
    danger: 'border-destructive/30 bg-destructive/10 text-destructive',
    info: 'border-info/30 bg-info/10 text-info',
    neutral: 'border-border bg-muted text-muted-foreground',
  }[auditStatus.tone]

  return (
    <div
      className={cn(
        'flex min-h-0 flex-col bg-background',
        compact ? 'h-full' : 'mx-auto w-full max-w-4xl border border-border'
      )}
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-3 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
            <SearchCheck className="size-4" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-foreground">
              {t('header.title')}
            </h2>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {overviewDatasetLabel}
            </p>
          </div>
        </div>
        <IconButton
          label={indexAuditLoading ? t('actions.running') : t('actions.run')}
          variant="outline"
          className="size-8 shrink-0 rounded-md"
          onClick={() => detachPromise(runIndexAudit())}
          disabled={!selectedDatasetId || indexAuditLoading}
        >
          {indexAuditLoading ? (
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
          ) : (
            <RefreshCw className="size-4" />
          )}
        </IconButton>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-muted-foreground">索引状态</span>
          <span
            className={cn(
              'rounded-md border px-2 py-1 text-xs font-medium',
              statusToneClassName
            )}
          >
            {auditStatus.label}
          </span>
        </div>

        {indexAuditError ? (
          <div
            role="alert"
            className="space-y-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <p className="min-w-0 break-words">{indexAuditError}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-md border-destructive/30"
              disabled={indexAuditLoading}
              onClick={() => detachPromise(runIndexAudit())}
            >
              <RefreshCw className="mr-2 size-3.5" />
              重新运行
            </Button>
          </div>
        ) : null}

        {metricRows.length > 0 ? (
          <section aria-labelledby="knowledge-index-overview-title">
            <h3
              id="knowledge-index-overview-title"
              className="mb-2 text-xs font-medium text-muted-foreground"
            >
              索引概览
            </h3>
            <dl className="divide-y divide-border border-y border-border">
              {metricRows.map((item) => (
                <div
                  key={item.key}
                  className="grid min-w-0 grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 py-3"
                >
                  <item.icon className="size-4 text-muted-foreground" />
                  <div className="min-w-0">
                    <dt className="text-xs font-medium text-foreground">
                      {item.label}
                    </dt>
                    <dd className="mt-0.5 truncate text-xs text-muted-foreground">
                      {item.helper}
                    </dd>
                  </div>
                  <dd className="text-sm font-semibold tabular-nums text-foreground">
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ) : (
          <div className="flex flex-col items-center py-8 text-center">
            <Database className="size-8 text-muted-foreground" />
            <h3 className="mt-3 text-sm font-semibold text-foreground">
              {t('empty.title')}
            </h3>
            <p className="mt-1 max-w-64 text-xs leading-5 text-muted-foreground">
              {selectedDatasetId
                ? '运行索引审计后可查看向量和分片的一致性结果。'
                : t('empty.waitingForDataset')}
            </p>
            {selectedDatasetId ? (
              <Button
                type="button"
                size="sm"
                className="mt-4 h-9 rounded-md"
                disabled={indexAuditLoading}
                onClick={() => detachPromise(runIndexAudit())}
              >
                {indexAuditLoading ? (
                  <Loader2 className="mr-2 size-4 animate-spin motion-reduce:animate-none" />
                ) : (
                  <RefreshCw className="mr-2 size-4" />
                )}
                运行索引审计
              </Button>
            ) : null}
          </div>
        )}

        {consistencyRows.length > 0 ? (
          <section aria-labelledby="knowledge-index-consistency-title">
            <h3
              id="knowledge-index-consistency-title"
              className="mb-2 text-xs font-medium text-muted-foreground"
            >
              一致性检查
            </h3>
            <ul className="divide-y divide-border border-y border-border">
              {consistencyRows.map((item) => (
                <li
                  key={item.label}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <span className="flex min-w-0 items-center gap-2 text-xs text-foreground">
                    {item.state === 'ok' ? (
                      <CheckCircle2 className="size-4 shrink-0 text-success" />
                    ) : (
                      <AlertTriangle className="size-4 shrink-0 text-warning" />
                    )}
                    <span className="truncate">{item.label}</span>
                  </span>
                  <span
                    className={cn(
                      'shrink-0 text-xs font-medium',
                      item.state === 'ok' ? 'text-success' : 'text-warning'
                    )}
                  >
                    {getChecklistStateLabel(item.state)}
                    {item.value > 0 ? ` · ${item.value}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <Button
          type="button"
          variant="outline"
          aria-expanded={detailsExpanded}
          aria-controls="knowledge-index-detail-panel"
          onClick={() => {
            if (!hasIndexDetails) {
              if (selectedDatasetId && !indexAuditLoading) {
                detachPromise(runIndexAudit())
              }
              return
            }
            setDetailsExpanded((expanded) => !expanded)
          }}
          disabled={!hasIndexDetails && (!selectedDatasetId || indexAuditLoading)}
          className="h-9 w-full rounded-md"
        >
          {!hasIndexDetails && indexAuditLoading ? (
            <Loader2 className="mr-2 size-4 animate-spin motion-reduce:animate-none" />
          ) : null}
          {detailsButtonLabel}
          {hasIndexDetails ? (
            <ChevronRight
              className={cn(
                'ml-2 size-4 transition-transform',
                detailsExpanded && 'rotate-90'
              )}
            />
          ) : null}
        </Button>

        {detailsExpanded && hasIndexDetails ? (
          <section
            id="knowledge-index-detail-panel"
            aria-labelledby="knowledge-index-detail-title"
            className="space-y-3 border-t border-border pt-3"
          >
            <div className="flex items-center justify-between gap-3">
              <h3
                id="knowledge-index-detail-title"
                className="text-sm font-semibold text-foreground"
              >
                索引详情
              </h3>
              <span className="text-xs text-muted-foreground">
                {overviewDatasetLabel}
              </span>
            </div>
            <dl className="divide-y divide-border border-y border-border">
              {indexDetailRows.map(([label, value]) => (
                <div
                  key={label}
                  className="flex min-w-0 items-center justify-between gap-3 py-2.5 text-xs"
                >
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="min-w-0 truncate font-medium text-foreground" title={value}>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>

            {indexAudit?.vector_ids_missing_in_backend_sample?.length ? (
              <div>
                <h4 className="mb-2 text-xs font-medium text-destructive">
                  后端缺失向量样本
                </h4>
                <pre className="max-h-40 overflow-auto rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                  {indexAudit.vector_ids_missing_in_backend_sample.join('\n')}
                </pre>
              </div>
            ) : null}

            {indexAudit?.milvus_orphan_ids_sample?.length ? (
              <div>
                <h4 className="mb-2 text-xs font-medium text-warning">
                  孤立向量样本
                </h4>
                <pre className="max-h-40 overflow-auto rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
                  {indexAudit.milvus_orphan_ids_sample.join('\n')}
                </pre>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  )
}
