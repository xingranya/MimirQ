'use client'

import type { Dataset, Document } from '@/types'
import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { PipelineOptionsPanel } from '@/components/pipeline-options-panel'
import { Button } from '@/components/ui/button'
import { ChunkStrategyDropdown } from '@/components/business/chunk-strategy-dropdown'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ParserDropdown } from '@/components/business/parser-dropdown'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useChunkStrategyPreference } from '@/contexts/chunk-strategy-context'
import { useParserBackendPreference } from '@/contexts/parser-backend-context'
import { formatApiError } from '@/lib/api-errors'
import { detachPromise } from '@/lib/utils'
import {
  URL_IMPORT_MAX_FILENAME_LENGTH,
  URL_IMPORT_MAX_URL_LENGTH,
  validateUrlImportAddress,
  validateUrlImportFilename,
} from './knowledge-url-import-dialog.validation'

type KnowledgeUrlImportDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void

  datasets: Dataset[]
  datasetsLoading: boolean
  selectedDatasetId?: string
  datasetDefaultValue: string

  uploadDocumentFromUrl: (params: { url: string; filename?: string; dataset_id?: string }) => Promise<Document>
  loadDocuments: (params?: { dataset_id?: string }) => void | Promise<void>
  onDatasetResolved?: (datasetId: string) => void
}

export function KnowledgeUrlImportDialog({
  open,
  onOpenChange,
  datasets,
  datasetsLoading,
  selectedDatasetId,
  datasetDefaultValue,
  uploadDocumentFromUrl,
  loadDocuments,
  onDatasetResolved,
}: Readonly<KnowledgeUrlImportDialogProps>) {
  const { parserBackend, setParserBackend } = useParserBackendPreference()
  const { chunkStrategy, setChunkStrategy } = useChunkStrategyPreference()

  const [url, setUrl] = useState('')
  const [urlError, setUrlError] = useState<string | null>(null)
  const [filename, setFilename] = useState('')
  const [filenameError, setFilenameError] = useState<string | null>(null)
  const [datasetId, setDatasetId] = useState<string>(datasetDefaultValue)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setDatasetId(selectedDatasetId || datasetDefaultValue)
    setUrlError(null)
    setFilenameError(null)
  }, [open, selectedDatasetId, datasetDefaultValue])

  const handleImport = useCallback(async () => {
    const urlValidation = validateUrlImportAddress(url)
    const nextFilenameError = validateUrlImportFilename(filename)
    setUrlError(urlValidation.error)
    setFilenameError(nextFilenameError)
    if (!urlValidation.normalizedUrl || nextFilenameError) return

    setSubmitting(true)
    try {
      const document = await uploadDocumentFromUrl({
        url: urlValidation.normalizedUrl,
        filename: filename.trim() ? filename.trim() : undefined,
        dataset_id: datasetId === datasetDefaultValue ? undefined : datasetId,
      })

      const resolvedDatasetId = String(document.dataset_id || '').trim()
      if (resolvedDatasetId) onDatasetResolved?.(resolvedDatasetId)
      detachPromise(loadDocuments({ dataset_id: resolvedDatasetId || undefined }))

      toast.success('文档已提交导入')
      onOpenChange(false)
      setUrl('')
      setUrlError(null)
      setFilename('')
      setFilenameError(null)
    } catch (err: unknown) {
      toast.error(formatApiError(err, 'URL 导入失败'))
    } finally {
      setSubmitting(false)
    }
  }, [datasetDefaultValue, datasetId, filename, loadDocuments, onDatasetResolved, onOpenChange, uploadDocumentFromUrl, url])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>通过 URL 导入文档</DialogTitle>
          <DialogDescription>
            后端拉取 URL 内容并按当前管线配置入库（需要后端开启 URL_INGEST_ENABLED）。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground/80">URL</div>
              <Input
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value)
                  if (urlError) setUrlError(null)
                }}
                placeholder="https://example.com/doc.pdf / https://example.com/page.html"
                className="font-mono"
                maxLength={URL_IMPORT_MAX_URL_LENGTH}
                aria-invalid={Boolean(urlError)}
                aria-describedby={urlError ? 'knowledge-url-import-url-error' : undefined}
              />
              {urlError ? (
                <div id="knowledge-url-import-url-error" className="text-xs text-destructive text-pretty">
                  {urlError}
                </div>
              ) : null}
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground/80">文件名（可选）</div>
              <Input
                value={filename}
                onChange={(event) => {
                  setFilename(event.target.value)
                  if (filenameError) setFilenameError(null)
                }}
                placeholder="例如：产品手册.pdf"
                maxLength={URL_IMPORT_MAX_FILENAME_LENGTH}
                aria-invalid={Boolean(filenameError)}
                aria-describedby={filenameError ? 'knowledge-url-import-filename-error' : undefined}
              />
              {filenameError ? (
                <div id="knowledge-url-import-filename-error" className="text-xs text-destructive text-pretty">
                  {filenameError}
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium text-foreground/80">目标数据集</div>
            <Select value={datasetId} onValueChange={setDatasetId}>
              <SelectTrigger className="h-10 bg-background">
                <SelectValue placeholder="选择数据集" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={datasetDefaultValue}>默认（自动选择可写数据集）</SelectItem>
                {datasets.map((ds) => (
                  <SelectItem key={ds.id} value={ds.id}>
                    {ds.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {datasetsLoading ? <div className="text-xs text-muted-foreground">正在加载数据集...</div> : null}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground/80">解析方式</div>
              <ParserDropdown value={parserBackend} onChange={setParserBackend} />
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground/80">切块策略</div>
              <ChunkStrategyDropdown value={chunkStrategy} onChange={setChunkStrategy} />
            </div>
          </div>

          <PipelineOptionsPanel />

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              取消
            </Button>
            <Button onClick={handleImport} disabled={submitting || !url.trim()} className="gap-2">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" /> : null}
              开始导入
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
