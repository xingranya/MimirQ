'use client'

import { useQuery } from '@tanstack/react-query'
import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  AlertTriangle,
  BarChart3,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Database,
  GitCompare,
  Info,
  MoreHorizontal,
  PlayCircle,
  RefreshCcw,
  Trophy,
} from 'lucide-react'
import { toast } from 'sonner'

import { AppFrame } from '@/components/app-frame'
import { AblationCaseDrilldown } from '@/components/evaluation/ablation-case-drilldown'
import { AblationComparisonMatrix } from '@/components/evaluation/ablation-comparison-matrix'
import { AblationGridPanel } from '@/components/evaluation/ablation-grid-panel'
import { AblationParameterImpactPanel } from '@/components/evaluation/ablation-parameter-impact-panel'
import { AblationParetoPanel } from '@/components/evaluation/ablation-pareto-panel'
import { AblationSliceDiffPanel } from '@/components/evaluation/ablation-slice-diff-panel'
import { AblationStatisticsPanel } from '@/components/evaluation/ablation-statistics-panel'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { StatusBadge } from '@/components/ui/status-badge'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatApiError } from '@/lib/api-errors'
import { datasetApi } from '@/lib/api/datasets'
import { evaluationApi } from '@/lib/api/evaluation'
import { settingsApi } from '@/lib/api/settings'
import { Link } from '@/i18n/navigation'
import { toTrimmedPrimitiveString } from '@/lib/primitive-text'
import { queryKeys } from '@/lib/query-keys'
import {
  normalizeRerankerProvider,
  RERANKER_PROVIDER_OPTIONS,
} from '@/lib/reranker-provider-options'
import { sanitizeFilename } from '@/lib/sanitize'
import type {
  Dataset,
  RagasRegressionRunDiffResponse,
  RegressionAblationGridValue,
  RegressionRunMetricDiff,
  RegressionRun,
  RegressionRunCreate,
} from '@/types'
import { cn, detachPromise } from '@/lib/utils'
const EMPTY_DATASETS: Dataset[] = []
const EMPTY_RUNS: RegressionRun[] = []

type RegressionLeaderboardRow = {
  run_id: string
  status: string
  created_at?: string | null
  finished_at?: string | null
  metric_key: string
  metric_value?: number | null
  retrieval_config_hash?: string | null
}

type RegressionRunLeaderboard = {
  items?: RegressionLeaderboardRow[]
}

type AblationInlineTone = 'neutral' | 'sky' | 'amber' | 'violet' | 'emerald'
type LeaderboardAssignRole = 'base' | 'target'

type AblationRunPayloadConfig = {
  datasetId: string
  retrievalOnly: boolean
  metricKeys: string[]
  skipEmptyContexts: boolean
  maxCases: number
  topK: number
  scoreThreshold: number
  retrievalMode: string
  alpha: number
  enableWeightRerank: boolean
  vectorWeight: number
  keywordWeight: number
  mmrLambda: number
  enableReranker: boolean
  rerankerProvider: string
  rerankerTopN: number
}

type AutoBootstrapStage = 'top_k' | 'reranker' | 'retrieval_mode'

type AutoBootstrapPlan = {
  stage: AutoBootstrapStage
  label: string
  helper: string
}

const ABLATION_INLINE_TONE_CLASSES: Record<
  AblationInlineTone,
  { surface: string; label: string; value: string }
> = {
  neutral: {
    surface: 'border-border/70 bg-card',
    label: 'text-muted-foreground',
    value: 'text-foreground',
  },
  sky: {
    surface: 'border-info/30 bg-info/5',
    label: 'text-info',
    value: 'text-info',
  },
  amber: {
    surface: 'border-warning/30 bg-warning/5',
    label: 'text-warning',
    value: 'text-warning',
  },
  violet: {
    surface: 'border-accent/30 bg-accent/5',
    label: 'text-accent',
    value: 'text-accent',
  },
  emerald: {
    surface: 'border-success/30 bg-success/5',
    label: 'text-success',
    value: 'text-success',
  },
}

const JSON_TOKEN_PATTERN = new RegExp(
  [
    String.raw`("(?:\\.|[^"\\])*")(\s*:)?`,
    String.raw`\b-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b`,
    String.raw`\b(?:true|false|null)\b`,
    String.raw`[{}\[\],:]`,
  ].join('|'),
  'g'
)

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return '无法序列化的 JSON'
  }
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

function downloadBlob(blob: Blob, filename: string): void {
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

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max))
}

function pickAutoCandidateTopK(currentTopK: number): number {
  const base = clampNumber(currentTopK, 1, 50)
  const plus = clampNumber(base + 10, 1, 50)
  if (plus !== base) return plus
  const minus = clampNumber(base - 10, 1, 50)
  if (minus !== base) return minus
  return base >= 50 ? 49 : base + 1
}

function runParamNumber(run: RegressionRun, key: string): number | null {
  const params = run.params && typeof run.params === 'object' ? run.params : null
  return toNumber(params ? (params as Record<string, unknown>)[key] : null)
}

function runParamBoolean(run: RegressionRun, key: string): boolean | null {
  const params = run.params && typeof run.params === 'object' ? run.params : null
  const raw = params ? (params as Record<string, unknown>)[key] : null
  if (typeof raw === 'boolean') return raw
  if (raw === 'true') return true
  if (raw === 'false') return false
  return null
}

function runParamString(run: RegressionRun, key: string): string {
  const params = run.params && typeof run.params === 'object' ? run.params : null
  return toTrimmedPrimitiveString(params ? (params as Record<string, unknown>)[key] : null)
}

const RAGAS_METRIC_OPTIONS = [
  {
    key: 'faithfulness',
    label: '事实一致性',
    hint: '答案是否忠于检索上下文',
  },
  {
    key: 'response_relevancy',
    label: '回答相关性',
    hint: '回答是否真正回应问题',
  },
  {
    key: 'context_precision',
    label: '上下文精度',
    hint: '上下文是否足够精准干净',
  },
]

const RETRIEVAL_MODE_OPTIONS = [
  { key: 'hybrid', label: '混合检索' },
  { key: 'vector', label: '向量检索' },
  { key: 'keyword', label: '关键词检索' },
  { key: 'mmr', label: '多样性召回' },
]

const LEADERBOARD_METRIC_OPTIONS = [
  { key: 'retrieval_mrr', label: '检索平均倒数排名' },
  { key: 'retrieval_recall', label: '检索召回率' },
  { key: 'retrieval_ndcg_at_10', label: '前 10 归一化增益' },
  { key: 'retrieval_ndcg_at_20', label: '前 20 归一化增益' },
  { key: 'faithfulness_det', label: '事实一致性' },
  { key: 'refusal_correctness', label: '拒答正确率' },
]

function _stableId(val: unknown): string {
  return toTrimmedPrimitiveString(val)
}

function formatMetric(value: number | null): string {
  return value === null ? '-' : value.toFixed(4)
}

function shortId(value: string | null | undefined): string {
  const text = String(value || '').trim()
  if (!text) return '-'
  return `${text.slice(0, 8)}…`
}

function leaderboardMetricLabel(key: string): string {
  return (
    LEADERBOARD_METRIC_OPTIONS.find((item) => item.key === key)?.label || key
  )
}

function datasetPermissionLabel(value: unknown): string {
  const text = toTrimmedPrimitiveString(value)
  if (!text) return '权限未配置'
  if (text === 'all_team_members') return '全员可见'
  if (text === 'only_me') return '仅自己可见'
  return text
}

function runStatusMeta(statusValue: string | null | undefined): {
  status: 'completed' | 'failed' | 'processing'
  label: string
} {
  if (statusValue === 'completed')
    return { status: 'completed', label: '已完成' }
  if (statusValue === 'failed') return { status: 'failed', label: '失败' }
  return { status: 'processing', label: '运行中' }
}

function pickRunPair(
  items: RegressionRun[],
  currentBaseRunId: string,
  currentTargetRunId: string
): {
  baseRunId: string
  targetRunId: string
} {
  const ids = new Set(items.map((run) => _stableId(run.id)).filter(Boolean))
  const currentBase = _stableId(currentBaseRunId)
  const currentTarget = _stableId(currentTargetRunId)
  let targetRunId =
    currentTarget && ids.has(currentTarget)
      ? currentTarget
      : _stableId(items?.[0]?.id)
  let baseRunId = currentBase && ids.has(currentBase) ? currentBase : ''

  if (!baseRunId || baseRunId === targetRunId) {
    baseRunId = _stableId(
      items.find((run) => _stableId(run.id) !== targetRunId)?.id
    )
  }

  if (baseRunId === targetRunId) {
    baseRunId = ''
  }

  return { baseRunId, targetRunId }
}

function buildRegressionRunPayload(
  config: AblationRunPayloadConfig,
  variant: Partial<RegressionRunCreate> = {}
): RegressionRunCreate | null {
  const ds = config.datasetId.trim()
  if (!ds) return null

  return {
    dataset_id: ds,
    metrics: config.retrievalOnly ? [] : config.metricKeys,
    skip_empty_contexts: Boolean(config.skipEmptyContexts),
    max_cases: clampNumber(config.maxCases, 1, 500),
    top_k: clampNumber(config.topK, 1, 50),
    score_threshold: clampNumber(config.scoreThreshold, 0, 1),
    retrieval_mode: config.retrievalMode,
    alpha: clampNumber(config.alpha, 0, 1),
    enable_weight_rerank: Boolean(config.enableWeightRerank),
    vector_weight: clampNumber(config.vectorWeight, 0, 1),
    keyword_weight: clampNumber(config.keywordWeight, 0, 1),
    mmr_lambda: clampNumber(config.mmrLambda, 0, 1),
    enable_reranker: Boolean(config.enableReranker),
    reranker_provider: String(config.rerankerProvider || 'llm'),
    reranker_top_n: clampNumber(config.rerankerTopN, 1, 200),
    ...variant,
  }
}

async function submitAblationRun(
  payload: RegressionRunCreate | null,
  refetchRuns: () => Promise<unknown>,
  selectTargetRun: (id: string) => void
): Promise<void> {
  if (!payload) {
    toast.error('请选择数据集')
    return
  }

  try {
    const run = await evaluationApi.createRegressionRun(payload)
    toast.success('评测任务已创建')
    await refetchRuns()
    selectTargetRun(run.id)
  } catch (err) {
    toast.error(formatApiError(err, '创建评测任务失败'))
  }
}

async function submitAblationBatch(
  payload: RegressionRunCreate | null,
  grid: Record<string, RegressionAblationGridValue[]>,
  maxCombinations: number,
  refetchRuns: () => Promise<unknown>,
  selectTargetRun: (id: string) => void
): Promise<void> {
  if (!payload) {
    toast.error('请选择数据集')
    return
  }

  try {
    const batch = await evaluationApi.createRegressionAblationBatch({
      ...payload,
      grid,
      max_combinations: maxCombinations,
    })
    if (batch.run_ids[0]) {
      selectTargetRun(batch.run_ids[0])
    }
    await refetchRuns()
    toast.success(`已提交 ${batch.total} 个参数评测任务`)
  } catch (err) {
    const message = formatApiError(err, '批量创建参数评测任务失败')
    toast.error(message)
    throw new Error(message)
  }
}

function getComparableRunIds(
  selectedBaseRunId: string,
  selectedTargetRunId: string
): { baseId: string; targetId: string } | null {
  const baseId = String(selectedBaseRunId || '').trim()
  const targetId = String(selectedTargetRunId || '').trim()
  if (!baseId || !targetId) {
    toast.error('请选择基准记录和目标记录')
    return null
  }
  if (baseId === targetId) {
    toast.error('基准记录和目标记录不能相同')
    return null
  }
  return { baseId, targetId }
}

async function computeRegressionDiff(
  selectedBaseRunId: string,
  selectedTargetRunId: string,
  refetchDiff: () => Promise<{ error?: unknown }>
): Promise<void> {
  const pair = getComparableRunIds(selectedBaseRunId, selectedTargetRunId)
  if (!pair) return

  try {
    const res = await refetchDiff()
    if (res.error) return
    toast.success('已生成差异对比')
  } catch {}
}

async function exportRegressionDiffHtml(
  selectedBaseRunId: string,
  selectedTargetRunId: string
): Promise<void> {
  const pair = getComparableRunIds(selectedBaseRunId, selectedTargetRunId)
  if (!pair) return

  try {
    const blob = await evaluationApi.exportRegressionRunDiffHtml(pair.targetId, {
      base_run_id: pair.baseId,
      redact: true,
    })
    const name = sanitizeFilename(
      `regression-diff_${pair.baseId.slice(0, 8)}_vs_${pair.targetId.slice(0, 8)}.html`
    )
    downloadBlob(blob, name)
  } catch (err) {
    toast.error(formatApiError(err, '导出对比页面失败'))
  }
}

async function exportRegressionRunBundle(
  runId: string,
  label: string
): Promise<void> {
  const id = String(runId || '').trim()
  if (!id) {
    toast.error('请选择运行记录')
    return
  }

  try {
    const blob = await evaluationApi.exportRegressionRunBundle(id, {
      include_text: false,
      include_contexts: false,
      download: true,
    })
    const name = sanitizeFilename(
      `regression-run_${label}_${id.slice(0, 8)}.json`
    )
    downloadBlob(blob, name)
  } catch (err) {
    toast.error(formatApiError(err, '导出运行记录失败'))
  }
}

function runSelectText(run: RegressionRun): string {
  const statusMeta = runStatusMeta(String(run.status || ''))
  return `${shortId(String(run.id))} · ${statusMeta.label}`
}

function AblationInfoTooltip({
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
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <Info className="size-4" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side={side}
          align="center"
          className="max-w-[280px] text-xs leading-5"
        >
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function compactValue(value: unknown, maxLen = 72): string {
  if (value === null || value === undefined) return '-'
  const raw = (() => {
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean')
      return String(value)
    try {
      return JSON.stringify(value)
    } catch {
      return '无法序列化'
    }
  })()
  if (!raw) return '-'
  return raw.length > maxLen ? `${raw.slice(0, maxLen - 1)}…` : raw
}

function ablationDeltaClass(value: number | null): string {
  if (value !== null && value > 0) return 'text-success'
  if (value !== null && value < 0) return 'text-destructive'
  return 'text-foreground'
}

function ablationDeltaTone(value: number | null): AblationInlineTone {
  if (value !== null && value > 0) return 'emerald'
  if (value !== null && value < 0) return 'amber'
  return 'neutral'
}

function formatAblationDelta(value: number | null): string {
  if (value === null) return '-'
  return value.toFixed(4)
}

function ablationWorkspaceGridClassName(
  leftExpanded: boolean,
  leaderboardExpanded: boolean
): string {
  if (leftExpanded && leaderboardExpanded) {
    return 'grid min-h-0 grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)] 2xl:h-full 2xl:min-h-[720px] 2xl:grid-cols-[320px_minmax(0,1fr)_320px]'
  }
  if (leftExpanded === false && leaderboardExpanded) {
    return 'grid min-h-0 grid-cols-1 gap-4 xl:h-full xl:min-h-[720px] xl:grid-cols-[minmax(0,1fr)_320px]'
  }
  if (leftExpanded && leaderboardExpanded === false) {
    return 'grid min-h-0 grid-cols-1 gap-4 xl:h-full xl:min-h-[720px] xl:grid-cols-[320px_minmax(0,1fr)]'
  }
  return 'grid min-h-0 grid-cols-1 gap-4 xl:h-full xl:min-h-[720px]'
}

function AblationInlineStat({
  label,
  value,
  tone = 'neutral',
}: Readonly<{
  label: string
  value: ReactNode
  tone?: AblationInlineTone
}>) {
  const toneClasses = ABLATION_INLINE_TONE_CLASSES[tone]

  return (
    <div
      className="inline-flex items-baseline gap-1.5 border-r border-border pr-2 last:border-r-0 last:pr-0"
    >
      <span className={cn('text-xs', toneClasses.label)}>
        {label}
      </span>
      <span
        className={cn('font-mono text-xs tabular-nums', toneClasses.value)}
      >
        {value}
      </span>
    </div>
  )
}

function AblationSection({
  title,
  description,
  children,
  className,
  collapsible = true,
  defaultCollapsed = false,
}: Readonly<{
  title: string
  description?: string
  children: ReactNode
  className?: string
  collapsible?: boolean
  defaultCollapsed?: boolean
}>) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  return (
    <section
      className={cn(
        'border-b border-border bg-card px-4 py-3 last:border-b-0',
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground">
            {title}
          </div>
          {!collapsed && description ? (
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {collapsible ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => setCollapsed((prev) => !prev)}
            aria-label={collapsed ? `展开${title}` : `收起${title}`}
          >
            <ChevronDown
              className={cn(
                'h-3 w-3 transition-transform',
                collapsed ? '-rotate-90' : 'rotate-0'
              )}
            />
          </Button>
        ) : null}
      </div>
      {collapsed ? null : <div className="mt-3">{children}</div>}
    </section>
  )
}

function AblationDatasetCard({
  dataset,
  metricKey,
}: Readonly<{
  dataset: Dataset | null
  metricKey: string
}>) {
  const pipeline = toRecord(dataset?.pipeline)
  const version = compactValue(pipeline.version ?? 'v1', 20)

  return (
    <div className="rounded-md border border-border bg-muted/30 p-3">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Database className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="truncate text-sm font-semibold text-foreground">
              {dataset?.name || '未选择数据集'}
            </div>
            <span className="rounded-md border border-border bg-card px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {dataset ? '已选择' : '待选择'}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>ID: {shortId(dataset?.id)}</span>
            <span>版本: {version}</span>
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-border pt-2 text-xs">
        <span className="text-muted-foreground">
          {datasetPermissionLabel(dataset?.permission)}
        </span>
        <span className="font-medium text-primary">
          参考指标：{leaderboardMetricLabel(metricKey)}
        </span>
      </div>
    </div>
  )
}

function AblationLeaderboardEmptyState() {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center px-6 py-10 text-center">
      <div className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Trophy className="size-5" aria-hidden="true" />
      </div>
      <div className="mt-4 text-base font-semibold text-foreground">
        暂无排行数据
      </div>
      <p className="mt-2 max-w-[280px] text-sm leading-6 text-muted-foreground">
        选择数据集并完成评测后，这里会按参考指标排列运行结果。
      </p>
    </div>
  )
}

function AblationDiffEmptyState({
  datasetId,
  caseCount,
  runCount,
  autoRunLabel,
  autoRunHelper,
  autoRunPending,
  onAutoRun,
}: Readonly<{
  datasetId: string
  caseCount: number
  runCount: number
  autoRunLabel?: string | null
  autoRunHelper?: string | null
  autoRunPending?: boolean
  onAutoRun?: () => void
}>) {
  const hasDataset = Boolean(datasetId.trim())
  const hasCases = caseCount > 0
  const hasComparableRuns = runCount >= 2
  const title = !hasDataset
    ? '先选择数据集'
    : !hasCases
      ? '当前数据集还没有标准样本'
      : !runCount
        ? '已有标准样本，等待首次评测'
        : !hasComparableRuns
          ? '再完成一次评测即可对比'
          : '等待生成差异对比'
  const description = !hasDataset
    ? '选择本次要验证的数据集后，系统会加载对应的评测记录。'
    : !hasCases
      ? '请先在评测中心准备标准问题、答案和引用证据。'
      : !runCount
        ? `当前有 ${caseCount} 条标准样本。使用现有参数完成首次评测，作为后续比较的基准。`
        : !hasComparableRuns
          ? `当前有 ${caseCount} 条标准样本和 1 条评测记录。调整一个参数再运行一次，即可查看变化。`
          : '选择基准记录和目标记录，然后生成对比。'
  const steps = !hasDataset
    ? [
        { label: '选择数据集', hint: '固定本次要比较的知识库数据集。' },
        { label: '确认标准样本', hint: '确保数据集已有标准问题、答案和引用证据。' },
        { label: '进入对比', hint: '完成后这里才会出现可比较的实验记录。' },
      ]
    : !hasCases
      ? [
          { label: '返回评测中心', hint: '在回归评测页维护标准样本。' },
          { label: '准备标准样本', hint: '至少需要标准问题、答案和引用证据。' },
          { label: '再回到这里', hint: '有了样本后再运行检索调参对比。' },
        ]
      : !runCount
        ? [
            { label: '保留当前参数', hint: '先用稳定的检索参数完成基准评测。' },
            { label: '运行参数评测', hint: '点击参数区底部按钮生成第一条记录。' },
            { label: '再改一个参数', hint: '例如召回数量、检索模式或重排器。' },
          ]
        : !hasComparableRuns
          ? [
              { label: '把现有记录设为基准', hint: '将当前记录作为稳定方案。' },
              { label: '只改一个参数', hint: '例如召回数量、重排器开关或分数阈值。' },
              { label: '再运行一次', hint: '生成第二条目标记录后即可比较。' },
            ]
          : [
              { label: '选择基准记录', hint: '选择稳定方案的评测结果。' },
              { label: '选择目标记录', hint: '选择本次要验证的评测结果。' },
              { label: '生成差异对比', hint: '点击“生成差异对比”查看配置差异与指标变化。' },
            ]

  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center px-4 py-10 text-center sm:px-6">
      <div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
        <GitCompare className="size-5" aria-hidden="true" />
      </div>
      <div className="mt-4 text-base font-semibold text-foreground">
        {title}
      </div>
      <p className="mt-2 max-w-[430px] text-sm leading-6 text-muted-foreground">
        {description}
      </p>
      <div className="mt-4 grid w-full max-w-[320px] grid-cols-2 divide-x divide-border border-y border-border py-3 text-xs">
        <span>标准样本 {caseCount}</span>
        <span>评测记录 {runCount}</span>
      </div>
      {autoRunLabel && onAutoRun ? (
        <div className="mt-4 flex max-w-[430px] flex-col items-center">
          <Button
            type="button"
            className="h-10 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            disabled={autoRunPending}
            onClick={onAutoRun}
          >
            <PlayCircle className="mr-2 h-4 w-4" />
            {autoRunPending ? '正在自动补齐...' : autoRunLabel}
          </Button>
          {autoRunHelper ? (
            <div className="mt-2 text-xs leading-5 text-primary">
              {autoRunHelper}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="mt-6 w-full max-w-[430px] divide-y divide-border border-y border-border text-left">
        {steps.map((step, index) => (
          <div
            key={step.label}
            className="flex gap-3 py-3"
          >
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
              {index + 1}
            </span>
            <span>
              <span className="block text-sm font-semibold text-foreground">
                {step.label}
              </span>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                {step.hint}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

type JsonTokenKind =
  | 'plain'
  | 'key'
  | 'string'
  | 'number'
  | 'boolean'
  | 'null'
  | 'punctuation'

type JsonToken = { text: string; kind: JsonTokenKind }

function splitCodeLines(value: string): string[] {
  const normalized = String(value ?? '').replaceAll('\r', '')
  const lines = normalized.split('\n')
  if (lines.length > 1 && lines.at(-1) === '') lines.pop()
  return lines.length ? lines : ['']
}

function jsonTokenKindFromRaw(raw: string): JsonTokenKind {
  if (raw === 'true' || raw === 'false') return 'boolean'
  if (raw === 'null') return 'null'
  if (/^-?\d/.test(raw)) return 'number'
  return 'punctuation'
}

function appendJsonToken(tokens: JsonToken[], match: RegExpExecArray): void {
  const raw = match[0] ?? ''
  const quotedText = match[1]
  if (!quotedText) {
    tokens.push({ text: raw, kind: jsonTokenKindFromRaw(raw) })
    return
  }

  const suffix = match[2] ?? ''
  tokens.push({ text: quotedText, kind: suffix ? 'key' : 'string' })
  if (suffix) tokens.push({ text: suffix, kind: 'punctuation' })
}

function tokenizeJsonLine(line: string): JsonToken[] {
  const tokens: JsonToken[] = []
  JSON_TOKEN_PATTERN.lastIndex = 0

  let lastIndex = 0
  let match = JSON_TOKEN_PATTERN.exec(line)
  while (match) {
    if (match.index > lastIndex) {
      tokens.push({ text: line.slice(lastIndex, match.index), kind: 'plain' })
    }

    appendJsonToken(tokens, match)
    lastIndex = JSON_TOKEN_PATTERN.lastIndex
    match = JSON_TOKEN_PATTERN.exec(line)
  }

  if (lastIndex < line.length) {
    tokens.push({ text: line.slice(lastIndex), kind: 'plain' })
  }

  return tokens.length ? tokens : [{ text: line, kind: 'plain' }]
}

function jsonTokenClassName(kind: JsonTokenKind): string {
  if (kind === 'key') return 'text-info'
  if (kind === 'string') return 'text-success'
  if (kind === 'number') return 'text-warning'
  if (kind === 'boolean') return 'text-accent'
  if (kind === 'null') return 'text-destructive'
  if (kind === 'punctuation') return 'text-muted-foreground'
  return 'text-foreground'
}

function JsonCodeLine({
  lineNumber,
  text,
}: Readonly<{ lineNumber: number; text: string }>) {
  const tokens = useMemo(() => tokenizeJsonLine(text), [text])

  return (
    <div className="grid grid-cols-[52px_minmax(0,1fr)] border-b border-border text-xs leading-6">
      <div className="select-none border-r border-border/70 px-3 text-right font-mono tabular-nums text-muted-foreground">
        {lineNumber}
      </div>
      <div className="min-w-0 px-3 font-mono">
        <span className="inline-block min-w-full whitespace-pre">
          {tokens.map((token, idx) => (
            <span
              key={`${lineNumber}:${idx}:${token.kind}`}
              className={jsonTokenClassName(token.kind)}
            >
              {token.text}
            </span>
          ))}
        </span>
      </div>
    </div>
  )
}

function JsonCodeViewer({ code }: Readonly<{ code: string }>) {
  const lines = useMemo(() => splitCodeLines(code), [code])

  return (
    <div className="h-full min-h-0 overflow-auto bg-background">
      <div className="min-w-max">
        {lines.map((line, index) => (
          <JsonCodeLine
            key={`json-line:${index + 1}`}
            lineNumber={index + 1}
            text={line}
          />
        ))}
      </div>
    </div>
  )
}

type AblationDiffScoreDisplay = {
  base: string
  target: string
  delta: string
  usedKeys: string[]
}

type AblationParamDiffRow = {
  key: string
  before: string
  after: string
  changed: boolean
}

function AblationMetricDeltaCell({
  value,
}: Readonly<{ value: unknown }>) {
  const delta = toNumber(value)
  const label = delta === null ? compactValue(value, 24) : delta.toFixed(4)

  return (
    <div
      className={cn(
        'text-right font-mono text-xs',
        ablationDeltaClass(delta)
      )}
    >
      {label}
    </div>
  )
}

function AblationOverviewTab({
  diff,
  diffScoreFmt,
  diffDeltaClass,
  metricDiffRows,
  datasetId,
  caseCount,
  runCount,
  autoRunLabel,
  autoRunHelper,
  autoRunPending,
  onAutoRun,
}: Readonly<{
  diff: RagasRegressionRunDiffResponse | null
  diffScoreFmt: AblationDiffScoreDisplay
  diffDeltaClass: string
  metricDiffRows: RegressionRunMetricDiff[]
  datasetId: string
  caseCount: number
  runCount: number
  autoRunLabel?: string | null
  autoRunHelper?: string | null
  autoRunPending?: boolean
  onAutoRun?: () => void
}>) {
  if (!diff) {
    return (
      <AblationDiffEmptyState
        datasetId={datasetId}
        caseCount={caseCount}
        runCount={runCount}
        autoRunLabel={autoRunLabel}
        autoRunHelper={autoRunHelper}
        autoRunPending={autoRunPending}
        onAutoRun={onAutoRun}
      />
    )
  }

  return (
    <div className="px-5 py-3">
      <div className="overflow-x-auto border border-border">
        <div className="grid border-b border-border sm:grid-cols-3">
          <div className="bg-card px-3 py-2.5 sm:border-r sm:border-border/70">
            <div className="text-xs text-muted-foreground">
              基准得分
            </div>
            <div className="mt-1 font-mono text-sm font-semibold text-foreground">
              {diffScoreFmt.base}
            </div>
          </div>
          <div className="bg-card px-3 py-2.5 sm:border-r sm:border-border/70">
            <div className="text-xs text-muted-foreground">
              目标得分
            </div>
            <div className="mt-1 font-mono text-sm font-semibold text-foreground">
              {diffScoreFmt.target}
            </div>
          </div>
          <div className="bg-card px-3 py-2.5">
            <div className="text-xs text-muted-foreground">
              指标变化
            </div>
            <div
              className={cn(
                'mt-1 font-mono text-sm font-semibold',
                diffDeltaClass
              )}
            >
              {diffScoreFmt.delta}
            </div>
          </div>
        </div>

        <div className="grid min-w-[520px] grid-cols-[minmax(120px,1fr)_minmax(88px,0.8fr)_minmax(88px,0.8fr)_minmax(88px,0.8fr)] border-b border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <div>指标</div>
          <div className="text-right">基准</div>
          <div className="text-right">目标</div>
          <div className="text-right">变化</div>
        </div>
        {metricDiffRows.length ? (
          metricDiffRows.map((row) => (
            <div
              key={row.key}
              className="grid min-w-[520px] grid-cols-[minmax(120px,1fr)_minmax(88px,0.8fr)_minmax(88px,0.8fr)_minmax(88px,0.8fr)] border-b border-border px-3 py-2 text-xs last:border-b-0"
            >
              <div className="truncate font-mono text-xs text-foreground">
                {row.key}
              </div>
              <div className="text-right font-mono text-xs text-muted-foreground">
                {compactValue(row.before, 24)}
              </div>
              <div className="text-right font-mono text-xs text-muted-foreground">
                {compactValue(row.after, 24)}
              </div>
              <AblationMetricDeltaCell value={row.delta} />
            </div>
          ))
        ) : (
          <div className="px-3 py-4 text-xs text-muted-foreground">
            没有可展示的指标差异。
          </div>
        )}
      </div>
    </div>
  )
}

function AblationConfigTab({
  diff,
  paramDiffRows,
}: Readonly<{
  diff: RagasRegressionRunDiffResponse | null
  paramDiffRows: AblationParamDiffRow[]
}>) {
  if (!diff) {
    return (
      <div className="px-5 py-10 text-center text-xs text-muted-foreground">
        生成差异对比后可查看参数差异。
      </div>
    )
  }

  return (
    <div className="mx-5 my-3 overflow-x-auto border border-border">
      <div className="grid min-w-[520px] grid-cols-[minmax(140px,180px)_minmax(0,1fr)_minmax(0,1fr)] border-b border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <div>参数</div>
        <div>基准</div>
        <div>目标</div>
      </div>
      {paramDiffRows.length ? (
        paramDiffRows.map((row) => (
          <div
            key={row.key}
            className="grid min-w-[520px] grid-cols-[minmax(140px,180px)_minmax(0,1fr)_minmax(0,1fr)] border-b border-border bg-card px-3 py-2 text-xs last:border-b-0"
          >
            <div
              className={cn(
                'truncate font-mono text-xs',
                row.changed ? 'font-semibold text-foreground' : 'text-foreground'
              )}
            >
              {row.key}
            </div>
            <div className="truncate font-mono text-xs text-muted-foreground">
              {row.before}
            </div>
            <div
              className={cn(
                'truncate font-mono text-xs',
                row.changed ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              {row.after}
            </div>
          </div>
        ))
      ) : (
        <div className="px-3 py-4 text-xs text-muted-foreground">
          没有可展示的参数差异。
        </div>
      )}
    </div>
  )
}

function AblationDeepDiveTab({
  datasetId,
  runDisabledReason,
  runGridBatch,
  refetchPanels,
  diff,
  runsByDataset,
  selectedBaseRunId,
  selectedTargetRunId,
  leaderboardMetricKey,
  deepDiveMetricKeys,
}: Readonly<{
  datasetId: string
  runDisabledReason: string
  runGridBatch: (
    grid: Record<string, RegressionAblationGridValue[]>,
    maxCombinations: number
  ) => Promise<void>
  refetchPanels: () => Promise<void>
  diff: RagasRegressionRunDiffResponse | null
  runsByDataset: RegressionRun[]
  selectedBaseRunId: string
  selectedTargetRunId: string
  leaderboardMetricKey: string
  deepDiveMetricKeys: string[]
}>) {
  return (
    <div className="space-y-4 px-5 py-4">
      <AblationGridPanel
        disabled={!datasetId.trim() || Boolean(runDisabledReason)}
        disabledReason={runDisabledReason}
        onRunGrid={runGridBatch}
        onBatchComplete={refetchPanels}
      />
      <AblationStatisticsPanel diff={diff} />
      <AblationComparisonMatrix
        runs={runsByDataset}
        baseRunId={selectedBaseRunId}
        metricKeys={deepDiveMetricKeys}
      />
      <div className="grid gap-4 xl:grid-cols-2">
        <AblationParetoPanel
          runs={runsByDataset}
          metricKey={leaderboardMetricKey}
        />
        <AblationParameterImpactPanel
          runs={runsByDataset}
          metricKey={leaderboardMetricKey}
        />
      </div>
      <AblationSliceDiffPanel diff={diff} />
      <AblationCaseDrilldown
        baseRunId={selectedBaseRunId}
        targetRunId={selectedTargetRunId}
        metricKeys={deepDiveMetricKeys}
        caseDiffs={diff?.case_diffs ?? []}
      />
    </div>
  )
}

function AblationRawTab({ diffJson }: Readonly<{ diffJson: string }>) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-border/70 px-5 py-2.5">
        <div className="text-xs text-muted-foreground">
          对比数据
        </div>
        <Database className="h-4 w-4 text-primary" />
      </div>
      <JsonCodeViewer code={diffJson} />
    </div>
  )
}

function AblationComparisonWorkspace({
  runsSelectionHint,
  diffDeltaClass,
  diffDeltaValue,
  runsLoading,
  selectedBaseRunId,
  selectedTargetRunId,
  setSelectedBaseRunId,
  setSelectedTargetRunId,
  runsSelectDisabled,
  runsByDataset,
  selectedBaseRun,
  selectedTargetRun,
  diffDeltaTone,
  diffLoading,
  canGenerateDiff,
  computeDiff,
  diff,
  exportDiffHtml,
  diffScoreFmt,
  metricDiffRows,
  paramDiffRows,
  datasetId,
  runDisabledReason,
  runGridBatch,
  refetchPanels,
  leaderboardMetricKey,
  deepDiveMetricKeys,
  diffJson,
  caseCount,
  autoRunLabel,
  autoRunHelper,
  autoBootstrapPending,
  runAutoBootstrap,
}: Readonly<{
  runsSelectionHint: string
  diffDeltaClass: string
  diffDeltaValue: string
  runsLoading: boolean
  selectedBaseRunId: string
  selectedTargetRunId: string
  setSelectedBaseRunId: (value: string) => void
  setSelectedTargetRunId: (value: string) => void
  runsSelectDisabled: boolean
  runsByDataset: RegressionRun[]
  selectedBaseRun: RegressionRun | null
  selectedTargetRun: RegressionRun | null
  diffDeltaTone: AblationInlineTone
  diffLoading: boolean
  canGenerateDiff: boolean
  computeDiff: () => Promise<void>
  diff: RagasRegressionRunDiffResponse | null
  exportDiffHtml: () => Promise<void>
  diffScoreFmt: AblationDiffScoreDisplay
  metricDiffRows: RegressionRunMetricDiff[]
  paramDiffRows: AblationParamDiffRow[]
  datasetId: string
  runDisabledReason: string
  runGridBatch: (
    grid: Record<string, RegressionAblationGridValue[]>,
    maxCombinations: number
  ) => Promise<void>
  refetchPanels: () => Promise<void>
  leaderboardMetricKey: string
  deepDiveMetricKeys: string[]
  diffJson: string
  caseCount: number
  autoRunLabel: string | null
  autoRunHelper: string | null
  autoBootstrapPending: boolean
  runAutoBootstrap: () => Promise<void>
}>) {
  const basePlaceholder = runsLoading ? '加载中...' : '选择基准记录'
  const targetPlaceholder = runsLoading ? '加载中...' : '选择目标记录'
  const baseRunLabel = selectedBaseRun?.id ? String(selectedBaseRun.id) : ''
  const targetRunLabel = selectedTargetRun?.id
    ? String(selectedTargetRun.id)
    : ''

  return (
    <section className="order-2 min-w-0 overflow-hidden rounded-md border border-border bg-card">
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex min-h-[58px] items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
          <div className="flex min-w-0 items-center gap-1.5">
            <div className="truncate text-base font-semibold text-foreground">
              运行对比
            </div>
            <AblationInfoTooltip label="查看运行记录选择说明" side="bottom">
              {runsSelectionHint}
            </AblationInfoTooltip>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">指标变化</span>
            <span
              className={cn('font-mono font-semibold', diffDeltaClass)}
            >
              {diffDeltaValue}
            </span>
          </div>
        </div>

        <div className="border-b border-border bg-card px-4 py-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">选择基准记录</Label>
              <Select
                value={selectedBaseRunId}
                onValueChange={setSelectedBaseRunId}
                disabled={runsSelectDisabled}
              >
                <SelectTrigger className="h-10 rounded-md border-border bg-card text-sm">
                  <SelectValue placeholder={basePlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {runsByDataset.map((run) => (
                    <SelectItem key={run.id} value={run.id}>
                      {runSelectText(run)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">选择目标记录</Label>
              <Select
                value={selectedTargetRunId}
                onValueChange={setSelectedTargetRunId}
                disabled={runsSelectDisabled}
              >
                <SelectTrigger className="h-10 rounded-md border-border bg-card text-sm">
                  <SelectValue placeholder={targetPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {runsByDataset.map((run) => (
                    <SelectItem key={run.id} value={run.id}>
                      {runSelectText(run)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <AblationInlineStat
                label="基准"
                value={shortId(baseRunLabel)}
                tone="sky"
              />
              <AblationInlineStat
                label="目标"
                value={shortId(targetRunLabel)}
                tone="neutral"
              />
              <AblationInlineStat
                label="变化"
                value={diffDeltaValue}
                tone={diffDeltaTone}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                className="h-9 gap-1.5 rounded-md bg-primary px-4 text-sm text-primary-foreground hover:bg-primary/90"
                disabled={diffLoading || !canGenerateDiff}
                onClick={() => detachPromise(computeDiff())}
              >
                <GitCompare className="h-3.5 w-3.5" />
                生成对比
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-9 gap-1.5 rounded-md border-border bg-card px-3 text-sm text-foreground hover:bg-muted"
                  >
                    导出
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem
                    disabled={!selectedBaseRunId}
                    onSelect={() =>
                      detachPromise(
                        exportRegressionRunBundle(selectedBaseRunId, 'base')
                      )
                    }
                  >
                    导出基准记录
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!selectedTargetRunId}
                    onSelect={() =>
                      detachPromise(
                        exportRegressionRunBundle(
                          selectedTargetRunId,
                          'target'
                        )
                      )
                    }
                  >
                    导出目标记录
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!diff}
                    onSelect={() =>
                      downloadJson(
                        diff,
                        sanitizeFilename('regression-run-diff.json')
                      )
                    }
                  >
                    导出数据
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!canGenerateDiff}
                    onSelect={() => detachPromise(exportDiffHtml())}
                  >
                    导出页面
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col">
          <div className="overflow-x-auto border-b border-border px-4">
            <TabsList className="h-10 min-w-max justify-start gap-5 rounded-none border-none bg-transparent p-0">
              <TabsTrigger
                value="overview"
                className="h-10 rounded-none border-b-2 border-transparent px-0 text-sm data-[state=active]:border-primary data-[state=active]:bg-transparent"
              >
                概览
              </TabsTrigger>
              <TabsTrigger
                value="config"
                className="h-10 rounded-none border-b-2 border-transparent px-0 text-sm data-[state=active]:border-primary data-[state=active]:bg-transparent"
              >
                配置差异
              </TabsTrigger>
              <TabsTrigger
                value="deep-dive"
                className="h-10 rounded-none border-b-2 border-transparent px-0 text-sm data-[state=active]:border-primary data-[state=active]:bg-transparent"
              >
                深度分析
              </TabsTrigger>
              <TabsTrigger
                value="raw"
                className="h-10 rounded-none border-b-2 border-transparent px-0 text-sm data-[state=active]:border-primary data-[state=active]:bg-transparent"
              >
                原始数据
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent
            value="overview"
            className="mt-0 min-h-0 flex-1 overflow-auto"
          >
            <AblationOverviewTab
              diff={diff}
              diffScoreFmt={diffScoreFmt}
              diffDeltaClass={diffDeltaClass}
              metricDiffRows={metricDiffRows}
              datasetId={datasetId}
              caseCount={caseCount}
              runCount={runsByDataset.length}
              autoRunLabel={autoRunLabel}
              autoRunHelper={autoRunHelper}
              autoRunPending={autoBootstrapPending}
              onAutoRun={autoRunLabel ? () => detachPromise(runAutoBootstrap()) : undefined}
            />
          </TabsContent>

          <TabsContent
            value="config"
            className="mt-0 min-h-0 flex-1 overflow-auto"
          >
            <AblationConfigTab diff={diff} paramDiffRows={paramDiffRows} />
          </TabsContent>

          <TabsContent
            value="deep-dive"
            className="mt-0 min-h-0 flex-1 overflow-auto bg-background"
          >
            <AblationDeepDiveTab
              datasetId={datasetId}
              runDisabledReason={runDisabledReason}
              runGridBatch={runGridBatch}
              refetchPanels={refetchPanels}
              diff={diff}
              runsByDataset={runsByDataset}
              selectedBaseRunId={selectedBaseRunId}
              selectedTargetRunId={selectedTargetRunId}
              leaderboardMetricKey={leaderboardMetricKey}
              deepDiveMetricKeys={deepDiveMetricKeys}
            />
          </TabsContent>

          <TabsContent
            value="raw"
            className="mt-0 min-h-0 flex-1 overflow-hidden"
          >
            <AblationRawTab diffJson={diffJson} />
          </TabsContent>
        </Tabs>
      </div>
    </section>
  )
}

export function RetrievalAblationsPage() {
  const [datasetId, setDatasetId] = useState('')

  const [selectedBaseRunId, setSelectedBaseRunId] = useState('')
  const [selectedTargetRunId, setSelectedTargetRunId] = useState('')
  const [leaderboardAssignRole, setLeaderboardAssignRole] =
    useState<LeaderboardAssignRole>('target')
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false)
  const [leaderboardCollapsed, setLeaderboardCollapsed] = useState(false)
  const leftSidebarExpanded = leftSidebarCollapsed === false
  const leaderboardExpanded = leaderboardCollapsed === false

  const [leaderboardMetricKey, setLeaderboardMetricKey] =
    useState<string>('retrieval_mrr')

  // Run config (ablation knobs)
  const [retrievalOnly, setRetrievalOnly] = useState(true)
  const [metricKeys, setMetricKeys] = useState<string[]>([
    'faithfulness',
    'response_relevancy',
  ])
  const [maxCases, setMaxCases] = useState(50)
  const [skipEmptyContexts, setSkipEmptyContexts] = useState(true)

  const [topK, setTopK] = useState(20)
  const [scoreThreshold, setScoreThreshold] = useState(0)
  const [retrievalMode, setRetrievalMode] = useState('hybrid')
  const [alpha, setAlpha] = useState(0.6)
  const [enableWeightRerank, setEnableWeightRerank] = useState(true)
  const [vectorWeight, setVectorWeight] = useState(0.6)
  const [keywordWeight, setKeywordWeight] = useState(0.4)
  const [mmrLambda, setMmrLambda] = useState(0.7)
  const [enableReranker, setEnableReranker] = useState(false)
  const [rerankerProvider, setRerankerProvider] = useState('llm')
  const [rerankerTopN, setRerankerTopN] = useState(20)
  const [settingsDefaultsApplied, setSettingsDefaultsApplied] = useState(false)
  const [defaultDatasetApplied, setDefaultDatasetApplied] = useState(false)
  const [autoBootstrapPending, setAutoBootstrapPending] = useState(false)

  const datasetsQuery = useQuery({
    queryKey: queryKeys.datasets.exhaustive({ purpose: 'retrieval-ablations' }),
    queryFn: () => datasetApi.listAll(),
  })
  const settingsSnapshotQuery = useQuery({
    queryKey: queryKeys.settings.snapshot,
    queryFn: () => settingsApi.get(),
  })
  const runsQuery = useQuery({
    queryKey: queryKeys.evaluations.list({ limit: 80, dataset_id: datasetId.trim() || undefined }),
    queryFn: () =>
      evaluationApi.listRegressionRuns({
        limit: 80,
        dataset_id: datasetId.trim() || undefined,
      }),
  })
  const selectedDatasetCasesQuery = useQuery({
    queryKey: queryKeys.evaluations.regressionCases({
      dataset_id: datasetId.trim() || undefined,
      limit: 1,
    }),
    enabled: Boolean(datasetId.trim()),
    queryFn: () =>
      evaluationApi.listRegressionCases({
        dataset_id: datasetId.trim(),
        limit: 1,
      }),
  })
  const leaderboardQuery = useQuery({
    queryKey: queryKeys.evaluations.regressionLeaderboard({
      dataset_id: datasetId.trim() || undefined,
      metric_key: leaderboardMetricKey,
      limit: 50,
      include_incomplete: false,
    }),
    enabled: Boolean(datasetId.trim()),
    queryFn: () =>
      evaluationApi.getRegressionRunLeaderboard({
        dataset_id: datasetId.trim(),
        metric_key: leaderboardMetricKey,
        limit: 50,
        include_incomplete: false,
      }),
  })
  const diffQuery = useQuery({
    queryKey: queryKeys.evaluations.regressionRunDiff(selectedTargetRunId, {
      base_run_id: selectedBaseRunId,
      include_significance: true,
      include_per_case: true,
      max_case_diffs: 500,
    }),
    enabled: false,
    queryFn: () =>
      evaluationApi.diffRegressionRuns(selectedTargetRunId, {
        base_run_id: selectedBaseRunId,
        include_significance: true,
        include_per_case: true,
        max_case_diffs: 500,
      }),
  })
  const settingsSnapshot = settingsSnapshotQuery.data
  useEffect(() => {
    if (settingsDefaultsApplied || !settingsSnapshot?.rag) return
    setEnableReranker(Boolean(settingsSnapshot.rag.enable_reranker))
    setRerankerProvider(settingsSnapshot.rag.reranker_provider
      ? normalizeRerankerProvider(settingsSnapshot.rag.reranker_provider)
      : 'llm')
    setRerankerTopN(settingsSnapshot.rag.reranker_top_n
      ? Math.max(1, Math.min(Number(settingsSnapshot.rag.reranker_top_n), 200))
      : 20)
    setSettingsDefaultsApplied(true)
  }, [settingsDefaultsApplied, settingsSnapshot])
  const diff = diffQuery.data ?? null
  const diffJson = useMemo(
    () => prettyJson(diff ?? { hint: '选择基准记录和目标记录后生成对比' }),
    [diff]
  )
  const diffScore = diff?.diff_score ?? null

  const diffScoreFmt = useMemo(() => {
    const b = toNumber(diffScore?.base_score)
    const a = toNumber(diffScore?.target_score)
    const d = toNumber(diffScore?.delta)
    return {
      base: b == null ? '-' : b.toFixed(4),
      target: a == null ? '-' : a.toFixed(4),
      delta: d == null ? '-' : d.toFixed(4),
      usedKeys: Array.isArray(diffScore?.used_metric_keys)
        ? diffScore.used_metric_keys.map(String)
        : [],
    }
  }, [diffScore])

  const datasets = useMemo(
    () => datasetsQuery.data ?? EMPTY_DATASETS,
    [datasetsQuery.data]
  )
  const runs = useMemo(
    () => (Array.isArray(runsQuery.data?.items) ? runsQuery.data?.items : EMPTY_RUNS),
    [runsQuery.data?.items]
  )
  const datasetsLoading = datasetsQuery.isLoading || datasetsQuery.isFetching
  const runsLoading = runsQuery.isLoading || runsQuery.isFetching
  const selectedDatasetCasesLoading =
    selectedDatasetCasesQuery.isLoading || selectedDatasetCasesQuery.isFetching
  const leaderboardLoading =
    leaderboardQuery.isLoading || leaderboardQuery.isFetching
  const diffLoading = diffQuery.isLoading || diffQuery.isFetching
  const selectedDatasetCaseCount = Number(selectedDatasetCasesQuery.data?.total ?? 0)
  const selectedDatasetHasNoCases =
    Boolean(datasetId.trim()) &&
    !selectedDatasetCasesLoading &&
    !selectedDatasetCasesQuery.error &&
    selectedDatasetCaseCount <= 0
  const selectedDatasetCasesUnavailable =
    !datasetId.trim() || selectedDatasetHasNoCases || Boolean(selectedDatasetCasesQuery.error)
  const runDisabledReason = !datasetId.trim()
    ? '请选择数据集'
    : selectedDatasetCasesLoading
      ? '正在确认标准样本数量'
      : selectedDatasetCasesQuery.error
        ? '无法确认标准样本数量，请刷新后重试'
        : selectedDatasetHasNoCases
          ? '当前数据集没有标准样本，请先在评测中心导入或生成样本'
          : ''
  const selectedDatasetCasesStatusText = !datasetId.trim()
    ? '请先选择数据集，再运行参数评测。'
    : selectedDatasetCasesLoading
      ? '正在确认当前数据集的标准样本数量...'
      : selectedDatasetCasesQuery.error
        ? '无法读取当前数据集的标准样本数量，请刷新后重试。'
        : selectedDatasetHasNoCases
          ? '当前数据集没有标准样本。请先在评测中心导入或生成样本。'
          : `已有 ${selectedDatasetCaseCount} 条标准样本，可以开始参数评测。`

  const runsByDataset = useMemo(() => {
    const ds = datasetId.trim()
    if (!ds) return runs
    return (runs || []).filter((r) => String(r?.dataset_id || '') === ds)
  }, [runs, datasetId])

  useEffect(() => {
    const pair = pickRunPair(
      runsByDataset || [],
      selectedBaseRunId,
      selectedTargetRunId
    )
    if (pair.baseRunId !== _stableId(selectedBaseRunId))
      setSelectedBaseRunId(pair.baseRunId)
    if (pair.targetRunId !== _stableId(selectedTargetRunId))
      setSelectedTargetRunId(pair.targetRunId)
  }, [runsByDataset, selectedBaseRunId, selectedTargetRunId])

  useEffect(() => {
    if (!datasetsQuery.error) return
    toast.error(formatApiError(datasetsQuery.error, '加载数据集失败'))
  }, [datasetsQuery.error])

  useEffect(() => {
    if (!runsQuery.error) return
    toast.error(formatApiError(runsQuery.error, '拉取运行记录失败'))
  }, [runsQuery.error])

  useEffect(() => {
    if (!leaderboardQuery.error) return
    toast.error(formatApiError(leaderboardQuery.error, '加载评测排行失败'))
  }, [leaderboardQuery.error])

  useEffect(() => {
    if (!diffQuery.error) return
    toast.error(formatApiError(diffQuery.error, '生成差异对比失败'))
  }, [diffQuery.error])

  useEffect(() => {
    if (defaultDatasetApplied || datasets.length === 0 || runsLoading) return
    const datasetIds = new Set(datasets.map((dataset) => String(dataset.id)))
    const completedRunDatasetId = _stableId(
      runs.find(
        (run) =>
          String(run.status || '') === 'completed' &&
          datasetIds.has(String(run.dataset_id || ''))
      )?.dataset_id
    )
    setDatasetId((prev) => prev || completedRunDatasetId || datasets[0]?.id || '')
    setDefaultDatasetApplied(true)
  }, [datasets, defaultDatasetApplied, runs, runsLoading])

  const runPayloadConfig: AblationRunPayloadConfig = {
    datasetId,
    retrievalOnly,
    metricKeys,
    skipEmptyContexts,
    maxCases,
    topK,
    scoreThreshold,
    retrievalMode,
    alpha,
    enableWeightRerank,
    vectorWeight,
    keywordWeight,
    mmrLambda,
    enableReranker,
    rerankerProvider,
    rerankerTopN,
  }

  function buildCurrentRegressionRunPayload(
    variant: Partial<RegressionRunCreate> = {}
  ): RegressionRunCreate | null {
    return buildRegressionRunPayload(runPayloadConfig, variant)
  }

  async function runAblation(): Promise<void> {
    if (runDisabledReason) {
      toast.error(runDisabledReason)
      return
    }
    await submitAblationRun(
      buildCurrentRegressionRunPayload(),
      () => runsQuery.refetch(),
      setSelectedTargetRunId
    )
  }

  async function runAutoBootstrap(): Promise<void> {
    if (runDisabledReason) {
      toast.error(runDisabledReason)
      return
    }

    const plan = autoBootstrapPlan
    if (!plan) {
      await runAblation()
      return
    }

    const baselineTopK = clampNumber(topK, 1, 50)
    const candidateTopK = pickAutoCandidateTopK(baselineTopK)
    setAutoBootstrapPending(true)

    try {
      const payload = buildCurrentRegressionRunPayload()
      if (!payload) {
        toast.error('请选择数据集')
        return
      }

      if (plan.stage === 'top_k') {
        if (runsByDataset.length === 0) {
          const batch = await evaluationApi.createRegressionAblationBatch({
            ...payload,
            grid: {
              top_k: [baselineTopK, candidateTopK],
            },
            max_combinations: 2,
            ablation_label_prefix: 'auto-bootstrap-top-k',
          })
          await runsQuery.refetch()
          if (batch.run_ids[0]) setSelectedBaseRunId(String(batch.run_ids[0]))
          if (batch.run_ids[1]) setSelectedTargetRunId(String(batch.run_ids[1]))
          toast.success(
            `已生成第一轮对比：召回数量 ${baselineTopK} 与 ${candidateTopK}`
          )
          return
        }

        const baselineRun =
          runsByDataset.find((run) => runParamNumber(run, 'top_k') !== candidateTopK) ||
          runsByDataset[0] ||
          null
        const run = await evaluationApi.createRegressionRun({
          ...payload,
          top_k: candidateTopK,
        })
        await runsQuery.refetch()
        if (baselineRun?.id) setSelectedBaseRunId(String(baselineRun.id))
        setSelectedTargetRunId(run.id)
        toast.success(`已补齐第一轮对比：召回数量 ${candidateTopK}`)
        return
      }

      if (plan.stage === 'reranker') {
        const existingStates = new Set(
          runsByDataset
            .map((run) => runParamBoolean(run, 'enable_reranker'))
            .filter((value): value is boolean => typeof value === 'boolean')
        )
        const nextEnableReranker = existingStates.has(false)
          ? true
          : existingStates.has(true)
            ? false
            : !enableReranker
        const baselineRun =
          runsByDataset.find(
            (run) => runParamBoolean(run, 'enable_reranker') !== nextEnableReranker
          ) || runsByDataset[0] || null
        const run = await evaluationApi.createRegressionRun({
          ...payload,
          enable_reranker: nextEnableReranker,
        })
        await runsQuery.refetch()
        if (baselineRun?.id) setSelectedBaseRunId(String(baselineRun.id))
        setSelectedTargetRunId(run.id)
        toast.success(
          `已生成第二轮对比：${nextEnableReranker ? '启用' : '关闭'}重排器`
        )
        return
      }

      const existingModes = new Set(
        runsByDataset
          .map((run) => runParamString(run, 'retrieval_mode'))
          .filter((value) => value === 'hybrid' || value === 'vector')
      )
      const nextRetrievalMode =
        existingModes.has('hybrid') && !existingModes.has('vector')
          ? 'vector'
          : existingModes.has('vector') && !existingModes.has('hybrid')
            ? 'hybrid'
            : retrievalMode === 'vector'
              ? 'hybrid'
              : 'vector'
      const baselineRun =
        runsByDataset.find(
          (run) => runParamString(run, 'retrieval_mode') !== nextRetrievalMode
        ) || runsByDataset[0] || null
      const run = await evaluationApi.createRegressionRun({
        ...payload,
        retrieval_mode: nextRetrievalMode,
      })
      await runsQuery.refetch()
      if (baselineRun?.id) setSelectedBaseRunId(String(baselineRun.id))
      setSelectedTargetRunId(run.id)
      toast.success(
        `已生成第三轮对比：${nextRetrievalMode === 'hybrid' ? '混合检索' : '向量检索'}`
      )
    } catch (err) {
      toast.error(formatApiError(err, '自动补齐对比记录失败'))
    } finally {
      setAutoBootstrapPending(false)
    }
  }

  async function runGridBatch(
    grid: Record<string, RegressionAblationGridValue[]>,
    maxCombinations: number
  ): Promise<void> {
    if (runDisabledReason) {
      toast.error(runDisabledReason)
      return
    }
    await submitAblationBatch(
      buildCurrentRegressionRunPayload(),
      grid,
      maxCombinations,
      () => runsQuery.refetch(),
      setSelectedTargetRunId
    )
  }

  async function computeDiff(): Promise<void> {
    await computeRegressionDiff(selectedBaseRunId, selectedTargetRunId, () =>
      diffQuery.refetch()
    )
  }

  async function exportDiffHtml(): Promise<void> {
    await exportRegressionDiffHtml(selectedBaseRunId, selectedTargetRunId)
  }

  async function refetchAblationPanels(): Promise<void> {
    await runsQuery.refetch()
    await leaderboardQuery.refetch()
  }

  const leaderboardItems = leaderboardQuery.data?.items
  const leaderboardRows: RegressionLeaderboardRow[] = Array.isArray(
    leaderboardItems
  )
    ? leaderboardItems
    : []
  const selectedDataset = useMemo(
    () => datasets.find((dataset) => dataset.id === datasetId) || null,
    [datasetId, datasets]
  )
  const selectedBaseRun = useMemo(
    () =>
      runsByDataset.find(
        (run) => _stableId(run.id) === _stableId(selectedBaseRunId)
      ) || null,
    [runsByDataset, selectedBaseRunId]
  )
  const selectedTargetRun = useMemo(
    () =>
      runsByDataset.find(
        (run) => _stableId(run.id) === _stableId(selectedTargetRunId)
      ) || null,
    [runsByDataset, selectedTargetRunId]
  )
  const runsSelectDisabled = runsLoading || runsByDataset.length === 0
  const canGenerateDiff = Boolean(
    _stableId(selectedBaseRunId) &&
    _stableId(selectedTargetRunId) &&
    _stableId(selectedBaseRunId) !== _stableId(selectedTargetRunId)
  )
  const autoBootstrapPlan = useMemo<AutoBootstrapPlan | null>(() => {
    if (runDisabledReason) return null

    const topKValues = new Set(
      runsByDataset
        .map((run) => runParamNumber(run, 'top_k'))
        .filter((value): value is number => typeof value === 'number')
    )
    if (topKValues.size < 2) {
      const candidateTopK = pickAutoCandidateTopK(topK)
      return {
        stage: 'top_k',
        label:
          runsByDataset.length === 0
            ? '自动生成第 1 轮对比'
            : '自动补齐第 1 轮对比',
        helper: `先比较召回数量 ${clampNumber(topK, 1, 50)} 与 ${candidateTopK}。`,
      }
    }

    const rerankerStates = new Set(
      runsByDataset
        .map((run) => runParamBoolean(run, 'enable_reranker'))
        .filter((value): value is boolean => typeof value === 'boolean')
    )
    if (!(rerankerStates.has(true) && rerankerStates.has(false))) {
      return {
        stage: 'reranker',
        label: '自动生成第 2 轮对比',
        helper: '保持其他参数不变，比较启用和关闭重排器的结果。',
      }
    }

    const retrievalModes = new Set(
      runsByDataset
        .map((run) => runParamString(run, 'retrieval_mode'))
        .filter((value) => value === 'hybrid' || value === 'vector')
    )
    if (!(retrievalModes.has('hybrid') && retrievalModes.has('vector'))) {
      return {
        stage: 'retrieval_mode',
        label: '自动生成第 3 轮对比',
        helper: '比较混合检索和向量检索，查看检索模式带来的变化。',
      }
    }

    return null
  }, [runDisabledReason, runsByDataset, topK])
  const autoRunLabel = autoBootstrapPlan?.label || null
  const autoRunHelper = autoBootstrapPlan?.helper || null
  const runsSelectionHint = useMemo(() => {
    if (!datasetId.trim()) return '先选择数据集，再加载可对比的运行记录。'
    if (runsLoading) return '正在加载当前数据集的运行记录...'
    if (runsByDataset.length === 0) {
      return '当前数据集暂无评测记录。至少完成两次参数评测后才能生成对比。'
    }
    if (runsByDataset.length === 1) {
      return '当前只有一条评测记录。再完成一次评测后即可比较。'
    }
    return '基准记录通常选择稳定方案，目标记录选择本次要验证的方案。'
  }, [datasetId, runsByDataset.length, runsLoading])
  const deepDiveMetricKeys = useMemo(
    () => LEADERBOARD_METRIC_OPTIONS.map((item) => item.key),
    []
  )
  const diffDelta = toNumber(diffScore?.delta)
  const diffDeltaClass = ablationDeltaClass(diffDelta)
  const diffDeltaValue = formatAblationDelta(diffDelta)
  const diffDeltaTone = ablationDeltaTone(diffDelta)
  const metricDiffRows = useMemo(
    () => (Array.isArray(diff?.metric_diffs) ? diff.metric_diffs : []),
    [diff]
  )
  const paramDiffRows = useMemo(() => {
    const base = toRecord(diff?.base_params)
    const target = toRecord(diff?.target_params)
    const keys = Array.from(
      new Set([...Object.keys(base), ...Object.keys(target)])
    ).sort((a, b) => a.localeCompare(b))
    return keys.map((key) => {
      const before = compactValue(base[key])
      const after = compactValue(target[key])
      return { key, before, after, changed: before !== after }
    })
  }, [diff])
  const workspaceGridClassName = ablationWorkspaceGridClassName(
    leftSidebarExpanded,
    leaderboardExpanded
  )

  return (
    <AppFrame showBackground={false} className="bg-background">
      <div className="flex h-full min-h-0 flex-col bg-background">
        <header className="shrink-0 border-b border-border bg-card px-4 py-3 sm:px-6">
          <PageHeader
            title="检索调参对比"
            description="比较同一数据集在不同检索参数下的评测结果。"
            icon={BarChart3}
            iconColor="text-primary"
            compact
            className="p-0"
          >
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  asChild
                  variant="outline"
                  className="h-9 rounded-md border-border bg-card px-3 text-sm text-foreground hover:bg-muted"
                >
                  <Link href="/evaluations">
                    <ChevronLeft className="mr-1.5 h-4 w-4" />
                    返回评测中心
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="刷新参数评测数据"
                  className="size-9 rounded-md border-border bg-card text-primary hover:bg-primary/10"
                  disabled={datasetsLoading || runsLoading}
                  onClick={() => {
                    datasetsQuery.refetch()
                    runsQuery.refetch()
                  }}
                >
                  <RefreshCcw className="h-4 w-4" />
                </Button>
              </div>
          </PageHeader>
        </header>

        <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-4">
          {leftSidebarCollapsed || leaderboardCollapsed ? (
            <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-border pb-3">
              {leftSidebarCollapsed ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-md"
                  onClick={() => setLeftSidebarCollapsed(false)}
                >
                  <ChevronRight className="mr-1.5 size-4" aria-hidden="true" />
                  显示参数配置
                </Button>
              ) : null}
              {leaderboardCollapsed ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-md"
                  onClick={() => setLeaderboardCollapsed(false)}
                >
                  <ChevronLeft className="mr-1.5 size-4" aria-hidden="true" />
                  显示评测排行
                </Button>
              ) : null}
            </div>
          ) : null}
          <div className={workspaceGridClassName}>
            {leftSidebarExpanded ? (
              <aside className="order-1 flex min-h-0 flex-col overflow-hidden rounded-md border border-border bg-card">
                <div className="shrink-0 border-b border-border bg-card px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-base font-semibold text-foreground">
                      参数配置
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 rounded-md px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={() => setLeftSidebarCollapsed(true)}
                    >
                      收起
                    </Button>
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain no-scrollbar">
                  <AblationSection
                    title="数据与指标"
                    description="选择数据集和本轮评测使用的参考指标。"
                    className="bg-card"
                  >
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label
                          htmlFor="ablation-dataset"
                          className="text-xs text-muted-foreground"
                        >
                          当前数据集
                        </Label>
                        <Select
                          value={datasetId}
                          onValueChange={setDatasetId}
                          disabled={datasetsLoading || !datasets.length}
                        >
                          <SelectTrigger
                            id="ablation-dataset"
                            className="h-10 rounded-md border-border bg-card text-sm"
                          >
                            <SelectValue
                              placeholder={
                                datasetsLoading ? '加载中...' : '选择数据集'
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {(datasets || []).map((dataset) => (
                              <SelectItem key={dataset.id} value={dataset.id}>
                                {dataset.name || dataset.id}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <AblationDatasetCard
                        dataset={selectedDataset}
                        metricKey={leaderboardMetricKey}
                      />
                      <div
                        className={cn(
                          'flex items-start gap-2 rounded-md border px-3 py-2 text-xs leading-5',
                          selectedDatasetCasesUnavailable
                            ? 'border-warning/30 bg-warning/10 text-warning'
                            : 'border-success/30 bg-success/10 text-success'
                        )}
                      >
                        {selectedDatasetCasesUnavailable ? (
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <Trophy className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        )}
                        <span>{selectedDatasetCasesStatusText}</span>
                      </div>
                    </div>
                  </AblationSection>

                  <AblationSection
                    title="评测模式"
                    description="决定这轮只看检索，还是同时带上生成质量指标。"
                    className="bg-card"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-foreground">
                            仅检索评测
                          </div>
                          <div className="mt-1 text-xs leading-5 text-muted-foreground">
                            关闭生成质量指标，只保留召回率、平均倒数排名与归一化增益等检索指标。
                          </div>
                        </div>
                        <Switch
                          checked={retrievalOnly}
                          onCheckedChange={setRetrievalOnly}
                        />
                      </div>

                      <div className="grid gap-2.5">
                        {RAGAS_METRIC_OPTIONS.map((option) => {
                          const checked = metricKeys.includes(option.key)
                          return (
                            <label
                              key={option.key}
                              className={cn(
                                'flex items-start gap-3 py-1.5',
                                retrievalOnly && 'opacity-60'
                              )}
                            >
                              <Checkbox
                                checked={checked}
                                disabled={retrievalOnly}
                                onCheckedChange={(value) => {
                                  const next = new Set(metricKeys)
                                  if (value === true) next.add(option.key)
                                  else next.delete(option.key)
                                  setMetricKeys(Array.from(next))
                                }}
                              />
                              <span className="space-y-1">
                                <span className="block text-sm font-medium text-foreground">
                                  {option.label}
                                </span>
                                <span className="block text-xs leading-5 text-muted-foreground">
                                  {option.hint}
                                </span>
                              </span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  </AblationSection>

                  <AblationSection
                    title="检索参数"
                    description="召回窗口、混合检索与权重参数。"
                    className="bg-card"
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs tracking-[0.08em] text-muted-foreground">
                          样本上限
                        </Label>
                        <Input
                          type="number"
                          value={maxCases}
                          min={1}
                          max={500}
                          onChange={(e) =>
                            setMaxCases(Number(e.target.value || 0))
                          }
                          className="h-9 rounded-lg border-border/70 bg-card"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs tracking-[0.08em] text-muted-foreground">
                          召回数量
                        </Label>
                        <Input
                          type="number"
                          value={topK}
                          min={1}
                          max={50}
                          onChange={(e) => setTopK(Number(e.target.value || 0))}
                          className="h-9 rounded-lg border-border/70 bg-card"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs tracking-[0.08em] text-muted-foreground">
                          检索模式
                        </Label>
                        <Select
                          value={retrievalMode}
                          onValueChange={setRetrievalMode}
                        >
                          <SelectTrigger className="h-9 rounded-lg border-border/70 bg-card">
                            <SelectValue placeholder="选择模式" />
                          </SelectTrigger>
                          <SelectContent>
                            {RETRIEVAL_MODE_OPTIONS.map((option) => (
                              <SelectItem key={option.key} value={option.key}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs tracking-[0.08em] text-muted-foreground">
                          分数阈值
                        </Label>
                        <Input
                          type="number"
                          value={scoreThreshold}
                          min={0}
                          max={1}
                          step={0.01}
                          onChange={(e) =>
                            setScoreThreshold(Number(e.target.value || 0))
                          }
                          className="h-9 rounded-lg border-border/70 bg-card"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs tracking-[0.08em] text-muted-foreground">
                          混合权重
                        </Label>
                        <Input
                          type="number"
                          value={alpha}
                          min={0}
                          max={1}
                          step={0.05}
                          onChange={(e) =>
                            setAlpha(Number(e.target.value || 0))
                          }
                          className="h-9 rounded-lg border-border/70 bg-card"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs tracking-[0.08em] text-muted-foreground">
                          多样性系数
                        </Label>
                        <Input
                          type="number"
                          value={mmrLambda}
                          min={0}
                          max={1}
                          step={0.05}
                          onChange={(e) =>
                            setMmrLambda(Number(e.target.value || 0))
                          }
                          className="h-9 rounded-lg border-border/70 bg-card"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs tracking-[0.08em] text-muted-foreground">
                          向量权重
                        </Label>
                        <Input
                          type="number"
                          value={vectorWeight}
                          min={0}
                          max={1}
                          step={0.05}
                          onChange={(e) =>
                            setVectorWeight(Number(e.target.value || 0))
                          }
                          className="h-9 rounded-lg border-border/70 bg-card"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs tracking-[0.08em] text-muted-foreground">
                          关键词权重
                        </Label>
                        <Input
                          type="number"
                          value={keywordWeight}
                          min={0}
                          max={1}
                          step={0.05}
                          onChange={(e) =>
                            setKeywordWeight(Number(e.target.value || 0))
                          }
                          className="h-9 rounded-lg border-border/70 bg-card"
                        />
                      </div>
                    </div>
                  </AblationSection>

                  <AblationSection
                    title="重排与过滤"
                    description="控制过滤策略与重排模型参数。"
                    className="bg-card"
                  >
                    <div className="space-y-3">
                      <label className="flex items-start gap-3 py-1.5">
                        <Checkbox
                          checked={skipEmptyContexts}
                          onCheckedChange={(value) =>
                            setSkipEmptyContexts(value === true)
                          }
                        />
                        <span className="space-y-1">
                          <span className="block text-sm font-medium text-foreground">
                            跳过空上下文样本
                          </span>
                          <span className="block text-xs leading-5 text-muted-foreground">
                            过滤掉没有引用上下文的样本，减少空样本对分数的扰动。
                          </span>
                        </span>
                      </label>

                      <label className="flex items-start gap-3 py-1.5">
                        <Checkbox
                          checked={enableWeightRerank}
                          onCheckedChange={(value) =>
                            setEnableWeightRerank(value === true)
                          }
                        />
                        <span className="space-y-1">
                          <span className="block text-sm font-medium text-foreground">
                            启用权重重排
                          </span>
                          <span className="block text-xs leading-5 text-muted-foreground">
                            对混合检索结果做二次权重整合，观察向量与关键词配比的影响。
                          </span>
                        </span>
                      </label>

                      <div className="border-t border-border/70 pt-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-foreground">
                              重排器
                            </div>
                            <div className="mt-1 text-xs leading-5 text-muted-foreground">
                              默认跟随系统设置；本次评测可临时切换重排服务和参与重排的结果数量。
                            </div>
                          </div>
                          <Switch
                            checked={enableReranker}
                            onCheckedChange={setEnableReranker}
                          />
                        </div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label className="text-xs tracking-[0.08em] text-muted-foreground">
                              重排服务
                            </Label>
                            <Select
                              value={rerankerProvider}
                              onValueChange={setRerankerProvider}
                            >
                              <SelectTrigger className="h-9 rounded-lg border-border/70 bg-card">
                                <SelectValue placeholder="选择重排器" />
                              </SelectTrigger>
                              <SelectContent>
                                {RERANKER_PROVIDER_OPTIONS.map((option) => (
                                  <SelectItem key={option.key} value={option.key}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <div className="text-xs leading-5 text-muted-foreground">
                              读取系统设置默认值，运行实验时可单独覆盖。
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs tracking-[0.08em] text-muted-foreground">
                              重排数量
                            </Label>
                            <Input
                              type="number"
                              value={rerankerTopN}
                              min={1}
                              max={200}
                              onChange={(e) =>
                                setRerankerTopN(Number(e.target.value || 0))
                              }
                              className="h-9 rounded-lg border-border/70 bg-card"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </AblationSection>
                </div>

                <div className="shrink-0 border-t border-border bg-card px-4 py-3">
                  <div className="text-xs font-medium text-muted-foreground">
                    开始评测
                  </div>
                  <Button
                    className="mt-2 h-10 w-full gap-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
                    disabled={Boolean(runDisabledReason) || autoBootstrapPending}
                    onClick={() =>
                      detachPromise(
                        autoRunLabel ? runAutoBootstrap() : runAblation()
                      )
                    }
                  >
                    <PlayCircle className="h-4 w-4" />
                    {autoBootstrapPending
                      ? '正在自动补齐...'
                      : autoRunLabel || '运行参数评测'}
                  </Button>
                  {runDisabledReason ? (
                    <div className="mt-2 text-xs leading-5 text-warning">
                      {runDisabledReason}
                    </div>
                  ) : autoRunLabel ? (
                    <div className="mt-2 text-xs leading-5 text-primary">
                      {autoRunHelper}
                    </div>
                  ) : null}
                </div>
              </aside>
            ) : null}

            <div className="contents">
              {leaderboardExpanded ? (
                <section
                  className={cn(
                    'order-3 flex min-h-0 flex-col overflow-hidden rounded-md border border-border bg-card',
                    leftSidebarExpanded
                      ? 'xl:col-span-2 2xl:col-span-1'
                      : 'xl:col-span-1'
                  )}
                >
                  <div className="flex h-full min-h-0 flex-col">
                    <div className="flex min-h-[58px] items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
                      <div className="min-w-0">
                        <div className="truncate text-base font-semibold text-foreground">
                          评测排行
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Trophy className="h-4 w-4 text-primary" />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 rounded-md px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                          onClick={() => setLeaderboardCollapsed(true)}
                        >
                          收起
                        </Button>
                      </div>
                    </div>

                    <div className="border-b border-border bg-card px-4 py-3">
                      <div className="space-y-2">
                        <div className="flex items-end gap-2">
                          <div className="min-w-0 flex-1 space-y-1">
                            <Label className="text-xs text-muted-foreground">
                              排行榜主指标
                            </Label>
                            <Select
                              value={leaderboardMetricKey}
                              onValueChange={setLeaderboardMetricKey}
                            >
                              <SelectTrigger className="h-9 rounded-md border-border bg-card text-sm">
                                <SelectValue placeholder="选择指标" />
                              </SelectTrigger>
                              <SelectContent>
                                {LEADERBOARD_METRIC_OPTIONS.map((metric) => (
                                  <SelectItem
                                    key={metric.key}
                                    value={metric.key}
                                  >
                                    {metric.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <Button
                            variant="outline"
                            className="h-9 gap-1.5 rounded-md border-border bg-card px-3 text-sm text-foreground hover:bg-muted"
                            disabled={leaderboardLoading}
                            onClick={() => leaderboardQuery.refetch()}
                          >
                            <RefreshCcw className="h-3.5 w-3.5" />
                            刷新
                          </Button>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">
                            点击结果后设为
                          </span>
                          <div className="inline-flex rounded-md border border-border bg-muted/30 p-0.5">
                            <button
                              type="button"
                              aria-pressed={leaderboardAssignRole === 'base'}
                              className={cn(
                                'h-7 rounded-md px-2.5 text-xs font-medium',
                                leaderboardAssignRole === 'base'
                                  ? 'bg-primary text-primary-foreground'
                                  : 'text-muted-foreground hover:bg-muted'
                              )}
                              onClick={() => setLeaderboardAssignRole('base')}
                            >
                              基准
                            </button>
                            <button
                              type="button"
                              aria-pressed={leaderboardAssignRole === 'target'}
                              className={cn(
                                'h-7 rounded-md px-2.5 text-xs font-medium',
                                leaderboardAssignRole === 'target'
                                  ? 'bg-primary text-primary-foreground'
                                  : 'text-muted-foreground hover:bg-muted'
                              )}
                              onClick={() => setLeaderboardAssignRole('target')}
                            >
                              目标
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
                      {leaderboardRows.length ? (
                        leaderboardRows.map((row) => {
                          const runId = String(row.run_id || '')
                          const metricValue = toNumber(row.metric_value)
                          const badge = runStatusMeta(row.status)
                          const isBase =
                            _stableId(runId) === _stableId(selectedBaseRunId)
                          const isTarget =
                            _stableId(runId) === _stableId(selectedTargetRunId)
                          return (
                            <button
                              key={runId}
                              type="button"
                              className={cn(
                                'w-full border-b border-border/60 bg-card px-5 py-2.5 text-left transition-colors hover:bg-muted/40',
                                isBase || isTarget
                                  ? 'border-l-2 border-l-info bg-info/5'
                                  : ''
                              )}
                              onClick={() => {
                                if (leaderboardAssignRole === 'base')
                                  setSelectedBaseRunId(runId)
                                else setSelectedTargetRunId(runId)
                              }}
                            >
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="font-mono text-xs text-foreground">
                                    {shortId(runId)}
                                  </span>
                                  <StatusBadge
                                    status={badge.status}
                                    label={badge.label}
                                    dense
                                  />
                                  {isBase ? (
                                    <span className="rounded-md bg-primary px-1.5 py-0.5 text-xs font-medium text-primary-foreground">
                                      基准
                                    </span>
                                  ) : null}
                                  {isTarget ? (
                                    <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                                      目标
                                    </span>
                                  ) : null}
                                </div>
                                <div className="mt-1.5 text-sm font-semibold tabular-nums text-foreground">
                                  {formatMetric(metricValue)}
                                </div>
                                <div className="mt-1 font-mono text-xs leading-4 text-muted-foreground">
                                  {String(
                                    row.retrieval_config_hash ||
                                      '无配置哈希'
                                  )}
                                </div>
                              </div>
                            </button>
                          )
                        })
                      ) : (
                        <AblationLeaderboardEmptyState />
                      )}
                    </div>
                  </div>
                </section>
              ) : null}

              <AblationComparisonWorkspace
                runsSelectionHint={runsSelectionHint}
                diffDeltaClass={diffDeltaClass}
                diffDeltaValue={diffDeltaValue}
                runsLoading={runsLoading}
                selectedBaseRunId={selectedBaseRunId}
                selectedTargetRunId={selectedTargetRunId}
                setSelectedBaseRunId={setSelectedBaseRunId}
                setSelectedTargetRunId={setSelectedTargetRunId}
                runsSelectDisabled={runsSelectDisabled}
                runsByDataset={runsByDataset}
                selectedBaseRun={selectedBaseRun}
                selectedTargetRun={selectedTargetRun}
                diffDeltaTone={diffDeltaTone}
                diffLoading={diffLoading}
                canGenerateDiff={canGenerateDiff}
                computeDiff={computeDiff}
                diff={diff}
                exportDiffHtml={exportDiffHtml}
                diffScoreFmt={diffScoreFmt}
                metricDiffRows={metricDiffRows}
                paramDiffRows={paramDiffRows}
                datasetId={datasetId}
                runDisabledReason={runDisabledReason}
                runGridBatch={runGridBatch}
                refetchPanels={refetchAblationPanels}
                leaderboardMetricKey={leaderboardMetricKey}
                deepDiveMetricKeys={deepDiveMetricKeys}
                diffJson={diffJson}
                caseCount={selectedDatasetCaseCount}
                autoRunLabel={autoRunLabel}
                autoRunHelper={autoRunHelper}
                autoBootstrapPending={autoBootstrapPending}
                runAutoBootstrap={runAutoBootstrap}
              />
            </div>
          </div>
        </div>
      </div>
    </AppFrame>
  )
}
