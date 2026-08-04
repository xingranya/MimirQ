/**
 * 展示文档入库前的规则匹配、预处理和内容治理结果。
 * 用户可以在这里核对变化、应用建议，或转到数据治理继续调整。
 */
'use client'

import { useMemo, type ReactNode } from 'react'
import {
  ArrowUpRight,
  ClipboardCopy,
  Download,
  FileText,
  Settings2,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { isJsonObject } from '@/components/chunk-preview/utils/metadata'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useRouter } from '@/i18n/navigation'
import { getChunkStrategyLabel } from '@/lib/chunk-strategies'
import { getParserLabel } from '@/lib/parser-options'
import { toTrimmedPrimitiveString } from '@/lib/primitive-text'
import { cn, formatFileSize } from '@/lib/utils'
import type {
  DocumentPipelineOptions,
  GovernanceIssue,
  IngestionPreviewResponse,
  PreprocessStepLog,
} from '@/types'

function toShortNote(note: unknown, maxChars: number = 180): string {
  const value = toTrimmedPrimitiveString(note)
  if (!value) return ''
  if (value.length <= maxChars) return value
  return `${value.slice(0, Math.max(0, maxChars - 3))}...`
}

function downloadJsonObject(value: unknown, filename: string) {
  const safeName = String(filename || 'export.json')
    .trim()
    .replaceAll(/[\\/:*?"<>|]+/g, '_')
    .slice(0, 128)
  const blob = new Blob([JSON.stringify(value ?? {}, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = safeName.endsWith('.json') ? safeName : `${safeName}.json`
  anchor.click()
  globalThis.window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function countTotalHits(entries: Record<string, number> | null | undefined): number {
  if (!entries) return 0
  return Object.values(entries).reduce(
    (total, value) => total + (Number(value) || 0),
    0
  )
}

function SectionPanel({
  title,
  action,
  children,
  className,
}: Readonly<{
  title: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}>) {
  return (
    <section className={cn('rounded-md border border-border bg-background', className)}>
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

function StatusBadge({
  tone,
  children,
}: Readonly<{
  tone: 'neutral' | 'success' | 'warning' | 'danger'
  children: ReactNode
}>) {
  return (
    <span
      className={cn(
        'inline-flex min-h-7 items-center rounded-md border px-2 text-xs font-medium',
        tone === 'success' && 'border-success/25 bg-success/10 text-success',
        tone === 'warning' && 'border-warning/25 bg-warning/10 text-warning',
        tone === 'danger' &&
          'border-destructive/25 bg-destructive/10 text-destructive',
        tone === 'neutral' && 'border-border bg-muted/30 text-muted-foreground'
      )}
    >
      {children}
    </span>
  )
}

function EmptyMessage({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="flex min-h-32 items-center justify-center px-4 py-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}

function getIssueTone(severity: string): 'neutral' | 'warning' | 'danger' {
  if (severity === 'error') return 'danger'
  if (severity === 'warning') return 'warning'
  return 'neutral'
}

export function IngestionPreviewDetailsDialog({
  open,
  onOpenChange,
  preview,
  datasetId,
  onApplyPipelinePatch,
}: Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
  preview: IngestionPreviewResponse | null
  datasetId?: string
  onApplyPipelinePatch?: (patch: DocumentPipelineOptions) => void
}>) {
  const router = useRouter()
  const t = useTranslations('ChunkPreview')
  const ruleTitle = useMemo(() => {
    if (!preview) return ''
    if (!preview.rule?.matched) return t('ingestionPreview.rule.unmatched')
    return (
      preview.rule?.rule_name ||
      preview.rule?.rule_id ||
      t('ingestionPreview.rule.matched')
    )
  }, [preview, t])

  const preprocessSummary = useMemo(() => {
    if (!preview?.preprocess) return null
    const preprocess = preview.preprocess
    return {
      changed: Boolean(preprocess.changed),
      sizeBefore: Number(preprocess.size_before || 0),
      sizeAfter: Number(preprocess.size_after || 0),
      warnings: Array.isArray(preprocess.warnings)
        ? preprocess.warnings.filter(Boolean).map(String)
        : [],
      steps: Array.isArray(preprocess.steps) ? preprocess.steps : [],
    }
  }, [preview])

  const cleanSummary = useMemo(() => {
    const clean = preview?.clean
    if (!clean) return null
    const piiHits = clean.pii_hits ?? null
    const secretsHits = clean.secrets_hits ?? null
    return {
      changed: Boolean(clean.changed),
      dropped: Boolean(clean.dropped),
      dropReason: (clean.drop_reason || '').trim() || null,
      appliedRules: Number(clean.applied_rules || 0),
      inputChars: Number(clean.input_chars || 0),
      outputChars: Number(clean.output_chars || 0),
      inputLines: Number(clean.input_lines || 0),
      outputLines: Number(clean.output_lines || 0),
      added: Number(clean.added_lines || 0),
      removed: Number(clean.removed_lines || 0),
      changedLines: Number(clean.changed_lines || 0),
      urlsChanged: Number(clean.urls_changed || 0),
      paragraphsDropped: Number(clean.paragraphs_dropped || 0),
      referencesRemovedLines: Number(clean.references_removed_lines || 0),
      piiTotal: countTotalHits(piiHits),
      secretsTotal: countTotalHits(secretsHits),
      diffTruncated: Boolean(clean.diff_truncated),
    }
  }, [preview?.clean])

  const issues = useMemo(() => {
    const list = preview?.clean?.issues ?? []
    return Array.isArray(list) ? list : []
  }, [preview?.clean?.issues])

  const applyPatch = (patch: DocumentPipelineOptions, successMessage: string) => {
    if (!onApplyPipelinePatch) {
      toast.message(t('ingestionPreview.clean.patch.missingHandler'))
      return
    }
    onApplyPipelinePatch(patch)
    toast.success(successMessage)
  }

  const suggestedPatch = preview?.clean?.suggested_pipeline_patch ?? null
  const hasSuggestedPatch = Boolean(
    suggestedPatch && Object.keys(suggestedPatch).length
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid h-[min(92dvh,860px)] w-[calc(100vw-1.5rem)] max-w-4xl grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-lg p-0">
        <DialogHeader className="border-b border-border bg-background px-4 py-4 pr-14 sm:px-6 sm:pr-14">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <DialogTitle className="flex items-center gap-2 text-base">
                <Settings2 className="h-5 w-5 shrink-0 text-primary" />
                {t('ingestionPreview.title')}
              </DialogTitle>
              <DialogDescription className="mt-2 space-y-1 text-sm">
                <span className="block text-foreground">{ruleTitle || '—'}</span>
                {preview ? (
                  <span className="block text-xs text-muted-foreground">
                    {t('ingestionPreview.meta.parserLabel')}：
                    {getParserLabel(preview.rule?.parser_backend)}
                    <span aria-hidden="true"> · </span>
                    {t('ingestionPreview.meta.strategyLabel')}：
                    {getChunkStrategyLabel(preview.rule?.chunk_strategy)}
                  </span>
                ) : null}
                {preview?.rule?.governance_profile_ref ? (
                  <span className="block text-xs text-muted-foreground">
                    {t('ingestionPreview.meta.governanceProfileLabel')}：
                    {preview.rule.governance_profile_ref}
                  </span>
                ) : null}
                <span className="block text-xs text-muted-foreground">
                  {t('ingestionPreview.meta.description')}
                </span>
              </DialogDescription>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 w-fit shrink-0 gap-2 px-3 text-sm"
              onClick={() => {
                const params = new URLSearchParams()
                params.set('from', 'chunk-preview')
                params.set('tab', 'clean')
                const normalizedDatasetId = String(datasetId || '').trim()
                if (normalizedDatasetId) {
                  params.set('dataset_id', normalizedDatasetId)
                }
                const profileReference = String(
                  preview?.rule?.governance_profile_ref || ''
                ).trim()
                if (profileReference) {
                  params.set('governance_profile_ref', profileReference)
                }
                router.push(`/data-governance?${params.toString()}`)
                onOpenChange(false)
              }}
              disabled={!preview}
            >
              {t('ingestionPreview.actions.openGovernance')}
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </DialogHeader>

        <Tabs
          defaultValue="preprocess"
          className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] bg-background"
        >
          <div className="overflow-x-auto border-b border-border px-4 py-2 sm:px-6">
            <TabsList className="h-9 w-max min-w-full justify-start gap-1 rounded-md bg-muted/40 p-1">
              {[
                ['preprocess', t('ingestionPreview.tabs.preprocess')],
                ['clean', t('ingestionPreview.tabs.governance')],
                ['diff', t('ingestionPreview.tabs.diff')],
                [
                  'issues',
                  issues.length
                    ? t('ingestionPreview.tabs.issuesWithCount', {
                        count: issues.length,
                      })
                    : t('ingestionPreview.tabs.issues'),
                ],
                ['explain', t('ingestionPreview.tabs.explain')],
              ].map(([value, label]) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  disabled={!preview}
                  className="h-7 rounded-md px-3 py-1 text-sm data-[state=active]:bg-background data-[state=active]:text-primary"
                >
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent
            value="preprocess"
            className="m-0 min-h-0 overflow-y-auto px-4 py-4 sm:px-6"
          >
            {preprocessSummary ? (
              <div className="space-y-4">
                <SectionPanel
                  title={t('ingestionPreview.preprocess.title')}
                  action={
                    <StatusBadge
                      tone={preprocessSummary.changed ? 'warning' : 'success'}
                    >
                      {preprocessSummary.changed
                        ? t('ingestionPreview.preprocess.status.changed')
                        : t('ingestionPreview.preprocess.status.noChange')}
                    </StatusBadge>
                  }
                >
                  <dl className="grid gap-x-6 gap-y-3 px-4 py-4 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        {t('ingestionPreview.preprocess.sizeLabel')}
                      </dt>
                      <dd className="mt-1 tabular-nums text-foreground">
                        {formatFileSize(preprocessSummary.sizeBefore)}
                        <span className="mx-2 text-muted-foreground">→</span>
                        {formatFileSize(preprocessSummary.sizeAfter)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        {t('ingestionPreview.preprocess.warningsLabel')}
                      </dt>
                      <dd className="mt-1 tabular-nums text-foreground">
                        {preprocessSummary.warnings.length}
                      </dd>
                    </div>
                  </dl>
                </SectionPanel>

                <div className="grid gap-4 lg:grid-cols-2">
                  <SectionPanel title={t('ingestionPreview.preprocess.stepsTitle')}>
                    {preprocessSummary.steps.length ? (
                      <ScrollArea className="h-64">
                        <div className="divide-y divide-border">
                          {preprocessSummary.steps.map(
                            (step: PreprocessStepLog, index: number) => {
                              const id =
                                String(step.id || '').trim() || `step_${index + 1}`
                              const applied = Boolean(step.applied)
                              const changed = Boolean(step.changed)
                              return (
                                <div key={id} className="px-4 py-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="text-sm font-medium text-foreground">
                                      {id}
                                    </span>
                                    <div className="flex flex-wrap gap-2">
                                      <StatusBadge tone={applied ? 'success' : 'neutral'}>
                                        {applied
                                          ? t(
                                              'ingestionPreview.preprocess.stepStatus.applied'
                                            )
                                          : t(
                                              'ingestionPreview.preprocess.stepStatus.skipped'
                                            )}
                                      </StatusBadge>
                                      <StatusBadge tone={changed ? 'warning' : 'neutral'}>
                                        {changed
                                          ? t(
                                              'ingestionPreview.preprocess.stepChange.changed'
                                            )
                                          : t(
                                              'ingestionPreview.preprocess.stepChange.same'
                                            )}
                                      </StatusBadge>
                                    </div>
                                  </div>
                                  {step.note ? (
                                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                                      {toShortNote(step.note)}
                                    </p>
                                  ) : null}
                                </div>
                              )
                            }
                          )}
                        </div>
                      </ScrollArea>
                    ) : (
                      <EmptyMessage>
                        {t('ingestionPreview.preprocess.emptySteps')}
                      </EmptyMessage>
                    )}
                  </SectionPanel>

                  <SectionPanel title={t('ingestionPreview.preprocess.warningsTitle')}>
                    {preprocessSummary.warnings.length ? (
                      <ScrollArea className="h-64">
                        <ul className="divide-y divide-border">
                          {preprocessSummary.warnings.map((warning, index) => (
                            <li
                              key={`${warning}-${index}`}
                              className="px-4 py-3 text-sm leading-6 text-warning"
                            >
                              {warning}
                            </li>
                          ))}
                        </ul>
                      </ScrollArea>
                    ) : (
                      <EmptyMessage>
                        {t('ingestionPreview.preprocess.emptyWarnings')}
                      </EmptyMessage>
                    )}
                  </SectionPanel>
                </div>
              </div>
            ) : (
              <EmptyMessage>{t('ingestionPreview.states.noPreviewData')}</EmptyMessage>
            )}
          </TabsContent>

          <TabsContent
            value="clean"
            className="m-0 min-h-0 overflow-y-auto px-4 py-4 sm:px-6"
          >
            {cleanSummary ? (
              <div className="space-y-4">
                <SectionPanel
                  title={t('ingestionPreview.clean.title')}
                  action={
                    <StatusBadge
                      tone={
                        cleanSummary.dropped
                          ? 'danger'
                          : cleanSummary.changed
                            ? 'warning'
                            : 'success'
                      }
                    >
                      {cleanSummary.dropped
                        ? t('ingestionPreview.clean.status.dropped')
                        : cleanSummary.changed
                          ? t('ingestionPreview.clean.status.changed')
                          : t('ingestionPreview.clean.status.noChange')}
                    </StatusBadge>
                  }
                >
                  {cleanSummary.dropReason ? (
                    <div className="border-b border-border bg-destructive/5 px-4 py-3 text-sm text-destructive">
                      {t('ingestionPreview.clean.dropReasonLabel')}：
                      {cleanSummary.dropReason}
                    </div>
                  ) : null}
                  <dl className="grid gap-x-6 gap-y-4 px-4 py-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
                    {[
                      [
                        t('ingestionPreview.clean.metrics.chars'),
                        `${cleanSummary.inputChars} → ${cleanSummary.outputChars}`,
                      ],
                      [
                        t('ingestionPreview.clean.metrics.lines'),
                        `${cleanSummary.inputLines} → ${cleanSummary.outputLines}`,
                      ],
                      [
                        t('ingestionPreview.clean.metrics.rules'),
                        cleanSummary.appliedRules,
                      ],
                      [
                        t('ingestionPreview.clean.metrics.urls'),
                        cleanSummary.urlsChanged,
                      ],
                      [
                        t('ingestionPreview.clean.metrics.dropped'),
                        cleanSummary.paragraphsDropped,
                      ],
                      [
                        t('ingestionPreview.clean.metrics.refs'),
                        cleanSummary.referencesRemovedLines,
                      ],
                      [
                        t('ingestionPreview.clean.metrics.changedLines'),
                        `+${cleanSummary.added} / -${cleanSummary.removed} / ~${cleanSummary.changedLines}`,
                      ],
                      [
                        t('ingestionPreview.clean.metrics.diff'),
                        cleanSummary.diffTruncated
                          ? t('ingestionPreview.clean.metrics.diffTruncated')
                          : t('ingestionPreview.clean.metrics.diffFull'),
                      ],
                    ].map(([label, value]) => (
                      <div key={String(label)}>
                        <dt className="text-xs text-muted-foreground">{label}</dt>
                        <dd className="mt-1 tabular-nums text-foreground">{value}</dd>
                      </div>
                    ))}
                  </dl>

                  {cleanSummary.piiTotal > 0 || cleanSummary.secretsTotal > 0 ? (
                    <div className="border-t border-warning/25 bg-warning/5 px-4 py-3 text-sm">
                      <div className="flex flex-wrap gap-x-6 gap-y-2 text-warning">
                        {cleanSummary.piiTotal > 0 ? (
                          <span>
                            {t('ingestionPreview.clean.alerts.piiHits')}：
                            {cleanSummary.piiTotal}
                          </span>
                        ) : null}
                        {cleanSummary.secretsTotal > 0 ? (
                          <span>
                            {t('ingestionPreview.clean.alerts.secretsHits')}：
                            {cleanSummary.secretsTotal}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 leading-6 text-muted-foreground">
                        {t('ingestionPreview.clean.alerts.maskingHint')}
                      </p>
                    </div>
                  ) : null}
                </SectionPanel>

                {hasSuggestedPatch && suggestedPatch ? (
                  <SectionPanel
                    title={t('ingestionPreview.clean.patch.title')}
                    action={
                      <Button
                        type="button"
                        size="sm"
                        className="h-9 px-3 text-sm"
                        onClick={() =>
                          applyPatch(
                            suggestedPatch,
                            t('ingestionPreview.clean.patch.applied')
                          )
                        }
                        disabled={!onApplyPipelinePatch}
                      >
                        {t('ingestionPreview.clean.patch.apply')}
                      </Button>
                    }
                  >
                    <details className="group px-4 py-3">
                      <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                        {t('ingestionPreview.clean.patch.showDetails')}
                      </summary>
                      <pre className="mt-3 max-h-48 overflow-auto rounded-md bg-muted/40 p-3 text-xs leading-5 text-foreground">
                        {JSON.stringify(suggestedPatch, null, 2)}
                      </pre>
                    </details>
                  </SectionPanel>
                ) : null}
              </div>
            ) : (
              <EmptyMessage>{t('ingestionPreview.states.noPreviewData')}</EmptyMessage>
            )}
          </TabsContent>

          <TabsContent
            value="diff"
            className="m-0 min-h-0 overflow-y-auto px-4 py-4 sm:px-6"
          >
            <SectionPanel
              title={
                <span className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
                  {t('ingestionPreview.diff.title')}
                </span>
              }
              action={
                preview?.clean?.diff_unified ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9 gap-2 px-3 text-sm"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          String(preview.clean?.diff_unified || '')
                        )
                        toast.success(t('ingestionPreview.diff.copySuccess'))
                      } catch {
                        toast.error(t('ingestionPreview.diff.copyError'))
                      }
                    }}
                  >
                    <ClipboardCopy className="h-4 w-4" aria-hidden="true" />
                    {t('ingestionPreview.diff.copy')}
                  </Button>
                ) : undefined
              }
            >
              {preview?.clean?.diff_unified ? (
                <div>
                  <p
                    className={cn(
                      'border-b border-border px-4 py-3 text-sm',
                      preview.clean.diff_truncated
                        ? 'text-warning'
                        : 'text-muted-foreground'
                    )}
                  >
                    {preview.clean.diff_truncated
                      ? t('ingestionPreview.diff.diffTruncated')
                      : t('ingestionPreview.diff.diffFull')}
                  </p>
                  <pre className="max-h-[500px] overflow-auto bg-muted/30 p-4 text-xs leading-5 text-foreground">
                    {String(preview.clean.diff_unified)}
                  </pre>
                </div>
              ) : (
                <EmptyMessage>{t('ingestionPreview.diff.noDiff')}</EmptyMessage>
              )}
            </SectionPanel>
          </TabsContent>

          <TabsContent
            value="issues"
            className="m-0 min-h-0 overflow-y-auto px-4 py-4 sm:px-6"
          >
            <SectionPanel
              title={t('ingestionPreview.issues.title')}
              action={
                hasSuggestedPatch && suggestedPatch ? (
                  <Button
                    type="button"
                    size="sm"
                    className="h-9 px-3 text-sm"
                    onClick={() =>
                      applyPatch(
                        suggestedPatch,
                        t('ingestionPreview.issues.toasts.appliedAll')
                      )
                    }
                    disabled={!onApplyPipelinePatch}
                  >
                    {t('ingestionPreview.issues.actions.applyAll')}
                  </Button>
                ) : undefined
              }
            >
              {issues.length ? (
                <div className="divide-y divide-border">
                  {issues.map((issue: GovernanceIssue, index: number) => {
                    const code =
                      String(issue.code || '').trim() || `issue_${index + 1}`
                    const severity = String(issue.severity || 'info')
                    const count = Number(issue.count || 0)
                    const message = String(issue.message || '').trim() || code
                    const samples = Array.isArray(issue.samples)
                      ? issue.samples.filter(Boolean).map(String)
                      : []
                    const patch = issue.suggested_pipeline_patch ?? null
                    const patchKeys = patch ? Object.keys(patch) : []

                    return (
                      <article key={`${code}-${index}`} className="px-4 py-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <StatusBadge tone={getIssueTone(severity)}>
                                {severity === 'error'
                                  ? t('ingestionPreview.issues.severity.error')
                                  : severity === 'warning'
                                    ? t('ingestionPreview.issues.severity.warning')
                                    : t('ingestionPreview.issues.severity.info')}
                              </StatusBadge>
                              <span className="text-xs text-muted-foreground">
                                {t('ingestionPreview.issues.labels.code')}：{code}
                              </span>
                              <span className="text-xs tabular-nums text-muted-foreground">
                                {t('ingestionPreview.issues.labels.count')}：{count}
                              </span>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-foreground">
                              {message}
                            </p>
                          </div>
                          {patch && patchKeys.length ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-9 w-fit shrink-0 px-3 text-sm"
                              onClick={() =>
                                applyPatch(
                                  patch,
                                  t(
                                    'ingestionPreview.issues.toasts.appliedSuggestion',
                                    { code }
                                  )
                                )
                              }
                              disabled={!onApplyPipelinePatch}
                            >
                              {t('ingestionPreview.issues.actions.applySuggestion')}
                            </Button>
                          ) : null}
                        </div>

                        {samples.length ? (
                          <div className="mt-3">
                            <h4 className="text-xs font-medium text-muted-foreground">
                              {t('ingestionPreview.issues.labels.samples')}
                            </h4>
                            <ul className="mt-2 divide-y divide-border rounded-md border border-border">
                              {samples.slice(0, 4).map((sample: string, sampleIndex: number) => (
                                <li
                                  key={`${sample}-${sampleIndex}`}
                                  className="px-3 py-2 text-sm leading-6 text-muted-foreground"
                                >
                                  {toShortNote(sample, 240)}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}

                        {patch && patchKeys.length ? (
                          <details className="mt-3">
                            <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                              {t(
                                'ingestionPreview.issues.labels.suggestedPatchWithCount',
                                { count: patchKeys.length }
                              )}
                            </summary>
                            <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-muted/40 p-3 text-xs leading-5 text-foreground">
                              {JSON.stringify(patch, null, 2)}
                            </pre>
                          </details>
                        ) : null}
                      </article>
                    )
                  })}
                </div>
              ) : (
                <EmptyMessage>{t('ingestionPreview.issues.empty')}</EmptyMessage>
              )}
            </SectionPanel>
          </TabsContent>

          <TabsContent
            value="explain"
            className="m-0 min-h-0 overflow-y-auto px-4 py-4 sm:px-6"
          >
            <SectionPanel
              title={t('ingestionPreview.explain.title')}
              action={
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9 gap-2 px-3 text-sm"
                  onClick={() => {
                    const explanation = preview?.explain
                    if (!explanation) {
                      toast.error(t('ingestionPreview.explain.missingData'))
                      return
                    }
                    const snapshotValue =
                      isJsonObject(explanation) && 'snapshot' in explanation
                        ? explanation.snapshot ?? explanation
                        : explanation
                    const snapshotRecord = isJsonObject(snapshotValue)
                      ? snapshotValue
                      : null
                    const filename = snapshotRecord?.filename
                    const rawName = (
                      typeof filename === 'string' ? filename : 'ingestion-preview'
                    )
                      .trim()
                      .replaceAll(/[^a-zA-Z0-9_.-]+/g, '_')
                      .slice(0, 64)
                    downloadJsonObject(
                      snapshotValue,
                      `${rawName}.ingestion-preview.explain.json`
                    )
                    toast.success(t('ingestionPreview.explain.exportSuccess'))
                  }}
                  disabled={!preview?.explain}
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  {t('ingestionPreview.explain.exportJson')}
                </Button>
              }
            >
              <p className="border-b border-border px-4 py-3 text-sm leading-6 text-muted-foreground">
                {t('ingestionPreview.explain.description')}
              </p>
              {preview?.explain ? (
                <div>
                  <div className="border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground">
                    {t('ingestionPreview.explain.payloadLabel')}
                  </div>
                  <ScrollArea className="h-[460px]">
                    <pre className="whitespace-pre-wrap break-words bg-muted/30 p-4 text-xs leading-5 text-foreground">
                      {JSON.stringify(preview.explain, null, 2)}
                    </pre>
                  </ScrollArea>
                </div>
              ) : (
                <EmptyMessage>{t('ingestionPreview.explain.missingData')}</EmptyMessage>
              )}
            </SectionPanel>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
