"use client"

import type { KeyboardEvent, RefObject } from "react"
import { Loader2, Plus, Sparkles } from "lucide-react"

import type { DocumentChunk } from "@/types"
import { Button } from "@/components/ui/button"

import { DocumentChunkCard } from "./chunk-renderer"

type ChunksToolbarPanelProps = {
  chunkSearchRef: RefObject<HTMLInputElement | null>
  chunkQuery: string
  searchPlaceholder: string
  matchSummary: string
  canJumpMatches: boolean
  canEditChunks: boolean
  serverMatchTruncatedHint: boolean
  highlightChunkId: string | null
  loadAllChunks: boolean
  chunksLoaded: boolean
  chunksLoading: boolean
  highlightChunkLoading: boolean
  highlightChunk: DocumentChunk | null
  chunkEditorSubmitting: boolean
  chunkDeleteSubmitting: string | null
  onChunkQueryChange: (value: string) => void
  onSearchKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  onPrevMatch: () => void
  onNextMatch: () => void
  onOpenCreateChunk: () => void
  onOpenQaDialog: () => void
  onClearHighlight: () => void
  onLoadAllChunks: () => void
  onCopyContent: (content: string) => void
  onCopyLink: (chunk: DocumentChunk) => void
  onEditChunk: (chunk: DocumentChunk) => void
  onDeleteChunk: (chunk: DocumentChunk) => void
}

export function ChunksToolbarPanel({
  chunkSearchRef,
  chunkQuery,
  searchPlaceholder,
  matchSummary,
  canJumpMatches,
  canEditChunks,
  serverMatchTruncatedHint,
  highlightChunkId,
  loadAllChunks,
  chunksLoaded,
  chunksLoading,
  highlightChunkLoading,
  highlightChunk,
  chunkEditorSubmitting,
  chunkDeleteSubmitting,
  onChunkQueryChange,
  onSearchKeyDown,
  onPrevMatch,
  onNextMatch,
  onOpenCreateChunk,
  onOpenQaDialog,
  onClearHighlight,
  onLoadAllChunks,
  onCopyContent,
  onCopyLink,
  onEditChunk,
  onDeleteChunk,
}: Readonly<ChunksToolbarPanelProps>) {
  return (
    <div className="border-b border-border bg-background p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          ref={chunkSearchRef}
          value={chunkQuery}
          onChange={(event) => onChunkQueryChange(event.target.value)}
          onKeyDown={onSearchKeyDown}
          placeholder={searchPlaceholder}
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <div className="flex items-center gap-2">
          <div className="min-w-[88px] text-right text-xs text-muted-foreground tabular-nums">{matchSummary}</div>
          <Button size="sm" variant="outline" disabled={!canJumpMatches} onClick={onPrevMatch}>
            上一个
          </Button>
          <Button size="sm" variant="outline" disabled={!canJumpMatches} onClick={onNextMatch}>
            下一个
          </Button>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-2"
          onClick={onOpenCreateChunk}
          disabled={!canEditChunks}
          title={canEditChunks ? "新增切片" : "文档正在处理中，暂时无法编辑"}
        >
          <Plus className="size-4" />
          新增切片
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-2"
          onClick={onOpenQaDialog}
          disabled={!canEditChunks}
          title={canEditChunks ? "生成问答切片" : "文档正在处理中，暂时无法编辑"}
        >
          <Sparkles className="size-4" />
          生成问答
        </Button>
      </div>

      {serverMatchTruncatedHint ? (
        <div className="mt-2 text-xs text-muted-foreground">匹配结果较多，当前只显示前几项，数量后的“+”表示还有更多结果。</div>
      ) : null}

      {highlightChunkId && !loadAllChunks && !chunksLoaded ? (
        <div className="mt-3 rounded-md border border-border bg-background p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-foreground">引用切片</div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">当前先展示命中的内容，需要浏览全文时可加载全部切片。</div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button type="button" size="sm" variant="outline" onClick={onClearHighlight} disabled={highlightChunkLoading}>
                清除定位
              </Button>
              <Button type="button" size="sm" onClick={onLoadAllChunks} disabled={chunksLoading}>
                加载全部切片
              </Button>
            </div>
          </div>

          <div className="mt-3">
            {highlightChunkLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                <span>加载命中切片…</span>
              </div>
            ) : highlightChunk ? (
              <DocumentChunkCard
                chunk={highlightChunk}
                query={chunkQuery}
                isActive
                canEditChunks={canEditChunks}
                chunkEditorSubmitting={chunkEditorSubmitting}
                chunkDeleteSubmitting={chunkDeleteSubmitting}
                showHoverActions={false}
                onCopyContent={onCopyContent}
                onCopyLink={onCopyLink}
                onEdit={onEditChunk}
                onDelete={onDeleteChunk}
              />
            ) : (
              <div className="text-xs text-muted-foreground">未找到命中切片（可能已被删除或无权限）</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
