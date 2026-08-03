'use client'

import { GitCompareArrows } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { RegressionRun } from '@/types'

const METRIC_LABELS: Record<string, string> = {
  retrieval_mrr: 'MRR',
  retrieval_ndcg: 'NDCG',
  retrieval_recall: '召回率',
  recall_at_k: '召回率',
  precision_at_k: '准确率',
  hit_rate: '命中率',
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function metricValue(run: RegressionRun, key: string): number | null {
  const summary = asRecord(run.summary)
  const candidates = [
    summary[key],
    asRecord(summary.metrics)[key],
    asRecord(summary.metric_values)[key],
    asRecord(summary.retrieval_metrics)[key],
    asRecord(summary.aggregate_metrics)[key],
  ]
  for (const item of candidates) {
    const value = Number(item)
    if (Number.isFinite(value)) return value
  }
  return null
}

function latency(run: RegressionRun): number | null {
  const summary = asRecord(run.summary)
  const candidates = [
    summary.latency_ms,
    summary.elapsed_ms,
    summary.duration_ms,
    summary.elapsed_sec,
  ]
  for (const item of candidates) {
    const value = Number(item)
    if (Number.isFinite(value)) {
      return String(item).includes('.') && value < 1000 ? value * 1000 : value
    }
  }
  return null
}

function isPareto(
  run: RegressionRun,
  runs: RegressionRun[],
  metricKey: string
): boolean {
  const ownMetric = metricValue(run, metricKey)
  const ownLatency = latency(run)
  if (ownMetric === null || ownLatency === null) return false
  return !runs.some((other) => {
    if (other.id === run.id) return false
    const otherMetric = metricValue(other, metricKey)
    const otherLatency = latency(other)
    if (otherMetric === null || otherLatency === null) return false
    return (
      otherMetric >= ownMetric &&
      otherLatency <= ownLatency &&
      (otherMetric > ownMetric || otherLatency < ownLatency)
    )
  })
}

function shortId(value: string): string {
  return value ? `${value.slice(0, 8)}…` : '-'
}

function metricLabel(key: string): string {
  return METRIC_LABELS[key] || key.replaceAll('_', ' ')
}

export function AblationComparisonMatrix({
  runs,
  baseRunId,
  metricKeys,
}: Readonly<{
  runs: RegressionRun[]
  baseRunId: string
  metricKeys: string[]
}>) {
  const completed = runs
    .filter((run) => String(run.status || '') === 'completed')
    .slice(0, 8)
  const base =
    completed.find((run) => run.id === baseRunId) ?? completed[0] ?? null
  const primaryMetric = metricKeys[0] || 'retrieval_mrr'
  const preferredCount = completed.filter((run) =>
    isPareto(run, completed, primaryMetric)
  ).length

  return (
    <section className="rounded-md border border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <GitCompareArrows className="size-4 text-primary" />
            多次运行对比
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
            比较各项指标、相对基准的变化和运行延迟。
          </p>
        </div>
        <span className="shrink-0 rounded-md border border-border bg-muted px-2 py-1 text-xs text-muted-foreground">
          优选候选 {preferredCount || 0} 个
        </span>
      </div>

      {completed.length ? (
        <div className="divide-y divide-border">
          {completed.map((run) => {
            const preferred = isPareto(run, completed, primaryMetric)
            const runLatency = latency(run)
            return (
              <div key={run.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-medium text-foreground">
                      运行 {shortId(run.id)}
                    </span>
                    {run.id === base?.id ? (
                      <span className="rounded-md border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        基准
                      </span>
                    ) : null}
                    {preferred ? (
                      <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        优选候选
                      </span>
                    ) : null}
                  </div>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    延迟{' '}
                    {runLatency === null ? '-' : `${Math.round(runLatency)} ms`}
                  </span>
                </div>

                <div className="mt-3 grid gap-x-4 gap-y-3 border-t border-border pt-3 sm:grid-cols-2 xl:grid-cols-3">
                  {metricKeys.map((metric) => {
                    const value = metricValue(run, metric)
                    const baseValue = base ? metricValue(base, metric) : null
                    const delta =
                      value !== null && baseValue !== null
                        ? value - baseValue
                        : null
                    return (
                      <div
                        key={`${run.id}-${metric}`}
                        className="flex items-end justify-between gap-3"
                      >
                        <span className="min-w-0 truncate text-xs text-muted-foreground">
                          {metricLabel(metric)}
                        </span>
                        <span className="shrink-0 font-mono text-xs tabular-nums text-foreground">
                          {value === null ? '-' : value.toFixed(4)}
                          {delta === null ? null : (
                            <span
                              className={cn(
                                'ml-2',
                                delta > 0
                                  ? 'text-success'
                                  : delta < 0
                                    ? 'text-destructive'
                                    : 'text-muted-foreground'
                              )}
                            >
                              {delta >= 0 ? '+' : ''}
                              {delta.toFixed(3)}
                            </span>
                          )}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
          暂无已完成的运行，请先创建消融实验。
        </div>
      )}
    </section>
  )
}
