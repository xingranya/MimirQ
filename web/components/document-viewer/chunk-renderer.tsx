'use client'

import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import type { DocumentChunk } from '@/types'
import { Copy, Link2, Loader2, Pencil, Trash2 } from 'lucide-react'

import { HighlightLayer } from './highlight-layer'

type DocumentChunkCardProps = {
  chunk: DocumentChunk
  query: string
  isActive?: boolean
  showHoverActions?: boolean
  canEditChunks: boolean
  chunkEditorSubmitting: boolean
  chunkDeleteSubmitting: string | null
  onCopyContent: (content: string) => void
  onCopyLink: (chunk: DocumentChunk) => void
  onEdit: (chunk: DocumentChunk) => void
  onDelete: (chunk: DocumentChunk) => void
}

export function DocumentChunkCard({
  chunk,
  query,
  isActive = false,
  showHoverActions = true,
  canEditChunks,
  chunkEditorSubmitting,
  chunkDeleteSubmitting,
  onCopyContent,
  onCopyLink,
  onEdit,
  onDelete,
}: Readonly<DocumentChunkCardProps>) {
  return (
    <div
      id={`chunk-${chunk.id}`}
      className={cn(
        'group rounded-md border p-4 transition-colors duration-200 motion-reduce:transition-none',
        isActive
          ? 'border-primary bg-primary/5'
          : 'border-border bg-background hover:border-primary/30'
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium font-mono text-muted-foreground">
          #{chunk.chunk_index}
        </span>
        <div className="flex items-center gap-2">
          {chunk.page_number == null ? null : (
            <span className="text-xs text-muted-foreground">P.{chunk.page_number}</span>
          )}
          <div
            className={cn(
              'flex items-center gap-1',
              showHoverActions ? 'opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100' : ''
            )}
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onCopyContent(chunk.content)}
              aria-label="复制切片内容"
              title="复制切片内容"
            >
              <Copy className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onCopyLink(chunk)}
              aria-label="复制定位链接"
              title="复制定位链接"
            >
              <Link2 className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onEdit(chunk)}
              disabled={!canEditChunks || chunkEditorSubmitting}
              aria-label="编辑切片"
              title="编辑切片"
            >
              <Pencil className="size-4" />
            </Button>
            <ConfirmDialog
              title={`删除切片 #${chunk.chunk_index}？`}
              description="删除后无法恢复。"
              confirmLabel="删除"
              cancelLabel="取消"
              confirmVariant="destructive"
              confirmDisabled={!canEditChunks || chunkDeleteSubmitting === chunk.id}
              onConfirm={() => onDelete(chunk)}
            >
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                disabled={!canEditChunks || chunkDeleteSubmitting === chunk.id}
                aria-label="删除切片"
                title="删除切片"
              >
                {chunkDeleteSubmitting === chunk.id ? (
                  <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                ) : (
                  <Trash2 className="size-4" />
                )}
              </Button>
            </ConfirmDialog>
          </div>
        </div>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/90">
        <HighlightLayer content={chunk.content} query={query} />
      </p>
    </div>
  )
}
