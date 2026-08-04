'use client'

import type { Citation, EvidenceRetrieveResponse } from '@/types'

import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  RotateCcw,
  Search,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { AuthImage, AuthImageLink } from '@/components/auth-image'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { QueryErrorState } from '@/components/ui/query-error-state'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { datasetApi, ragApi } from '@/lib/api'
import { formatApiError } from '@/lib/api-errors'
import { resolveSafeCitationImageUrl } from '@/lib/citation-images'
import { queryKeys } from '@/lib/query-keys'
import { cn, detachPromise } from '@/lib/utils'

type RetrievalProfile = 'recall50' | 'coverage80' | 'recall20'
type JsonRecord = Record<string, unknown>

type ResultContext = {
  datasetId?: string
  profile: RetrievalProfile
  query: string
}

const DATASET_ALL = '__all__'

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
  } finally {
    URL.revokeObjectURL(url)
  }
}

function scoreLabel(citation: Citation): string {
  const raw = citation.retrieval_score
    ?? citation.rerank_score
    ?? citation.relevance_score
    ?? citation.vector_score
    ?? citation.bm25_score
    ?? 0
  const number = Number(raw)
  return Number.isFinite(number) ? number.toFixed(4) : '0.0000'
}

function titleForCitation(citation: Citation, fallbackTitle: string): string {
  const parts: string[] = []
  if (citation.document_name) parts.push(citation.document_name)
  if (typeof citation.page_number === 'number') parts.push(`第 ${citation.page_number} 页`)
  if (typeof citation.chunk_index === 'number' && citation.page_number == null) {
    parts.push(`第 ${citation.chunk_index + 1} 个分块`)
  }
  return parts.join(' · ') || fallbackTitle
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function toOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function toOptionalNumber(value: unknown): number | undefined {
  const next = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(next) ? next : undefined
}

function toOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function toCitation(value: unknown): Citation | null {
  if (!isRecord(value)) return null
  const document_id = typeof value.document_id === 'string' ? value.document_id : ''
  const document_name = typeof value.document_name === 'string' ? value.document_name : ''
  const chunk_content = typeof value.chunk_content === 'string' ? value.chunk_content : ''
  const relevance_score =
    typeof value.relevance_score === 'number'
      ? value.relevance_score
      : Number(value.relevance_score ?? 0) || 0
  if (!document_id) return null

  const citation: Citation = {
    document_id,
    document_name: document_name || '未命名文档',
    chunk_content,
    relevance_score,
  }
  citation.chunk_id = toOptionalString(value.chunk_id)
  citation.page_number = toOptionalNumber(value.page_number)
  citation.chunk_index = toOptionalNumber(value.chunk_index)
  citation.header_path = toOptionalString(value.header_path)
  citation.has_image = toOptionalBoolean(value.has_image)
  citation.img_url = toOptionalString(value.img_url)
  return citation
}

function formatMetric(value: unknown, digits = 4): string {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number.toFixed(digits) : '—'
}

function formatElapsed(value: unknown): string {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? `${number.toFixed(2)} 秒` : '—'
}

function abstainReasonLabel(reason: string | null | undefined): string {
  const labels: Record<string, string> = {
    citations_lt_min: '可用引用数量不足',
    must_recall_failed: '未命中必须召回的内容',
    no_docs: '当前范围没有可检索文档',
    no_rounds: '没有完成有效检索',
    out_of_scope: '问题超出当前知识范围',
    parse_quality_gate_strict: '文档解析质量未达到要求',
    top_relevance_lt_min: '最高相关度未达到要求',
  }
  return labels[String(reason || '').trim()] || '现有证据不足'
}

function resultStatus(result: EvidenceRetrieveResponse) {
  if (result.has_evidence) {
    return {
      label: '找到可用证据',
      description: '当前引用可以用于核对回答。',
      tone: 'success' as const,
      icon: CheckCircle2,
    }
  }
  if (result.abstain_triggered) {
    return {
      label: '建议拒绝回答',
      description: abstainReasonLabel(result.abstain_reason),
      tone: 'warning' as const,
      icon: AlertTriangle,
    }
  }
  return {
    label: '没有找到可用证据',
    description: '可以调整问题、知识范围或检索强度后重试。',
    tone: 'secondary' as const,
    icon: AlertTriangle,
  }
}

export function EvidenceWorkbench() {
  const t = useTranslations('EvidenceWorkbench')
  const [datasetScope, setDatasetScope] = useState<string>(DATASET_ALL)
  const [query, setQuery] = useState('')
  const [profile, setProfile] = useState<RetrievalProfile>('recall50')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<EvidenceRetrieveResponse | null>(null)
  const [resultContext, setResultContext] = useState<ResultContext | null>(null)
  const datasetId = datasetScope === DATASET_ALL ? undefined : datasetScope

  const datasetsQuery = useQuery({
    queryKey: queryKeys.datasets.exhaustive({ purpose: 'evidence-workbench' }),
    queryFn: () => datasetApi.listAll(),
  })
  const datasets = useMemo(() => datasetsQuery.data || [], [datasetsQuery.data])
  const datasetOptions = useMemo(() => {
    const options = datasets.map((dataset) => ({
      id: String(dataset.id),
      name: dataset.name || '未命名知识库',
    }))
    options.sort((left, right) => left.name.localeCompare(right.name))
    return options
  }, [datasets])

  const reset = useCallback(() => {
    setError(null)
    setResult(null)
    setResultContext(null)
  }, [])

  const run = useCallback(async () => {
    const normalizedQuery = query.trim()
    if (!normalizedQuery) return

    const requestContext: ResultContext = {
      datasetId,
      profile,
      query: normalizedQuery,
    }
    setRunning(true)
    setError(null)
    setResult(null)
    setResultContext(null)

    try {
      const response = await ragApi.retrieveEvidence({
        query: normalizedQuery,
        history: [],
        dataset_id: datasetId,
        document_ids: [],
        rag_config: {
          retrieval_profile: profile,
          max_tokens: 2000,
          retrieval_mode: 'hybrid',
          alpha: 0.6,
          enable_weight_rerank: true,
          vector_weight: 0.6,
          keyword_weight: 0.4,
          use_graph: false,
          visible_evidence_only: false,
          answer_mode: 'llm',
        },
      })

      if (!response) throw new Error('empty evidence response')
      setResult(response)
      setResultContext(requestContext)
      if (response.has_evidence) {
        toast.success(t('toasts.foundEvidence'))
      } else if (response.abstain_triggered) {
        toast.warning(t('toasts.abstainTriggered'))
      } else {
        toast.message(t('toasts.noEvidence'))
      }
    } catch (requestError: unknown) {
      setError(formatApiError(requestError, t('errors.retrieveFailed')))
    } finally {
      setRunning(false)
    }
  }, [datasetId, profile, query, t])

  const exportPack = useCallback(() => {
    if (!result || !resultContext) return

    const exportedAt = new Date().toISOString()
    const safeTimestamp = exportedAt.replaceAll(/[:.]/g, '-')
    const datasetName = resultContext.datasetId || 'all'
    const payload = {
      version: 1,
      dataset_id: resultContext.datasetId || null,
      query: resultContext.query,
      retrieval_profile: resultContext.profile,
      query_for_retrieval: result.query_for_retrieval || resultContext.query,
      has_evidence: Boolean(result.has_evidence),
      abstain_triggered: Boolean(result.abstain_triggered),
      abstain_reason: result.abstain_reason ?? null,
      citations: result.citations || [],
      metrics: result.metrics || null,
      exported_at: exportedAt,
    }

    downloadJson(`evidence-pack-${datasetName}-${safeTimestamp}.json`, payload)
    toast.success(t('toasts.exportedPack'))
  }, [result, resultContext, t])

  const citations = useMemo(() => {
    const raw = result?.citations
    if (!Array.isArray(raw)) return []
    return raw.map(toCitation).filter((citation): citation is Citation => citation !== null)
  }, [result?.citations])
  const metrics = isRecord(result?.metrics) ? result.metrics : null
  const status = result ? resultStatus(result) : null
  const StatusIcon = status?.icon

  const changeDataset = (value: string) => {
    setDatasetScope(String(value))
    reset()
  }

  const changeProfile = (value: string) => {
    setProfile(value as RetrievalProfile)
    reset()
  }

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-border bg-card p-4" aria-labelledby="evidence-query-title">
        <div className="flex flex-col gap-4">
          <div>
            <h2 id="evidence-query-title" className="text-base font-semibold text-foreground">
              验证问题
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              选择知识范围和检索强度，再输入需要核对的问题。
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(12rem,18rem)]">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="evidence-dataset">{t('controls.datasetScope')}</Label>
              <Select
                value={datasetScope}
                onValueChange={changeDataset}
                disabled={running || (datasetsQuery.isPending && !datasetsQuery.data)}
              >
                <SelectTrigger id="evidence-dataset">
                  <SelectValue placeholder={t('controls.datasetPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DATASET_ALL}>{t('controls.allDocuments')}</SelectItem>
                  {datasetOptions.map((dataset) => (
                    <SelectItem key={dataset.id} value={dataset.id}>
                      {dataset.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {datasetsQuery.isPending ? (
                <p className="text-xs text-muted-foreground">{t('controls.loadingDatasets')}</p>
              ) : null}
            </div>

            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="evidence-profile">{t('controls.profile')}</Label>
              <Select value={profile} onValueChange={changeProfile} disabled={running}>
                <SelectTrigger id="evidence-profile">
                  <SelectValue placeholder={t('controls.profilePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recall50">{t('profiles.recall50')}</SelectItem>
                  <SelectItem value="coverage80">{t('profiles.coverage80')}</SelectItem>
                  <SelectItem value="recall20">{t('profiles.recall20')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {datasetsQuery.error && !datasetsQuery.data ? (
            <QueryErrorState
              title="知识范围加载失败"
              description={formatApiError(
                datasetsQuery.error,
                '暂时无法读取知识库列表。请重新加载。'
              )}
              onRetry={() => {
                void datasetsQuery.refetch()
              }}
              retrying={datasetsQuery.isFetching}
              className="py-3"
            />
          ) : null}

          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="evidence-query">{t('controls.query')}</Label>
            <Textarea
              id="evidence-query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('controls.queryPlaceholder')}
              className="min-h-24 resize-y"
              disabled={running}
            />
          </div>

          {error ? (
            <div role="alert" className="rounded-md border border-destructive/25 bg-destructive/5 p-3 text-sm leading-6 text-destructive">
              {error}
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            <Button type="button" variant="ghost" className="h-9" onClick={reset} disabled={running || (!result && !error)}>
              <RotateCcw className="size-4" aria-hidden="true" />
              {t('actions.reset')}
            </Button>
            <Button type="button" variant="outline" className="h-9" onClick={exportPack} disabled={!result || !resultContext || running}>
              <Download className="size-4" aria-hidden="true" />
              {t('actions.export')}
            </Button>
            <Button type="button" className="h-9" onClick={() => detachPromise(run())} disabled={!query.trim() || running}>
              {running ? (
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : (
                <Search className="size-4" aria-hidden="true" />
              )}
              {running ? t('actions.searching') : t('actions.search')}
            </Button>
          </div>
        </div>
      </section>

      {result && status && StatusIcon ? (
        <section className="overflow-hidden rounded-md border border-border bg-card" aria-labelledby="evidence-result-title">
          <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-md border',
                status.tone === 'success' && 'border-success/25 bg-success/5 text-success',
                status.tone === 'warning' && 'border-warning/25 bg-warning/5 text-warning',
                status.tone === 'secondary' && 'border-border bg-muted text-muted-foreground'
              )}>
                <StatusIcon className="size-4" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2 id="evidence-result-title" className="text-base font-semibold text-foreground">
                  {status.label}
                </h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{status.description}</p>
              </div>
            </div>
            <Badge variant={status.tone}>{citations.length} 条引用</Badge>
          </div>

          <dl className="grid gap-px bg-border sm:grid-cols-3">
            <ResultMetric label={t('results.summary.topRelevanceScore')} value={formatMetric(metrics?.top_relevance_score)} />
            <ResultMetric label={t('results.summary.retrievalElapsed')} value={formatElapsed(metrics?.retrieval_elapsed_sec)} />
            <ResultMetric label={t('results.summary.citations')} value={String(citations.length)} />
          </dl>

          <details className="border-t border-border">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
              查看本次检索信息
            </summary>
            <dl className="grid gap-4 border-t border-border bg-muted/15 p-4 sm:grid-cols-2">
              <ResultFact label="实际检索问题" value={result.query_for_retrieval || resultContext?.query || '—'} />
              <ResultFact label="知识范围" value={resultContext?.datasetId ? '已选知识库' : '全部可访问文档'} />
              <ResultFact label="检索强度" value={t(`profiles.${resultContext?.profile || 'recall50'}`)} />
              <ResultFact label="拒答原因" value={result.abstain_triggered ? abstainReasonLabel(result.abstain_reason) : '无需拒答'} />
            </dl>
          </details>

          <div className="border-t border-border p-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">{t('results.citations.title')}</h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {citations.length ? t('results.citations.hitsHint') : t('results.citations.emptyHits')}
              </p>
            </div>

            {citations.length ? (
              <div className="mt-3 max-h-[36rem] divide-y divide-border overflow-auto border-y border-border">
                {citations.map((citation) => {
                  const content = String(citation.chunk_content || '')
                  const safeImageUrl = citation.has_image && citation.img_url
                    ? resolveSafeCitationImageUrl(citation.img_url)
                    : null
                  const citationTitle = titleForCitation(citation, t('results.citations.fallbackTitle'))
                  return (
                    <article
                      key={`${String(citation.document_id || '')}:${String(citation.chunk_id || '')}:${String(citation.page_number ?? '')}`}
                      className="py-4 first:pt-3 last:pb-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h4 className="truncate text-sm font-medium text-foreground" title={citationTitle}>
                            {citationTitle}
                          </h4>
                          {citation.header_path ? (
                            <p className="mt-1 truncate text-xs text-muted-foreground" title={String(citation.header_path)}>
                              {citation.header_path}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          {safeImageUrl ? (
                            <AuthImageLink
                              src={safeImageUrl}
                              className="relative h-10 w-14 shrink-0 overflow-hidden rounded-md border border-border bg-muted"
                              title="查看引用图片"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <AuthImage
                                src={safeImageUrl}
                                alt="引用内容预览"
                                fill
                                unoptimized
                                sizes="56px"
                                className="object-cover"
                              />
                            </AuthImageLink>
                          ) : null}
                          <div className="text-right">
                            <div className="text-xs text-muted-foreground">{t('results.citations.scoreLabel')}</div>
                            <div className="mt-0.5 text-sm font-medium tabular-nums text-foreground">{scoreLabel(citation)}</div>
                          </div>
                        </div>
                      </div>

                      {content ? (
                        <p className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap text-sm leading-6 text-foreground">
                          {content}
                        </p>
                      ) : (
                        <p className="mt-3 text-sm text-muted-foreground">{t('results.citations.emptyContent')}</p>
                      )}
                    </article>
                  )
                })}
              </div>
            ) : (
              <div className="mt-3 rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                {t('results.citations.noCitations')}
              </div>
            )}
          </div>
        </section>
      ) : null}
    </div>
  )
}

function ResultMetric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="bg-card p-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  )
}

function ResultFact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="min-w-0 border-t border-border pt-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm leading-6 text-foreground">{value}</dd>
    </div>
  )
}
