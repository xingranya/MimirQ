'use client'

/**
 * RAGAS 评测页面 - 支持 Tab 切换
 * Tab 1: 对话评测（基于对话历史）
 * Tab 2: 回归测试（基于测试用例）
 * Tab 3: Queryset Health（检索基准集健康度）
 */

import {
  Suspense,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { AppFrame } from '@/components/app-frame'
import { NavigationVisibilityGate } from '@/components/auth/navigation-visibility-gate'
import { PageLoading } from '@/components/ui/page-loading'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AnalysisPageShell } from '@/components/ui/analysis-page-shell'
import { PageTitleIcon } from '@/components/ui/page-title-icon'
import {
  MANAGEMENT_HERO_PANEL_CLASS,
  KNOWLEDGE_OPS_SUMMARY_PANEL_CLASS,
} from '@/components/ui/knowledge-ops-hero'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { StatusBadge } from '@/components/ui/status-badge'
import {
  evaluationApi,
  chatApi,
  type RagasRun,
  type RagasRunDetail,
} from '@/lib/api'
import { formatApiError } from '@/lib/api-errors'
import { useTenantAccess } from '@/hooks/use-tenant-access'
import { Link } from '@/i18n/navigation'
import { canShowAdminControlledNavigationModule } from '@/lib/navigation-visibility'
import type { Conversation, JsonObject, Message } from '@/types'
import {
  BarChart3,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Database,
  Filter,
  Grid3X3,
  Info,
  Loader2,
  ListChecks,
  PlayCircle,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  MessageSquare,
  TestTube2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { reportClientError } from '@/lib/client-logging'
import { queryKeys } from '@/lib/query-keys'
import { RegressionTestTab } from '@/components/evaluation/regression-tab'
import { QuerysetHealthTab } from '@/components/evaluation/queryset-health-tab'
import {
  RagasMetricSelector,
  ragasMetricLabel,
} from '@/components/evaluation/ragas-metric-selector'

type TabType = 'conversation' | 'regression' | 'queryset_health'
type ConversationEvidenceFilter = 'ready' | 'missing' | 'all'
type ConversationWorkspaceView = 'setup' | 'results' | 'runs'

const EMPTY_CONVERSATIONS: Conversation[] = []
const EMPTY_RUNS: RagasRun[] = []
const ADVANCED_DIAGNOSTIC_ITEM_CLASS =
  'items-start rounded-md px-2.5 py-2.5 data-[highlighted]:bg-muted data-[highlighted]:text-foreground focus:bg-muted focus:text-foreground'

const CONVERSATION_EVIDENCE_FILTERS: Array<{
  id: ConversationEvidenceFilter
  label: string
}> = [
  { id: 'ready', label: '可评测' },
  { id: 'missing', label: '缺证据' },
  { id: 'all', label: '全部' },
]

const TAB_META: Array<{
  id: TabType
  label: string
  title: string
  description: string
  icon: typeof MessageSquare
}> = [
  {
    id: 'conversation',
    label: '对话评测',
    title: '实时会话评分',
    description: '基于已有对话和引用上下文，快速拉起一轮 RAGAS 评测。',
    icon: MessageSquare,
  },
  {
    id: 'regression',
    label: 'Golden 评测集',
    title: 'Golden 回归评测',
    description: '用数据集级标准问答和标准证据持续评估当前 RAG pipeline。',
    icon: TestTube2,
  },
  {
    id: 'queryset_health',
    label: '检索集健康度',
    title: '检索集健康度',
    description: '查看趋势、差异与退化标记，定位检索集层面的异常波动。',
    icon: BarChart3,
  },
]

function metricLabel(key: string): string {
  return ragasMetricLabel(key)
}

function displayMetricsFor(summary: JsonObject, metricKeys: string[]) {
  return metricKeys.flatMap((key) => {
    const value = summary[key]
    return typeof value === 'number' && Number.isFinite(value)
      ? [{ key, value }]
      : []
  })
}

function parseEvaluationTab(value: string | null | undefined): TabType | null {
  const tab = (value || '').trim().toLowerCase()
  if (
    tab === 'regression' ||
    tab === 'conversation' ||
    tab === 'queryset_health'
  )
    return tab
  return null
}

function formatCompactCount(value: unknown): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return '-'
  return Intl.NumberFormat('zh-CN', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n)
}

function formatMoney(value: unknown): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return '-'
  if (n === 0) return '¥0'
  if (Math.abs(n) < 0.01) return `¥${n.toFixed(4)}`
  return `¥${n.toFixed(2)}`
}

function formatPercentValue(
  value: number | null | undefined,
  digits = 1
): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-'
  return `${(value * 100).toFixed(digits)}%`
}

function formatDateTime(value: string | undefined): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('zh-CN', { hour12: false })
}

function formatRunDuration(run: RagasRun): string {
  const started = new Date(run.started_at || run.created_at).getTime()
  const finished = new Date(run.finished_at || '').getTime()
  if (
    !Number.isFinite(started) ||
    !Number.isFinite(finished) ||
    finished < started
  )
    return '-'
  const seconds = Math.max(1, Math.round((finished - started) / 1000))
  return `${seconds} 秒`
}

function shortConversationTitle(
  conversation: Conversation | null,
  fallbackId?: string
): string {
  if (conversation?.title) return conversation.title
  if (fallbackId) return `对话 ${String(fallbackId).slice(0, 8)}…`
  return '未选择'
}

function runStatusLabel(status: string | undefined): string {
  if (status === 'completed') return '完成'
  if (status === 'failed') return '失败'
  if (status === 'pending') return '待运行'
  return '运行中'
}

function isMissingEvidenceError(message: string | null | undefined): boolean {
  return /missing contexts|missing.*citations|No evaluatable turns/i.test(
    String(message || '')
  )
}

function runStatusTone(
  status: string | undefined
): 'completed' | 'failed' | 'processing' {
  if (status === 'completed') return 'completed'
  if (status === 'failed') return 'failed'
  return 'processing'
}

function numericSummaryValue(
  run: RagasRun | null | undefined,
  key: string
): number | null {
  const value = run?.summary?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function percentile(values: number[], percentileValue: number): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1)
  )
  return sorted[index]
}

function scoreRowsFor(
  detail: RagasRunDetail | null,
  summary: JsonObject
) {
  const metrics = detail?.run?.metrics?.length
    ? detail.run.metrics
    : Object.entries(summary)
        .filter(([, value]) => typeof value === 'number')
        .map(([key]) => key)
        .filter((key) => !['items', 'total_tokens', 'total_cost'].includes(key))

  return metrics.map((key) => {
    const itemValues = (detail?.items || [])
      .map((item) => item.scores?.[key])
      .filter(
        (value): value is number =>
          typeof value === 'number' && Number.isFinite(value)
      )
    const mean = itemValues.length
      ? itemValues.reduce((sum, value) => sum + value, 0) / itemValues.length
      : Number(summary[key])
    const passCount = itemValues.filter((value) => value >= 0.8).length

    return {
      key,
      label: metricLabel(key),
      mean: Number.isFinite(mean) ? mean : null,
      p50: percentile(itemValues, 50),
      p90: percentile(itemValues, 90),
      passRate: itemValues.length ? passCount / itemValues.length : null,
    }
  }).filter(
    (row) =>
      row.mean !== null ||
      row.p50 !== null ||
      row.p90 !== null ||
      row.passRate !== null
  )
}

function summarizeConversationEvidence(messages: Message[]) {
  const assistantMessages = messages.filter(
    (message) => message.role === 'assistant'
  )
  const citationsCount = assistantMessages.reduce(
    (sum, message) => sum + (message.citations?.length || 0),
    0
  )
  const evaluableTurns = assistantMessages.filter(
    (message) => (message.citations?.length || 0) > 0
  ).length

  return {
    assistantTurns: assistantMessages.length,
    citationsCount,
    evaluableTurns,
    isEvaluable: evaluableTurns > 0,
  }
}

function itemHasLowScore(
  item: RagasRunDetail['items'][number],
  metricKeys: string[]
): boolean {
  return metricKeys.some((key) => {
    const value = item.scores?.[key]
    return typeof value === 'number' && value < 0.8
  })
}

function EvaluationConfigSection({
  title,
  description,
  children,
  className,
  icon: Icon,
}: Readonly<{
  title: string
  description?: string
  children: ReactNode
  className?: string
  icon?: typeof MessageSquare
}>) {
  return (
    <section
      className={cn(
        'border-b border-border px-3 py-3 last:border-b-0',
        className
      )}
    >
      <div className="flex items-start gap-2.5">
        {Icon ? (
          <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-md bg-muted text-primary">
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        ) : null}
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-foreground">
            {title}
          </div>
          {description ? (
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-2">{children}</div>
    </section>
  )
}

function EvaluationInlineStat({
  label,
  value,
}: Readonly<{
  label: string
  value: ReactNode
}>) {
  return (
    <div className="inline-flex min-h-8 items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1">
      <span className="text-xs font-medium text-muted-foreground">
        {label}
      </span>
      <span className="text-xs font-semibold tabular-nums text-foreground">
        {value}
      </span>
    </div>
  )
}

function buildEvidenceReadinessState({
  isChecking,
  isEvaluable,
  isMissingEvidenceFailure,
}: Readonly<{
  isChecking: boolean
  isEvaluable: boolean
  isMissingEvidenceFailure: boolean
}>) {
  const tone = isChecking ? 'checking' : isEvaluable ? 'ready' : 'missing'
  const label =
    tone === 'checking' ? '检查中' : tone === 'ready' ? '可评测' : '缺证据'
  const title =
    tone === 'ready'
      ? '这条会话可以计算忠实度'
      : tone === 'checking'
        ? '正在检查会话证据'
        : '这条会话不能计算忠实度'
  const description =
    tone === 'ready'
      ? '助手回答已经包含引用证据，可以据此判断答案是否忠于上下文。'
      : tone === 'checking'
        ? '正在读取会话消息，确认是否有可用于评测的引用证据。'
        : '这条历史会话仍可阅读，但没有保存引用证据，因此无法计算忠实度；这不代表答案一定错误。'

  return {
    tone,
    label,
    title,
    description,
    showMissingEvidenceFailure: isMissingEvidenceFailure,
  }
}

function EvaluationStageStat({
  label,
  value,
  helper,
}: Readonly<{
  label: string
  value: ReactNode
  helper: string
}>) {
  return (
    <div className="border-b border-border px-1 py-3 last:border-b-0">
      <div className="text-xs font-medium text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold leading-7 tabular-nums text-foreground">
        {value}
      </div>
      <div className="mt-1 text-xs leading-5 text-muted-foreground">{helper}</div>
    </div>
  )
}

function EvaluationResultsStage({
  selectedRunTitle,
  statusBadge,
  isChecking,
  isEvaluable,
  assistantTurns,
  citationsCount,
  evaluableTurns,
  isMissingEvidenceFailure,
  summary,
  displayMetrics,
  emptyRunState,
  fillAvailableHeight = false,
  className,
}: Readonly<{
  selectedRunTitle: string
  statusBadge: ReactNode
  isChecking: boolean
  isEvaluable: boolean
  assistantTurns: number
  citationsCount: number
  evaluableTurns: number
  isMissingEvidenceFailure: boolean
  summary: JsonObject
  displayMetrics: Array<{ key: string; value: number }>
  emptyRunState: { title: string; description: string }
  fillAvailableHeight?: boolean
  className?: string
}>) {
  const readiness = buildEvidenceReadinessState({
    isChecking,
    isEvaluable,
    isMissingEvidenceFailure,
  })
  const readinessLabelClassName =
    readiness.tone === 'ready'
      ? 'bg-success/10 text-success'
      : readiness.tone === 'checking'
        ? 'bg-info/10 text-info'
        : 'bg-warning/10 text-warning'
  const isDeterministicEvaluation =
    String(summary.mode || '') === 'deterministic_conversation'
  const deterministicReason = String(summary.ragas_skipped_reason || '')
  const deterministicDescription =
    deterministicReason === 'ragas_wall_timeout'
      ? '评测服务超时后已自动切换为证据校验；当前分数由答案与引用证据的一致性计算。'
      : '当前分数由答案与引用证据的一致性计算。'

  return (
    <section
      className={cn(
        'overflow-hidden rounded-lg border border-border bg-card',
        'flex flex-col',
        fillAvailableHeight && 'min-h-0 flex-1',
        className
      )}
    >
      <div className="border-b border-border bg-muted/30 px-4 py-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex h-7 items-center rounded-md border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground">
            运行详情
          </span>
          {statusBadge}
        </div>
        <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="line-clamp-2 text-base font-semibold leading-6 text-foreground">
              {selectedRunTitle}
            </div>
            <p className="mt-1 max-w-3xl text-[13px] leading-5 text-muted-foreground">
              查看当前会话的证据完整性、运行状态和评分结果。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <EvaluationInlineStat label="助手轮次" value={assistantTurns} />
            <EvaluationInlineStat label="可评轮次" value={evaluableTurns} />
            <EvaluationInlineStat label="证据" value={citationsCount} />
          </div>
        </div>
      </div>

      <div
        className={cn(
          'grid gap-5 px-4 py-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(240px,0.9fr)]',
          fillAvailableHeight && 'min-h-[420px] flex-1'
        )}
      >
        <div
          className={cn(
            'min-w-0 space-y-3',
            fillAvailableHeight && 'flex h-full flex-col'
          )}
        >
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="text-xs font-medium text-muted-foreground">
              忠实度可评估性
            </div>
            <span
              className={cn(
                'rounded-md px-2 py-1 text-xs font-semibold',
                readinessLabelClassName
              )}
            >
              {readiness.label}
            </span>
          </div>
          <div className="text-base font-semibold text-foreground">
            {readiness.title}
          </div>
          <p className="max-w-3xl text-[13px] leading-5 text-muted-foreground">
            {readiness.description}
          </p>
          {isDeterministicEvaluation ? (
            <div className="rounded-md border border-info/25 bg-info/10 px-3 py-2.5 text-xs leading-5 text-foreground">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-info">评测方式</span>
                <span className="rounded-md border border-info/20 bg-card px-2 py-0.5 font-semibold text-info">
                  确定性证据校验
                </span>
              </div>
              <p className="mt-1 text-foreground/80">
                {deterministicDescription}
              </p>
            </div>
          ) : null}
          {readiness.showMissingEvidenceFailure ? (
            <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs font-medium leading-5 text-warning">
              当前任务因缺少引用证据而失败，并非评分过低。
            </p>
          ) : null}

          {!displayMetrics.length ? (
            <div
              className={cn(
                'rounded-md border border-dashed border-border bg-muted/30 p-4',
                fillAvailableHeight && 'flex flex-1 flex-col justify-between'
              )}
            >
              <div className="text-sm font-semibold text-foreground">
                {emptyRunState.title}
              </div>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
                {emptyRunState.description}
              </p>
              <ol className="mt-4 grid gap-3 border-t border-border pt-3 sm:grid-cols-3">
                <li>
                  <div className="text-xs font-semibold text-foreground">
                    1 选择会话来源
                  </div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">
                    从已有会话或查询中选择
                  </div>
                </li>
                <li>
                  <div className="text-xs font-semibold text-foreground">
                    2 配置评测参数
                  </div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">
                    选择指标与过滤规则
                  </div>
                </li>
                <li>
                  <div className="text-xs font-semibold text-foreground">
                    3 开始评测
                  </div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">
                    流程完成后查看结果
                  </div>
                </li>
              </ol>
            </div>
          ) : null}
        </div>

        <div className="grid gap-0 border-t border-border sm:grid-cols-3 sm:divide-x sm:divide-border xl:grid-cols-1 xl:divide-x-0 xl:border-l xl:border-t-0 xl:pl-4">
          <EvaluationStageStat
            label="评测样本"
            value={formatCompactCount(summary.items)}
            helper="当前任务纳入统计的轮次数"
          />
          <EvaluationStageStat
            label="令牌开销"
            value={formatCompactCount(summary.total_tokens)}
            helper="本次运行累计的令牌消耗"
          />
          <EvaluationStageStat
            label="LLM 成本"
            value={formatMoney(summary.total_cost)}
            helper="本次运行产生的模型成本"
          />
        </div>
      </div>

      {displayMetrics.length ? (
        <div className="border-t border-border px-4 py-4">
          <div className="mb-3 flex flex-wrap items-center gap-2.5">
            <div className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
              <BarChart3 className="h-4 w-4 text-primary" aria-hidden="true" />
              得分概览
            </div>
            <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
              {displayMetrics.length} 项指标
            </span>
          </div>
          <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 2xl:grid-cols-3">
            {displayMetrics.map((metric) => (
              <div
                key={metric.key}
                className="border-t border-border pt-3"
              >
                <div className="text-xs font-medium text-muted-foreground">
                  {metricLabel(metric.key)}
                </div>
                <div className="mt-1 text-xl font-semibold leading-7 tabular-nums text-foreground">
                  {metric.value.toFixed(3)}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}

function EvaluationHeroEmptyState({
  title,
  description,
  density = 'default',
}: Readonly<{
  title: string
  description: string
  density?: 'default' | 'compact'
}>) {
  const compact = density === 'compact'

  return (
    <div
      className={cn(
        'flex rounded-md border border-dashed border-border bg-muted/30',
        compact
          ? 'min-h-[148px] flex-row items-center justify-start gap-3 px-3 py-2.5 text-left'
          : 'min-h-[188px] flex-col items-center justify-center px-6 py-8 text-center'
      )}
    >
      <span
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-md bg-muted text-primary',
          compact ? 'h-10 w-10' : 'mb-3 h-12 w-12'
        )}
      >
        <BarChart3 className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className={cn(compact && 'min-w-0')}>
        <div
          className={cn(
            'font-semibold text-foreground',
            compact ? 'text-[13px]' : 'text-sm'
          )}
        >
          {title}
        </div>
        <p
          className={cn(
            'max-w-xl text-xs text-muted-foreground',
            compact ? 'mt-1 leading-4' : 'mt-2 leading-5'
          )}
        >
          {description}
        </p>
      </div>
    </div>
  )
}

function EvaluationHeroCard({
  title,
  description,
  conversationsCount,
  runsCount,
  focusLabel,
  focusValue,
  onRefresh,
  isLoading,
  showAblationsEntry,
}: Readonly<{
  title: string
  description: string
  conversationsCount: number
  runsCount: number
  focusLabel: string
  focusValue: number
  onRefresh: () => void
  isLoading: boolean
  showAblationsEntry: boolean
}>) {
  return (
    <section data-management-header="true" className={MANAGEMENT_HERO_PANEL_CLASS}>
      <div className="relative flex min-w-0 flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted text-primary">
            <PageTitleIcon name="ragas-evaluation" className="size-9" />
          </div>

          <div className="min-w-0">
            <h1 className="text-xl font-semibold leading-7 text-foreground">
              <span>{title}</span>
            </h1>
            <p
              className="mt-0.5 text-[13px] leading-5 text-muted-foreground"
              title={description}
            >
              {description}
            </p>
          </div>
        </div>

        <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] xl:min-w-[520px]">
          <div className={cn(KNOWLEDGE_OPS_SUMMARY_PANEL_CLASS, 'gap-2.5 px-4 py-2.5 text-[12px]')}>
            <span className="inline-flex items-center gap-2 font-medium text-foreground">
              <span
                className="size-1.5 rounded-full bg-info"
                aria-hidden="true"
              />
              会话
            </span>
            <span className="font-semibold tabular-nums text-foreground">
              {conversationsCount}
            </span>
            <span className="h-4 w-px bg-border" />
            <span className="font-medium text-muted-foreground">运行</span>
            <span className="font-semibold tabular-nums text-primary">
              {runsCount}
            </span>
            <span className="h-4 w-px bg-border" />
            <span className="font-medium text-muted-foreground">{focusLabel}</span>
            <span className="font-semibold tabular-nums text-success">
              {focusValue}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 flex-1 px-3 text-sm sm:flex-none"
                >
                  <SlidersHorizontal className="mr-2 h-4 w-4" />
                  高级诊断
                  <ChevronDown className="ml-2 h-3.5 w-3.5 text-muted-foreground/70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-72 rounded-md border-border bg-popover p-1.5"
              >
                <DropdownMenuLabel className="px-2.5 py-2 text-xs font-medium text-foreground">
                  召回与向量诊断
                </DropdownMenuLabel>
                <DropdownMenuItem
                  asChild
                  className={ADVANCED_DIAGNOSTIC_ITEM_CLASS}
                >
                  <Link href="/knowledge/similarity">
                    <Grid3X3 className="mt-0.5 h-4 w-4 shrink-0 text-info" />
                    <span className="min-w-0">
                        <span className="block text-[13px] font-semibold text-foreground">
                          向量相似度诊断
                        </span>
                        <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">
                        用热力图检查问题、切片与数据集之间的语义重叠。
                      </span>
                    </span>
                  </Link>
                </DropdownMenuItem>
                {showAblationsEntry ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      asChild
                      className={ADVANCED_DIAGNOSTIC_ITEM_CLASS}
                    >
                      <Link href="/evaluations/ablations">
                        <SlidersHorizontal className="mt-0.5 h-4 w-4 shrink-0 text-info" />
                        <span className="min-w-0">
                          <span className="block text-[13px] font-semibold text-foreground">
                            检索调参对比
                          </span>
                          <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">
                            对比检索配置、消融结果和参数影响。
                          </span>
                        </span>
                      </Link>
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              type="button"
              variant="outline"
              className="h-9 flex-1 px-3 text-sm sm:flex-none"
              onClick={onRefresh}
            >
              <RefreshCw
                className={cn(
                  'mr-2 h-4 w-4',
                  isLoading && 'animate-spin motion-reduce:animate-none'
                )}
              />
              刷新
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}

function CollapsedWorkspaceRail({
  title,
  icon: Icon,
  badgeItems,
  onExpand,
  side,
}: Readonly<{
  title: string
  icon: LucideIcon
  badgeItems: Array<{ label: string; value: ReactNode }>
  onExpand: () => void
  side: 'left' | 'right'
}>) {
  const expandLabel = side === 'left' ? `展开${title}` : `展开${title}侧栏`
  const ExpandIcon = side === 'left' ? ChevronRight : ChevronLeft

  return (
    <aside className="hidden min-h-0 flex-col items-center rounded-lg border border-border bg-card px-2 py-3 xl:flex">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9 rounded-md border border-border text-primary hover:bg-muted"
        onClick={onExpand}
        title={expandLabel}
        aria-label={expandLabel}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </Button>

      <div className="mt-3 text-center text-xs font-medium leading-4 text-muted-foreground">
        {title}
      </div>

      <div className="mt-3 flex w-full flex-col gap-2">
        {badgeItems.map((item) => (
          <div
            key={item.label}
            className="border-t border-border px-1 py-2 text-center"
          >
            <div className="text-xs font-semibold leading-none tabular-nums text-foreground">
              {item.value}
            </div>
            <div className="mt-1 text-xs font-medium leading-4 text-muted-foreground">
              {item.label}
            </div>
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="mt-auto h-8 w-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={onExpand}
        title={expandLabel}
        aria-label={expandLabel}
      >
        <ExpandIcon className="h-4 w-4" aria-hidden="true" />
      </Button>
    </aside>
  )
}

function RunRecordCard({
  active,
  conversation,
  run,
  onClick,
}: Readonly<{
  active: boolean
  conversation: Conversation | null
  run: RagasRun
  onClick: () => void
}>) {
  const rawSamples = run.summary?.items ?? run.params?.max_turns
  const samples =
    typeof rawSamples === 'number' || typeof rawSamples === 'string'
      ? rawSamples
      : '-'
  const metrics = run.metrics?.length || '-'
  const progress =
    run.status === 'running' || run.status === 'pending' ? 60 : null
  const missingEvidence = isMissingEvidenceError(run.error_message)

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-md border bg-card p-3 text-left transition-colors focus-ring',
        active
          ? 'border-primary/40 bg-primary/5'
          : 'border-border hover:border-primary/30 hover:bg-muted/30'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 text-[13px] font-semibold text-foreground">
          <div className="truncate">
            {shortConversationTitle(conversation, run.conversation_id)}
          </div>
        </div>
        <span className="shrink-0 whitespace-nowrap">
          <StatusBadge
            status={runStatusTone(run.status)}
            label={missingEvidence ? '缺证据' : runStatusLabel(run.status)}
            dense
          />
        </span>
      </div>
      <div className="mt-2 space-y-1 text-xs leading-4 text-muted-foreground">
        <div>运行时间：{formatDateTime(run.created_at)}</div>
        <div className="flex items-center gap-4">
          <span className="font-medium">轮次：{samples}</span>
          <span className="font-medium">指标：{metrics}</span>
        </div>
      </div>
      {progress === null ? null : (
        <div className="mt-2.5 flex items-center gap-2">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-info/10">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs font-semibold tabular-nums text-primary">
            {progress}%
          </span>
        </div>
      )}
      {run.status === 'failed' && run.error_message ? (
        <div className="mt-2 line-clamp-2 rounded-md bg-destructive/5 px-2 py-1 text-xs font-medium text-destructive">
          {missingEvidence
            ? '缺少引用证据，无法计算忠实度。'
            : `错误：${run.error_message}`}
        </div>
      ) : (
        <div className="mt-2 text-right text-xs font-medium text-muted-foreground">
          耗时：{formatRunDuration(run)}
        </div>
      )}
    </button>
  )
}

function ScoreDetailsCard({
  rows,
}: Readonly<{
  rows: ReturnType<typeof scoreRowsFor>
}>) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2.5 border-b border-border bg-muted/30 px-4 py-3">
        <div className="text-sm font-semibold text-foreground">评分明细</div>
        <Info className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </div>
      {rows.length ? (
        <div className="overflow-auto">
          <table className="w-full min-w-[620px] text-left text-[13px]">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-bold">指标</th>
                <th className="px-4 py-2.5 font-bold">平均分</th>
                <th className="px-4 py-2.5 font-bold">P50</th>
                <th className="px-4 py-2.5 font-bold">P90</th>
                <th className="px-4 py-2.5 font-bold">通过率（≥0.8）</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.key} className="transition-colors hover:bg-muted/30">
                  <td className="px-4 py-2.5 font-bold text-foreground">
                    {row.label}
                  </td>
                  <td className="px-4 py-2.5 font-semibold tabular-nums text-foreground">
                    {row.mean === null ? '-' : row.mean.toFixed(3)}
                  </td>
                  <td className="px-4 py-2.5 font-semibold tabular-nums text-foreground">
                    {row.p50 === null ? '-' : row.p50.toFixed(3)}
                  </td>
                  <td className="px-4 py-2.5 font-semibold tabular-nums text-foreground">
                    {row.p90 === null ? '-' : row.p90.toFixed(3)}
                  </td>
                  <td className="px-4 py-2.5 font-semibold tabular-nums text-foreground">
                    {formatPercentValue(row.passRate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-4 py-3">
          <EvaluationHeroEmptyState
            density="compact"
            title="暂无评分数据"
            description="运行完成后将在此处展示各指标的汇总得分与统计。"
          />
        </div>
      )}
    </section>
  )
}

function IterationDetailsCard({
  items,
  metricKeys,
  onlyFailures,
  onOnlyFailuresChange,
  onExport,
}: Readonly<{
  items: RagasRunDetail['items']
  metricKeys: string[]
  onlyFailures: boolean
  onOnlyFailuresChange: (checked: boolean) => void
  onExport: () => void
}>) {
  const visibleItems = onlyFailures
    ? items.filter((item) => itemHasLowScore(item, metricKeys))
    : items

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="text-[13px] font-semibold text-foreground">
            逐轮明细
          </div>
          <Info className="h-3.5 w-3.5 text-muted-foreground/70" aria-hidden="true" />
        </div>
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            仅看异常
            <Checkbox
              checked={onlyFailures}
              onCheckedChange={(value) => onOnlyFailuresChange(value === true)}
            />
          </label>
          <Button
            variant="outline"
            className="h-8 rounded-md border-border bg-card px-2.5 text-xs"
            disabled={!items.length}
            onClick={onExport}
          >
            导出
          </Button>
        </div>
      </div>
      {visibleItems.length ? (
        <div className="max-h-[276px] overflow-auto">
          <table
            aria-label="逐轮评分明细"
            className="w-full min-w-[760px] text-left text-xs"
          >
            <thead className="sticky top-0 z-10 bg-muted/50 text-muted-foreground">
              <tr>
                <th className="w-16 px-3 py-1.5 font-medium">轮次</th>
                <th className="min-w-[160px] px-3 py-1.5 font-medium">问题</th>
                <th className="min-w-[180px] px-3 py-1.5 font-medium">
                  答案摘要
                </th>
                {metricKeys.map((metricKey) => (
                  <th key={metricKey} className="w-28 px-3 py-1.5 font-medium">
                    {metricLabel(metricKey)}
                  </th>
                ))}
                <th className="w-20 px-3 py-1.5 font-medium">状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {visibleItems.map((item) => {
                const anomaly = itemHasLowScore(item, metricKeys)
                return (
                  <tr key={item.id} className="align-top hover:bg-muted/40">
                    <td className="px-3 py-1.5 tabular-nums text-muted-foreground">
                      {item.turn_index}
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="line-clamp-2 text-foreground">
                        {item.user_input}
                      </div>
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="line-clamp-2 text-muted-foreground">
                        {item.response}
                      </div>
                    </td>
                    {metricKeys.map((metricKey) => {
                      const value = item.scores?.[metricKey]
                      const isNum =
                        typeof value === 'number' && Number.isFinite(value)
                      return (
                        <td
                          key={metricKey}
                          className="px-3 py-1.5 tabular-nums text-foreground/85"
                        >
                          {isNum ? value.toFixed(3) : '-'}
                        </td>
                      )
                    })}
                    <td className="px-3 py-1.5">
                      <span
                        className={cn(
                          'rounded-md px-2 py-0.5 text-xs font-medium',
                          anomaly
                            ? 'bg-destructive/10 text-destructive'
                            : 'bg-success/10 text-success'
                        )}
                      >
                        {anomaly ? '异常' : '正常'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-3 py-2.5">
          <EvaluationHeroEmptyState
            density="compact"
            title="暂无轮次数据"
            description="运行完成后将按轮展示详细评分。"
          />
        </div>
      )}
    </section>
  )
}

export default function EvaluationsPage() {
  return (
    <NavigationVisibilityGate moduleKey="ragas" pageName="RAGAS 评测">
      <AppFrame>
        <Suspense fallback={<EvaluationsLoading />}>
          <EvaluationsPageContent />
        </Suspense>
      </AppFrame>
    </NavigationVisibilityGate>
  )
}

function EvaluationsLoading() {
  return (
    <PageLoading
      message="正在加载评测数据..."
      srMessage="Loading evaluations"
    />
  )
}

function EvaluationsPageContent() {
  const searchParams = useSearchParams()
  const tenantAccess = useTenantAccess()
  const deepLinkedConversationId =
    searchParams.get('conversation_id')?.trim() || ''
  const [activeTab, setActiveTab] = useState<TabType>(
    () => parseEvaluationTab(searchParams.get('tab')) || 'conversation'
  )
  const isActiveTab = (tab: TabType) => activeTab === tab
  const [selectedConversationId, setSelectedConversationId] =
    useState<string>(() => deepLinkedConversationId)

  const [selectedRunId, setSelectedRunId] = useState<string>('')

  const [metricKeys, setMetricKeys] = useState<string[]>([
    'faithfulness',
    'response_relevancy',
  ])
  const [maxTurns, setMaxTurns] = useState(20)
  const [skipEmptyContexts, setSkipEmptyContexts] = useState(true)
  const [onlyFailureItems, setOnlyFailureItems] = useState(false)
  const [isRunRecordsCollapsed, setIsRunRecordsCollapsed] = useState(false)
  const [setupRailCollapsed, setSetupRailCollapsed] = useState(false)
  const [runsRailCollapsed, setRunsRailCollapsed] = useState(false)
  const [conversationWorkspaceView, setConversationWorkspaceView] =
    useState<ConversationWorkspaceView>('results')
  const [conversationEvidenceFilter, setConversationEvidenceFilter] =
    useState<ConversationEvidenceFilter>('ready')

  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const scopedConversationId = selectedConversationId || deepLinkedConversationId
  const runListParams = useMemo(
    () => ({
      limit: 50,
      ...(scopedConversationId
        ? { conversation_id: scopedConversationId }
        : {}),
    }),
    [scopedConversationId]
  )

  const conversationsQuery = useQuery({
    queryKey: queryKeys.chat.conversations({ limit: 100 }),
    queryFn: () => chatApi.listConversations({ limit: 100 }),
  })
  const conversations = conversationsQuery.data?.items ?? EMPTY_CONVERSATIONS
  const messagesQuery = useQuery({
    queryKey: queryKeys.chat.messages(scopedConversationId),
    enabled: Boolean(scopedConversationId),
    queryFn: () => chatApi.getMessages(scopedConversationId, { limit: 200 }),
  })
  const readinessConversationIds = useMemo(
    () => conversations.map((conversation) => conversation.id),
    [conversations]
  )
  const conversationReadinessQuery = useQuery({
    queryKey: queryKeys.evaluations.ragasConversationReadiness(
      readinessConversationIds
    ),
    enabled:
      activeTab === 'conversation' && readinessConversationIds.length > 0,
    queryFn: () =>
      evaluationApi.getRagasConversationReadiness({
        conversation_ids: readinessConversationIds,
      }),
    staleTime: 60_000,
  })
  const runsQuery = useQuery({
    queryKey: queryKeys.evaluations.ragasRuns(runListParams),
    queryFn: () => evaluationApi.listRagasRuns(runListParams),
  })
  const runDetailQuery = useQuery({
    queryKey: queryKeys.evaluations.ragasRunDetail(selectedRunId, {
      include_items: true,
      include_contexts: false,
    }),
    enabled: Boolean(selectedRunId),
    queryFn: () =>
      evaluationApi.getRagasRun(selectedRunId, {
        include_items: true,
        include_contexts: false,
      }),
    refetchInterval: (query) => {
      const detail = query.state.data as RagasRunDetail | undefined
      const status = detail?.run?.status
      return status === 'pending' || status === 'running' ? 2000 : false
    },
  })
  const runs = runsQuery.data?.items ?? EMPTY_RUNS
  const runDetail = runDetailQuery.data || null
  const isLoading = conversationsQuery.isLoading || runsQuery.isLoading || isRefreshing
  const evidenceSummary = useMemo(
    () => summarizeConversationEvidence(messagesQuery.data?.messages || []),
    [messagesQuery.data?.messages]
  )
  const conversationEvidenceById = useMemo(() => {
    const items = conversationReadinessQuery.data?.items || []
    return new Map(
      items.map((item) => [
        item.conversation_id,
        {
          assistantTurns: item.assistant_turns,
          evaluableTurns: item.evaluable_turns,
          citationsCount: item.citations_count,
          isEvaluable: item.is_evaluable,
          isChecking: false,
          isKnown: true,
        },
      ])
    )
  }, [conversationReadinessQuery.data?.items])
  const conversationEvidenceCounts = useMemo(() => {
    let ready = 0
    let missing = 0
    let checking = 0

    for (const conversation of conversations) {
      const evidence = conversationEvidenceById.get(conversation.id)
      if (!evidence?.isKnown || conversationReadinessQuery.isLoading) {
        checking += 1
      } else if (evidence.isEvaluable) {
        ready += 1
      } else {
        missing += 1
      }
    }

    return { ready, missing, checking, all: conversations.length }
  }, [conversationEvidenceById, conversationReadinessQuery.isLoading, conversations])
  const filteredConversations = useMemo(() => {
    if (conversationEvidenceFilter === 'all') return conversations
    return conversations.filter((conversation) => {
      const evidence = conversationEvidenceById.get(conversation.id)
      if (!evidence?.isKnown) return false
      return conversationEvidenceFilter === 'ready'
        ? evidence.isEvaluable
        : !evidence.isEvaluable
    })
  }, [conversationEvidenceById, conversationEvidenceFilter, conversations])
  const isEvidenceChecking =
    Boolean(scopedConversationId) &&
    (messagesQuery.isLoading || messagesQuery.isFetching)
  const isMissingEvidence =
    Boolean(scopedConversationId) &&
    !isEvidenceChecking &&
    messagesQuery.isSuccess &&
    !evidenceSummary.isEvaluable

  // Support deep-linking: /evaluations?conversation_id=...
  useEffect(() => {
    if (deepLinkedConversationId) setSelectedConversationId(deepLinkedConversationId)
  }, [deepLinkedConversationId])

  // Support deep-linking: /evaluations?tab=regression|conversation
  useEffect(() => {
    const tab = parseEvaluationTab(searchParams.get('tab'))
    if (tab) setActiveTab(tab)
  }, [searchParams])

  useEffect(() => {
    if (deepLinkedConversationId) return
    setSelectedConversationId((prev) => {
      if (
        prev &&
        filteredConversations.some((conversation) => conversation.id === prev)
      )
        return prev
      return filteredConversations[0]?.id || ''
    })
  }, [deepLinkedConversationId, filteredConversations])

  // Keep the detail panel scoped to the selected conversation, including deep links from history.
  useEffect(() => {
    if (!scopedConversationId) return

    if (!runs.length) {
      setSelectedRunId('')
      return
    }

    setSelectedRunId((prev) => {
      if (prev && runs.some((run) => run.id === prev)) return prev
      return runs[0]?.id || ''
    })
  }, [runs, scopedConversationId])

  const handleStart = async () => {
    if (!scopedConversationId) return
    setIsStarting(true)
    try {
      const run = await evaluationApi.createRagasRun({
        conversation_id: scopedConversationId,
        metrics: metricKeys,
        max_turns: maxTurns,
        skip_empty_contexts: skipEmptyContexts,
        include_contexts_in_response: false,
      })
      await runsQuery.refetch()
      setSelectedRunId(run.id)
      setConversationWorkspaceView('results')
    } catch (e) {
      reportClientError('Failed to start evaluation', e)
      toast.error(formatApiError(e, '启动评测失败'))
    } finally {
      setIsStarting(false)
    }
  }

  const summary = useMemo<JsonObject>(
    () => runDetail?.run?.summary || {},
    [runDetail?.run?.summary]
  )
  const displayMetrics = useMemo(() => {
    return displayMetricsFor(summary, runDetail?.run?.metrics || [])
  }, [runDetail?.run?.metrics, summary])

  const activeTabMeta =
    TAB_META.find((item) => item.id === activeTab) || TAB_META[0]
  const showAblationsEntry =
    !tenantAccess.isLoading &&
    canShowAdminControlledNavigationModule(tenantAccess.data, 'ablations')
  const selectedConversation =
    conversations.find(
      (conversation) => conversation.id === scopedConversationId
    ) || null
  const selectedConversationHiddenByFilter = Boolean(
    scopedConversationId &&
      !filteredConversations.some(
        (conversation) => conversation.id === scopedConversationId
      )
  )
  const runStatusCounts = useMemo(() => {
    return runs.reduce(
      (acc, run) => {
        if (run.status === 'completed') acc.completed += 1
        else if (run.status === 'failed') acc.failed += 1
        else acc.running += 1
        return acc
      },
      { completed: 0, failed: 0, running: 0 }
    )
  }, [runs])
  const selectedRun =
    runDetail?.run || runs.find((run) => run.id === selectedRunId) || null
  const runErrorMessage = String(
    runDetail?.run?.error_message || selectedRun?.error_message || ''
  ).trim()
  const isMissingEvidenceFailure = isMissingEvidenceError(runErrorMessage)

  const runStatus = runDetail?.run?.status || selectedRun?.status
  const statusBadge = useMemo(() => {
    if (!runStatus) return null

    const status =
      runStatus === 'completed'
        ? 'completed'
        : runStatus === 'failed'
          ? 'failed'
          : 'processing'
    const label =
      runStatus === 'completed'
        ? '已完成'
        : runStatus === 'failed'
          ? '失败'
          : '运行中'
    const badge = <StatusBadge status={status} label={label} dense />

    if (runStatus === 'failed' && runErrorMessage) {
      return (
        <span
          className="inline-flex cursor-help"
          title={runErrorMessage}
          aria-label="失败原因，悬停查看"
        >
          {badge}
        </span>
      )
    }

    return badge
  }, [runErrorMessage, runStatus])
  const emptyRunState = useMemo(() => {
    if (!selectedRunId) {
      return {
        title: '暂无评测结果',
        description: '请先在左侧选择对话、指标与参数，然后点击「开始评测」运行。',
      }
    }
    if (runStatus === 'failed') {
      return {
        title: isMissingEvidenceFailure
          ? '缺少证据，无法计算忠实度'
          : '评测失败，暂无分数',
        description:
          (isMissingEvidenceFailure
            ? '这条会话没有可用于评测的引用证据。请先在知识库对话中完成一次带引用的问答，再重新评测。'
            : runErrorMessage) ||
          '该任务没有生成评分结果，请检查会话是否包含引用证据后重试。',
      }
    }
    if (runStatus === 'pending' || runStatus === 'running') {
      return {
        title: '评测运行中',
        description: '正在计算评分，完成后会自动刷新运行详情。',
      }
    }
    return {
      title: '暂无评分数据',
      description: '当前任务尚未生成汇总分数或逐轮明细。',
    }
  }, [isMissingEvidenceFailure, runErrorMessage, runStatus, selectedRunId])
  const scoreRows = useMemo(
    () => scoreRowsFor(runDetail, summary),
    [runDetail, summary]
  )
  const detailMetricKeys = runDetail?.run?.metrics?.length
    ? runDetail.run.metrics
    : metricKeys
  const detailItems = runDetail?.items || []
  const hasScoreBreakdown = scoreRows.length > 0
  const hasItemBreakdown = detailItems.length > 0
  const showBreakdownPanels = hasScoreBreakdown || hasItemBreakdown
  const visibleRuns = runs
  const selectedRunConversation = selectedRun?.conversation_id
    ? conversations.find(
        (conversation) => conversation.id === selectedRun.conversation_id
      ) || null
    : selectedConversation
  const selectedRunTitle = shortConversationTitle(
    selectedRunConversation,
    selectedRun?.conversation_id || scopedConversationId
  )
  const conversationDesktopGridClass =
    setupRailCollapsed && runsRailCollapsed
      ? 'xl:grid-cols-[56px_minmax(0,1fr)_56px]'
      : setupRailCollapsed
        ? 'xl:grid-cols-[56px_minmax(0,1fr)_280px]'
        : runsRailCollapsed
          ? 'xl:grid-cols-[280px_minmax(0,1fr)_56px]'
          : 'xl:grid-cols-[280px_minmax(0,1fr)_280px]'

  const handleConversationChange = (conversationId: string) => {
    setSelectedConversationId(conversationId)
    setSelectedRunId('')
  }

  const refreshEvaluationWorkspace = async () => {
    setIsRefreshing(true)
    try {
      await Promise.all([conversationsQuery.refetch(), runsQuery.refetch()])
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleExportItems = () => {
    const blob = new Blob([JSON.stringify(runDetail?.items || [], null, 2)], {
      type: 'application/json;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `ragas-run-items.${selectedRunId || 'latest'}.json`
    anchor.click()
    globalThis.window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const heroFocusLabel =
    activeTab === 'conversation' ? '缺证据' : '失败'
  const heroFocusValue =
    activeTab === 'conversation'
      ? conversationEvidenceCounts.missing
      : runStatusCounts.failed

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden bg-background">
      <AnalysisPageShell
        title="评测中心"
        description="把实时会话评测、回归测试与检索集健康度放到同一个工作台里，减少来回切页。"
        icon={BarChart3}
        iconColor="text-info"
        badge="评测"
        size="full"
        showHeader={false}
        top={
          <EvaluationHeroCard
            title={activeTabMeta.title}
            description={activeTabMeta.description}
            conversationsCount={conversations.length}
            runsCount={runs.length}
            focusLabel={heroFocusLabel}
            focusValue={heroFocusValue}
            onRefresh={refreshEvaluationWorkspace}
            isLoading={isLoading}
            showAblationsEntry={showAblationsEntry}
          />
        }
        topClassName="pt-4"
        bodyGutter="none"
        bodyClassName="!pt-0 !pb-0"
        bodyContainerClassName="max-w-none"
      >
        <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4 sm:px-6">
          <nav
            aria-label="评测类型"
            className="flex min-w-0 items-center gap-1 overflow-x-auto border-b border-border pb-2"
          >
            {TAB_META.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                aria-current={isActiveTab(tab.id) ? 'page' : undefined}
                className={cn(
                  'inline-flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-xs font-medium transition-colors focus-ring',
                  isActiveTab(tab.id)
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <tab.icon className="h-4 w-4" aria-hidden="true" />
                {tab.label}
              </button>
            ))}
          </nav>

          {activeTab === 'conversation' ? (
            <div className={cn('grid min-h-0 gap-3 xl:min-h-[610px]', conversationDesktopGridClass)}>
              <div className="col-span-full grid grid-cols-3 gap-1 rounded-md border border-border bg-muted/30 p-1 xl:hidden">
                {([
                  { id: 'setup', label: '参数', icon: SlidersHorizontal },
                  { id: 'results', label: '结果', icon: BarChart3 },
                  { id: 'runs', label: '记录', icon: ListChecks },
                ] as const).map((view) => (
                  <button
                    key={view.id}
                    type="button"
                    onClick={() => setConversationWorkspaceView(view.id)}
                    aria-pressed={conversationWorkspaceView === view.id}
                    className={cn(
                      'inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-2 text-xs font-medium transition-colors focus-ring',
                      conversationWorkspaceView === view.id
                        ? 'bg-card text-primary'
                        : 'text-muted-foreground hover:bg-card/70 hover:text-foreground'
                    )}
                  >
                    <view.icon className="h-4 w-4" aria-hidden="true" />
                    {view.label}
                  </button>
                ))}
              </div>

              {setupRailCollapsed ? (
                <CollapsedWorkspaceRail
                  title="参数栏"
                  icon={SlidersHorizontal}
                  badgeItems={[
                    { label: '总数', value: conversations.length },
                    {
                      label: '证据',
                      value:
                        isEvidenceChecking
                          ? '...'
                          : evidenceSummary.isEvaluable
                            ? evidenceSummary.citationsCount
                            : 0,
                    },
                  ]}
                  onExpand={() => setSetupRailCollapsed(false)}
                  side="left"
                />
              ) : null}
              <aside
                className={cn(
                  'min-h-0 max-h-[calc(100dvh-220px)] flex-col overflow-hidden rounded-lg border border-border bg-card xl:max-h-[calc(100vh-246px)]',
                  conversationWorkspaceView === 'setup' ? 'flex' : 'hidden',
                  setupRailCollapsed ? 'xl:hidden' : 'xl:flex'
                )}
              >
                  <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-3">
                    <div className="inline-flex items-center gap-2.5 text-sm font-semibold text-foreground">
                      <SlidersHorizontal
                        className="h-4 w-4 text-primary"
                        aria-hidden="true"
                      />
                      参数设置
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 rounded-md px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                        onClick={() => {
                          setMetricKeys(['faithfulness', 'response_relevancy'])
                          setMaxTurns(20)
                          setSkipEmptyContexts(true)
                        }}
                      >
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                        重置
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="hidden h-8 w-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground xl:inline-flex"
                        onClick={() => setSetupRailCollapsed(true)}
                        aria-label="收起参数栏"
                        title="收起参数栏"
                      >
                        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
                    <EvaluationConfigSection
                      icon={Database}
                      title="对话来源"
                      description="从已有会话里选一条对话，评测会按用户-助手轮次重建上下文。"
                    >
                      <Select
                        value={scopedConversationId}
                        onValueChange={handleConversationChange}
                      >
                        <SelectTrigger className="h-10 rounded-md border-border bg-card text-[13px]">
                          <SelectValue placeholder="请选择会话或查询" />
                        </SelectTrigger>
                        <SelectContent>
                          {scopedConversationId &&
                          (!selectedConversation || selectedConversationHiddenByFilter) ? (
                            <SelectItem value={scopedConversationId}>
                              {shortConversationTitle(
                                selectedConversation,
                                scopedConversationId
                              )}{' '}
                              · 当前
                            </SelectItem>
                          ) : null}
                          {!filteredConversations.length ? (
                            <SelectItem value="__empty_conversation_filter__" disabled>
                              当前筛选暂无会话
                            </SelectItem>
                          ) : null}
                          {filteredConversations.map((conversation) => {
                            const evidence = conversationEvidenceById.get(
                              conversation.id
                            )
                            const evidenceLabel = !evidence?.isKnown
                              ? '检查中'
                              : evidence.isEvaluable
                                ? `${evidence.citationsCount} 条证据`
                                : '缺证据'
                            return (
                            <SelectItem
                              key={conversation.id}
                              value={conversation.id}
                            >
                              <span className="flex min-w-0 items-center justify-between gap-3">
                                <span className="truncate">
                                  {conversation.title || conversation.id}
                                </span>
                                <span
                                  className={cn(
                                    'shrink-0 rounded-md px-2 py-0.5 text-xs font-medium',
                                    !evidence?.isKnown
                                      ? 'bg-muted text-muted-foreground'
                                      : evidence.isEvaluable
                                        ? 'bg-success/15 text-success'
                                        : 'bg-warning/15 text-warning'
                                  )}
                                >
                                  {evidenceLabel}
                                </span>
                              </span>
                            </SelectItem>
                            )
                          })}
                        </SelectContent>
                      </Select>
                      <div className="mt-2.5 grid grid-cols-3 gap-1 rounded-md border border-border bg-muted/30 p-1">
                        {CONVERSATION_EVIDENCE_FILTERS.map((filter) => {
                          const count =
                            filter.id === 'ready'
                              ? conversationEvidenceCounts.ready
                              : filter.id === 'missing'
                                ? conversationEvidenceCounts.missing
                                : conversationEvidenceCounts.all
                          const active = conversationEvidenceFilter === filter.id
                          return (
                            <button
                              key={filter.id}
                              type="button"
                              onClick={() => setConversationEvidenceFilter(filter.id)}
                              className={cn(
                                'rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                                active
                                  ? 'bg-card text-primary'
                                  : 'text-muted-foreground hover:bg-card/70 hover:text-foreground'
                              )}
                            >
                              {filter.label}
                              <span className="ml-1.5 tabular-nums">
                                {count}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <EvaluationInlineStat
                          label="已选"
                          value={scopedConversationId ? '1' : '0'}
                        />
                        <EvaluationInlineStat
                          label="总数"
                          value={conversations.length}
                        />
                        <EvaluationInlineStat
                          label="证据"
                          value={
                            isEvidenceChecking
                              ? '检查中'
                              : evidenceSummary.isEvaluable
                                ? evidenceSummary.citationsCount
                                : '缺失'
                          }
                        />
                        <EvaluationInlineStat
                          label="可评轮次"
                          value={evidenceSummary.evaluableTurns}
                        />
                        {conversationEvidenceCounts.checking ? (
                          <EvaluationInlineStat
                            label="检查中"
                            value={conversationEvidenceCounts.checking}
                          />
                        ) : null}
                      </div>
                    </EvaluationConfigSection>

                    <EvaluationConfigSection
                      icon={Sparkles}
                      title="评测指标（至少选择 1 项）"
                      description="指标越多，耗时与 token 成本越高。默认保留最核心两项。"
                    >
                      <RagasMetricSelector
                        metricKeys={metricKeys}
                        onMetricKeysChange={setMetricKeys}
                        scope="conversation"
                        className="space-y-1.5"
                        itemClassName="rounded-md border border-border bg-card px-2 py-1"
                        labelClassName="text-xs"
                        hintClassName="text-xs leading-4"
                      />
                    </EvaluationConfigSection>

                    <EvaluationConfigSection
                      icon={Filter}
                      title="过滤条件"
                      description="控制抽取最近多少轮，以及是否过滤掉无引用上下文的轮次。"
                      className="border-b-0"
                    >
                      <div className="grid gap-3">
                        <div className="space-y-1.5">
                          <Label
                            htmlFor="max-turns"
                            className="text-xs font-medium text-muted-foreground"
                          >
                            最近轮次
                          </Label>
                          <Input
                            id="max-turns"
                            type="number"
                            min={1}
                            max={200}
                            value={maxTurns}
                            onChange={(e) => setMaxTurns(Number(e.target.value))}
                            className="h-9 rounded-md border-border bg-card text-xs"
                          />
                        </div>

                        <label className="flex items-start gap-2.5 rounded-md border border-border bg-card px-2.5 py-2">
                          <Checkbox
                            checked={skipEmptyContexts}
                            onCheckedChange={(value) =>
                              setSkipEmptyContexts(value === true)
                            }
                          />
                          <span className="space-y-0.5">
                            <span className="block text-xs font-medium text-foreground">
                              跳过无引用轮次
                            </span>
                            <span className="block text-xs leading-4 text-muted-foreground">
                              减少空样本干扰，让结果更接近真实 RAG 场景。
                            </span>
                          </span>
                        </label>
                      </div>
                    </EvaluationConfigSection>
                  </div>

                  <div className="shrink-0 border-t border-border bg-muted/30 p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <EvaluationInlineStat
                        label="指标数"
                        value={metricKeys.length}
                      />
                      <EvaluationInlineStat label="轮次" value={maxTurns} />
                      <EvaluationInlineStat
                        label="过滤"
                        value={skipEmptyContexts ? '已启用' : '关闭'}
                      />
                    </div>
                    <Button
                      className="h-10 w-full rounded-md bg-primary text-[13px] font-semibold text-primary-foreground hover:bg-primary/90"
                      disabled={
                        isStarting ||
                        !scopedConversationId ||
                        isMissingEvidence ||
                        !metricKeys.length
                      }
                      onClick={handleStart}
                    >
                      {isStarting ? (
                        <Loader2 className="mr-2 h-4.5 w-4.5 animate-spin motion-reduce:animate-none" />
                      ) : (
                        <PlayCircle className="mr-2 h-4.5 w-4.5" />
                      )}
                      {isMissingEvidence ? '缺证据，不能评测' : '开始评测'}
                    </Button>
                    <Button
                      variant="outline"
                      className="mt-2 h-9 w-full rounded-md border-border bg-card text-xs font-medium text-foreground hover:bg-muted"
                      onClick={() => refreshEvaluationWorkspace()}
                    >
                      <RefreshCw
                        className={cn(
                          'mr-2 h-3.5 w-3.5',
                          isLoading && 'animate-spin motion-reduce:animate-none'
                        )}
                      />
                      刷新会话与运行
                    </Button>
                  </div>
                </aside>

              <main
                className={cn(
                  'min-h-0 min-w-0 flex-col gap-3',
                  conversationWorkspaceView === 'results' ? 'flex' : 'hidden',
                  'xl:flex'
                )}
              >
                <EvaluationResultsStage
                  selectedRunTitle={selectedRunTitle}
                  statusBadge={statusBadge}
                  isChecking={isEvidenceChecking}
                  isEvaluable={evidenceSummary.isEvaluable}
                  assistantTurns={evidenceSummary.assistantTurns}
                  citationsCount={evidenceSummary.citationsCount}
                  evaluableTurns={evidenceSummary.evaluableTurns}
                  isMissingEvidenceFailure={isMissingEvidenceFailure}
                  summary={summary}
                  displayMetrics={displayMetrics}
                  emptyRunState={emptyRunState}
                  fillAvailableHeight={!showBreakdownPanels}
                />

                {showBreakdownPanels ? (
                  <div
                    className={cn(
                      'grid gap-3',
                      hasScoreBreakdown && hasItemBreakdown
                        ? 'xl:grid-cols-[0.85fr_1.25fr]'
                        : 'xl:grid-cols-1'
                    )}
                  >
                    {hasScoreBreakdown ? (
                      <ScoreDetailsCard rows={scoreRows} />
                    ) : null}
                    {hasItemBreakdown ? (
                      <IterationDetailsCard
                        items={detailItems}
                        metricKeys={detailMetricKeys}
                        onlyFailures={onlyFailureItems}
                        onOnlyFailuresChange={setOnlyFailureItems}
                        onExport={handleExportItems}
                      />
                    ) : null}
                  </div>
                ) : null}
              </main>

              {runsRailCollapsed ? (
                <CollapsedWorkspaceRail
                  title="运行记录"
                  icon={ListChecks}
                  badgeItems={[
                    { label: '运行', value: runs.length },
                    { label: '失败', value: runStatusCounts.failed },
                  ]}
                  onExpand={() => setRunsRailCollapsed(false)}
                  side="right"
                />
              ) : null}
              <aside
                className={cn(
                  'max-h-[calc(100dvh-220px)] min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card p-3 xl:max-h-[calc(100vh-246px)]',
                  conversationWorkspaceView === 'runs' ? 'flex' : 'hidden',
                  runsRailCollapsed ? 'xl:hidden' : 'xl:flex'
                )}
              >
                  <div className="mb-2.5 flex shrink-0 items-center justify-between gap-3">
                    <button
                      type="button"
                      className="inline-flex min-w-0 items-center gap-2.5 text-left text-sm font-semibold text-foreground focus-ring"
                      onClick={() => setIsRunRecordsCollapsed((value) => !value)}
                      aria-expanded={!isRunRecordsCollapsed}
                      aria-controls="ragas-run-records-list"
                    >
                      <ListChecks
                        className="h-5 w-5 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      <span className="truncate">运行记录</span>
                      <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        {runs.length}
                      </span>
                      <ChevronDown
                        className={cn(
                          'h-4 w-4 text-muted-foreground/70 transition-transform duration-200',
                          isRunRecordsCollapsed && '-rotate-90'
                        )}
                        aria-hidden="true"
                      />
                    </button>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        className="h-8 shrink-0 px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                        onClick={() => runsQuery.refetch()}
                      >
                        刷新
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="hidden h-8 w-8 shrink-0 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground xl:inline-flex"
                        onClick={() => setRunsRailCollapsed(true)}
                        aria-label="收起运行记录侧栏"
                        title="收起运行记录侧栏"
                      >
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>

                  <div
                    id="ragas-run-records-list"
                    className={cn(
                      'grid min-h-0 transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none',
                      isRunRecordsCollapsed
                        ? 'grid-rows-[0fr] opacity-0'
                        : 'grid-rows-[1fr] opacity-100'
                    )}
                  >
                    <div className="min-h-0 overflow-hidden">
                      {visibleRuns.length ? (
                        <div className="max-h-[560px] min-h-0 space-y-2 overflow-y-auto overscroll-contain pr-1 no-scrollbar">
                          {visibleRuns.map((run) => (
                            <RunRecordCard
                              key={run.id}
                              active={selectedRunId === run.id}
                              run={run}
                              conversation={
                                run.conversation_id
                                  ? conversations.find(
                                      (conversation) =>
                                        conversation.id === run.conversation_id
                                    ) || null
                                  : null
                              }
                              onClick={() => {
                                setSelectedRunId(run.id)
                                setConversationWorkspaceView('results')
                              }}
                            />
                          ))}
                        </div>
                      ) : (
                        <EvaluationHeroEmptyState
                          title="暂无评测记录"
                          description="运行一次评测后，这里会出现真实 run 记录。"
                        />
                      )}
                    </div>
                  </div>

                  {isRunRecordsCollapsed ? (
                    <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5 text-xs font-medium text-muted-foreground">
                      已收起 {runs.length}{' '}
                      条运行记录，点击标题展开后在列表内上滑查看。
                    </div>
                  ) : null}
                </aside>
            </div>
          ) : activeTab === 'regression' ? (
            <div className="flex h-[calc(100vh-255px)] min-h-[610px] flex-col overflow-hidden rounded-lg border border-border bg-card p-2.5">
              <RegressionTestTab embedded />
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-card p-3">
              <QuerysetHealthTab embedded />
            </div>
          )}
        </div>
      </AnalysisPageShell>
    </div>
  )
}
