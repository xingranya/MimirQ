'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowUpRight,
  BarChart3,
  Clock3,
  Coins,
  Database,
  MessageSquareText,
  RefreshCw,
  Timer,
  UserRound,
  Zap,
  type LucideIcon,
} from 'lucide-react'

import { AppFrame } from '@/components/app-frame'
import { TenantPermissionGate } from '@/components/auth/tenant-permission-gate'
import { TenantQuotaPanel } from '@/components/usage/tenant-quota-panel'
import { Button } from '@/components/ui/button'
import { PageScaffold } from '@/components/ui/page-scaffold'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Link } from '@/i18n/navigation'
import { datasetApi, usageApi } from '@/lib/api'
import { formatApiError } from '@/lib/api-errors'
import { queryKeys } from '@/lib/query-keys'
import { TENANT_PERMISSIONS } from '@/lib/tenant-permissions'
import { cn } from '@/lib/utils'
import type {
  ChatCostUsageSummary,
  ChatTokenQuotaStatus,
  ChatTokenUsageSummary,
} from '@/types'

const WINDOW_PRESETS = [
  { value: 7, label: '最近 7 天' },
  { value: 14, label: '最近 14 天' },
  { value: 30, label: '最近 30 天' },
] as const

const TABLE_HEADER_CLASS =
  'whitespace-nowrap px-4 py-2.5 text-xs font-medium text-muted-foreground'
const TABLE_NUMBER_CLASS =
  'whitespace-nowrap px-4 py-3 text-right text-xs tabular-nums text-foreground'

function shortId(id: string) {
  const value = id.trim()
  if (!value) return ''
  return value.length > 12
    ? `${value.slice(0, 6)}...${value.slice(-4)}`
    : value
}

function formatNumber(value: number | string | null | undefined) {
  if (value == null || value === '') return '0'
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return String(value)
  return numberValue.toLocaleString('zh-CN')
}

function formatSec(sec: number | null | undefined) {
  if (sec == null || !Number.isFinite(sec)) return '0 毫秒'
  if (sec < 1) return `${Math.round(sec * 1000)} 毫秒`
  return `${sec.toFixed(2)} 秒`
}

function formatWindow(start?: string | null, end?: string | null) {
  if (!start || !end) return '暂无统计时间'
  try {
    const options: Intl.DateTimeFormatOptions = {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }
    return `${new Date(start).toLocaleString('zh-CN', options)} 至 ${new Date(end).toLocaleString('zh-CN', options)}`
  } catch {
    return `${start} 至 ${end}`
  }
}

function buildDatasetKnowledgeHref(datasetId: string) {
  const params = new URLSearchParams({
    dataset: datasetId,
    lifecycle: 'all',
    status: 'all',
  })
  return `/knowledge?${params.toString()}`
}

function UsageMetric({
  icon: Icon,
  label,
  value,
  detail,
}: Readonly<{
  icon: LucideIcon
  label: string
  value: string | number
  detail: string
}>) {
  return (
    <div className="min-w-0 bg-card px-4 py-3">
      <dt className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </dt>
      <dd className="mt-2 truncate text-xl font-semibold leading-6 text-foreground tabular-nums">
        {value}
      </dd>
      <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}

function UsageDatasetCell({
  datasetId,
  datasetName,
}: Readonly<{
  datasetId: string
  datasetName: string
}>) {
  const displayName = datasetName || (datasetId ? '已删除或无权访问' : '未关联数据集')
  const status = datasetName ? 'active' : datasetId ? 'unavailable' : 'unbound'
  const statusLabel = {
    active: '可查看',
    unavailable: '不可访问',
    unbound: '未关联',
  }[status]

  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-2">
        <p className="max-w-[260px] truncate text-sm font-medium text-foreground">
          {displayName}
        </p>
        <span
          className={cn(
            'shrink-0 rounded-md border px-1.5 py-0.5 text-xs',
            status === 'active'
              ? 'border-success/25 bg-success/10 text-success'
              : status === 'unavailable'
                ? 'border-warning/25 bg-warning/10 text-warning'
                : 'border-border bg-muted text-muted-foreground'
          )}
        >
          {statusLabel}
        </span>
      </div>
      <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
        {datasetId ? shortId(datasetId) : '无数据集编号'}
      </p>
    </div>
  )
}

function DatasetLink({
  datasetId,
  datasetName,
}: Readonly<{
  datasetId: string
  datasetName: string
}>) {
  if (!datasetId || !datasetName) {
    return <span className="text-xs text-muted-foreground">不可查看</span>
  }

  return (
    <Link
      href={buildDatasetKnowledgeHref(datasetId)}
      className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      查看数据集
      <ArrowUpRight className="size-3.5" aria-hidden="true" />
    </Link>
  )
}

function EmptyTableRow({
  colSpan,
  children,
}: Readonly<{
  colSpan: number
  children: string
}>) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-muted-foreground">
        {children}
      </td>
    </tr>
  )
}

export default function UsagePage() {
  return (
    <TenantPermissionGate
      permission={TENANT_PERMISSIONS.USAGE_READ}
      pageName="用量与配额"
    >
      <UsagePageContent />
    </TenantPermissionGate>
  )
}

function UsagePageContent() {
  const [windowDays, setWindowDays] = useState<number>(7)
  const windowParams = useMemo(() => ({ window_days: windowDays }), [windowDays])

  const summaryQuery = useQuery<ChatTokenUsageSummary>({
    queryKey: queryKeys.usage.summary(windowParams),
    queryFn: () => usageApi.getChatTokenUsageSummary(windowParams),
    placeholderData: (previousData) => previousData,
  })

  const costQuery = useQuery<ChatCostUsageSummary | null>({
    queryKey: queryKeys.usage.cost(windowParams),
    queryFn: () => usageApi.getChatCostUsageSummary(windowParams).catch(() => null),
    placeholderData: (previousData) => previousData,
  })

  const quotaQuery = useQuery<ChatTokenQuotaStatus | null>({
    queryKey: queryKeys.usage.quota,
    queryFn: () => usageApi.getChatTokenQuotaStatus().catch(() => null),
    staleTime: 60 * 1000,
  })

  const datasetLabelsQuery = useQuery<Record<string, string>>({
    queryKey: queryKeys.datasets.exhaustive({ purpose: 'usage-labels' }),
    queryFn: async () => {
      const datasets = await datasetApi.listAll()
      const nameMap: Record<string, string> = {}
      for (const dataset of datasets) {
        if (dataset?.id) {
          nameMap[String(dataset.id)] =
            String(dataset.name || '').trim() || shortId(String(dataset.id))
        }
      }
      return nameMap
    },
    staleTime: 5 * 60 * 1000,
  })

  const summary = summaryQuery.data ?? null
  const cost = costQuery.data ?? null
  const quota = quotaQuery.data ?? null
  const datasetNameById = datasetLabelsQuery.data ?? {}
  const loading =
    summaryQuery.isFetching ||
    costQuery.isFetching ||
    quotaQuery.isFetching ||
    datasetLabelsQuery.isFetching
  const loadErrorMessage = summaryQuery.error
    ? formatApiError(summaryQuery.error, '用量数据加载失败，请稍后重试')
    : ''

  const rows = useMemo(() => {
    const list = summary?.by_dataset || []
    return [...list]
      .sort((left, right) => (right.assistant_tokens || 0) - (left.assistant_tokens || 0))
      .slice(0, 10)
  }, [summary])

  const costRows = useMemo(() => {
    const list = cost?.by_dataset || []
    return [...list]
      .sort((left, right) => (right.llm_total_tokens || 0) - (left.llm_total_tokens || 0))
      .slice(0, 10)
  }, [cost])

  const averageRetrievalTime = cost
    ? cost.total_retrieval_elapsed_sec / Math.max(1, cost.total_assistant_messages || 0)
    : null
  const quotaStatus = quota?.enabled
    ? quota.exceeded
      ? '已超出上限'
      : '额度正常'
    : '未启用'
  const dataStatus = loading
    ? summary
      ? '正在更新'
      : '正在加载'
    : summary
      ? '数据已更新'
      : '暂无数据'

  function refreshUsage() {
    void summaryQuery.refetch()
    void costQuery.refetch()
    void quotaQuery.refetch()
    void datasetLabelsQuery.refetch()
  }

  return (
    <AppFrame>
      <PageScaffold
        title="用量与配额"
        description="查看当前租户的对话用量、数据集成本和可用额度。"
        iconImage="usage-quota"
        icon={Coins}
        iconColor="text-primary"
        size="full"
      >
        <div className="flex flex-col gap-6 pb-8">
          <section aria-labelledby="usage-overview-title" className="rounded-md border border-border bg-card">
            <div className="flex flex-col gap-3 border-b border-border px-4 py-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 id="usage-overview-title" className="text-base font-semibold text-foreground">
                    用量概览
                  </h2>
                  <span
                    className={cn(
                      'rounded-md border px-2 py-0.5 text-xs',
                      summary
                        ? 'border-success/25 bg-success/10 text-success'
                        : 'border-border bg-muted text-muted-foreground'
                    )}
                  >
                    {dataStatus}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  当前按租户统计，最多显示用量最高的 10 个数据集。
                </p>
              </div>

              <div className="flex w-full items-center gap-2 md:w-auto">
                <Select
                  value={String(windowDays)}
                  onValueChange={(value) => setWindowDays(Number(value))}
                >
                  <SelectTrigger className="h-9 min-w-0 flex-1 rounded-md md:w-[132px]" aria-label="选择统计时间">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WINDOW_PRESETS.map((preset) => (
                      <SelectItem key={preset.value} value={String(preset.value)}>
                        {preset.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 shrink-0 gap-2 rounded-md"
                  disabled={loading}
                  onClick={refreshUsage}
                >
                  <RefreshCw
                    className={cn('size-4', loading && 'animate-spin motion-reduce:animate-none')}
                    aria-hidden="true"
                  />
                  刷新
                </Button>
              </div>
            </div>

            {loadErrorMessage ? (
              <div role="alert" className="border-b border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {loadErrorMessage}
              </div>
            ) : null}

            <dl className="grid grid-cols-2 gap-px bg-border lg:grid-cols-3 2xl:grid-cols-6">
              <UsageMetric
                icon={UserRound}
                label="回答令牌"
                value={formatNumber(summary?.total_assistant_tokens)}
                detail="AI 回答产生的令牌"
              />
              <UsageMetric
                icon={Coins}
                label="模型总令牌"
                value={formatNumber(cost?.total_llm_total_tokens)}
                detail="模型请求估算值"
              />
              <UsageMetric
                icon={Database}
                label="向量化令牌"
                value={formatNumber(cost?.total_embedding_query_tokens)}
                detail="检索查询消耗"
              />
              <UsageMetric
                icon={Timer}
                label="平均检索耗时"
                value={formatSec(averageRetrievalTime)}
                detail="每条助手消息"
              />
              <UsageMetric
                icon={Clock3}
                label="聊天配额"
                value={quota?.enabled ? formatNumber(quota.remaining) : '未启用'}
                detail={quotaStatus}
              />
              <UsageMetric
                icon={MessageSquareText}
                label="助手消息"
                value={formatNumber(summary?.total_assistant_messages)}
                detail="统计期内消息数"
              />
            </dl>
          </section>

          <div className="grid gap-6 2xl:grid-cols-2">
            <section aria-labelledby="dataset-usage-title" className="min-w-0 rounded-md border border-border bg-card">
              <div className="border-b border-border px-4 py-3">
                <h2 id="dataset-usage-title" className="flex items-center gap-2 text-base font-semibold text-foreground">
                  <BarChart3 className="size-4 text-primary" aria-hidden="true" />
                  数据集用量
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  按回答令牌从高到低排列，{formatWindow(summary?.window_start, summary?.window_end)}。
                </p>
              </div>
              <div className="max-h-[440px] overflow-auto">
                <table className="w-full min-w-[620px] text-left">
                  <thead className="sticky top-0 z-10 bg-muted">
                    <tr>
                      <th className={TABLE_HEADER_CLASS}>数据集</th>
                      <th className={cn(TABLE_HEADER_CLASS, 'text-right')}>助手消息</th>
                      <th className={cn(TABLE_HEADER_CLASS, 'text-right')}>回答令牌</th>
                      <th className={cn(TABLE_HEADER_CLASS, 'text-right')}>操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.length ? (
                      rows.map((row) => {
                        const datasetId = row.dataset_id || ''
                        const datasetName = datasetNameById[datasetId] || ''
                        return (
                          <tr key={datasetId || 'unbound'} className="hover:bg-muted/50">
                            <td className="px-4 py-3">
                              <UsageDatasetCell datasetId={datasetId} datasetName={datasetName} />
                            </td>
                            <td className={TABLE_NUMBER_CLASS}>{formatNumber(row.assistant_messages)}</td>
                            <td className={TABLE_NUMBER_CLASS}>{formatNumber(row.assistant_tokens)}</td>
                            <td className="whitespace-nowrap px-4 py-3 text-right">
                              <DatasetLink datasetId={datasetId} datasetName={datasetName} />
                            </td>
                          </tr>
                        )
                      })
                    ) : (
                      <EmptyTableRow colSpan={4}>统计期内还没有可显示的对话用量。</EmptyTableRow>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section aria-labelledby="dataset-cost-title" className="min-w-0 rounded-md border border-border bg-card">
              <div className="border-b border-border px-4 py-3">
                <h2 id="dataset-cost-title" className="flex items-center gap-2 text-base font-semibold text-foreground">
                  <Zap className="size-4 text-primary" aria-hidden="true" />
                  数据集成本估算
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  汇总模型、向量化与检索耗时，{formatWindow(cost?.window_start, cost?.window_end)}。
                </p>
              </div>
              <div className="max-h-[440px] overflow-auto">
                <table className="w-full min-w-[720px] text-left">
                  <thead className="sticky top-0 z-10 bg-muted">
                    <tr>
                      <th className={TABLE_HEADER_CLASS}>数据集</th>
                      <th className={cn(TABLE_HEADER_CLASS, 'text-right')}>模型令牌</th>
                      <th className={cn(TABLE_HEADER_CLASS, 'text-right')}>向量化令牌</th>
                      <th className={cn(TABLE_HEADER_CLASS, 'text-right')}>平均检索耗时</th>
                      <th className={cn(TABLE_HEADER_CLASS, 'text-right')}>操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {costRows.length ? (
                      costRows.map((row) => {
                        const datasetId = row.dataset_id || ''
                        const datasetName = datasetNameById[datasetId] || ''
                        return (
                          <tr key={datasetId || 'unbound-cost'} className="hover:bg-muted/50">
                            <td className="px-4 py-3">
                              <UsageDatasetCell datasetId={datasetId} datasetName={datasetName} />
                            </td>
                            <td className={TABLE_NUMBER_CLASS}>{formatNumber(row.llm_total_tokens)}</td>
                            <td className={TABLE_NUMBER_CLASS}>{formatNumber(row.embedding_query_tokens)}</td>
                            <td className={TABLE_NUMBER_CLASS}>
                              {formatSec(row.retrieval_elapsed_sec_sum / Math.max(1, row.assistant_messages || 0))}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-right">
                              <DatasetLink datasetId={datasetId} datasetName={datasetName} />
                            </td>
                          </tr>
                        )
                      })
                    ) : (
                      <EmptyTableRow colSpan={5}>统计期内还没有可显示的成本数据。</EmptyTableRow>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <TenantQuotaPanel />
        </div>
      </PageScaffold>
    </AppFrame>
  )
}
