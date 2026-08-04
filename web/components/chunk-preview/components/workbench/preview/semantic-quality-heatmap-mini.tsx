/**
 * 展示后端语义质量信号的紧凑热力图，不呈现切块原文。
 * 行顺序依次为信息密度、完整性、独立性和去重质量。
 */
'use client'

import { useMemo } from 'react'

import type { ChunkPreviewItem } from '@/types'
import { chunkNeedsReview, getSemanticQualityMetadata } from '@/components/chunk-preview/utils/metadata'
import { cn } from '@/lib/utils'

function clampInt(value: number, min: number, max: number) {
  const n = Number(value)
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, Math.trunc(n)))
}

function clamp01(value: number) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

export function SemanticQualityHeatmapMini(props: Readonly<{ chunks: ChunkPreviewItem[]; bins?: number; className?: string }>) {
  const { chunks, bins, className } = props

  const model = useMemo(() => {
    const raw = chunks || []
    const total = raw.length
    const outBins = clampInt(bins ?? 72, 12, 240)
    if (!total) return null

    const counts = Array.from({ length: outBins }, () => 0)
    const needs = Array.from({ length: outBins }, () => 0)
    const densSum = Array.from({ length: outBins }, () => 0)
    const compSum = Array.from({ length: outBins }, () => 0)
    const selfSum = Array.from({ length: outBins }, () => 0)
    const dedupGoodSum = Array.from({ length: outBins }, () => 0)

    let anySemantic = false
    let needsTotal = 0

    for (let i = 0; i < raw.length; i += 1) {
      const chunk = raw[i]
      const q = getSemanticQualityMetadata(chunk)
      if (q) anySemantic = true

      const b = Math.min(outBins - 1, Math.floor((i / total) * outBins))
      counts[b] += 1

      const isNeeds = chunkNeedsReview(chunk)
      if (isNeeds) {
        needs[b] += 1
        needsTotal += 1
      }

      densSum[b] += clamp01(q?.information_density ?? 0)
      compSum[b] += clamp01(q?.semantic_completeness ?? 0)
      selfSum[b] += clamp01(q?.self_containedness ?? 0)

      const dedupRiskRaw = q?.dedup_risk_prev_jaccard
      const risk = dedupRiskRaw == null ? 0 : clamp01(Number(dedupRiskRaw))
      dedupGoodSum[b] += clamp01(1 - risk)
    }

    if (!anySemantic) return null

    const avg = (sum: number[], idx: number) => (counts[idx] > 0 ? sum[idx] / counts[idx] : 0)

    const dens = densSum.map((_, i) => clamp01(avg(densSum, i)))
    const comp = compSum.map((_, i) => clamp01(avg(compSum, i)))
    const self = selfSum.map((_, i) => clamp01(avg(selfSum, i)))
    const dedupGood = dedupGoodSum.map((_, i) => clamp01(avg(dedupGoodSum, i)))

    const needsPct = needs.map((n, i) => (counts[i] > 0 ? n / counts[i] : 0))
    const needsPctMax = Math.max(0, ...needsPct)

    return {
      bins: outBins,
      total,
      needsTotal,
      needsPct,
      needsPctMax,
      rows: [
        { key: 'density', values: dens },
        { key: 'completeness', values: comp },
        { key: 'self', values: self },
        { key: 'dedup', values: dedupGood },
      ] as const,
    }
  }, [bins, chunks])

  if (!model) return null

  const title = [
    `语义质量：${model.needsTotal}/${model.total} 个切块需要复核`,
    '从上到下：信息密度、完整性、独立性、去重质量。',
    '主色表示质量较好，红色表示需要关注。',
  ].join('\n')

  const aria = `语义质量热力图：${model.total} 个切块中有 ${model.needsTotal} 个需要复核`

  return (
    <div
      className={cn(
        'flex flex-col gap-[1px] rounded-md border border-border bg-muted/20 p-1',
        className
      )}
      role="img"
      aria-label={aria}
      title={title}
    >
      {model.rows.map((row) => (
        <div key={row.key} className="flex items-center gap-[1px]">
          {row.values.map((value, idx) => {
            const v = clamp01(value)
            const good = v >= 0.55
            const alpha = good ? Math.min(0.9, 0.15 + 0.75 * v) : Math.min(0.9, 0.15 + 0.75 * (1 - v))
            const bg = good ? `hsl(var(--primary) / ${alpha})` : `hsl(var(--destructive) / ${alpha})`
            return <span key={`${row.key}-${idx}`} className="h-2 w-[2px] rounded-[1px]" style={{ backgroundColor: bg }} />
          })}
        </div>
      ))}
      <div className="flex items-center justify-between px-0.5 pt-0.5 text-xs text-muted-foreground">
        <span>语义质量</span>
        <span className="tabular-nums">
          {model.needsTotal}/{model.total}
        </span>
      </div>
    </div>
  )
}
