'use client'

import { Database, Link2, Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

import type { SnapshotDiffPayload } from '../types'
import { exactDiffCount, exactDiffSample, firstDisplayString } from '../utils'

export function DriftCounterCluster({
  groupIcon,
  groupLabel,
  added,
  removed,
  changed,
}: Readonly<{
  groupIcon: ReactNode
  groupLabel: string
  added: number
  removed: number
  changed: number
}>) {
  const total = added + removed + changed
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {groupIcon}
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-foreground">
            {groupLabel}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {total > 0 ? `共 ${total} 条变更` : '暂无变更'}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="inline-flex min-w-[40px] items-center justify-center gap-0.5 rounded-md bg-success/10 px-1.5 py-1 text-xs font-semibold tabular-nums text-success ring-1 ring-success/30">
            <span aria-hidden className="opacity-70">
              +
            </span>
            {added}
          </span>
          <span className="inline-flex min-w-[40px] items-center justify-center gap-0.5 rounded-md bg-destructive/10 px-1.5 py-1 text-xs font-semibold tabular-nums text-destructive ring-1 ring-destructive/30">
            <span aria-hidden className="opacity-70">
              −
            </span>
            {removed}
          </span>
          <span className="inline-flex min-w-[40px] items-center justify-center gap-0.5 rounded-md bg-warning/10 px-1.5 py-1 text-xs font-semibold tabular-nums text-warning ring-1 ring-warning/30">
            <span aria-hidden className="opacity-70">
              Δ
            </span>
            {changed}
          </span>
        </div>
      </div>
    </div>
  )
}

export function SnapshotExactDriftPanel({
  diff,
}: Readonly<{ diff: SnapshotDiffPayload | null }>) {
  const nodeSummary = diff?.node_diff
  const edgeSummary = diff?.edge_diff
  const hasExactDiff = Boolean(nodeSummary || edgeSummary)
  const sampleRows = [
    {
      label: '新增节点',
      key: 'nodes_added',
      icon: <Database className="h-3.5 w-3.5" />,
      tone: 'text-success',
      tint: 'bg-success/10',
    },
    {
      label: '移除节点',
      key: 'nodes_removed',
      icon: <Database className="h-3.5 w-3.5" />,
      tone: 'text-destructive',
      tint: 'bg-destructive/10',
    },
    {
      label: '变更节点',
      key: 'nodes_changed',
      icon: <Database className="h-3.5 w-3.5" />,
      tone: 'text-warning',
      tint: 'bg-warning/10',
    },
    {
      label: '新增边',
      key: 'edges_added',
      icon: <Link2 className="h-3.5 w-3.5" />,
      tone: 'text-success',
      tint: 'bg-success/10',
    },
    {
      label: '移除边',
      key: 'edges_removed',
      icon: <Link2 className="h-3.5 w-3.5" />,
      tone: 'text-destructive',
      tint: 'bg-destructive/10',
    },
    {
      label: '变更边',
      key: 'edges_changed',
      icon: <Link2 className="h-3.5 w-3.5" />,
      tone: 'text-warning',
      tint: 'bg-warning/10',
    },
  ]

  return (
    <div className="border-b border-border bg-background px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Sparkles
              className="h-3.5 w-3.5 text-primary/70"
              aria-hidden="true"
            />
            节点与关系明细
          </div>
          <div className="mt-1 max-w-[560px] text-xs leading-5 text-muted-foreground">
            {hasExactDiff
              ? '已返回节点和关系明细，可以直接定位新增、移除及属性变化。'
              : '当前结果只有汇总数量，重新执行对比后可查看具体变化。'}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DriftCounterCluster
            groupIcon={<Database className="h-4 w-4" />}
            groupLabel="节点"
            added={exactDiffCount(nodeSummary, 'added_count')}
            removed={exactDiffCount(nodeSummary, 'removed_count')}
            changed={exactDiffCount(nodeSummary, 'changed_count')}
          />
          <DriftCounterCluster
            groupIcon={<Link2 className="h-4 w-4" />}
            groupLabel="关系"
            added={exactDiffCount(edgeSummary, 'added_count')}
            removed={exactDiffCount(edgeSummary, 'removed_count')}
            changed={exactDiffCount(edgeSummary, 'changed_count')}
          />
        </div>
      </div>

      {hasExactDiff ? (
        <div className="mt-3 grid gap-2 lg:grid-cols-3">
          {sampleRows.map((row) => {
            const items = exactDiffSample(diff, row.key)
            const preview = items
              .slice(0, 3)
              .map((item) => firstDisplayString(item.name, item.id) || '未命名')
              .join(' / ')
            return (
              <div
                key={row.key}
                className="rounded-md border border-border bg-background px-3 py-2 hover:bg-muted/30"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <span
                      className={cn(
                        'flex h-5 w-5 items-center justify-center rounded-md',
                        row.tint,
                        row.tone
                      )}
                    >
                      {row.icon}
                    </span>
                    {row.label}
                  </span>
                  <span
                    className={cn(
                      'text-xs font-semibold tabular-nums',
                      row.tone
                    )}
                  >
                    {items.length}
                  </span>
                </div>
                <div
                  className="mt-1 truncate text-xs text-muted-foreground"
                  title={preview || '暂无样本'}
                >
                  {preview || '暂无样本'}
                </div>
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
