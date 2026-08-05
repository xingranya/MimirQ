'use client'

import type { Dataset, Document } from '@/types'
import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { PipelineOptionsPanel } from '@/components/pipeline-options-panel'
import { Button } from '@/components/ui/button'
import { ChunkStrategyDropdown } from '@/components/business/chunk-strategy-dropdown'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

const DETAILS_CLASS = 'group rounded-md border border-border bg-background'
const SUMMARY_CLASS =
  'flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden'

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
      <DialogContent className="grid h-[min(92dvh,680px)] max-h-[calc(100dvh-1rem)] grid-rows-[auto,1fr,auto] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border px-4 py-4 pr-14 text-left sm:px-6">
          <DialogTitle>导入网页文档</DialogTitle>
          <DialogDescription>输入一个公开网址，系统会读取内容并导入知识库。</DialogDescription>
        </DialogHeader>

        <form
          id="knowledge-url-import-form"
          className="min-h-0 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6"
          onSubmit={(event) => {
            event.preventDefault()
            void handleImport()
          }}
        >
          <div className="space-y-6">
            <section className="space-y-4" aria-labelledby="knowledge-url-import-source-heading">
              <div>
                <h3 id="knowledge-url-import-source-heading" className="text-sm font-semibold text-foreground">
                  文档来源
                </h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">支持网页、PDF 和其他可直接访问的文件地址。</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="knowledge-url-import-url">文档网址（必填）</Label>
                <Input
                  id="knowledge-url-import-url"
                  value={url}
                  onChange={(event) => {
                    setUrl(event.target.value)
                    if (urlError) setUrlError(null)
                  }}
                  placeholder="https://example.com/manual.pdf"
                  className="font-mono"
                  maxLength={URL_IMPORT_MAX_URL_LENGTH}
                  aria-invalid={Boolean(urlError)}
                  aria-describedby={urlError ? 'knowledge-url-import-url-error' : undefined}
                  required
                  autoFocus
                />
                {urlError ? (
                  <p id="knowledge-url-import-url-error" className="text-xs text-destructive text-pretty">
                    {urlError}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="knowledge-url-import-dataset">目标知识库</Label>
                  <Select value={datasetId} onValueChange={setDatasetId} disabled={datasetsLoading}>
                    <SelectTrigger id="knowledge-url-import-dataset" className="h-10 bg-background">
                      <SelectValue placeholder={datasetsLoading ? '正在加载知识库' : '选择知识库'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={datasetDefaultValue}>自动选择可写知识库</SelectItem>
                      {datasets.map((dataset) => (
                        <SelectItem key={dataset.id} value={dataset.id}>
                          {dataset.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="knowledge-url-import-filename">文档名称（可选）</Label>
                  <Input
                    id="knowledge-url-import-filename"
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
                    <p id="knowledge-url-import-filename-error" className="text-xs text-destructive text-pretty">
                      {filenameError}
                    </p>
                  ) : null}
                </div>
              </div>
            </section>

            <div className="border-t border-border pt-5">
              <details className={DETAILS_CLASS}>
                <summary className={SUMMARY_CLASS}>
                  <span>解析与入库</span>
                  <ChevronDown
                    className="size-4 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
                    aria-hidden="true"
                  />
                </summary>
                <div className="space-y-4 border-t border-border p-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <div id="knowledge-url-import-parser-label" className="text-sm font-medium text-foreground">
                        解析方式
                      </div>
                      <div role="group" aria-labelledby="knowledge-url-import-parser-label">
                        <ParserDropdown value={parserBackend} onChange={setParserBackend} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div id="knowledge-url-import-chunk-label" className="text-sm font-medium text-foreground">
                        切片策略
                      </div>
                      <div role="group" aria-labelledby="knowledge-url-import-chunk-label">
                        <ChunkStrategyDropdown value={chunkStrategy} onChange={setChunkStrategy} />
                      </div>
                    </div>
                  </div>
                  <PipelineOptionsPanel compact />
                </div>
              </details>
            </div>
          </div>
        </form>

        <div className="flex flex-col gap-2 border-t border-border bg-background p-4 sm:flex-row-reverse sm:justify-start">
          <Button
            type="submit"
            form="knowledge-url-import-form"
            disabled={submitting || datasetsLoading || !url.trim()}
            className="w-full gap-2 sm:w-auto"
          >
            {submitting ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
            {submitting ? '正在提交' : '导入文档'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto"
          >
            取消
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
