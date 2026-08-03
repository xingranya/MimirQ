'use client'

import { CircleDot, Gauge } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { RegressionRun } from '@/types'

type ParetoPoint = {
  id: string
  metric: number
  latency: number
  x: number
  y: number
  pareto: boolean
}
type ParetoCandidate = Pick<ParetoPoint, 'id' | 'metric' | 'latency'>

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function toNumber(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function metricValue(run: RegressionRun, metricKey: string): number | null {
  const summary = asRecord(run.summary)
  const candidates = [
    summary[metricKey],
    asRecord(summary.metrics)[metricKey],
    asRecord(summary.metric_values)[metricKey],
    asRecord(summary.retrieval_metrics)[metricKey],
    asRecord(summary.aggregate_metrics)[metricKey],
  ]

  for (const candidate of candidates) {
    const n = toNumber(candidate)
    if (n !== null) return n
  }
  return null
}

function latency(run: RegressionRun): number | null {
  const summary = asRecord(run.summary)
  const candidates = [summary.latency_ms, summary.elapsed_ms, summary.duration_ms, summary.p95_latency_ms, summary.elapsed_sec]

  for (const candidate of candidates) {
    const n = toNumber(candidate)
    if (n === null) continue
    return candidate === summary.elapsed_sec && n < 1000 ? n * 1000 : n
  }
  return null
}

function isParetoCandidate(point: ParetoCandidate, points: ParetoCandidate[]): boolean {
  return !points.some((other) => {
    if (other.id === point.id) return false
    const dominates = other.metric >= point.metric && other.latency <= point.latency
    const strictlyBetter = other.metric > point.metric || other.latency < point.latency
    return dominates && strictlyBetter
  })
}

function shortId(value: string): string {
  return value ? `${value.slice(0, 8)}…` : '-'
}

function formatMetric(value: number): string {
  return value.toFixed(4)
}

function formatLatency(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(2)}s`
  return `${Math.round(value)}ms`
}

function metricLabel(key: string): string {
  const labels: Record<string, string> = {
    retrieval_recall: '召回率',
    retrieval_mrr: 'MRR',
    retrieval_ndcg_at_10: 'NDCG@10',
    retrieval_hit_at_20: '命中率@20',
  }
  return labels[key] || key.replaceAll('_', ' ')
}

export function AblationParetoPanel({
  runs,
  metricKey,
}: Readonly<{
  runs: RegressionRun[]
  metricKey: string
}>) {
  const rawPoints = runs
    .filter((run) => String(run.status || '') === 'completed')
    .map((run) => {
      const metric = metricValue(run, metricKey)
      const runLatency = latency(run)
      if (metric === null || runLatency === null) return null
      return { id: run.id, metric, latency: runLatency }
    })
    .filter((point): point is Pick<ParetoPoint, 'id' | 'metric' | 'latency'> => point !== null)

  const minMetric = rawPoints.length ? Math.min(...rawPoints.map((point) => point.metric)) : 0
  const maxMetric = rawPoints.length ? Math.max(...rawPoints.map((point) => point.metric)) : 1
  const minLatency = rawPoints.length ? Math.min(...rawPoints.map((point) => point.latency)) : 0
  const maxLatency = rawPoints.length ? Math.max(...rawPoints.map((point) => point.latency)) : 1
  const metricRange = maxMetric - minMetric || 1
  const latencyRange = maxLatency - minLatency || 1

  const points: ParetoPoint[] = rawPoints.map((point) => ({
    ...point,
    x: 8 + ((point.metric - minMetric) / metricRange) * 84,
    y: 8 + ((point.latency - minLatency) / latencyRange) * 84,
    pareto: isParetoCandidate(point, rawPoints),
  }))

  const paretoPoints = points.filter((point) => point.pareto).sort((a, b) => a.metric - b.metric)

  return (
    <section className="rounded-md border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <CircleDot className="size-4 text-primary" />
            效率前沿
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            横轴是 {metricLabel(metricKey)}，纵轴是响应延迟。高分且低延迟的运行会标为优选候选。
          </p>
        </div>
        <span className="rounded-md border border-border bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
          优选候选 {paretoPoints.length || 0} 个
        </span>
      </div>

      {points.length ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
          <div className="min-w-0">
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>响应延迟越低越靠上</span>
              <span>{metricLabel(metricKey)} 越高越靠右</span>
            </div>
            <div className="relative aspect-[16/9] min-h-64 overflow-hidden rounded-md border border-border bg-background">
              <div className="absolute inset-x-8 top-1/2 h-px bg-border/70" />
              <div className="absolute inset-y-8 left-1/2 w-px bg-border/70" />
              {paretoPoints.length > 1 ? (
                <svg
                  className="pointer-events-none absolute inset-0 h-full w-full"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <polyline
                    fill="none"
                    stroke="hsl(var(--primary) / 0.55)"
                    strokeDasharray="5 5"
                    strokeWidth="2"
                    points={paretoPoints.map((point) => `${point.x},${point.y}`).join(' ')}
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              ) : null}
              {points.map((point) => (
                <div
                  key={point.id}
                  className={cn(
                    'absolute -translate-x-1/2 -translate-y-1/2 rounded-full border',
                    point.pareto
                      ? 'size-4 border-primary bg-primary ring-4 ring-primary/20'
                      : 'size-3 border-border bg-muted-foreground/70'
                  )}
                  style={{ left: `${point.x}%`, top: `${point.y}%` }}
                  title={`${shortId(point.id)} ${metricLabel(metricKey)} ${formatMetric(point.metric)}，延迟 ${formatLatency(point.latency)}`}
                />
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {metricLabel(metricKey)} {formatMetric(minMetric)}
              </span>
              <span>{formatMetric(maxMetric)}</span>
            </div>
          </div>

          <div className="border-t border-border pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <Gauge className="size-4 text-primary" />
              优选运行
            </div>
            <div className="mt-3 divide-y divide-border border-y border-border">
              {paretoPoints.slice(0, 6).map((point) => (
                <div key={point.id} className="py-2 text-xs">
                  <div className="font-mono font-semibold text-foreground">{shortId(point.id)}</div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{metricLabel(metricKey)}</span>
                    <span className="font-mono text-foreground">{formatMetric(point.metric)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>响应延迟</span>
                    <span className="font-mono text-foreground">{formatLatency(point.latency)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-3 border-y border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
          暂无同时包含 {metricLabel(metricKey)} 和响应延迟的已完成评测。
        </div>
      )}
    </section>
  )
}
