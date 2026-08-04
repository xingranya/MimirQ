'use client'

import type { DocumentHealthCard } from '@/types'

import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  CircleMinus,
  Clock3,
  FileText,
  Layers,
  Network,
  RefreshCw,
  SearchCheck,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { useMemo } from 'react'

import { AppFrame } from '@/components/app-frame'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageScaffold } from '@/components/ui/page-scaffold'
import { QueryErrorState } from '@/components/ui/query-error-state'
import { useRouter } from '@/i18n/navigation'
import { documentApi } from '@/lib/api'
import { formatApiError } from '@/lib/api-errors'
import { getChunkStrategyLabel } from '@/lib/chunk-strategies'
import { getParserLabel } from '@/lib/parser-options'
import { queryKeys } from '@/lib/query-keys'
import { cn, formatDate, formatFileSize } from '@/lib/utils'

type QualityBadgeTone = 'bad' | 'warn' | 'ok'
type HealthTone = QualityBadgeTone | 'neutral'

const DOCUMENT_HEALTH_QUERY_PARAMS = {
  window_minutes: 24 * 60,
  max_chunks_scored: 256,
} as const

function safeNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function pct(value: number | null | undefined, digits = 1): string {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : null
  if (number === null) return '—'
  return `${(number * 100).toFixed(digits)}%`
}

function compactNumber(value: unknown): string {
  const number = safeNumber(value)
  return number === null ? '—' : number.toLocaleString()
}

function parseQualityScore(card: DocumentHealthCard | null): number | null {
  const parseQuality = isRecord(card?.parsing?.parse_quality) ? card.parsing.parse_quality : {}
  return safeNumber(parseQuality.score)
}

function toneClassName(tone: HealthTone): string {
  switch (tone) {
    case 'bad':
      return 'border-destructive/25 bg-destructive/5 text-destructive'
    case 'warn':
      return 'border-warning/25 bg-warning/5 text-warning'
    case 'ok':
      return 'border-success/25 bg-success/5 text-success'
    default:
      return 'border-border bg-muted/40 text-muted-foreground'
  }
}

function retrievalHitsStatusLabel(
  retrievalHits: DocumentHealthCard['retrieval_hits'] | null | undefined,
): string {
  if (retrievalHits?.enabled !== true) return '未启用'
  return retrievalHits.available ? '已有记录' : '暂无记录'
}

function documentStatusLabel(status: unknown): string {
  const value = String(status || '').toLowerCase()
  if (value === 'completed' || value === 'ready') return '已就绪'
  if (value === 'processing' || value === 'pending') return '处理中'
  if (value === 'failed') return '处理失败'
  if (value === 'quarantined') return '已隔离'
  return value || '状态未知'
}

function documentStatusTone(status: unknown): HealthTone {
  const value = String(status || '').toLowerCase()
  if (value === 'completed' || value === 'ready') return 'ok'
  if (value === 'failed' || value === 'quarantined') return 'bad'
  if (value === 'processing' || value === 'pending') return 'warn'
  return 'neutral'
}

function formatBoolean(value: boolean | null | undefined): string {
  if (value === true) return '是'
  if (value === false) return '否'
  return '—'
}

function formatParser(value: string | null | undefined): string {
  return value?.trim() ? getParserLabel(value) : '—'
}

function formatChunkStrategy(value: string | null | undefined): string {
  return value?.trim() ? getChunkStrategyLabel(value) : '—'
}

function formatWindow(minutes: number | null | undefined): string {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes)) return '—'
  if (minutes % (24 * 60) === 0) return `${minutes / (24 * 60)} 天`
  if (minutes % 60 === 0) return `${minutes / 60} 小时`
  return `${minutes} 分钟`
}

function getCoverageTone(value: number | null | undefined): HealthTone {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'neutral'
  if (value >= 0.98) return 'ok'
  if (value >= 0.9) return 'warn'
  return 'bad'
}

function getReviewTone(value: number | null | undefined): HealthTone {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'neutral'
  if (value <= 0.05) return 'ok'
  if (value <= 0.2) return 'warn'
  return 'bad'
}

export default function DocumentHealthPage({ documentId }: Readonly<{ documentId: string }>) {
  const router = useRouter()
  const healthQuery = useQuery({
    queryKey: queryKeys.documents.health(documentId, DOCUMENT_HEALTH_QUERY_PARAMS),
    queryFn: () => documentApi.health(documentId, DOCUMENT_HEALTH_QUERY_PARAMS),
    enabled: Boolean(documentId),
  })
  const data = (healthQuery.data ?? null) as DocumentHealthCard | null
  const qualityScore = useMemo(() => parseQualityScore(data), [data])
  const kgSummary = isRecord(data?.kg?.summary) ? data.kg.summary : {}
  const kgComponents = isRecord(data?.kg?.components) ? data.kg.components : {}
  const qualityBadge = useMemo(() => {
    if (qualityScore === null) return null
    if (qualityScore < 0.35) return { label: '解析质量偏低', tone: 'bad' as const }
    if (qualityScore < 0.6) return { label: '解析质量一般', tone: 'warn' as const }
    return { label: '解析质量良好', tone: 'ok' as const }
  }, [qualityScore])
  const retrievalHitsStatus = retrievalHitsStatusLabel(data?.retrieval_hits)
  const semanticQuality = data?.chunking?.semantic_quality ?? null
  const coverage = data?.chunking?.coverage ?? null
  const isolatedRatio = safeNumber(kgSummary.isolated_entity_ratio)
  const largestComponentRatio = safeNumber(kgComponents.largest_component_ratio)
  const errorDescription = healthQuery.error
    ? formatApiError(healthQuery.error, '暂时无法读取文档健康数据。请重新加载。')
    : null

  const retry = () => {
    void healthQuery.refetch()
  }

  return (
    <AppFrame>
      <PageScaffold
        title="文档健康审计"
        size="full"
        density="system-dense"
        bodyGutter="dense"
        bodyClassName="pb-4"
        description="检查文档从解析到检索的质量，优先处理评分偏低或覆盖不足的环节。"
        icon={ShieldCheck}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => router.push('/knowledge')}
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              返回知识库
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-9"
              disabled={healthQuery.isFetching}
              onClick={retry}
            >
              <RefreshCw
                className={cn(
                  'size-4',
                  healthQuery.isFetching && 'animate-spin motion-reduce:animate-none'
                )}
                aria-hidden="true"
              />
              {healthQuery.isFetching ? '正在刷新' : '刷新数据'}
            </Button>
          </div>
        }
        top={data ? <DocumentSummary data={data} qualityBadge={qualityBadge} /> : null}
      >
        {!data && healthQuery.isPending ? <DocumentHealthLoading /> : null}

        {!data && errorDescription ? (
          <QueryErrorState
            title="文档健康数据加载失败"
            description={errorDescription}
            onRetry={retry}
            retrying={healthQuery.isFetching}
          />
        ) : null}

        {!data && !healthQuery.isPending && !errorDescription ? (
          <section className="rounded-md border border-border bg-card px-4 py-10 text-center">
            <FileText className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
            <h2 className="mt-3 text-base font-semibold text-foreground">暂无健康数据</h2>
            <p className="mx-auto mt-1 max-w-lg text-sm leading-6 text-muted-foreground">
              该文档还没有可用的质量检查结果。文档处理完成后再刷新此页。
            </p>
          </section>
        ) : null}

        {data ? (
          <div className="space-y-4">
            {errorDescription ? (
              <QueryErrorState
                title="刷新失败"
                description={errorDescription}
                onRetry={retry}
                retrying={healthQuery.isFetching}
                className="py-3"
              />
            ) : null}

            <dl className="grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-2 xl:grid-cols-4">
              <HealthMetric
                icon={Activity}
                label="解析质量"
                value={pct(qualityScore)}
                detail={qualityBadge?.label || '暂无评分'}
                tone={qualityBadge?.tone || 'neutral'}
              />
              <HealthMetric
                icon={Layers}
                label="内容覆盖"
                value={pct(coverage?.coverage_ratio)}
                detail={`发现 ${coverage?.gap_count ?? 0} 处缺口`}
                tone={getCoverageTone(coverage?.coverage_ratio)}
              />
              <HealthMetric
                icon={Network}
                label="知识图谱"
                value={compactNumber(kgSummary.entities)}
                detail={`${compactNumber(kgSummary.relations)} 条关系`}
                tone="neutral"
              />
              <HealthMetric
                icon={SearchCheck}
                label="检索命中"
                value={pct(data.retrieval_hits?.hit_rate, 2)}
                detail={retrievalHitsStatus}
                tone={data.retrieval_hits?.available ? 'ok' : 'neutral'}
              />
            </dl>

            <div className="overflow-hidden rounded-md border border-border bg-card">
              <HealthDetails
                icon={FileText}
                title="解析信息"
                description="查看解析方式、页数和处理结果"
                badge={qualityBadge?.label || '暂无评分'}
                tone={qualityBadge?.tone || 'neutral'}
              >
                <FactsGrid>
                  <Fact label="实际解析方式" value={formatParser(data.parsing?.parser_backend)} />
                  <Fact label="计划解析方式" value={formatParser(data.parsing?.parser_backend_requested)} />
                  <Fact label="解析质量" value={pct(qualityScore)} />
                  <Fact label="是否为扫描件" value={formatBoolean(data.parsing?.is_scanned)} />
                  <Fact label="页数" value={compactNumber(data.parsing?.page_count)} />
                  <Fact
                    label="处理时间"
                    value={data.parsing?.processed_at ? formatDate(data.parsing.processed_at) : '—'}
                  />
                </FactsGrid>
              </HealthDetails>

              <HealthDetails
                icon={Layers}
                title="内容分块"
                description="查看分块方式、字符覆盖和内容缺口"
                badge={`覆盖 ${pct(coverage?.coverage_ratio)}`}
                tone={getCoverageTone(coverage?.coverage_ratio)}
              >
                <FactsGrid>
                  <Fact label="实际分块方式" value={formatChunkStrategy(data.chunking?.chunk_strategy)} />
                  <Fact label="计划分块方式" value={formatChunkStrategy(data.chunking?.chunk_strategy_requested)} />
                  <Fact label="分块数量" value={compactNumber(data.chunking?.chunk_count)} />
                  <Fact label="字符总数" value={compactNumber(data.chunking?.total_characters)} />
                  <Fact label="内容覆盖率" value={pct(coverage?.coverage_ratio)} />
                  <Fact label="重复内容占比" value={pct(coverage?.overlap_waste_ratio)} />
                  <Fact label="内容缺口" value={compactNumber(coverage?.gap_count)} />
                  <Fact label="最大缺口字符数" value={compactNumber(coverage?.largest_gap)} />
                </FactsGrid>

                {semanticQuality ? (
                  <section className="mt-5 border-t border-border pt-4" aria-labelledby="semantic-quality-title">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 id="semantic-quality-title" className="text-sm font-semibold text-foreground">
                        语义质量抽样
                      </h3>
                      <Badge
                        variant="secondary"
                        className={cn('border', toneClassName(getReviewTone(semanticQuality.needs_review_ratio)))}
                      >
                        {compactNumber(semanticQuality.needs_review)} 个分块需复核
                      </Badge>
                    </div>
                    <FactsGrid className="mt-3">
                      <Fact label="抽样分块" value={compactNumber(semanticQuality.sampled_chunks)} />
                      <Fact label="需复核占比" value={pct(semanticQuality.needs_review_ratio)} />
                      <Fact label="平均信息密度" value={compactNumber(semanticQuality.mean_information_density)} />
                      <Fact label="平均语义完整度" value={compactNumber(semanticQuality.mean_semantic_completeness)} />
                      <Fact label="平均自包含程度" value={compactNumber(semanticQuality.mean_self_containedness)} />
                      <Fact label="平均代词占比" value={pct(semanticQuality.mean_pronoun_ratio)} />
                    </FactsGrid>
                  </section>
                ) : null}
              </HealthDetails>

              <HealthDetails
                icon={Network}
                title="知识图谱"
                description="查看实体、关系和图谱连通情况"
                badge={`${compactNumber(kgSummary.entities)} 个实体`}
                tone="neutral"
              >
                <FactsGrid>
                  <Fact label="事件" value={compactNumber(kgSummary.events)} />
                  <Fact label="实体" value={compactNumber(kgSummary.entities)} />
                  <Fact label="关系" value={compactNumber(kgSummary.relations)} />
                  <Fact label="孤立实体占比" value={pct(isolatedRatio, 2)} />
                  <Fact label="连通区域" value={compactNumber(kgComponents.components)} />
                  <Fact label="最大连通区域占比" value={pct(largestComponentRatio, 2)} />
                </FactsGrid>
              </HealthDetails>

              <HealthDetails
                icon={SearchCheck}
                title="检索记录"
                description="查看最近一段时间内的引用和命中情况"
                badge={retrievalHitsStatus}
                tone={data.retrieval_hits?.available ? 'ok' : 'neutral'}
                last
              >
                <FactsGrid>
                  <Fact label="统计状态" value={retrievalHitsStatus} />
                  <Fact label="统计范围" value={formatWindow(data.retrieval_hits?.window_minutes)} />
                  <Fact label="分析记录" value={compactNumber(data.retrieval_hits?.traces_scanned)} />
                  <Fact label="有命中的记录" value={compactNumber(data.retrieval_hits?.traces_with_hits)} />
                  <Fact label="引用命中" value={compactNumber(data.retrieval_hits?.citations_matched)} />
                  <Fact label="命中的不同分块" value={compactNumber(data.retrieval_hits?.unique_chunks_matched)} />
                  <Fact label="命中率" value={pct(data.retrieval_hits?.hit_rate, 2)} />
                  <Fact label="数据是否截断" value={formatBoolean(data.retrieval_hits?.truncated)} />
                </FactsGrid>

                {data.retrieval_hits?.enabled === false ? (
                  <div className="mt-4 flex items-start gap-2 rounded-md border border-warning/25 bg-warning/5 p-3 text-sm leading-6 text-warning">
                    <AlertTriangle className="mt-1 size-4 shrink-0" aria-hidden="true" />
                    <p>检索统计尚未启用。请联系管理员在运行设置中开启检索指标记录。</p>
                  </div>
                ) : null}
              </HealthDetails>
            </div>
          </div>
        ) : null}
      </PageScaffold>
    </AppFrame>
  )
}

function DocumentSummary({
  data,
  qualityBadge,
}: Readonly<{
  data: DocumentHealthCard
  qualityBadge: { label: string; tone: QualityBadgeTone } | null
}>) {
  return (
    <section className="rounded-md border border-border bg-card px-4 py-3" aria-labelledby="document-health-name">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-primary">
              <FileText className="size-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="document-health-name" className="break-words text-base font-semibold text-foreground">
                  {data.filename || '未命名文档'}
                </h2>
                <Badge
                  variant="secondary"
                  className={cn('border', toneClassName(documentStatusTone(data.status)))}
                >
                  {documentStatusLabel(data.status)}
                </Badge>
                {qualityBadge ? (
                  <Badge variant="secondary" className={cn('border', toneClassName(qualityBadge.tone))}>
                    {qualityBadge.label}
                  </Badge>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">以下结果来自最近一次健康检查。</p>
            </div>
          </div>
        </div>

        <dl className="grid min-w-0 grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <SummaryFact label="文件类型" value={data.file_type || '—'} />
          <SummaryFact label="文件大小" value={data.file_size ? formatFileSize(data.file_size) : '—'} />
          <SummaryFact label="创建时间" value={data.created_at ? formatDate(data.created_at) : '—'} />
          <SummaryFact label="检查时间" value={data.generated_at ? formatDate(data.generated_at) : '—'} />
        </dl>
      </div>
    </section>
  )
}

function SummaryFact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate font-medium text-foreground" title={value}>
        {value}
      </dd>
    </div>
  )
}

function DocumentHealthLoading() {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <span className="sr-only">正在加载文档健康数据</span>
      <div className="h-24 animate-pulse rounded-md border border-border bg-muted/40 motion-reduce:animate-none" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="h-24 animate-pulse rounded-md border border-border bg-muted/40 motion-reduce:animate-none"
          />
        ))}
      </div>
    </div>
  )
}

function HealthMetric({
  detail,
  icon: Icon,
  label,
  tone,
  value,
}: Readonly<{
  detail: string
  icon: LucideIcon
  label: string
  tone: HealthTone
  value: string
}>) {
  const ToneIcon = tone === 'ok' ? CheckCircle2 : tone === 'bad' ? AlertTriangle : CircleMinus

  return (
    <div className="flex min-w-0 items-start justify-between gap-3 bg-card p-4">
      <div className="min-w-0">
        <dt className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon className="size-4 text-primary" aria-hidden="true" />
          {label}
        </dt>
        <dd className="mt-2 text-xl font-semibold tabular-nums text-foreground">{value}</dd>
        <p className="mt-1 truncate text-xs text-muted-foreground" title={detail}>
          {detail}
        </p>
      </div>
      <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-md border', toneClassName(tone))}>
        <ToneIcon className="size-4" aria-hidden="true" />
      </span>
    </div>
  )
}

function HealthDetails({
  badge,
  children,
  description,
  icon: Icon,
  last = false,
  title,
  tone,
}: Readonly<{
  badge: string
  children: React.ReactNode
  description: string
  icon: LucideIcon
  last?: boolean
  title: string
  tone: HealthTone
}>) {
  return (
    <details className={cn('group', !last && 'border-b border-border')}>
      <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-primary">
          <Icon className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
        <Badge variant="secondary" className={cn('hidden shrink-0 border sm:inline-flex', toneClassName(tone))}>
          {badge}
        </Badge>
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none"
          aria-hidden="true"
        />
      </summary>
      <div className="border-t border-border bg-muted/15 p-4">{children}</div>
    </details>
  )
}

function FactsGrid({
  children,
  className,
}: Readonly<{
  children: React.ReactNode
  className?: string
}>) {
  return (
    <dl className={cn('grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4', className)}>
      {children}
    </dl>
  )
}

function Fact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="min-w-0 border-t border-border pt-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium leading-6 text-foreground" title={value}>
        {value}
      </dd>
    </div>
  )
}
