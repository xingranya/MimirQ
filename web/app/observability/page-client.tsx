'use client'

import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AppFrame } from '@/components/app-frame'
import { PageScaffold } from '@/components/ui/page-scaffold'
import { Panel } from '@/components/ui/panel'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SafeResponsiveChart } from '@/components/ui/safe-responsive-chart'
import { StatCard, StatsGrid } from '@/components/ui/stats-card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { observabilityApi } from '@/lib/api'
import { formatApiError } from '@/lib/api-errors'
import { toTrimmedPrimitiveString } from '@/lib/primitive-text'
import { cn, detachPromise } from '@/lib/utils'
import { toast } from 'sonner'
import { ObservabilityOpsPanel } from '@/components/observability/observability-ops-panel'
import {
  BarChart3,
  RefreshCw,
  AlertTriangle,
  Timer,
  Quote,
  Zap,
  Hash,
  SearchX,
  TriangleAlert,
  Copy,
} from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar } from 'recharts'

const WINDOW_PRESETS = [
    { label: '15 分钟', value: 15 },
    { label: '1 小时', value: 60 },
    { label: '4 小时', value: 240 },
    { label: '24 小时', value: 1440 },
]

const SLOW_PRESETS = [
    { label: '≥ 1 秒', value: 1 },
    { label: '≥ 2 秒', value: 2 },
    { label: '≥ 5 秒', value: 5 },
]

const METRIC_VALUE_LABELS: Record<string, string> = {
  bm25: '关键词检索',
  dense: '向量检索',
  hybrid: '混合检索',
  keyword: '关键词命中',
  sparse: '稀疏检索',
  vector: '向量命中',
}

type AnalyticsChartPoint = {
  t: number
  time: string
  requests: number
  zero_hit: number
  slow: number
  errors: number
  zero_hit_rate: number | null
  slow_rate: number | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function queryCountItem(value: unknown): { query_hash: string; count: number } {
  const item = isRecord(value) ? value : {}
  return {
    query_hash: toTrimmedPrimitiveString(item.query_hash),
    count: Number(item.count || 0),
  }
}

function slowQueryItem(value: unknown): {
  query_hash: string
  count: number
  max_elapsed_sec: number | null
} {
  const item = isRecord(value) ? value : {}
  return {
    query_hash: toTrimmedPrimitiveString(item.query_hash),
    count: Number(item.count || 0),
    max_elapsed_sec: item.max_elapsed_sec == null ? null : Number(item.max_elapsed_sec),
  }
}

function formatTs(tsMs: number) {
  try {
    return new Date(tsMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return String(tsMs)
  }
}

function fmtPercent(v?: number | null, digits = 1) {
  if (v == null || !Number.isFinite(Number(v))) return '—'
  return `${(Number(v) * 100).toFixed(digits)}%`
}

function fmtSec(v?: number | null, digits = 3) {
  if (v == null || !Number.isFinite(Number(v))) return '—'
  return `${Number(v).toFixed(digits)} 秒`
}

function MetricBreakdown({
  data,
}: Readonly<{
  data: Record<string, number> | null | undefined
}>) {
  const entries = Object.entries(data || {}).sort(
    (left, right) => Number(right[1] || 0) - Number(left[1] || 0)
  )

  if (!entries.length) {
    return <p className="text-xs text-muted-foreground">暂无数据</p>
  }

  return (
    <dl className="divide-y divide-border text-xs">
      {entries.map(([key, value]) => (
        <div key={key} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
          <dt className="truncate text-muted-foreground" title={key}>
            {METRIC_VALUE_LABELS[key] || key}
          </dt>
          <dd className="font-medium text-foreground tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function shortHash(value: string, opts?: { head?: number; tail?: number }) {
  const v = String(value || '').trim()
  if (!v) return ''
  const head = Math.max(1, Number(opts?.head ?? 8) || 8)
  const tail = Math.max(0, Number(opts?.tail ?? 4) || 4)
  if (v.length <= head + tail + 1) return v
  return `${v.slice(0, head)}...${v.slice(-tail)}`
}

async function copyText(text: string, okMsg: string) {
  const value = (text || '').trim()
  if (!value) return
  try {
    await navigator.clipboard.writeText(value)
    toast.success(okMsg)
  } catch {
    toast.error('复制失败')
  }
}

export default function ObservabilityPage() {
  const [tab, setTab] = useState<'summary' | 'query_analytics'>('summary')
  const [windowMinutes, setWindowMinutes] = useState<number>(60)
  const [slowThresholdSec, setSlowThresholdSec] = useState<number>(2)

  const summaryQuery = useQuery({
    queryKey: ['observability', 'summary', windowMinutes],
    queryFn: () => observabilityApi.getRagMetricsSummary({ window_minutes: windowMinutes }),
    enabled: tab === 'summary',
    placeholderData: keepPreviousData,
  })

  const analyticsQuery = useQuery({
    queryKey: ['observability', 'query_analytics', windowMinutes, slowThresholdSec],
    queryFn: () =>
      observabilityApi.getRagQueryAnalytics({
        window_minutes: windowMinutes,
        slow_threshold_sec: slowThresholdSec,
      }),
    enabled: tab === 'query_analytics',
    placeholderData: keepPreviousData,
  })

  const summary = summaryQuery.data ?? null
  const analytics = analyticsQuery.data ?? null
  const loadingSummary = summaryQuery.isFetching
  const loadingAnalytics = analyticsQuery.isFetching
  const loading = tab === 'summary' ? loadingSummary : loadingAnalytics

  useEffect(() => {
    if (!summaryQuery.error) return
    toast.error(formatApiError(summaryQuery.error, '加载监控数据失败'))
  }, [summaryQuery.error, summaryQuery.errorUpdatedAt])

  useEffect(() => {
    if (!analyticsQuery.error) return
    toast.error(formatApiError(analyticsQuery.error, '加载查询分析失败'))
  }, [analyticsQuery.error, analyticsQuery.errorUpdatedAt])

  const chartData = useMemo(() => {
    if (!summary?.timeseries) return []
    const ts = summary.timeseries.ts_ms || []
    const ragTrace = summary.timeseries.rag_trace || []
    const rerankerApi = summary.timeseries.reranker_api || []
    const retrievalAvg = summary.timeseries.retrieval_avg_elapsed_sec || []
    const out = []
    for (let i = 0; i < ts.length; i++) {
      const t = Number(ts[i] || 0)
      out.push({
        t,
        time: formatTs(t),
        rag_trace: Number(ragTrace[i] || 0),
        reranker_api: Number(rerankerApi[i] || 0),
        retrieval_avg_elapsed_sec:
          retrievalAvg[i] == null ? null : Number(retrievalAvg[i] || 0),
      })
    }
    return out
  }, [summary?.timeseries])

  const topErrors = useMemo(() => {
    const raw: Record<string, number> = summary?.error_counts ?? {}
    const entries = Object.entries(raw).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    return entries.slice(0, 8)
  }, [summary?.error_counts])

  const analyticsChartData = useMemo(() => {
    if (!analytics?.timeseries) return []
    const ts = analytics.timeseries.ts_ms || []
    const requests = analytics.timeseries.requests || []
    const zeroHit = analytics.timeseries.zero_hit || []
    const slow = analytics.timeseries.slow || []
    const errors = analytics.timeseries.errors || []
    const out: AnalyticsChartPoint[] = []
    for (let i = 0; i < ts.length; i++) {
      const t = Number(ts[i] || 0)
      const req = Number(requests[i] || 0)
      const zh = Number(zeroHit[i] || 0)
      const sl = Number(slow[i] || 0)
      const er = Number(errors[i] || 0)
      out.push({
        t,
        time: formatTs(t),
        requests: req,
        zero_hit: zh,
        slow: sl,
        errors: er,
        zero_hit_rate: req > 0 ? zh / req : null,
        slow_rate: req > 0 ? sl / req : null,
      })
    }
    return out
  }, [analytics?.timeseries])

  const topErrorKinds = useMemo(() => {
    const raw: Record<string, number> = analytics?.error_kind_counts ?? {}
    const entries = Object.entries(raw).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    return entries.slice(0, 8)
  }, [analytics?.error_kind_counts])

  const topZeroHits = useMemo(() => {
    const raw = Array.isArray(analytics?.top_zero_hit_queries) ? analytics?.top_zero_hit_queries : []
    return raw
      .map(queryCountItem)
      .filter((it) => it.query_hash && Number.isFinite(it.count))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20)
  }, [analytics?.top_zero_hit_queries])

  const topSlowQueries = useMemo(() => {
    const raw = Array.isArray(analytics?.top_slow_queries) ? analytics?.top_slow_queries : []
    return raw
      .map(slowQueryItem)
      .filter((it) => it.query_hash && Number.isFinite(it.count))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20)
  }, [analytics?.top_slow_queries])

  return (
    <AppFrame>
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <PageScaffold
          title="检索监控"
          description="查看检索、重排、引用和查询质量的运行情况。"
          icon={BarChart3}
          iconColor="text-info"
          size="7xl"
          actions={
            <Button asChild size="sm" variant="outline" className="h-9 rounded-md">
              <Link href="/settings">监控设置</Link>
            </Button>
          }
        >
          <ObservabilityOpsPanel />

          <div className="mb-4 flex flex-col gap-3 border-y border-border py-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">时间范围</div>
              <div className="w-full sm:w-[140px]">
                <Select
                  value={String(windowMinutes)}
                  onValueChange={(v) => {
                    const next = Number.parseInt(v, 10)
                    setWindowMinutes(next)
                  }}
                >
                  <SelectTrigger className="h-9 rounded-md" aria-label="选择时间范围">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WINDOW_PRESETS.map((p) => (
                      <SelectItem key={p.value} value={String(p.value)}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {tab === 'query_analytics' ? (
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground">慢查询标准</div>
                <div className="w-full sm:w-[120px]">
                  <Select
                    value={String(slowThresholdSec)}
                    onValueChange={(v) => {
                      const next = Number(v)
                      setSlowThresholdSec(next)
                    }}
                  >
                    <SelectTrigger className="h-9 rounded-md" aria-label="选择慢查询标准">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SLOW_PRESETS.map((p) => (
                        <SelectItem key={p.value} value={String(p.value)}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              className="h-9 gap-2 rounded-md"
              onClick={() => {
                if (tab === 'summary') summaryQuery.refetch()
                else analyticsQuery.refetch()
              }}
              disabled={loading}
            >
              <RefreshCw className={cn('size-4', loading && 'animate-spin motion-reduce:animate-none')} />
              刷新数据
            </Button>
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="space-y-4">
            <TabsList className="rounded-md bg-muted/40">
              <TabsTrigger value="summary" className="rounded-sm text-xs">
                运行概览
              </TabsTrigger>
              <TabsTrigger value="query_analytics" className="rounded-sm text-xs">
                查询分析
              </TabsTrigger>
            </TabsList>

            <TabsContent value="summary">
              {summary ? (
                <div className="space-y-6">
                  {!summary.enabled && (
                    <Alert className="mt-4">
                      <AlertTriangle className="size-4" />
                      <AlertTitle>指标记录尚未开启</AlertTitle>
                      <AlertDescription>
                        当前可能只显示少量历史数据。请前往“设置 → 观测与调试”开启指标记录。
                      </AlertDescription>
                    </Alert>
                  )}

                  {summary.truncated && (
                    <Alert className="mt-4">
                      <AlertTriangle className="size-4" />
                      <AlertTitle>数据可能不完整</AlertTitle>
                      <AlertDescription>
                        当前时间范围内的数据量较大，本页仅加载了最近一部分。可缩短时间范围后重试。
                      </AlertDescription>
                    </Alert>
                  )}

                  <StatsGrid className="mt-2">
                    <StatCard
                      icon={Zap}
                      label="检索请求"
                      value={summary.rag_trace_count}
                      subValue={`${summary.window_minutes} 分钟`}
                      color="sky"
                    />
                    <StatCard
                      icon={Timer}
                      label="检索平均耗时"
                      value={summary.retrieval_avg_elapsed_sec == null ? '-' : `${summary.retrieval_avg_elapsed_sec.toFixed(3)} 秒`}
                      subValue={summary.retrieval_p95_elapsed_sec == null ? undefined : `P95 ${summary.retrieval_p95_elapsed_sec.toFixed(3)} 秒`}
                      color="teal"
                    />
                    <StatCard
                      icon={Timer}
                      label="重排平均耗时"
                      value={summary.rerank_avg_elapsed_sec == null ? '-' : `${summary.rerank_avg_elapsed_sec.toFixed(3)} 秒`}
                      subValue={`${summary.reranker_api_count} 次重排`}
                      color="amber"
                    />
                    <StatCard
                      icon={Quote}
                      label="平均引用数"
                      value={summary.citations_avg_count == null ? '-' : summary.citations_avg_count.toFixed(2)}
                      subValue="每次回答"
                      color="green"
                    />
                  </StatsGrid>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Panel padding="lg" className="min-h-[320px]">
                      <div className="flex items-center justify-between mb-4">
                        <div className="text-sm font-semibold text-foreground">检索请求量</div>
                        <div className="text-xs text-muted-foreground">按分钟聚合</div>
                      </div>
                      <SafeResponsiveChart className="h-[260px]" minHeight={260}>
                        <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                          <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                          <Tooltip />
                          <Bar dataKey="rag_trace" fill="hsl(var(--primary))" opacity={0.85} />
                        </BarChart>
                      </SafeResponsiveChart>
                    </Panel>

                    <Panel padding="lg" className="min-h-[320px]">
                      <div className="flex items-center justify-between mb-4">
                        <div className="text-sm font-semibold text-foreground">检索平均耗时</div>
                        <div className="text-xs text-muted-foreground">每分钟均值</div>
                      </div>
                      <SafeResponsiveChart className="h-[260px]" minHeight={260}>
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                          <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip />
                          <Line
                            type="monotone"
                            dataKey="retrieval_avg_elapsed_sec"
                            stroke="hsl(var(--info))"
                            strokeWidth={2}
                            dot={false}
                          />
                        </LineChart>
                      </SafeResponsiveChart>
                    </Panel>
                  </div>

                  <Panel padding="lg" variant="muted">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      <div>
                        <div className="text-sm font-semibold text-foreground mb-2">检索模式分布</div>
                        <MetricBreakdown data={summary.retrieval_mode_counts} />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-foreground mb-2">命中类型分布</div>
                        <MetricBreakdown data={summary.hit_type_counts} />
                      </div>
                      <div>
                        <div className="mb-2 text-sm font-semibold text-foreground">常见错误</div>
                        {topErrors.length ? (
                          <div className="space-y-2">
                            {topErrors.map(([k, v]) => (
                              <div key={k} className="flex items-center justify-between gap-3 text-xs">
                                <span className="font-mono text-muted-foreground truncate" title={k}>
                                  {k}
                                </span>
                                <span className="text-muted-foreground tabular-nums">{v}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground">无错误</div>
                        )}
                      </div>
                    </div>
                  </Panel>
                </div>
              ) : (
                <Alert variant="destructive" className="mt-4">
                  <AlertTriangle className="size-4" />
                  <AlertTitle>无法加载监控数据</AlertTitle>
                  <AlertDescription>
                    请确认当前账号有查看检索监控的权限，然后刷新重试。
                  </AlertDescription>
                </Alert>
              )}
            </TabsContent>

            <TabsContent value="query_analytics">
              {(() => {
    if (loadingAnalytics && !analytics) {
        return (<div className="space-y-6">
                  <StatsGrid className="mt-2">
                    {['stat-1', 'stat-2', 'stat-3', 'stat-4', 'stat-5'].map((key) => (<div key={key} className="rounded-md border border-border bg-muted/20 px-4 py-3">
                        <Skeleton className="h-3 w-28"/>
                        <Skeleton className="mt-2 h-6 w-24"/>
                        <Skeleton className="mt-2 h-3 w-20"/>
                      </div>))}
                  </StatsGrid>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Panel padding="lg" className="min-h-[320px]">
                      <Skeleton className="h-4 w-48"/>
                      <Skeleton className="mt-3 h-[260px] w-full"/>
                    </Panel>
                    <Panel padding="lg" className="min-h-[320px]">
                      <Skeleton className="h-4 w-56"/>
                      <Skeleton className="mt-3 h-[260px] w-full"/>
                    </Panel>
                  </div>
                </div>);
    }
    else if (analytics) {
            if (analytics.enabled) {
                if (analytics.rag_trace_count <= 0) {
                    return (<EmptyState title="暂无查询分析数据" description="发起一次使用知识检索的对话后，再刷新本页查看统计。" icon={TriangleAlert} iconClassName="text-info">
                  <Button variant="outline" className="rounded-md" onClick={() => analyticsQuery.refetch()} disabled={loadingAnalytics}>
                    <RefreshCw className={cn('size-4', loadingAnalytics && 'animate-spin motion-reduce:animate-none')}/>
                    刷新
                  </Button>
                </EmptyState>);
                }
                else {
                    return (<div className="space-y-6">
                  {analytics.truncated ? (<Alert className="mt-4">
                      <AlertTriangle className="size-4"/>
                      <AlertTitle>数据可能不完整</AlertTitle>
                      <AlertDescription>
                        当前时间范围内的数据量较大，本页仅加载了最近一部分。可缩短时间范围后重试。
                      </AlertDescription>
                    </Alert>) : null}

                  <StatsGrid className="mt-2">
                    <StatCard icon={Zap} label="检索请求" value={analytics.rag_trace_count} subValue={`${analytics.window_minutes} 分钟`} color="sky"/>
                    <StatCard icon={Hash} label="不同查询" value={analytics.unique_query_hashes} subValue="按查询指纹去重" color="teal"/>
                    <StatCard icon={SearchX} label="零命中率" value={fmtPercent(analytics.zero_hit_rate)} subValue={`${analytics.zero_hit_count} 次未找到引用`} color="amber"/>
                    <StatCard icon={Timer} label="慢查询率" value={fmtPercent(analytics.slow_rate)} subValue={`${analytics.slow_count} 次超过 ${analytics.slow_threshold_sec} 秒`} color="orange"/>
                    <StatCard icon={Timer} label="检索耗时 P95 / P99" value={`${fmtSec(analytics.retrieval_p95_elapsed_sec, 3)} · ${fmtSec(analytics.retrieval_p99_elapsed_sec, 3)}`} subValue={`中位数 ${fmtSec(analytics.retrieval_p50_elapsed_sec, 3)}`} color="green"/>
                  </StatsGrid>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Panel padding="lg" className="min-h-[320px]">
                      <div className="flex items-center justify-between mb-4">
                        <div className="text-sm font-semibold text-foreground">零命中率与慢查询率</div>
                        <div className="text-xs text-muted-foreground">按分钟聚合</div>
                      </div>
                      <SafeResponsiveChart className="h-[260px]" minHeight={260}>
                        <LineChart data={analyticsChartData}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.2}/>
                          <XAxis dataKey="time" tick={{ fontSize: 10 }}/>
                          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${Math.round(Number(v || 0) * 100)}%`} domain={[0, 1]}/>
                          <Tooltip formatter={(v: unknown, name: unknown) => {
                            const label = toTrimmedPrimitiveString(name)
                            if (label === '零命中率' || label === '慢查询率')
                                return [fmtPercent(Number(v), 2), label];
                            return [toTrimmedPrimitiveString(v), label];
                        }}/>
                          <Line type="monotone" dataKey="zero_hit_rate" name="零命中率" stroke="hsl(var(--warning))" strokeWidth={2} dot={false}/>
                          <Line type="monotone" dataKey="slow_rate" name="慢查询率" stroke="hsl(var(--info))" strokeWidth={2} dot={false}/>
                        </LineChart>
                      </SafeResponsiveChart>
                    </Panel>

                    <Panel padding="lg" className="min-h-[320px]">
                      <div className="flex items-center justify-between mb-4">
                        <div className="text-sm font-semibold text-foreground">请求、零命中、慢查询与错误数量</div>
                        <div className="text-xs text-muted-foreground">按分钟聚合</div>
                      </div>
                      <SafeResponsiveChart className="h-[260px]" minHeight={260}>
                        <LineChart data={analyticsChartData}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.2}/>
                          <XAxis dataKey="time" tick={{ fontSize: 10 }}/>
                          <YAxis tick={{ fontSize: 10 }} allowDecimals={false}/>
                          <Tooltip />
                          <Line type="monotone" dataKey="requests" name="请求" stroke="hsl(var(--muted-foreground))" strokeWidth={2} dot={false}/>
                          <Line type="monotone" dataKey="zero_hit" name="零命中" stroke="hsl(var(--warning))" strokeWidth={2} dot={false}/>
                          <Line type="monotone" dataKey="slow" name="慢查询" stroke="hsl(var(--info))" strokeWidth={2} dot={false}/>
                          <Line type="monotone" dataKey="errors" name="错误" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false}/>
                        </LineChart>
                      </SafeResponsiveChart>
                    </Panel>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <Panel padding="lg" className="overflow-hidden">
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div className="text-sm font-semibold text-foreground">高频零命中查询</div>
                        <div className="text-xs text-muted-foreground tabular-nums">{topZeroHits.length} 项</div>
                      </div>
                      {topZeroHits.length ? (<div className="divide-y divide-border overflow-hidden rounded-md border border-border">
                          {topZeroHits.map((it) => (<div key={it.query_hash} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                              <div className="min-w-0">
                                <div className="font-mono text-muted-foreground truncate" title={it.query_hash}>
                                  {shortHash(it.query_hash, { head: 10, tail: 6 })}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <div className="tabular-nums text-muted-foreground">{it.count}</div>
                                <Button size="icon" variant="ghost" className="size-8 rounded-md" aria-label="复制查询指纹" title="复制查询指纹" onClick={() => detachPromise(copyText(it.query_hash, '查询指纹已复制'))}>
                                  <Copy className="size-4"/>
                                </Button>
                              </div>
                            </div>))}
                        </div>) : (<div className="text-xs text-muted-foreground">暂无零命中记录</div>)}
                    </Panel>

                    <Panel padding="lg" className="overflow-hidden">
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div className="text-sm font-semibold text-foreground">高频慢查询</div>
                        <div className="text-xs text-muted-foreground tabular-nums">{topSlowQueries.length} 项</div>
                      </div>
                      {topSlowQueries.length ? (<div className="divide-y divide-border overflow-hidden rounded-md border border-border">
                          {topSlowQueries.map((it) => (<div key={it.query_hash} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                              <div className="min-w-0">
                                <div className="font-mono text-muted-foreground truncate" title={it.query_hash}>
                                  {shortHash(it.query_hash, { head: 10, tail: 6 })}
                                </div>
                                <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                                  最长 {it.max_elapsed_sec != null && Number.isFinite(Number(it.max_elapsed_sec)) ? `${Number(it.max_elapsed_sec).toFixed(3)} 秒` : '—'}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <div className="tabular-nums text-muted-foreground">{it.count}</div>
                                <Button size="icon" variant="ghost" className="size-8 rounded-md" aria-label="复制查询指纹" title="复制查询指纹" onClick={() => detachPromise(copyText(it.query_hash, '查询指纹已复制'))}>
                                  <Copy className="size-4"/>
                                </Button>
                              </div>
                            </div>))}
                        </div>) : (<div className="text-xs text-muted-foreground">暂无慢查询记录</div>)}
                    </Panel>

                    <Panel padding="lg" variant="muted">
                      <div className="mb-3 text-sm font-semibold text-foreground">常见错误类型</div>
                      {topErrorKinds.length ? (<div className="space-y-2">
                          {topErrorKinds.map(([k, v]) => (<div key={k} className="flex items-center justify-between gap-3 text-xs">
                              <span className="font-mono text-muted-foreground truncate" title={k}>
                                {k}
                              </span>
                              <span className="text-muted-foreground tabular-nums">{v}</span>
                            </div>))}
                        </div>) : (<div className="text-xs text-muted-foreground">无错误</div>)}
                    </Panel>
                  </div>
                </div>);
                }
            }
            else {
                return (<Alert className="mt-4">
                  <AlertTriangle className="size-4"/>
                  <AlertTitle>指标记录尚未开启</AlertTitle>
                  <AlertDescription>
                    开启指标记录后，系统才会统计查询命中率、慢查询和错误情况。
                  </AlertDescription>
                </Alert>);
            }
        }
        else {
            return (<Alert variant="destructive" className="mt-4">
                  <AlertTriangle className="size-4"/>
                   <AlertTitle>无法加载查询分析</AlertTitle>
                   <AlertDescription>
                     请确认当前账号有查看检索监控的权限，然后刷新重试。
                   </AlertDescription>
                </Alert>);
        }
})()}
            </TabsContent>
          </Tabs>
        </PageScaffold>
      </div>
    </AppFrame>
  )
}
