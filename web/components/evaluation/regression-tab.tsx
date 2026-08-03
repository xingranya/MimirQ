/**
 * 回归评测页签
 *
 * 功能：
 * - 测试用例管理
 * - 智能生成问题
 * - 批量运行回归测试
 */

'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import { datasetApi, evaluationApi } from '@/lib/api'
import type {
  Dataset,
  RegressionRun,
  RegressionRunCreate,
  RegressionRunDetail,
} from '@/types'
import { Button } from '@/components/ui/button'
import { TestCaseManager } from '@/components/test-case-manager'
import { TestGenerationDialog } from '@/components/test-generation-dialog'
import {
  Sparkles,
  Loader2,
  BarChart3,
  Clock3,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatApiError } from '@/lib/api-errors'
import { reportClientError } from '@/lib/client-logging'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  RAGAS_METRIC_OPTIONS,
  ragasMetricLabel,
} from '@/components/evaluation/ragas-metric-selector'
import { queryKeys } from '@/lib/query-keys'

function RegressionInlineStat({
  label,
  value,
  tone = 'neutral',
}: Readonly<{
  label: string
  value: ReactNode
  tone?: 'neutral' | 'success' | 'warning' | 'info'
}>) {
  const valueClass =
    tone === 'success'
      ? 'text-success'
      : tone === 'warning'
        ? 'text-warning'
        : tone === 'info'
          ? 'text-info'
          : 'text-foreground'

  return (
    <div className="inline-flex items-baseline gap-1.5 border-r border-border pr-2 last:border-r-0 last:pr-0">
      <span className="text-xs font-medium leading-none text-muted-foreground">
        {label}
      </span>
      <span
        className={cn('text-xs font-semibold leading-none', valueClass)}
      >
        {value}
      </span>
    </div>
  )
}

function RegressionMetricCompactGrid({
  metrics,
}: Readonly<{
  metrics: Array<{ key: string; value: number }>
}>) {
  return (
    <section className="border-y border-border py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-foreground">
            评分指标
          </div>
          <div className="mt-0.5 text-xs leading-4 text-muted-foreground">
            评测结果的汇总分，低分项可在下方查看样本明细。
          </div>
        </div>
        <span className="shrink-0 text-xs font-medium text-muted-foreground">
          {metrics.length} 项
        </span>
      </div>
      <div className="grid grid-cols-1 divide-y divide-border border-t border-border sm:grid-cols-2 sm:divide-y-0">
        {metrics.map((metric) => (
          <div
            key={metric.key}
            className="min-w-0 border-b border-border px-2 py-2 sm:border-r"
            title={`${ragasMetricLabel(metric.key)}: ${metric.value.toFixed(3)}`}
          >
            <div className="truncate text-xs font-medium leading-4 text-muted-foreground">
              {ragasMetricLabel(metric.key)}
            </div>
            <div className="mt-0.5 font-mono text-sm font-semibold leading-none tabular-nums text-foreground">
              {metric.value.toFixed(3)}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function safeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function primitiveText(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return fallback
}

function safeNumber(value: unknown): number {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

function EmbeddedSection({
  title,
  description,
  children,
  className,
}: Readonly<{
  title: string
  description?: string
  children: ReactNode
  className?: string
}>) {
  return (
    <section
      className={cn(
        'border-y border-border py-3',
        className
      )}
    >
      <div className="text-sm font-semibold text-foreground">
        {title}
      </div>
      {description ? (
        <p className="mt-1 text-xs leading-4 text-muted-foreground">
          {description}
        </p>
      ) : null}
      <div className="mt-3">{children}</div>
    </section>
  )
}

function EmbeddedCollapsibleSection({
  summary,
  description,
  badge,
  children,
  className,
}: Readonly<{
  summary: string
  description?: string
  badge?: ReactNode
  children: ReactNode
  className?: string
}>) {
  return (
    <details
      className={cn(
        'group overflow-hidden border-y border-border bg-card',
        className
      )}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-2.5 py-2.5 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground">
            {summary}
          </div>
          {description ? (
            <p className="mt-1 line-clamp-2 text-xs leading-4 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-muted-foreground">
          {badge}
          <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="border-t border-border/60 bg-card/80 p-2.5">
        {children}
      </div>
    </details>
  )
}

function EmbeddedToggleCard({
  title,
  description,
  checked,
  onCheckedChange,
  disabled = false,
}: Readonly<{
  title: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
}>) {
  return (
    <div
      className={cn(
        'border-t border-border py-3',
        disabled && 'opacity-60'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground">{title}</div>
          <div className="mt-1 text-xs leading-4 text-muted-foreground">
            {description}
          </div>
        </div>
        <Switch
          checked={checked}
          disabled={disabled}
          onCheckedChange={onCheckedChange}
        />
      </div>
    </div>
  )
}

const REGRESSION_CORE_METRIC_KEYS = new Set([
  'faithfulness',
  'response_relevancy',
  'context_precision',
])

const REGRESSION_SUMMARY_INLINE_KEYS = new Set([
  'items',
  'total_tokens',
  'total_cost',
  'expected_metadata_hit_rate',
  'expected_metadata_recall',
  'expected_metadata_cases_total',
  'expected_metadata_fields_total',
  'expected_metadata_fields_matched',
])

function RegressionMetricPicker({
  disabled = false,
  metricKeys,
  onMetricKeysChange,
}: Readonly<{
  disabled?: boolean
  metricKeys: string[]
  onMetricKeysChange: (nextKeys: string[]) => void
}>) {
  const regressionMetrics = RAGAS_METRIC_OPTIONS.filter((metric) =>
    metric.scopes.includes('regression')
  )
  const coreMetrics = regressionMetrics.filter((metric) =>
    REGRESSION_CORE_METRIC_KEYS.has(metric.key)
  )
  const advancedMetrics = regressionMetrics.filter(
    (metric) => !REGRESSION_CORE_METRIC_KEYS.has(metric.key)
  )
  const selectedAdvancedMetrics = advancedMetrics.filter((metric) =>
    metricKeys.includes(metric.key)
  )

  const setMetricChecked = (key: string, checked: boolean) => {
    if (checked) {
      if (metricKeys.includes(key)) return
      onMetricKeysChange([...metricKeys, key])
      return
    }
    onMetricKeysChange(metricKeys.filter((item) => item !== key))
  }

  return (
    <TooltipProvider delayDuration={120}>
      <div className={cn('space-y-2', disabled && 'opacity-60')}>
        <div className="grid gap-1.5">
          {coreMetrics.map((metric) => (
            <RegressionMetricOption
              key={metric.key}
              compact
              checked={metricKeys.includes(metric.key)}
              disabled={disabled}
              metric={metric}
              onCheckedChange={(checked) =>
                setMetricChecked(metric.key, checked)
              }
            />
          ))}
        </div>

        <details className="group overflow-hidden border-y border-border bg-muted/30">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-2.5 py-2 [&::-webkit-details-marker]:hidden">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-foreground">
                高级自动计算指标
              </div>
              <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                默认收起，按需要补充引用归因、上下文利用与鲁棒性指标。
              </div>
              {selectedAdvancedMetrics.length ? (
                <div className="mt-1 flex flex-wrap gap-1">
                  {selectedAdvancedMetrics.slice(0, 3).map((metric) => (
                    <span
                      key={metric.key}
                      className="rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary"
                    >
                      {metric.label}
                    </span>
                  ))}
                  {selectedAdvancedMetrics.length > 3 ? (
                    <span className="rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                      +{selectedAdvancedMetrics.length - 3}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-muted-foreground">
              {selectedAdvancedMetrics.length
                ? `${selectedAdvancedMetrics.length} 已选`
                : `${advancedMetrics.length} 项`}
              <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
            </span>
          </summary>
          <div className="grid gap-1.5 border-t border-border/60 bg-card p-2 md:grid-cols-2">
            {advancedMetrics.map((metric) => (
              <RegressionMetricOption
                key={metric.key}
                compact
                checked={metricKeys.includes(metric.key)}
                disabled={disabled}
                metric={metric}
                onCheckedChange={(checked) =>
                  setMetricChecked(metric.key, checked)
                }
              />
            ))}
          </div>
        </details>
      </div>
    </TooltipProvider>
  )
}

function RegressionMetricOption({
  checked,
  compact = false,
  disabled,
  metric,
  onCheckedChange,
}: Readonly<{
  checked: boolean
  compact?: boolean
  disabled: boolean
  metric: (typeof RAGAS_METRIC_OPTIONS)[number]
  onCheckedChange: (checked: boolean) => void
}>) {
  const detailLabel = `${metric.label}，${metric.kind}，${metric.category}，${metric.cost}。${metric.hint}`

  const metricText = (
    <>
      <span
        className={cn(
          'flex flex-wrap items-center gap-1.5 font-medium text-foreground',
          compact ? 'text-xs' : 'text-xs'
        )}
      >
        <span className="truncate">{metric.label}</span>
        <span className="rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
          {metric.kind}
        </span>
        {compact ? null : (
          <>
            <span className="rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
              {metric.category}
            </span>
            <span className="rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
              {metric.cost}
            </span>
          </>
        )}
      </span>
      <span
        className={cn(
          'block text-muted-foreground',
          compact
            ? 'mt-0.5 line-clamp-1 text-xs leading-3'
            : 'mt-1 text-xs leading-4'
        )}
      >
        {metric.hint}
      </span>
    </>
  )

  return (
    <label
      className={cn(
        'flex items-start gap-2 border-b border-border bg-card',
        compact ? 'px-2 py-1.5' : 'px-2.5 py-2',
        disabled && 'cursor-not-allowed'
      )}
    >
      <Checkbox
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      <span className="min-w-0 flex-1">
        {compact ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                aria-label={detailLabel}
                className="block cursor-help outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                tabIndex={disabled ? -1 : 0}
              >
                {metricText}
              </span>
            </TooltipTrigger>
            <TooltipContent
              align="start"
              className="max-w-[320px] rounded-md border border-border bg-card px-3 py-2 text-left text-foreground/85 "
              side="right"
              sideOffset={8}
            >
              <div className="text-xs font-semibold leading-5 text-foreground">
                {metric.label}
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {[metric.kind, metric.category, metric.cost].map((item) => (
                  <span
                    key={item}
                    className="rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-xs font-medium text-muted-foreground"
                  >
                    {item}
                  </span>
                ))}
              </div>
              <div className="mt-2 text-xs leading-5 text-muted-foreground">
                {metric.hint}
              </div>
            </TooltipContent>
          </Tooltip>
        ) : (
          metricText
        )}
      </span>
    </label>
  )
}

const REGRESSION_METRIC_GUIDE = [
  ['命中率', '命中目标样本的比例，越高越好'],
  ['平均倒数排名', '首个命中位置越靠前，分数越高'],
  ['召回率', '检索到的相关项占比，越高越好'],
  ['归一化增益', '综合衡量相关性与排序质量'],
  ['平均精度', '衡量多次查询的平均检索精度'],
]

function regressionRunStatusMeta(status: unknown): {
  label: string
  className: string
} {
  const value = String(status || '')
  if (value === 'completed') {
    return {
      label: '已完成',
      className: 'border-success/20 bg-success/10 text-success',
    }
  }
  if (value === 'failed') {
    return {
      label: '失败',
      className: 'border-destructive/20 bg-destructive/10 text-destructive',
    }
  }
  if (value === 'running') {
    return {
      label: '运行中',
      className: 'border-primary/20 bg-primary/10 text-primary',
    }
  }
  if (value === 'pending') {
    return {
      label: '等待中',
      className: 'border-info/20 bg-info/10 text-info',
    }
  }
  return {
    label: '状态未知',
    className: 'border-border bg-muted text-muted-foreground',
  }
}

function RegressionMetricGuideCard() {
  return (
    <div className="shrink-0 rounded-md border border-border bg-card p-3">
      <div className="text-sm font-semibold text-foreground">指标说明</div>
      <div className="mt-2 divide-y divide-border border-y border-border">
        {REGRESSION_METRIC_GUIDE.map(([label, description]) => (
          <div key={label} className="flex items-start gap-2">
            <span className="min-w-0 py-2">
              <span className="block text-xs font-semibold text-foreground">
                {label}
              </span>
              <span className="mt-0.5 block text-xs leading-3 text-muted-foreground">
                {description}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function formatMetricNumber(value: unknown): string {
  const numeric = finiteNumber(value)
  return numeric === null ? '待返回' : numeric.toFixed(3)
}

function formatInteger(value: unknown): string {
  const numeric = finiteNumber(value)
  return numeric === null ? '待返回' : String(Math.trunc(numeric))
}

function formatAnswerPreview(value: unknown): string {
  const answer = primitiveText(value).trim()
  if (!answer) return '暂无回答'
  return answer.length > 160 ? `${answer.slice(0, 160)}…` : answer
}

export function RegressionTestTab({
  embedded = false,
}: Readonly<{ embedded?: boolean }>) {
  const searchParams = useSearchParams()
  const deepLinkDatasetId = searchParams.get('dataset_id') || ''
  const deepLinkRunId = searchParams.get('run_id') || ''
  const [showGenerationDialog, setShowGenerationDialog] = useState(false)

  // 评测样本和运行记录都必须绑定数据集。
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('')
  const datasetsQuery = useQuery({
    queryKey: queryKeys.datasets.exhaustive({ purpose: 'regression-tests' }),
    queryFn: () => datasetApi.listAll(),
    staleTime: 30_000,
  })
  const datasets = useMemo<Dataset[]>(() => {
    return datasetsQuery.data ?? []
  }, [datasetsQuery.data])
  const isLoadingDatasets = datasetsQuery.isLoading || datasetsQuery.isFetching
  const latestRegressionCaseQuery = useQuery({
    queryKey: queryKeys.evaluations.regressionCases({ limit: 1 }),
    queryFn: () => evaluationApi.listRegressionCases({ limit: 1 }),
    staleTime: 30_000,
  })
  const latestRegressionCaseDatasetId = useMemo(() => {
    const first = latestRegressionCaseQuery.data?.items?.[0]
    return typeof first?.dataset_id === 'string' ? first.dataset_id : ''
  }, [latestRegressionCaseQuery.data])
  const isLoadingLatestRegressionCase =
    latestRegressionCaseQuery.isLoading || latestRegressionCaseQuery.isFetching

  // 运行配置
  const [metricKeys, setMetricKeys] = useState<string[]>([
    'faithfulness',
    'response_relevancy',
  ])
  const [retrievalOnly, setRetrievalOnly] = useState(false)
  const [useLlmJudge, setUseLlmJudge] = useState(false)

  // 运行历史
  const [selectedRunId, setSelectedRunId] = useState<string>('')
  const [isConfigPanelCollapsed, setIsConfigPanelCollapsed] = useState(false)

  const runsQuery = useQuery({
    queryKey: queryKeys.evaluations.regressionRuns({ limit: 50 }),
    queryFn: () => evaluationApi.listRegressionRuns({ limit: 50 }),
  })
  const runDetailQuery = useQuery({
    queryKey: queryKeys.evaluations.regressionRunDetail(selectedRunId, {
      include_items: true,
      include_contexts: false,
    }),
    enabled: Boolean(selectedRunId),
    queryFn: () =>
      evaluationApi.getRegressionRun(selectedRunId, {
        include_items: true,
        include_contexts: false,
      }),
    refetchInterval: (query) => {
      const detail = query.state.data as RegressionRunDetail | undefined
      const status = detail?.run?.status
      return status === 'pending' || status === 'running' ? 2000 : false
    },
  })
  const runs = useMemo<RegressionRun[]>(() => {
    const items = runsQuery.data?.items
    return Array.isArray(items) ? items : []
  }, [runsQuery.data])
  const runDetail = runDetailQuery.data || null
  const isLoadingRuns = runsQuery.isLoading || runsQuery.isFetching

  const visibleRuns = useMemo(() => {
    if (!selectedDatasetId) return runs
    return (runs || []).filter(
      (r) => String(r?.dataset_id || '') === selectedDatasetId
    )
  }, [runs, selectedDatasetId])

  useEffect(() => {
    if (deepLinkDatasetId) setSelectedDatasetId(deepLinkDatasetId)
    if (deepLinkRunId) setSelectedRunId(deepLinkRunId)
  }, [deepLinkDatasetId, deepLinkRunId])

  // 切换数据集后，只保留当前筛选范围内的运行记录。
  useEffect(() => {
    if (!selectedDatasetId) return
    if (
      selectedRunId &&
      (visibleRuns.some((r) => r?.id === selectedRunId) || selectedRunId === deepLinkRunId)
    )
      return
    setSelectedRunId(visibleRuns?.[0]?.id || '')
  }, [deepLinkRunId, selectedDatasetId, selectedRunId, visibleRuns])

  useEffect(() => {
    if (!datasets.length) return
    if (!deepLinkDatasetId && isLoadingLatestRegressionCase) return
    const knownDatasetIds = new Set(datasets.map((dataset) => dataset.id))
    setSelectedDatasetId((prev) => {
      if (prev && knownDatasetIds.has(prev)) return prev
      if (deepLinkDatasetId && knownDatasetIds.has(deepLinkDatasetId)) {
        return deepLinkDatasetId
      }
      if (
        latestRegressionCaseDatasetId &&
        knownDatasetIds.has(latestRegressionCaseDatasetId)
      ) {
        return latestRegressionCaseDatasetId
      }
      return datasets[0]?.id || ''
    })
  }, [
    datasets,
    deepLinkDatasetId,
    isLoadingLatestRegressionCase,
    latestRegressionCaseDatasetId,
  ])

  useEffect(() => {
    const firstRunId = runs[0]?.id
    if (!firstRunId) return
    setSelectedRunId((prev) => prev || firstRunId)
  }, [runs])

  useEffect(() => {
    if (!runsQuery.error) return
    reportClientError('Failed to load regression run history', runsQuery.error)
    toast.error(formatApiError(runsQuery.error, '加载运行历史失败'))
  }, [runsQuery.error])

  // 运行选中的测试
  const handleRunTests = async (caseIds: string[]) => {
    if (!selectedDatasetId) {
      toast.error('请先选择数据集')
      return
    }
    if (caseIds.length === 0) {
      toast.error('请至少选择一个评测样本')
      return
    }

    try {
      const params: RegressionRunCreate = {
        case_ids: caseIds,
        dataset_id: selectedDatasetId,
        metrics: retrievalOnly ? [] : metricKeys,
        use_llm_judge: Boolean(!retrievalOnly && useLlmJudge),
        skip_empty_contexts: true,
        max_cases: Math.min(Math.max(caseIds.length, 1), 500),
      }

      const run = await evaluationApi.createRegressionRun(params)
      toast.success('回归评测已开始')
      await runsQuery.refetch()
      setSelectedRunId(run.id)
    } catch (error) {
      reportClientError('Failed to run regression evaluation', error)
      toast.error(formatApiError(error, '运行回归评测失败'))
    }
  }

  // 生成完成回调
  const handleGenerated = () => {
    toast.success('问题生成完成')
    // 用例列表由组件自行刷新。
  }

  const summary = runDetail?.run?.summary || {}
  const summaryItems = typeof summary.items === 'number' ? summary.items : '-'
  const summaryTokens =
    typeof summary.total_tokens === 'number' ? summary.total_tokens : '-'
  const summaryCost =
    typeof summary.total_cost === 'number' ||
    typeof summary.total_cost === 'string'
      ? summary.total_cost
      : '-'
  const displayMetrics = Object.entries(summary)
    .filter(
      ([k, v]) =>
        !REGRESSION_SUMMARY_INLINE_KEYS.has(k) && finiteNumber(v) !== null
    )
    .map(([k, v]) => ({ key: k, value: Number(v) }))
  const answerComparisonStatus = displayMetrics.some((m) =>
    ['answer_correctness', 'factual_correctness'].includes(m.key)
  )
    ? '有'
    : '待返回'
  const evidenceRecall =
    typeof summary.retrieval_recall === 'number'
      ? Number(summary.retrieval_recall).toFixed(3)
      : '待返回'
  const expectedMetadataHitRate = formatMetricNumber(
    summary.expected_metadata_hit_rate
  )
  const expectedMetadataRecall = formatMetricNumber(
    summary.expected_metadata_recall
  )
  const expectedMetadataFieldsMatched = finiteNumber(
    summary.expected_metadata_fields_matched
  )
  const expectedMetadataFieldsTotal = finiteNumber(
    summary.expected_metadata_fields_total
  )
  const expectedMetadataFieldsText =
    expectedMetadataFieldsMatched !== null || expectedMetadataFieldsTotal !== null
      ? `${Math.trunc(expectedMetadataFieldsMatched || 0)}/${Math.trunc(expectedMetadataFieldsTotal || 0)}`
      : '待返回'
  const hasExpectedMetadataSummary = [
    summary.expected_metadata_hit_rate,
    summary.expected_metadata_recall,
    summary.expected_metadata_cases_total,
    summary.expected_metadata_fields_total,
    summary.expected_metadata_fields_matched,
  ].some((value) => finiteNumber(value) !== null)
  const multimodalSlices = safeRecord(summary.multimodal_slices)
  const multimodalSliceCounts = safeRecord(multimodalSlices.counts)
  const multimodalSliceEvaluatable = safeRecord(multimodalSlices.evaluatable)
  const multimodalSliceCoverage = safeRecord(multimodalSlices.coverage)
  const multimodalSliceRows = [
    { key: 'chart', label: '图表' },
    { key: 'formula', label: '公式' },
    { key: 'table_math', label: '表格公式' },
    { key: 'image', label: '图片' },
    { key: 'text', label: '文本' },
  ]
    .map((slice) => ({
      ...slice,
      count: safeNumber(multimodalSliceCounts[slice.key]),
      evaluatable: safeNumber(multimodalSliceEvaluatable[slice.key]),
      coverage: safeNumber(multimodalSliceCoverage[slice.key]),
    }))
    .filter(
      (slice) => slice.count > 0 || slice.evaluatable > 0 || slice.coverage > 0
    )
  const multimodalTextOnlyFullCoverage =
    multimodalSliceRows.length === 1 &&
    multimodalSliceRows[0]?.key === 'text' &&
    multimodalSliceRows[0].count > 0 &&
    multimodalSliceRows[0].evaluatable === multimodalSliceRows[0].count &&
    multimodalSliceRows[0].coverage >= 0.999
  const shouldShowMultimodalSlicePanel =
    multimodalSliceRows.length > 0 && !multimodalTextOnlyFullCoverage
  const hasRunSummary =
    displayMetrics.length > 0 ||
    multimodalSliceRows.length > 0 ||
    hasExpectedMetadataSummary
  const multimodalSliceMinCoverage = multimodalSliceRows.length
    ? Math.min(...multimodalSliceRows.map((slice) => slice.coverage))
    : null
  const multimodalSliceSummaryText = (() => {
    if (!multimodalSliceRows.length) return ''
    if (multimodalSliceRows.length === 1) {
      const slice = multimodalSliceRows[0]
      return `${slice.label} ${slice.evaluatable}/${slice.count}`
    }
    return `${multimodalSliceRows.length} 类 · 最低 ${Math.round((multimodalSliceMinCoverage || 0) * 100)}%`
  })()

  const embeddedGridCols = isConfigPanelCollapsed
    ? 'xl:grid-cols-[minmax(0,1fr)] 2xl:grid-cols-[minmax(0,1fr)_310px]'
    : 'xl:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[330px_minmax(0,1fr)_310px]'

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 作为独立页面使用时显示页头。 */}
      {embedded ? null : (
        <header className="px-8 py-6 border-b border-border bg-card">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-xl font-semibold text-foreground">
                回归评测
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                使用标准问答和引用证据检查当前知识问答效果。
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => setShowGenerationDialog(true)}
              >
                <Sparkles className="w-4 h-4" />
                智能生成问题
              </Button>
            </div>
          </div>

          {/* 指标选择 */}
          <div className="border-y border-border py-4">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-5">
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  数据集
                </div>
                <Select
                  value={selectedDatasetId}
                  onValueChange={setSelectedDatasetId}
                  disabled={isLoadingDatasets || !datasets.length}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue
                      placeholder={
                        isLoadingDatasets ? '加载中...' : '选择数据集'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {(datasets || []).map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name || d.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="lg:col-span-7">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-medium text-muted-foreground">
                      仅评测检索结果
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      开启后不评测生成答案，只检查召回、排序和拒答情况。
                    </div>
                  </div>
                  <Switch
                    checked={retrievalOnly}
                    onCheckedChange={(checked) => {
                      setRetrievalOnly(checked)
                      if (checked) {
                        setUseLlmJudge(false)
                        setMetricKeys([])
                      } else if (!metricKeys.length) {
                        setMetricKeys(['faithfulness', 'response_relevancy'])
                      }
                    }}
                  />
                </div>

                <div className="flex items-start justify-between gap-3 mt-4">
                  <div>
                    <div className="text-xs font-medium text-muted-foreground">
                      使用模型复核答案
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      为每个样本补充评分、原因和引用片段，会产生额外调用费用；仅评测检索结果时不可用。
                    </div>
                  </div>
                  <Switch
                    checked={useLlmJudge}
                    disabled={retrievalOnly}
                    onCheckedChange={(v) => setUseLlmJudge(Boolean(v))}
                  />
                </div>

                <div className="text-xs font-medium text-muted-foreground mt-4 mb-2">
                  评测指标
                </div>
                <div className="flex flex-wrap gap-2">
                  {RAGAS_METRIC_OPTIONS.map((m) => (
                    <label
                      key={m.key}
                      className={cn(
                        'flex items-center gap-2 text-sm',
                        retrievalOnly && 'opacity-50'
                      )}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-border"
                        checked={metricKeys.includes(m.key)}
                        disabled={retrievalOnly}
                        onChange={(e) => {
                          setMetricKeys((prev) =>
                            e.target.checked
                              ? [...prev, m.key]
                              : prev.filter((x) => x !== m.key)
                          )
                        }}
                      />
                      <span className="text-foreground/80">{m.label}</span>
                    </label>
                  ))}
                  {retrievalOnly && (
                    <span className="text-xs text-muted-foreground">
                      当前仅评测检索结果
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </header>
      )}

      {embedded && isConfigPanelCollapsed ? (
        <div className="mb-3 flex items-center border-b border-border pb-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-md"
            onClick={() => setIsConfigPanelCollapsed(false)}
          >
            <ChevronRight className="mr-1.5 size-4" aria-hidden="true" />
            显示评测配置
          </Button>
        </div>
      ) : null}

      {/* 主内容区 */}
      <div
        className={
          embedded
            ? `min-h-0 flex-1 grid grid-cols-1 gap-4 overflow-y-auto overscroll-contain p-0 custom-scrollbar 2xl:overflow-hidden ${embeddedGridCols}`
            : 'grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.6fr)] xl:overflow-hidden'
        }
      >
        {embedded && !isConfigPanelCollapsed ? (
          <aside className="flex min-h-0 flex-col overflow-hidden rounded-md border border-border/60 bg-card xl:min-h-[560px] 2xl:min-h-0">
              <div className="shrink-0 border-b border-border bg-card px-3 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-medium text-muted-foreground">
                      评测配置
                    </div>
                    <div className="mt-1 text-sm font-semibold text-foreground">
                      数据集与运行参数
                    </div>
                    <p className="mt-1 text-xs leading-4 text-muted-foreground">
                      选择数据集，准备标准样本，然后检查当前知识问答效果。
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1.5 rounded-md border-border/60 bg-card/90 px-2 text-xs"
                      onClick={() => setShowGenerationDialog(true)}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      生成测试问题
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={() => setIsConfigPanelCollapsed(true)}
                    >
                      收起
                    </Button>
                  </div>
                </div>

                <div className="mt-3 border-t border-border pt-3">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      数据集
                    </span>
                    <span
                      className={cn(
                        'text-xs font-medium',
                        selectedDatasetId
                          ? 'text-success'
                          : 'text-warning'
                      )}
                    >
                      {selectedDatasetId ? '已绑定' : '未绑定'}
                    </span>
                  </div>
                  <Select
                    value={selectedDatasetId}
                    onValueChange={setSelectedDatasetId}
                    disabled={isLoadingDatasets || !datasets.length}
                  >
                    <SelectTrigger className="h-9 rounded-md border-border bg-card text-sm">
                      <SelectValue
                        placeholder={
                          isLoadingDatasets ? '加载中...' : '选择数据集'
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
                  {datasets.length ? null : (
                    <div className="mt-2 text-xs leading-4 text-muted-foreground">
                      暂无可用数据集。历史记录仍可查看，创建标准样本前需要先选择数据集。
                    </div>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <RegressionInlineStat
                    label="运行记录"
                    value={visibleRuns.length}
                  />
                  <RegressionInlineStat
                    label="评分指标"
                    value={retrievalOnly ? '仅检索' : metricKeys.length}
                    tone={retrievalOnly ? 'info' : 'neutral'}
                  />
                  <RegressionInlineStat
                    label="模型复核"
                    value={useLlmJudge && !retrievalOnly ? '已启用' : '未启用'}
                    tone={useLlmJudge && !retrievalOnly ? 'success' : 'neutral'}
                  />
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain p-2.5 pb-6 custom-scrollbar">
                <EmbeddedSection
                  title="评测方式"
                  description="使用当前数据集的标准问答和引用证据检查检索与回答质量。"
                >
                  <div className="space-y-2">
                    <EmbeddedToggleCard
                      title="仅检索评测"
                      description="开启后不评测生成答案，只检查召回率、命中率、排序质量和拒答情况。"
                      checked={retrievalOnly}
                      onCheckedChange={(checked) => {
                        setRetrievalOnly(checked)
                        if (checked) {
                          setUseLlmJudge(false)
                          setMetricKeys([])
                        } else if (!metricKeys.length) {
                          setMetricKeys(['faithfulness', 'response_relevancy'])
                        }
                      }}
                    />
                    <EmbeddedToggleCard
                      title="使用模型复核答案"
                      description="为每个样本补充评分、原因和引用片段，会产生额外调用费用；仅检索评测时不可用。"
                      checked={useLlmJudge}
                      disabled={retrievalOnly}
                      onCheckedChange={(checked) =>
                        setUseLlmJudge(Boolean(checked))
                      }
                    />
                  </div>
                </EmbeddedSection>

                <EmbeddedCollapsibleSection
                  summary="评分维度"
                  description="按需选择答案质量和检索质量指标。"
                  badge={
                    retrievalOnly ? '仅检索' : `已选 ${metricKeys.length} 项`
                  }
                >
                  <RegressionMetricPicker
                    metricKeys={metricKeys}
                    onMetricKeysChange={setMetricKeys}
                    disabled={retrievalOnly}
                  />
                </EmbeddedCollapsibleSection>
              </div>
          </aside>
        ) : null}

        {/* 左侧：测试用例管理 */}
        <div
          className={cn(
            'flex min-w-0 flex-col rounded-md border border-border bg-card',
            embedded
              ? 'xl:min-h-[560px] 2xl:min-h-0'
              : 'min-h-[440px] xl:min-h-0'
          )}
        >
          <TestCaseManager
            datasetId={selectedDatasetId || null}
            dense={embedded}
            onRunTests={handleRunTests}
          />
        </div>

        {/* 右侧：运行结果 */}
        <div
          className={cn(
            'flex min-w-0 flex-1 flex-col gap-2.5',
            embedded &&
              cn(
                'overflow-y-auto overscroll-contain custom-scrollbar xl:min-h-[440px] 2xl:col-span-1 2xl:min-h-0',
                isConfigPanelCollapsed ? 'xl:col-span-1' : 'xl:col-span-2'
              ),
            !embedded && 'min-h-[440px] overflow-y-auto xl:min-h-0'
          )}
        >
          {/* 运行历史列表 */}
          <div
            className={cn(
              'shrink-0 overflow-hidden rounded-md border border-border bg-card'
            )}
          >
            <div
              className={cn(
                'flex items-center justify-between border-b border-border p-3'
              )}
            >
              <div>
                <div className="text-xs text-muted-foreground">
                  评测记录
                </div>
                <div className="mt-1 text-sm font-semibold text-foreground">
                  运行历史
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {visibleRuns.length} 次
                {selectedDatasetId ? '（按数据集过滤）' : ''}
              </div>
            </div>
            <div
              className={cn(
                'overflow-y-auto overscroll-contain custom-scrollbar',
                embedded ? 'max-h-[190px]' : 'max-h-40'
              )}
            >
              {(() => {
                if (isLoadingRuns) {
                  return (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin motion-reduce:animate-none text-muted-foreground" />
                    </div>
                  )
                } else if (visibleRuns.length === 0) {
                  return (
                    <div className="flex min-h-[128px] flex-col items-center justify-center px-3 py-5 text-center">
                      <div className="text-sm font-medium text-foreground">
                        暂无运行记录
                      </div>
                      <div className="mt-1 text-xs leading-4 text-muted-foreground">
                        完成回归评测后，记录会显示在这里。
                      </div>
                    </div>
                  )
                } else {
                  return visibleRuns.map((run) => {
                    const status = regressionRunStatusMeta(run.status)
                    return (
                      <button
                        key={run.id}
                        onClick={() => setSelectedRunId(run.id)}
                        className={cn(
                          'w-full border-b border-border text-left transition-colors hover:bg-muted/40 motion-reduce:transition-none',
                          embedded ? 'px-2.5 py-2' : 'p-4',
                          selectedRunId === run.id && 'bg-primary/5'
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="truncate text-sm font-medium text-foreground">
                            运行 {run.id.slice(0, 8)}
                          </div>
                          <span
                            className={cn(
                              'rounded-md border px-2 py-0.5 text-xs',
                              status.className
                            )}
                          >
                            {status.label}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                          {embedded ? (
                            <Clock3 className="h-3.5 w-3.5" />
                          ) : null}
                          <span>
                            {new Date(run.created_at).toLocaleString('zh-CN')}
                          </span>
                        </div>
                      </button>
                    )
                  })
                }
              })()}
            </div>
          </div>

          {/* 运行详情 */}
          <div
            className={cn(
              'flex-1 overflow-y-auto overscroll-contain rounded-md border border-border bg-card p-3 custom-scrollbar',
              embedded && 'min-h-[180px]'
            )}
          >
            <div className="mb-3">
              <div>
                <div className="text-xs text-muted-foreground">
                  评测结果
                </div>
                <div className="mt-1 text-sm font-semibold text-foreground">
                  运行结果与样本明细
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  将当前回答、召回证据和业务元数据与标准样本逐项比较。
                </div>
              </div>
            </div>

            {runDetailQuery.error ? (
              <div className="mt-3 flex flex-col gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-medium text-destructive">
                    无法加载运行详情
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    请检查网络后重试，运行记录不会受到影响。
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 rounded-md"
                  onClick={() => void runDetailQuery.refetch()}
                >
                  重新加载
                </Button>
              </div>
            ) : null}

            {runDetailQuery.isLoading && selectedRunId ? (
              <div className="mt-3 flex min-h-[120px] items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                正在加载运行详情
              </div>
            ) : null}

            {runDetail?.run?.error_message ? (
              <div className="mt-3 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                <div className="font-medium">本次评测未完成</div>
                <div className="mt-1 break-words text-xs">
                  {runDetail.run.error_message}
                </div>
              </div>
            ) : null}

            {!runDetailQuery.isLoading &&
            !runDetailQuery.error &&
            !runDetail?.run?.error_message &&
            hasRunSummary ? (
              <div className="mt-4">
                {displayMetrics.length > 0 ? (
                  <RegressionMetricCompactGrid metrics={displayMetrics} />
                ) : null}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <RegressionInlineStat label="样本" value={summaryItems} />
                  <RegressionInlineStat
                    label="标准答案对比"
                    value={answerComparisonStatus}
                    tone="info"
                  />
                  <RegressionInlineStat
                    label="标准证据命中"
                    value={evidenceRecall}
                    tone="success"
                  />
                  <RegressionInlineStat
                    label="业务元数据命中"
                    value={expectedMetadataHitRate}
                    tone="success"
                  />
                  <RegressionInlineStat label="文本用量" value={summaryTokens} />
                  <RegressionInlineStat label="估算费用" value={summaryCost} />
                  {multimodalSliceRows.length ? (
                    <RegressionInlineStat
                      label="切片覆盖"
                      value={multimodalSliceSummaryText}
                      tone={multimodalTextOnlyFullCoverage ? 'neutral' : 'warning'}
                    />
                  ) : null}
                </div>
                {hasExpectedMetadataSummary ? (
                  <div className="mt-3 border-y border-success/30 bg-success/5 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-foreground">
                          业务元数据召回
                        </div>
                        <div className="mt-0.5 max-w-2xl text-xs leading-5 text-muted-foreground">
                          检查召回结果是否包含业务规则要求的元数据字段。
                        </div>
                      </div>
                      <span className="rounded-md border border-success/30 bg-success/10 px-2 py-1 text-xs font-medium text-success">
                        {formatInteger(summary.expected_metadata_cases_total)} 个样本
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <RegressionInlineStat
                        label="完整命中率"
                        value={expectedMetadataHitRate}
                        tone="success"
                      />
                      <RegressionInlineStat
                        label="字段召回率"
                        value={expectedMetadataRecall}
                        tone="info"
                      />
                      <RegressionInlineStat
                        label="已匹配字段"
                        value={expectedMetadataFieldsText}
                        tone="neutral"
                      />
                    </div>
                  </div>
                ) : null}
                {shouldShowMultimodalSlicePanel ? (
                  <div className="mt-3 border-y border-border bg-muted/20 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-foreground">
                          切片覆盖异常
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          出现图表、公式、表格公式或图片，或任一类型覆盖不足时才显示。
                        </div>
                      </div>
                      <span className="rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-muted-foreground">
                        {safeNumber(multimodalSlices.items)} 个样本
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 border-l border-t border-border md:grid-cols-3 xl:grid-cols-5">
                      {multimodalSliceRows.map((slice) => (
                        <div
                          key={slice.key}
                          className="border-b border-r border-border bg-card px-2.5 py-2"
                        >
                          <div className="text-xs font-semibold text-foreground">
                            {slice.label}
                          </div>
                          <div className="mt-1 text-lg font-semibold leading-none text-foreground tabular-nums">
                            {slice.evaluatable}/{slice.count}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            覆盖率 {(slice.coverage * 100).toFixed(0)}%
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {(() => {
                  const slices = safeRecord(summary?.retrieval_slices)
                  const parseQuality = safeRecord(slices.parse_quality)
                  const chunkQuality = safeRecord(slices.chunk_quality)
                  const pq = Array.isArray(parseQuality.buckets) ? parseQuality.buckets : []
                  const cq = Array.isArray(chunkQuality.buckets) ? chunkQuality.buckets : []
                  const hasPq = pq.length
                  const hasCq = cq.length
                  if (!hasPq && !hasCq) return null

                  const renderTable = (title: string, rows: unknown[]) => {
                    const top = (rows || []).slice(0, 8)
                    return (
                      <div className="border-y border-border bg-muted/20 py-3">
                        <div className="text-xs font-semibold text-foreground mb-2">
                          {title}
                        </div>
                        <div className="overflow-auto">
                          <table
                            aria-label={`${title} 分桶统计`}
                            className="min-w-[360px] w-full text-xs"
                          >
                            <thead>
                              <tr className="text-muted-foreground border-b border-border/60">
                                <th className="text-left py-1 pr-2">区间</th>
                                <th className="text-right py-1 pr-2">样本</th>
                                <th className="text-right py-1 pr-2">召回率</th>
                                <th className="text-right py-1 pr-2">平均倒数排名</th>
                                <th className="text-right py-1 pr-2">
                                  归一化增益
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {top.map((r, index) => {
                                const row = safeRecord(r)
                                const bucketKey = primitiveText(row.key)
                                return (
                                  <tr
                                    key={bucketKey || `bucket-${index}`}
                                    className="border-b border-border/40"
                                  >
                                    <td className="py-1 pr-2 font-mono text-muted-foreground">
                                      {bucketKey}
                                    </td>
                                    <td className="py-1 pr-2 text-right tabular-nums">
                                      {primitiveText(row.items, '—')}
                                    </td>
                                    <td className="py-1 pr-2 text-right tabular-nums">
                                      {typeof row.retrieval_recall === 'number'
                                        ? row.retrieval_recall.toFixed(3)
                                        : '—'}
                                    </td>
                                    <td className="py-1 pr-2 text-right tabular-nums">
                                      {typeof row.retrieval_mrr === 'number'
                                        ? row.retrieval_mrr.toFixed(3)
                                        : '—'}
                                    </td>
                                    <td className="py-1 pr-2 text-right tabular-nums">
                                      {typeof row.retrieval_ndcg_at_10 === 'number'
                                        ? row.retrieval_ndcg_at_10.toFixed(3)
                                        : '—'}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )
                  }

                  return (
                    <div className="mt-4">
                      <div className="text-sm font-semibold text-foreground mb-3">
                        分组质量分析
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {hasPq
                          ? renderTable(
                              '解析质量对检索的影响',
                              pq
                            )
                          : null}
                        {hasCq
                          ? renderTable(
                              '分块质量对检索的影响',
                              cq
                            )
                          : null}
                      </div>
                    </div>
                  )
                })()}
              </div>
            ) : !runDetailQuery.isLoading &&
              !runDetailQuery.error &&
              !runDetail?.run?.error_message ? (
              <div className="mt-3 rounded-md border border-dashed border-border bg-muted/20 px-3 py-5 text-center">
                <div className="text-sm font-medium text-foreground">
                  {selectedRunId ? '当前还没有可展示分数' : '先选一个运行记录'}
                </div>
                <div className="mt-1.5 text-xs leading-5 text-muted-foreground">
                  {selectedRunId
                    ? '这条评测可能仍在处理中，或暂时没有汇总指标。'
                    : '在运行历史中选择一条记录后，这里会显示答案、证据和业务元数据的对比结果。'}
                </div>
              </div>
            ) : null}

            {/* 明细列表 */}
            {runDetail?.items && runDetail.items.length > 0 && (
              <div className="mt-6">
                <div className="mb-3 text-sm font-semibold text-foreground">
                  样本明细（{runDetail.items.length}）
                </div>
                <div className="space-y-2">
                  {runDetail.items.map((item, index: number) => (
                    <div
                      key={item.id}
                      className={cn(
                        'rounded-md border p-3',
                        embedded
                          ? 'border-border/60 bg-muted/20'
                          : 'border-border bg-muted/40'
                      )}
                    >
                      <div className="text-sm font-medium text-foreground mb-1">
                        {index + 1}. {item.question}
                      </div>
                      <div className="mt-2 text-xs leading-5 text-muted-foreground">
                        <span className="font-medium">实际回答：</span>{' '}
                        {formatAnswerPreview(item.response)}
                      </div>
                      {item.scores && Object.keys(item.scores).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {Object.entries(item.scores).map(
                            ([k, v]) => (
                              <span
                                key={k}
                                className="text-xs px-2 py-0.5 rounded-md bg-info/10 text-info border border-info/20"
                              >
                                {ragasMetricLabel(k)}：{' '}
                                {typeof v === 'number' ? v.toFixed(2) : String(v)}
                              </span>
                            )
                          )}
                        </div>
                      )}
                      {(() => {
                        const meta = safeRecord(item.meta)
                        const missingKeys = Array.isArray(
                          meta.expected_metadata_missing_keys
                        )
                          ? meta.expected_metadata_missing_keys.filter(
                              (key): key is string =>
                                typeof key === 'string' && Boolean(key)
                            )
                          : []
                        const fieldsMatched = finiteNumber(
                          meta.expected_metadata_fields_matched
                        )
                        const fieldsTotal = finiteNumber(
                          meta.expected_metadata_fields_total
                        )
                        const hasExpectedMetadata =
                          typeof meta.expected_metadata_hit === 'boolean' ||
                          finiteNumber(meta.expected_metadata_recall) !== null ||
                          fieldsMatched !== null ||
                          fieldsTotal !== null ||
                          missingKeys.length > 0

                        if (!hasExpectedMetadata) return null

                        const fieldsText =
                          fieldsMatched !== null || fieldsTotal !== null
                            ? `${Math.trunc(fieldsMatched || 0)}/${Math.trunc(fieldsTotal || 0)}`
                            : '待返回'

                        return (
                          <details className="mt-2 rounded-md border border-success/30 bg-success/5 p-2">
                            <summary className="cursor-pointer select-none text-xs font-medium text-success">
                              业务元数据
                              {typeof meta.expected_metadata_hit === 'boolean'
                                ? ` · ${meta.expected_metadata_hit ? '命中' : '未命中'}`
                                : ''}
                            </summary>
                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                              <span>
                                字段召回率：{' '}
                                {formatMetricNumber(
                                  meta.expected_metadata_recall
                                )}
                              </span>
                              <span>
                                已匹配字段：{fieldsText}
                              </span>
                            </div>
                            {missingKeys.length ? (
                              <div className="mt-2 text-xs leading-5 text-muted-foreground">
                                <span className="font-medium text-foreground/80">
                                  缺失字段：
                                </span>{' '}
                                {missingKeys.slice(0, 8).join(', ')}
                              </div>
                            ) : null}
                          </details>
                        )
                      })()}
                      {(() => {
                        const exps = item.meta?.explanations
                        if (!exps || typeof exps !== 'object') return null
                        const entries = Object.entries(safeRecord(exps)).filter(
                          ([, v]) => typeof v === 'string' && v
                        )
                        if (!entries.length) return null
                        return (
                          <details className="mt-2">
                            <summary className="text-xs text-muted-foreground cursor-pointer select-none">
                              解释
                            </summary>
                            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                              {entries.map(([k, v]) => (
                                <div key={k} className="flex gap-2">
                                  <span className="font-medium text-foreground/80">
                                    {ragasMetricLabel(k)}：
                                  </span>
                                  <span className="break-words">
                                    {String(v)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </details>
                        )
                      })()}
                      {(() => {
                        const judge = safeRecord(item.meta?.llm_judge)
                        if (!judge.enabled) return null
                        const overall = judge.overall_score
                        const modelUsed = judge.model_used
                        const parts: Array<{
                          key: string
                          label: string
                          obj: Record<string, unknown>
                        }> = [
                          {
                            key: 'retrieval',
                            label: '检索质量',
                            obj: safeRecord(judge.retrieval),
                          },
                          {
                            key: 'generation',
                            label: '回答质量',
                            obj: safeRecord(judge.generation),
                          },
                        ]
                        return (
                          <details className="mt-2">
                            <summary className="text-xs text-muted-foreground cursor-pointer select-none">
                              模型复核
                              {typeof overall === 'number'
                                ? ` · 综合评分 ${overall.toFixed(3)}`
                                : ''}
                            </summary>
                            <div className="mt-2 space-y-2 text-xs text-muted-foreground">
                              {modelUsed ? (
                                <div className="text-xs text-muted-foreground">
                                  使用模型：{primitiveText(modelUsed)}
                                </div>
                              ) : null}
                              {parts.map(({ key, label, obj }) => {
                                if (!Object.keys(obj).length) return null
                                const score = obj.score
                                const reason = obj.reason
                                const quotes = Array.isArray(obj.evidence_quotes)
                                  ? obj.evidence_quotes.filter((x): x is string => typeof x === 'string' && Boolean(x))
                                  : []
                                return (
                                  <div
                                    key={key}
                                    className="rounded-md border border-border/60 bg-muted/30 p-2"
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="font-medium text-foreground/80">
                                        {label}
                                      </span>
                                      <span className="tabular-nums">
                                        {typeof score === 'number'
                                          ? score.toFixed(3)
                                          : '—'}
                                      </span>
                                    </div>
                                    {typeof reason === 'string' && reason ? (
                                      <div className="mt-1 text-muted-foreground">
                                        {reason}
                                      </div>
                                    ) : null}
                                    {quotes.length ? (
                                      <div className="mt-2 space-y-1">
                                        {quotes.slice(0, 3).map((q) => (
                                          <div
                                            key={q}
                                            className="text-xs leading-5 text-muted-foreground"
                                          >
                                            “{q}”
                                          </div>
                                        ))}
                                      </div>
                                    ) : null}
                                  </div>
                                )
                              })}
                            </div>
                          </details>
                        )
                      })()}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          {embedded ? <RegressionMetricGuideCard /> : null}
        </div>
      </div>

      {/* 智能生成对话框 */}
      <TestGenerationDialog
        open={showGenerationDialog}
        onClose={() => setShowGenerationDialog(false)}
        onGenerated={handleGenerated}
      />
    </div>
  )
}
