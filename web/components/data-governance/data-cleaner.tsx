'use client'

import { useCallback, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, GitCompare, Info, Loader2, Sparkles, TextCursorInput, Undo, Wrench } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { pipelineApi, promptTemplateApi } from '@/lib/api'
import { formatApiError } from '@/lib/api-errors'
import { coerceOneOf } from '@/lib/one-of'
import { queryKeys } from '@/lib/query-keys'
import type {
  CleanPreviewRequest,
  CleanPreviewResponse,
  DocumentPipelineOptions,
  LLMCleanPreviewRequest,
} from '@/types'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { usePipelineOptions } from '@/contexts/pipeline-options-context'
import { PipelineOptionsPanel } from '@/components/pipeline-options-panel'
import { GovernanceProfileSelector } from '@/components/governance-profile-selector'
import { CleanPreviewRuleStatsPanel } from '@/components/governance-profiles/clean-preview-rule-stats-panel'
import { computeCleanPreviewImpact } from '@/lib/clean-preview-impact'

const SELECT_DEFAULT_VALUE = '__mimirq_default__'
const DATA_CLEANER_INPUT_FORMAT_VALUES = ['markdown', 'html'] as const

interface DataCleanerProps {
  content: string
  cleanedContent?: string
  onClean: (cleaned: string) => void
}

function getSeverityBadgeClass(severity: string) {
  if (severity === 'error') {
    return 'bg-destructive/10 text-destructive'
  }
  if (severity === 'warning') {
    return 'bg-warning/10 text-warning'
  }
  return 'bg-info/10 text-info'
}

export function DataCleaner({
  content,
  cleanedContent: _cleanedContent = '',
  onClean,
}: Readonly<DataCleanerProps>) {
  const t = useTranslations('DataCleaner')
  const { options, updateOption, setEnabled } = usePipelineOptions()
  const [previewDiff, setPreviewDiff] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  const [backendError, setBackendError] = useState<string | null>(null)
  const [backendInfo, setBackendInfo] = useState<string | null>(null)
  const [lastPreview, setLastPreview] = useState<CleanPreviewResponse | null>(null)
  const [inputFormat, setInputFormat] = useState<'markdown' | 'html'>('markdown')
  const [llmEnabled, setLlmEnabled] = useState(false)
  const [promptTemplateId, setPromptTemplateId] = useState<string>('')
  const impact = useMemo(() => computeCleanPreviewImpact(lastPreview), [lastPreview])

  const promptTemplatesQuery = useQuery({
    queryKey: queryKeys.prompts.list({ is_active: true, limit: 50 }),
    queryFn: async () => {
      const response = await promptTemplateApi.list({ is_active: true, limit: 50 })
      return response.items || []
    },
  })
  const promptTemplates = promptTemplatesQuery.data || []

  const handleApply = useCallback(async () => {
    setIsApplying(true)
    setBackendError(null)
    setBackendInfo(null)

    try {
      const opt = <T,>(value: T | null | undefined): T | undefined =>
        value ?? undefined

      const request: CleanPreviewRequest = {
        markdown: content,
        use_default_rules: true,
        rules: Array.isArray(options.governance_regex_rules) ? options.governance_regex_rules : [],
        include_diff: true,
        diff_max_lines: 2000,
        input_format: inputFormat,
        html_xpath: inputFormat === 'html' ? (options.governance_html_xpath || undefined) : undefined,
        normalize_line_endings: true,
        trim_trailing_spaces: true,
        remove_toc_lines: opt(options.governance_remove_toc_lines),
        remove_noise_lines: opt(options.governance_remove_noise_lines),
        remove_common_lines: opt(options.governance_remove_common_lines),
        unwrap_lines: opt(options.governance_unwrap_lines),
        remove_boilerplate: opt(options.governance_remove_boilerplate),
        remove_images: opt(options.governance_remove_images),
        extract_frontmatter: opt(options.governance_extract_frontmatter),
        strip_frontmatter: opt(options.governance_strip_frontmatter),
        detect_language: opt(options.governance_detect_language),
        language_min_chars: opt(options.governance_language_min_chars),
        normalize_urls: opt(options.governance_normalize_urls),
        normalize_urls_strip_tracking: opt(options.governance_normalize_urls_strip_tracking),
        drop_duplicate_paragraphs: opt(options.governance_drop_duplicate_paragraphs),
        drop_duplicate_paragraphs_min_occurrences: opt(
          options.governance_drop_duplicate_paragraphs_min_occurrences
        ),
        drop_duplicate_paragraphs_min_chars: opt(options.governance_drop_duplicate_paragraphs_min_chars),
        drop_duplicate_paragraphs_max_chars: opt(options.governance_drop_duplicate_paragraphs_max_chars),
        trim_references: opt(options.governance_trim_references),
        extract_keywords: opt(options.governance_extract_keywords),
        keywords_provider: opt(options.governance_keywords_provider),
        keywords_top_k: opt(options.governance_keywords_top_k),
        keywords_max_chars: opt(options.governance_keywords_max_chars),
        normalize_tables: opt(options.governance_normalize_tables),
        strip_code_line_numbers: opt(options.governance_strip_code_line_numbers),
        pii_anonymize: opt(options.governance_pii_anonymize),
        pii_mode: opt(options.governance_pii_mode),
        pii_mask: opt(options.governance_pii_mask),
        secrets_redact: opt(options.governance_secrets_redact),
        secrets_mode: opt(options.governance_secrets_mode),
        secrets_mask: opt(options.governance_secrets_mask),
        max_blank_lines: opt(options.governance_max_blank_lines),
        drop_outline_only: opt(options.governance_drop_outline_only),
        drop_outline_min_content_chars: opt(options.governance_drop_outline_min_content_chars),
        drop_outline_max_heading_ratio: opt(options.governance_drop_outline_max_heading_ratio),
        drop_low_density: opt(options.governance_drop_low_density),
        drop_low_density_threshold: opt(options.governance_drop_low_density_threshold),
        unwrap_max_line_length: opt(options.governance_unwrap_max_line_length),
        noise_min_chars: opt(options.governance_noise_min_chars),
        noise_ratio_threshold: opt(options.governance_noise_ratio_threshold),
        common_lines_min_occurrences: opt(options.governance_common_lines_min_docs),
      }

      const response = await pipelineApi.cleanPreview(request)
      setLastPreview(response)

      const info: string[] = []
      if (typeof response.input_lines === 'number' && typeof response.output_lines === 'number') {
        const removed = typeof response.removed_lines === 'number' ? response.removed_lines : 0
        const added = typeof response.added_lines === 'number' ? response.added_lines : 0
        const changedLines = typeof response.changed_lines === 'number' ? response.changed_lines : 0
        const inputChars = typeof response.input_chars === 'number' ? response.input_chars : content.length
        const outputChars =
          typeof response.output_chars === 'number' ? response.output_chars : (response.markdown || '').length

        info.push(
          t('info.cleaningStats', {
            inputLines: response.input_lines,
            outputLines: response.output_lines,
            removed,
            added,
            changedLines,
            inputChars,
            outputChars,
          })
        )
      }

      if (typeof response.urls_changed === 'number' && response.urls_changed > 0) {
        info.push(t('info.urlsChanged', { count: response.urls_changed }))
      }
      if (typeof response.paragraphs_dropped === 'number' && response.paragraphs_dropped > 0) {
        info.push(t('info.paragraphsDropped', { count: response.paragraphs_dropped }))
      }
      if (typeof response.references_removed_lines === 'number' && response.references_removed_lines > 0) {
        info.push(t('info.referencesRemoved', { count: response.references_removed_lines }))
      }

      if (response.title) info.push(t('info.title', { value: response.title }))
      if (Array.isArray(response.tags) && response.tags.length) {
        const value = `${response.tags.slice(0, 12).join('，')}${response.tags.length > 12 ? '...' : ''}`
        info.push(t('info.tags', { value }))
      }
      if (response.language) {
        const confidence =
          typeof response.language_confidence === 'number'
            ? t('info.languageWithConfidence', { value: response.language, confidence: response.language_confidence.toFixed(2) })
            : response.language
        info.push(t('info.language', { value: confidence }))
      }
      if (Array.isArray(response.keywords) && response.keywords.length) {
        const value = `${response.keywords.slice(0, 12).join('，')}${response.keywords.length > 12 ? '...' : ''}`
        info.push(t('info.keywords', { value }))
      }
      if (response.frontmatter && typeof response.frontmatter === 'object') {
        const keys = Object.keys(response.frontmatter || {})
        if (keys.length) {
          const value = `${keys.slice(0, 8).join('，')}${keys.length > 8 ? '...' : ''}`
          info.push(t('info.frontmatter', { value }))
        }
      }

      if (response.pii_hits && Object.keys(response.pii_hits).length > 0) {
        const summary = Object.entries(response.pii_hits)
          .map(([key, value]) => `${key}=${value}`)
          .join('，')
        info.push(t('info.piiHits', { value: summary }))
      }
      if (response.secrets_hits && Object.keys(response.secrets_hits).length > 0) {
        const summary = Object.entries(response.secrets_hits)
          .map(([key, value]) => `${key}=${value}`)
          .join('，')
        info.push(t('info.secretsHits', { value: summary }))
      }
      setBackendInfo(info.length ? info.join('\n') : null)

      if (response.dropped) {
        setBackendError(
          t('errors.filtered', {
            reason: response.drop_reason || t('errors.qualityFilterTriggered'),
          })
        )
        onClean(response.markdown || '')
        return
      }

      let next = response.markdown

      if (llmEnabled) {
        try {
          const llmRequest: LLMCleanPreviewRequest = {
            markdown: next,
            prompt_template_id: promptTemplateId || undefined,
          }
          const llmResponse = await pipelineApi.llmCleanPreview(llmRequest)
          next = llmResponse.markdown
          if (llmResponse.warnings?.length) {
            setBackendError(llmResponse.warnings.join('；'))
          }
        } catch (error: unknown) {
          setBackendError(formatApiError(error, t('errors.llmCleanFailedKeepPreview')))
        }
      }

      onClean(next)
    } catch (error: unknown) {
      setBackendError(formatApiError(error, t('errors.backendCleanFailed')))
    } finally {
      setIsApplying(false)
    }
  }, [content, inputFormat, llmEnabled, onClean, options, promptTemplateId, t])

  const applyPipelinePatch = useCallback(
    (patch: Partial<DocumentPipelineOptions>) => {
      setEnabled(true)
      for (const key of Object.keys(patch) as Array<keyof DocumentPipelineOptions>) {
        const value = patch[key]
        if (value === undefined) continue
        updateOption(key, value)
      }
    },
    [setEnabled, updateOption]
  )

  const handleReset = useCallback(() => {
    onClean(content)
  }, [content, onClean])

  const resetButtonClass =
    'h-8 rounded-md border-border bg-background px-3 text-xs font-medium text-muted-foreground shadow-none hover:bg-muted hover:text-foreground'
  const applyButtonClass =
    'h-8 gap-2 rounded-md border-primary bg-primary px-3.5 text-xs font-medium text-primary-foreground shadow-none hover:bg-primary/90'
  const llmToggleClass = cn(
    'h-8 rounded-md px-3 text-xs font-medium shadow-none transition-colors motion-reduce:transition-none',
    llmEnabled
      ? 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/15'
      : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
  )
  const configShellClass =
    'border-b border-border pb-4'
  const configHeaderClass =
    'border-b border-border px-1 pb-3'
  const rulesPanelClass =
    'divide-y divide-border'
  const configSubpanelClass =
    'px-1 py-3'
  const llmPanelClass =
    'border-y border-border bg-muted/20 p-3'
  const diffPanelClass =
    'overflow-hidden border-y border-border bg-background'
  const emptyStateClass =
    'flex items-start gap-2 rounded-md bg-muted/30 px-3 py-3 text-xs leading-5 text-muted-foreground'
  const cleanerLabelClass =
    'text-xs font-medium text-foreground'
  const cleanerCaptionClass =
    'text-xs leading-5 text-muted-foreground'

  return (
    <div className="space-y-4 p-3 md:p-4">
      <div className={configShellClass}>
        <div className={configHeaderClass}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Wrench className="size-4" />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold leading-5 text-foreground">{t("header.title")}</h3>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                  选择规则并预览清洗结果
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-xs text-muted-foreground">格式</span>
              <Select
                value={inputFormat}
                onValueChange={(value) => setInputFormat(coerceOneOf(DATA_CLEANER_INPUT_FORMAT_VALUES, value, 'markdown'))}
              >
                <SelectTrigger className="focus-ring h-8 w-[108px] rounded-md border-border bg-background px-2 text-xs font-medium shadow-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="markdown">{t('inputFormat.options.markdown')}</SelectItem>
                  <SelectItem value="html">{t('inputFormat.options.html')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className={rulesPanelClass}>
          <div className="px-1 py-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground">治理规则</div>
              <div className={cn('mt-0.5', cleanerCaptionClass)}>先选常用预设，再按需调整具体规则</div>
            </div>
          </div>
          <div>
            <div className={configSubpanelClass}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className={cleanerLabelClass}>治理预设</div>
                <div className={cleanerCaptionClass}>快速应用一组常用设置</div>
              </div>
              <GovernanceProfileSelector compact={true} onApplyPatch={applyPipelinePatch} />
            </div>
            <div className={configSubpanelClass}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className={cleanerLabelClass}>清洗规则</div>
                <div className={cleanerCaptionClass}>调整规则和高级参数</div>
              </div>
              <PipelineOptionsPanel compact={true} showJsonToolbar={true} showIndexingControls={false} />
            </div>
          </div>
        </div>
      </div>

      {backendError && (
        <Alert variant="warning">
          <AlertTriangle className="size-4" />
          <div>
            <AlertTitle>{t('alerts.warningTitle')}</AlertTitle>
            <AlertDescription className="text-foreground/70">{backendError}</AlertDescription>
          </div>
        </Alert>
      )}
      {backendInfo && (
        <Alert variant="info">
          <Info className="size-4" />
          <div>
            <AlertTitle>{t('alerts.infoTitle')}</AlertTitle>
            <AlertDescription className="whitespace-pre-line text-foreground/70">{backendInfo}</AlertDescription>
          </div>
        </Alert>
      )}

      <div className="flex items-center justify-between gap-2 border-y border-border py-2">
        <Button onClick={handleReset} variant="outline" size="sm" className={resetButtonClass}>
          <Undo className="h-3.5 w-3.5" />
          {t('actions.reset')}
        </Button>
        <Button onClick={handleApply} disabled={isApplying} variant="outline" className={applyButtonClass}>
          {isApplying ? (
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {isApplying ? t('actions.applying') : t("actions.apply")}
        </Button>
      </div>

      <div className={llmPanelClass}>
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Sparkles className="size-3.5" />
            </span>
            <div className="min-w-0">
              <span className="text-sm font-medium text-foreground">{t('llm.title')}</span>
              <p className="mt-0.5 text-xs text-muted-foreground">需要时再用模型润色清洗结果</p>
            </div>
          </div>
          <Button variant="outline" size="sm" className={llmToggleClass} onClick={() => setLlmEnabled((value) => !value)}>
            {llmEnabled ? t('llm.enabled') : t('llm.enable')}
          </Button>
        </div>

        {llmEnabled && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-16 text-xs text-muted-foreground">{t('llm.promptTemplateLabel')}</span>
              <Select
                value={promptTemplateId || SELECT_DEFAULT_VALUE}
                onValueChange={(value) => setPromptTemplateId(value === SELECT_DEFAULT_VALUE ? '' : value)}
              >
                <SelectTrigger className="h-8 w-full rounded-md border-border bg-background text-xs shadow-none">
                  <SelectValue placeholder={t('llm.promptTemplatePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SELECT_DEFAULT_VALUE}>{t('llm.promptTemplateDefault')}</SelectItem>
                  {promptTemplates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      <div className={diffPanelClass}>
        <button
          type="button"
          onClick={() => setPreviewDiff((value) => !value)}
          className="flex w-full items-center justify-between px-3 py-2 transition-colors hover:bg-muted/30"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-info/10 text-info">
              <GitCompare className="size-3.5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium leading-5 text-foreground">{t('diff.title')}</span>
              <span className="block text-xs leading-5 text-muted-foreground">查看规则命中和文本改动</span>
            </span>
          </span>
          <TextCursorInput className="size-4 text-muted-foreground/70" />
        </button>
        {previewDiff && (
          <div className="max-h-80 space-y-3 overflow-y-auto border-t border-border/48 bg-muted/[0.14] p-3 no-scrollbar overscroll-contain">
            {impact ? (
              <div className="rounded-md border border-border bg-background p-3">
                <div className="mb-2 text-xs font-medium text-muted-foreground">{t('diff.impactTitle')}</div>
                <div className="grid grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                  <div className="flex items-center justify-between gap-2">
                    <span>{t('diff.impact.chars')}</span>
                    <span className="font-mono text-foreground/90">
                      {impact.inputChars}
                      {' -> '}
                      {impact.outputChars} ({impact.deltaChars >= 0 ? '+' : ''}
                      {impact.deltaChars}
                      {impact.deltaCharsPct == null ? '' : `, ${Math.round(impact.deltaCharsPct * 100)}%`})
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span>{t('diff.impact.lines')}</span>
                    <span className="font-mono text-foreground/90">
                      {impact.inputLines}
                      {' -> '}
                      {impact.outputLines} ({impact.deltaLines >= 0 ? '+' : ''}
                      {impact.deltaLines})
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span>{t('diff.impact.diff')}</span>
                    <span className="font-mono text-foreground/90">
                      +{impact.addedLines} / -{impact.removedLines} / ~{impact.changedLines}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span>{t('diff.impact.piiSecrets')}</span>
                    <span className="font-mono text-foreground/90">
                      {impact.piiHitsTotal} / {impact.secretsHitsTotal}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span>{t('diff.impact.urlsChanged')}</span>
                    <span className="font-mono text-foreground/90">{impact.urlsChanged}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span>{t('diff.impact.paragraphsDropped')}</span>
                    <span className="font-mono text-foreground/90">{impact.paragraphsDropped}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span>{t('diff.impact.referencesRemovedLines')}</span>
                    <span className="font-mono text-foreground/90">{impact.referencesRemovedLines}</span>
                  </div>
                </div>
              </div>
            ) : null}

            {lastPreview?.issues?.length ? (
              <div className="rounded-md border border-border bg-background p-3">
                <div className="mb-2 text-xs font-medium text-muted-foreground">{t('diff.issuesTitle')}</div>
                <div className="space-y-2">
                  {lastPreview.issues.slice(0, 8).map((issue) => (
                    <div key={issue.code} className="text-xs text-foreground/80">
                      <span
                        className={cn(
                          'mr-2 inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium',
                          getSeverityBadgeClass(issue.severity)
                        )}
                      >
                        {t(`severity.${issue.severity}`)}
                      </span>
                      {issue.message}
                      {typeof issue.count === 'number' && issue.count > 0 ? `（${issue.count}）` : ''}
                    </div>
                  ))}
                </div>

                {lastPreview.suggested_pipeline_patch &&
                  Object.keys(lastPreview.suggested_pipeline_patch).length > 0 && (
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <div className="text-xs text-muted-foreground">{t('diff.applySuggestionHint')}</div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const patch = lastPreview.suggested_pipeline_patch
                          if (patch) applyPipelinePatch(patch)
                        }}
                      >
                        {t('diff.applySuggestion')}
                      </Button>
                    </div>
                  )}
              </div>
            ) : (
              <div className={emptyStateClass}>
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />
                <div>
                  <div className="font-medium text-foreground">{t('diff.noIssueHint')}</div>
                  <div>执行清洗后，规则命中和风险提示会显示在这里。</div>
                </div>
              </div>
            )}

            {Array.isArray(lastPreview?.rule_stats) && lastPreview.rule_stats.length ? (
              <CleanPreviewRuleStatsPanel ruleStats={lastPreview.rule_stats} />
            ) : null}

            {typeof lastPreview?.diff_unified === 'string' && lastPreview.diff_unified.trim() ? (
              <div className="overflow-hidden rounded-md border border-border bg-background">
                <div className="flex items-center justify-between border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
                  <span>{t('diff.unifiedDiff')}</span>
                  {lastPreview.diff_truncated ? (
                    <span className="text-xs text-muted-foreground">{t('diff.truncated')}</span>
                  ) : null}
                </div>
                <pre className="overflow-x-auto whitespace-pre p-3 font-mono text-xs leading-relaxed">
{lastPreview.diff_unified}
                </pre>
              </div>
            ) : (
              <div className={emptyStateClass}>
                <TextCursorInput className="mt-0.5 size-3.5 shrink-0 text-info" />
                <div>
                  <div className="font-medium text-foreground">{t('diff.noDiffHint')}</div>
                  <div>执行一次清洗后，这里会显示文本改动。</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
