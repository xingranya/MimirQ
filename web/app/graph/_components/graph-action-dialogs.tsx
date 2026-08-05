'use client'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type {
  KGEntityAliasItem,
  KGEntityDetailResponse,
  KGEntityMergePreviewResponse,
  KGGraphNode,
} from '@/types'

import type { GraphNodeLike } from '../graph-page-utils'

function primitiveText(value: unknown, fallback = '—'): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return fallback
}

type GraphDeleteNodeTarget = {
  id: string
  label: string
}

type GraphActionDialogsProps = Readonly<{
  deleteNodeOpen: boolean
  deleteNodeTarget: GraphDeleteNodeTarget | null
  onDeleteNodeOpenChange: (open: boolean) => void
  onConfirmDeleteNode: () => void

  aliasDeleteOpen: boolean
  aliasDeleteTarget: KGEntityAliasItem | null
  aliasSaving: boolean
  onAliasDeleteOpenChange: (open: boolean) => void
  onConfirmDeleteAlias: () => void

  mergeOpen: boolean
  onMergeOpenChange: (open: boolean) => void
  mergeSearch: string
  onMergeSearchChange: (value: string) => void
  mergeSearchLoading: boolean
  mergeSearchResults: KGGraphNode[]
  mergeTarget: KGGraphNode | null
  mergePreview: KGEntityMergePreviewResponse | null
  mergePreviewLoading: boolean
  mergeError: string | null
  mergeConfirmOpen: boolean
  onMergeConfirmOpenChange: (open: boolean) => void
  mergeSubmitting: boolean
  onSelectMergeTarget: (node: KGGraphNode) => void
  onContinueMerge: () => void
  onSubmitMerge: () => void

  splitOpen: boolean
  onSplitOpenChange: (open: boolean) => void
  splitNameDraft: string
  onSplitNameDraftChange: (value: string) => void
  splitSelectedEventIds: Set<string>
  splitSubmitting: boolean
  splitError: string | null
  splitEvents: KGEntityDetailResponse['events']
  onToggleSplitEvent: (eventId: string, checked: boolean) => void
  onSubmitSplit: () => void

  connectLabelOpen: boolean
  onConnectLabelOpenChange: (open: boolean) => void
  connectSourceNode: GraphNodeLike | null
  connectTargetNode: GraphNodeLike | null
  connectLabelDraft: string
  onConnectLabelDraftChange: (value: string) => void
  onConfirmConnectionLabel: () => void
}>

export function GraphActionDialogs({
  deleteNodeOpen,
  deleteNodeTarget,
  onDeleteNodeOpenChange,
  onConfirmDeleteNode,
  aliasDeleteOpen,
  aliasDeleteTarget,
  aliasSaving,
  onAliasDeleteOpenChange,
  onConfirmDeleteAlias,
  mergeOpen,
  onMergeOpenChange,
  mergeSearch,
  onMergeSearchChange,
  mergeSearchLoading,
  mergeSearchResults,
  mergeTarget,
  mergePreview,
  mergePreviewLoading,
  mergeError,
  mergeConfirmOpen,
  onMergeConfirmOpenChange,
  mergeSubmitting,
  onSelectMergeTarget,
  onContinueMerge,
  onSubmitMerge,
  splitOpen,
  onSplitOpenChange,
  splitNameDraft,
  onSplitNameDraftChange,
  splitSelectedEventIds,
  splitSubmitting,
  splitError,
  splitEvents,
  onToggleSplitEvent,
  onSubmitSplit,
  connectLabelOpen,
  onConnectLabelOpenChange,
  connectSourceNode,
  connectTargetNode,
  connectLabelDraft,
  onConnectLabelDraftChange,
  onConfirmConnectionLabel,
}: GraphActionDialogsProps) {
  let mergeSearchContent: React.ReactNode
  if (mergeSearchLoading) {
    mergeSearchContent = <div className="text-xs text-muted-foreground">正在搜索…</div>
  } else if (mergeSearch.trim().length < 2) {
    mergeSearchContent = (
      <div className="text-xs text-muted-foreground">输入至少 2 个字符开始搜索</div>
    )
  } else if (mergeSearchResults.length === 0) {
    mergeSearchContent = <div className="text-xs text-muted-foreground">没有找到匹配的实体</div>
  } else {
    mergeSearchContent = (
      <div className="space-y-1">
        {mergeSearchResults.slice(0, 8).map((node) => (
          <button
            key={node.id}
            type="button"
            onClick={() => onSelectMergeTarget(node)}
            className={cn(
              'w-full rounded-md border border-border bg-background px-3 py-2 text-left text-xs transition-colors hover:bg-muted',
              mergeTarget?.id === node.id && 'ring-2 ring-primary/20 border-primary/30'
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate">{node.label || node.id}</span>
              <span className="text-muted-foreground font-mono">{String(node.id).slice(0, 8)}</span>
            </div>
          </button>
        ))}
      </div>
    )
  }

  let mergePreviewContent: React.ReactNode = null
  if (mergeTarget) {
    let mergePreviewDetails: React.ReactNode
    if (mergePreviewLoading) {
      mergePreviewDetails = <div className="text-xs text-muted-foreground">正在生成预览…</div>
    } else if (mergePreview) {
      mergePreviewDetails = (
        <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
          <div>来源事件边：{primitiveText(mergePreview.stats?.source_event_entity_edges)}</div>
          <div>重复事件：{primitiveText(mergePreview.stats?.overlap_events)}</div>
          <div>关系边：{primitiveText(mergePreview.stats?.source_relations)}</div>
          <div>移除自关联：{primitiveText(mergePreview.stats?.self_relations_removed)}</div>
        </div>
      )
    } else {
      mergePreviewDetails = <div className="text-xs text-muted-foreground">暂时无法生成预览</div>
    }

    mergePreviewContent = (
      <div className="space-y-2 rounded-md border border-border bg-muted p-3">
        <div className="text-[11px] font-medium text-muted-foreground">合并预览</div>
        <div className="text-xs text-foreground truncate" title={mergeTarget.label}>
          目标实体：{mergeTarget.label || mergeTarget.id}
        </div>
        {mergePreviewDetails}
      </div>
    )
  }

  return (
    <>
      <AlertDialog open={deleteNodeOpen} onOpenChange={onDeleteNodeOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除节点？</AlertDialogTitle>
            <AlertDialogDescription>
              你将删除节点 <span className="font-mono">{deleteNodeTarget?.label || '-'}</span>{' '}
              及其所有连线。此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmDeleteNode}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={aliasDeleteOpen} onOpenChange={onAliasDeleteOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除别名？</AlertDialogTitle>
            <AlertDialogDescription>
              你将删除别名 <span className="font-mono">{aliasDeleteTarget?.alias || '-'}</span>
              。如有需要，可以稍后重新添加。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmDeleteAlias} disabled={aliasSaving}>
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={mergeOpen} onOpenChange={onMergeOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>合并实体</DialogTitle>
            <DialogDescription>
              将当前实体合并到另一个实体。提交前请先检查合并预览，操作完成后仍可撤销。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="kg-merge-search">搜索目标实体</Label>
              <Input
                id="kg-merge-search"
                value={mergeSearch}
                onChange={(event) => onMergeSearchChange(event.target.value)}
                placeholder="输入名称关键词…"
              />

              {mergeSearchContent}
            </div>

            {mergePreviewContent}

            {mergeError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                {mergeError}
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onMergeOpenChange(false)}>
              取消
            </Button>
            <Button
              type="button"
              onClick={onContinueMerge}
              disabled={!mergeTarget || mergeSubmitting || mergePreviewLoading}
            >
              继续
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={mergeConfirmOpen} onOpenChange={onMergeConfirmOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认合并？</AlertDialogTitle>
            <AlertDialogDescription>
              你将把当前实体合并到 <span className="font-mono">{mergeTarget?.label || '-'}</span>
              。合并会重写事件边与关系边，但可通过“撤销上次变更”恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mergeSubmitting}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={onSubmitMerge} disabled={mergeSubmitting || !mergeTarget}>
              {mergeSubmitting ? '合并中…' : '确认合并'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={splitOpen} onOpenChange={onSplitOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>拆分实体</DialogTitle>
            <DialogDescription>选择需要移动到新实体的事件（可撤销）。</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="kg-split-name">新实体名称</Label>
              <Input
                id="kg-split-name"
                value={splitNameDraft}
                onChange={(event) => onSplitNameDraftChange(event.target.value)}
                placeholder="例如：Python 语言"
              />
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">选择最近事件</div>
              <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-border bg-background p-2">
                {splitEvents?.slice(0, 30)?.map((event) => {
                  const checked = splitSelectedEventIds.has(String(event.id))
                  return (
                    <label
                      key={event.id}
                      className="flex items-start gap-2 text-xs text-foreground"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) =>
                          onToggleSplitEvent(String(event.id), Boolean(value))
                        }
                        aria-label={`选择事件 ${event.title}`}
                      />
                      <span className="flex-1 truncate" title={event.title}>
                        {event.title || event.id}
                      </span>
                    </label>
                  )
                })}

                {splitEvents?.length ? null : (
                  <div className="p-2 text-xs text-muted-foreground">暂无可拆分事件</div>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground">
                已选择 {splitSelectedEventIds.size} 个事件（最多显示 30 条）
              </div>
            </div>

            {splitError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                {splitError}
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onSplitOpenChange(false)}>
              取消
            </Button>
            <Button type="button" onClick={onSubmitSplit} disabled={splitSubmitting}>
              {splitSubmitting ? '拆分中…' : '确认拆分'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={connectLabelOpen} onOpenChange={onConnectLabelOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>关系名称</DialogTitle>
            <DialogDescription>
              {connectSourceNode?.label && connectTargetNode?.label ? (
                <>
                  将创建连线：<span className="font-mono">{String(connectSourceNode.label)}</span> →{' '}
                  <span className="font-mono">{String(connectTargetNode.label)}</span>
                </>
              ) : (
                '请输入关系名称（例如：related_to）'
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="graph-connect-label">关系名称</Label>
            <Input
              id="graph-connect-label"
              value={connectLabelDraft}
              onChange={(event) => onConnectLabelDraftChange(event.target.value)}
              placeholder="related_to"
              className="font-mono"
            />
            <div className="text-xs text-muted-foreground">
              留空将使用默认值：<span className="font-mono">related_to</span>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onConnectLabelOpenChange(false)}>
              取消
            </Button>
            <Button type="button" onClick={onConfirmConnectionLabel}>
              创建连线
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
