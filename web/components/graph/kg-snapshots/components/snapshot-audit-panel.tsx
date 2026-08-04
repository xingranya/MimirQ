'use client'

import {
  ArrowRightLeft,
  BarChart3,
  Layers,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import type { ReactNode } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { Badge } from '@/components/ui/badge'
import { SafeResponsiveChart } from '@/components/ui/safe-responsive-chart'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

import {
  DELTA_BADGE_VARIANTS,
  DELTA_LABELS,
  DELTA_TEXT_CLASSES,
  DELTA_TINT_CLASSES,
} from '../constants'
import type {
  AuditSeverity,
  SnapshotChartTooltipProps,
  SnapshotDeltaRow,
  SnapshotDiffEntityRow,
} from '../types'
import {
  deltaDirection,
  deltaFill,
  deltaSign,
  driftScoreToneForSeverity,
  toneClassForDelta,
} from '../utils'
import { SectionHeading, SnapshotInlineStat } from './shared'

export function auditSeverityMeta(severity: AuditSeverity): {
  label: string
  variant: 'soft' | 'outline' | 'destructive'
  icon: ReactNode
} {
  if (severity === 'warning') {
    return {
      label: '高波动',
      variant: 'destructive',
      icon: <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />,
    }
  }
  if (severity === 'notice') {
    return {
      label: '关注',
      variant: 'outline',
      icon: <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />,
    }
  }
  return {
    label: '稳定',
    variant: 'soft',
    icon: <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />,
  }
}

export function SnapshotChartTooltip({
  active,
  payload,
}: Readonly<SnapshotChartTooltipProps>) {
  const row = payload?.[0]?.payload
  if (!active || !row) return null
  const sign = row.delta > 0 ? '+' : ''
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <div className="text-xs text-muted-foreground">
        {row.key}
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs">
        <span className="font-mono text-muted-foreground">A {row.a}</span>
        <span className="font-mono text-muted-foreground">B {row.b}</span>
        <span
          className={cn(
            'font-mono font-semibold',
            deltaDirection(row.delta) === 'flat' ? 'text-foreground' : toneClassForDelta(row.delta)
          )}
        >
          Δ {sign}
          {row.delta}
        </span>
      </div>
    </div>
  )
}

export function SnapshotAuditPanel({
  deltaRows,
  typeDriftRows,
  severity,
  driftScore,
  includeZeroDeltas,
  compactRows,
  onIncludeZeroDeltasChange,
  onCompactRowsChange,
}: Readonly<{
  deltaRows: SnapshotDeltaRow[]
  typeDriftRows: SnapshotDiffEntityRow[]
  severity: AuditSeverity
  driftScore: number
  includeZeroDeltas: boolean
  compactRows: boolean
  onIncludeZeroDeltasChange: (value: boolean) => void
  onCompactRowsChange: (value: boolean) => void
}>) {
  const severityMeta = auditSeverityMeta(severity)
  const chartRows = includeZeroDeltas
    ? deltaRows
    : deltaRows.filter((row) => row.delta !== 0)
  const chartRowsWithFill = chartRows.map((row) => ({
    ...row,
    fill: deltaFill(row.delta),
  }))
  const shownDriftRows = compactRows
    ? typeDriftRows.slice(0, 14)
    : typeDriftRows
  const driftScoreTone = driftScoreToneForSeverity(severity)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border bg-background px-4 py-3">
        <SectionHeading
          eyebrow="快照评估"
          title="变化概览"
          description="快速查看快照差异强度、类型漂移与整体风险等级。"
          icon={<BarChart3 className="h-5 w-5" aria-hidden="true" />}
          extra={
            <Badge
              variant={severityMeta.variant}
              className="inline-flex items-center gap-1.5 text-xs"
            >
              {severityMeta.icon}
              {severityMeta.label}
            </Badge>
          }
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <SnapshotInlineStat
            icon={<Sparkles className="h-3.5 w-3.5" />}
            label="波动评分"
            value={driftScore.toFixed(2)}
            tone={driftScoreTone}
          />
          <SnapshotInlineStat
            icon={<Layers className="h-3.5 w-3.5" />}
            label="类型变化"
            value={typeDriftRows.length}
            tone={typeDriftRows.length > 0 ? 'positive' : 'muted'}
          />
          <SnapshotInlineStat
            icon={<ArrowRightLeft className="h-3.5 w-3.5" />}
            label="变化指标"
            value={deltaRows.filter((row) => row.delta !== 0).length}
            tone="neutral"
          />
        </div>
      </div>

      <div className="grid min-h-0 flex-1 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="min-h-0 border-b border-border/70 xl:border-b-0 xl:border-r">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-2.5">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <BarChart3
                className="h-3.5 w-3.5 text-primary/70"
                aria-hidden="true"
              />
              指标变化
            </div>
            <div className="flex items-center gap-4">
              <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <Switch
                  checked={includeZeroDeltas}
                  onCheckedChange={onIncludeZeroDeltasChange}
                />
                显示 0 值
              </label>
            </div>
          </div>

          <div className="px-3 py-2">
            <SafeResponsiveChart className="h-[280px]" minHeight={280}>
              <BarChart
                data={chartRowsWithFill}
                margin={{ top: 8, right: 10, left: -16, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#e2e8f0"
                />
                <XAxis
                  dataKey="key"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(148, 163, 184, 0.08)' }}
                  content={<SnapshotChartTooltip />}
                />
                <Bar dataKey="delta" radius={[2, 2, 0, 0]} />
              </BarChart>
            </SafeResponsiveChart>
          </div>
        </div>

        <div className="min-h-0 flex flex-col">
          <div className="flex items-center justify-between gap-2 border-b border-border/70 px-4 py-2.5">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Layers
                className="h-3.5 w-3.5 text-primary/70"
                aria-hidden="true"
              />
              类型变化
            </div>
            <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              <Switch
                checked={compactRows}
                onCheckedChange={onCompactRowsChange}
              />
              紧凑模式
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {shownDriftRows.length ? (
              shownDriftRows.map((row, index) => {
                const type = String(row.type || 'unknown')
                const delta = Number(row.delta ?? 0)
                const direction = deltaDirection(delta)
                const sign = deltaSign(delta)
                const tone = DELTA_TEXT_CLASSES[direction]
                const tint = DELTA_TINT_CLASSES[direction]
                return (
                  <div
                    key={`drift:${type}:${index}`}
                    className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 border-b border-border/60 px-4 py-2 text-left"
                    title={`${type} Δ ${sign}${delta}`}
                  >
                    <span className="truncate text-xs text-foreground">
                      {type}
                    </span>
                    <span
                      className={cn(
                        'inline-flex min-w-[52px] items-center justify-center rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums ring-1',
                        tint,
                        tone
                      )}
                    >
                      Δ {sign}
                      {delta}
                    </span>
                    <Badge
                      variant={DELTA_BADGE_VARIANTS[direction]}
                      className="text-xs"
                    >
                      {DELTA_LABELS[direction]}
                    </Badge>
                  </div>
                )
              })
            ) : (
              <div className="flex h-full items-center justify-center px-4 py-12">
                <div className="flex max-w-[320px] flex-col items-center text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-muted/40 text-muted-foreground">
                    <Layers className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="mt-3 text-sm font-semibold text-foreground">
                    暂无类型漂移
                  </div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">
                    未发现实体类型变化，两个快照的类型构成一致。
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
