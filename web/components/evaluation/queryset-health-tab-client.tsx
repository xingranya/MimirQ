'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import {
  AlertTriangle,
  RefreshCw,
  GitCompare,
  Target,
  TrendingUp,
  ChartLine,
  Timer,
  SearchX,
  ShieldAlert,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { QueryErrorState } from '@/components/ui/query-error-state'
import { SafeResponsiveChart } from '@/components/ui/safe-responsive-chart'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { StatCard, StatsGrid } from '@/components/ui/stats-card'
import { observabilityApi } from '@/lib/api'
import { formatApiError } from '@/lib/api-errors'
import { queryKeys } from '@/lib/query-keys'
import { cn, detachPromise } from '@/lib/utils'
import type { JsonObject } from '@/types'

type QuerysetHealthRunItem = JsonObject & {
  generated_at?: string
  metrics?: JsonObject
  risk?: JsonObject
  degradation_flags?: unknown[]
  status?: string
}

type QuerysetTrendRow = {
  t: number
  time: string
  dateLabel: string
  hit_at_k: number | null
  mrr: number | null
  ndcg_at_k: number | null
  p95_latency_ms: number | null
  miss_rate: number | null
  weak_hit_rate: number | null
}

const QUERYSET_DELTA_METRICS = [
  {
    key: 'hit_at_k_delta',
    label: '命中率',
    kind: 'percent',
    lowerIsBetter: false,
  },
  {
    key: 'mrr_delta',
    label: '平均倒数排名',
    kind: 'number',
    lowerIsBetter: false,
  },
  {
    key: 'ndcg_at_k_delta',
    label: '归一化增益',
    kind: 'number',
    lowerIsBetter: false,
  },
  {
    key: 'p95_latency_ms_delta',
    label: 'P95 延迟',
    kind: 'ms',
    lowerIsBetter: true,
  },
  {
    key: 'miss_rate_delta',
    label: '漏检率',
    kind: 'percent',
    lowerIsBetter: true,
  },
  {
    key: 'weak_hit_rate_delta',
    label: '弱命中率',
    kind: 'percent',
    lowerIsBetter: true,
  },
] as const

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function querysetRunItem(value: unknown): QuerysetHealthRunItem {
  return isJsonObject(value) ? value : {}
}

const DEGRADATION_FLAG_LABELS: Readonly<Record<string, string>> = {
  hit_at_k_drop: '命中率下降',
  mrr_drop: '平均倒数排名下降',
  ndcg_drop: '归一化增益下降',
  p95_latency_regression: '响应延迟上升',
  miss_rate_regression: '漏检率上升',
  weak_hit_rate_regression: '弱命中率上升',
}

function degradationFlagLabel(value: unknown): string {
  const key = String(value || '').trim()
  return DEGRADATION_FLAG_LABELS[key] || '其他退化项'
}

function formatSnapshotTimestamp(value: unknown): string {
  const raw = String(value || '').trim()
  if (!raw) return '时间未知'
  const timestamp = Date.parse(raw)
  if (!Number.isFinite(timestamp)) return raw
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function runStatusMeta(status: unknown): {
  label: string
  className: string
} {
  const value = String(status || '')
  if (value === 'degraded') {
    return { label: '需要关注', className: 'text-destructive' }
  }
  if (value === 'healthy') {
    return { label: '正常', className: 'text-success' }
  }
  return { label: '状态未知', className: 'text-muted-foreground' }
}

function querysetRunDisplay(item: QuerysetHealthRunItem) {
  const metrics = isJsonObject(item.metrics) ? item.metrics : {}
  const risk = isJsonObject(item.risk) ? item.risk : {}
  return {
    generatedAt: formatSnapshotTimestamp(item.generated_at),
    status: runStatusMeta(item.status),
    hitRate: fmtPercent(metrics.hit_at_k, 1),
    mrr: fmtNum(metrics.mrr, 3),
    ndcg: fmtNum(metrics.ndcg_at_k, 3),
    latency: fmtMs(metrics.p95_latency_ms),
    missRate: fmtPercent(risk.miss_rate, 1),
  }
}
function formatTs(tsMs: number) {
  try {
    return new Date(tsMs).toLocaleString([], {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return String(tsMs)
  }
}

function formatDateTick(tsMs: number) {
  try {
    return new Date(tsMs)
      .toLocaleDateString([], { month: '2-digit', day: '2-digit' })
      .replace('/', '-')
  } catch {
    return String(tsMs)
  }
}

function buildQuerysetTrendSkeleton() {
  const dayMs = 24 * 60 * 60 * 1000
  const end = new Date()
  end.setHours(0, 0, 0, 0)

  return Array.from({ length: 7 }, (_, index) => {
    const t = end.getTime() - (6 - index) * dayMs
    return {
      t,
      time: formatTs(t),
      dateLabel: formatDateTick(t),
      hit_at_k: null,
      mrr: null,
      ndcg_at_k: null,
      p95_latency_ms: null,
      miss_rate: null,
      weak_hit_rate: null,
    }
  })
}

function fmtPercent(v?: unknown, digits = 1) {
  if (v == null || !Number.isFinite(Number(v))) return '—'
  return `${(Number(v) * 100).toFixed(digits)}%`
}

function fmtNum(v?: unknown, digits = 3) {
  if (v == null || !Number.isFinite(Number(v))) return '—'
  return Number(v).toFixed(digits)
}

function fmtMs(v?: unknown) {
  if (v == null || !Number.isFinite(Number(v))) return '—'
  return `${Math.round(Number(v))}ms`
}

function formatSignedDelta(
  value: unknown,
  kind: (typeof QUERYSET_DELTA_METRICS)[number]['kind']
) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '—'
  const sign = numeric > 0 ? '+' : ''
  if (kind === 'percent') return `${sign}${(numeric * 100).toFixed(1)}%`
  if (kind === 'ms') return `${sign}${numeric.toFixed(1)}ms`
  return `${sign}${numeric.toFixed(3)}`
}

function deltaState(value: unknown, lowerIsBetter: boolean) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || Math.abs(numeric) < 1e-9) {
    return { label: '持平', className: 'bg-muted text-muted-foreground' }
  }
  const improved = lowerIsBetter ? numeric < 0 : numeric > 0
  if (improved) {
    return { label: '改善', className: 'bg-success/10 text-success' }
  }
  return { label: '退化', className: 'bg-destructive/10 text-destructive' }
}

function QuerysetChartEmptyState() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="bg-card px-4 py-3 text-center">
        <div className="mx-auto mb-2 flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <ChartLine className="size-4" aria-hidden="true" />
        </div>
        <div className="text-sm font-semibold text-foreground">暂无数据</div>
        <div className="mt-1 text-xs text-muted-foreground">
          当前筛选条件下暂无趋势数据
        </div>
      </div>
    </div>
  )
}

export function QuerysetHealthTab({
  embedded = false,
}: Readonly<{ embedded?: boolean }>) {
  const [baselineTs, setBaselineTs] = useState<string>('')
  const [currentTs, setCurrentTs] = useState<string>('')
  const [showAllRuns, setShowAllRuns] = useState(false)
  const runsQuery = useQuery({
    queryKey: queryKeys.evaluations.querysetHealthRuns({ limit: 90 }),
    queryFn: () => observabilityApi.getQuerysetHealthRuns({ limit: 90 }),
  })
  const runTimestamps = useMemo(
    () =>
      Array.from(
        new Set(
          (runsQuery.data?.items || [])
            .map((item) => String(item.generated_at || '').trim())
            .filter(Boolean)
        )
      ),
    [runsQuery.data?.items]
  )
  const hasValidDiffSelection =
    Boolean(baselineTs && currentTs && baselineTs !== currentTs) &&
    runTimestamps.includes(baselineTs) &&
    runTimestamps.includes(currentTs)
  const diffQuery = useQuery({
    queryKey: queryKeys.evaluations.querysetHealthDiff({
      baseline_generated_at: baselineTs,
      current_generated_at: currentTs,
      max_hard_case_ids: 20,
    }),
    enabled: hasValidDiffSelection,
    queryFn: () =>
      observabilityApi.getQuerysetHealthDiff({
        baseline_generated_at: baselineTs,
        current_generated_at: currentTs,
        max_hard_case_ids: 20,
      }),
  })

  const runs = runsQuery.data ?? null
  const diff = diffQuery.data ?? null
  const hasDiffSnapshot = diffQuery.data !== undefined
  const hasRunsSnapshot = runsQuery.data !== undefined
  const loadingRuns = runsQuery.isLoading || runsQuery.isFetching
  const loadingDiff = diffQuery.isLoading || diffQuery.isFetching
  const runsInitialLoading = !hasRunsSnapshot && !runsQuery.error
  const runsInitialError = !hasRunsSnapshot && Boolean(runsQuery.error)
  const runsRefreshing = hasRunsSnapshot && runsQuery.isFetching
  const runsRefreshError = hasRunsSnapshot && Boolean(runsQuery.error)
  const runsErrorMessage = runsQuery.error
    ? formatApiError(
        runsQuery.error,
        '加载检索健康记录失败，请确认当前账号具有管理权限'
      )
    : ''
  const refreshRuns = () => {
    detachPromise(runsQuery.refetch())
  }
  const refreshDiff = () => {
    detachPromise(diffQuery.refetch())
  }

  useEffect(() => {
    const latest = runTimestamps[0] || ''
    const previous = runTimestamps[1] || latest
    setCurrentTs((current) =>
      current && runTimestamps.includes(current) ? current : latest
    )
    setBaselineTs((baseline) =>
      baseline && runTimestamps.includes(baseline) ? baseline : previous
    )
  }, [runTimestamps])

  const runItems = (runs?.items || []).map(querysetRunItem)
  const hasRunItems = runItems.length > 0
  const canCompareRuns = runTimestamps.length >= 2
  const visibleRunItems = showAllRuns ? runItems : runItems.slice(0, 30)
  const latest = runItems[0]
  const latestMetrics = isJsonObject(latest?.metrics) ? latest.metrics : {}
  const latestRisk = isJsonObject(latest?.risk) ? latest.risk : {}
  const latestFlags = Array.isArray(latest?.degradation_flags)
    ? latest?.degradation_flags
    : []

  const chartData = useMemo<QuerysetTrendRow[]>(() => {
    const ts = runs?.timeseries?.ts_ms || []
    const hit = runs?.timeseries?.hit_at_k || []
    const mrr = runs?.timeseries?.mrr || []
    const ndcg = runs?.timeseries?.ndcg_at_k || []
    const p95 = runs?.timeseries?.p95_latency_ms || []
    const miss = runs?.timeseries?.miss_rate || []
    const weak = runs?.timeseries?.weak_hit_rate || []
    const out: QuerysetTrendRow[] = []
    for (let i = 0; i < ts.length; i++) {
      const t = Number(ts[i] || 0)
      out.push({
        t,
        time: formatTs(t),
        dateLabel: formatDateTick(t),
        hit_at_k: hit[i] == null ? null : Number(hit[i] || 0),
        mrr: mrr[i] == null ? null : Number(mrr[i] || 0),
        ndcg_at_k: ndcg[i] == null ? null : Number(ndcg[i] || 0),
        p95_latency_ms: p95[i] == null ? null : Number(p95[i] || 0),
        miss_rate: miss[i] == null ? null : Number(miss[i] || 0),
        weak_hit_rate: weak[i] == null ? null : Number(weak[i] || 0),
      })
    }
    return out
  }, [runs?.timeseries])
  const chartDisplayData = chartData.length
    ? chartData
    : buildQuerysetTrendSkeleton()

  const diffMetricDeltas = useMemo(() => {
    const d = isJsonObject(diff?.diff) ? diff.diff : {}
    const deltas = d.metric_deltas
    return isJsonObject(deltas) ? deltas : {}
  }, [diff?.diff])
  const hasQualityChartData = chartData.some(
    (row) => row.hit_at_k != null || row.mrr != null || row.ndcg_at_k != null
  )
  const hasRiskChartData = chartData.some(
    (row) =>
      row.p95_latency_ms != null ||
      row.miss_rate != null ||
      row.weak_hit_rate != null
  )
  return (
    <div className={cn('space-y-4', embedded ? '' : 'p-4 sm:p-5')}>
      {embedded ? null : (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              检索集健康度
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              跟踪检索质量、响应速度和退化情况。
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={refreshRuns}
            disabled={loadingRuns}
          >
            <RefreshCw
              className={cn(
                'h-4 w-4',
                loadingRuns && 'animate-spin motion-reduce:animate-none'
              )}
            />
            刷新
          </Button>
        </div>
      )}

      {runsInitialLoading ? (
        <Panel
          role="status"
          aria-live="polite"
          padding="sm"
          className="min-h-40 items-center justify-center border-border bg-card text-center"
        >
          <RefreshCw
            className="size-5 animate-spin text-primary motion-reduce:animate-none"
            aria-hidden="true"
          />
          <p className="mt-3 text-sm font-semibold text-foreground">
            正在加载健康记录
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            指标和趋势会在加载完成后显示。
          </p>
        </Panel>
      ) : null}

      {runsInitialError ? (
        <QueryErrorState
          title="健康记录加载失败"
          description={`${runsErrorMessage} 请重新加载后再试。`}
          onRetry={refreshRuns}
          retrying={loadingRuns}
        />
      ) : null}

      {runsRefreshError ? (
        <div
          role="status"
          aria-live="polite"
          className="flex min-w-0 flex-col gap-3 rounded-md border border-warning/25 bg-warning/5 p-3 sm:flex-row sm:items-center"
        >
          <AlertTriangle
            className="size-4 shrink-0 text-warning"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">
              健康记录刷新失败
            </p>
            <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">
              {runsErrorMessage} 当前仍显示上次成功加载的健康记录。
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0 rounded-md"
            onClick={refreshRuns}
            disabled={loadingRuns}
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            重新加载
          </Button>
        </div>
      ) : null}

      {runsRefreshing && !runsRefreshError ? (
        <p
          role="status"
          aria-live="polite"
          className="text-xs text-muted-foreground"
        >
          正在更新健康记录，当前数据仍可查看。
        </p>
      ) : null}

      {hasRunsSnapshot && !hasRunItems ? (
        <Panel
          padding="sm"
          className="min-h-48 items-center justify-center border-border bg-card px-5 text-center"
        >
          <div className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <SearchX className="size-5" aria-hidden="true" />
          </div>
          <h3 className="mt-3 text-sm font-semibold text-foreground">
            {runs?.enabled ? '暂无健康快照' : '还没有健康记录'}
          </h3>
          <p className="mt-1 max-w-[42ch] text-xs leading-5 text-muted-foreground">
            完成一次检索集评测后，这里会显示质量、延迟和退化趋势。
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4 h-8 rounded-md"
            onClick={refreshRuns}
            disabled={loadingRuns}
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            重新加载
          </Button>
        </Panel>
      ) : null}

      {hasRunItems ? (
        <>
          <Panel
            padding="sm"
            className="border-border bg-card"
            aria-busy={runsRefreshing}
          >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-foreground">
              最新快照
            </div>
            {latest?.generated_at ? (
              <div className="mt-1 text-xs text-muted-foreground">
                生成于 {formatSnapshotTimestamp(latest.generated_at)}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-2">
          <StatsGrid dense className="gap-2 xl:grid-cols-6">
            <StatCard
              dense
              icon={Target}
              label="命中率"
              value={fmtPercent(latestMetrics.hit_at_k, 1)}
              color="sky"
            />
            <StatCard
              dense
              icon={TrendingUp}
              label="平均倒数排名"
              value={fmtNum(latestMetrics.mrr, 3)}
              color="teal"
            />
            <StatCard
              dense
              icon={ChartLine}
              label="归一化增益"
              value={fmtNum(latestMetrics.ndcg_at_k, 3)}
              color="teal"
            />
            <StatCard
              dense
              icon={Timer}
              label="P95 延迟"
              value={fmtMs(latestMetrics.p95_latency_ms)}
              color="amber"
            />
            <StatCard
              dense
              icon={SearchX}
              label="漏检率"
              value={fmtPercent(latestRisk.miss_rate, 1)}
              color="rose"
            />
            <StatCard
              dense
              icon={ShieldAlert}
              label="弱命中率"
              value={fmtPercent(latestRisk.weak_hit_rate, 1)}
              color="rose"
            />
          </StatsGrid>

          {latestFlags.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {latestFlags.slice(0, 12).map((f) => (
                <span
                  key={String(f)}
                  className="rounded-md border border-destructive/20 bg-destructive/10 px-2 py-0.5 text-xs text-destructive"
                >
                  {degradationFlagLabel(f)}
                </span>
              ))}
            </div>
          ) : (
            <div className="mt-2 text-xs text-muted-foreground">无退化标记</div>
          )}
        </div>
          </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel
          padding="sm"
          className="min-h-[220px] border-border bg-card"
        >
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div className="text-sm font-semibold text-foreground">
              质量趋势
            </div>
            <div className="text-xs text-muted-foreground">
              命中率、平均倒数排名、归一化增益 · 近 7 天
            </div>
          </div>
          <div className="relative h-[145px]">
            <SafeResponsiveChart className="h-full" minHeight={145}>
              <LineChart data={chartDisplayData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="dateLabel" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} domain={[0, 1]} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="hit_at_k"
                  name="命中率"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="mrr"
                  name="平均倒数排名"
                  stroke="hsl(var(--info))"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="ndcg_at_k"
                  name="归一化增益"
                  stroke="hsl(var(--success))"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </SafeResponsiveChart>
            {hasQualityChartData ? null : <QuerysetChartEmptyState />}
          </div>
        </Panel>

        <Panel
          padding="sm"
          className="min-h-[220px] border-border bg-card"
        >
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div className="text-sm font-semibold text-foreground">
              延迟与风险趋势
            </div>
            <div className="text-xs text-muted-foreground">
              P95 延迟、漏检率、弱命中率 · 近 7 天
            </div>
          </div>
          <div className="relative h-[145px]">
            <SafeResponsiveChart className="h-full" minHeight={145}>
              <LineChart data={chartDisplayData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="dateLabel" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="p95_latency_ms"
                  name="P95 延迟"
                  stroke="hsl(var(--warning))"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="miss_rate"
                  name="漏检率"
                  stroke="hsl(var(--destructive))"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="weak_hit_rate"
                  name="弱命中率"
                  stroke="hsl(var(--info))"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </SafeResponsiveChart>
            {hasRiskChartData ? null : <QuerysetChartEmptyState />}
          </div>
        </Panel>
      </div>

      <Panel
        padding="sm"
        className="border-border bg-card"
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.72fr)]">
          <div>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <GitCompare className="h-4 w-4 text-muted-foreground" />
                <div className="text-sm font-semibold text-foreground">
                  差异对比
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {loadingDiff ? '计算中…' : diff?.diff ? '已加载' : '—'}
              </div>
            </div>

            <div className="mt-2 grid grid-cols-1 gap-2.5 lg:grid-cols-2">
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground">
                  基准快照
                </div>
                <Select
                  value={baselineTs}
                  onValueChange={setBaselineTs}
                  disabled={!canCompareRuns}
                >
                  <SelectTrigger
                    className="h-9 rounded-md"
                    aria-label="基准快照"
                  >
                    <SelectValue placeholder="选择基准快照" />
                  </SelectTrigger>
                  <SelectContent>
                    {runItems.map((it) => (
                      <SelectItem
                        key={String(it.generated_at)}
                        value={String(it.generated_at)}
                      >
                        {formatSnapshotTimestamp(it.generated_at)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground">
                  当前快照
                </div>
                <Select
                  value={currentTs}
                  onValueChange={setCurrentTs}
                  disabled={!canCompareRuns}
                >
                  <SelectTrigger
                    className="h-9 rounded-md"
                    aria-label="当前快照"
                  >
                    <SelectValue placeholder="选择当前快照" />
                  </SelectTrigger>
                  <SelectContent>
                    {runItems.map((it) => (
                      <SelectItem
                        key={String(it.generated_at)}
                        value={String(it.generated_at)}
                      >
                        {formatSnapshotTimestamp(it.generated_at)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {baselineTs && baselineTs === currentTs ? (
              <div className="mt-3 text-xs text-warning">
                {canCompareRuns
                  ? '请选择两个不同的快照进行比较。'
                  : '至少需要两个快照才能比较。'}
              </div>
            ) : null}

            {diffQuery.error ? (
              <div
                role="alert"
                className="mt-3 flex flex-wrap items-center justify-between gap-2 border-y border-destructive/30 py-2.5"
              >
                <span className="text-xs text-destructive">
                  {hasDiffSnapshot
                    ? '差异刷新失败，当前仍显示上次计算结果。'
                    : '无法生成快照差异，请重试。'}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-md"
                  onClick={refreshDiff}
                  disabled={loadingDiff}
                >
                  重新计算
                </Button>
              </div>
            ) : null}

            {diffMetricDeltas && Object.keys(diffMetricDeltas).length ? (
              <div className="mt-3 divide-y divide-border border-y border-border text-xs">
                {QUERYSET_DELTA_METRICS.map((metric) => {
                  const value = diffMetricDeltas[metric.key]
                  const state = deltaState(value, metric.lowerIsBetter)
                  return (
                    <div
                      key={metric.key}
                      className="flex items-center justify-between gap-3 py-2.5"
                    >
                      <span className="font-medium text-muted-foreground">
                        {metric.label}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="font-mono tabular-nums text-foreground/90">
                          {formatSignedDelta(value, metric.kind)}
                        </span>
                        <span
                          className={cn(
                            'rounded-md px-2 py-0.5 text-xs font-semibold',
                            state.className
                          )}
                        >
                          {state.label}
                        </span>
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : null}
          </div>

          <div className="border-t border-border pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
            <div>
              <div className="text-sm font-semibold text-foreground">
                指标说明
              </div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">
                命中率、平均倒数排名和归一化增益上升表示改善；P95
                延迟、漏检率和弱命中率下降表示改善。请只比较评测配置相同的快照。
              </div>
            </div>
          </div>
        </div>
      </Panel>

      <Panel
        padding="sm"
        className="border-border bg-card"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-foreground">
              最近运行
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              共 {runs?.items?.length ?? 0} 条，按时间倒序排列
            </div>
          </div>
          {runItems.length > 30 ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-md border-border px-2 text-xs"
              aria-expanded={showAllRuns}
              onClick={() => setShowAllRuns((showAll) => !showAll)}
            >
              {showAllRuns ? '收起' : '查看全部'}
            </Button>
          ) : null}
        </div>

        <div className="mt-3 divide-y divide-border border-y border-border md:hidden">
          {visibleRunItems.length ? (
            visibleRunItems.map((item) => {
              const display = querysetRunDisplay(item)
              return (
                <article key={String(item.generated_at)} className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-muted-foreground">
                      {display.generatedAt}
                    </span>
                    <span className={cn('text-xs font-medium', display.status.className)}>
                      {display.status.label}
                    </span>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                    <div>
                      <dt className="text-muted-foreground">命中率</dt>
                      <dd className="mt-1 font-medium tabular-nums text-foreground">
                        {display.hitRate}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">平均倒数排名</dt>
                      <dd className="mt-1 font-medium tabular-nums text-foreground">
                        {display.mrr}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">归一化增益</dt>
                      <dd className="mt-1 font-medium tabular-nums text-foreground">
                        {display.ndcg}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">P95 延迟</dt>
                      <dd className="mt-1 font-medium tabular-nums text-foreground">
                        {display.latency}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">漏检率</dt>
                      <dd className="mt-1 font-medium tabular-nums text-foreground">
                        {display.missRate}
                      </dd>
                    </div>
                  </dl>
                </article>
              )
            })
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">
              暂无运行记录，完成评测后会显示在这里。
            </div>
          )}
        </div>

        <div className="mt-3 hidden max-h-[320px] overflow-auto md:block">
          <table
            aria-label="检索集健康度指标列表"
            className="min-w-[720px] w-full text-sm"
          >
            <thead>
              <tr className="border-b border-border/60 text-xs text-muted-foreground">
                <th className="text-left py-2 pr-4">生成时间</th>
                <th className="text-left py-2 pr-4">状态</th>
                <th className="text-right py-2 pr-4">命中率</th>
                <th className="text-right py-2 pr-4">平均倒数排名</th>
                <th className="text-right py-2 pr-4">归一化增益</th>
                <th className="text-right py-2 pr-4">P95 延迟</th>
                <th className="text-right py-2 pr-4">漏检率</th>
              </tr>
            </thead>
            <tbody>
              {runItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-4 text-center">
                    <div className="mx-auto flex w-fit flex-col items-center text-muted-foreground">
                      <div className="mb-2 flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                      </div>
                      <div className="text-sm font-medium text-muted-foreground">
                        暂无运行记录
                      </div>
                      <div className="mt-0.5 text-xs">
                        运行评测后结果将在此显示
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                visibleRunItems.map((item) => {
                  const display = querysetRunDisplay(item)
                  return (
                    <tr
                      key={String(item.generated_at)}
                      className="border-b border-border/40"
                    >
                      <td className="py-2 pr-4 text-xs text-muted-foreground">
                        {display.generatedAt}
                      </td>
                      <td
                        className={cn(
                          'py-2 pr-4 text-xs font-medium',
                          display.status.className
                        )}
                      >
                        {display.status.label}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {display.hitRate}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {display.mrr}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {display.ndcg}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {display.latency}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {display.missRate}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
          </Panel>
        </>
      ) : null}
    </div>
  )
}
