/**
 * 手动切片上传对话框
 */
'use client'

import { useState, useMemo, ChangeEvent, useRef, useEffect, useCallback } from 'react'
import { Upload, Loader2, FileText, Settings2, Scissors, AlignJustify, Hash, FileType } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { documentApi } from '@/lib/api'
import { cn, formatFileSize } from '@/lib/utils'
import type { DocumentPreview, ManualChunk } from '@/types'
import { useParserBackendPreference } from '@/contexts/parser-backend-context'
import { usePipelineOptions } from '@/contexts/pipeline-options-context'
import { getParserLabel } from '@/lib/parser-options'
import { formatApiError } from '@/lib/api-errors'
import { reportClientError } from '@/lib/client-logging'
import { UPLOAD_ACCEPT } from '@/lib/upload-extensions'
import { PipelineOptionsPanel } from '@/components/pipeline-options-panel'
import { ParserDropdown } from '@/components/business/parser-dropdown'
import { resolveParserBackendForFilename } from '@/lib/parser-compat'

interface ManualUploadDialogProps {
  onUploaded?: () => void
}

type ChunkMode = 'page' | 'length' | 'delimiter'

function renderUploadState(isParsing: boolean, file: File | null) {
  if (isParsing) {
    return (
      <div className="flex flex-col items-center gap-2 py-2">
        <Loader2 className="size-8 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
        <p className="text-sm font-medium text-primary">正在解析结构...</p>
      </div>
    )
  }

  if (file) {
    return (
      <div className="flex flex-col items-center gap-1">
        <div className="mb-1 rounded-md bg-primary/10 p-2">
          <FileText className="size-6 text-primary" aria-hidden="true" />
        </div>
        <p className="line-clamp-1 break-all px-2 text-sm font-medium text-foreground">
          {file.name}
        </p>
        <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
        <p className="mt-2 text-xs text-primary hover:underline">点击更换</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-2 py-2">
      <div className="rounded-md bg-muted p-2">
        <Upload className="size-6 text-muted-foreground" aria-hidden="true" />
      </div>
      <p className="text-sm text-muted-foreground">选择 PDF、TXT 或 Markdown 文件</p>
    </div>
  )
}

function renderPreviewState(preview: DocumentPreview | null, chunkPreview: ManualChunk[]) {
  if (!preview) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
        <Scissors className="mb-3 size-10 text-muted-foreground/40" aria-hidden="true" />
        <p className="text-sm">上传文档后在此处查看实时切片效果</p>
      </div>
    )
  }

  if (chunkPreview.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        当前规则未生成任何切片
      </div>
    )
  }

  return chunkPreview.slice(0, 100).map((chunk, index) => (
    <div
      key={`${String(chunk.page_number ?? '')}:${chunk.content}`}
      className="group rounded-md border border-border bg-card p-4 transition-colors hover:border-primary/30"
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
            #{index + 1}
          </span>
          {typeof chunk.page_number === 'number' && (
            <span className="text-xs text-muted-foreground">P.{chunk.page_number}</span>
          )}
        </div>
        <span className="text-xs tabular-nums text-muted-foreground group-hover:text-primary">
          {chunk.content.length} 个字符
        </span>
      </div>
      <div className="whitespace-pre-wrap break-all rounded-md border border-border bg-muted/20 p-3 text-sm leading-6 text-foreground/90">
        {chunk.content}
      </div>
    </div>
  ))
}

export function ManualUploadDialog({ onUploaded }: Readonly<ManualUploadDialogProps>) {
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<DocumentPreview | null>(null)
  const [isParsing, setIsParsing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [mode, setMode] = useState<ChunkMode>('page')
  const { enabled: pipelineOverridesEnabled, options: pipelineOptions, updateOption } = usePipelineOptions()
  const [chunkSize, setChunkSize] = useState(pipelineOptions.chunk_size ?? 1000)
  const [chunkOverlap, setChunkOverlap] = useState(pipelineOptions.chunk_overlap ?? 200)
  const [delimiter, setDelimiter] = useState('## ')
  const { parserBackend, setParserBackend } = useParserBackendPreference()
  const effectiveParserBackend = useMemo(() => {
    if (!file) return parserBackend
    return resolveParserBackendForFilename(file.name, parserBackend).backend
  }, [file, parserBackend])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const previewAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => {
      previewAbortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    if (typeof pipelineOptions.chunk_size === 'number' && pipelineOptions.chunk_size !== chunkSize) {
      setChunkSize(pipelineOptions.chunk_size)
    }
  }, [pipelineOptions.chunk_size, chunkSize])

  useEffect(() => {
    if (typeof pipelineOptions.chunk_overlap === 'number' && pipelineOptions.chunk_overlap !== chunkOverlap) {
      setChunkOverlap(pipelineOptions.chunk_overlap)
    }
  }, [pipelineOptions.chunk_overlap, chunkOverlap])

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget
    const files = input.files
    if (!files || files.length === 0) return

    const selected = files[0]
    previewAbortRef.current?.abort()
    const controller = new AbortController()
    previewAbortRef.current = controller
    setFile(selected)
    setPreview(null)
    setError(null)
    setIsParsing(true)

    try {
      const resolvedBackend = resolveParserBackendForFilename(selected.name, parserBackend).backend
      const result = await documentApi.preview(
        selected,
        resolvedBackend,
        pipelineOverridesEnabled ? pipelineOptions : undefined,
        { signal: controller.signal }
      )
      if (controller.signal.aborted || previewAbortRef.current !== controller) return
      setPreview(result)
    } catch (err: unknown) {
      if (controller.signal.aborted || previewAbortRef.current !== controller) return
      reportClientError('Manual upload preview parse failed', err)
      setError(formatApiError(err, '文档解析失败'))
    } finally {
      if (previewAbortRef.current === controller) {
        previewAbortRef.current = null
        setIsParsing(false)
      }
      // 清空 input，方便下次选同一文件
      input.value = ''
    }
  }

  const buildChunks = useCallback((): ManualChunk[] => {
    if (!preview) return []

    const segments = preview.segments || []

    if (mode === 'page') {
      // 每个解析片段直接作为一个 chunk
      return segments.map((seg) => ({
        content: seg.content,
        page_number: seg.page_number,
        start_char: 0,
        end_char: seg.content.length,
        metadata: seg.metadata || {},
      }))
    }

    if (mode === 'length') {
      // 按长度切片（在每个 segment 内部按字符数分段）
      const chunks: ManualChunk[] = []

      segments.forEach((seg) => {
        const content = seg.content || ''
        const len = content.length
        if (len === 0) return

        let start = 0
        while (start < len) {
          const end = Math.min(start + chunkSize, len)
          const piece = content.slice(start, end)

          chunks.push({
            content: piece,
            page_number: seg.page_number,
            start_char: start,
            end_char: end,
            metadata: seg.metadata || {},
          })

          if (end >= len) break
          const nextStart = end - chunkOverlap
          start = nextStart > start ? nextStart : end
        }
      })

      return chunks
    }

    if (mode === 'delimiter') {
      const chunks: ManualChunk[] = []
      const fullText = segments.map((s) => s.content).join('\n')

      if (!delimiter || !fullText) {
        if (fullText) {
          chunks.push({
            content: fullText,
            page_number: segments[0]?.page_number,
            metadata: segments[0]?.metadata || {},
          })
        }
        return chunks
      }

      const parts = fullText.split(delimiter)
      parts.forEach((part, index) => {
        const trimmed = part.trim()
        if (!trimmed) return

        const content =
          index === 0 && !fullText.startsWith(delimiter)
            ? trimmed
            : `${delimiter}${trimmed}`

        chunks.push({
          content,
          page_number: segments[0]?.page_number,
          metadata: segments[0]?.metadata || {},
        })
      })

      return chunks
    }

    return []
  }, [preview, mode, chunkSize, chunkOverlap, delimiter])

  const chunkPreview = useMemo<ManualChunk[]>(() => buildChunks(), [buildChunks])

  const handleSubmit = async () => {
    if (!preview) return

    const chunks = buildChunks()
    if (!chunks.length) {
      setError('没有可用的切片，请检查切片设置')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const pipeline = pipelineOverridesEnabled
        ? {
            ...pipelineOptions,
            chunk_size: chunkSize,
            chunk_overlap: chunkOverlap,
          }
        : undefined

      await documentApi.createFromChunks({
        filename: preview.filename,
        file_type: preview.file_type,
        file_size: preview.file_size,
        chunks,
        metadata: {
          parser_backend: preview.parser_backend,
        },
        pipeline,
      })

      handleOpenChange(false)

      if (onUploaded) onUploaded()
    } catch (err: unknown) {
      reportClientError('Manual upload failed', err)
      setError(formatApiError(err, '手动切片上传失败'))
    } finally {
      setIsSubmitting(false)
    }
  }

  function resetState() {
    previewAbortRef.current?.abort()
    previewAbortRef.current = null
    setFile(null)
    setPreview(null)
    setError(null)
    setIsParsing(false)
    setIsSubmitting(false)
    setMode('page')
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) resetState()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="mt-3 w-full justify-center gap-2 rounded-md border-border bg-background text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
        >
          <Settings2 className="size-4" aria-hidden="true" />
          <span className="text-sm font-medium">高级切片上传</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="h-[min(90dvh,760px)] max-h-[calc(100dvh-1rem)] grid-rows-[auto,1fr,auto] gap-0 overflow-hidden p-0 sm:max-w-5xl">
        {/* 页头 */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background px-4 py-3 sm:px-6">
          <div>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Scissors className="size-5 text-primary" aria-hidden="true" />
              高级切片上传
            </DialogTitle>
            <DialogDescription className="mt-1 text-xs text-muted-foreground">
              选择解析和切片方式，确认预览后开始入库。
            </DialogDescription>
          </div>
          {preview && (
            <div className="flex items-center gap-1.5 rounded-md border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
               <FileType className="size-3.5" aria-hidden="true" />
               {getParserLabel(preview.parser_backend)}
            </div>
          )}
        </div>

        <div className="flex min-h-0 flex-col overflow-hidden md:flex-row">
          {/* 左侧：配置区 */}
          <div className="flex max-h-[56%] w-full shrink-0 flex-col gap-6 overflow-y-auto overscroll-contain border-b border-border bg-card p-4 md:max-h-none md:w-[360px] md:border-b-0 md:border-r md:p-5">
            
            {/* 1. 文件上传 */}
            <div className="space-y-3">
              <div className="text-sm font-semibold text-foreground flex items-center gap-2">
                <span className="flex size-5 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">1</span>
                <span>源文档</span>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">解析方式</div>
                <ParserDropdown
                  value={effectiveParserBackend}
                  filename={file?.name}
                  onChange={setParserBackend}
                />
              </div>
              
              <input
                ref={fileInputRef}
                type="file"
                accept={UPLOAD_ACCEPT}
                className="hidden"
                onChange={handleFileChange}
              />
              <button
                type="button"
                className={cn(
                  "w-full cursor-pointer rounded-md border border-dashed p-5 text-center transition-colors focus-ring",
                  file ? "border-primary/40 bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/30"
                )}
                onClick={() => fileInputRef.current?.click()}
              >
                {renderUploadState(isParsing, file)}
              </button>
            </div>

            {/* 2. 切片策略 */}
            <div className={cn("space-y-4 transition-opacity duration-200 motion-reduce:transition-none", !preview && "opacity-50 pointer-events-none")}>
              <div className="text-sm font-semibold text-foreground flex items-center gap-2">
                <span className="flex size-5 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">2</span>
                <span>切片策略</span>
              </div>

              <div className="grid grid-cols-3 gap-1 rounded-md border border-border bg-muted/40 p-1">
                <button
                  type="button"
                  onClick={() => setMode('page')}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-md px-1 py-2 text-xs font-medium transition-colors focus-ring",
                    mode === 'page' ? "bg-background text-primary" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                  )}
                  aria-pressed={mode === 'page'}
                >
                  <FileType className="h-4 w-4" />
                  按页/段
                </button>
                <button
                  type="button"
                  onClick={() => setMode('length')}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-md px-1 py-2 text-xs font-medium transition-colors focus-ring",
                    mode === 'length' ? "bg-background text-primary" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                  )}
                  aria-pressed={mode === 'length'}
                >
                  <AlignJustify className="h-4 w-4" />
                  按长度
                </button>
                <button
                  type="button"
                  onClick={() => setMode('delimiter')}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-md px-1 py-2 text-xs font-medium transition-colors focus-ring",
                    mode === 'delimiter' ? "bg-background text-primary" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                  )}
                  aria-pressed={mode === 'delimiter'}
                >
                  <Hash className="h-4 w-4" />
                  分隔符
                </button>
              </div>

              {/* 参数配置 */}
              <div className="rounded-md border border-border bg-muted/20 p-4">
                {mode === 'page' && (
                  <p className="text-xs leading-5 text-muted-foreground">
                    使用解析器默认的输出片段。PDF 通常按页切分，Markdown 和文本文件通常按段落切分。
                  </p>
                )}

                {mode === 'length' && (
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <div className="flex justify-between">
                        <Label htmlFor="manual-chunk-size" className="text-xs text-muted-foreground">切片大小（字符）</Label>
                        <span className="font-mono text-xs text-primary">{chunkSize}</span>
                      </div>
                      <input
                        id="manual-chunk-size"
                        type="range"
                        min={100}
                        max={2000}
                        step={50}
                        value={chunkSize}
                        onChange={(e) => {
                          const next = Number.parseInt(e.target.value)
                          setChunkSize(next)
                          updateOption('chunk_size', next)
                        }}
                        className="h-1.5 w-full cursor-pointer appearance-none rounded-sm bg-muted accent-primary"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between">
                         <Label htmlFor="manual-chunk-overlap" className="text-xs text-muted-foreground">重叠长度（字符）</Label>
                         <span className="font-mono text-xs text-primary">{chunkOverlap}</span>
                      </div>
                      <input
                        id="manual-chunk-overlap"
                        type="range"
                        min={0}
                        max={500}
                        step={10}
                        value={chunkOverlap}
                        onChange={(e) => {
                          const next = Number.parseInt(e.target.value)
                          setChunkOverlap(next)
                          updateOption('chunk_overlap', next)
                        }}
                        className="h-1.5 w-full cursor-pointer appearance-none rounded-sm bg-muted accent-primary"
                      />
                    </div>
                  </div>
                )}

                {mode === 'delimiter' && (
                  <div className="space-y-2">
                    <Label htmlFor="manual-chunk-delimiter" className="text-xs text-muted-foreground">分隔符</Label>
                    <Input
                      id="manual-chunk-delimiter"
                      value={delimiter}
                      onChange={(e) => setDelimiter(e.target.value)}
                      className="h-10 font-mono"
                      placeholder="例如：## "
                    />
                    <p className="text-xs leading-5 text-muted-foreground">
                      支持字符串匹配，常用于 Markdown 标题分割。
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className={cn("space-y-3 transition-opacity duration-200 motion-reduce:transition-none", !preview && "opacity-50 pointer-events-none")}>
              <div className="text-sm font-semibold text-foreground flex items-center gap-2">
                <span className="flex size-5 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">3</span>
                <span>入库管线</span>
              </div>
              <PipelineOptionsPanel compact />
            </div>

            {error && (
              <Alert variant="destructive">
                <Settings2 className="h-4 w-4" />
                <div>
                  <AlertTitle>处理失败</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </div>
              </Alert>
            )}
          </div>

          {/* 右侧：预览区 */}
          <div className="flex min-h-[220px] flex-1 flex-col overflow-hidden bg-background p-4 md:p-5">
            <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-2">
               <h3 className="text-sm font-semibold text-foreground">
                 <span>切片预览</span>
                 {preview && <span className="ml-2 font-normal text-muted-foreground">（{chunkPreview.length} 个切片）</span>}
               </h3>
               {preview && (
                 <span className="text-xs text-muted-foreground">
                    文件大小：{formatFileSize(preview.file_size)}
                 </span>
               )}
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain no-scrollbar pr-2 space-y-3">
              {renderPreviewState(preview, chunkPreview)}
              {chunkPreview.length > 100 && (
                 <div className="text-center py-4 text-xs text-muted-foreground">
                   仅展示前 100 个切片，实际共 {chunkPreview.length} 个
                 </div>
              )}
            </div>
          </div>
        </div>

        {/* 底部操作 */}
        <div className="flex flex-wrap justify-end gap-2 border-t border-border bg-background p-4">
          <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
            取消
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={!preview || isSubmitting || chunkPreview.length === 0}
            className="gap-2 px-6"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />}
            开始处理（{chunkPreview.length} 个切片）
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
