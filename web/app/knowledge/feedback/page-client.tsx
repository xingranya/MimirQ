'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowUpRight,
  CalendarDays,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Copy,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  RefreshCw,
  Search,
  Star,
  TestTube2,
  ThumbsDown,
  ThumbsUp,
  UserRound,
} from 'lucide-react'
import { toast } from 'sonner'

import { AppFrame } from '@/components/app-frame'
import { PageScaffold } from '@/components/ui/page-scaffold'
import { PageTitleIcon } from '@/components/ui/page-title-icon'
import {
  KNOWLEDGE_OPS_HERO_PANEL_CLASS,
} from '@/components/ui/knowledge-ops-hero'
import { Button } from '@/components/ui/button'
import { SearchInput } from '@/components/ui/search-input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { usePathname, useRouter } from '@/i18n/navigation'
import { feedbackApi } from '@/lib/api'
import { cn, formatDate } from '@/lib/utils'
import type {
  FeedbackLoopCandidatesResponse,
  MessageFeedbackEnriched,
} from '@/types'
import { formatApiError } from '@/lib/api-errors'
import { Badge } from '@/components/ui/badge'

type RatingFilter = 'all' | '1' | '2' | '3' | '4' | '5'
type FeedbackType = 'thumbs_up' | 'thumbs_down'
type FeedbackTypeFilter = 'all' | FeedbackType
type FeedbackBoardTab = 'all' | 'pending' | 'high-priority' | 'archived'
type FeedbackSourceFilter =
  | 'all'
  | 'web'
  | 'mobile'
  | 'enterprise'
  | 'api'
  | 'benchmark'
  | 'other'
type FeedbackTimeRange = '7d' | '30d' | '90d' | 'all'
type FeedbackMetricKey = 'all' | FeedbackType | 'neutral'
type FeedbackKind = FeedbackType | 'neutral'
type FeedbackSummaryTone = 'indigo' | 'emerald' | 'rose' | 'blue'
type FeedbackStatusTone = 'positive' | 'negative' | 'neutral' | 'priority'
type FeedbackRating = 1 | 2 | 3 | 4 | 5
type FeedbackListParams = {
  min_rating?: number
  max_rating?: number
}
type FeedbackStats = Record<FeedbackRating, number> & {
  total: number
  upvotes: number
  downvotes: number
  neutral: number
}
type FeedbackDelta = {
  label: string
  tone: 'positive' | 'negative' | 'neutral'
  title: string
}
type ActiveFeedbackFilterBadge = {
  key: string
  label: string
}

const FEEDBACK_PAGE_SIZE = 3
const FEEDBACK_RATINGS: readonly FeedbackRating[] = [1, 2, 3, 4, 5]
const FEEDBACK_RATING_SET = new Set<number>(FEEDBACK_RATINGS)

function isFeedbackRating(value: number): value is FeedbackRating {
  return FEEDBACK_RATING_SET.has(value)
}

const FEEDBACK_RANGE_DAYS: Record<Exclude<FeedbackTimeRange, 'all'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
}

const SUMMARY_ICON_CLASSES: Record<FeedbackSummaryTone, string> = {
  blue: 'border-info/12 bg-info/10 text-info',
  emerald: 'border-success/20 bg-success text-success-foreground',
  indigo: 'border-indigo/12 bg-indigo/10 text-indigo',
  rose: 'border-destructive/20 bg-destructive text-destructive-foreground',
}

const SUMMARY_VALUE_CLASSES: Record<FeedbackSummaryTone, string> = {
  blue: 'text-info',
  emerald: 'text-success',
  indigo: 'text-indigo',
  rose: 'text-rose',
}

const DELTA_TONE_CLASSES: Record<FeedbackDelta['tone'], string> = {
  negative: 'text-rose',
  neutral: 'text-muted-foreground',
  positive: 'text-success',
}

const FEEDBACK_KIND_LABELS: Record<FeedbackKind, string> = {
  neutral: '中立',
  thumbs_down: '点踩',
  thumbs_up: '点赞',
}

const FEEDBACK_KIND_BADGE_CLASSES: Record<FeedbackKind, string> = {
  neutral: 'border-info/15 bg-info/10 text-info',
  thumbs_down: 'border-rose/15 bg-rose/10 text-rose',
  thumbs_up: 'border-success/15 bg-success/10 text-success',
}

const SOURCE_BADGE_LABELS: Record<Exclude<FeedbackSourceFilter, 'all'>, string> = {
  api: '引用不足',
  benchmark: '评测样本',
  enterprise: '引用不足',
  mobile: '解析问题',
  other: '引用不足',
  web: '未命中知识库',
}

const RESOLUTION_LABELS: Record<FeedbackKind, string> = {
  neutral: '待确认',
  thumbs_down: '高优先级',
  thumbs_up: '有帮助',
}

const TIME_RANGE_SHORT_LABELS: Record<FeedbackTimeRange, string> = {
  '7d': '7 天',
  '30d': '30 天',
  '90d': '90 天',
  all: '全部时间',
}

const TIME_RANGE_BADGE_LABELS: Record<Exclude<FeedbackTimeRange, 'all'>, string> = {
  '7d': '最近 7 天',
  '30d': '最近 30 天',
  '90d': '最近 90 天',
}

const TOP_REASON_BAR_CLASSES = ['bg-rose', 'bg-rose/60', 'bg-rose/35'] as const

function classifyFeedback(rating: number): FeedbackType | 'neutral' {
  const v = Number(rating) || 0
  if (v >= 4) return 'thumbs_up'
  if (v > 0 && v <= 2) return 'thumbs_down'
  return 'neutral'
}

function feedbackDisplayString(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value).trim()
  }
  return ''
}

function firstFeedbackDisplayString(...values: unknown[]): string {
  for (const value of values) {
    const direct = feedbackDisplayString(value)
    if (direct) return direct

    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>
      const nested = firstFeedbackDisplayString(record.value, record.label, record.name, record.id)
      if (nested) return nested
    }
  }
  return ''
}

function feedbackDeltaTone(value: number): FeedbackDelta['tone'] {
  if (value > 0) return 'positive'
  if (value < 0) return 'negative'
  return 'neutral'
}

function feedbackKindIcon(kind: FeedbackKind) {
  if (kind === 'thumbs_up') return <ThumbsUp className="size-3.5" />
  if (kind === 'thumbs_down') return <ThumbsDown className="size-3.5" />
  return <Star className="size-3.5" />
}

function feedbackStatusTone(
  badge: string,
  issue: string,
  kind: FeedbackKind
): FeedbackStatusTone {
  if (badge === '高优先级') return 'priority'
  if (badge === '有帮助') return 'positive'
  if (badge === issue && kind === 'thumbs_down') return 'negative'
  return 'neutral'
}

function feedbackSourceBadgeLabel(source: FeedbackSourceFilter): string {
  if (source === 'all') return '引用不足'
  return SOURCE_BADGE_LABELS[source]
}

function topReasonBarClass(index: number): string {
  return TOP_REASON_BAR_CLASSES[index] ?? 'bg-rose/35'
}

function buildActiveFeedbackFilterBadges(
  filterType: FeedbackTypeFilter,
  ratingFilter: RatingFilter,
  sourceFilter: FeedbackSourceFilter,
  timeRange: FeedbackTimeRange,
  searchTerm: string
): ActiveFeedbackFilterBadge[] {
  const badges: ActiveFeedbackFilterBadge[] = []
  if (filterType !== 'all') {
    badges.push({ key: 'type', label: `类型: ${FEEDBACK_KIND_LABELS[filterType]}` })
  }
  if (ratingFilter !== 'all') {
    badges.push({ key: 'rating', label: `${ratingFilter} 星` })
  }
  if (sourceFilter !== 'all') {
    badges.push({ key: 'source', label: getFeedbackSourceLabel(sourceFilter) })
  }
  if (timeRange !== 'all') {
    badges.push({ key: 'time', label: TIME_RANGE_BADGE_LABELS[timeRange] })
  }
  const query = searchTerm.trim()
  if (query) badges.push({ key: 'search', label: query })
  return badges
}

function demoMessageContentForRating(rating: number): string {
  if (rating <= 2) {
    return '当前回答主要覆盖了概念说明，但缺少配置步骤、示例和知识库命中依据，因此用户仍然无法直接完成设置。'
  }
  if (rating === 3) {
    return '回答提供了方向性解释，但对具体限制、适用条件和边界情况说明不足，用户需要进一步确认。'
  }
  return '回答结构清晰，给出了对比关系、适用场景和操作建议，整体可读性较好。'
}

function getFeedbackSource(
  item: MessageFeedbackEnriched
): FeedbackSourceFilter {
  const raw =
    `${feedbackDisplayString(item.account_id)} ${firstFeedbackDisplayString(item.extra?.source, item.extra?.benchmark_source)} ${(item.tags || []).join(' ')}`.toLowerCase()
  if (raw.includes('benchmark') || raw.includes('评测')) return 'benchmark'
  if (
    raw.includes('mobile') ||
    raw.includes('ios') ||
    raw.includes('android') ||
    raw.includes('app')
  )
    return 'mobile'
  if (raw.includes('api')) return 'api'
  if (raw.includes('wx') || raw.includes('wecom') || raw.includes('enterprise'))
    return 'enterprise'
  if (raw.includes('web') || raw.includes('console') || raw.includes('browser'))
    return 'web'
  return 'other'
}

function getFeedbackSourceLabel(source: FeedbackSourceFilter): string {
  switch (source) {
    case 'web':
      return 'Web 控制台'
    case 'mobile':
      return '移动端'
    case 'enterprise':
      return '企业微信'
    case 'api':
      return 'API 接口'
    case 'benchmark':
      return '评测样本'
    case 'other':
      return '其他'
    case 'all':
    default:
      return '全部来源'
  }
}

function getFeedbackIssueLabel(item: MessageFeedbackEnriched): string {
  const categoryLabels = {
    retrieval_miss: '未命中知识库',
    wrong_answer: '回答错误',
    out_of_scope: '超出知识范围',
    other: '其他问题',
  } as const
  if (item.category) return categoryLabels[item.category]
  const explicitIssue = firstFeedbackDisplayString(
    item.extra?.feedback_issue,
    item.extra?.quality_label
  )
  if (explicitIssue) return explicitIssue
  const text =
    `${item.reason || ''} ${(item.tags || []).join(' ')} ${item.message_content || ''}`.toLowerCase()
  if (
    text.includes('知识库') ||
    text.includes('未命中') ||
    text.includes('找不到')
  )
    return '未命中知识库'
  if (text.includes('引用') || text.includes('来源')) return '引用不足'
  if (
    text.includes('答非所问') ||
    text.includes('偏题') ||
    text.includes('错误')
  )
    return '表达模糊'
  if (
    text.includes('完整') ||
    text.includes('过于简略') ||
    text.includes('配置示例')
  )
    return '答案不完整'
  return item.tags?.[0] || '答案不完整'
}

function isHighPriority(item: MessageFeedbackEnriched): boolean {
  const rating = Number(item.rating) || 0
  return rating > 0 && rating <= 2
}

function isWithinRange(
  value: string | undefined,
  range: FeedbackTimeRange
): boolean {
  if (range === 'all') return true
  const ts = new Date(String(value || '')).getTime()
  if (!Number.isFinite(ts)) return false
  const now = Date.now()
  const days = FEEDBACK_RANGE_DAYS[range]
  return now - ts <= days * 24 * 60 * 60 * 1000
}

function utcDayKey(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(String(value || ''))
  if (!Number.isFinite(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function utcShortLabel(isoDayKey: string): string {
  const [year, month, day] = String(isoDayKey || '').split('-')
  if (!year || !month || !day) return ''
  return `${month}-${day}`
}

function getSummaryNumber(
  summary: Record<string, unknown> | undefined,
  key: string
): number {
  const value = summary?.[key]
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

function buildLoopCandidateMetrics(
  data: FeedbackLoopCandidatesResponse | undefined,
  demoMode: boolean
) {
  if (demoMode) {
    return {
      total: 128,
      negative: 23,
      hardNeg: 14,
      triples: 11,
      ruleCandidates: 8,
      conversionRate: 60.9,
      tokens: ['MCU', '485', '授权'],
    }
  }
  const summary = (data?.summary || {}) as Record<string, unknown>
  const total = getSummaryNumber(summary, 'feedback_total')
  const negative = getSummaryNumber(summary, 'negative_feedback_total')
  const hardNeg = getSummaryNumber(summary, 'hard_negative_records')
  const triples = getSummaryNumber(summary, 'training_triples')
  const glossary = getSummaryNumber(summary, 'rules_glossary_candidates')
  const patterns = getSummaryNumber(summary, 'rules_pattern_candidates')
  const intents = getSummaryNumber(summary, 'rules_intent_candidates')
  const suggestions = (data?.rules_suggestions || {}) as Record<string, unknown>
  const glossaryItems = Array.isArray(suggestions.glossary_suggestions)
    ? suggestions.glossary_suggestions
    : []
  const tokens = glossaryItems
    .map((item) =>
      typeof item === 'object' && item !== null
        ? firstFeedbackDisplayString((item as Record<string, unknown>).token)
        : ''
    )
    .filter(Boolean)
    .slice(0, 3)
  return {
    total,
    negative,
    hardNeg,
    triples,
    ruleCandidates: glossary + patterns + intents,
    conversionRate:
      negative > 0 ? Number(((hardNeg / negative) * 100).toFixed(1)) : 0,
    tokens,
  }
}

function isArchivedFeedback(item: MessageFeedbackEnriched): boolean {
  return Boolean(item.extra?.archived)
}

function isFeedbackMetricMatch(
  item: MessageFeedbackEnriched,
  metric: FeedbackMetricKey
): boolean {
  if (metric === 'all') return true
  return classifyFeedback(item.rating) === metric
}

function countFeedbackMetricForDay(
  items: MessageFeedbackEnriched[],
  dayKey: string,
  metric: FeedbackMetricKey
): number {
  return items.filter(
    (item) =>
      utcDayKey(item.created_at) === dayKey &&
      isFeedbackMetricMatch(item, metric)
  ).length
}

function buildFeedbackDelta(
  items: MessageFeedbackEnriched[],
  metric: FeedbackMetricKey,
  now = new Date()
): FeedbackDelta {
  const todayKey = utcDayKey(now)
  const yesterday = new Date(`${todayKey}T00:00:00.000Z`)
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  const yesterdayKey = utcDayKey(yesterday)
  const today = countFeedbackMetricForDay(items, todayKey, metric)
  const previous = countFeedbackMetricForDay(items, yesterdayKey, metric)

  if (previous <= 0) {
    return {
      label: today > 0 ? `昨日 0 / 今日 ${today}` : '暂无昨日基线',
      tone: today > 0 ? 'positive' : 'neutral',
      title: `今日 ${today}，昨日 ${previous}`,
    }
  }

  const change = ((today - previous) / previous) * 100
  return {
    label: `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`,
    tone: feedbackDeltaTone(change),
    title: `今日 ${today}，昨日 ${previous}`,
  }
}

function FeedbackSummaryCard({
  label,
  value,
  delta,
  icon: Icon,
  tone,
}: Readonly<{
  label: string
  value: number
  delta: FeedbackDelta
  icon: typeof ThumbsUp
  tone: FeedbackSummaryTone
}>) {
  const iconClassName = SUMMARY_ICON_CLASSES[tone]
  const valueClassName = SUMMARY_VALUE_CLASSES[tone]
  const deltaTone = DELTA_TONE_CLASSES[delta.tone]

  return (
    <div className="flex min-h-[76px] items-center gap-3 bg-card px-4 py-3">
      <div
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-md border',
          iconClassName
        )}
      >
        <Icon className="size-4" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className={cn('text-xl font-semibold leading-6 tabular-nums', valueClassName)}>
            {value}
          </span>
          <span className={cn('text-xs font-medium', deltaTone)} title={delta.title}>
            {delta.label}
          </span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">较昨日</div>
      </div>
    </div>
  )
}

function FeedbackDistributionPanel({
  title,
  items,
  colors,
  actionLabel,
  onAction,
}: Readonly<{
  title: string
  items: Array<{ label: string; value: number }>
  colors: string[]
  actionLabel?: string
  onAction?: () => void
}>) {
  const total = items.reduce((sum, item) => sum + item.value, 0)

  return (
    <section className="rounded-md border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {actionLabel && onAction ? (
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onAction}
          >
            {actionLabel}
            <ChevronRight className="size-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {items.length ? (
        <div className="mt-3 divide-y divide-border">
          {items.map((item, index) => {
            const percentage = total > 0 ? (item.value / total) * 100 : 0
            return (
              <div key={item.label} className="py-2.5">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="min-w-0 truncate text-muted-foreground">{item.label}</span>
                  <span className="shrink-0 font-medium text-foreground tabular-nums">
                    {item.value} · {percentage.toFixed(1)}%
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-sm bg-muted">
                  <div
                    className="h-full rounded-sm"
                    style={{ backgroundColor: colors[index], width: `${percentage}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="mt-3 border-t border-border py-8 text-center text-sm text-muted-foreground">
          暂无来源数据
        </div>
      )}
    </section>
  )
}

function FeedbackTrendCard({
  title,
  labels,
  series,
  actionLabel,
  onAction,
}: Readonly<{
  title: string
  labels: string[]
  series: Array<{ label: string; values: number[]; color: string }>
  actionLabel?: string
  onAction?: () => void
}>) {
  const allValues = series.flatMap((item) => item.values)
  const hasTrendData = allValues.some((value) => value > 0)
  const max = Math.max(1, ...allValues)
  const width = 320
  const height = 170

  return (
    <section className="rounded-md border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {actionLabel && onAction ? (
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onAction}
          >
            {actionLabel}
            <ChevronRight className="size-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {series.map((item) => (
          <span key={item.label} className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-sm" style={{ backgroundColor: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
      {hasTrendData ? (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="mt-3 h-[164px] w-full"
          aria-label="最近七天反馈趋势图"
          role="img"
        >
          {Array.from({ length: 5 }, (_, gridLineIndex) => gridLineIndex).map((gridLineIndex) => {
            const y = 18 + gridLineIndex * 34
            return (
              <line
                key={`feedback-trend-grid-line-${gridLineIndex}`}
                x1="0"
                y1={y}
                x2={width}
                y2={y}
                stroke="hsl(var(--border))"
              />
            )
          })}
          {series.map((item) => {
            const path = item.values
              .map((value, index) => {
                const x = (index / Math.max(1, item.values.length - 1)) * (width - 16) + 8
                const y = 146 - (value / max) * 110
                return `${index === 0 ? 'M' : 'L'} ${x} ${y}`
              })
              .join(' ')
            return (
              <path
                key={item.label}
                d={path}
                fill="none"
                stroke={item.color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )
          })}
          {labels.map((label, index) => {
            const x = (index / Math.max(1, labels.length - 1)) * (width - 16) + 8
            return (
              <text
                key={label}
                x={x}
                y={166}
                textAnchor="middle"
                fontSize="11"
                fill="hsl(var(--muted-foreground))"
              >
                {label}
              </text>
            )
          })}
        </svg>
      ) : (
        <div className="mt-3 border-t border-border py-8 text-center text-sm text-muted-foreground">
          最近七天暂无反馈数据
        </div>
      )}
    </section>
  )
}

function FeedbackStatusBadge({
  label,
  tone,
}: Readonly<{
  label: string
  tone: 'positive' | 'negative' | 'neutral' | 'priority'
}>) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium',
        tone === 'positive' && 'border-success/20 bg-success/10 text-success',
        tone === 'negative' && 'border-rose/20 bg-rose/10 text-rose',
        tone === 'neutral' && 'border-border bg-muted text-muted-foreground',
        tone === 'priority' && 'border-warning/20 bg-warning/10 text-warning'
      )}
    >
      {label}
    </span>
  )
}

function buildDemoFeedbackItems(): MessageFeedbackEnriched[] {
  const seeds = [
    {
      title: '如何配置知识库的分段策略以提升召回效果？',
      reason: '回答不完整，没有提供具体的配置示例，参考资料也不足。',
      tags: ['答案不完整', '未命中知识库', '引用不足'],
      rating: 2,
      source: 'web',
      account: 'user_9847',
    },
    {
      title: '上传 PDF 后为什么只有部分分页面被解析？',
      reason: '不确定是文件问题还是系统限制，希望有更明确的说明。',
      tags: ['表达模糊', '待确认', '解析问题'],
      rating: 3,
      source: 'mobile',
      account: 'user_7632',
    },
    {
      title: 'RAG 与微调有什么区别？适合什么场景？',
      reason: '解释很清晰，例子也很实用，帮助我理解了两者的区别。',
      tags: ['表达清晰', '引用充分', '有帮助'],
      rating: 4,
      source: 'enterprise',
      account: 'user_5521',
    },
    {
      title: '多知识库权限隔离怎么做？',
      reason: '提到了方向，但是没有落到权限粒度和策略配置上。',
      tags: ['答案不完整', '权限配置', '高优先级'],
      rating: 2,
      source: 'api',
      account: 'user_4102',
    },
    {
      title: '为什么命中率下降后检索速度也变慢了？',
      reason: '分析比较准确，给出的排查路径对我有帮助。',
      tags: ['诊断清晰', '有帮助'],
      rating: 5,
      source: 'web',
      account: 'user_2048',
    },
  ] as const

  return Array.from({ length: 128 }, (_, index) => {
    const seed = seeds[index % seeds.length]
    const createdDate = new Date()
    createdDate.setHours(10 - (index % 5), Math.max(0, 24 - (index % 17)), 0, 0)
    createdDate.setDate(createdDate.getDate() - (index % 7))
    const createdAt = createdDate.toISOString()
    return {
      id: `fb_demo_${String(index + 1).padStart(4, '0')}`,
      tenant_id: 'demo-tenant',
      conversation_id: `conv_demo_${String(index + 1).padStart(4, '0')}`,
      message_id: `msg_demo_${String(index + 1).padStart(4, '0')}`,
      account_id: seed.account,
      rating: seed.rating,
      reason: seed.reason,
      tags: [...seed.tags],
      expected_answer:
        index % 4 === 0
          ? '需要给出更完整的步骤、配置样例和适用范围。'
          : undefined,
      extra: { source: seed.source },
      created_at: createdAt,
      updated_at: createdAt,
      conversation_title: seed.title,
      message_content: demoMessageContentForRating(seed.rating),
      message_created_at: createdAt,
    }
  })
}

function buildDemoFeedbackMetrics() {
  return {
    stats: {
      total: 128,
      upvotes: 84,
      downvotes: 23,
      neutral: 21,
    },
    topReasons: [
      { label: '答案不完整', value: 42 },
      { label: '未命中知识库', value: 31 },
      { label: '引用不足', value: 18 },
    ],
    sources: [
      { label: 'Web 控制台', value: 64 },
      { label: '移动端', value: 32 },
      { label: '企业微信', value: 16 },
      { label: 'API 接口', value: 10 },
      { label: '其他', value: 6 },
    ],
    trend: {
      labels: ['04-09', '04-10', '04-11', '04-12', '04-13', '04-14', '04-15'],
      series: [
        {
          label: '点赞',
          values: [25, 33, 35, 34, 46, 38, 37],
          color: 'hsl(var(--success))',
        },
        {
          label: '点踩',
          values: [14, 20, 23, 18, 28, 20, 19],
          color: 'hsl(var(--destructive))',
        },
        {
          label: '中立',
          values: [6, 13, 13, 8, 13, 9, 8],
          color: 'hsl(var(--info))',
        },
      ],
    },
  }
}

export default function FeedbackTriagePage() {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const demoMode =
    /(^|\/)demo(\/|$)/.test(pathname) && searchParams.get('demo') === '1'
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>('all')
  const [filterType, setFilterType] = useState<FeedbackTypeFilter>('all')
  const [boardTab, setBoardTab] = useState<FeedbackBoardTab>('all')
  const [sourceFilter, setSourceFilter] = useState<FeedbackSourceFilter>('all')
  const [timeRange, setTimeRange] = useState<FeedbackTimeRange>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [detail, setDetail] = useState<MessageFeedbackEnriched | null>(null)
  const [creatingCase, setCreatingCase] = useState(false)
  const [createdCaseId, setCreatedCaseId] = useState<string | null>(null)
  const [archivingId, setArchivingId] = useState<string | null>(null)
  const [timeReady, setTimeReady] = useState(false)
  const [page, setPage] = useState(1)

  useEffect(() => {
    setTimeReady(true)
  }, [])

  const params = useMemo(() => {
    const p: FeedbackListParams = {}
    if (ratingFilter !== 'all') {
      const v = Number(ratingFilter)
      p.min_rating = v
      p.max_rating = v
    }
    return p
  }, [ratingFilter])

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['feedback-enriched', params],
    queryFn: ({ signal }) =>
      feedbackApi.listEnriched({ limit: 100, ...params }, { signal }),
    enabled: !demoMode,
    staleTime: 5_000,
  })

  const {
    data: loopCandidateData,
    isFetching: isLoopFetching,
    refetch: refetchLoopCandidates,
  } = useQuery({
    queryKey: ['feedback-loop-candidates'],
    queryFn: ({ signal }) =>
      feedbackApi.loopCandidates(
        { max_rating: 2, limit: 200, ruleset: 'industrial_control' },
        { signal }
      ),
    enabled: !demoMode,
    staleTime: 15_000,
  })

  const items = useMemo(
    () => (demoMode ? buildDemoFeedbackItems() : data?.items || []),
    [data, demoMode]
  )
  const demoMetrics = useMemo(() => buildDemoFeedbackMetrics(), [])
  const loopMetrics = useMemo(
    () => buildLoopCandidateMetrics(loopCandidateData, demoMode),
    [demoMode, loopCandidateData]
  )

  const stats = useMemo(() => {
    if (demoMode) {
      return {
        ...demoMetrics.stats,
        1: 12,
        2: 11,
        3: 21,
        4: 38,
        5: 46,
      }
    }
    const s: FeedbackStats = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
      total: 0,
      upvotes: 0,
      downvotes: 0,
      neutral: 0,
    }
    for (const it of items) {
      s.total++
      const r = Number(it.rating) || 0
      if (isFeedbackRating(r)) {
        s[r] += 1
      }
      const kind = classifyFeedback(r)
      if (kind === 'thumbs_up') s.upvotes++
      if (kind === 'thumbs_down') s.downvotes++
      if (kind === 'neutral') s.neutral++
    }
    return s
  }, [demoMetrics.stats, demoMode, items])

  const topReasonStats = useMemo(() => {
    if (demoMode) return demoMetrics.topReasons
    const counts = new Map<string, number>()
    items.forEach((item) => {
      const key = getFeedbackIssueLabel(item)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    })
    return Array.from(counts.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((left, right) => right.value - left.value)
      .slice(0, 3)
  }, [demoMetrics.topReasons, demoMode, items])

  const sourceStats = useMemo(() => {
    if (demoMode) return demoMetrics.sources
    const counts = new Map<FeedbackSourceFilter, number>()
    items.forEach((item) => {
      const key = getFeedbackSource(item)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    })
    return (['web', 'mobile', 'enterprise', 'api', 'benchmark', 'other'] as const)
      .map((key) => ({
        label: getFeedbackSourceLabel(key),
        value: counts.get(key) ?? 0,
      }))
      .filter((item) => item.value > 0)
  }, [demoMetrics.sources, demoMode, items])

  const primarySourceFilter = useMemo(() => {
    const sourceKeys: FeedbackSourceFilter[] = [
      'web',
      'mobile',
      'enterprise',
      'api',
      'benchmark',
      'other',
    ]
    return (
      sourceKeys.find((source) =>
        items.some((item) => getFeedbackSource(item) === source)
      ) ?? 'all'
    )
  }, [items])

  const trendStats = useMemo(() => {
    if (demoMode) return demoMetrics.trend
    const labels: string[] = []
    const up: number[] = []
    const down: number[] = []
    const neutral: number[] = []
    const todayKey = utcDayKey(new Date())
    for (let index = 6; index >= 0; index -= 1) {
      const day = new Date(`${todayKey}T00:00:00.000Z`)
      day.setUTCDate(day.getUTCDate() - index)
      const dayKey = utcDayKey(day)
      labels.push(utcShortLabel(dayKey))
      const dayItems = items.filter((item) => {
        const itemKey = utcDayKey(item.created_at)
        return itemKey === dayKey
      })
      up.push(
        dayItems.filter((item) => classifyFeedback(item.rating) === 'thumbs_up')
          .length
      )
      down.push(
        dayItems.filter(
          (item) => classifyFeedback(item.rating) === 'thumbs_down'
        ).length
      )
      neutral.push(
        dayItems.filter((item) => classifyFeedback(item.rating) === 'neutral')
          .length
      )
    }
    return {
      labels,
      series: [
        { label: '点赞', values: up, color: 'hsl(var(--success))' },
        { label: '点踩', values: down, color: 'hsl(var(--destructive))' },
        { label: '中立', values: neutral, color: 'hsl(var(--info))' },
      ],
    }
  }, [demoMetrics.trend, demoMode, items])

  const filtered = useMemo(() => {
    let res = items
    const q = searchTerm.trim().toLowerCase()

    if (filterType !== 'all') {
      res = res.filter((i) => classifyFeedback(i.rating) === filterType)
    }

    if (sourceFilter !== 'all') {
      res = res.filter((item) => getFeedbackSource(item) === sourceFilter)
    }

    if (timeRange !== 'all') {
      res = res.filter((item) => isWithinRange(item.created_at, timeRange))
    }

    if (boardTab === 'pending') {
      res = res.filter((item) => !isArchivedFeedback(item))
    }
    if (boardTab === 'high-priority') {
      res = res.filter(
        (item) => !isArchivedFeedback(item) && isHighPriority(item)
      )
    }
    if (boardTab === 'archived') {
      res = res.filter((item) => isArchivedFeedback(item))
    }

    if (q) {
      res = res.filter((it) => {
        const hay = [
          it.conversation_title,
          it.message_content,
          it.reason,
          (it.tags || []).join(' '),
          it.id,
          it.account_id,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return hay.includes(q)
      })
    }
    return res
  }, [
    boardTab,
    items,
    searchTerm,
    filterType,
    sourceFilter,
    timeRange,
  ])

  const copyDetail = async (it: MessageFeedbackEnriched) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(it, null, 2))
      toast.success('已复制')
    } catch (err: unknown) {
      toast.error(formatApiError(err, '复制失败'))
    }
  }

  const toggleArchived = useCallback(
    async (item: MessageFeedbackEnriched) => {
      if (demoMode) {
        toast.success('演示模式仅供预览，不会写入处理状态')
        return
      }
      const nextArchived = !isArchivedFeedback(item)
      setArchivingId(item.id)
      try {
        await feedbackApi.update(item.id, { archived: nextArchived })
        toast.success(nextArchived ? '已归档反馈' : '已取消归档')
        await refetch()
      } catch (err: unknown) {
        toast.error(formatApiError(err, nextArchived ? '归档失败' : '取消归档失败'))
      } finally {
        setArchivingId(null)
      }
    },
    [demoMode, refetch]
  )

  const createRegressionCase = useCallback(
    async (item: MessageFeedbackEnriched) => {
      if (demoMode) {
        toast.success('演示模式仅供预览，不会创建回归用例')
        return
      }
      setCreatingCase(true)
      try {
        const rc = await feedbackApi.toRegressionCase(item.id, {
          include_document_scope: true,
        })
        setCreatedCaseId(rc.id)
        toast.success('已创建回归用例')
      } catch (err: unknown) {
        toast.error(formatApiError(err, '创建回归用例失败'))
      } finally {
        setCreatingCase(false)
      }
    },
    [demoMode]
  )

  const handleExitDemoMode = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('demo')
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname)
  }, [pathname, router, searchParams])

  // 切换反馈详情时清理当前回归用例状态。
  useEffect(() => {
    setCreatedCaseId(null)
    setCreatingCase(false)
  }, [detail?.id])

  const hasActiveFilters =
    searchTerm.trim().length > 0 ||
    filterType !== 'all' ||
    ratingFilter !== 'all'
  const hasExtendedFilters =
    hasActiveFilters ||
    sourceFilter !== 'all' ||
    timeRange !== 'all' ||
    boardTab !== 'all'
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filtered.length / FEEDBACK_PAGE_SIZE)),
    [filtered.length]
  )
  // 筛选结果缩小时直接约束当前页，避免额外触发一次渲染。
  const safePage = Math.min(page, totalPages)
  const paginated = useMemo(
    () =>
      filtered.slice(
        (safePage - 1) * FEEDBACK_PAGE_SIZE,
        safePage * FEEDBACK_PAGE_SIZE
      ),
    [filtered, safePage]
  )
  const listSummary = useMemo(() => {
    if (!items.length) return null
    if (hasExtendedFilters) return `筛选 ${filtered.length} / ${items.length}`
    return `共 ${items.length} 条`
  }, [filtered.length, hasExtendedFilters, items.length])
  const activeFilterBadges = useMemo(
    () =>
      buildActiveFeedbackFilterBadges(
        filterType,
        ratingFilter,
        sourceFilter,
        timeRange,
        searchTerm
      ),
    [filterType, ratingFilter, searchTerm, sourceFilter, timeRange]
  )

  useEffect(() => {
    setPage(1)
  }, [boardTab, filterType, ratingFilter, sourceFilter, timeRange, searchTerm])

  const summaryCards = useMemo(
    () => [
      {
        label: '总反馈量',
        value: stats.total,
        delta: buildFeedbackDelta(items, 'all'),
        icon: MessageSquare,
        tone: 'indigo' as const,
      },
      {
        label: '点赞',
        value: stats.upvotes,
        delta: buildFeedbackDelta(items, 'thumbs_up'),
        icon: ThumbsUp,
        tone: 'emerald' as const,
      },
      {
        label: '点踩',
        value: stats.downvotes,
        delta: buildFeedbackDelta(items, 'thumbs_down'),
        icon: ThumbsDown,
        tone: 'rose' as const,
      },
      {
        label: '中立反馈',
        value: stats.neutral,
        delta: buildFeedbackDelta(items, 'neutral'),
        icon: Star,
        tone: 'blue' as const,
      },
    ],
    [items, stats.downvotes, stats.neutral, stats.total, stats.upvotes]
  )

  return (
    <AppFrame>
      <PageScaffold
        title="反馈分析中心"
        iconImage="feedback-quality"
        icon={MessageSquare}
        iconColor="text-indigo dark:text-indigo"
        size="full"
        showHeader={false}
        topClassName="w-full max-w-none px-4 pt-4 pb-2.5 md:px-5 lg:px-6"
        top={
          <div className="space-y-2.5">
            <div
              data-management-header="true"
              className={cn(
                KNOWLEDGE_OPS_HERO_PANEL_CLASS,
                'flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'
              )}
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted text-primary">
                  <PageTitleIcon name="feedback-quality" className="size-9" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-xl font-semibold leading-7 text-foreground">反馈分析</h1>
                  <p className="mt-0.5 text-sm leading-5 text-muted-foreground">
                    汇总用户评价和低分原因，筛选需要回归验证的问题。
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                {demoMode ? (
                  <Button variant="outline" size="sm" onClick={handleExitDemoMode}>
                    退出演示
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => {
                    if (demoMode) {
                      toast.success('演示数据已刷新')
                      return
                    }
                    refetch()
                    refetchLoopCandidates()
                  }}
                >
                  <RefreshCw
                    className={cn(
                      'size-4',
                      isFetching || isLoopFetching
                        ? 'animate-spin motion-reduce:animate-none'
                        : ''
                    )}
                    aria-hidden="true"
                  />
                  刷新数据
                </Button>
              </div>
            </div>
            <div className="grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-2 xl:grid-cols-4">
              {summaryCards.map((card) => (
                <FeedbackSummaryCard
                  key={card.label}
                  label={card.label}
                  value={card.value}
                  delta={card.delta}
                  icon={card.icon}
                  tone={card.tone}
                />
              ))}
            </div>
          </div>
        }
        bodyClassName="w-full max-w-none px-4 pb-5 md:px-5 lg:px-6"
      >
        <div className="grid gap-4 xl:h-[calc(100vh-14rem)] xl:min-h-0 xl:grid-cols-[minmax(0,1.75fr)_minmax(300px,0.75fr)]">
          <div className="xl:flex xl:min-h-0 xl:flex-col">
            <section data-feedback-list-board="true" className="overflow-hidden rounded-md border border-border bg-card xl:flex xl:min-h-0 xl:flex-1 xl:flex-col">
              <div className="border-b border-border px-4 py-3.5">
                <div className="space-y-3">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-semibold text-foreground">反馈队列</h2>
                        <span className="rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          {listSummary || '当前空列表'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {items.length ? '按反馈时间展示，可归档或加入回归验证。' : '当前暂无反馈'}
                      </p>

                      {hasExtendedFilters ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {activeFilterBadges.map((badge) => (
                            <Badge
                              key={badge.key}
                              variant="secondary"
                              className="rounded-md px-2 py-0.5 text-xs font-medium"
                            >
                              {badge.label}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div data-feedback-board-tabs="true" className="flex w-full max-w-full flex-wrap items-center gap-1 rounded-md border border-border bg-background p-1 xl:w-auto xl:justify-end">
                      {(
                        [
                          ['all', '全部'],
                          ['pending', '待分析'],
                          ['high-priority', '高优先级'],
                          ['archived', '已归档'],
                        ] as const
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setBoardTab(value)}
                          className={cn(
                            'h-8 rounded-md border px-3 text-xs font-medium transition-colors',
                            boardTab === value
                              ? 'border-primary/25 bg-primary/10 text-primary'
                              : 'border-transparent bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid w-full gap-2 md:grid-cols-2 xl:grid-cols-[minmax(18rem,1fr)_7.5rem_7.5rem_7.5rem_8.25rem]">
                    <SearchInput
                      value={searchTerm}
                      onValueChange={setSearchTerm}
                      placeholder="搜索反馈 / 原因 / 标签 / 账号"
                      containerClassName="w-full"
                      inputClassName="h-9 rounded-md border-border bg-background text-xs shadow-none"
                    />

                    <Select
                      value={filterType}
                      onValueChange={(v) =>
                        setFilterType(v as FeedbackTypeFilter)
                      }
                    >
                      <SelectTrigger
                        title={filterType === 'all' ? '按类型筛选（当前：全部）' : filterType === 'thumbs_up' ? '按类型筛选：点赞反馈' : '按类型筛选：点踩反馈'}
                        className="h-9 w-full rounded-md border-border bg-background px-3 shadow-none [&>svg]:text-muted-foreground"
                      >
                        <span className="truncate pr-2 text-xs font-medium text-foreground">
                          {filterType === 'all' ? '类型' : filterType === 'thumbs_up' ? '类型 · 点赞' : '类型 · 点踩'}
                        </span>
                      </SelectTrigger>
                      <SelectContent className="rounded-md border-border bg-popover p-1">
                        <SelectItem value="all">全部</SelectItem>
                        <SelectItem value="thumbs_up">点赞</SelectItem>
                        <SelectItem value="thumbs_down">点踩</SelectItem>
                      </SelectContent>
                    </Select>

                    <Select
                      value={ratingFilter}
                      onValueChange={(v) => setRatingFilter(v as RatingFilter)}
                    >
                      <SelectTrigger
                        title={
                          ratingFilter === 'all'
                            ? '按星级筛选（当前：全部）'
                            : `按星级筛选：${ratingFilter} 星反馈`
                        }
                        className="h-9 w-full rounded-md border-border bg-background px-3 shadow-none [&>svg]:text-muted-foreground"
                      >
                        <span className="truncate pr-2 text-xs font-medium text-foreground">
                          {ratingFilter === 'all'
                            ? '星级'
                            : `星级 · ${ratingFilter} 星`}
                        </span>
                      </SelectTrigger>
                      <SelectContent className="rounded-md border-border bg-popover p-1">
                        <SelectItem value="all">全部</SelectItem>
                        <SelectItem value="5">5 星</SelectItem>
                        <SelectItem value="4">4 星</SelectItem>
                        <SelectItem value="3">3 星</SelectItem>
                        <SelectItem value="2">2 星</SelectItem>
                        <SelectItem value="1">1 星</SelectItem>
                      </SelectContent>
                    </Select>

                    <Select
                      value={sourceFilter}
                      onValueChange={(v) =>
                        setSourceFilter(v as FeedbackSourceFilter)
                      }
                    >
                      <SelectTrigger className="h-9 w-full rounded-md border-border bg-background px-3 shadow-none">
                        <SelectValue placeholder="来源" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">来源</SelectItem>
                        <SelectItem value="web">Web 控制台</SelectItem>
                        <SelectItem value="mobile">移动端</SelectItem>
                        <SelectItem value="enterprise">企业微信</SelectItem>
                        <SelectItem value="api">API 接口</SelectItem>
                        <SelectItem value="benchmark">评测样本</SelectItem>
                        <SelectItem value="other">其他</SelectItem>
                      </SelectContent>
                    </Select>

                    <Select
                      value={timeRange}
                      onValueChange={(v) =>
                        setTimeRange(v as FeedbackTimeRange)
                      }
                    >
                      <SelectTrigger className="h-9 w-full rounded-md border-border bg-background px-3 shadow-none [&>svg]:text-muted-foreground">
                        <span className="inline-flex items-center gap-2 truncate pr-2 text-xs font-medium text-foreground">
                          <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
                          <span className="truncate">
                            {TIME_RANGE_SHORT_LABELS[timeRange]}
                          </span>
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7d">最近 7 天</SelectItem>
                        <SelectItem value="30d">最近 30 天</SelectItem>
                        <SelectItem value="90d">最近 90 天</SelectItem>
                        <SelectItem value="all">全部时间</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {filtered.length ? (
                <div className="divide-y divide-border xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:overscroll-contain xl:no-scrollbar">
                  {paginated.map((item) => {
                    const kind = classifyFeedback(item.rating)
                    const issue = getFeedbackIssueLabel(item)
                    const source = getFeedbackSource(item)
                    const ratingValue = Number(item.rating) || 0
                    const archived = isArchivedFeedback(item)
                    const title =
                      item.reason ||
                      item.conversation_title ||
                      `反馈 ${item.id.slice(0, 8)}`
                    const sourceBadgeLabel = feedbackSourceBadgeLabel(source)
                    const resolutionLabel = RESOLUTION_LABELS[kind]
                    const badgeItems = Array.from(
                      new Set(
                        [
                          issue,
                          sourceBadgeLabel,
                          resolutionLabel,
                          archived ? '已处理 / 归档' : null,
                        ].filter(Boolean)
                      )
                    ) as string[]
                    return (
                      <article
                        key={item.id}
                        className="bg-card transition-colors hover:bg-muted/30"
                      >
                        <div className="flex items-start gap-3 px-4 py-3.5">
                          <div
                            className={cn(
                              'flex size-8 shrink-0 items-center justify-center rounded-md border',
                              FEEDBACK_KIND_BADGE_CLASSES[kind]
                            )}
                          >
                            {feedbackKindIcon(kind)}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-col gap-1.5 xl:flex-row xl:items-start xl:justify-between">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium text-foreground">
                                  {title}
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                                  <span>
                                    用户反馈（
                                    {FEEDBACK_KIND_LABELS[kind]}
                                    ）
                                  </span>
                                  <span className="text-muted-foreground/35">
                                    ·
                                  </span>
                                  <div className="flex items-center gap-0.5 text-warning">
                                    {Array.from({ length: 5 }, (_, starIndex) => starIndex).map(
                                      (starIndex) => (
                                        <Star
                                          key={`feedback-rating-star-${starIndex}`}
                                          className={cn(
                                            'size-2.5',
                                            starIndex < ratingValue
                                              ? 'fill-current'
                                              : 'stroke-current opacity-35'
                                          )}
                                        />
                                      )
                                    )}
                                  </div>
                                  <span className="font-normal text-foreground/70">
                                    {ratingValue}/5
                                  </span>
                                </div>
                              </div>

                              <div className="flex shrink-0 flex-col items-start gap-0.5 text-xs text-muted-foreground xl:items-end">
                                <div>{timeReady ? formatDate(item.created_at) : '—'}</div>
                                <div className="inline-flex items-center gap-1.5">
                                  <UserRound className="size-3" />
                                  <span>{item.account_id || '匿名用户'}</span>
                                </div>
                              </div>
                            </div>

                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {badgeItems.map((badge) => (
                                <FeedbackStatusBadge
                                  key={badge}
                                  label={badge}
                                  tone={
                                    feedbackStatusTone(badge, issue, kind)
                                  }
                                />
                              ))}
                            </div>

                            <div className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
                              <div className="min-w-0">
                                <div className="text-xs font-medium text-foreground">
                                  用户反馈原因
                                </div>
                                <p className="mt-1 line-clamp-2 text-xs leading-5 text-foreground/80">
                                  {item.reason || '用户未填写反馈原因。'}
                                </p>
                              </div>
                              <div className="min-w-0 border-t border-border pt-3 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
                                <div className="text-xs font-medium text-foreground">
                                  AI 回答摘要
                                </div>
                                <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                                  {item.message_content || '（无消息内容）'}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-border bg-muted/20 px-4 py-2.5">
                          <div className="text-xs text-muted-foreground">
                            编号 {item.id.slice(0, 8)}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2.5 text-xs font-medium text-primary"
                              onClick={() => setDetail(item)}
                            >
                              查看详情
                              <ChevronRight className="ml-1 size-3" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 px-2.5 text-xs"
                              onClick={() => createRegressionCase(item)}
                              disabled={creatingCase}
                            >
                              <TestTube2 className="mr-1.5 size-3.5" />
                              加入回归
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 px-2.5 text-xs"
                              onClick={() => toggleArchived(item)}
                              disabled={archivingId === item.id}
                            >
                              {archivingId === item.id ? (
                                <Loader2 className="mr-1.5 size-3.5 animate-spin motion-reduce:animate-none" />
                              ) : (
                                <CheckCheck className="mr-1.5 size-3.5 text-success" />
                              )}
                              {archived ? '取消归档' : '标记已处理'}
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-8 text-muted-foreground hover:bg-muted hover:text-foreground"
                                  aria-label="更多问题操作"
                                  title="更多问题操作"
                                >
                                  <MoreHorizontal className="size-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="end"
                                className="w-44 rounded-md"
                              >
                                <DropdownMenuItem
                                  className="text-xs"
                                  onSelect={() => setDetail(item)}
                                >
                                  查看完整详情
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-xs"
                                  onSelect={() => copyDetail(item)}
                                >
                                  复制原始数据
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-xs"
                                  onSelect={() =>
                                    router.push(
                                      `/history?id=${encodeURIComponent(item.conversation_id)}`
                                    )
                                  }
                                >
                                  跳转对话上下文
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-xs"
                                  disabled={creatingCase}
                                  onSelect={() => createRegressionCase(item)}
                                >
                                  加入回归集
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-xs"
                                  disabled={archivingId === item.id}
                                  onSelect={() => toggleArchived(item)}
                                >
                                  {archived ? '取消归档' : '标记已处理'}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </article>
                    )
                  })}
                </div>
              ) : (
                <div className="flex min-h-[320px] flex-1 flex-col items-center justify-center px-6 py-16 text-center">
                  <div className="mb-3 flex size-10 items-center justify-center rounded-md border border-border bg-muted">
                    <Search
                      className="size-4 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </div>
                  <p className="text-sm font-semibold text-foreground">
                    没有找到相关的反馈记录
                  </p>
                  <p className="mt-1 max-w-lg text-sm leading-6 text-muted-foreground">
                    {hasExtendedFilters
                      ? '可以清除当前筛选条件，查看完整反馈流。'
                      : '当前没有可分析的反馈数据，可使用右上角刷新获取最新结果。'}
                  </p>
                  {hasExtendedFilters ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-4"
                      onClick={() => {
                        setSearchTerm('')
                        setFilterType('all')
                        setRatingFilter('all')
                        setSourceFilter('all')
                        setTimeRange('all')
                        setBoardTab('all')
                      }}
                    >
                      清除筛选
                    </Button>
                  ) : null}
                </div>
              )}

              {filtered.length ? (
                <div className="flex flex-col gap-2 border-t border-border px-4 py-2.5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-background text-foreground disabled:opacity-35"
                      aria-label="上一页"
                      disabled={safePage <= 1}
                      onClick={() =>
                        setPage((previous) => Math.max(1, previous - 1))
                      }
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    {Array.from(
                      { length: Math.min(totalPages, 5) },
                      (_, index) => {
                        const pageNumber = index + 1
                        return (
                          <button
                            key={pageNumber}
                            type="button"
                            onClick={() => setPage(pageNumber)}
                            aria-label={`第 ${pageNumber} 页`}
                            className={cn(
                              'inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-xs font-medium',
                              safePage === pageNumber
                                ? 'bg-info/[0.12] text-info'
                                : 'text-muted-foreground hover:text-foreground'
                            )}
                          >
                            {pageNumber}
                          </button>
                        )
                      }
                    )}
                    {totalPages > 5 ? (
                      <span className="px-1 text-xs">…</span>
                    ) : null}
                    {totalPages > 5 ? (
                      <button
                        type="button"
                        onClick={() => setPage(totalPages)}
                        aria-label={`第 ${totalPages} 页`}
                        className={cn(
                          'inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-xs font-medium',
                          safePage === totalPages
                            ? 'bg-info/[0.12] text-info'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        {totalPages}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-background text-foreground disabled:opacity-35"
                      aria-label="下一页"
                      disabled={safePage >= totalPages}
                      onClick={() =>
                        setPage((previous) =>
                          Math.min(totalPages, previous + 1)
                        )
                      }
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <span>3 条/页</span>
                    <span>共 {filtered.length} 条</span>
                  </div>
                </div>
              ) : null}
            </section>
          </div>

          <div className="min-w-0 space-y-3 xl:h-full xl:overflow-y-auto xl:overscroll-contain xl:no-scrollbar">
            <section className="rounded-md border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-foreground">高频问题原因</h2>
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => {
                    setBoardTab('high-priority')
                    setFilterType('thumbs_down')
                    setPage(1)
                  }}
                >
                  更多
                  <ChevronRight className="size-3.5" />
                </button>
              </div>
              <div className="mt-3 divide-y divide-border">
                {topReasonStats.length ? (
                  topReasonStats.map((item, index) => (
                    <div key={item.label} className="py-2.5">
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              'inline-flex size-5 items-center justify-center rounded-sm text-xs font-medium tabular-nums',
                              index === 0
                                ? 'bg-destructive text-destructive-foreground'
                                : 'border border-border bg-muted text-muted-foreground'
                            )}
                          >
                            {index + 1}
                          </span>
                          <span className="font-medium text-foreground">
                            {item.label}
                          </span>
                        </div>
                        <span className="font-mono tabular-nums text-muted-foreground">
                          {item.value}{' '}
                          <span className="text-muted-foreground/65">
                            (
                            {stats.total > 0
                              ? ((item.value / stats.total) * 100).toFixed(1)
                              : '0.0'}
                            %)
                          </span>
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-sm bg-muted">
                        <div
                          className={cn(
                            'h-full rounded-sm transition-[width] duration-300 motion-reduce:transition-none',
                            topReasonBarClass(index)
                          )}
                          style={{
                            width: `${stats.total ? (item.value / stats.total) * 100 : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    收到低分反馈后，这里会汇总前三项常见原因。
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-md border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">改进候选</h2>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    仅供复核，不会自动应用
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="rounded-md px-2 py-0.5 text-xs font-medium"
                >
                  {loopMetrics.negative} 条低分
                </Badge>
              </div>
              <dl className="mt-3 divide-y divide-border border-y border-border text-xs">
                <div className="flex items-center justify-between gap-3 py-2.5">
                  <dt className="text-muted-foreground">困难负样本</dt>
                  <dd className="font-semibold text-foreground tabular-nums">
                    {loopMetrics.hardNeg}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 py-2.5">
                  <dt className="text-muted-foreground">训练三元组</dt>
                  <dd className="font-semibold text-foreground tabular-nums">
                    {loopMetrics.triples}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 py-2.5">
                  <dt className="text-muted-foreground">规则候选</dt>
                  <dd className="font-semibold text-foreground tabular-nums">
                    {loopMetrics.ruleCandidates}
                  </dd>
                </div>
              </dl>
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    负反馈转可用候选率
                  </span>
                  <span className="font-mono font-semibold text-foreground">
                    {loopMetrics.conversionRate.toFixed(1)}%
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-sm bg-muted">
                  <div
                    className="h-full rounded-sm bg-primary transition-[width] duration-300 motion-reduce:transition-none"
                    style={{
                      width: `${Math.max(0, Math.min(100, loopMetrics.conversionRate))}%`,
                    }}
                  />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {loopMetrics.tokens.length ? (
                  loopMetrics.tokens.map((token) => (
                    <Badge
                      key={token}
                      variant="secondary"
                      className="rounded-md px-2 py-0.5 text-xs font-medium"
                    >
                      {token}
                    </Badge>
                  ))
                ) : (
                  <div className="w-full border-t border-border py-3 text-xs leading-5 text-muted-foreground">
                    暂无改进候选；积累低分反馈后会生成困难负样本、训练三元组和规则候选。
                  </div>
                )}
              </div>
            </section>

            <FeedbackDistributionPanel
              title="主要反馈来源"
              items={sourceStats}
              colors={[
                'hsl(var(--info))',
                'hsl(var(--success))',
                'hsl(var(--warning))',
                'hsl(var(--accent))',
                'hsl(var(--indigo))',
                'hsl(var(--muted-foreground) / 0.5)',
              ]}
              actionLabel={primarySourceFilter === 'all' ? undefined : '更多'}
              onAction={() => {
                setSourceFilter(primarySourceFilter)
                setPage(1)
              }}
            />

            <FeedbackTrendCard
              title="最近 7 天反馈趋势"
              labels={trendStats.labels}
              series={trendStats.series}
              actionLabel="更多"
              onAction={() => {
                setTimeRange('7d')
                setPage(1)
              }}
            />
          </div>
        </div>
      </PageScaffold>

      <Dialog
        open={Boolean(detail)}
        onOpenChange={(o) => (o ? null : setDetail(null))}
      >
        <DialogContent className="max-w-3xl overflow-hidden rounded-lg p-0">
          <DialogHeader className="border-b border-border bg-card px-5 py-4 pr-12">
            <DialogTitle className="text-base font-semibold text-foreground">
              反馈详情
            </DialogTitle>
          </DialogHeader>

          {detail && (
            <div className="max-h-[75vh] space-y-5 overflow-y-auto overscroll-contain p-5">
              <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground">
                    {detail.conversation_title ||
                      `对话 ${detail.conversation_id}`}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>反馈编号 {detail.id.slice(0, 8)}</span>
                    <span>消息编号 {detail.message_id.slice(0, 8)}</span>
                    <span>{timeReady ? formatDate(detail.updated_at) : '—'}</span>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => copyDetail(detail)}>
                  <Copy className="mr-2 size-3.5" aria-hidden="true" />
                  复制原始数据
                </Button>
              </div>

              <div className="grid gap-4">
                {detail.reason && (
                  <section className="space-y-2">
                    <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <MessageSquare className="size-4 text-muted-foreground" aria-hidden="true" />
                      用户反馈
                    </h3>
                    <div className="rounded-md border border-destructive/20 bg-destructive/10 p-4 text-sm leading-6 text-destructive">
                      {detail.reason}
                    </div>
                  </section>
                )}

                {detail.expected_answer && (
                  <section className="space-y-2">
                    <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Star className="size-4 text-muted-foreground" aria-hidden="true" />
                      期望回答
                    </h3>
                    <div className="rounded-md border border-success/20 bg-success/10 p-4 text-sm font-medium leading-6 text-success">
                      {detail.expected_answer}
                    </div>
                  </section>
                )}

                {detail.message_content && (
                  <section className="space-y-2">
                    <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <MessageSquare className="size-4 text-muted-foreground" aria-hidden="true" />
                      AI 回答
                    </h3>
                    <div className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-muted p-4 font-mono text-[13px] leading-6 text-muted-foreground">
                      {detail.message_content}
                    </div>
                  </section>
                )}
              </div>

              <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:flex-wrap sm:justify-end">
                <Button
                  variant="outline"
                  disabled={!detail?.id || creatingCase}
                  onClick={async () => {
                    if (!detail?.id) return
                    setCreatingCase(true)
                    try {
                      const rc = await feedbackApi.toRegressionCase(detail.id, {
                        include_document_scope: true,
                      })
                      setCreatedCaseId(rc.id)
                      toast.success('已创建回归用例')
                    } catch (err: unknown) {
                      toast.error(formatApiError(err, '创建回归用例失败'))
                    } finally {
                      setCreatingCase(false)
                    }
                  }}
                  className="gap-2"
                >
                  {creatingCase ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                  ) : (
                    <TestTube2 className="h-3.5 w-3.5" />
                  )}
                  生成回归用例
                </Button>

                {createdCaseId ? (
                  <Button
                    variant="outline"
                    onClick={() => router.push(`/evaluations?tab=regression`)}
                    className="gap-2"
                    title={`回归用例编号：${createdCaseId}`}
                  >
                    前往回归测试
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Button>
                ) : null}

                <Button
                  variant="outline"
                  onClick={() =>
                    router.push(
                      `/history?id=${encodeURIComponent(detail.conversation_id)}`
                    )
                  }
                  className="gap-2"
                >
                  跳转至对话上下文
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Button>
                <Button onClick={() => setDetail(null)}>关闭</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppFrame>
  )
}
