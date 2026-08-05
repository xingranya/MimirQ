"use client"

import { Loader2 } from "lucide-react"

import type { DocumentChunk } from "@/types"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type ChunkEditorDialogProps = {
  open: boolean
  mode: "create" | "edit"
  target: DocumentChunk | null
  content: string
  pageNumber: string
  startChar: string
  endChar: string
  submitting: boolean
  canEditChunks: boolean
  canRerunRetrieve: boolean
  onOpenChange: (open: boolean) => void
  onContentChange: (value: string) => void
  onPageNumberChange: (value: string) => void
  onStartCharChange: (value: string) => void
  onEndCharChange: (value: string) => void
  onSubmit: (mode?: "save" | "save_reembed" | "save_rerun") => void
}

export function ChunkEditorDialog({
  open,
  mode,
  target,
  content,
  pageNumber,
  startChar,
  endChar,
  submitting,
  canEditChunks,
  canRerunRetrieve,
  onOpenChange,
  onContentChange,
  onPageNumberChange,
  onStartCharChange,
  onEndCharChange,
  onSubmit,
}: Readonly<ChunkEditorDialogProps>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "新增切片" : `编辑切片 #${target?.chunk_index ?? "-"}`}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="chunk-editor-content">切片内容</Label>
            <Textarea
              id="chunk-editor-content"
              value={content}
              onChange={(event) => onContentChange(event.target.value)}
              className="min-h-[220px] font-mono"
              placeholder="输入或粘贴切片内容"
            />
            <div className="text-xs text-muted-foreground tabular-nums">{content.length.toLocaleString()} 个字符</div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="chunk-editor-page">页码（可选）</Label>
              <Input
                id="chunk-editor-page"
                value={pageNumber}
                onChange={(event) => onPageNumberChange(event.target.value)}
                inputMode="numeric"
                placeholder="例如 12"
              />
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground">编辑状态</div>
              <div className="text-sm leading-6 text-muted-foreground">
                {canEditChunks ? "可以编辑" : "文档正在处理中，暂时无法编辑"}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="chunk-editor-start">起始字符位置</Label>
              <Input
                id="chunk-editor-start"
                value={startChar}
                onChange={(event) => onStartCharChange(event.target.value)}
                inputMode="numeric"
                placeholder="例如 1200"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="chunk-editor-end">结束字符位置</Label>
              <Input
                id="chunk-editor-end"
                value={endChar}
                onChange={(event) => onEndCharChange(event.target.value)}
                inputMode="numeric"
                placeholder="例如 1680"
              />
            </div>
          </div>

          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground">
            起始和结束位置用于修正切片边界。保存后可以重新生成向量，已有检索问题时也可以立即复跑检索。
          </div>
        </div>

        <DialogFooter className="gap-2 sm:flex-wrap">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            取消
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onSubmit("save")}
            disabled={submitting || !canEditChunks || !content.trim()}
            className="gap-2"
          >
            {submitting ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> : null}
            保存
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onSubmit("save_reembed")}
            disabled={submitting || !canEditChunks || !content.trim()}
            className="gap-2"
          >
            {submitting ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> : null}
            保存并重新嵌入
          </Button>
          <Button
            type="button"
            onClick={() => onSubmit("save_rerun")}
            disabled={submitting || !canEditChunks || !content.trim() || !canRerunRetrieve}
            className="gap-2"
          >
            {submitting ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> : null}
            保存后复跑检索
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
