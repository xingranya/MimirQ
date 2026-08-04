'use client'

import { useMemo } from 'react'
import { Waypoints, GitCommitHorizontal, Shapes } from 'lucide-react'

interface GraphStatsBarProps {
  readonly nodeCount: number
  readonly linkCount: number
  readonly entityTypeCount: number
}

export function GraphStatsBar({ nodeCount, linkCount, entityTypeCount }: GraphStatsBarProps) {
  const items = useMemo(() => [
    { icon: Waypoints, label: '节点', value: nodeCount },
    { icon: GitCommitHorizontal, label: '关系', value: linkCount },
    { icon: Shapes, label: '类型', value: entityTypeCount },
  ], [nodeCount, linkCount, entityTypeCount])

  if (nodeCount === 0 && linkCount === 0) return null

  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2">
      {items.map(({ icon: Icon, label, value }) => (
        <div key={label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon className="size-3.5" aria-hidden="true" />
          <span>{label}</span>
          <span className="font-medium tabular-nums">{value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}
