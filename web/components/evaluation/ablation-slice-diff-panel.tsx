'use client'

import { Layers3 } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { RagasRegressionRunDiffResponse, RegressionRunMetricDiff, RegressionRunSliceBucketDiff } from '@/types'

const KEY_METRICS = ['retrieval_recall', 'retrieval_mrr', 'retrieval_ndcg_at_10', 'retrieval_hit_at_20']
const METRIC_LABELS: Record<string, string> = {
  retrieval_recall: '召回率',
  retrieval_mrr: 'MRR',
  retrieval_ndcg_at_10: 'NDCG@10',
  retrieval_hit_at_20: '命中率@20',
}

function toNumber(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function metricDelta(metrics: RegressionRunMetricDiff[], key: string): number | null {
  const match = metrics.find((metric) => metric.key === key)
  if (!match) return null
  return toNumber(match.delta)
}

function bestMetric(bucket: RegressionRunSliceBucketDiff): { key: string; delta: number | null } {
  for (const key of KEY_METRICS) {
    const delta = metricDelta(bucket.metrics, key)
    if (delta !== null) return { key, delta }
  }
  const first = bucket.metrics[0]
  return first ? { key: first.key, delta: toNumber(first.delta) } : { key: 'metric', delta: null }
}

function formatDelta(value: number | null): string {
  if (value === null) return '-'
  return `${value >= 0 ? '+' : ''}${value.toFixed(4)}`
}

export function AblationSliceDiffPanel({
  diff,
}: Readonly<{
  diff: RagasRegressionRunDiffResponse | null
}>) {
  const sliceEntries = Object.entries(diff?.slice_diffs ?? {})
    .map(([dimension, slice]) => ({
      dimension,
      truncated: slice.truncated_before || slice.truncated_after,
      buckets: slice.buckets
        .map((bucket) => ({ ...bucket, primary: bestMetric(bucket) }))
        .sort((a, b) => Math.abs(b.primary.delta ?? 0) - Math.abs(a.primary.delta ?? 0))
        .slice(0, 4),
    }))
    .filter((entry) => entry.buckets.length)

  return (
    <section className="rounded-md border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Layers3 className="size-4 text-primary" />
            切片差异
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            按文件类型、目录、语言和处理版本比较局部分数，避免总分掩盖具体问题。
          </p>
        </div>
        <span className="rounded-md border border-border bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
          分组评测
        </span>
      </div>

      {sliceEntries.length ? (
        <div className="mt-3 divide-y divide-border border-y border-border">
          {sliceEntries.map((entry) => (
            <div key={entry.dimension} className="py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="font-mono text-xs font-semibold text-foreground">{entry.dimension}</div>
                {entry.truncated ? (
                  <span className="rounded-md bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
                    仅显示部分结果
                  </span>
                ) : null}
              </div>
              <div className="mt-2 divide-y divide-border border-t border-border">
                {entry.buckets.map((bucket) => {
                  const delta = bucket.primary.delta
                  return (
                    <div key={bucket.key} className="py-3">
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <div className="min-w-0">
                          <div className="truncate font-medium text-foreground">{bucket.key || '-'}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            基准 {bucket.items_before} 个样本 · 当前 {bucket.items_after} 个样本
                          </div>
                        </div>
                        <div className={cn('font-mono font-semibold', delta === null ? 'text-muted-foreground' : delta >= 0 ? 'text-success' : 'text-destructive')}>
                          {formatDelta(delta)}
                        </div>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-muted-foreground md:grid-cols-4">
                        {KEY_METRICS.map((metric) => {
                          const metricValue = metricDelta(bucket.metrics, metric)
                          return (
                            <div key={metric}>
                              <div className="truncate">
                                {METRIC_LABELS[metric] || metric}
                              </div>
                              <div className={cn('font-mono', metricValue === null ? 'text-muted-foreground/70' : metricValue >= 0 ? 'text-success' : 'text-destructive')}>
                                {formatDelta(metricValue)}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 border-y border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
          暂无分组对比结果。请先选择基准运行和目标运行生成对比。
        </div>
      )}
    </section>
  )
}
