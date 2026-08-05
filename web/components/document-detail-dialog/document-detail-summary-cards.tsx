'use client'

import { Copy, FileText, Hash, Shield } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { IconButton } from '@/components/ui/icon-button'
import { Panel } from '@/components/ui/panel'
import { cn } from '@/lib/utils'

type AnalyticsLike = {
  char_count?: unknown
  page_count?: unknown
  table_count?: unknown
  image_count?: unknown
}

type PipelineEffectiveLike = {
  chunk_size?: unknown
  chunk_overlap?: unknown
  chunk_vector_enabled?: unknown
  bm25_index_enabled?: unknown
}

type DocumentDetailSummaryCardsProps = Readonly<{
  parserLabel: string | null
  parserBackend: string
  requestedParserBackend: string
  chunkStrategyLabel: string | null
  chunkStrategy: string
  analyticsRaw: AnalyticsLike
  governanceEnabled: boolean
  governanceRulesApplied: unknown
  governanceChangedDocuments: unknown
  governanceDroppedDocuments: unknown
  governanceRulePacks: string[]
  viewingPipelineHash: string
  activePipelineHash: string
  lastPipelineHash: string
  pipelineEffective: PipelineEffectiveLike
  onCopyPipelineHash: (hash: string) => void
}>

function TraceRow({ label, value, mono }: Readonly<{ label: string; value: string; mono?: boolean }>) {
  const display = value?.trim?.() ? value : '-'

  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('min-w-0 truncate text-foreground', mono ? 'font-mono' : null)} title={display}>
        {display}
      </span>
    </div>
  )
}

function traceValue(value: unknown): string {
  if (value == null || value === '') return '-'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value)
  }
  return '-'
}

export function DocumentDetailSummaryCards({
  parserLabel,
  parserBackend,
  requestedParserBackend,
  chunkStrategyLabel,
  chunkStrategy,
  analyticsRaw,
  governanceEnabled,
  governanceRulesApplied,
  governanceChangedDocuments,
  governanceDroppedDocuments,
  governanceRulePacks,
  viewingPipelineHash,
  activePipelineHash,
  lastPipelineHash,
  pipelineEffective,
  onCopyPipelineHash,
}: DocumentDetailSummaryCardsProps) {
  const t = useTranslations('DocumentDetailDialog')

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Panel className="rounded-lg">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-primary/10 text-primary">
              <FileText className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">{t('cards.parse.title')}</div>
              <div className="text-xs text-muted-foreground truncate">{parserLabel || parserBackend || '-'}</div>
            </div>
          </div>
        </div>
        <div className="mt-3 space-y-1.5">
          <TraceRow label="解析方式" value={traceValue(parserBackend)} mono />
          <TraceRow label="请求方式" value={traceValue(requestedParserBackend)} mono />
          <TraceRow label="字符数" value={traceValue(analyticsRaw?.char_count)} mono />
          <TraceRow label="页数" value={traceValue(analyticsRaw?.page_count)} mono />
          <TraceRow label="表格数" value={traceValue(analyticsRaw?.table_count)} mono />
          <TraceRow label="图片数" value={traceValue(analyticsRaw?.image_count)} mono />
        </div>
      </Panel>

      <Panel className="rounded-lg">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-success/10 text-success">
              <Shield className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">{t('cards.governance.title')}</div>
              <div className="text-xs text-muted-foreground truncate">
                {governanceEnabled ? t('cards.governance.enabled') : t('cards.governance.disabled')}
              </div>
            </div>
          </div>
          {governanceRulePacks.length ? (
            <span className="rounded-md border border-border/60 bg-muted/60 px-2 py-1 text-[11px] text-muted-foreground">
              {t('cards.governance.packsCount', { count: governanceRulePacks.length })}
            </span>
          ) : null}
        </div>
        <div className="mt-3 space-y-1.5">
          <TraceRow label="已应用规则" value={traceValue(governanceRulesApplied)} mono />
          <TraceRow label="有变化的文档" value={traceValue(governanceChangedDocuments)} mono />
          <TraceRow label="已过滤文档" value={traceValue(governanceDroppedDocuments)} mono />
          <TraceRow
            label="规则包"
            value={governanceRulePacks.length ? governanceRulePacks.slice(0, 4).join(', ') : '-'}
          />
        </div>
      </Panel>

      <Panel className="rounded-lg">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-info/10 text-info">
              <Hash className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">{t('cards.chunking.title')}</div>
              <div className="text-xs text-muted-foreground truncate">{chunkStrategyLabel || chunkStrategy || '-'}</div>
            </div>
          </div>
          {viewingPipelineHash ? (
            <IconButton
              label={t('cards.chunking.copyPipelineHash')}
              variant="ghost"
              className="h-9 w-9 text-muted-foreground hover:text-foreground"
              onClick={() => onCopyPipelineHash(String(viewingPipelineHash || ''))}
            >
              <Copy className="h-4 w-4" />
            </IconButton>
          ) : null}
        </div>
        <div className="mt-3 space-y-1.5">
          <TraceRow label="当前版本" value={traceValue(viewingPipelineHash)} mono />
          <TraceRow label="生效版本" value={traceValue(activePipelineHash)} mono />
          <TraceRow label="最近版本" value={traceValue(lastPipelineHash)} mono />
          <TraceRow label="切块大小" value={traceValue(pipelineEffective?.chunk_size)} mono />
          <TraceRow label="切块重叠" value={traceValue(pipelineEffective?.chunk_overlap)} mono />
          <TraceRow label="向量索引" value={pipelineEffective?.chunk_vector_enabled ? '已启用' : '未启用'} />
          <TraceRow label="关键词索引" value={pipelineEffective?.bm25_index_enabled ? '已启用' : '未启用'} />
        </div>
      </Panel>
    </div>
  )
}
