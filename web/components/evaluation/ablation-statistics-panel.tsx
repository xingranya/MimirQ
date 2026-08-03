'use client'

import { FlaskConical } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { RagasRegressionRunDiffResponse, RegressionRunMetricSignificance } from '@/types'

function toFinite(value: unknown): number | null {
  const next = Number(value)
  return Number.isFinite(next) ? next : null
}

function verdict(delta: number | null): { label: string; tone: string } {
  if (delta === null) return { label: '等待 metric diff', tone: 'text-muted-foreground' }
  if (Math.abs(delta) < 0.01) return { label: '无明显变化', tone: 'text-muted-foreground' }
  if (Math.abs(delta) < 0.03) return { label: '方向性变化', tone: delta > 0 ? 'text-success' : 'text-warning' }
  return { label: delta > 0 ? '显著候选' : '退化风险', tone: delta > 0 ? 'text-success' : 'text-destructive' }
}

export function AblationStatisticsPanel({
  diff,
}: Readonly<{
  diff: RagasRegressionRunDiffResponse | null
}>) {
  const significanceRows = Array.isArray(diff?.significance) ? diff.significance : []
  const fallbackRows: RegressionRunMetricSignificance[] = (Array.isArray(diff?.metric_diffs) ? diff.metric_diffs : []).map((row) => ({
    key: row.key,
    compared: 0,
    delta_mean: toFinite(row.delta),
    significant: false,
  }))
  const rows = significanceRows.length ? significanceRows : fallbackRows
  const displayRows = rows.map((row) => {
    const delta = toFinite(row.delta_mean)
    return { row, delta, meta: verdict(delta) }
  })

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <FlaskConical className="size-4 text-success" />
            统计显著性审查
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            先把 Bootstrap CI、paired test、p-value 与 BH 校正放进操作台；当前后端未返回 per-case 统计时明确显示“待计算”，避免把聚合 delta 误读成结论。
          </p>
        </div>
        <div className="w-fit rounded-md border border-warning/30 bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning">
          Bootstrap CI / p-value / BH 校正
        </div>
      </div>

      <div className="mt-3 overflow-x-auto rounded-lg border border-border">
        <div className="hidden min-w-[680px] grid-cols-[minmax(120px,1fr)_96px_120px_180px_120px] bg-muted/50 px-3 py-2 text-xs text-muted-foreground md:grid">
          <div>Metric</div>
          <div className="text-right">Delta</div>
          <div className="text-right">Bootstrap CI</div>
          <div className="text-right">p-value</div>
          <div className="text-right">Verdict</div>
        </div>
        {displayRows.length ? (
          displayRows.map(({ row, delta, meta }) => (
            <div key={row.key} className="border-t border-border/50 first:border-t-0 md:first:border-t">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 px-3 py-3 text-sm md:hidden">
                <div className="col-span-2 min-w-0">
                  <dt className="text-xs text-muted-foreground">指标</dt>
                  <dd className="truncate font-mono text-foreground">{row.key}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Delta</dt>
                  <dd className={cn('font-mono', delta && delta > 0 ? 'text-success' : delta && delta < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                    {delta === null ? '-' : delta.toFixed(4)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">结论</dt>
                  <dd className={cn('font-medium', row.significant ? 'text-success' : meta.tone)}>
                    {row.significant ? '显著' : meta.label}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Bootstrap CI</dt>
                  <dd className="font-mono text-muted-foreground">
                    {row.bootstrap_ci_low == null || row.bootstrap_ci_high == null
                      ? '待 per-case'
                      : `[${row.bootstrap_ci_low.toFixed(3)}, ${row.bootstrap_ci_high.toFixed(3)}]`}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">p-value</dt>
                  <dd className="font-mono text-muted-foreground">
                    {row.p_value == null ? '待计算' : `${row.p_value.toFixed(4)} / BH ${row.p_value_bh == null ? '-' : row.p_value_bh.toFixed(4)}`}
                  </dd>
                </div>
              </dl>
              <div className="hidden min-w-[680px] grid-cols-[minmax(120px,1fr)_96px_120px_180px_120px] px-3 py-2 text-xs md:grid">
                <div className="truncate font-mono text-foreground">{row.key}</div>
                <div className={cn('text-right font-mono', delta && delta > 0 ? 'text-success' : delta && delta < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                  {delta === null ? '-' : delta.toFixed(4)}
                </div>
                <div className="text-right font-mono text-muted-foreground">
                  {row.bootstrap_ci_low == null || row.bootstrap_ci_high == null
                    ? '待 per-case'
                    : `[${row.bootstrap_ci_low.toFixed(3)}, ${row.bootstrap_ci_high.toFixed(3)}]`}
                </div>
                <div className="text-right font-mono text-muted-foreground">
                  {row.p_value == null ? '待计算' : `${row.p_value.toFixed(4)} / BH ${row.p_value_bh == null ? '-' : row.p_value_bh.toFixed(4)}`}
                </div>
                <div className={cn('text-right font-medium', row.significant ? 'text-success' : meta.tone)}>
                  {row.significant ? '显著' : meta.label}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="px-3 py-8 text-center text-xs text-muted-foreground">生成 Diff 后显示指标差异；接入 per-case scores 后可计算真实 Bootstrap CI 与 p-value。</div>
        )}
      </div>
    </section>
  )
}
