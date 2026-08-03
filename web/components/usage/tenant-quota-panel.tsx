'use client'

import { useMemo, type ComponentType } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Copy,
  Database,
  FileText,
  Gauge,
  Loader2,
  RefreshCw,
  TextCursorInput,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { usageApi } from '@/lib/api'
import { formatApiError } from '@/lib/api-errors'
import { queryKeys } from '@/lib/query-keys'
import { cn, detachPromise } from '@/lib/utils'
import type { TenantQuotaSummary } from '@/types'

const DISABLED_DOCUMENT_QUOTA: TenantQuotaSummary['documents'] = {
  enabled: false,
  limit: 0,
  used: 0,
  remaining: 0,
  exceeded: false,
}
const DISABLED_STORAGE_QUOTA: TenantQuotaSummary['storage'] = {
  enabled: false,
  limit_bytes: 0,
  used_bytes: 0,
  remaining_bytes: 0,
  exceeded: false,
}
const DISABLED_EMBEDDING_QUOTA: TenantQuotaSummary['embedding_chars'] = {
  enabled: false,
  mode: 'disabled',
  limit_chars: 0,
  used_chars: 0,
  remaining_chars: 0,
  exceeded: false,
  window_hours: 0,
  window_start: '',
  window_end: '',
}
const DISABLED_QPS_QUOTA: TenantQuotaSummary['qps'] = {
  enabled: false,
  mode: 'disabled',
  rps: 0,
  burst: 0,
  scopes: [],
}

function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success('原始数据已复制')
  } catch {
    toast.error('复制失败，请重试')
  }
}

function formatNumber(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return '0'
  return Number(value).toLocaleString('zh-CN')
}

function formatBytes(value: number | null | undefined) {
  const numberValue = Number(value || 0)
  if (!Number.isFinite(numberValue) || numberValue <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = numberValue
  let index = 0
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024
    index += 1
  }
  return `${size >= 10 || index === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[index]}`
}

function disabledQuotaText(label = '此项配额尚未启用') {
  return { primary: '未启用', secondary: label }
}

function getQuotaStatusLabel(enabled: boolean, exceeded: boolean) {
  if (exceeded) return '超出上限'
  if (enabled) return '已启用'
  return '未启用'
}

function getQuotaTone(enabled: boolean, exceeded: boolean) {
  if (exceeded) return 'border-destructive/25 bg-destructive/10 text-destructive'
  if (enabled) return 'border-success/25 bg-success/10 text-success'
  return 'border-border bg-muted text-muted-foreground'
}

function getQuotaProgressClass(enabled: boolean, exceeded: boolean) {
  if (exceeded) return 'bg-destructive'
  if (enabled) return 'bg-success'
  return 'bg-muted-foreground/40'
}

function formatQuotaScopes(scopes: string[] | null | undefined) {
  const labels: Record<string, string> = {
    chat: '对话',
    retrieval: '检索',
    ingestion: '知识入库',
  }
  const values = (scopes || []).map((scope) => labels[scope] || scope)
  return values.length ? values.join('、') : '全部请求'
}

type QuotaSummaryItemProps = {
  icon: ComponentType<{ className?: string }>
  title: string
  enabled: boolean
  exceeded?: boolean
  primary: string
  secondary: string
  progress?: number
}

function QuotaSummaryItem({
  icon: Icon,
  title,
  enabled,
  exceeded = false,
  primary,
  secondary,
  progress = 0,
}: Readonly<QuotaSummaryItemProps>) {
  return (
    <div className="min-w-0 bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <h3 className="truncate text-sm font-medium text-foreground">{title}</h3>
        </div>
        <span className={cn('shrink-0 rounded-md border px-1.5 py-0.5 text-xs', getQuotaTone(enabled, exceeded))}>
          {getQuotaStatusLabel(enabled, exceeded)}
        </span>
      </div>
      <p className="mt-3 truncate text-base font-semibold text-foreground tabular-nums">
        {primary}
      </p>
      <p className="mt-1 truncate text-xs text-muted-foreground" title={secondary}>
        {secondary}
      </p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-sm bg-muted" aria-hidden="true">
        <div
          className={cn('h-full rounded-sm', getQuotaProgressClass(enabled, exceeded))}
          style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
        />
      </div>
    </div>
  )
}

export function TenantQuotaPanel() {
  const quotaQuery = useQuery<TenantQuotaSummary>({
    queryKey: queryKeys.usage.tenantQuotaSummary,
    queryFn: () => usageApi.getTenantQuotaSummary(),
    staleTime: 60 * 1000,
  })
  const payload = quotaQuery.data ?? null
  const documentsQuota = payload?.documents ?? DISABLED_DOCUMENT_QUOTA
  const storageQuota = payload?.storage ?? DISABLED_STORAGE_QUOTA
  const embeddingQuota = payload?.embedding_chars ?? DISABLED_EMBEDDING_QUOTA
  const qpsQuota = payload?.qps ?? DISABLED_QPS_QUOTA
  const json = useMemo(() => prettyJson(payload), [payload])
  const documentQuotaText = documentsQuota.enabled
    ? {
        primary: `${formatNumber(documentsQuota.used)} / ${formatNumber(documentsQuota.limit)}`,
        secondary: `还可使用 ${formatNumber(documentsQuota.remaining)} 个文档`,
      }
    : disabledQuotaText()
  const storageQuotaText = storageQuota.enabled
    ? {
        primary: `${formatBytes(storageQuota.used_bytes)} / ${formatBytes(storageQuota.limit_bytes)}`,
        secondary: `还可使用 ${formatBytes(storageQuota.remaining_bytes)}`,
      }
    : disabledQuotaText()
  const embeddingQuotaText = embeddingQuota.enabled
    ? {
        primary: `${formatNumber(embeddingQuota.used_chars)} / ${formatNumber(embeddingQuota.limit_chars)}`,
        secondary: `${formatNumber(embeddingQuota.window_hours)} 小时统计窗口`,
      }
    : disabledQuotaText('向量化字符配额尚未启用')
  const qpsQuotaText = qpsQuota.enabled
    ? {
        primary: `每秒 ${formatNumber(qpsQuota.rps)} 次`,
        secondary: `峰值 ${formatNumber(qpsQuota.burst)} 次，适用于${formatQuotaScopes(qpsQuota.scopes)}`,
      }
    : disabledQuotaText('请求频率限制尚未启用')

  async function refreshQuota() {
    const result = await quotaQuery.refetch()
    if (result.error) {
      toast.error(formatApiError(result.error, '配额数据加载失败，请稍后重试'))
      return
    }
    if (result.data) toast.success('配额数据已更新')
  }

  return (
    <Panel padding="none" className="overflow-hidden rounded-md border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">租户配额</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            配额对当前租户生效，不会单独分配给数据集或成员。
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-9 w-full gap-2 rounded-md sm:w-auto"
          disabled={quotaQuery.isFetching}
          onClick={() => detachPromise(refreshQuota())}
        >
          {quotaQuery.isFetching ? (
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <RefreshCw className="size-4" aria-hidden="true" />
          )}
          刷新配额
        </Button>
      </div>

      {quotaQuery.error ? (
        <div role="alert" className="border-b border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {formatApiError(quotaQuery.error, '配额数据加载失败，请稍后重试')}
        </div>
      ) : null}

      {payload ? (
        <div className="grid gap-px bg-border md:grid-cols-2 xl:grid-cols-4">
          <QuotaSummaryItem
            icon={FileText}
            title="文档数量"
            enabled={documentsQuota.enabled}
            exceeded={documentsQuota.exceeded}
            primary={documentQuotaText.primary}
            secondary={documentQuotaText.secondary}
            progress={documentsQuota.enabled ? (documentsQuota.used / Math.max(1, documentsQuota.limit)) * 100 : 0}
          />
          <QuotaSummaryItem
            icon={Database}
            title="存储空间"
            enabled={storageQuota.enabled}
            exceeded={storageQuota.exceeded}
            primary={storageQuotaText.primary}
            secondary={storageQuotaText.secondary}
            progress={storageQuota.enabled ? (storageQuota.used_bytes / Math.max(1, storageQuota.limit_bytes)) * 100 : 0}
          />
          <QuotaSummaryItem
            icon={TextCursorInput}
            title="向量化字符"
            enabled={embeddingQuota.enabled}
            exceeded={embeddingQuota.exceeded}
            primary={embeddingQuotaText.primary}
            secondary={embeddingQuotaText.secondary}
            progress={embeddingQuota.enabled ? (embeddingQuota.used_chars / Math.max(1, embeddingQuota.limit_chars)) * 100 : 0}
          />
          <QuotaSummaryItem
            icon={Gauge}
            title="请求频率"
            enabled={qpsQuota.enabled}
            primary={qpsQuotaText.primary}
            secondary={qpsQuotaText.secondary}
            progress={qpsQuota.enabled ? 100 : 0}
          />
        </div>
      ) : (
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">
          {quotaQuery.isFetching
            ? '正在读取配额数据...'
            : '暂时没有配额数据，请刷新后重试。'}
        </div>
      )}

      {payload ? (
        <details className="border-t border-border">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-foreground hover:bg-muted/50">
            查看接口原始数据
          </summary>
          <div className="border-t border-border bg-muted/30">
            <div className="flex justify-end border-b border-border p-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-2 rounded-md"
                onClick={() => detachPromise(copyText(json))}
              >
                <Copy className="size-4" aria-hidden="true" />
                复制 JSON
              </Button>
            </div>
            <pre className="max-h-[240px] overflow-auto p-4 text-xs leading-5 text-foreground">
              <code>{json}</code>
            </pre>
          </div>
        </details>
      ) : null}
    </Panel>
  )
}
