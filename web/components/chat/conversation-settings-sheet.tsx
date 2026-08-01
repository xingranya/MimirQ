'use client'

import { Braces, Database, Mic, Route, Settings2, Sparkles, Wand2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import type { PromptTemplate } from '@/lib/api/prompts'

const DEFAULT_TEMPLATE_VALUE = '__mimirq_default__'
const METADATA_FILTER_MODE_VALUES = ['all', 'exclude_qa', 'qa_only', 'custom'] as const

export type ConversationRagConfig = {
  top_k: number
  score_threshold: number
  retrieval_mode: string
  use_graph: boolean
  enable_multi_query: boolean
  enable_hyde: boolean
  metadata_filter?: Record<string, unknown> | null
}

type MetadataFilterMode = (typeof METADATA_FILTER_MODE_VALUES)[number]

type ConversationSettingsSheetProps = {
  conversationId?: string
  deepReasoningEnabled: boolean
  enableLongTermMemory: boolean
  enableSummaryMemory: boolean
  metadataFilterError: string | null
  metadataFilterMode: MetadataFilterMode
  metadataFilterText: string
  onDeepReasoningChange: (checked: boolean) => void
  onLongTermMemoryChange: (checked: boolean) => void
  onMetadataFilterModeChange: (mode: MetadataFilterMode) => void
  onMetadataFilterTextChange: (value: string) => void
  onOpenChange: (open: boolean) => void
  onOpenSummary: () => void
  onOpenTools: () => void
  onOpenTrace: () => void
  onOpenVoice: () => void
  onPromptTemplateChange: (templateId: string) => void
  onRagConfigChange: (patch: Partial<ConversationRagConfig>) => void
  onStructuredOutputChange: (checked: boolean) => void
  onStructuredPresetChange: (preset: string) => void
  onSummaryMemoryChange: (checked: boolean) => void
  open: boolean
  promptTemplateId: string
  promptTemplates: PromptTemplate[]
  ragConfig: ConversationRagConfig
  structuredOutput: boolean
  structuredPreset: string
}

function SettingRow({
  checked,
  label,
  onCheckedChange,
}: Readonly<{
  checked: boolean
  label: string
  onCheckedChange: (checked: boolean) => void
}>) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-4 border-b border-border/60 py-2 last:border-b-0">
      <span className="text-sm text-foreground">{label}</span>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-label={label}
        className="h-5 w-9 [&>span]:size-4 data-[state=checked]:[&>span]:translate-x-4"
      />
    </div>
  )
}

export function ConversationSettingsSheet({
  conversationId,
  deepReasoningEnabled,
  enableLongTermMemory,
  enableSummaryMemory,
  metadataFilterError,
  metadataFilterMode,
  metadataFilterText,
  onDeepReasoningChange,
  onLongTermMemoryChange,
  onMetadataFilterModeChange,
  onMetadataFilterTextChange,
  onOpenChange,
  onOpenSummary,
  onOpenTools,
  onOpenTrace,
  onOpenVoice,
  onPromptTemplateChange,
  onRagConfigChange,
  onStructuredOutputChange,
  onStructuredPresetChange,
  onSummaryMemoryChange,
  open,
  promptTemplateId,
  promptTemplates,
  ragConfig,
  structuredOutput,
  structuredPreset,
}: Readonly<ConversationSettingsSheetProps>) {
  const t = useTranslations('Chat')

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-8 gap-2 px-2 text-xs">
          <Settings2 className="size-4" aria-hidden="true" />
          {t('moreSettings')}
        </Button>
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader className="shrink-0 border-b border-border px-5 py-4 pr-12 text-left">
          <SheetTitle className="text-base">{t('conversationSettings')}</SheetTitle>
          <SheetDescription className="sr-only">
            {t('conversationSettingsDescription')}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          <section className="space-y-3 border-b border-border pb-5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Wand2 className="size-4 text-primary" aria-hidden="true" />
              {t('templateAndMode')}
            </div>
            {promptTemplates.length > 0 ? (
              <div className="space-y-2">
                <Label htmlFor="conversation-template" className="text-xs text-muted-foreground">
                  {t('selectPromptTemplate')}
                </Label>
                <Select
                  value={promptTemplateId || DEFAULT_TEMPLATE_VALUE}
                  onValueChange={(value) =>
                    onPromptTemplateChange(value === DEFAULT_TEMPLATE_VALUE ? '' : value)
                  }
                >
                  <SelectTrigger id="conversation-template">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={DEFAULT_TEMPLATE_VALUE}>{t('defaultTemplate')}</SelectItem>
                    {promptTemplates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <SettingRow
              checked={deepReasoningEnabled}
              label={t('deepReasoning')}
              onCheckedChange={onDeepReasoningChange}
            />
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" size="sm" className="justify-start gap-2" onClick={onOpenVoice}>
                <Mic className="size-4" aria-hidden="true" />
                {t('voiceMode')}
              </Button>
              <Button type="button" variant="outline" size="sm" className="justify-start gap-2" onClick={onOpenTools}>
                <Sparkles className="size-4" aria-hidden="true" />
                {t('tools')}
              </Button>
            </div>
          </section>

          <section className="space-y-3 border-b border-border py-5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Database className="size-4 text-primary" aria-hidden="true" />
              {t('retrievalSettings')}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">{t('retrievalMode')}</Label>
                <Select
                  value={ragConfig.retrieval_mode}
                  onValueChange={(retrievalMode) => onRagConfigChange({ retrieval_mode: retrievalMode })}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">{t('retrievalModes.auto')}</SelectItem>
                    <SelectItem value="hybrid">{t('retrievalModes.hybrid')}</SelectItem>
                    <SelectItem value="vector">{t('retrievalModes.vector')}</SelectItem>
                    <SelectItem value="keyword">{t('retrievalModes.keyword')}</SelectItem>
                    <SelectItem value="mmr">{t('retrievalModes.mmr')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="conversation-top-k" className="text-xs text-muted-foreground">
                  {t('topK')}
                </Label>
                <input
                  id="conversation-top-k"
                  type="number"
                  min={1}
                  max={50}
                  value={ragConfig.top_k}
                  onChange={(event) => onRagConfigChange({ top_k: Number(event.target.value || 0) })}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </div>
            <SettingRow
              checked={ragConfig.use_graph}
              label={t('useKnowledgeGraph')}
              onCheckedChange={(checked) => onRagConfigChange({ use_graph: checked })}
            />

            <details className="rounded-md border border-border">
              <summary className="cursor-pointer select-none px-3 py-2 text-sm text-muted-foreground">
                {t('advancedRetrieval')}
              </summary>
              <div className="space-y-3 border-t border-border p-3">
                <Select
                  value={metadataFilterMode}
                  onValueChange={(value) => onMetadataFilterModeChange(value as MetadataFilterMode)}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder={t('metadataFilterPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('metadataFilters.allChunks')}</SelectItem>
                    <SelectItem value="exclude_qa">{t('metadataFilters.excludeQa')}</SelectItem>
                    <SelectItem value="qa_only">{t('metadataFilters.qaOnly')}</SelectItem>
                    <SelectItem value="custom">{t('metadataFilters.customJson')}</SelectItem>
                  </SelectContent>
                </Select>
                {metadataFilterMode === 'custom' ? (
                  <div className="space-y-1.5">
                    <textarea
                      value={metadataFilterText}
                      onChange={(event) => onMetadataFilterTextChange(event.target.value)}
                      placeholder={t('metadataFilterExampleHandbook')}
                      className="min-h-24 w-full resize-y rounded-md border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    {metadataFilterError ? (
                      <p className="text-xs text-destructive">{metadataFilterError}</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </details>
          </section>

          <section className="space-y-3 border-b border-border py-5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Route className="size-4 text-primary" aria-hidden="true" />
              {t('memoryAndTrace')}
            </div>
            <SettingRow
              checked={enableLongTermMemory}
              label={t('enableLongTermMemory')}
              onCheckedChange={onLongTermMemoryChange}
            />
            <div className="flex min-h-10 items-center justify-between gap-3 border-b border-border/60 py-2">
              <span className="text-sm">{t('enableSummaryMemory')}</span>
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" size="sm" disabled={!conversationId} onClick={onOpenSummary}>
                  {t('viewSummary')}
                </Button>
                <Switch
                  checked={enableSummaryMemory}
                  onCheckedChange={onSummaryMemoryChange}
                  aria-label={t('enableSummaryMemory')}
                  className="h-5 w-9 [&>span]:size-4 data-[state=checked]:[&>span]:translate-x-4"
                />
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2"
              disabled={!conversationId}
              onClick={onOpenTrace}
            >
              <Route className="size-4" aria-hidden="true" />
              {t('viewRagTrace')}
            </Button>
          </section>

          <section className="space-y-3 pt-5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Braces className="size-4 text-primary" aria-hidden="true" />
              {t('outputFormat')}
            </div>
            <SettingRow
              checked={structuredOutput}
              label={t('structuredOutput')}
              onCheckedChange={onStructuredOutputChange}
            />
            {structuredOutput ? (
              <Select
                value={structuredPreset || DEFAULT_TEMPLATE_VALUE}
                onValueChange={(value) =>
                  onStructuredPresetChange(value === DEFAULT_TEMPLATE_VALUE ? '' : value)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('structuredPresetPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DEFAULT_TEMPLATE_VALUE}>{t('structuredPresetCustom')}</SelectItem>
                  <SelectItem value="faq">{t('structuredPresetFaq')}</SelectItem>
                  <SelectItem value="summary">{t('structuredPresetSummary')}</SelectItem>
                  <SelectItem value="action_items">{t('structuredPresetActionItems')}</SelectItem>
                </SelectContent>
              </Select>
            ) : null}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  )
}
