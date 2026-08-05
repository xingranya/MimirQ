'use client'

import * as React from 'react'
import { Copy, ExternalLink, FileText, Image as ImageIcon, Table2 } from 'lucide-react'
import { toast } from 'sonner'

import { AuthImage, useResolvedAuthAssetUrl } from '@/components/auth-image'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { resolveSafeCitationImageUrl } from '@/lib/citation-images'
import { getDocumentPreviewAnchorFromCitation } from '@/lib/document-preview-anchor'
import { toPrimitiveString } from '@/lib/primitive-text'
import type { DocumentViewSourceContext } from '@/store/document-view'
import { useDocumentView } from '@/store/document-view'
import type { Citation } from '@/types'

type EvidenceKind = 'image' | 'table' | 'text'

type EvidenceMetaRow = Readonly<{
  key: string
  label: string
  value: string
}>

function asText(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint' ||
    typeof value === 'symbol'
  ) {
    return toPrimitiveString(value)
  }
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

function clampText(value: unknown, max = 240): string {
  const text = asText(value).trim()
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function inferEvidenceKind(citation: Citation | null): EvidenceKind {
  if (!citation) return 'text'
  const hitType = String(citation.hit_type || '')
    .trim()
    .toLowerCase()
  const chunkRole = String(citation.chunk_role || '')
    .trim()
    .toLowerCase()
  const semanticRole = String(citation.chunk_semantic_role || '')
    .trim()
    .toLowerCase()

  if (citation.has_image || hitType === 'image') return 'image'
  if (
    hitType === 'tag' ||
    hitType === 'table' ||
    chunkRole.includes('tag') ||
    chunkRole.includes('table') ||
    semanticRole === 'table'
  ) {
    return 'table'
  }
  return 'text'
}

function evidenceKindLabel(kind: EvidenceKind): string {
  if (kind === 'image') return '图片'
  if (kind === 'table') return '表格'
  return '文本'
}

function evidenceKindTitle(kind: EvidenceKind): string {
  if (kind === 'image') return '图片证据'
  if (kind === 'table') return '表格证据'
  return '文本证据'
}

function EvidenceKindIcon({ kind }: Readonly<{ kind: EvidenceKind }>) {
  if (kind === 'image') return <ImageIcon className="size-3.5" aria-hidden="true" />
  if (kind === 'table') return <Table2 className="size-3.5" aria-hidden="true" />
  return <FileText className="size-3.5" aria-hidden="true" />
}

async function copyToClipboard(text: string) {
  const raw = String(text || '')
  if (!raw) return false

  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return false
    await navigator.clipboard.writeText(raw)
    return true
  } catch {
    return false
  }
}

export function EvidenceViewerDialog({
  open,
  onOpenChange,
  citation,
  sourceContext,
}: Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
  citation: Citation | null
  sourceContext?: DocumentViewSourceContext | null
}>) {
  const { openDocument } = useDocumentView()
  const openingDocumentRef = React.useRef(false)
  const kind = inferEvidenceKind(citation)
  const imgUrl = kind === 'image' ? resolveSafeCitationImageUrl(citation?.img_url) : null
  const resolvedImgUrl = useResolvedAuthAssetUrl(imgUrl, { enabled: open })

  const title = React.useMemo(() => {
    const documentName = clampText(citation?.document_name || '未命名文档', 80)
    const pageNumber = citation?.page_number
    const pageLabel =
      typeof pageNumber === 'number' && pageNumber > 0 ? ` · 第 ${pageNumber} 页` : ''
    return `${evidenceKindTitle(kind)} · ${documentName}${pageLabel}`
  }, [citation?.document_name, citation?.page_number, kind])

  const handleCloseAutoFocus = React.useCallback((event: Event) => {
    if (!openingDocumentRef.current) return
    openingDocumentRef.current = false
    event.preventDefault()
  }, [])

  const handleOpenInDocument = React.useCallback(() => {
    if (!citation?.document_id) return
    const start =
      typeof citation.evidence_start_char === 'number'
        ? citation.evidence_start_char
        : typeof citation.start_char === 'number'
          ? citation.start_char
          : null
    const end =
      typeof citation.evidence_end_char === 'number'
        ? citation.evidence_end_char
        : typeof citation.end_char === 'number'
          ? citation.end_char
          : null
    const range = start != null && end != null && end > start ? { start, end } : undefined

    openingDocumentRef.current = true
    onOpenChange(false)
    openDocument(citation.document_id, citation.chunk_id, range, {
      previewAnchor: getDocumentPreviewAnchorFromCitation(citation),
      sourceContext,
    })
  }, [citation, onOpenChange, openDocument, sourceContext])

  const handleCopyDetails = React.useCallback(async () => {
    if (!citation) return
    const copied = await copyToClipboard(JSON.stringify(citation, null, 2))
    if (copied) toast.success('已复制证据信息')
  }, [citation])

  const metadata = React.useMemo(() => {
    if (!citation) return []

    const rows: EvidenceMetaRow[] = []
    const push = (key: string, label: string, value: unknown) => {
      const text = clampText(value, 260)
      if (text) rows.push({ key, label, value: text })
    }

    push('document-id', '文档 ID', citation.document_id)
    push('chunk-id', '切片 ID', citation.chunk_id)
    push('page-number', '页码', citation.page_number)
    push('chunk-index', '切片序号', citation.chunk_index)
    push(
      'span',
      '正文位置',
      typeof citation.start_char === 'number' &&
        typeof citation.end_char === 'number' &&
        citation.end_char >= citation.start_char
        ? `${citation.start_char}..${citation.end_char}`
        : ''
    )
    push(
      'evidence-span',
      '证据位置',
      typeof citation.evidence_start_char === 'number' &&
        typeof citation.evidence_end_char === 'number' &&
        citation.evidence_end_char >= citation.evidence_start_char
        ? `${citation.evidence_start_char}..${citation.evidence_end_char}`
        : ''
    )
    push('hit-type', '命中类型', citation.hit_type)
    push('retrieval-role', '检索角色', citation.retrieval_role)
    push('neighbor-of', '关联切片', citation.neighbor_of)
    push('pipeline-key', '处理管线', citation.doc_pipeline_key)
    push('pipeline-hash', '管线版本', citation.pipeline_hash)
    push('retrieval-mode', '检索方式', citation.retrieval_mode)
    push('reranker-provider', '重排服务', citation.reranker_provider)
    push('relevance-score', '相关性分数', citation.relevance_score)
    push('vector-score', '向量分数', citation.vector_score)
    push('bm25-score', '关键词分数', citation.bm25_score)
    push('keyword-score', '关键词匹配分数', citation.keyword_score)
    push('rerank-score', '重排分数', citation.rerank_score)
    push('retrieval-score', '检索分数', citation.retrieval_score)
    push('retrieval-elapsed', '检索耗时（秒）', citation.retrieval_elapsed_sec)
    push('rerank-elapsed', '重排耗时（秒）', citation.rerank_elapsed_sec)

    return rows
  }, [citation])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[min(90dvh,760px)] max-w-3xl flex-col gap-0 overflow-hidden p-0"
        onCloseAutoFocus={handleCloseAutoFocus}
      >
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-16 text-left sm:px-6">
          <DialogTitle className="text-base">{title}</DialogTitle>
          <DialogDescription>查看证据正文、来源位置和检索信息。</DialogDescription>
        </DialogHeader>

        <div className="flex shrink-0 flex-col gap-3 border-b border-border px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Badge variant="soft" className="gap-1.5">
              <EvidenceKindIcon kind={kind} />
              {evidenceKindLabel(kind)}
            </Badge>
            {citation?.document_name ? (
              <Badge variant="outline" title={String(citation.document_name)}>
                {clampText(citation.document_name, 64)}
              </Badge>
            ) : null}
            {typeof citation?.page_number === 'number' ? (
              <Badge variant="outline">第 {citation.page_number} 页</Badge>
            ) : null}
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2 sm:w-auto"
              onClick={handleCopyDetails}
              disabled={!citation}
            >
              <Copy className="size-4" aria-hidden="true" />
              复制详情
            </Button>
            <Button
              size="sm"
              className="w-full sm:w-auto"
              onClick={handleOpenInDocument}
              disabled={!citation?.document_id}
            >
              打开文档
            </Button>
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-5 px-5 py-4 sm:px-6">
            {kind === 'image' ? (
              <section className="space-y-3" aria-labelledby="evidence-image-title">
                <h3 id="evidence-image-title" className="text-sm font-semibold text-foreground">
                  图片预览
                </h3>
                <div className="overflow-hidden rounded-md border border-border bg-muted/20">
                  {resolvedImgUrl ? (
                    <div className="relative aspect-video w-full">
                      <AuthImage
                        src={resolvedImgUrl}
                        alt="证据图片"
                        fill
                        unoptimized
                        sizes="(max-width: 768px) 100vw, 900px"
                        className="bg-background object-contain"
                      />
                    </div>
                  ) : (
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                      图片预览暂不可用。
                    </div>
                  )}
                </div>

                {resolvedImgUrl ? (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-2 sm:w-auto"
                      onClick={() =>
                        globalThis.window.open(resolvedImgUrl, '_blank', 'noopener,noreferrer')
                      }
                    >
                      <ExternalLink className="size-4" aria-hidden="true" />
                      新窗口打开
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-2 sm:w-auto"
                      onClick={async () => {
                        const copied = await copyToClipboard(resolvedImgUrl)
                        if (copied) toast.success('已复制图片链接')
                      }}
                    >
                      <Copy className="size-4" aria-hidden="true" />
                      复制图片链接
                    </Button>
                  </div>
                ) : null}
              </section>
            ) : null}

            {citation?.chunk_content ? (
              <section className="space-y-2" aria-labelledby="evidence-content-title">
                <h3 id="evidence-content-title" className="text-sm font-semibold text-foreground">
                  证据内容
                </h3>
                <div className="whitespace-pre-wrap rounded-md border border-border bg-muted/20 p-3 text-sm leading-6 text-foreground">
                  {String(citation.chunk_content)}
                </div>
              </section>
            ) : null}

            {metadata.length ? (
              <section className="space-y-2" aria-labelledby="evidence-metadata-title">
                <h3 id="evidence-metadata-title" className="text-sm font-semibold text-foreground">
                  溯源信息
                </h3>
                <dl className="overflow-hidden rounded-md border border-border">
                  {metadata.map((row) => (
                    <div
                      key={row.key}
                      className="grid gap-1 border-b border-border px-3 py-2.5 last:border-b-0 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-3"
                    >
                      <dt className="text-xs font-medium text-muted-foreground">{row.label}</dt>
                      <dd className="break-words text-sm text-foreground">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ) : null}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
