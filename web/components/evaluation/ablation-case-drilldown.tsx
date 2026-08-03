'use client'

import { useMemo, useState } from 'react'
import { FileDown, SearchCode } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { evaluationApi } from '@/lib/api/evaluation'
import { formatApiError } from '@/lib/api-errors'
import { cn } from '@/lib/utils'
import type { RegressionItem, RegressionRunCaseDiff, RegressionRunDetail } from '@/types'
import { toast } from 'sonner'

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function scoreValue(item: RegressionItem | undefined, metricKeys: string[]): number | null {
  if (!item) return null
  const scores = toRecord(item.scores)
  const values = metricKeys
    .map((key) => Number(scores[key]))
    .filter((value) => Number.isFinite(value))
  if (!values.length) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function serializableText(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

function primitiveText(value: unknown, fallback = '-'): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return fallback
}

function csvEscape(value: unknown): string {
  const text = serializableText(value)
  return `"${text.replaceAll('"', '""')}"`
}

function downloadCsv(rows: Array<Record<string, unknown>>) {
  const headers = ['case_id', 'question', 'base_score', 'target_score', 'delta', 'label']
  const lines = [headers.join(',')]
  for (const row of rows) lines.push(headers.map((key) => csvEscape(row[key])).join(','))
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'ablation-case-drilldown.csv'
  a.click()
  globalThis.window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function AblationCaseDrilldown({
  baseRunId,
  targetRunId,
  metricKeys,
  caseDiffs,
}: Readonly<{
  baseRunId: string
  targetRunId: string
  metricKeys: string[]
  caseDiffs?: RegressionRunCaseDiff[]
}>) {
  const [baseDetail, setBaseDetail] = useState<RegressionRunDetail | null>(null)
  const [targetDetail, setTargetDetail] = useState<RegressionRunDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [expandedCaseId, setExpandedCaseId] = useState('')

  async function loadDetails() {
    if (!baseRunId || !targetRunId || baseRunId === targetRunId) return
    setLoading(true)
    try {
      const [base, target] = await Promise.all([
        evaluationApi.getRegressionRun(baseRunId, { include_items: true, include_contexts: false }),
        evaluationApi.getRegressionRun(targetRunId, { include_items: true, include_contexts: false }),
      ])
      setBaseDetail(base)
      setTargetDetail(target)
    } catch (error: unknown) {
      toast.error(formatApiError(error, '加载案例明细失败'))
    } finally {
      setLoading(false)
    }
  }

  const rows = useMemo(() => {
    if (caseDiffs?.length) {
      return caseDiffs.map((item) => ({
        case_id: item.case_id,
        question: item.question,
        base_score: null,
        target_score: null,
        delta: item.mean_delta ?? null,
        label: item.label,
        base_response: '',
        target_response: '',
        metric_diffs: item.metric_diffs,
      }))
    }
    const baseByCase = new Map((baseDetail?.items || []).map((item) => [item.case_id, item]))
    return (targetDetail?.items || []).map((targetItem) => {
      const baseItem = baseByCase.get(targetItem.case_id)
      const baseScore = scoreValue(baseItem, metricKeys)
      const targetScore = scoreValue(targetItem, metricKeys)
      const delta = baseScore !== null && targetScore !== null ? targetScore - baseScore : null
      const label = delta === null ? '无分数' : delta > 0.05 ? '改善' : delta < -0.05 ? '退化' : '无明显变化'
      return {
        case_id: targetItem.case_id,
        question: targetItem.question,
        base_score: baseScore,
        target_score: targetScore,
        delta,
        label,
        base_response: baseItem?.response || '',
        target_response: targetItem.response || '',
        metric_diffs: [],
      }
    })
  }, [baseDetail, caseDiffs, metricKeys, targetDetail])

  return (
    <section className="rounded-md border border-border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <SearchCode className="size-4 text-primary" />
            逐条案例下钻
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            比较基准运行和目标运行中的每条问题，定位具体改善或退化的案例。
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={loading || !baseRunId || !targetRunId || baseRunId === targetRunId} onClick={() => void loadDetails()}>
            {loading ? '正在加载' : '加载案例明细'}
          </Button>
          <Button type="button" variant="outline" disabled={!rows.length} onClick={() => downloadCsv(rows)} className="gap-2">
            <FileDown className="size-4" />
            导出 CSV
          </Button>
        </div>
      </div>

      <div className="mt-3 overflow-x-auto border-y border-border">
        <div className="hidden min-w-[620px] grid-cols-[minmax(180px,1fr)_82px_82px_82px_88px] bg-muted/50 px-3 py-2 text-xs text-muted-foreground md:grid">
          <div>案例 ID / 问题</div>
          <div className="text-right">基准分</div>
          <div className="text-right">目标分</div>
          <div className="text-right">变化</div>
          <div className="text-right">标签</div>
        </div>
        {rows.length ? rows.map((row) => (
          <button
            key={row.case_id}
            type="button"
            className="block w-full min-w-0 border-t border-border/50 text-left transition-colors hover:bg-muted/25 md:min-w-[620px]"
            onClick={() => setExpandedCaseId((prev) => (prev === row.case_id ? '' : row.case_id))}
            aria-expanded={expandedCaseId === row.case_id}
          >
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 px-3 py-3 text-sm md:hidden">
              <div className="col-span-2 min-w-0">
                <div className="font-mono text-xs text-muted-foreground">{row.case_id.slice(0, 8)}…</div>
                <div className="truncate text-foreground">{row.question}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">基准分</div>
                <div className="font-mono text-muted-foreground">{row.base_score === null ? '-' : row.base_score.toFixed(3)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">目标分</div>
                <div className="font-mono text-muted-foreground">{row.target_score === null ? '-' : row.target_score.toFixed(3)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">变化</div>
                <div className={cn('font-mono', row.delta && row.delta > 0 ? 'text-success' : row.delta && row.delta < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                  {row.delta === null ? '-' : row.delta >= 0 ? `+${row.delta.toFixed(3)}` : row.delta.toFixed(3)}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">标签</div>
                <div className="text-foreground/85">{row.label}</div>
              </div>
            </div>
            <div className="hidden min-w-[620px] grid-cols-[minmax(180px,1fr)_82px_82px_82px_88px] px-3 py-2 text-xs md:grid">
              <div className="min-w-0">
                <div className="font-mono text-xs text-muted-foreground">{row.case_id.slice(0, 8)}…</div>
                <div className="truncate text-foreground">{row.question}</div>
              </div>
              <div className="text-right font-mono text-muted-foreground">{row.base_score === null ? '-' : row.base_score.toFixed(3)}</div>
              <div className="text-right font-mono text-muted-foreground">{row.target_score === null ? '-' : row.target_score.toFixed(3)}</div>
              <div className={cn('text-right font-mono', row.delta && row.delta > 0 ? 'text-success' : row.delta && row.delta < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                {row.delta === null ? '-' : row.delta >= 0 ? `+${row.delta.toFixed(3)}` : row.delta.toFixed(3)}
              </div>
              <div className="text-right text-foreground/85">{row.label}</div>
            </div>
            {expandedCaseId === row.case_id ? (
              <div className="grid min-w-0 gap-3 border-t border-border bg-muted/30 px-3 py-3 text-xs md:min-w-[620px] md:grid-cols-2">
                <div>
                  <div className="mb-1 font-medium text-foreground/85">基准回答</div>
                  <div className="line-clamp-5 border-t border-border pt-2 text-muted-foreground">
                    {row.base_response ||
                      (row.metric_diffs.length
                        ? row.metric_diffs
                            .map(
                              (item) =>
                                `${item.key}：从 ${primitiveText(item.before)} 到 ${primitiveText(item.after)}`
                            )
                            .join(' / ')
                        : '-')}
                  </div>
                </div>
                <div>
                  <div className="mb-1 font-medium text-foreground/85">目标回答</div>
                  <div className="line-clamp-5 border-t border-border pt-2 text-muted-foreground">{row.target_response || '-'}</div>
                </div>
              </div>
            ) : null}
          </button>
        )) : (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">
            选择基准运行和目标运行后加载案例明细。
          </div>
        )}
      </div>
    </section>
  )
}
