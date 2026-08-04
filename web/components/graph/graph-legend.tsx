'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { toTrimmedPrimitiveString } from '@/lib/primitive-text'
import { cn } from '@/lib/utils'
import { buildTypeColorMap, EVENT_COLOR } from './graph-colors'
import { EDGE_KIND_COLORS } from './graph-viewer'

interface EntityTypeEntry {
  type: string
  color: string
  count: number
}

interface EdgeKindEntry {
  kind: string
  label: string
  color: string
  count: number
}

interface GraphLegendProps {
  readonly nodes: readonly unknown[]
  readonly links?: readonly unknown[]
  readonly activeTypeFilters?: readonly string[]
  readonly onToggleTypeFilter?: (type: string) => void
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function metaRecord(value: unknown): Record<string, unknown> {
  const record = asRecord(value)
  return asRecord(record.meta)
}

export function GraphLegend({ nodes, links = [], activeTypeFilters = [], onToggleTypeFilter }: GraphLegendProps) {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (globalThis.window.matchMedia('(max-width: 767px)').matches) {
      setCollapsed(true)
    }
  }, [])

  const entityTypes = useMemo<EntityTypeEntry[]>(() => {
    const colorMap = buildTypeColorMap(nodes)
    const countMap = new Map<string, number>()
    let eventCount = 0

    for (const node of nodes) {
      const nodeRecord = asRecord(node)
      const meta = metaRecord(node)
      const kind = toTrimmedPrimitiveString(meta.kind)
      if (kind === 'event') {
        eventCount++
        continue
      }
      const type = toTrimmedPrimitiveString(meta.type ?? nodeRecord.type, 'unknown')
      countMap.set(type, (countMap.get(type) || 0) + 1)
    }

    const entries: EntityTypeEntry[] = []

    if (eventCount > 0) {
      entries.push({ type: 'Event', color: EVENT_COLOR, count: eventCount })
    }

    for (const [type, count] of countMap.entries()) {
      entries.push({ type, color: colorMap.get(type) || '#94a3b8', count })
    }

    return entries.sort((a, b) => b.count - a.count)
  }, [nodes])

  const edgeKinds = useMemo<EdgeKindEntry[]>(() => {
    const countMap = new Map<string, number>()
    for (const link of links || []) {
      const linkRecord = asRecord(link)
      const meta = metaRecord(link)
      const kind = toTrimmedPrimitiveString(meta.kind ?? linkRecord.kind, 'unknown')
      countMap.set(kind, (countMap.get(kind) || 0) + 1)
    }

    const labels: Record<string, string> = {
      entity_relation: '有向关系',
      event_entity: '事件关联',
      entity_entity: '实体关系',
    }

    const entries: EdgeKindEntry[] = []
    for (const [kind, count] of countMap.entries()) {
      entries.push({
        kind,
        label: labels[kind] || kind,
        color: EDGE_KIND_COLORS[kind] || '#94a3b8',
        count,
      })
    }
    return entries.sort((a, b) => b.count - a.count)
  }, [links])

  if (entityTypes.length === 0 && edgeKinds.length === 0) return null

  return (
    <div className="absolute bottom-4 left-4 z-10 md:bottom-8 md:left-8">
      <div className="max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border border-border bg-card md:max-w-[340px]">
          <button
            type="button"
            onClick={() => setCollapsed(prev => !prev)}
            className="flex w-full items-center justify-between px-3.5 py-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            <span>图例</span>
            <span className="flex items-center gap-1.5">
              <span className="text-xs font-normal opacity-70">
                {entityTypes.length}{edgeKinds.length ? ` / ${edgeKinds.length}` : ''}
              </span>
              {collapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </span>
          </button>
        {!collapsed && (
          <div className="px-3.5 pb-3 pt-0.5 space-y-3 max-h-[180px] overflow-y-auto overscroll-contain no-scrollbar">
            {entityTypes.length > 0 && (
              <div>
                <div className="mb-2 text-xs font-medium text-muted-foreground">节点类型</div>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {entityTypes.map(({ type, color, count }) => {
                    const isActive = activeTypeFilters.length === 0 || activeTypeFilters.includes(type)
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => onToggleTypeFilter?.(type)}
                        className={cn(
                          "flex items-center gap-1.5 text-xs transition-opacity",
                          isActive ? "opacity-100" : "opacity-40"
                        )}
                        title={`${type} (${count})`}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0 ring-1 ring-black/5"
                          style={{ backgroundColor: color }}
                        />
                        <span className="text-foreground/80 whitespace-nowrap">{type}</span>
                        <span className="text-xs text-muted-foreground">{count}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            {edgeKinds.length > 0 && (
              <div>
                <div className="mb-2 text-xs font-medium text-muted-foreground">关系类型</div>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {edgeKinds.map(({ kind, label, color, count }) => (
                    <div key={kind} className="flex items-center gap-1.5 text-xs" title={`${kind} (${count})`}>
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 ring-1 ring-black/5" style={{ backgroundColor: color }} />
                      <span className="text-foreground/80 whitespace-nowrap">{label}</span>
                      <span className="text-xs text-muted-foreground">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
