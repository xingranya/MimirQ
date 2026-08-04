/**
 * 入库或导出前编辑切块内容和元数据。
 * 编辑仅保存在前端覆盖层，不会重新切块，也不会改变原文定位。
 */
'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Braces,
  Copy,
  FileText,
  Pencil,
  RotateCcw,
  Save,
  Sparkles,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  getChunkMetadata,
  getStringValue,
  isJsonObject,
} from '@/components/chunk-preview/utils/metadata'
import type { ChunkPreviewItem, JsonObject } from '@/types'
import { getChunkSectionLabel } from '@/components/chunk-preview/utils/sections'
import { usePipelineOptions } from '@/contexts/pipeline-options-context'

export type ChunkOverrideDraft = {
  content: string
  metadataText: string
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function buildEmbeddingText(
  content: string,
  meta: JsonObject | null,
  sectionFull: string | null
): string {
  const raw = String(content ?? '')
  if (!raw) return raw
  const header =
    (meta &&
      (getStringValue(meta, 'header_path') ||
        getStringValue(meta, 'outline_path_str') ||
        getStringValue(meta, 'header_context'))) ||
    sectionFull ||
    ''
  const headerStr = String(header || '').trim()
  if (!headerStr) return raw
  return `[章节] ${headerStr}\n${raw}`
}

export function ChunkInspectorDialog({
  open,
  onOpenChange,
  chunk,
  index,
  sourceFilename,
  overrideUpdatedAt,
  onSave,
  onReset,
}: Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
  chunk: ChunkPreviewItem | null
  index: number | null
  sourceFilename?: string
  overrideUpdatedAt?: number
  onSave: (payload: { content: string; metadata: JsonObject }) => void
  onReset: () => void
}>) {
  const t = useTranslations('ChunkPreview')
  const pipelineCtx = usePipelineOptions()
  const [content, setContent] = useState('')
  const [metadataText, setMetadataText] = useState('{}')
  const sectionLabel = useMemo(
    () => (chunk ? getChunkSectionLabel(chunk) : null),
    [chunk]
  )

  const title = useMemo(() => {
    const name =
      (sourceFilename || '').trim() || t('chunkInspector.documentFallback')
    if (index == null) return name
    return t('chunkInspector.chunkLabel', { name, index: index + 1 })
  }, [index, sourceFilename, t])

  // 每次打开其他切块时重建草稿，避免沿用上一个切块的编辑内容。
  useEffect(() => {
    if (!open) return
    if (!chunk || index == null) return
    setContent(String(chunk.content ?? ''))
    try {
      setMetadataText(JSON.stringify(chunk.metadata ?? {}, null, 2))
    } catch {
      setMetadataText('{}')
    }
  }, [chunk, index, open])

  const metadataParse = useMemo(() => {
    try {
      const obj = JSON.parse(metadataText || '{}') as unknown
      if (!isJsonObject(obj)) {
        return {
          value: null as JsonObject | null,
          error: t('chunkInspector.metadataObjectError'),
        }
      }
      return { value: obj, error: null as string | null }
    } catch (error: unknown) {
      return {
        value: null as JsonObject | null,
        error: getErrorMessage(error, t('chunkInspector.metadataParseError')),
      }
    }
  }, [metadataText, t])
  const parsedMetadata = metadataParse.value
  const metadataError = metadataParse.error
  const contentStats = useMemo(() => {
    const text = String(content ?? '')
    const lineCount = text ? text.split(/\r\n|\r|\n/).length : 0
    return { chars: text.length, lines: lineCount }
  }, [content])

  const disabled = !chunk || index == null
  const embeddingPrefixEnabled = Boolean(
    pipelineCtx.enabled && pipelineCtx.options.embedding_context_prefix_enabled
  )
  const embeddingText = useMemo(() => {
    if (!embeddingPrefixEnabled) return String(content ?? '')
    const meta = parsedMetadata ?? (chunk ? getChunkMetadata(chunk) : null)
    const sectionFull = sectionLabel?.full || null
    return buildEmbeddingText(String(content ?? ''), meta, sectionFull)
  }, [
    chunk,
    content,
    embeddingPrefixEnabled,
    parsedMetadata,
    sectionLabel?.full,
  ])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid h-[min(92dvh,880px)] w-[calc(100vw-1.5rem)] max-w-[1280px] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-lg p-0">
        <DialogHeader className="border-b border-border bg-background px-5 py-4 pr-12 sm:px-6">
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-5 h-5 text-primary" />
            {t('chunkInspector.title')}
          </DialogTitle>
          <DialogDescription className="space-y-1">
            <div className="text-xs">
              {title}
              {chunk?.page_number == null ? '' : ` · P.${chunk.page_number}`}
              {chunk ? ` · ${chunk.start_index}-${chunk.end_index}` : ''}
            </div>
            {sectionLabel ? (
              <div className="text-xs text-muted-foreground">
                {t('chunkInspector.sectionLabel')}:{' '}
                <span title={sectionLabel.full}>{sectionLabel.full}</span>
              </div>
            ) : null}
            <div className="text-xs text-muted-foreground">
              {t('chunkInspector.description')}
              {overrideUpdatedAt
                ? t('chunkInspector.editedAt', {
                    value: new Date(overrideUpdatedAt).toLocaleString(),
                  })
                : ''}
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 gap-4 overflow-y-auto bg-background p-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.8fr)] lg:overflow-hidden">
          <section className="flex min-h-[320px] flex-col rounded-md border border-border bg-background lg:min-h-0">
            <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <FileText className="h-4 w-4 text-primary" />
                  {t('chunkInspector.contentLabel')}
                </div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">
                  {t('chunkInspector.contentHelper')}
                </div>
              </div>
              <span className="w-fit shrink-0 rounded-md border border-border bg-muted/20 px-2.5 py-1 text-xs tabular-nums text-muted-foreground">
                {t('chunkInspector.contentStats', contentStats)}
              </span>
            </div>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[260px] flex-1 resize-none rounded-none border-0 bg-background px-4 py-3 font-mono text-xs leading-relaxed shadow-none focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-ring/30 lg:min-h-0"
              aria-label={t('chunkInspector.contentLabel')}
              disabled={disabled}
            />
          </section>

          <aside className="flex min-h-[320px] flex-col rounded-md border border-border bg-background lg:min-h-0">
            <div className="border-b border-border px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Braces className="h-4 w-4 text-primary" />
                {t('chunkInspector.sidePanelLabel')}
              </div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">
                {t('chunkInspector.sidePanelHelper')}
              </div>
            </div>

            <Tabs
              defaultValue="metadata"
              className="flex min-h-0 flex-1 flex-col p-3"
            >
              <TabsList className="grid h-9 w-full grid-cols-2 rounded-md bg-muted p-1">
                <TabsTrigger value="metadata" className="h-7 text-xs">
                  {t('chunkInspector.metadataTab')}
                </TabsTrigger>
                <TabsTrigger value="embedding" className="h-7 text-xs">
                  {t('chunkInspector.embeddingTab')}
                </TabsTrigger>
              </TabsList>

              <TabsContent
                value="metadata"
                className="mt-3 min-h-0 flex-1 data-[state=inactive]:hidden"
              >
                <div className="flex h-full min-h-0 flex-col rounded-md border border-border bg-background">
                  <div className="flex flex-col gap-2 border-b border-border px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-foreground">
                        {t('chunkInspector.metadataLabel')}
                      </div>
                      <div className="mt-1 text-xs leading-5 text-muted-foreground">
                        {t('chunkInspector.metadataHelper')}
                      </div>
                    </div>
                    {metadataError ? (
                      <span className="w-fit shrink-0 rounded-md border border-destructive/25 bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
                        {metadataError}
                      </span>
                    ) : (
                      <span className="w-fit shrink-0 rounded-md border border-success/25 bg-success/10 px-2 py-0.5 text-xs text-success">
                        {t('chunkInspector.metadataOk')}
                      </span>
                    )}
                  </div>
                  <Textarea
                    value={metadataText}
                    onChange={(e) => setMetadataText(e.target.value)}
                    className="min-h-[240px] flex-1 resize-none rounded-none border-0 bg-transparent px-3 py-3 font-mono text-xs leading-relaxed shadow-none focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-ring/30 lg:min-h-0"
                    aria-label={t('chunkInspector.metadataLabel')}
                    aria-invalid={metadataError ? 'true' : undefined}
                    disabled={disabled}
                  />
                </div>
              </TabsContent>

              <TabsContent
                value="embedding"
                className="mt-3 min-h-0 flex-1 data-[state=inactive]:hidden"
              >
                <div className="flex h-full min-h-0 flex-col rounded-md border border-border bg-background">
                  <div className="flex flex-col gap-2 border-b border-border px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                        <Sparkles className="w-3.5 h-3.5 text-primary" />
                        {t('chunkInspector.embeddingLabel')}
                      </div>
                      <div className="mt-1 text-xs leading-5 text-muted-foreground">
                        {embeddingPrefixEnabled
                          ? t('chunkInspector.prefixOn')
                          : t('chunkInspector.prefixOff')}
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 w-fit shrink-0 px-2 text-xs"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(
                            embeddingText || ''
                          )
                          toast.success(t('chunkInspector.copyEmbeddingSuccess'))
                        } catch {
                          toast.error(t('chunkInspector.copyEmbeddingFailed'))
                        }
                      }}
                      disabled={disabled || !embeddingText}
                      aria-label={t('chunkInspector.copyEmbedding')}
                      title={t('chunkInspector.copyEmbedding')}
                    >
                      <Copy className="w-3.5 h-3.5 mr-1.5" />
                      {t('chunkInspector.copyEmbedding')}
                    </Button>
                  </div>
                  <Textarea
                    value={embeddingText}
                    readOnly
                    className="min-h-[220px] flex-1 resize-none rounded-none border-0 bg-muted/20 px-3 py-3 font-mono text-xs leading-relaxed shadow-none focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-ring/30 lg:min-h-0"
                    aria-label={t('chunkInspector.embeddingLabel')}
                    disabled={disabled}
                  />
                  <div className="border-t border-border px-3 py-2 text-xs leading-5 text-muted-foreground">
                    {t('chunkInspector.embeddingHint')}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </aside>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-border bg-background px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => {
              if (disabled) return
              onReset()
              onOpenChange(false)
            }}
            disabled={disabled}
          >
            <RotateCcw className="w-4 h-4" />
            {t('chunkInspector.reset')}
          </Button>

          <Button
            type="button"
            className="gap-2"
            onClick={() => {
              if (disabled) return
              if (!parsedMetadata) return
              onSave({ content, metadata: parsedMetadata })
              onOpenChange(false)
            }}
            disabled={disabled || !parsedMetadata}
          >
            <Save className="w-4 h-4" />
            {t('chunkInspector.save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
