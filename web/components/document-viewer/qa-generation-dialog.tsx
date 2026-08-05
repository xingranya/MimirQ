"use client"

import { Loader2, Sparkles } from "lucide-react"

import type { DocumentQAGenerateResponse } from "@/types"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type QAGenerationDialogProps = {
  open: boolean
  qaNumPairs: number
  qaMaxSourceChars: number
  qaReplaceExisting: boolean
  qaPreferLlm: boolean
  qaSubmitting: boolean
  qaLastResult: DocumentQAGenerateResponse | null
  canEditChunks: boolean
  documentId: string | null
  onOpenChange: (open: boolean) => void
  onNumPairsChange: (value: number) => void
  onMaxSourceCharsChange: (value: number) => void
  onReplaceExistingChange: (value: boolean) => void
  onPreferLlmChange: (value: boolean) => void
  onSubmit: () => void
}

export function QAGenerationDialog({
  open,
  qaNumPairs,
  qaMaxSourceChars,
  qaReplaceExisting,
  qaPreferLlm,
  qaSubmitting,
  qaLastResult,
  canEditChunks,
  documentId,
  onOpenChange,
  onNumPairsChange,
  onMaxSourceCharsChange,
  onReplaceExistingChange,
  onPreferLlmChange,
  onSubmit,
}: Readonly<QAGenerationDialogProps>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>生成问答切片</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="qa-generation-count">问答数量</Label>
              <Input
                id="qa-generation-count"
                value={String(qaNumPairs)}
                onChange={(event) => onNumPairsChange(Number(event.target.value || 0))}
                inputMode="numeric"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="qa-generation-max-chars">最大来源字符数</Label>
              <Input
                id="qa-generation-max-chars"
                value={String(qaMaxSourceChars)}
                onChange={(event) => onMaxSourceCharsChange(Number(event.target.value || 0))}
                inputMode="numeric"
              />
            </div>
          </div>

          <label className="flex cursor-pointer select-none items-center justify-between gap-3 rounded-md border border-border bg-muted/20 px-3 py-2 text-sm">
            <span className="text-muted-foreground">替换已有问答切片</span>
            <input
              type="checkbox"
              checked={qaReplaceExisting}
              onChange={(event) => onReplaceExistingChange(event.target.checked)}
              className="accent-primary h-4 w-4"
            />
          </label>

          <label className="flex cursor-pointer select-none items-center justify-between gap-3 rounded-md border border-border bg-muted/20 px-3 py-2 text-sm">
            <span className="text-muted-foreground">优先使用已配置的大模型</span>
            <input
              type="checkbox"
              checked={qaPreferLlm}
              onChange={(event) => onPreferLlmChange(event.target.checked)}
              className="accent-primary h-4 w-4"
            />
          </label>

          <div className="text-xs leading-5 text-muted-foreground">
            生成的内容会标记为问答切片，可在检索筛选中选择是否使用。
          </div>

          {qaLastResult?.preview?.length ? (
            <div className="rounded-md border border-border bg-background p-3">
              <div className="mb-2 text-xs font-semibold text-foreground">生成预览</div>
              <div className="max-h-[220px] space-y-2 overflow-auto">
                {qaLastResult.preview.slice(0, 10).map((preview) => (
                  <div key={`${preview.question}-${preview.answer}`} className="rounded-md border border-border bg-muted/10 p-3">
                    <div className="text-xs font-medium text-muted-foreground">问题</div>
                    <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground">{preview.question}</div>
                    <div className="mt-3 text-xs font-medium text-muted-foreground">回答</div>
                    <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground">{preview.answer}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={qaSubmitting}>
            关闭
          </Button>
          <Button
            type="button"
            onClick={onSubmit}
            disabled={!canEditChunks || qaSubmitting || !documentId}
            className="gap-2"
          >
            {qaSubmitting ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> : <Sparkles className="size-4" />}
            生成问答
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
