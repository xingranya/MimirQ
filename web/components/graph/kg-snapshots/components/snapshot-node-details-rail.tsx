'use client'

import { ChevronRight, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { snapshotToneClassName } from '../snapshot-graph'
import type { SnapshotStudioNode } from '../types'

export function SnapshotNodeDetailsRail({
  selectedNode,
  diffOverview,
  onClose,
  onSelectRelationTarget,
}: Readonly<{
  selectedNode: SnapshotStudioNode | null
  diffOverview: Array<{ label: string; value: number; tone: string }>
  onClose: () => void
  onSelectRelationTarget: (targetId: string) => void
}>) {
  if (!selectedNode) return null

  return (
    <aside className="hidden min-h-0 w-[280px] shrink-0 flex-col border-l border-border bg-background xl:flex">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <div className="text-sm font-semibold text-foreground">
          节点详情
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg text-muted-foreground"
          title="收起详情"
          aria-label="收起节点详情"
          onClick={onClose}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <>
            <div className="flex items-start gap-3">
              <div
                className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-primary-foreground',
                  snapshotToneClassName(selectedNode.tone, false)
                )}
              >
                {selectedNode.icon}
              </div>
              <div className="min-w-0">
                <div className="truncate text-base font-semibold text-foreground">
                  {selectedNode.label}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>ID: {selectedNode.id}</span>
                  <Badge variant="soft" className="text-xs">
                    {selectedNode.type}
                  </Badge>
                </div>
              </div>
            </div>

            <section className="mt-5 border-t border-border pt-4">
              <div className="text-sm font-semibold text-foreground">
                属性
              </div>
              <div className="mt-3 space-y-3 text-xs">
                {[
                  ['名称', selectedNode.label],
                  ['类型', selectedNode.type],
                  ['描述', selectedNode.description],
                  ['出现次数', String(selectedNode.occurrences)],
                  ['A/B 状态', selectedNode.status],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="grid grid-cols-[64px_minmax(0,1fr)] gap-3"
                  >
                    <span className="text-muted-foreground">{label}</span>
                    <span className="min-w-0 text-foreground">{value}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-4 border-t border-border pt-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-foreground">
                  关联关系 ({selectedNode.relations.length})
                </div>
              </div>
              <div className="mt-3 divide-y divide-border/60">
                {selectedNode.relations.map((relation) => (
                  <button
                    key={`${relation.label}:${relation.target}`}
                    type="button"
                    className="flex min-h-9 w-full items-center justify-between gap-3 py-2 text-left text-xs transition-colors hover:text-primary"
                    onClick={() => onSelectRelationTarget(relation.targetId)}
                  >
                    <span className="inline-flex items-center gap-2 text-muted-foreground">
                      <ChevronRight
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                      />
                      {relation.label}
                    </span>
                    <span className="truncate font-medium text-foreground">
                      {relation.target}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </>

        <section className="mt-4 border-t border-border pt-4">
          <div className="text-sm font-semibold text-foreground">
            差异概览
          </div>
          <div className="mt-3 space-y-2">
            {diffOverview.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between gap-3 text-xs"
              >
                <span className="inline-flex items-center gap-2 text-muted-foreground">
                  <span
                    className={cn('h-2.5 w-2.5 rounded-full', item.tone)}
                    aria-hidden
                  />
                  {item.label}
                </span>
                <span className="font-mono font-semibold tabular-nums text-foreground">
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </aside>
  )
}
