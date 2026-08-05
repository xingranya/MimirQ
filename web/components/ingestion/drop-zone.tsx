'use client'

import * as React from 'react'
import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { FileUp, Loader2, UploadCloud } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { QueryErrorState } from '@/components/ui/query-error-state'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { datasetApi, documentApi } from '@/lib/api'
import { formatApiError } from '@/lib/api-errors'
import { readClientStorage, writeClientStorage } from '@/lib/client-storage'
import {
  createDocumentUploadOutcome,
  formatDocumentUploadOutcome,
} from '@/lib/document-upload-outcome'
import { UI_LAYER_CLASS } from '@/lib/ui-layers'
import { cn } from '@/lib/utils'
import type { Dataset } from '@/types'

export type DropZoneHandle = {
  triggerFilePicker: (options?: { precheckOnly?: boolean }) => void
  uploadFiles: (files: File[]) => Promise<void>
}

const PARSER_STORAGE_KEY = 'mimirq.ingestion.dropParserBackend'
const PARSER_OPTIONS = [
  { value: 'auto', label: '自动选择（推荐）' },
  { value: 'docling', label: 'Docling' },
  { value: 'markitdown', label: 'MarkItDown' },
  { value: 'deepdoc', label: 'DeepDoc' },
  { value: 'csv', label: '表格文件' },
  { value: 'json', label: 'JSON 文件' },
  { value: 'markdown', label: 'Markdown 文件' },
] as const

function readStoredParserBackend() {
  if (globalThis.window === undefined) return 'auto'
  return readClientStorage(PARSER_STORAGE_KEY) || 'auto'
}

function persistParserBackend(value: string) {
  if (globalThis.window === undefined) return
  writeClientStorage(PARSER_STORAGE_KEY, value)
}

export const DropZone = React.forwardRef<DropZoneHandle, {
  datasetId: string | null
  precheckOnly?: boolean
  onUploadComplete: () => void
}>(({ datasetId, precheckOnly: defaultPrecheckOnly = false, onUploadComplete }, ref) => {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const dragCounterRef = useRef(0)
  const uploadModeRef = useRef(defaultPrecheckOnly)
  const [overlayVisible, setOverlayVisible] = useState(false)
  const [invalidDrop, setInvalidDrop] = useState(false)
  const [dropConfirmOpen, setDropConfirmOpen] = useState(false)
  const [pendingDropFiles, setPendingDropFiles] = useState<File[] | null>(null)
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('')
  const [parserBackend, setParserBackend] = useState(readStoredParserBackend)
  const [dialogPrecheckOnly, setDialogPrecheckOnly] = useState(defaultPrecheckOnly)
  const fileCount = pendingDropFiles?.length ?? 0
  const visiblePendingFiles = pendingDropFiles?.slice(0, 5) ?? []
  const remainingFileCount = Math.max(0, fileCount - visiblePendingFiles.length)

  const datasetsQuery = useQuery({
    queryKey: ['drop-zone-datasets'],
    queryFn: () => datasetApi.listAll(),
    enabled: dropConfirmOpen && !datasetId,
    staleTime: 60_000,
  })

  const datasets = useMemo(() => datasetsQuery.data ?? [], [datasetsQuery.data])

  const handleDropConfirmOpenChange = (open: boolean) => {
    setDropConfirmOpen(open)
    if (!open) {
      setPendingDropFiles(null)
      setSelectedDatasetId('')
    }
  }

  React.useEffect(() => {
    uploadModeRef.current = defaultPrecheckOnly
    setDialogPrecheckOnly(defaultPrecheckOnly)
  }, [defaultPrecheckOnly])

  const uploadFiles = React.useCallback(async (
    files: File[],
    options?: { precheckOnly?: boolean }
  ) => {
    if (!files.length) return false
    const precheckOnly = options?.precheckOnly ?? uploadModeRef.current
    try {
      const response = await documentApi.uploadBatch(files, {
        dataset_id: datasetId || selectedDatasetId || undefined,
        parser_backend: parserBackend,
        chunk_strategy: 'langchain_recursive',
        precheck_only: precheckOnly,
        max_concurrent: 4,
      })
      persistParserBackend(parserBackend)
      const outcome = createDocumentUploadOutcome(response)
      const message = formatDocumentUploadOutcome(outcome, {
        successVerb: precheckOnly ? '已完成评估' : '已上传',
        completeFailure: precheckOnly ? '文件评估失败' : '文件上传失败',
      })

      if (outcome.status === 'error') toast.error(message)
      else if (outcome.status === 'warning') toast.warning(message)
      else toast.success(message)
      if (outcome.succeeded > 0) onUploadComplete()
      return outcome.succeeded > 0
    } catch (error) {
      toast.error(formatApiError(error, precheckOnly ? '文件评估失败' : '文件上传失败'))
      return false
    }
  }, [datasetId, onUploadComplete, parserBackend, selectedDatasetId])

  React.useImperativeHandle(ref, () => ({
    triggerFilePicker: (options?: { precheckOnly?: boolean }) => {
      uploadModeRef.current = options?.precheckOnly ?? defaultPrecheckOnly
      setDialogPrecheckOnly(uploadModeRef.current)
      inputRef.current?.click()
    },
    uploadFiles: async (files: File[]) => {
      await uploadFiles(files)
    },
  }), [defaultPrecheckOnly, uploadFiles])

  React.useEffect(() => {
    const handleDragEnter = (event: DragEvent) => {
      dragCounterRef.current += 1
      setOverlayVisible(true)
      setInvalidDrop(!(event.dataTransfer?.types.includes('Files')))
    }

    const handleDragOver = (event: DragEvent) => {
      event.preventDefault()
      setOverlayVisible(true)
      setInvalidDrop(!(event.dataTransfer?.types.includes('Files')))
    }

    const handleDragLeave = () => {
      dragCounterRef.current = Math.max(0, dragCounterRef.current - 1)
      if (dragCounterRef.current === 0) {
        setOverlayVisible(false)
        setInvalidDrop(false)
      }
    }

    const handleDrop = async (event: DragEvent) => {
      event.preventDefault()
      dragCounterRef.current = 0
      setOverlayVisible(false)
      const droppedFiles = Array.from(event.dataTransfer?.files ?? [])
      if (!droppedFiles.length) {
        setInvalidDrop(true)
        return
      }
      uploadModeRef.current = defaultPrecheckOnly
      setDialogPrecheckOnly(defaultPrecheckOnly)
      if (datasetId) {
        await uploadFiles(droppedFiles)
        return
      }
      setPendingDropFiles(droppedFiles)
      setDropConfirmOpen(true)
    }

    document.addEventListener('dragenter', handleDragEnter)
    document.addEventListener('dragover', handleDragOver)
    document.addEventListener('dragleave', handleDragLeave)
    document.addEventListener('drop', handleDrop)
    return () => {
      document.removeEventListener('dragenter', handleDragEnter)
      document.removeEventListener('dragover', handleDragOver)
      document.removeEventListener('dragleave', handleDragLeave)
      document.removeEventListener('drop', handleDrop)
    }
  }, [datasetId, defaultPrecheckOnly, uploadFiles])

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="sr-only"
        onChange={async (event) => {
          const files = Array.from(event.target.files ?? [])
          if (!files.length) return
          if (datasetId) await uploadFiles(files)
          else {
            setPendingDropFiles(files)
            setDropConfirmOpen(true)
          }
          event.target.value = ''
        }}
      />

      {overlayVisible && (
        <div className={cn('fixed inset-0 flex items-center justify-center bg-black/30', UI_LAYER_CLASS.modalOverlay)}>
          <div
            aria-live="polite"
            className={cn(
              'mx-4 w-full max-w-sm rounded-md border border-dashed border-border bg-background px-6 py-8 text-center',
              UI_LAYER_CLASS.modal
            )}
          >
            <UploadCloud className="mx-auto size-8 text-primary" aria-hidden="true" />
            <p className="mt-3 text-sm font-semibold text-foreground">
              {invalidDrop ? '仅支持文件' : defaultPrecheckOnly ? '拖入文件以开始评估' : '拖入文件以上传'}
            </p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {invalidDrop ? '请拖入本地文件，不要拖入链接或其他内容。' : '松开鼠标后继续选择数据集和解析方式。'}
            </p>
          </div>
        </div>
      )}

      <Dialog open={dropConfirmOpen} onOpenChange={handleDropConfirmOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogPrecheckOnly ? '上传样本评估' : '正式入库'}</DialogTitle>
            <DialogDescription>
              {dialogPrecheckOnly
                ? '选择数据集和解析方式。系统只生成入库前评估，不会将文件写入知识库。'
                : '选择数据集和解析方式。上传后会依次完成解析、治理和切片。'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-md border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <FileUp className="size-4" aria-hidden="true" />
                {dialogPrecheckOnly ? '待评估' : '待入库'} {fileCount} 个文件
              </div>
              <div className="mt-2 space-y-1">
                {visiblePendingFiles.map((file) => (
                  <div key={`${file.name}-${file.size}`} className="truncate">
                    {file.name}
                  </div>
                ))}
                {remainingFileCount > 0 ? (
                  <div>另有 {remainingFileCount} 个文件</div>
                ) : null}
              </div>
            </div>

            {datasetsQuery.isLoading ? (
              <div
                role="status"
                className="flex items-center gap-2 rounded-md border border-border bg-muted/20 p-4 text-sm text-muted-foreground"
              >
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                正在加载数据集...
              </div>
            ) : datasetsQuery.isError ? (
              <QueryErrorState
                title="无法加载数据集"
                description={formatApiError(datasetsQuery.error, '请检查网络连接后重试。')}
                retrying={datasetsQuery.isFetching}
                onRetry={() => {
                  void datasetsQuery.refetch()
                }}
              />
            ) : datasets.length === 0 ? (
              <div className="rounded-md border border-dashed border-border bg-muted/20 p-4 text-sm">
                <p className="font-medium text-foreground">还没有可用的数据集</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  创建数据集后再回来上传文件。
                </p>
                <Button asChild className="mt-3" variant="outline">
                  <Link href="/datasets">新建数据集</Link>
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="drop-zone-dataset">数据集</Label>
                  <Select value={selectedDatasetId} onValueChange={setSelectedDatasetId}>
                    <SelectTrigger id="drop-zone-dataset">
                      <SelectValue placeholder="选择数据集" />
                    </SelectTrigger>
                    <SelectContent>
                      {datasets.map((dataset: Dataset) => (
                        <SelectItem key={dataset.id} value={dataset.id}>
                          {dataset.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="drop-zone-parser">解析方式</Label>
                  <Select value={parserBackend} onValueChange={setParserBackend}>
                    <SelectTrigger id="drop-zone-parser">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PARSER_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => handleDropConfirmOpenChange(false)}>
              取消
            </Button>
            <Button
              disabled={!datasets.length || !selectedDatasetId || !pendingDropFiles?.length}
              onClick={async () => {
                if (!pendingDropFiles?.length) return
                const succeeded = await uploadFiles(pendingDropFiles, { precheckOnly: dialogPrecheckOnly })
                if (!succeeded) return
                handleDropConfirmOpenChange(false)
              }}
            >
              {dialogPrecheckOnly ? '开始评估' : '开始入库'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
})

DropZone.displayName = 'DropZone'
