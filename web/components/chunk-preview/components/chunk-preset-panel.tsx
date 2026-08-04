'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bookmark, Loader2, RefreshCw, Save } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn, detachPromise } from '@/lib/utils'
import { chunkPresetApi } from '@/lib/api'
import { formatApiError } from '@/lib/api-errors'
import { useChunkPreview } from '@/components/chunk-preview/context'
import { usePipelineOptions } from '@/contexts/pipeline-options-context'
import type { ChunkPreset, DocumentPipelineOptions, JsonObject } from '@/types'

function clampInt(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

function decodeSeparatorInput(raw: string) {
  const value = (raw || '').trim()
  if (!value) return ''
  try {
    const escapedValue = value.replaceAll('"', String.raw`\"`)
    return JSON.parse(`"${escapedValue}"`)
  } catch {
    return value
  }
}

type ChunkPresetPayload = JsonObject & {
  dataset_id?: string
  parser_backend?: string
  chunk_strategy?: string
  chunk_size?: number
  chunk_overlap?: number
  separator_preset?: string
  separator?: string
  keep_separator?: boolean
  separator_max_chunk_size?: number
  pipeline?: DocumentPipelineOptions
}

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function ChunkPresetPanel({ className }: Readonly<{ className?: string }>) {
  const pipelineCtx = usePipelineOptions()
  const t = useTranslations('ChunkPreview')
  const commonT = useTranslations('Common')

  const {
    datasetId,
    setDatasetId,
    parserBackend,
    setParserBackend,
    chunkStrategy,
    chunkSize,
    chunkOverlap,
    separatorPreset,
    separatorCustom,
    keepSeparator,
    separatorMaxChunkSize,
    updateSettings,
    updateSeparatorSettings,
  } = useChunkPreview()

  const [items, setItems] = useState<ChunkPreset[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<string>('')

  const [saveAsOpen, setSaveAsOpen] = useState(false)
  const [saveAsName, setSaveAsName] = useState('')
  const [saveAsDescription, setSaveAsDescription] = useState('')
  const [saving, setSaving] = useState(false)

  const selectedPreset = useMemo(() => items.find((p) => p.id === selectedId) || null, [items, selectedId])

  const effectiveSeparator = useMemo(() => {
    const presetMap: Record<string, string> = {
      paragraph: '\n\n',
      line: '\n',
      sentence_cn: '。', // 中文句号
      sentence_en: '.', // 英文句号
      markdown_hr: '---',
      markdown_h1: '# ',
      markdown_h2: '## ',
    }

    if (separatorPreset && separatorPreset !== 'custom') {
      return presetMap[separatorPreset] ?? '\n\n'
    }

    const raw = String(separatorCustom || '').trim()
    if (!raw) return '\n\n'
    return decodeSeparatorInput(raw) || '\n\n'
  }, [separatorCustom, separatorPreset])

  const buildPayload = (): ChunkPresetPayload => {
    const payload: ChunkPresetPayload = {
      dataset_id: datasetId || undefined,
      parser_backend: parserBackend,
      chunk_strategy: chunkStrategy,
      chunk_size: chunkSize,
      chunk_overlap: chunkOverlap,
      pipeline: pipelineCtx.enabled ? pipelineCtx.options : undefined,
    }

    if (chunkStrategy === 'separator') {
      payload.separator_preset = separatorPreset || 'paragraph'
      payload.keep_separator = Boolean(keepSeparator)
      payload.separator_max_chunk_size = Number(separatorMaxChunkSize) || 0
      if ((separatorPreset || '') === 'custom') {
        payload.separator = effectiveSeparator || '\n\n'
      }
    }

    return payload
  }

  const applyPayload = async (payload: unknown) => {
    const parsed = isRecord(payload) ? payload : {}

    if (typeof parsed.dataset_id === 'string') setDatasetId(String(parsed.dataset_id))
    else if (parsed.dataset_id == null) setDatasetId('')

    if (typeof parsed.parser_backend === 'string') setParserBackend(String(parsed.parser_backend))

    const nextStrategy = typeof parsed.chunk_strategy === 'string' ? String(parsed.chunk_strategy) : undefined
    const nextSize = Number(parsed.chunk_size)
    const nextOverlap = Number(parsed.chunk_overlap)

    updateSettings({
      ...(nextStrategy ? { strategy: nextStrategy } : {}),
      ...(Number.isFinite(nextSize) ? { chunkSize: clampInt(nextSize, 50, 4000) } : {}),
      ...(Number.isFinite(nextOverlap) ? { chunkOverlap: clampInt(nextOverlap, 0, 1000) } : {}),
    })

    if (typeof parsed.separator_preset === 'string') {
      updateSeparatorSettings({ separatorPreset: String(parsed.separator_preset) })
    }
    if (typeof parsed.separator === 'string') {
      updateSeparatorSettings({ separatorCustom: String(parsed.separator) })
    }
    if (typeof parsed.keep_separator === 'boolean') {
      updateSeparatorSettings({ keepSeparator: Boolean(parsed.keep_separator) })
    }
    if (Number.isFinite(Number(parsed.separator_max_chunk_size))) {
      updateSeparatorSettings({
        separatorMaxChunkSize: clampInt(Number(parsed.separator_max_chunk_size), 0, 20000),
      })
    }

    const pipeline = parsed.pipeline
    if (isRecord(pipeline)) {
      pipelineCtx.setEnabled(true)
      const importResult = pipelineCtx.importJson(JSON.stringify(pipeline))
      if (!importResult.ok) {
        toast.error(importResult.error || t('chunkPresetPanel.applyPipelineConfigFailed'))
      }
    }
  }

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const ds = (datasetId || '').trim()
      const res = await chunkPresetApi.list({
        limit: 200,
        ...(ds ? { dataset_id: ds, include_global: true } : {}),
      })
      const next = (res?.items || [])
      setItems(next)
      if (selectedId && !next.some((p) => p.id === selectedId)) {
        setSelectedId('')
      }
    } catch (error: unknown) {
      toast.error(formatApiError(error, t('chunkPresetPanel.loadFailed')))
    } finally {
      setLoading(false)
    }
  }, [datasetId, selectedId, t])

  useEffect(() => {
    detachPromise(refresh())
  }, [refresh])

  const onSave = async () => {
    if (!selectedPreset) {
      setSaveAsName('')
      setSaveAsDescription('')
      setSaveAsOpen(true)
      return
    }
    setSaving(true)
    try {
      const payload = buildPayload()
      await chunkPresetApi.update(selectedPreset.id, {
        name: selectedPreset.name,
        description: selectedPreset.description ?? null,
        payload,
      })
      await refresh()
      toast.success(t('chunkPresetPanel.updated'))
    } catch (error: unknown) {
      toast.error(formatApiError(error, t('chunkPresetPanel.saveFailed')))
    } finally {
      setSaving(false)
    }
  }

  const onSaveAs = async () => {
    const name = (saveAsName || '').trim()
    if (!name) {
      toast.error(t('chunkPresetPanel.nameRequired'))
      return
    }

    setSaving(true)
    try {
      const payload = buildPayload()
      const created = await chunkPresetApi.create({
        name,
        description: (saveAsDescription || '').trim() || null,
        payload,
      })
      await refresh()
      setSelectedId(created.id)
      setSaveAsOpen(false)
      toast.success(t('chunkPresetPanel.createdAndSelected'))
    } catch (error: unknown) {
      toast.error(formatApiError(error, t('chunkPresetPanel.createFailed')))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className={cn(
        'space-y-3 rounded-md border border-border bg-background p-3',
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-primary">
            <Bookmark className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-foreground">{t('chunkPresetPanel.title')}</div>
            <div className="truncate text-xs text-muted-foreground">
              {selectedPreset ? t('chunkPresetPanel.statusActive', { name: selectedPreset.name }) : t('chunkPresetPanel.statusIdle')}
            </div>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="size-8 shrink-0 rounded-md p-0 text-muted-foreground hover:bg-muted"
          onClick={() => detachPromise(refresh())}
          disabled={loading || saving}
          aria-label={t('chunkPresetPanel.refreshAria')}
          title={t('chunkPresetPanel.refresh')}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <Select
          value={selectedId || '__none__'}
          onValueChange={(value) => {
            const nextId = value === '__none__' ? '' : value
            setSelectedId(nextId)
            const preset = items.find((p) => p.id === nextId)
            if (preset?.payload) {
              detachPromise(applyPayload(preset.payload))
              toast.success(t('chunkPresetPanel.applied', { name: preset.name }))
            }
          }}
        >
          <SelectTrigger className="h-9 rounded-md border-border bg-background text-sm shadow-none">
            <SelectValue placeholder={t('chunkPresetPanel.select')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">{t('chunkPresetPanel.none')}</SelectItem>
            {items.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
          <Button
            type="button"
            size="sm"
            className="h-9 rounded-md px-3 text-sm shadow-none"
            onClick={() => detachPromise(onSave())}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="mr-1.5 h-3 w-3 animate-spin motion-reduce:animate-none" />
            ) : (
              <Save className="mr-1.5 h-3 w-3" />
            )}
            {selectedPreset ? t('chunkPresetPanel.updatePreset') : t('chunkPresetPanel.savePreset')}
          </Button>
          {selectedPreset ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 rounded-md px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => {
                setSaveAsName(`${selectedPreset.name} ${t('chunkPresetPanel.copySuffix')}`)
                setSaveAsDescription(selectedPreset.description || '')
                setSaveAsOpen(true)
              }}
              disabled={saving}
            >
              {t('chunkPresetPanel.saveAs')}
            </Button>
          ) : null}
        </div>
      </div>

      <Dialog open={saveAsOpen} onOpenChange={setSaveAsOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-lg rounded-lg">
          <DialogHeader>
            <DialogTitle>{t('chunkPresetPanel.dialogTitle')}</DialogTitle>
            <DialogDescription>{t('chunkPresetPanel.dialogDescription')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="chunk-preset-name">{t('chunkPresetPanel.name')}</Label>
              <Input id="chunk-preset-name" value={saveAsName} onChange={(e) => setSaveAsName(e.target.value)} placeholder={t('chunkPresetPanel.namePlaceholder')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="chunk-preset-description">{t('chunkPresetPanel.description')}</Label>
              <Textarea
                id="chunk-preset-description"
                value={saveAsDescription}
                onChange={(e) => setSaveAsDescription(e.target.value)}
                placeholder={t('chunkPresetPanel.descriptionPlaceholder')}
                className="min-h-[80px]"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSaveAsOpen(false)} disabled={saving}>
              {commonT('cancel')}
            </Button>
            <Button type="button" onClick={() => detachPromise(onSaveAs())} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin motion-reduce:animate-none" /> : null}
              {commonT('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
