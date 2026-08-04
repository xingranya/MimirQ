'use client'

import {
  Activity,
  ClipboardList,
  CircleAlert,
  Download,
  FileStack,
  History,
  Info,
  Minus,
  PlayCircle,
  Plus,
  RefreshCcw,
  Sparkles,
  Target,
  TrendingUp,
  Waypoints,
} from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { AppFrame } from '@/components/app-frame'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/ui/page-header'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatApiError } from '@/lib/api-errors'
import {
  datasetApi,
  evaluationApi,
  type KGHardcaseMode,
  type KGSearchDiagnosticsResponse,
  type KGSearchDiagnosticsRunDetail,
  type KGSearchDiagnosticsRunOut,
} from '@/lib/api'
import { coerceOneOf } from '@/lib/one-of'
import { toTrimmedPrimitiveString } from '@/lib/primitive-text'
import { queryKeys } from '@/lib/query-keys'
import { sanitizeFilename } from '@/lib/sanitize'
import { cn } from '@/lib/utils'
import type { JsonObject } from '@/types'

const KG_EXTRACT_MODE_VALUES = ['auto', 'on', 'off'] as const
const DIAGNOSTICS_SECTION_TITLE_CLASS =
  'text-sm font-semibold leading-5 text-foreground'
const DIAGNOSTICS_SECTION_DESCRIPTION_CLASS =
  'text-xs leading-5 text-muted-foreground'
const DIAGNOSTICS_FIELD_LABEL_CLASS =
  'text-xs font-medium leading-5 text-muted-foreground'
const DIAGNOSTICS_FIELD_VALUE_CLASS =
  'text-sm text-foreground'
const DIAGNOSTICS_HEADER_ACTION_DOCK_CLASS =
  'flex min-w-0 flex-wrap items-center gap-2 sm:justify-end'
const DIAGNOSTICS_HEADER_ACTION_BUTTON_CLASS =
  'h-9 gap-2 rounded-md border-border bg-background px-3 text-xs font-medium text-foreground shadow-none hover:border-primary/30 hover:bg-muted'
const DIAGNOSTICS_ACTION_CARD_CLASS =
  'rounded-md border border-border bg-card p-3'
const DIAGNOSTICS_PRIMARY_ACTION_BUTTON_CLASS =
  'h-10 w-full gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90'
const DIAGNOSTICS_SECONDARY_ACTION_BUTTON_CLASS =
  'h-9 gap-2 rounded-md border-border bg-background px-3 text-xs font-medium text-muted-foreground shadow-none hover:border-primary/30 hover:bg-muted hover:text-foreground'
const DIAGNOSTICS_METRIC_LABELS: Record<string, string> = {
  baseline_hit_rate: '基线命中率',
  baseline_mrr: '基线 MRR',
  baseline_recall: '基线召回率',
  baseline_ndcg: '基线 NDCG@K',
  baseline_map: '基线 MAP@K',
  hardcase_hit_rate: '难例命中率',
  hardcase_mrr: '难例 MRR',
  hardcase_recall: '难例召回率',
  hardcase_ndcg: '难例 NDCG@K',
  hardcase_map: '难例 MAP@K',
  hardcases_generated: '生成难例数',
  documents: '文档数',
  events: '事件数',
  entities: '实体数',
  relations: '关系数',
  event_entity_links: '事件实体关联数',
  avg_relations_per_entity: '平均每实体关系数',
  isolated_entities: '孤立实体数',
  isolated_entity_ratio: '孤立实体占比',
  nodes: '节点数',
  edges: '边数',
  components: '连通分量数',
  largest_component_ratio: '最大连通分量占比',
  relations_total: '关系总数',
  low_confidence_threshold: '低置信阈值',
  low_confidence_relations: '低置信关系数',
  missing_references_relations: '缺少引用的关系数',
  missing_chunk_relations: '缺少切片的关系数',
  relation_edges_truncated: '关系边已截断',
  relation_edges_limit: '关系边上限',
  dataset_id: '数据集',
  documents_sampled: '抽样文档数',
  documents_allowed: '有权限文档数',
}

type DiagnosticsView = 'run' | 'quality' | 'compare'
type DiagnosticsDatasetOption = {
  id?: string
  name?: string | null
}
type DiagnosticsTone = 'muted' | 'neutral' | 'positive' | 'negative'
type DiagnosticsAccent = 'neutral' | 'sky' | 'violet' | 'emerald' | 'amber'
type DiagnosticsAccentClasses = {
  surface: string
  label: string
  dot: string
  value: string
  caption: string
}
type DiagnosticsFailureCase = {
  case_id: string
  question: string
  recall: number
  mrr: number
}
type DiagnosticsFailureTab = 'failures' | 'distribution'
type DiagnosticsRunCaseMetrics = ReturnType<typeof extractBaselineMetrics>
type DiagnosticsRunCaseMapValue = {
  question: string
  metrics: DiagnosticsRunCaseMetrics
}
type DiagnosticsRunDiffRow = {
  case_id: string
  question: string
  a_hit: boolean | null
  b_hit: boolean | null
  a_mrr: number | null
  b_mrr: number | null
  a_recall: number | null
  b_recall: number | null
  delta_recall: number | null
  delta_mrr: number | null
}

const DIAGNOSTICS_ACCENT_CLASSES: Record<
  DiagnosticsAccent,
  DiagnosticsAccentClasses
> = {
  neutral: {
    surface: 'border-border/70 bg-background',
    label: 'text-muted-foreground',
    dot: 'bg-muted-foreground/40',
    value: 'text-foreground',
    caption: 'text-muted-foreground',
  },
  sky: {
    surface: 'border-border/70 bg-background',
    label: 'text-info',
    dot: 'bg-info',
    value: 'text-foreground',
    caption: 'text-muted-foreground',
  },
  violet: {
    surface: 'border-border/70 bg-background',
    label: 'text-accent',
    dot: 'bg-accent',
    value: 'text-foreground',
    caption: 'text-muted-foreground',
  },
  emerald: {
    surface: 'border-border/70 bg-background',
    label: 'text-success',
    dot: 'bg-success',
    value: 'text-foreground',
    caption: 'text-muted-foreground',
  },
  amber: {
    surface: 'border-border/70 bg-background',
    label: 'text-warning',
    dot: 'bg-warning',
    value: 'text-foreground',
    caption: 'text-muted-foreground',
  },
}

const DIAGNOSTICS_DIFF_METRIC_KEYS = [
  'baseline_hit_rate',
  'baseline_mrr',
  'baseline_recall',
  'baseline_ndcg',
  'baseline_map',
  'hardcase_hit_rate',
  'hardcase_mrr',
  'hardcase_recall',
  'hardcase_ndcg',
  'hardcase_map',
]

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function isDiagnosticsRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function diagnosticsField(source: unknown, key: string): unknown {
  return isDiagnosticsRecord(source) ? source[key] : undefined
}

function diagnosticsRecordField(source: unknown, key: string): JsonObject | null {
  const value = diagnosticsField(source, key)
  return isDiagnosticsRecord(value) ? value : null
}

function downloadJson(value: unknown, filename: string): void {
  const content = JSON.stringify(value ?? {}, null, 2)
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  globalThis.window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function formatMetricValue(value: unknown): string {
  if (value === null || value === undefined) return '-'
  if (
    typeof value === 'number' ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return String(value)
  }
  return prettyJson(value)
}

function formatDiagnosticsMetricLabel(key: string): string {
  return DIAGNOSTICS_METRIC_LABELS[key] ?? key.replaceAll('_', ' ')
}

function extractBaselineMetrics(item: unknown): {
  hit_at_k: boolean
  mrr: number
  recall: number
  ndcg: number
  map: number
} | null {
  const baseline = diagnosticsRecordField(item, 'baseline')
  const metrics = diagnosticsRecordField(baseline, 'metrics')
  const hit = Boolean(diagnosticsField(metrics, 'hit_at_k'))
  const mrr = toNumber(diagnosticsField(metrics, 'mrr'))
  const recall = toNumber(diagnosticsField(metrics, 'recall'))
  const ndcg = toNumber(diagnosticsField(metrics, 'ndcg'))
  const meanAveragePrecision = toNumber(diagnosticsField(metrics, 'map'))
  if (mrr === null || recall === null) return null
  return {
    hit_at_k: hit,
    mrr,
    recall,
    ndcg: ndcg ?? 0,
    map: meanAveragePrecision ?? 0,
  }
}

function caseKey(item: unknown): string | null {
  const id = diagnosticsField(item, 'case_id')
  const s = toTrimmedPrimitiveString(id)
  return s || null
}

function diagnosticsInlineToneClass(tone: DiagnosticsTone): string {
  if (tone === 'positive') return 'text-success'
  if (tone === 'negative') return 'text-destructive'
  if (tone === 'neutral') return 'text-foreground'
  return 'text-muted-foreground'
}

function diagnosticsMetricValueClass(
  tone: DiagnosticsTone,
  fallback: string
): string {
  if (tone === 'positive') return 'text-success'
  if (tone === 'negative') return 'text-destructive'
  if (tone === 'muted') return 'text-muted-foreground'
  return fallback
}

function diagnosticsTabClass(isActive: boolean): string {
  return isActive
    ? 'bg-primary text-primary-foreground'
    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
}

function diagnosticsDeltaClass(delta: number): string {
  if (delta > 0) return 'text-success'
  if (delta < 0) return 'text-destructive'
  return 'text-muted-foreground'
}

function diagnosticsRunSummary(run: KGSearchDiagnosticsRunDetail['run']) {
  return isDiagnosticsRecord(run?.summary) ? run.summary : {}
}

function diagnosticsMetricDelta(aValue: number | null, bValue: number | null) {
  if (aValue === null || bValue === null) return null
  return Number((bValue - aValue).toFixed(4))
}

function buildDiagnosticsSummaryDelta(
  aSummary: JsonObject,
  bSummary: JsonObject
) {
  const summaryDelta: JsonObject = {}
  for (const key of DIAGNOSTICS_DIFF_METRIC_KEYS) {
    const aValue = toNumber(aSummary[key])
    const bValue = toNumber(bSummary[key])
    if (aValue === null && bValue === null) continue
    summaryDelta[key] = {
      a: aValue,
      b: bValue,
      delta: diagnosticsMetricDelta(aValue, bValue),
    }
  }
  return summaryDelta
}

function buildDiagnosticsCaseMap(
  items: JsonObject[] | undefined
): Map<string, DiagnosticsRunCaseMapValue> {
  const byCase = new Map<string, DiagnosticsRunCaseMapValue>()
  for (const item of items || []) {
    const key = caseKey(item)
    if (!key) continue
    byCase.set(key, {
      question: toTrimmedPrimitiveString(diagnosticsField(item, 'question')),
      metrics: extractBaselineMetrics(item),
    })
  }
  return byCase
}

function buildDiagnosticsDiffRow(
  key: string,
  byCaseA: Map<string, DiagnosticsRunCaseMapValue>,
  byCaseB: Map<string, DiagnosticsRunCaseMapValue>
): DiagnosticsRunDiffRow {
  const runCaseA = byCaseA.get(key)
  const runCaseB = byCaseB.get(key)
  const metricsA = runCaseA?.metrics
  const metricsB = runCaseB?.metrics
  const aRecall = metricsA?.recall ?? null
  const bRecall = metricsB?.recall ?? null
  const aMrr = metricsA?.mrr ?? null
  const bMrr = metricsB?.mrr ?? null

  return {
    case_id: key,
    question: runCaseA?.question || runCaseB?.question || '',
    a_hit: metricsA ? Boolean(metricsA.hit_at_k) : null,
    b_hit: metricsB ? Boolean(metricsB.hit_at_k) : null,
    a_mrr: aMrr,
    b_mrr: bMrr,
    a_recall: aRecall,
    b_recall: bRecall,
    delta_recall: diagnosticsMetricDelta(aRecall, bRecall),
    delta_mrr: diagnosticsMetricDelta(aMrr, bMrr),
  }
}

function isChangedDiagnosticsDiffRow(row: DiagnosticsRunDiffRow): boolean {
  return (
    row.delta_recall !== null ||
    row.delta_mrr !== null ||
    (row.a_hit !== null && row.b_hit !== null && row.a_hit !== row.b_hit)
  )
}

function compareDiagnosticsDiffRows(
  left: DiagnosticsRunDiffRow,
  right: DiagnosticsRunDiffRow
) {
  return Math.abs(right.delta_recall ?? 0) - Math.abs(left.delta_recall ?? 0)
}

function countDiagnosticsHitFlips(rows: DiagnosticsRunDiffRow[]) {
  const flips = rows.filter(
    (row) =>
      row.a_hit !== null && row.b_hit !== null && row.a_hit !== row.b_hit
  )
  const improved = flips.filter(
    (row) => row.a_hit === false && row.b_hit === true
  ).length
  const regressed = flips.filter(
    (row) => row.a_hit === true && row.b_hit === false
  ).length
  return { flips, improved, regressed }
}

function buildKgDiagnosticsDiff(
  detailA: KGSearchDiagnosticsRunDetail | null,
  detailB: KGSearchDiagnosticsRunDetail | null
) {
  if (!detailA?.run || !detailB?.run) return null

  const summaryDelta = buildDiagnosticsSummaryDelta(
    diagnosticsRunSummary(detailA.run),
    diagnosticsRunSummary(detailB.run)
  )
  const byCaseA = buildDiagnosticsCaseMap(detailA.items)
  const byCaseB = buildDiagnosticsCaseMap(detailB.items)
  const allKeys = new Set<string>([...byCaseA.keys(), ...byCaseB.keys()])
  const rows = Array.from(allKeys, (key) =>
    buildDiagnosticsDiffRow(key, byCaseA, byCaseB)
  )
  const changed = rows
    .filter(isChangedDiagnosticsDiffRow)
    .sort(compareDiagnosticsDiffRows)
    .slice(0, 20)
  const { flips, improved, regressed } = countDiagnosticsHitFlips(rows)

  return {
    run_a: detailA.run,
    run_b: detailB.run,
    summary_delta: summaryDelta,
    changed_cases: changed,
    hit_flips: { total: flips.length, improved, regressed },
  }
}

function resolveInitialDiagnosticsDatasetId(
  current: string,
  datasets: DiagnosticsDatasetOption[]
): string {
  if (current.trim()) return current
  const firstDatasetId = String(datasets[0]?.id || '').trim()
  return firstDatasetId || current
}

function diagnosticsRecordOrNull(value: unknown): JsonObject | null {
  return isDiagnosticsRecord(value) ? value : null
}

function diagnosticsDatasetPlaceholder(
  datasetsLoading: boolean,
  t: (key: string) => string
): string {
  if (datasetsLoading) return '加载中...'
  return t('runConfig.datasetPlaceholder')
}

function diagnosticsEnabledLabel(
  enabled: boolean,
  t: (key: string) => string
): string {
  if (enabled) return t('workspace.enabled')
  return t('workspace.disabled')
}

function diagnosticsPersistTone(persistRun: boolean): DiagnosticsTone {
  if (persistRun) return 'neutral'
  return 'muted'
}

function diagnosticsPersistValue(persistRun: boolean): string {
  if (persistRun) return '开启'
  return '关闭'
}

function diagnosticsRunButtonLabel(
  running: boolean,
  t: (key: string) => string
): string {
  const label = t('page.actions.run')
  if (running) return `${label}…`
  return label
}

function DiagnosticsInlineStat({
  label,
  value,
  tone = 'muted',
}: Readonly<{
  label: string
  value: ReactNode
  tone?: DiagnosticsTone
}>) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1">
      <span className="text-xs text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          'font-mono text-xs tabular-nums',
          diagnosticsInlineToneClass(tone)
        )}
      >
        {value}
      </span>
    </div>
  )
}

function DiagnosticsInfoTooltip({
  label,
  children,
  side = 'right',
}: Readonly<{
  label: string
  children: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
}>) {
  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side={side}
          align="center"
          className="max-w-[260px] text-xs leading-5"
        >
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function DiagnosticsHeaderPill({
  label,
  value,
  icon,
  children,
  className,
}: Readonly<{
  label: string
  value?: ReactNode
  icon?: ReactNode
  children?: ReactNode
  className?: string
}>) {
  return (
    <div
      className={cn(
        'inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3',
        className
      )}
    >
      {icon ? (
        <span className="flex h-5 w-5 items-center justify-center text-muted-foreground">
          {icon}
        </span>
      ) : null}
      <span className="text-xs font-medium text-muted-foreground">
        {label}
      </span>
      <div className="min-w-0 flex-1">
        {children ?? (
          <span className={cn('block truncate', DIAGNOSTICS_FIELD_VALUE_CLASS)}>
            {value}
          </span>
        )}
      </div>
    </div>
  )
}

function DiagnosticsStepper({
  value,
  min,
  max,
  onChange,
}: Readonly<{
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}>) {
  return (
    <div className="flex h-9 items-center rounded-md border border-border bg-card">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-full w-10 rounded-r-none text-muted-foreground"
        aria-label="减少阈值"
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <Minus className="h-4 w-4" aria-hidden="true" />
      </Button>
      <div className="flex flex-1 items-center justify-center border-x border-border text-sm font-medium tabular-nums text-foreground">
        {value}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-full w-10 rounded-l-none text-muted-foreground"
        aria-label="增加阈值"
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  )
}

function DiagnosticsSection({
  label,
  description,
  children,
  className,
}: Readonly<{
  label: string
  description?: string
  children: ReactNode
  className?: string
}>) {
  return (
    <section
      className={cn(
        'space-y-2.5 rounded-md border border-border bg-card px-3.5 py-3',
        className
      )}
    >
      <div className="space-y-1">
        <div className={DIAGNOSTICS_SECTION_TITLE_CLASS}>{label}</div>
        {description ? (
          <p className={DIAGNOSTICS_SECTION_DESCRIPTION_CLASS}>{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  )
}

function DiagnosticsMetricTile({
  label,
  value,
  caption,
  tone = 'neutral',
  accent = 'neutral',
  icon,
}: Readonly<{
  label: string
  value: ReactNode
  caption?: ReactNode
  tone?: DiagnosticsTone
  accent?: DiagnosticsAccent
  icon?: ReactNode
}>) {
  const accentClasses = DIAGNOSTICS_ACCENT_CLASSES[accent]
  const valueClass = diagnosticsMetricValueClass(tone, accentClasses.value)
  const isPending = value === '-'

  return (
    <div
      className={cn(
        'flex min-h-[80px] flex-col items-center justify-center rounded-md border px-3 py-2.5 text-center',
        accentClasses.surface
      )}
    >
      <div
        className={cn(
          'flex items-center justify-center gap-1.5 text-xs font-medium',
          accentClasses.label
        )}
      >
        {icon ? (
          <span className="flex h-3.5 w-3.5 items-center justify-center">
            {icon}
          </span>
        ) : (
          <span
            className={cn('size-1.5 rounded-sm', accentClasses.dot)}
            aria-hidden="true"
          />
        )}
        <span>{label}</span>
      </div>
      <div
        className={cn(
          'mt-2 text-base font-semibold tabular-nums',
          valueClass
        )}
      >
        {isPending ? (
          <span className="inline-flex rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            待评测
          </span>
        ) : (
          value
        )}
      </div>
      {caption ? (
        <div
          className={cn('mt-1 text-xs leading-4', accentClasses.caption)}
        >
          {isPending ? '运行后显示' : caption}
        </div>
      ) : null}
    </div>
  )
}

function DiagnosticsToggleCard({
  title,
  description,
  badge,
  checked,
  onCheckedChange,
  tone,
  stateLabel,
}: Readonly<{
  title: string
  description?: string
  badge: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  tone: 'sky' | 'emerald'
  stateLabel: string
}>) {
  const toneClasses =
    tone === 'sky'
      ? {
          surface: 'border-border/70 bg-background',
          badge: 'text-info',
          dot: 'bg-info',
        }
      : {
          surface: 'border-border/70 bg-background',
          badge: 'text-success',
          dot: 'bg-success',
        }

  return (
    <div
      className={cn(
        'block cursor-pointer select-none rounded-md border px-3 py-2.5 transition-colors',
        toneClasses.surface
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div
                className={cn(
                  'flex items-center gap-1.5 text-xs font-medium',
                  toneClasses.badge
                )}
              >
                <span
                  className={cn('size-1.5 rounded-sm', toneClasses.dot)}
                />
                <span>{badge}</span>
              </div>
              <div className="mt-1 text-sm font-medium leading-5 text-foreground">
                {title}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="inline-flex items-center rounded-md border border-border bg-card px-2 py-0.5 text-xs text-muted-foreground">
                {stateLabel}
              </span>
              <Switch aria-label={title} checked={checked} onCheckedChange={onCheckedChange} />
            </div>
          </div>
          {description ? (
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function DiagnosticsEmptyState({
  title,
  description,
  icon,
  className,
}: Readonly<{
  title: string
  description: string
  icon?: ReactNode
  className?: string
}>) {
  return (
    <div
      className={cn(
        'rounded-md border border-dashed border-border bg-background px-4 py-6 text-center',
        className
      )}
    >
      {icon ? (
        <div className="mb-2 flex justify-center text-info">
          <div className="flex size-9 items-center justify-center rounded-md border border-info/20 bg-info/10">
            <div className="scale-75">{icon}</div>
          </div>
        </div>
      ) : null}
      <div className="text-sm font-medium text-foreground">{title}</div>
      <p className="mx-auto mt-1.5 max-w-xl text-xs leading-5 text-muted-foreground">
        {description}
      </p>
    </div>
  )
}

function DiagnosticsRunHeroPanel({
  summary,
  emptyTitle,
  emptyDescription,
}: Readonly<{
  summary: JsonObject | null
  emptyTitle: string
  emptyDescription: string
}>) {
  if (summary) {
    return (
      <div className="flex min-h-[88px] items-start gap-3 rounded-md border border-success/20 bg-success/10 px-4 py-3.5">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-success/20 bg-background text-success">
          <ClipboardList className="size-4" aria-hidden="true" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">本轮评测已完成</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            核心指标、失败样本和运行记录已经更新。
          </p>
        </div>
      </div>
    )
  }

  return (
    <DiagnosticsEmptyState
      title={emptyTitle}
      description={emptyDescription}
      icon={<ClipboardList className="size-5" aria-hidden="true" />}
    />
  )
}

function DiagnosticsFailuresPanel({
  failedCases,
  activeTab,
  onTabChange,
}: Readonly<{
  failedCases: DiagnosticsFailureCase[]
  activeTab: DiagnosticsFailureTab
  onTabChange: (value: DiagnosticsFailureTab) => void
}>) {
  return (
    <section className="rounded-md border border-border bg-background">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span>失败样本 / 错误分析</span>
          <DiagnosticsInfoTooltip label="查看失败样本与错误分析说明">
            展示本轮未命中的评测样本，以及后续错误分布汇总；优先排查这些样本通常最有效。
          </DiagnosticsInfoTooltip>
        </div>
        <div className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-border bg-card p-1">
          <button
            type="button"
            className={cn(
              'inline-flex h-6 items-center rounded-md px-2.5 text-xs font-medium transition-colors',
              diagnosticsTabClass(activeTab === 'failures')
            )}
            onClick={() => onTabChange('failures')}
          >
            失败样本
          </button>
          <button
            type="button"
            className={cn(
              'inline-flex h-6 items-center rounded-md px-2.5 text-xs font-medium transition-colors',
              diagnosticsTabClass(activeTab === 'distribution')
            )}
            onClick={() => onTabChange('distribution')}
          >
            错误分布
          </button>
        </div>
      </div>

      <div className="px-4 py-3">
        <DiagnosticsFailuresPanelBody
          activeTab={activeTab}
          failedCases={failedCases}
        />
      </div>
    </section>
  )
}

function DiagnosticsFailureCaseList({
  failedCases,
}: Readonly<{
  failedCases: DiagnosticsFailureCase[]
}>) {
  return (
    <div className="space-y-2">
      {failedCases.map((item) => (
        <div
          key={`${item.case_id}:${item.question}`}
          className="rounded-md border border-border bg-card px-3 py-2.5"
        >
          <div className="font-mono text-xs text-muted-foreground">
            {item.case_id || '--------'}
          </div>
          <div className="mt-1 text-sm leading-5 text-foreground">
            {item.question || '（无问题文本）'}
          </div>
          <div className="mt-1.5 text-xs tabular-nums text-muted-foreground">
            召回率 {String(item.recall)} · MRR {String(item.mrr)}
          </div>
        </div>
      ))}
    </div>
  )
}

function DiagnosticsFailuresPanelBody({
  activeTab,
  failedCases,
}: Readonly<{
  activeTab: DiagnosticsFailureTab
  failedCases: DiagnosticsFailureCase[]
}>) {
  if (activeTab === 'distribution') {
    return (
      <DiagnosticsEmptyState
        title="暂无错误分布"
        description="执行评测后，这里会汇总常见错误类型和分布情况。"
        icon={<Waypoints className="h-8 w-8" aria-hidden="true" />}
      />
    )
  }

  if (failedCases.length > 0) {
    return <DiagnosticsFailureCaseList failedCases={failedCases} />
  }

  return (
    <DiagnosticsEmptyState
      title="暂无失败样本"
      description="运行评测后，这里会显示失败样本详情，帮助你定位问题。"
      icon={<CircleAlert className="h-8 w-8" aria-hidden="true" />}
    />
  )
}

function DiagnosticsRunRecordsPanel({
  runs,
  runRespJson,
}: Readonly<{
  runs: KGSearchDiagnosticsRunOut[]
  runRespJson: string
}>) {
  return (
    <section className="rounded-md border border-border bg-background">
      <div className="border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span>原始结果 / 运行记录</span>
          <DiagnosticsInfoTooltip label="查看原始结果与运行记录说明">
            显示最近保存的评测运行记录，并可展开查看本次评测接口返回的原始数据。
          </DiagnosticsInfoTooltip>
        </div>
      </div>

      <div className="px-4 py-3">
        <div className="overflow-x-auto">
          <table className="min-w-[860px] text-left text-xs">
            <thead className="text-muted-foreground">
              <tr className="border-b border-border/70">
                <th className="px-2 py-1.5 font-medium">运行 ID</th>
                <th className="px-2 py-1.5 font-medium">开始时间</th>
                <th className="px-2 py-1.5 font-medium">数据集</th>
                <th className="px-2 py-1.5 font-medium">样本数</th>
                <th className="px-2 py-1.5 font-medium">前 K 条</th>
                <th className="px-2 py-1.5 font-medium">
                  主要指标（MRR / 召回率）
                </th>
                <th className="px-2 py-1.5 font-medium">状态</th>
                <th className="px-2 py-1.5 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {runs.length ? (
                runs.slice(0, 8).map((run) => {
                  const summary = diagnosticsRecordOrNull(run.summary) ?? {}
                  const params = diagnosticsRecordOrNull(run.params)
                  const maxCases =
                    diagnosticsField(run, 'max_cases') ??
                    diagnosticsField(params, 'max_cases') ??
                    '-'
                  const k =
                    diagnosticsField(run, 'k') ??
                    diagnosticsField(params, 'k') ??
                    '-'
                  const persisted =
                    diagnosticsField(run, 'persisted') ??
                    diagnosticsField(params, 'persist_run')
                  return (
                    <tr
                      key={String(run.id)}
                      className="border-b border-border/60"
                    >
                      <td className="px-2 py-2 font-mono text-foreground">
                        {String(run.id || '').slice(0, 8)}
                      </td>
                      <td className="px-2 py-2 text-muted-foreground">
                        {String(run.created_at || '').slice(0, 16) || '-'}
                      </td>
                      <td className="px-2 py-2 text-muted-foreground">
                        {String(run.dataset_id || '').slice(0, 8) || '-'}
                      </td>
                      <td className="px-2 py-2 text-muted-foreground">
                        {toTrimmedPrimitiveString(maxCases)}
                      </td>
                      <td className="px-2 py-2 text-muted-foreground">
                        {toTrimmedPrimitiveString(k)}
                      </td>
                      <td className="px-2 py-2 text-muted-foreground">
                        {toTrimmedPrimitiveString(summary?.baseline_mrr, '-')} /{' '}
                        {toTrimmedPrimitiveString(summary?.baseline_recall, '-')}
                      </td>
                      <td className="px-2 py-2 text-muted-foreground">
                        {persisted ? '已保存' : '临时'}
                      </td>
                      <td className="px-2 py-2 text-muted-foreground">-</td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={8} className="py-6">
                    <DiagnosticsEmptyState
                      title="暂无运行记录"
                      description="保存评测结果后，这里会列出历史运行记录，便于对比效果变化。"
                      icon={
                        <FileStack className="h-8 w-8" aria-hidden="true" />
                      }
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <details className="mt-2.5 rounded-md border border-border bg-card px-3 py-2.5">
          <summary className="cursor-pointer select-none text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
            查看原始数据
          </summary>
          <Textarea
            value={runRespJson}
            readOnly
            rows={12}
            className="mt-3 resize-none border-border/70 bg-background font-mono text-xs"
          />
        </details>
      </div>
    </section>
  )
}

function DiagnosticsJsonPanel({
  label,
  value,
  rows = 14,
}: Readonly<{
  label: string
  value: string
  rows?: number
}>) {
  return (
    <div className="rounded-md border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <div className="text-xs font-medium text-muted-foreground">
          {label}
        </div>
      </div>
      <details className="px-4 py-3">
        <summary className="cursor-pointer select-none text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
          展开原始数据
        </summary>
        <Textarea
          value={value}
          readOnly
          rows={rows}
          className="mt-3 resize-none border-border/70 bg-background font-mono text-xs"
        />
      </details>
    </div>
  )
}

export function KGDiagnosticsPage() {
  const t = useTranslations('KGDiagnosticsPage')
  const [datasetId, setDatasetId] = useState('')
  const [activeView, setActiveView] = useState<DiagnosticsView>('run')
  const datasetsQuery = useQuery({
    queryKey: queryKeys.datasets.exhaustive({ purpose: 'kg-diagnostics' }),
    queryFn: () => datasetApi.listAll(),
    staleTime: 30_000,
  })
  const datasets = useMemo<DiagnosticsDatasetOption[]>(() => {
    return datasetsQuery.data ?? []
  }, [datasetsQuery.data])
  const datasetsLoading = datasetsQuery.isLoading || datasetsQuery.isFetching

  const [qualityDocLimit, setQualityDocLimit] = useState(200)
  const [qualityPipelineHash, setQualityPipelineHash] = useState('')
  const [qualityLoading, setQualityLoading] = useState(false)
  const [qualityReport, setQualityReport] = useState<unknown>(null)
  const qualityJson = useMemo(
    () => prettyJson(qualityReport ?? { hint: t('qualityReport.hint') }),
    [qualityReport, t]
  )

  const [maxCases, setMaxCases] = useState(50)
  const [k, setK] = useState(10)
  const [autoExtractKg, setAutoExtractKg] = useState(true)
  const [extractSkills, setExtractSkills] = useState<'auto' | 'on' | 'off'>(
    'auto'
  )
  const [extractRelations, setExtractRelations] = useState<
    'auto' | 'on' | 'off'
  >('auto')
  const [hardcaseMode, setHardcaseMode] =
    useState<KGHardcaseMode>('deterministic')
  const [hardcasesPerFailed, setHardcasesPerFailed] = useState(4)
  const [maxFailedForHardcase, setMaxFailedForHardcase] = useState(20)
  const [llmTemperature, setLlmTemperature] = useState(0.2)
  const [persistRun, setPersistRun] = useState(true)
  const [runAnalysisTab, setRunAnalysisTab] = useState<
    'failures' | 'distribution'
  >('failures')

  const [running, setRunning] = useState(false)
  const [runResp, setRunResp] = useState<KGSearchDiagnosticsResponse | null>(
    null
  )
  const runRespJson = useMemo(
    () => prettyJson(runResp ?? { hint: t('summary.runHint') }),
    [runResp, t]
  )

  const [runsLoading, setRunsLoading] = useState(false)
  const [runs, setRuns] = useState<KGSearchDiagnosticsRunOut[]>([])
  const [selectedRunA, setSelectedRunA] = useState<string>('')
  const [selectedRunB, setSelectedRunB] = useState<string>('')
  const [detailA, setDetailA] = useState<KGSearchDiagnosticsRunDetail | null>(
    null
  )
  const [detailB, setDetailB] = useState<KGSearchDiagnosticsRunDetail | null>(
    null
  )

  useEffect(() => {
    setDatasetId((current) =>
      resolveInitialDiagnosticsDatasetId(current, datasets)
    )
  }, [datasets])

  const diff = useMemo(
    () => buildKgDiagnosticsDiff(detailA, detailB),
    [detailA, detailB]
  )

  const diffJson = useMemo(
    () => prettyJson(diff ?? { hint: t('compare.diffHint') }),
    [diff, t]
  )

  async function refreshRuns(): Promise<void> {
    const ds = datasetId.trim()
    if (!ds) {
      toast.error(t('toasts.datasetRequired'))
      return
    }
    setRunsLoading(true)
    try {
      const res = await evaluationApi.listKgSearchDiagnosticsRuns({
        dataset_id: ds,
        limit: 50,
      })
      const items = Array.isArray(res.items) ? res.items : []
      setRuns(items)
      if (!selectedRunA && items?.[0]?.id) setSelectedRunA(items[0].id)
      if (!selectedRunB && items?.[1]?.id) setSelectedRunB(items[1].id)
      if (!selectedRunB && !items?.[1]?.id && items?.[0]?.id)
        setSelectedRunB(items[0].id)
    } catch (err) {
      toast.error(formatApiError(err, t('toasts.runsLoadFailed')))
    } finally {
      setRunsLoading(false)
    }
  }

  async function loadRun(which: 'a' | 'b', runId: string): Promise<void> {
    const id = String(runId || '').trim()
    if (!id) return
    try {
      const detail = await evaluationApi.getKgSearchDiagnosticsRun(id)
      if (which === 'a') setDetailA(detail)
      else setDetailB(detail)
    } catch (err) {
      toast.error(
        formatApiError(err, t('toasts.runLoadFailed', { id: id.slice(0, 8) }))
      )
    }
  }

  async function loadQualityReport(): Promise<void> {
    const ds = datasetId.trim()
    if (!ds) {
      toast.error(t('toasts.datasetRequired'))
      return
    }
    setQualityLoading(true)
    try {
      const resp = await evaluationApi.getKgQualityReport({
        dataset_id: ds,
        document_limit: Math.max(1, Math.min(qualityDocLimit, 2000)),
        pipeline_hash: qualityPipelineHash.trim() || undefined,
      })
      setQualityReport(resp ?? null)
      setActiveView('quality')
      toast.success(t('toasts.qualityReportLoaded'))
    } catch (err) {
      toast.error(formatApiError(err, t('toasts.qualityReportLoadFailed')))
    } finally {
      setQualityLoading(false)
    }
  }

  async function runDiagnostics(): Promise<void> {
    const ds = datasetId.trim()
    if (!ds) {
      toast.error(t('toasts.datasetRequired'))
      return
    }
    setRunning(true)
    setRunResp(null)
    try {
      const resp = await evaluationApi.runKgSearchDiagnostics({
        dataset_id: ds,
        max_cases: Math.max(1, Math.min(maxCases, 200)),
        k: Math.max(1, Math.min(k, 50)),
        auto_extract_kg: Boolean(autoExtractKg),
        extract_skills:
          extractSkills === 'auto' ? null : extractSkills === 'on',
        extract_relations:
          extractRelations === 'auto' ? null : extractRelations === 'on',
        hardcase_mode: hardcaseMode,
        hardcases_per_failed_case: Math.max(
          0,
          Math.min(hardcasesPerFailed, 20)
        ),
        max_failed_cases_for_hardcase: Math.max(
          0,
          Math.min(maxFailedForHardcase, 200)
        ),
        llm_temperature: Math.max(0, Math.min(llmTemperature, 2)),
        persist_run: Boolean(persistRun),
      })
      setRunResp(resp || null)
      setActiveView('run')
      toast.success(t('toasts.diagnosticsRan'))
      if (persistRun) {
        await refreshRuns()
      }
    } catch (err) {
      toast.error(formatApiError(err, t('toasts.diagnosticsRunFailed')))
    } finally {
      setRunning(false)
    }
  }

  const summary = diagnosticsRecordOrNull(runResp?.summary)
  const runItems = useMemo(
    () => (Array.isArray(runResp?.items) ? runResp.items : []),
    [runResp?.items]
  )
  const selectedDataset = useMemo(() => {
    const selectedId = datasetId.trim()
    return (
      datasets.find(
        (dataset) => String(dataset.id || '').trim() === selectedId
      ) ?? null
    )
  }, [datasetId, datasets])
  const datasetLabel = selectedDataset?.name || datasetId.trim() || '未选择'
  const qualityObject = diagnosticsRecordOrNull(qualityReport)
  const qualityHighlights = useMemo(() => {
    if (!qualityObject) return []
    return Object.entries(qualityObject)
      .filter(([, value]) =>
        ['string', 'number', 'boolean'].includes(typeof value)
      )
      .slice(0, 8)
  }, [qualityObject])
  const failedCases = useMemo(() => {
    return runItems
      .map((item) => {
        const metrics = extractBaselineMetrics(item)
        if (!metrics || metrics.hit_at_k) return null
        return {
          case_id: String(item?.case_id || '').slice(0, 8),
          question: String(item?.question || '').trim(),
          recall: metrics.recall,
          mrr: metrics.mrr,
        }
      })
      .filter(Boolean)
      .slice(0, 12) as Array<{
      case_id: string
      question: string
      recall: number
      mrr: number
    }>
  }, [runItems])
  const diffSummaryEntries = useMemo(
    () => Object.entries(diff?.summary_delta || {}),
    [diff]
  )

  function handleDatasetChange(nextDatasetId: string): void {
    setDatasetId(nextDatasetId)
    setRunResp(null)
    setQualityReport(null)
    setQualityPipelineHash('')
    setRuns([])
    setSelectedRunA('')
    setSelectedRunB('')
    setDetailA(null)
    setDetailB(null)
    setActiveView('run')
  }

  return (
    <AppFrame showBackground={false}>
      <div className="h-full overflow-y-auto bg-background">
        <div className="flex min-h-full flex-col">
          <header className="shrink-0 border-b border-border px-4 py-4 md:px-6">
            <PageHeader
              title={t('page.title')}
              description={t('page.description')}
              iconImage="kg-retrieval-evaluation"
              icon={ClipboardList}
              iconColor="text-info"
              compact
              className="p-0"
            >
              <div className={DIAGNOSTICS_HEADER_ACTION_DOCK_CLASS}>
                <DiagnosticsHeaderPill
                  label={t('runConfig.datasetId')}
                  className="min-w-[208px] max-w-[300px]"
                >
                  <Select
                    value={datasetId}
                    onValueChange={handleDatasetChange}
                    disabled={datasetsLoading || !datasets.length}
                  >
                    <SelectTrigger
                      aria-label={t('runConfig.datasetId')}
                      className="h-auto min-h-0 border-0 bg-transparent px-0 py-0 text-right text-xs font-medium shadow-none focus-visible:ring-2 focus-visible:ring-ring/30 [&>svg]:ml-2 [&>svg]:size-3.5"
                    >
                      <SelectValue
                        placeholder={diagnosticsDatasetPlaceholder(
                          datasetsLoading,
                          t
                        )}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {datasets.map((dataset) => {
                        const id = String(dataset.id || '').trim()
                        if (!id) return null
                        return (
                          <SelectItem key={id} value={id}>
                            {dataset.name || id}
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                </DiagnosticsHeaderPill>
                <DiagnosticsHeaderPill
                  label={t('runConfig.k')}
                  className="min-w-[104px]"
                >
                  <Input
                    type="number"
                    value={String(k)}
                    onChange={(e) => setK(Number(e.target.value || 0))}
                    min={1}
                    max={50}
                    className="h-auto border-0 bg-transparent px-0 py-0 text-right text-xs font-medium shadow-none focus-visible:ring-2 focus-visible:ring-ring/30"
                  />
                </DiagnosticsHeaderPill>
                <Button
                  variant="outline"
                  className={DIAGNOSTICS_HEADER_ACTION_BUTTON_CLASS}
                  onClick={() => {
                    setActiveView('compare')
                    if (datasetId.trim()) void refreshRuns()
                  }}
                >
                  <History className="h-4 w-4" aria-hidden="true" />
                  {t('runs.title')}
                </Button>
              </div>
            </PageHeader>
          </header>

          <div className="flex-1 px-4 py-4 md:px-6 xl:min-h-0 xl:overflow-hidden">
            <div className="grid gap-4 xl:h-full xl:min-h-0 xl:grid-cols-[340px_minmax(0,1fr)]">
              <aside className="rounded-md border border-border bg-background xl:min-h-0">
                <div className="flex flex-col xl:h-full xl:min-h-0">
                  <div className="p-3 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
                    <div className="space-y-2.5">
                      <DiagnosticsSection
                        label={t('runConfig.title')}
                        className="rounded-md px-3.5 py-2.5"
                      >
                        <div className="space-y-2.5">
                          <div className="space-y-1">
                            <div
                              className={cn(
                                'flex items-center gap-1',
                                DIAGNOSTICS_FIELD_LABEL_CLASS
                              )}
                            >
                              <span>阈值设置</span>
                              <DiagnosticsInfoTooltip label="查看阈值设置说明">
                                控制本轮最多抽取多少条评测样本。数值越大覆盖越充分，但评测耗时也会更长。
                              </DiagnosticsInfoTooltip>
                            </div>
                            <DiagnosticsStepper
                              value={maxCases}
                              min={1}
                              max={200}
                              onChange={setMaxCases}
                            />
                          </div>

                          <div className="space-y-1">
                            <Label className={DIAGNOSTICS_FIELD_LABEL_CLASS}>
                              {t('runConfig.llmTemperature')}
                            </Label>
                            <Select
                              value={String(llmTemperature)}
                              onValueChange={(value) =>
                                setLlmTemperature(Number(value))
                              }
                            >
                              <SelectTrigger
                                className={cn(
                                  'h-9 rounded-md border-border bg-card shadow-none',
                                  DIAGNOSTICS_FIELD_VALUE_CLASS
                                )}
                              >
                                <SelectValue placeholder="0.2" />
                              </SelectTrigger>
                              <SelectContent>
                                {[
                                  '0',
                                  '0.1',
                                  '0.2',
                                  '0.3',
                                  '0.5',
                                  '0.7',
                                  '1.0',
                                ].map((value) => (
                                  <SelectItem key={value} value={value}>
                                    {value}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-1">
                            <Label
                              title={t('runConfig.extractSkills')}
                              className={DIAGNOSTICS_FIELD_LABEL_CLASS}
                            >
                              技能抽取
                            </Label>
                            <Select
                              value={extractSkills}
                              onValueChange={(value) =>
                                setExtractSkills(
                                  coerceOneOf(
                                    KG_EXTRACT_MODE_VALUES,
                                    value,
                                    'auto'
                                  )
                                )
                              }
                            >
                              <SelectTrigger
                                className={cn(
                                  'h-9 rounded-md border-border bg-card shadow-none',
                                  DIAGNOSTICS_FIELD_VALUE_CLASS
                                )}
                              >
                                <SelectValue
                                  placeholder={t(
                                    'runConfig.extractModePlaceholder'
                                  )}
                                />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="auto">自动</SelectItem>
                                <SelectItem value="on">开启</SelectItem>
                                <SelectItem value="off">关闭</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-1">
                            <Label
                              title={t('runConfig.extractRelations')}
                              className={DIAGNOSTICS_FIELD_LABEL_CLASS}
                            >
                              关系抽取
                            </Label>
                            <Select
                              value={extractRelations}
                              onValueChange={(value) =>
                                setExtractRelations(
                                  coerceOneOf(
                                    KG_EXTRACT_MODE_VALUES,
                                    value,
                                    'auto'
                                  )
                                )
                              }
                            >
                              <SelectTrigger
                                className={cn(
                                  'h-9 rounded-md border-border bg-card shadow-none',
                                  DIAGNOSTICS_FIELD_VALUE_CLASS
                                )}
                              >
                                <SelectValue
                                  placeholder={t(
                                    'runConfig.extractModePlaceholder'
                                  )}
                                />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="auto">自动</SelectItem>
                                <SelectItem value="on">开启</SelectItem>
                                <SelectItem value="off">关闭</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <details className="rounded-md border border-dashed border-border bg-card px-3 py-2">
                            <summary className="cursor-pointer select-none text-xs font-medium leading-5 text-muted-foreground">
                              高级参数
                            </summary>
                            <div className="mt-3 space-y-3">
                              <div className="space-y-1">
                                <Label
                                  className={DIAGNOSTICS_FIELD_LABEL_CLASS}
                                >
                                  {t('runConfig.hardcaseMode')}
                                </Label>
                                <Select
                                  value={hardcaseMode}
                                  onValueChange={(v) =>
                                    setHardcaseMode(v as KGHardcaseMode)
                                  }
                                >
                                  <SelectTrigger
                                    className={cn(
                                      'h-9 rounded-md border-border bg-background shadow-none',
                                      DIAGNOSTICS_FIELD_VALUE_CLASS
                                    )}
                                  >
                                    <SelectValue
                                      placeholder={t(
                                        'runConfig.hardcaseModePlaceholder'
                                      )}
                                    />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="off">关闭</SelectItem>
                                    <SelectItem value="deterministic">
                                      规则生成
                                    </SelectItem>
                                    <SelectItem value="llm">
                                      模型生成
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="grid gap-3 md:grid-cols-2">
                                <div className="space-y-1">
                                  <Label
                                    className={DIAGNOSTICS_FIELD_LABEL_CLASS}
                                  >
                                    {t('runConfig.hardcasesPerFailedCase')}
                                  </Label>
                                  <Input
                                    type="number"
                                    value={String(hardcasesPerFailed)}
                                    onChange={(e) =>
                                      setHardcasesPerFailed(
                                        Number(e.target.value || 0)
                                      )
                                    }
                                    min={0}
                                    max={20}
                                    className={cn(
                                      'h-9 rounded-md border-border bg-background shadow-none',
                                      DIAGNOSTICS_FIELD_VALUE_CLASS
                                    )}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label
                                    className={DIAGNOSTICS_FIELD_LABEL_CLASS}
                                  >
                                    {t('runConfig.maxFailedCasesForHardcase')}
                                  </Label>
                                  <Input
                                    type="number"
                                    value={String(maxFailedForHardcase)}
                                    onChange={(e) =>
                                      setMaxFailedForHardcase(
                                        Number(e.target.value || 0)
                                      )
                                    }
                                    min={0}
                                    max={200}
                                    className={cn(
                                      'h-9 rounded-md border-border bg-background shadow-none',
                                      DIAGNOSTICS_FIELD_VALUE_CLASS
                                    )}
                                  />
                                </div>
                              </div>
                            </div>
                          </details>
                        </div>
                      </DiagnosticsSection>

                      <DiagnosticsSection
                        label={t('workspace.extractionOptions')}
                        description={t('workspace.extractionHint')}
                        className="rounded-md px-3.5 py-2.5"
                      >
                        <div className="space-y-2">
                          <DiagnosticsToggleCard
                            title={t('runConfig.autoExtractKg')}
                            description={t('workspace.autoExtractHint')}
                            badge={t('workspace.autoExtractBadge')}
                            checked={autoExtractKg}
                            onCheckedChange={setAutoExtractKg}
                            tone="sky"
                            stateLabel={diagnosticsEnabledLabel(autoExtractKg, t)}
                          />
                          <DiagnosticsToggleCard
                            title={t('runConfig.persistRun')}
                            description={t('runs.hint')}
                            badge={t('workspace.persistRunBadge')}
                            checked={persistRun}
                            onCheckedChange={setPersistRun}
                            tone="emerald"
                            stateLabel={diagnosticsEnabledLabel(persistRun, t)}
                          />
                        </div>
                      </DiagnosticsSection>
                    </div>
                  </div>

                  <div className="shrink-0 border-t border-border bg-background px-3 py-3">
                    <div className={DIAGNOSTICS_ACTION_CARD_CLASS}>
                      <div className="mb-2 px-1">
                        <div className="text-xs font-semibold text-foreground">
                          运行操作
                        </div>
                      </div>

                      <div className="mb-2 flex flex-wrap items-center gap-1.5">
                        <DiagnosticsInlineStat label="样本" value={maxCases} />
                        <DiagnosticsInlineStat label="前 K 条" value={k} />
                        <DiagnosticsInlineStat
                          label="保存"
                          value={persistRun ? '开启' : '关闭'}
                          tone={diagnosticsPersistTone(persistRun)}
                        />
                      </div>

                      <Button
                        className={DIAGNOSTICS_PRIMARY_ACTION_BUTTON_CLASS}
                        onClick={runDiagnostics}
                        disabled={running}
                      >
                        <PlayCircle className="h-4 w-4" aria-hidden="true" />
                        {diagnosticsRunButtonLabel(running, t)}
                      </Button>

                      <div className="mt-2 grid grid-cols-2 gap-1.5">
                        <Button
                          variant="outline"
                          className={DIAGNOSTICS_SECONDARY_ACTION_BUTTON_CLASS}
                          onClick={refreshRuns}
                          disabled={runsLoading}
                        >
                          <RefreshCcw className="h-4 w-4" aria-hidden="true" />
                          {t('page.actions.refreshRuns')}
                        </Button>
                        <Button
                          variant="outline"
                          className={DIAGNOSTICS_SECONDARY_ACTION_BUTTON_CLASS}
                          onClick={() => {
                            const base = sanitizeFilename(
                              `kg_diagnostics_${datasetId.trim() || 'dataset'}`
                            )
                            downloadJson(runResp ?? {}, `${base}.json`)
                            toast.success(t('toasts.runExported'))
                          }}
                          disabled={!runResp}
                        >
                          <Download className="h-4 w-4" aria-hidden="true" />
                          {t('page.actions.exportRun')}
                        </Button>
                      </div>

                      <p className="mt-2 px-1 text-xs leading-5 text-muted-foreground">
                        {t('summary.runHint')}
                      </p>
                    </div>
                  </div>
                </div>
              </aside>

              <section className="min-h-[620px] min-w-0 rounded-md border border-border bg-background xl:min-h-0">
                <Tabs
                  value={activeView}
                  onValueChange={(value) =>
                    setActiveView(value as DiagnosticsView)
                  }
                  className="flex h-full min-h-0 flex-col"
                >
                  <div className="shrink-0 border-b border-border/70 px-4 pt-3">
                    <TabsList className="h-auto justify-start gap-5 rounded-none border-none bg-transparent p-0">
                      <TabsTrigger
                        value="run"
                        className="rounded-none border-b-2 border-transparent px-0 pb-2.5 pt-0 text-xs font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none"
                      >
                        {t('summary.title')}
                      </TabsTrigger>
                      <TabsTrigger
                        value="quality"
                        title={t('qualityReport.title')}
                        className="rounded-none border-b-2 border-transparent px-0 pb-2.5 pt-0 text-xs font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none"
                      >
                        质量报告
                      </TabsTrigger>
                      <TabsTrigger
                        value="compare"
                        className="rounded-none border-b-2 border-transparent px-0 pb-2.5 pt-0 text-xs font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none"
                      >
                        {t('compare.title')}
                      </TabsTrigger>
                    </TabsList>

                    <div className="flex flex-wrap items-center gap-2 py-2.5">
                      <DiagnosticsHeaderPill
                        label={t('runConfig.datasetId')}
                        value={datasetLabel}
                        className="min-w-[148px]"
                      />
                      <DiagnosticsHeaderPill
                        label={t('runConfig.maxCases')}
                        value={maxCases}
                        className="min-w-[132px]"
                      />
                      <DiagnosticsHeaderPill
                        label={t('runConfig.k')}
                        value={k}
                        className="min-w-[112px]"
                      />
                    </div>
                  </div>

                  <TabsContent
                    value="run"
                    className="mt-0 min-h-0 flex-1 overflow-auto px-4 py-3"
                  >
                    <div className="space-y-3">
                      <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-6">
                        <DiagnosticsMetricTile
                          label={t('summary.baselineHitRate')}
                          value={formatMetricValue(summary?.baseline_hit_rate)}
                          caption="整体是否命中参考基础指标"
                          accent="sky"
                          icon={
                            <Target className="h-4 w-4" aria-hidden="true" />
                          }
                        />
                        <DiagnosticsMetricTile
                          label={t('summary.baselineMrr')}
                          value={formatMetricValue(summary?.baseline_mrr)}
                          caption="命中位置越靠前越好"
                          accent="violet"
                          icon={
                            <TrendingUp
                              className="h-4 w-4"
                              aria-hidden="true"
                            />
                          }
                        />
                        <DiagnosticsMetricTile
                          label={t('summary.baselineRecall')}
                          value={formatMetricValue(summary?.baseline_recall)}
                          caption="召回覆盖越高越好"
                          accent="emerald"
                          icon={
                            <RefreshCcw
                              className="h-4 w-4"
                              aria-hidden="true"
                            />
                          }
                        />
                        <DiagnosticsMetricTile
                          label={t('summary.baselineNdcg')}
                          value={formatMetricValue(summary?.baseline_ndcg)}
                          caption="兼顾命中位置与排序质量"
                          accent="sky"
                          icon={
                            <Activity className="h-4 w-4" aria-hidden="true" />
                          }
                        />
                        <DiagnosticsMetricTile
                          label={t('summary.baselineMap')}
                          value={formatMetricValue(summary?.baseline_map)}
                          caption="多位置平均精度"
                          accent="violet"
                          icon={
                            <Waypoints className="h-4 w-4" aria-hidden="true" />
                          }
                        />
                        <DiagnosticsMetricTile
                          label={t('summary.hardcasesGenerated')}
                          value={formatMetricValue(
                            summary?.hardcases_generated
                          )}
                          caption="深挖样本生成的案例数量"
                          accent="amber"
                          icon={
                            <Sparkles className="h-4 w-4" aria-hidden="true" />
                          }
                        />
                      </div>

                      <DiagnosticsRunHeroPanel
                        summary={summary}
                        emptyTitle={t('summary.empty')}
                        emptyDescription={t('summary.runHint')}
                      />

                      <div className="grid gap-3 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
                        <DiagnosticsFailuresPanel
                          failedCases={failedCases}
                          activeTab={runAnalysisTab}
                          onTabChange={setRunAnalysisTab}
                        />
                        <DiagnosticsRunRecordsPanel
                          runs={runs}
                          runRespJson={runRespJson}
                        />
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="quality" className="mt-0 min-h-0 flex-1">
                    <div className="flex h-full min-h-0 flex-col">
                      <div className="border-b border-border/70 px-4 py-4">
                        <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)] xl:grid-cols-[180px_minmax(0,1fr)_auto]">
                          <div className="space-y-1.5">
                            <Label className={DIAGNOSTICS_FIELD_LABEL_CLASS}>
                              {t('qualityReport.documentLimit')}
                            </Label>
                            <Input
                              type="number"
                              value={String(qualityDocLimit)}
                              onChange={(e) =>
                                setQualityDocLimit(Number(e.target.value || 0))
                              }
                              min={1}
                              max={2000}
                              className="h-10 rounded-md border-border bg-card text-sm shadow-none"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className={DIAGNOSTICS_FIELD_LABEL_CLASS}>
                              {t('qualityReport.pipelineHash')}
                            </Label>
                            <Input
                              value={qualityPipelineHash}
                              onChange={(e) =>
                                setQualityPipelineHash(e.target.value)
                              }
                              placeholder={t(
                                'qualityReport.pipelineHashPlaceholder'
                              )}
                              className="h-10 rounded-md border-border bg-card font-mono text-xs shadow-none"
                            />
                          </div>
                          <div className="flex items-end">
                            <Button
                              variant="outline"
                              className={cn(
                                DIAGNOSTICS_SECONDARY_ACTION_BUTTON_CLASS,
                                'h-10 px-3'
                              )}
                              onClick={loadQualityReport}
                              disabled={qualityLoading}
                            >
                              <RefreshCcw
                                className="h-4 w-4"
                                aria-hidden="true"
                              />
                              {t('qualityReport.pull')}
                            </Button>
                          </div>
                        </div>
                        <p className="mt-3 text-xs leading-5 text-muted-foreground">
                          {t('qualityReport.hint')}
                        </p>
                      </div>

                      <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
                        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
                          <div className="space-y-4">
                            {qualityObject ? (
                              <div className="rounded-md border border-border bg-card">
                                <div className="border-b border-border px-4 py-3">
                                  <div className="text-xs font-medium text-muted-foreground">
                                    {t('workspace.qualityHighlightsTitle')}
                                  </div>
                                </div>
                                <div className="grid gap-3 px-4 py-4 md:grid-cols-2">
                                  <DiagnosticsMetricTile
                                    label={t('workspace.qualityKeyCount')}
                                    value={Object.keys(qualityObject).length}
                                    caption={t('workspace.qualityKeyCountHint')}
                                  />
                                  <DiagnosticsMetricTile
                                    label={t('qualityReport.documentLimit')}
                                    value={qualityDocLimit}
                                    caption={
                                      qualityPipelineHash.trim() ||
                                      t('workspace.currentPipelineLabel')
                                    }
                                  />
                                  {qualityHighlights.map(([key, value]) => (
                                    <DiagnosticsMetricTile
                                      key={key}
                                      label={formatDiagnosticsMetricLabel(key)}
                                      value={formatMetricValue(value)}
                                      tone="neutral"
                                    />
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <DiagnosticsEmptyState
                                title={t('workspace.qualityEmptyTitle')}
                                description={t('qualityReport.hint')}
                              />
                            )}
                          </div>

                          <DiagnosticsJsonPanel
                            label={t('workspace.rawQualityJson')}
                            value={qualityJson}
                            rows={18}
                          />
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="compare" className="mt-0 min-h-0 flex-1">
                    <div className="flex h-full min-h-0 flex-col">
                      <div className="border-b border-border/70 px-4 py-4">
                        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
                          <div className="space-y-1.5">
                            <Label className={DIAGNOSTICS_FIELD_LABEL_CLASS}>
                              {t('runs.runA')}
                            </Label>
                            <div className="flex flex-col gap-2 sm:flex-row">
                              <Select
                                value={selectedRunA}
                                onValueChange={(v) => setSelectedRunA(v)}
                              >
                                <SelectTrigger className="h-10 rounded-md border-border bg-card text-sm shadow-none">
                                  <SelectValue
                                    placeholder={t('runs.runAPlaceholder')}
                                  />
                                </SelectTrigger>
                                <SelectContent>
                                  {runs.map((r) => (
                                    <SelectItem key={r.id} value={r.id}>
                                      {String(r.created_at || '').slice(0, 19)}{' '}
                                      · {String(r.id).slice(0, 8)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button
                                variant="outline"
                                className={cn(
                                  DIAGNOSTICS_SECONDARY_ACTION_BUTTON_CLASS,
                                  'h-10 px-3'
                                )}
                                onClick={() => loadRun('a', selectedRunA)}
                                disabled={!selectedRunA}
                              >
                                {t('runs.loadA')}
                              </Button>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <Label className={DIAGNOSTICS_FIELD_LABEL_CLASS}>
                              {t('runs.runB')}
                            </Label>
                            <div className="flex flex-col gap-2 sm:flex-row">
                              <Select
                                value={selectedRunB}
                                onValueChange={(v) => setSelectedRunB(v)}
                              >
                                <SelectTrigger className="h-10 rounded-md border-border bg-card text-sm shadow-none">
                                  <SelectValue
                                    placeholder={t('runs.runBPlaceholder')}
                                  />
                                </SelectTrigger>
                                <SelectContent>
                                  {runs.map((r) => (
                                    <SelectItem key={r.id} value={r.id}>
                                      {String(r.created_at || '').slice(0, 19)}{' '}
                                      · {String(r.id).slice(0, 8)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button
                                variant="outline"
                                className={cn(
                                  DIAGNOSTICS_SECONDARY_ACTION_BUTTON_CLASS,
                                  'h-10 px-3'
                                )}
                                onClick={() => loadRun('b', selectedRunB)}
                                disabled={!selectedRunB}
                              >
                                {t('runs.loadB')}
                              </Button>
                            </div>
                          </div>

                          <div className="flex items-end">
                            <Button
                              variant="outline"
                              className={cn(
                                DIAGNOSTICS_SECONDARY_ACTION_BUTTON_CLASS,
                                'h-10 px-3'
                              )}
                              onClick={refreshRuns}
                              disabled={runsLoading}
                            >
                              <RefreshCcw
                                className="h-4 w-4"
                                aria-hidden="true"
                              />
                              {t('runs.refresh')}
                            </Button>
                          </div>

                          <div className="flex items-end">
                            <Button
                              variant="outline"
                              className={cn(
                                DIAGNOSTICS_SECONDARY_ACTION_BUTTON_CLASS,
                                'h-10 px-3'
                              )}
                              onClick={() => {
                                const a =
                                  String(detailA?.run?.id || '').slice(0, 8) ||
                                  'A'
                                const b =
                                  String(detailB?.run?.id || '').slice(0, 8) ||
                                  'B'
                                const diffName = sanitizeFilename(`kg_diagnostics_diff_${a}_vs_${b}`)
                                downloadJson(
                                  diff ?? {},
                                  `${diffName}.json`
                                )
                                toast.success(t('compare.exported'))
                              }}
                              disabled={!diff}
                            >
                              <Download
                                className="h-4 w-4"
                                aria-hidden="true"
                              />
                              {t('compare.export')}
                            </Button>
                          </div>
                        </div>

                        <p className="mt-3 text-xs leading-5 text-muted-foreground">
                          {t('runs.hint')}
                        </p>
                      </div>

                      <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
                        {diff ? (
                          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_420px]">
                            <div className="space-y-4">
                              <div className="grid gap-3 md:grid-cols-4">
                                <DiagnosticsMetricTile
                                  label={t('compare.hitFlips')}
                                  value={diff.hit_flips.total}
                                />
                                <DiagnosticsMetricTile
                                  label={t('workspace.compareImproved')}
                                  value={diff.hit_flips.improved}
                                  tone="positive"
                                />
                                <DiagnosticsMetricTile
                                  label={t('workspace.compareRegressed')}
                                  value={diff.hit_flips.regressed}
                                  tone="negative"
                                />
                                <DiagnosticsMetricTile
                                  label={t('compare.summaryKeys')}
                                  value={diffSummaryEntries.length}
                                />
                              </div>

                              <div className="rounded-md border border-border bg-card">
                                <div className="border-b border-border px-4 py-3">
                                  <div className="text-xs font-medium text-muted-foreground">
                                    {t('compare.changedCases')}
                                  </div>
                                </div>
                                <div className="px-4 py-4">
                                  {diff.changed_cases?.length ? (
                                    <div className="grid gap-2">
                                      {diff.changed_cases.map((r) => (
                                        <div
                                          key={r.case_id}
                                          className="rounded-md border border-border bg-background px-3 py-3"
                                        >
                                          <div className="font-mono text-xs text-muted-foreground">
                                            {String(r.case_id).slice(0, 8)}
                                          </div>
                                          <div className="mt-1 text-sm text-foreground">
                                            {r.question ||
                                              t('compare.noQuestion')}
                                          </div>
                                          <div className="mt-2 text-xs leading-5 tabular-nums text-muted-foreground">
                                            命中 {String(r.a_hit)} →{' '}
                                            {String(r.b_hit)} · 召回率{' '}
                                            {String(r.a_recall)} →{' '}
                                            {String(r.b_recall)} · 变化{' '}
                                            {String(r.delta_recall)}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <DiagnosticsEmptyState
                                      title={t(
                                        'workspace.compareCasesEmptyTitle'
                                      )}
                                      description={t('compare.diffHint')}
                                    />
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="space-y-4">
                              <div className="rounded-md border border-border bg-card">
                                <div className="border-b border-border px-4 py-3">
                                  <div className="text-xs font-medium text-muted-foreground">
                                    {t('workspace.compareSummaryTitle')}
                                  </div>
                                </div>
                                <div className="px-4 py-4">
                                  {diffSummaryEntries.length ? (
                                    <div className="grid gap-2">
                                      {diffSummaryEntries.map(
                                        ([key, value]) => {
                                          const row = value as {
                                            a?: number | null
                                            b?: number | null
                                            delta?: number | null
                                          }
                                          const delta = Number(row.delta ?? 0)
                                          return (
                                            <div
                                              key={key}
                                              className="rounded-md border border-border bg-background px-3 py-3"
                                            >
                                              <div className="text-xs text-muted-foreground">
                                                {formatDiagnosticsMetricLabel(
                                                  key
                                                )}
                                              </div>
                                              <div className="mt-1 text-sm font-medium tabular-nums text-foreground">
                                                {String(row.a ?? '-')} →{' '}
                                                {String(row.b ?? '-')}
                                              </div>
                                              <div
                                                className={cn(
                                                  'mt-1 text-xs tabular-nums',
                                                  diagnosticsDeltaClass(delta)
                                                )}
                                              >
                                                Δ {String(row.delta ?? '-')}
                                              </div>
                                            </div>
                                          )
                                        }
                                      )}
                                    </div>
                                  ) : (
                                    <DiagnosticsEmptyState
                                      title={t(
                                        'workspace.compareSummaryEmptyTitle'
                                      )}
                                      description={t('compare.diffHint')}
                                    />
                                  )}
                                </div>
                              </div>

                              <DiagnosticsJsonPanel
                                label={t('compare.diffJson')}
                                value={diffJson}
                                rows={18}
                              />
                            </div>
                          </div>
                        ) : (
                          <DiagnosticsEmptyState
                            title={t('workspace.compareEmptyTitle')}
                            description={t('compare.empty')}
                          />
                        )}
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </section>
            </div>
          </div>
        </div>
      </div>
    </AppFrame>
  )
}
