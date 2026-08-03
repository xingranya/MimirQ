'use client'

import { FlaskConical } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { RagasRegressionRunDiffResponse, RegressionRunMetricSignificance } from '@/types'

function toFinite(value: unknown): number | null {
  const next = Number(value)
  return Number.isFinite(next) ? next : null
}

function verdict(delta: number | null): { label: string; tone: string } {
  if (delta === null) return { label: '等待分数差异', tone: 'text-muted-foreground' }
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
    <section className="rounded-md border border-border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <FlaskConical className="size-4 text-primary" />
            统计可信度
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            使用置信区间、p 值和多重比较校正判断分数变化是否可靠。缺少逐项分数时会明确显示“待计算”。
          </p>
        </div>
        <span className="w-fit rounded-md border border-border bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
          置信区间 / p 值 / 校正结果
        </span>
      </div>

      <div className="mt-3 overflow-x-auto border-y border-border">
        <div className="hidden min-w-[680px] grid-cols-[minmax(120px,1fr)_96px_120px_180px_120px] bg-muted/50 px-3 py-2 text-xs text-muted-foreground md:grid">
          <div>指标</div>
          <div className="text-right">分数变化</div>
          <div className="text-right">置信区间</div>
          <div className="text-right">p 值</div>
          <div className="text-right">判断</div>
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
                  <dt className="text-xs text-muted-foreground">分数变化</dt>
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
                  <dt className="text-xs text-muted-foreground">置信区间</dt>
                  <dd className="font-mono text-muted-foreground">
                    {row.bootstrap_ci_low == null || row.bootstrap_ci_high == null
                      ? '等待逐项分数'
                      : `[${row.bootstrap_ci_low.toFixed(3)}, ${row.bootstrap_ci_high.toFixed(3)}]`}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">p 值</dt>
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
                    ? '等待逐项分数'
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
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">
            暂无统计结果。请先选择基准运行和目标运行生成对比。
          </div>
        )}
      </div>
    </section>
  )
}
