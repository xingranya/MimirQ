'use client'

import { useQuery } from '@tanstack/react-query'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import {
  Activity,
  BarChart3,
  CheckCircle2,
  Clock,
  Copy,
  Cpu,
  Database,
  FileJson,
  Gauge,
  Hash,
  RefreshCcw,
  ShieldCheck,
  Timer,
  Zap,
  ChevronDown,
  Terminal,
  Eraser,
  Search,
  Settings2,
  LayoutGrid,
  ShieldAlert,
  Info,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AppFrame } from '@/components/app-frame'
import { PageScaffold } from '@/components/ui/page-scaffold'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useBackendHealth } from '@/hooks/use-backend-health'
import { useBackendMetaDetails } from '@/hooks/use-backend-meta'
import { formatApiError } from '@/lib/api-errors'
import { datasetApi, documentApi, observabilityApi, ragApi } from '@/lib/api'
import { API_V1_BASE_URL } from '@/lib/env'
import { queryKeys } from '@/lib/query-keys'
import { cn } from '@/lib/utils'
import type {
  Dataset,
  DepsDiagnosticsResponse,
  Document as KnowledgeDocument,
  DocumentList,
  JsonObject,
  OnlineQualitySummaryResponse,
  PromptPreviewResponse,
} from '@/types'

const CARD_BASE =
  'min-w-0 bg-card p-4'
const SECTION_TITLE =
  'mb-4 flex items-center gap-2 text-sm font-semibold text-foreground'
const FIELD_LABEL = 'mb-1.5 block text-xs font-medium text-muted-foreground'
const ALL_DOCUMENTS_VALUE = '__all_documents__'
const EMPTY_DATASETS: Dataset[] = []
const EMPTY_DOCUMENTS: KnowledgeDocument[] = []
const PENDING_RUN_LABEL = '待执行'
const MISSING_RESULT_LABEL = '未返回'

const DIAGNOSTIC_DIMENSIONS = [
  {
    id: 'retrieval_accuracy',
    icon: Search,
    title: '知识检索准确性',
    subtitle: '检索是否准确',
  },
  {
    id: 'retrieval_recall',
    icon: CheckCircle2,
    title: '检索召回率',
    subtitle: '内容是否充分',
  },
  {
    id: 'context_relevance',
    icon: LayoutGrid,
    title: '上下文相关性',
    subtitle: '上下文关联度',
  },
  {
    id: 'generation_quality',
    icon: Activity,
    title: '生成质量',
    subtitle: '回答质量评估',
  },
  {
    id: 'fact_consistency',
    icon: ShieldCheck,
    title: '事实一致性',
    subtitle: '事实是否一致',
  },
  {
    id: 'safety_compliance',
    icon: ShieldCheck,
    title: '安全合规性',
    subtitle: '内容安全合规',
  },
  {
    id: 'cost_analysis',
    icon: Cpu,
    title: '成本分析',
    subtitle: '成本与资源使用',
  },
  {
    id: 'execution_perf',
    icon: Gauge,
    title: '执行性能',
    subtitle: '延迟与吞吐量',
  },
] as const

type DiagnosticDimensionId = (typeof DIAGNOSTIC_DIMENSIONS)[number]['id']
type MetricTone = 'slate' | 'green' | 'amber' | 'red' | 'blue' | 'purple'
type BinaryStatusTone = Exclude<MetricTone, 'purple'>

// --- Helper Functions ---

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function isDiagnosticRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function diagnosticField(source: unknown, key: string): unknown {
  return isDiagnosticRecord(source) ? source[key] : undefined
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function pickMetricNumber(source: unknown, keys: string[]): number | null {
  if (!isDiagnosticRecord(source)) return null
  for (const k of keys) {
    const v = source[k]
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && Number.isFinite(Number(v))) return Number(v)
  }
  return null
}

function pickMetricNumberByPath(source: unknown, paths: string[]): number | null {
  if (!isDiagnosticRecord(source)) return null
  for (const path of paths) {
    let value: unknown = source
    for (const key of path.split('.')) {
      value = diagnosticField(value, key)
      if (value === undefined) break
    }
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && Number.isFinite(Number(value))) {
      return Number(value)
    }
  }
  return null
}

function fmtScore(v: number | null, d = 2) {
  return v === null ? PENDING_RUN_LABEL : v.toFixed(d)
}

function fmtMetric(v: number | null, d = 2, suffix = '') {
  if (v === null) return PENDING_RUN_LABEL
  return `${v.toFixed(d)}${suffix}`
}

function fmtExecutedMetric(v: number | null, d = 2, suffix = '') {
  if (v === null) return MISSING_RESULT_LABEL
  return `${v.toFixed(d)}${suffix}`
}

function fmtMetricOrMissing(
  hasResult: boolean,
  value: number | null,
  d = 2,
  suffix = ''
) {
  if (value !== null) return `${value.toFixed(d)}${suffix}`
  return hasResult ? MISSING_RESULT_LABEL : PENDING_RUN_LABEL
}

function fmtCountOrMissing(
  hasResult: boolean,
  value: number | null,
  suffix = ''
) {
  if (value !== null) return `${value.toLocaleString()}${suffix}`
  return hasResult ? MISSING_RESULT_LABEL : PENDING_RUN_LABEL
}

function isPendingMetricLabel(value: string) {
  return value === PENDING_RUN_LABEL || value === MISSING_RESULT_LABEL
}

function fmtDateTime(value?: string | null) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
    .format(date)
    .replaceAll('/', '-')
}

function metricTone(v: number | null): MetricTone {
  if (v === null) return 'slate'
  if (v >= 0.8) return 'green'
  if (v >= 0.6) return 'amber'
  return 'red'
}

function shortId(value?: string | null, size = 8) {
  if (!value) return '--'
  return value.length > size ? `${value.slice(0, size)}...` : value
}

function datasetLabel(dataset: Dataset) {
  return dataset.name || shortId(dataset.id)
}

function documentLabel(document: KnowledgeDocument) {
  return document.filename || shortId(document.id)
}

function getListItems<T>(
  source: { items?: T[] } | T[] | null | undefined,
  fallback: T[]
): T[] {
  if (Array.isArray(source)) return source
  if (source && typeof source === 'object' && Array.isArray(source.items)) {
    return source.items
  }
  return fallback
}

function metricSource(hasResult: boolean, source: string) {
  return hasResult ? source : '等待运行'
}

function diagnosticString(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value)
  }
  return ''
}

function diagnosticRecordString(
  value: Record<string, unknown>,
  keys: string[]
): string {
  for (const key of keys) {
    const label = diagnosticString(value[key])
    if (label) return label
  }
  return ''
}

function firstDiagnosticString(...values: unknown[]): string {
  for (const value of values) {
    const label = diagnosticString(value)
    if (label) return label
  }
  return ''
}

function dependencyStatus(value: unknown): string {
  if (!value || typeof value !== 'object') return 'unknown'
  const record = value as Record<string, unknown>
  const status = diagnosticRecordString(record, [
    'status',
    'state',
    'value',
    'label',
  ]).toLowerCase()
  if (status) return status
  if (record.ok === true) return 'connected'
  if (record.ok === false) return 'disconnected'
  return 'unknown'
}

function driftResultLabel(
  snapshot: JsonObject | null,
  metric: number | null
) {
  if (!snapshot) return PENDING_RUN_LABEL
  if (metric === null) return MISSING_RESULT_LABEL
  return `${metric.toFixed(3)} 漂移率`
}

function perfGateResultStatus(result: JsonObject | null) {
  if (!result) return PENDING_RUN_LABEL
  return (
    diagnosticRecordString(result, ['status', 'gate_status', 'result']) ||
    '已运行'
  )
}

function perfGateResultTone(
  result: JsonObject | null,
  status: string
): MetricTone {
  if (/pass|passed|ok|success|通过|已运行/i.test(status)) return 'green'
  if (result) return 'amber'
  return 'slate'
}

function okTone(
  ok: boolean,
  successTone: BinaryStatusTone = 'green',
  failureTone: BinaryStatusTone = 'red'
): BinaryStatusTone {
  return ok ? successTone : failureTone
}

function serviceDependencyStatus(ok: boolean) {
  return ok ? 'connected' : 'disconnected'
}

function systemStatusSummary(
  healthOk: boolean,
  readyOk: boolean
): { label: string; tone: BinaryStatusTone } {
  if (healthOk && readyOk) {
    return { label: '正常', tone: 'green' }
  }
  return { label: '需要排查', tone: 'red' }
}

function selectedDocumentScopeLabel(
  selectedCount: number,
  loading: boolean,
  hasDataset: boolean
) {
  if (selectedCount > 0) return `已选 ${selectedCount} 个文档`
  if (loading) return '正在加载文档...'
  if (hasDataset) return '当前数据集全部文档'
  return '请先选择数据集'
}

function citationTone(count: number | null): MetricTone {
  if (count === null) return 'slate'
  if (count > 0) return 'green'
  return 'amber'
}

function citationStatusLabel(hasResult: boolean, count: number | null) {
  if (!hasResult) return PENDING_RUN_LABEL
  if (count === null) return MISSING_RESULT_LABEL
  return `${count.toLocaleString()} 条引用`
}

function executionPerfValue(
  latencyMs: number | null,
  perfStatus: string,
  hasPerfResult: boolean,
  hasProbeResult: boolean
) {
  if (latencyMs === null) {
    if (hasPerfResult) return perfStatus
    if (hasProbeResult) return MISSING_RESULT_LABEL
    return PENDING_RUN_LABEL
  }
  return fmtMetric(latencyMs, 0, 'ms')
}

function executionPerfSource(latencyMs: number | null, hasPerfResult: boolean) {
  if (latencyMs === null) {
    return hasPerfResult ? '性能检测' : PENDING_RUN_LABEL
  }
  return '检索预览'
}

function executionPerfTone(
  latencyMs: number | null,
  fallbackTone: MetricTone
): MetricTone {
  if (latencyMs === null) return fallbackTone
  if (latencyMs <= 1000) return 'green'
  if (latencyMs <= 3000) return 'amber'
  return 'red'
}

function diagnosticsRunState(hasResult: boolean) {
  return hasResult
    ? { status: 'completed', message: '诊断已执行完毕' }
    : { status: 'not_run', message: '诊断尚未执行，请配置后运行' }
}

function manualDiagnosticsStatus(
  running: boolean,
  hasDiagnostics: boolean
) {
  if (running) return '执行中'
  if (hasDiagnostics) return '已生成'
  return PENDING_RUN_LABEL
}

function runningStatusLabel(running: boolean, value: string, runningLabel = '执行中') {
  return running ? runningLabel : value
}

function healthStatusLabel(isPending: boolean, healthy: boolean) {
  if (isPending) return '检查中'
  return healthy ? '正常' : '异常'
}

function healthSummaryStatusLabel(isPending: boolean, value: string) {
  return isPending ? '检查中' : value
}

function readyStatusLabel(
  loading: boolean,
  snapshot: JsonObject | null | undefined,
  ready: boolean,
  readyLabel: string,
  errorLabel: string
) {
  if (loading && snapshot === null) return '检查中'
  return ready ? readyLabel : errorLabel
}

function onlineQualityStatusLabel(loading: boolean, enabled?: boolean) {
  if (loading) return '检查中'
  return enabled ? '已启用' : '未启用'
}

function datasetSelectLabel(
  loading: boolean,
  selectedDataset: Dataset | null
) {
  if (loading) return '正在加载数据集...'
  if (!selectedDataset) return '暂无可用数据集'
  return `${datasetLabel(selectedDataset)} [${shortId(selectedDataset.id)}]`
}

function vectorBackendLabel(
  readySnapshot: JsonObject | null,
  healthPayload: Record<string, unknown> | null | undefined
) {
  const vector = diagnosticField(readySnapshot, 'vector')
  const vectorBackend = diagnosticField(vector, 'backend')
  return (
    firstDiagnosticString(
      vectorBackend,
      healthPayload?.vector_backend
    ) || 'milvus'
  )
}

function driftMetricCardValue(
  running: boolean,
  snapshot: JsonObject | null,
  metric: number | null
) {
  if (running) return '检查中'
  if (snapshot) return fmtExecutedMetric(metric, 3)
  return PENDING_RUN_LABEL
}

function diagnosticSummaryDetail(hasDiagnostics: boolean) {
  return hasDiagnostics
    ? '已有检索、漂移或性能结果'
    : '尚未运行诊断任务'
}

function stableTextKey(text: string) {
  let hash = 0
  for (const char of text) {
    hash = Math.imul(hash, 31) + (char.codePointAt(0) ?? 0)
  }
  return `text-${Math.abs(hash).toString(36)}`
}

function recommendationItems(recommendations: string[]) {
  const seen = new Map<string, number>()
  return recommendations.map((text) => {
    const baseKey = stableTextKey(text)
    const duplicateIndex = seen.get(baseKey) ?? 0
    seen.set(baseKey, duplicateIndex + 1)
    return {
      key: duplicateIndex === 0 ? baseKey : `${baseKey}-${duplicateIndex}`,
      text,
    }
  })
}

function resourceStatusClass(status: string) {
  const normalized = status.toLowerCase()
  if (['connected', 'ok', 'ready'].includes(normalized)) {
    return 'border-success/20 bg-success/10 text-success'
  }
  if (['checking', 'pending'].includes(normalized)) {
    return 'border-primary/20/70 bg-primary/10 text-primary'
  }
  if (['disabled', 'off'].includes(normalized)) {
    return 'border-border/50 bg-muted/50 text-muted-foreground'
  }
  return 'border-destructive/20 bg-destructive/10 text-destructive'
}

function resourceStatusLabel(status: string) {
  const normalized = String(status || 'unknown').toLowerCase()
  if (['connected', 'ok', 'ready'].includes(normalized)) return '已连接'
  if (['checking', 'pending'].includes(normalized)) return '检查中'
  if (['disabled', 'off'].includes(normalized)) return '已停用'
  if (['disconnected', 'error', 'failed'].includes(normalized)) return '异常'
  return '未知'
}

async function copyToClipboard(text = ''): Promise<void> {
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      throw new Error('Clipboard API unavailable')
    }
    await navigator.clipboard.writeText(text)
    toast.success('原始诊断数据已复制')
  } catch (err) {
    toast.error(err instanceof Error && err.message ? `复制失败：${err.message}` : '复制失败，请重试')
  }
}

const TOP_HUD_TONE_CLASSES = {
  slate: 'bg-muted/50 text-muted-foreground/80 border-border/50',
  green: 'bg-success/10 text-success border-success/20',
  amber: 'bg-warning/10 text-warning border-warning/20',
  red: 'bg-destructive/10 text-destructive border-destructive/20',
  blue: 'bg-primary/10 text-primary border-primary/20',
  purple: 'bg-accent/10 text-accent border-accent/20',
} as const

const STATUS_PILL_TONE_CLASSES = {
  slate: 'border-border bg-muted text-muted-foreground',
  green: 'border-success/25 bg-success/10 text-success',
  amber: 'border-warning/25 bg-warning/10 text-warning',
  red: 'border-destructive/25 bg-destructive/10 text-destructive',
  blue: 'border-primary/25 bg-primary/10 text-primary',
  purple: 'border-accent/25 bg-accent/10 text-accent',
} as const

function statusPillTone(value: string, fallback: MetricTone = 'slate'): MetricTone {
  const normalized = String(value || '').toLowerCase()
  if (/正常|就绪|已启用|已生成|已运行|通过|connected|ready|ok|success/.test(normalized)) {
    return 'green'
  }
  if (/执行中|检查中|加载|running|checking|pending/.test(normalized)) {
    return 'blue'
  }
  if (/异常|失败|断开|需排查|error|failed|disconnected/.test(normalized)) {
    return 'red'
  }
  if (/未启用|禁用|disabled|待执行|未返回|not_run/.test(normalized)) {
    return 'slate'
  }
  return fallback
}

function DiagnosticStatusPill({
  value,
  tone,
  className,
}: Readonly<{
  value: string
  tone?: MetricTone
  className?: string
}>) {
  const resolvedTone = tone ?? statusPillTone(value)

  return (
    <span
      className={cn(
        'inline-flex h-6 max-w-full items-center justify-center truncate rounded-md border px-2 text-center text-xs font-medium tabular-nums',
        STATUS_PILL_TONE_CLASSES[resolvedTone],
        className
      )}
      title={value}
    >
      {value}
    </span>
  )
}

function TopHUDTile({
  icon: Icon,
  label,
  value,
  detail,
  tone = 'slate',
}: Readonly<{
  icon: LucideIcon
  label: string
  value: string
  detail: string
  tone?: keyof typeof TOP_HUD_TONE_CLASSES
}>) {
  const toneClasses = TOP_HUD_TONE_CLASSES[tone] || TOP_HUD_TONE_CLASSES.slate
  const valueTone = statusPillTone(value, tone)

  return (
    <div className="flex min-h-[76px] items-center gap-3 bg-card px-3 py-3">
      <div
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-md border',
          toneClasses
        )}
      >
        <Icon className="size-4" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <span className="block truncate text-xs text-muted-foreground">
          {label}
        </span>
        <DiagnosticStatusPill
          value={value}
          tone={valueTone}
          className="mt-1 h-6 max-w-full"
        />
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {detail}
        </p>
      </div>
    </div>
  )
}

function DimensionMatrixItem({
  icon: Icon,
  title,
  subtitle,
  selected,
  value,
  source,
  tone = 'blue',
  onToggle,
}: Readonly<{
  icon: LucideIcon
  title: string
  subtitle: string
  selected: boolean
  value: string
  source: string
  tone?: MetricTone
  onToggle: () => void
}>) {
  const colorMap: Record<MetricTone, string> = {
    blue: 'bg-primary/10 text-primary border-primary/20',
    green: 'bg-success/10 text-success border-success/20',
    amber: 'bg-warning/10 text-warning border-warning/20',
    red: 'bg-destructive/10 text-destructive border-destructive/20',
    slate: 'bg-muted/50 text-muted-foreground/80 border-border/50',
    purple: 'bg-accent/10 text-accent border-accent/20',
  }

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={cn(
        'group flex min-h-[72px] w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25',
        selected
          ? 'border-primary/30 bg-primary/[0.06]'
          : 'border-border/60 bg-card hover:border-border hover:bg-muted/50'
      )}
    >
      <div
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-md border',
          colorMap[tone]
        )}
      >
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium leading-tight text-foreground">
              {title}
            </p>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {subtitle}
            </p>
          </div>
          <span
            className={cn(
              'shrink-0 rounded-md border px-1.5 py-0.5 text-xs',
              selected
                ? 'border-primary/20 bg-card text-primary'
                : 'border-border/50 bg-muted/50 text-muted-foreground/80'
            )}
          >
            {selected ? '已选' : '未选'}
          </span>
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <DiagnosticStatusPill
            value={value}
            tone={isPendingMetricLabel(value) ? 'slate' : tone}
            className="h-6 max-w-[112px] px-1.5 text-xs"
          />
          <span className="truncate text-xs text-muted-foreground">
            {source}
          </span>
        </div>
      </div>
    </button>
  )
}

function MainMetricCard({
  icon: Icon,
  label,
  value,
  help,
  loading = false,
  tone = 'slate',
}: Readonly<{
  icon: LucideIcon
  label: string
  value: string
  help?: ReactNode
  loading?: boolean
  tone?: string
}>) {
  const isWait = isPendingMetricLabel(value)
  const toneClass =
    {
      slate: 'bg-muted/50 text-muted-foreground/80 border-border/50',
      green: 'bg-success/10 text-success border-success/20',
      amber: 'bg-warning/10 text-warning border-warning/20',
      red: 'bg-destructive/10 text-destructive border-destructive/20',
    }[tone] || 'bg-muted/50 text-muted-foreground/80 border-border/50'

  return (
    <div className="flex min-h-[72px] items-center gap-3 bg-card px-3 py-2.5">
      <div
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-md border',
          toneClass
        )}
      >
        <Icon className="size-4" aria-hidden="true" />
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="truncate text-xs font-medium leading-none text-muted-foreground">
            {label}
          </p>
          {help ? (
            <MetricInfoTooltip label={`${label}说明`}>{help}</MetricInfoTooltip>
          ) : null}
        </div>
        <div className="shrink-0">
          {loading ? (
            <div className="h-6 w-16 animate-pulse rounded-md bg-muted" />
          ) : (
            <DiagnosticStatusPill
              value={value}
              tone={isWait ? 'slate' : (tone as MetricTone)}
              className="h-6 max-w-[96px] px-1.5 text-xs"
            />
          )}
        </div>
      </div>
    </div>
  )
}

function MetricInfoTooltip({
  label,
  children,
  side = 'top',
}: Readonly<{
  label: string
  children: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
}>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
        >
          <Info className="size-3" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side={side}
        align="center"
        className="max-w-[280px] rounded-md bg-foreground px-3 py-2 text-xs leading-5 text-background"
      >
        {children}
      </TooltipContent>
    </Tooltip>
  )
}

export default function DiagnosticsPage() {
  const health = useBackendHealth()
  const meta = useBackendMetaDetails()

  // 检索诊断配置
  const [probeDatasetId, setProbeDatasetId] = useState('')
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([])
  const [probeQuery, setProbeQuery] = useState('')
  const [probeResult, setProbeResult] = useState<PromptPreviewResponse | null>(
    null
  )
  const [probeRunning, setProbeRunning] = useState(false)
  const [selectedDimensions, setSelectedDimensions] = useState<
    DiagnosticDimensionId[]
  >(DIAGNOSTIC_DIMENSIONS.map((dimension) => dimension.id))

  // 漂移与性能检测参数
  const [driftSampleN, setDriftSampleN] = useState(200)
  const [driftThreshold, setDriftThreshold] = useState(0.05)
  const [driftSnapshot, setDriftSnapshot] = useState<JsonObject | null>(null)
  const [driftRunning, setDriftRunning] = useState(false)

  const [perfSuiteIterations, setPerfSuiteIterations] = useState(10)
  const [perfSuiteTimeoutSec, setPerfSuiteTimeoutSec] = useState(2)
  const [perfSuiteResult, setPerfSuiteResult] = useState<JsonObject | null>(
    null
  )
  const [perfSuiteRunning, setPerfSuiteRunning] = useState(false)

  const datasetsQuery = useQuery({
    queryKey: queryKeys.datasets.exhaustive({ purpose: 'diagnostics' }),
    queryFn: () => datasetApi.listAll(),
    staleTime: 30_000,
  })
  const datasets = datasetsQuery.data ?? EMPTY_DATASETS
  const datasetsLoading = datasetsQuery.isPending
  const activeDatasetId = probeDatasetId || datasets[0]?.id || ''

  const documentsQuery = useQuery({
    queryKey: queryKeys.documents.list({
      dataset_id: activeDatasetId,
      limit: 200,
      order_by: 'created_at',
      order_dir: 'desc',
    }),
    enabled: Boolean(activeDatasetId),
    queryFn: (): Promise<DocumentList> =>
      documentApi.list({
        skip: 0,
        limit: 200,
        dataset_id: activeDatasetId,
        order_by: 'created_at',
        order_dir: 'desc',
      }),
    staleTime: 15_000,
  })
  const documents =
    getListItems<KnowledgeDocument>(documentsQuery.data, EMPTY_DOCUMENTS)
  const documentsLoading =
    Boolean(activeDatasetId) &&
    (documentsQuery.isPending || documentsQuery.isFetching)
  const validSelectedDocumentIds = useMemo(() => {
    if (selectedDocumentIds.length === 0) return []
    const idSet = new Set(documents.map((document) => document.id))
    return selectedDocumentIds.filter((id) => idSet.has(id))
  }, [documents, selectedDocumentIds])

  const onlineQualityQuery = useQuery({
    queryKey: queryKeys.diagnostics.onlineQuality({
      window_minutes: 240,
      bucket_minutes: 5,
    }),
    queryFn: async (): Promise<OnlineQualitySummaryResponse | null> => {
      try {
        return await observabilityApi.getOnlineQualitySummary({
          window_minutes: 240,
          bucket_minutes: 5,
        })
      } catch {
        return null
      }
    },
    staleTime: 30_000,
  })
  const onlineQuality = onlineQualityQuery.data ?? null
  const onlineQualityLoading =
    onlineQualityQuery.isPending || onlineQualityQuery.isFetching

  const readySnapshotQuery = useQuery({
    queryKey: queryKeys.diagnostics.ready,
    queryFn: async (): Promise<JsonObject | null> => {
      try {
        const response = await fetch(`${API_V1_BASE_URL}/health/ready`, {
          cache: 'no-store',
        })
        const payload = await response.json().catch(() => null)
        return isDiagnosticRecord(payload) ? payload : null
      } catch {
        return null
      }
    },
    refetchInterval: 30_000,
    staleTime: 10_000,
  })
  const readySnapshot = readySnapshotQuery.data ?? null
  const readyLoading =
    readySnapshotQuery.isPending || readySnapshotQuery.isFetching

  const depsSnapshotQuery = useQuery({
    queryKey: queryKeys.diagnostics.deps,
    queryFn: async (): Promise<DepsDiagnosticsResponse | null> => {
      try {
        return await observabilityApi.getDepsDiagnosticsSnapshot()
      } catch {
        return null
      }
    },
    staleTime: 15_000,
  })
  const depsSnapshot = depsSnapshotQuery.data ?? null
  const depsLoading = depsSnapshotQuery.isPending || depsSnapshotQuery.isFetching

  async function runPromptPreviewProbe() {
    if (!probeQuery.trim()) {
      toast.error('请先输入查询提示或问题')
      return
    }
    setProbeRunning(true)
    setProbeResult(null)
    try {
      const res = await ragApi.promptPreview({
        query: probeQuery.trim(),
        dataset_id: activeDatasetId || undefined,
        document_ids: validSelectedDocumentIds,
        structured_output: false,
      })
      setProbeResult(res)
      toast.success('检索预览完成')
    } catch (err) {
      toast.error(formatApiError(err, '检索预览失败'))
    } finally {
      setProbeRunning(false)
    }
  }

  async function runEmbeddingDriftProbe() {
    setDriftRunning(true)
    setDriftSnapshot(null)
    try {
      const res = await observabilityApi.getEmbeddingDriftSnapshot({
        dataset_id: activeDatasetId || undefined,
        sample_n: driftSampleN,
        drift_threshold: driftThreshold,
      })
      setDriftSnapshot(res)
      toast.success('漂移检查完成')
    } catch (err) {
      toast.error(formatApiError(err, '漂移检查失败'))
    } finally {
      setDriftRunning(false)
    }
  }

  async function runPerfSuiteProbe() {
    setPerfSuiteRunning(true)
    setPerfSuiteResult(null)
    try {
      const res = await observabilityApi.runPerfSuite({
        iterations: perfSuiteIterations,
        timeout_sec: perfSuiteTimeoutSec,
      })
      setPerfSuiteResult(res)
      toast.success('性能门禁完成')
    } catch (err) {
      toast.error(formatApiError(err, '性能门禁失败'))
    } finally {
      setPerfSuiteRunning(false)
    }
  }

  const healthOk = Boolean(health.data?.payload?.ok)
  const readyOk = Boolean(readySnapshot?.ok)
  const systemStatus = systemStatusSummary(healthOk, readyOk)
  const serviceTime = fmtDateTime(meta.data?.time || health.data?.payload?.time)
  const currentVectorBackend = vectorBackendLabel(
    readySnapshot,
    health.data?.payload
  )
  const driftMetric = pickMetricNumberByPath(driftSnapshot, [
    'above_threshold.ratio',
    'above_threshold_ratio',
    'exceed_threshold_ratio',
    'exceed_ratio',
    'drift_rate',
    'driftRate',
    'drifted_ratio',
    'exceed_rate',
    'drift.avg',
    'drift.mean',
    'avg_drift',
    'mean_drift',
  ])
  const driftStatusLabel = driftResultLabel(driftSnapshot, driftMetric)
  const perfGateStatus = perfGateResultStatus(perfSuiteResult)
  const perfGateTone = perfGateResultTone(perfSuiteResult, perfGateStatus)
  const dependencyItems = [
    {
      label: '检索库',
      status: dependencyStatus(
        depsSnapshot?.postgres || readySnapshot?.database
      ),
    },
    {
      label: '向量后端',
      status: dependencyStatus(readySnapshot?.vector || depsSnapshot?.milvus),
    },
    {
      label: '对象存储',
      status: dependencyStatus(depsSnapshot?.minio || readySnapshot?.minio),
    },
    {
      label: '缓存服务',
      status: dependencyStatus(depsSnapshot?.redis || readySnapshot?.redis),
    },
    { label: '接口服务', status: serviceDependencyStatus(healthOk) },
  ]
  const selectedDataset =
    datasets.find((dataset) => dataset.id === activeDatasetId) || null
  const selectedDocuments = documents.filter((document) =>
    validSelectedDocumentIds.includes(document.id)
  )
  const selectedDocumentLabel = selectedDocumentScopeLabel(
    validSelectedDocumentIds.length,
    documentsLoading,
    Boolean(activeDatasetId)
  )

  const toggleDocument = useCallback((documentId: string) => {
    if (documentId === ALL_DOCUMENTS_VALUE) {
      setSelectedDocumentIds([])
      return
    }
    setSelectedDocumentIds((current) =>
      current.includes(documentId)
        ? current.filter((id) => id !== documentId)
        : [...current, documentId]
    )
  }, [])

  const toggleDimension = useCallback((dimensionId: DiagnosticDimensionId) => {
    setSelectedDimensions((current) =>
      current.includes(dimensionId)
        ? current.filter((id) => id !== dimensionId)
        : [...current, dimensionId]
    )
  }, [])

  const selectedDimensionSet = useMemo(
    () => new Set(selectedDimensions),
    [selectedDimensions]
  )

  const promptMetrics = probeResult?.metrics ?? null
  const retrievalScore = pickMetricNumber(promptMetrics, [
    'retrieval_score',
    'retrieval_relevance',
    'retrieval_relevance_score',
    'relevance',
    'similarity_score',
    'similarity',
  ])
  const contextScore = pickMetricNumber(promptMetrics, [
    'context_relevance',
    'context_relevancy',
    'context_score',
    'context_precision',
    'context_precision_score',
  ])
  const generationScore = pickMetricNumber(promptMetrics, [
    'generation_quality',
    'answer_quality',
    'response_relevancy',
    'response_relevance',
    'faithfulness',
  ])
  const factScore = pickMetricNumber(promptMetrics, [
    'faithfulness',
    'faithfulness_score',
    'factual_consistency',
    'fact_consistency',
  ])
  const safetyScore = pickMetricNumber(promptMetrics, [
    'safety_score',
    'safety',
    'policy_compliance',
    'compliance_score',
  ])
  const promptTokenCount = pickMetricNumber(promptMetrics, [
    'prompt_tokens',
    'total_prompt_tokens',
    'input_tokens',
    'tokens_prompt',
  ])
  const latencyMs = pickMetricNumber(promptMetrics, [
    'latency_ms',
    'duration_ms',
    'elapsed_ms',
    'total_ms',
    'retrieval_ms',
  ])
  const citationCount = Array.isArray(probeResult?.citations)
    ? probeResult.citations.length
    : null
  const hasProbeResult = Boolean(probeResult)
  const ragPreviewStatusLabel = citationStatusLabel(hasProbeResult, citationCount)
  const hasPerfSuiteResult = Boolean(perfSuiteResult)
  const dimensionStatuses: Record<
    DiagnosticDimensionId,
    { value: string; source: string; tone: MetricTone }
  > = {
    retrieval_accuracy: {
      value: fmtMetricOrMissing(hasProbeResult, retrievalScore),
      source: metricSource(hasProbeResult, '检索预览'),
      tone: metricTone(retrievalScore),
    },
    retrieval_recall: {
      value: fmtCountOrMissing(hasProbeResult, citationCount, ' 条'),
      source: metricSource(hasProbeResult, '引用'),
      tone: citationTone(citationCount),
    },
    context_relevance: {
      value: fmtMetricOrMissing(hasProbeResult, contextScore),
      source: metricSource(hasProbeResult, '检索预览'),
      tone: metricTone(contextScore),
    },
    generation_quality: {
      value: fmtMetricOrMissing(hasProbeResult, generationScore),
      source: metricSource(hasProbeResult, '检索预览'),
      tone: metricTone(generationScore),
    },
    fact_consistency: {
      value: fmtMetricOrMissing(hasProbeResult, factScore),
      source: metricSource(hasProbeResult, '检索预览'),
      tone: metricTone(factScore),
    },
    safety_compliance: {
      value: fmtMetricOrMissing(hasProbeResult, safetyScore),
      source: metricSource(hasProbeResult, '检索预览'),
      tone: metricTone(safetyScore),
    },
    cost_analysis: {
      value: fmtCountOrMissing(hasProbeResult, promptTokenCount, ' 令牌'),
      source: metricSource(hasProbeResult, '检索预览'),
      tone: promptTokenCount === null ? 'slate' : 'amber',
    },
    execution_perf: {
      value: executionPerfValue(
        latencyMs,
        perfGateStatus,
        hasPerfSuiteResult,
        hasProbeResult
      ),
      source: executionPerfSource(latencyMs, hasPerfSuiteResult),
      tone: executionPerfTone(latencyMs, perfGateTone),
    },
  }

  const backendSummaryJson = useMemo(
    () => {
      const runState = diagnosticsRunState(
        Boolean(probeResult || driftSnapshot || perfSuiteResult)
      )
      return prettyJson({
        status: runState.status,
        code: 0,
        message: runState.message,
        data: {
          dataset_id: activeDatasetId || null,
          document_ids: validSelectedDocumentIds,
          selected_dimensions: selectedDimensions,
          rag_preview: probeResult ?? null,
          embedding_drift: driftSnapshot ?? null,
          perf_suite: perfSuiteResult ?? null,
          deps: depsSnapshot ?? null,
        },
        metrics: {
          ...probeResult?.metrics,
          drift_rate: driftMetric,
          perf_gate: perfGateStatus,
        },
        timestamp: health.data?.payload?.time ?? null,
      })
    },
    [
      activeDatasetId,
      validSelectedDocumentIds,
      selectedDimensions,
      probeResult,
      driftSnapshot,
      perfSuiteResult,
      depsSnapshot,
      driftMetric,
      perfGateStatus,
      health.data,
    ]
  )
  const hasManualDiagnostics = Boolean(
    probeResult || driftSnapshot || perfSuiteResult
  )
  const manualDiagnosticsStatusLabel = manualDiagnosticsStatus(
    probeRunning || driftRunning || perfSuiteRunning,
    hasManualDiagnostics
  )

  const backendRecommendations = stringList(
    diagnosticField(onlineQuality, 'recommendations')
  )
  const backendRecommendationItems = recommendationItems(backendRecommendations)

  return (
    <AppFrame>
      <PageScaffold
        title="诊断中心"
        description="检查服务状态、依赖连接和知识检索质量。"
        iconImage="diagnostics"
        icon={Activity}
        iconColor="text-primary"
        size="full"
        bodyGutter="dense"
        bodyClassName="pt-4 pb-6"
        actions={
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              className="h-9 flex-1 gap-2 rounded-md text-xs sm:flex-none"
              onClick={() => {
                depsSnapshotQuery.refetch()
                readySnapshotQuery.refetch()
                document
                  .getElementById('diagnostics-dependency-card')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              }}
            >
              <ShieldAlert className="size-4" aria-hidden="true" />
              检查服务
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="刷新诊断状态"
              className="size-9 rounded-md"
              onClick={() => {
                health.refetch()
                meta.refetch()
                readySnapshotQuery.refetch()
                onlineQualityQuery.refetch()
                depsSnapshotQuery.refetch()
              }}
            >
              <RefreshCcw className="size-4" aria-hidden="true" />
            </Button>
          </div>
        }
      >
        <TooltipProvider delayDuration={120}>
          <div className="flex flex-col gap-6">
          <section aria-label="系统状态" className="grid overflow-hidden rounded-md border border-border bg-border sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-px">
            <TopHUDTile
              icon={ShieldCheck}
              label="系统健康"
              value={healthStatusLabel(health.isPending, healthOk)}
              detail="健康探针"
              tone={okTone(healthOk)}
            />
            <TopHUDTile
              icon={Clock}
              label="服务时间与接口版本"
              value={serviceTime}
              detail={meta.data?.api_version || 'v1'}
              tone="green"
            />
            <TopHUDTile
              icon={Database}
              label="依赖就绪"
              value={readyStatusLabel(
                readyLoading,
                readySnapshot,
                readyOk,
                '全部就绪',
                '异常'
              )}
              detail="就绪检查"
              tone={okTone(readyOk, 'blue')}
            />
            <TopHUDTile
              icon={Activity}
              label="在线评估"
              value={onlineQualityStatusLabel(
                onlineQualityLoading,
                onlineQuality?.enabled
              )}
              detail="在线指标"
              tone="purple"
            />
            <TopHUDTile
              icon={Gauge}
              label="性能门禁"
              value={perfGateStatus}
              detail="门禁探针"
              tone={perfGateTone}
            />
            <TopHUDTile
              icon={Timer}
              label="向量服务"
              value={currentVectorBackend}
              detail="向量服务"
              tone="green"
            />
          </section>

          <section aria-label="诊断工作区" className="grid overflow-hidden rounded-md border border-border bg-border gap-px lg:grid-cols-12">
            <div className={cn(CARD_BASE, 'lg:col-span-4')}>
              <h3 className={SECTION_TITLE}>
                <FileJson className="size-4 text-primary" /> 诊断配置
              </h3>
              <div className="space-y-3">
                <div>
                  <Label className={FIELD_LABEL}>数据集</Label>
                  <Select
                    value={activeDatasetId}
                    onValueChange={(value) => {
                      setProbeDatasetId(value)
                      setSelectedDocumentIds([])
                    }}
                    disabled={datasetsLoading || datasets.length === 0}
                  >
                    <SelectTrigger
                      id="diagnostics-dataset"
                      className="h-9 rounded-md border-border bg-background text-sm"
                    >
                      <span className="truncate">
                        {datasetSelectLabel(datasetsLoading, selectedDataset)}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {datasets.map((dataset) => (
                        <SelectItem key={dataset.id} value={dataset.id}>
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate text-sm font-medium">
                              {datasetLabel(dataset)}
                            </span>
                            <span className="truncate text-xs text-muted-foreground">
                              {shortId(dataset.id, 12)}
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className={FIELD_LABEL}>文档范围</Label>
                  <Select
                    value={validSelectedDocumentIds[0] || ALL_DOCUMENTS_VALUE}
                    onValueChange={toggleDocument}
                    disabled={
                      !activeDatasetId ||
                      documentsLoading ||
                      documents.length === 0
                    }
                  >
                    <SelectTrigger
                      id="diagnostics-documents"
                      className="h-9 rounded-md border-border bg-background text-sm"
                    >
                      <span className="truncate">{selectedDocumentLabel}</span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_DOCUMENTS_VALUE}>
                        当前数据集全部文档
                      </SelectItem>
                      {documents.map((document) => {
                        const selected = validSelectedDocumentIds.includes(
                          document.id
                        )
                        return (
                          <SelectItem key={document.id} value={document.id}>
                            <span className="flex min-w-0 items-center gap-2">
                              <span
                                className={cn(
                                  'flex size-4 shrink-0 items-center justify-center rounded-sm border text-xs',
                                  selected
                                    ? 'border-primary/30 bg-primary/10 text-primary'
                                    : 'border-border bg-card text-transparent'
                                )}
                              >
                                {selected ? '✓' : ''}
                              </span>
                              <span className="flex min-w-0 flex-col">
                                <span className="truncate text-sm font-medium">
                                  {documentLabel(document)}
                                </span>
                                <span className="truncate text-xs text-muted-foreground">
                                  {shortId(document.id, 12)}
                                </span>
                              </span>
                            </span>
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                  {selectedDocuments.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {selectedDocuments.slice(0, 3).map((document) => (
                        <span
                          key={document.id}
                          className="rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                        >
                          {documentLabel(document)}
                        </span>
                      ))}
                      {selectedDocuments.length > 3 ? (
                        <span className="rounded-md border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          +{selectedDocuments.length - 3}
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">
                      不选择文档时，诊断当前数据集的全部可检索内容。
                    </p>
                  )}
                </div>
                <div>
                  <Label className={FIELD_LABEL}>检索问题</Label>
                  <Textarea
                    value={probeQuery}
                    onChange={(e) => setProbeQuery(e.target.value)}
                    placeholder="输入需要验证的知识问题"
                    className="min-h-[80px] resize-none border-border bg-background text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    data-rag-preview-action="true"
                    className="h-9 flex-1 rounded-md text-sm font-medium"
                    onClick={runPromptPreviewProbe}
                    disabled={probeRunning || !activeDatasetId}
                  >
                    运行检索预览
                  </Button>
                  <Button
                    variant="outline"
                    className="h-9 flex-none gap-2 rounded-md border-border text-sm font-medium"
                    onClick={() => {
                      setProbeDatasetId(datasets[0]?.id || '')
                      setSelectedDocumentIds([])
                      setProbeQuery('')
                    }}
                  >
                    <Eraser className="size-4" aria-hidden="true" /> 清空
                  </Button>
                </div>
              </div>
            </div>

            <div className={cn(CARD_BASE, 'lg:col-span-5')}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="m-0 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <LayoutGrid className="size-4 text-primary" aria-hidden="true" /> 诊断维度
                </h3>
                <span className="rounded-md border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  已选 {selectedDimensions.length}
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {DIAGNOSTIC_DIMENSIONS.map((dimension) => {
                  const status = dimensionStatuses[dimension.id]
                  return (
                    <DimensionMatrixItem
                      key={dimension.id}
                      icon={dimension.icon}
                      title={dimension.title}
                      subtitle={dimension.subtitle}
                      selected={selectedDimensionSet.has(dimension.id)}
                      value={status.value}
                      source={status.source}
                      tone={status.tone}
                      onToggle={() => toggleDimension(dimension.id)}
                    />
                  )
                })}
              </div>
            </div>

            <div className={cn(CARD_BASE, 'lg:col-span-3')}>
              <h3 className={SECTION_TITLE}>
                <Settings2 className="size-4 text-primary" /> 参数配置
              </h3>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className={FIELD_LABEL}>相似度阈值</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={driftThreshold}
                      onChange={(e) =>
                        setDriftThreshold(Number(e.target.value))
                      }
                      className="h-9 rounded-md border-border bg-background text-sm"
                    />
                  </div>
                  <div>
                    <Label className={FIELD_LABEL}>采样数量</Label>
                    <Input
                      type="number"
                      value={driftSampleN}
                      onChange={(e) => setDriftSampleN(Number(e.target.value))}
                      className="h-9 rounded-md border-border bg-background text-sm"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className={FIELD_LABEL}>迭代次数</Label>
                    <Input
                      type="number"
                      value={perfSuiteIterations}
                      onChange={(e) =>
                        setPerfSuiteIterations(Number(e.target.value))
                      }
                      className="h-9 rounded-md border-border bg-background text-sm"
                    />
                  </div>
                  <div>
                    <Label className={FIELD_LABEL}>超时时间（秒）</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={perfSuiteTimeoutSec}
                      onChange={(e) =>
                        setPerfSuiteTimeoutSec(Number(e.target.value))
                      }
                      className="h-9 rounded-md border-border bg-background text-sm"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <Button
                    variant="outline"
                    className="h-9 w-full gap-2 rounded-md border-border text-sm font-medium"
                    onClick={runEmbeddingDriftProbe}
                    disabled={driftRunning}
                  >
                    <BarChart3
                      className={cn('size-4', driftRunning && 'animate-pulse')}
                    />{' '}
                    漂移检查
                  </Button>
                  <Button
                    variant="outline"
                    className="h-9 w-full gap-2 rounded-md border-border text-sm font-medium"
                    onClick={runPerfSuiteProbe}
                    disabled={perfSuiteRunning}
                  >
                    <ShieldCheck
                      className={cn(
                        'size-4',
                        perfSuiteRunning && 'animate-pulse'
                      )}
                    />{' '}
                    性能门禁
                  </Button>
                </div>
              </div>
            </div>
          </section>

          <section aria-labelledby="diagnostics-metrics-title">
            <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <h3 id="diagnostics-metrics-title" className="m-0 flex items-center gap-2 text-sm font-semibold text-foreground">
                <BarChart3 className="size-4 text-primary" /> 核心指标
                <MetricInfoTooltip label="核心指标说明" side="right">
                  检索预览、漂移检查和性能门禁会分别更新对应指标。
                </MetricInfoTooltip>
              </h3>
              <p className="text-xs text-muted-foreground">
                未运行的项目显示为待执行
              </p>
            </div>
            <div className="grid overflow-hidden rounded-md border border-border bg-border gap-px sm:grid-cols-2 xl:grid-cols-5">
              <MainMetricCard
                icon={Search}
                label="检索相关性"
                value={fmtMetricOrMissing(hasProbeResult, retrievalScore)}
                help="运行检索预览后生成。低分时可检查切块、向量模型、召回数量和重排序设置。"
                loading={probeRunning}
                tone={metricTone(retrievalScore)}
              />
              <MainMetricCard
                icon={CheckCircle2}
                label="召回引用"
                value={fmtCountOrMissing(hasProbeResult, citationCount)}
                help="运行检索预览后生成。结果为 0 时，当前问题没有找到可引用内容。"
                loading={probeRunning}
                tone={citationTone(citationCount)}
              />
              <MainMetricCard
                icon={Hash}
                label="提示词令牌"
                value={fmtCountOrMissing(hasProbeResult, promptTokenCount)}
                help="运行检索预览后生成，用于估算本次问题和检索内容的模型消耗。"
                loading={probeRunning}
                tone={promptTokenCount === null ? 'slate' : 'amber'}
              />
              <MainMetricCard
                icon={Timer}
                label="漂移率"
                value={driftMetricCardValue(
                  driftRunning,
                  driftSnapshot,
                  driftMetric
                )}
                help="运行漂移检查后生成。数值升高时，需要检查现用向量模型是否与已存向量一致。"
                loading={driftRunning}
                tone={metricTone(driftMetric)}
              />
              <MainMetricCard
                icon={ShieldCheck}
                label="性能门禁"
                value={runningStatusLabel(perfSuiteRunning, perfGateStatus)}
                help="运行性能门禁后生成，用于判断诊断接口能否在设定时间内稳定完成。"
                loading={perfSuiteRunning}
                tone={perfGateTone}
              />
            </div>
          </section>

          <section aria-label="诊断结果" className="grid overflow-hidden rounded-md border border-border bg-border gap-px lg:grid-cols-12">
            <div className={cn(CARD_BASE, 'lg:col-span-3')}>
              <h3 className={SECTION_TITLE}>
                <LayoutGrid className="size-4 text-primary" /> 执行结果
                <MetricInfoTooltip label="执行结果说明" side="right">
                  三项诊断分别运行，未运行的项目保持待执行。
                </MetricInfoTooltip>
              </h3>
              <div className="divide-y divide-border pt-1">
                <ConclusionItem
                  label="检索预览"
                  status={runningStatusLabel(probeRunning, ragPreviewStatusLabel)}
                />
                <ConclusionItem
                  label="漂移检查"
                  status={runningStatusLabel(driftRunning, driftStatusLabel)}
                />
                <ConclusionItem label="性能门禁" status={perfGateStatus} />
                <ConclusionItem
                  label="报告时间"
                  status={fmtDateTime(health.data?.payload?.time)}
                />
                </div>
              </div>

            <div
              id="diagnostics-dependency-card"
              className={cn(CARD_BASE, 'lg:col-span-3 scroll-mt-24')}
            >
              <h3 className={SECTION_TITLE}>
                <Database className="size-4 text-primary" /> 依赖资源
              </h3>
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border">
                {dependencyItems.map((item) => (
                  <ResourceItem
                    key={item.label}
                    label={item.label}
                    status={
                      item.status === 'unknown' && (depsLoading || readyLoading)
                        ? 'checking'
                        : item.status
                    }
                  />
                ))}
              </div>
            </div>

            <div className={cn(CARD_BASE, 'lg:col-span-3 flex flex-col')}>
              <div className="mb-3 flex items-start justify-between gap-3">
                <h3 className="m-0 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Terminal className="size-4 text-primary" /> 排障摘要
                </h3>
                <span className="rounded-md border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  原始数据已收起
                </span>
              </div>
              <div className="divide-y divide-border">
                <DiagnosticsSummaryItem
                  label="系统健康"
                  value={healthSummaryStatusLabel(
                    health.isPending,
                    systemStatus.label
                  )}
                  detail={serviceTime}
                  tone={systemStatus.tone}
                />
                <DiagnosticsSummaryItem
                  label="依赖就绪"
                  value={readyStatusLabel(
                    readyLoading,
                    readySnapshot,
                    readyOk,
                    '已就绪',
                    '需排查'
                  )}
                  detail={readySnapshot ? '就绪检查已返回' : '等待就绪检查'}
                  tone={okTone(readyOk, 'blue')}
                />
                <DiagnosticsSummaryItem
                  label="诊断任务"
                  value={manualDiagnosticsStatusLabel}
                  detail={diagnosticSummaryDetail(hasManualDiagnostics)}
                  tone={hasManualDiagnostics ? 'green' : 'slate'}
                />
              </div>
              <RawDiagnosticsDetails
                json={backendSummaryJson}
                onCopy={() => copyToClipboard(backendSummaryJson)}
              />
            </div>

            <div className={cn(CARD_BASE, 'lg:col-span-3')}>
              <h3 className={SECTION_TITLE}>
                <Zap className="size-4 text-primary" /> 系统建议
              </h3>
              {backendRecommendationItems.length > 0 ? (
                <div className="divide-y divide-border">
                  {backendRecommendationItems.map((recommendation) => (
                    <p
                      key={recommendation.key}
                      className="py-2 text-sm leading-6 text-muted-foreground"
                    >
                      {recommendation.text}
                    </p>
                  ))}
                </div>
              ) : (
                <div className="flex min-h-[160px] flex-col items-center justify-center text-center">
                  <Activity className="mb-3 size-6 text-muted-foreground" aria-hidden="true" />
                  <DiagnosticStatusPill
                    value="待生成建议"
                    tone="slate"
                    className="h-6 px-2.5"
                  />
                  <p className="mt-2 text-xs text-muted-foreground">
                    完成任一诊断后，这里会显示可用建议。
                  </p>
                </div>
              )}
            </div>
          </section>
          </div>
        </TooltipProvider>
      </PageScaffold>
    </AppFrame>
  )
}

function ConclusionItem({ label, status }: Readonly<{ label: string; status: string }>) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="flex items-center gap-3">
        <div className="flex size-6 items-center justify-center rounded-md bg-muted">
          <LayoutGrid className="size-3 text-muted-foreground/80" />
        </div>
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <DiagnosticStatusPill
        value={status}
        tone={statusPillTone(status)}
        className="h-6 max-w-[120px] px-1.5 text-xs"
      />
    </div>
  )
}

function ResourceItem({ label, status }: Readonly<{ label: string; status: string }>) {
  const normalized = String(status || 'unknown').toLowerCase()
  const displayLabel = resourceStatusLabel(normalized)

  return (
    <div className="flex items-center justify-between gap-2 bg-card px-2.5 py-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span
        className={cn(
          'rounded-md border px-2 py-0.5 text-xs font-medium',
          resourceStatusClass(normalized)
        )}
      >
        {displayLabel}
      </span>
    </div>
  )
}

function DiagnosticsSummaryItem({
  label,
  detail,
  value,
  tone = 'slate',
}: Readonly<{
  label: string
  detail: string
  value: string
  tone?: 'slate' | 'green' | 'blue' | 'red' | 'amber'
}>) {
  const toneClass =
    {
      slate: 'border-border/50 bg-muted/50 text-muted-foreground',
      green: 'border-success/20 bg-success/10 text-success',
      blue: 'border-primary/20 bg-primary/10 text-primary',
      red: 'border-destructive/20 bg-destructive/10 text-destructive',
      amber: 'border-warning/20 bg-warning/10 text-warning',
    }[tone] || 'border-border/50 bg-muted/50 text-muted-foreground'

  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
      </div>
      <span
        className={cn(
          'shrink-0 rounded-md border px-2 py-0.5 text-xs font-medium',
          toneClass
        )}
      >
        {value}
      </span>
    </div>
  )
}

function RawDiagnosticsDetails({
  json,
  onCopy,
}: Readonly<{
  json: string
  onCopy: () => void
}>) {
  return (
    <details className="group mt-3 rounded-md border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-xs font-medium text-foreground hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <FileJson className="size-3.5 text-primary" />
          查看原始诊断数据
        </span>
        <ChevronDown className="size-3.5 text-muted-foreground/80 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-border/50 p-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            供技术排查使用。
          </p>
          <Button
            variant="outline"
            size="sm"
            aria-label="复制原始诊断数据"
            className="h-8 gap-1.5 rounded-md border-border bg-card text-xs font-medium text-muted-foreground hover:bg-primary/10 hover:text-primary"
            onClick={onCopy}
          >
            <Copy className="size-3" /> 复制
          </Button>
        </div>
        <pre className="max-h-[180px] overflow-auto rounded-md bg-foreground p-3 font-mono text-xs leading-5 text-background/85 custom-scrollbar">
          {json}
        </pre>
      </div>
    </details>
  )
}
