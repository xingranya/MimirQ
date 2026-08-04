'use client'

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react'

import { Network, PanelRightClose, PanelRightOpen, Rows3 } from 'lucide-react'
import dynamic from 'next/dynamic'

import type { Remote } from 'comlink'

import { GraphLoadingIndicator } from '@/components/graph/graph-loading-indicator'
import { GraphViewer, type GraphViewerRef, type LayoutMode } from '@/components/graph/graph-viewer'
import type { KnowledgeGraph3DRef } from '@/components/graph/force-graph-3d'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { reportClientWarning } from '@/lib/client-logging'
import type { GraphClusterResult } from '@/lib/graph-clustering'
import type { GraphData } from '@/lib/graph-parser'
import { cn, detachPromise } from '@/lib/utils'
import type { GraphClusteringWorkerApi } from '@/workers/graph-clustering.worker'

import type { GraphLinkLike, GraphNodeLike } from '../graph-page-utils'
import { getNextKeyboardRovingIndex } from './graph-keyboard-roving'

const SEMANTIC_LIST_ITEM_LIMIT = 200
const FRONTEND_TRACE_MIN_DURATION_MS = 12
const SEMANTIC_NODE_TONES = ['#89dfe6', '#b6e3ff', '#d3f3b8', '#f3dfb3', '#d7dcff', '#f8cfd8'] as const

function getSemanticNodeTone(seed: string) {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = Math.trunc((hash * 31 + (seed.codePointAt(index) ?? 0)) % 0x7fffffff)
  }
  return SEMANTIC_NODE_TONES[Math.abs(hash) % SEMANTIC_NODE_TONES.length]
}

function primitiveText(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return fallback
}

function getCanvasBackdropStyle(isDark: boolean) {
  return { backgroundColor: isDark ? '#0f1722' : '#f8fafc' } as const
}

function getNowMs(): number {
  if (typeof globalThis.performance?.now === 'function') {
    return globalThis.performance.now()
  }
  return Date.now()
}

function getFrontendTracePage(): string {
  if (globalThis.window === undefined) return '/graph'
  return globalThis.window.location?.pathname || '/graph'
}

function reportGraphCanvasTrace(payload: {
  event: 'graph_cluster_compute' | 'graph_cluster_palette'
  duration_ms: number
  input_node_count: number
  input_link_count: number
  output_node_count: number
  output_link_count: number
}) {
  if (payload.duration_ms < FRONTEND_TRACE_MIN_DURATION_MS) return

  void import('@/lib/frontend-trace')
    .then(({ reportFrontendTrace }) =>
      reportFrontendTrace(
        {
          ...payload,
          component: 'graph-canvas',
          page: getFrontendTracePage(),
        },
        { keepalive: true }
      )
    )
    .catch((error) => {
      reportClientWarning('Failed to report graph canvas trace', error)
    })
}

const KnowledgeGraph3D = dynamic(
  () => import('@/components/graph/force-graph-3d').then((mod) => mod.KnowledgeGraph3D),
  {
    ssr: false,
    loading: () => (
      <div className="absolute inset-0 z-10 flex items-center justify-center">
        <div className="flex w-full max-w-lg flex-col items-center gap-3 rounded-md border border-border bg-background p-5">
          <GraphLoadingIndicator
            className="min-h-0"
            message="正在构建 3D 图谱…"
            srMessage="正在加载图谱画布"
            hint="正在同步节点布局与交互层"
          />
          <div className="grid w-full gap-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-[60%]" />
          </div>
        </div>
      </div>
    ),
  }
)

type GraphCanvasProps = Readonly<{
  viewportRef: RefObject<HTMLDivElement | null>
  graph2dRef: RefObject<GraphViewerRef | null>
  graph3dRef: RefObject<KnowledgeGraph3DRef | null>
  isDark: boolean
  graphRenderData: GraphData
  paletteSeed?: string | null
  viewMode: '2d' | '3d'
  graphViewportWidth: number
  graphViewportHeight: number
  selectedNodeId: string | null
  highlightedNodeIds: Set<string>
  highlightedLinkIds: Set<string>
  showEdgeLabels: boolean
  layoutMode: LayoutMode
  isLoading: boolean
  hasActiveScope: boolean
  onNodeClick: (node: GraphNodeLike) => void
  onNodeRightClick: (node: GraphNodeLike, event: MouseEvent) => void
  onLinkClick: (link: GraphLinkLike) => void
  onLinkRightClick: (link: GraphLinkLike, event: MouseEvent) => void
  onBackgroundClick: () => void
  onBackgroundRightClick: (event: MouseEvent) => void
  onOpenGraphPicker: () => void
  onTriggerManualKgUpload: () => void
}>

function normalizeNodeLabel(node: Record<string, unknown>, fallback: string) {
  const candidate = [node.label, node.name, node.title, node.id].find(
    (value) => typeof value === 'string' && value.trim().length > 0
  )
  return typeof candidate === 'string' ? candidate : fallback
}

function normalizeLinkEndpoint(endpoint: unknown) {
  if (typeof endpoint === 'string' && endpoint.trim()) return endpoint
  if (typeof endpoint === 'number') return String(endpoint)
  if (endpoint && typeof endpoint === 'object' && 'id' in endpoint) {
    const value = (endpoint as { id?: unknown }).id
    if (typeof value === 'string' && value.trim()) return value
    if (typeof value === 'number') return String(value)
  }
  return 'unknown'
}

export function GraphCanvas({
  viewportRef,
  graph2dRef,
  graph3dRef,
  isDark,
  graphRenderData,
  paletteSeed = null,
  viewMode,
  graphViewportWidth,
  graphViewportHeight,
  selectedNodeId,
  highlightedNodeIds,
  highlightedLinkIds,
  showEdgeLabels,
  layoutMode,
  isLoading,
  hasActiveScope,
  onNodeClick,
  onNodeRightClick,
  onLinkClick,
  onLinkRightClick,
  onBackgroundClick,
  onBackgroundRightClick,
  onOpenGraphPicker,
  onTriggerManualKgUpload,
}: GraphCanvasProps) {
  const [isSemanticListVisible, setIsSemanticListVisible] = useState(viewMode === '3d')
  const [clusterResult, setClusterResult] = useState<GraphClusterResult | null>(null)
  const [effectiveGraphRenderData, setEffectiveGraphRenderData] = useState<GraphData>(graphRenderData)
  const [keyboardRovingIndex, setKeyboardRovingIndex] = useState(-1)
  const semanticPanelId = useId()
  const semanticNodeCount = graphRenderData.nodes.length
  const semanticLinkCount = graphRenderData.links.length
  const isSemanticListTruncated =
    semanticNodeCount > SEMANTIC_LIST_ITEM_LIMIT || semanticLinkCount > SEMANTIC_LIST_ITEM_LIMIT

  const clusteringSeqRef = useRef(0)
  const clusteringWorkerRef = useRef<Worker | null>(null)
  const clusteringApiRef = useRef<Remote<GraphClusteringWorkerApi> | null>(null)
  const clusteringDisabledRef = useRef(false)
  const lastClusterTraceKeyRef = useRef<string | null>(null)
  const lastPaletteTraceKeyRef = useRef<string | null>(null)
  const semanticNodeButtonRefs = useRef(new Map<string, HTMLButtonElement>())

  useEffect(() => {
    if (viewMode === '3d') {
      setIsSemanticListVisible(!globalThis.window.matchMedia('(max-width: 767px)').matches)
    }
  }, [viewMode])

  useEffect(() => {
    const seq = ++clusteringSeqRef.current
    const nodeCount = graphRenderData.nodes.length
    let cancelled = false
    if (!nodeCount) {
      setClusterResult(null)
      return
    }

    const nodes = graphRenderData.nodes.map((n) => ({ id: n.id, label: n.label }))
    const links = graphRenderData.links.map((l) => ({ source: l.source, target: l.target, label: l.label }))

    const computeOnMainThread = async () => {
      try {
        const startedAt = getNowMs()
        const { computeConnectedComponents } = await import('@/lib/graph-clustering')
        if (cancelled) return
        const res = computeConnectedComponents({ nodes, links })
        if (clusteringSeqRef.current === seq) {
          setClusterResult(res)
        }
        const durationMs = Math.max(0, getNowMs() - startedAt)
        const traceKey = ['main', nodeCount, links.length, res.clusterCount, Math.round(durationMs)].join(':')
        if (lastClusterTraceKeyRef.current !== traceKey) {
          lastClusterTraceKeyRef.current = traceKey
          reportGraphCanvasTrace({
            event: 'graph_cluster_compute',
            duration_ms: durationMs,
            input_node_count: nodeCount,
            input_link_count: links.length,
            output_node_count: nodes.length,
            output_link_count: links.length,
          })
        }
      } catch (e) {
        reportClientWarning('Failed to compute graph clusters; falling back to null', e)
        if (clusteringSeqRef.current === seq) {
          setClusterResult(null)
        }
      }
    }

    if (clusteringDisabledRef.current || typeof Worker === 'undefined') {
      detachPromise(computeOnMainThread())
      return () => {
        cancelled = true
      }
    }

    detachPromise((async () => {
      try {
        const startedAt = getNowMs()
        if (!clusteringWorkerRef.current || !clusteringApiRef.current) {
          const { wrap } = await import('comlink')
          if (cancelled) return
          clusteringWorkerRef.current = new Worker(
            new URL('../../../workers/graph-clustering.worker.ts', import.meta.url),
            { type: 'module' }
          )
          clusteringApiRef.current = wrap<GraphClusteringWorkerApi>(clusteringWorkerRef.current)
        }

        const res = await clusteringApiRef.current.computeConnectedComponents({
          nodes,
          links,
        })

        if (cancelled) return
        if (clusteringSeqRef.current !== seq) return
        setClusterResult(res)
        const durationMs = Math.max(0, getNowMs() - startedAt)
        const traceKey = ['worker', nodeCount, links.length, res.clusterCount, Math.round(durationMs)].join(':')
        if (lastClusterTraceKeyRef.current !== traceKey) {
          lastClusterTraceKeyRef.current = traceKey
          reportGraphCanvasTrace({
            event: 'graph_cluster_compute',
            duration_ms: durationMs,
            input_node_count: nodeCount,
            input_link_count: links.length,
            output_node_count: nodes.length,
            output_link_count: links.length,
          })
        }
      } catch (e) {
        reportClientWarning('Graph clustering worker failed; falling back to main thread', e)
        clusteringDisabledRef.current = true
        detachPromise(computeOnMainThread())
      }
    })())

    return () => {
      cancelled = true
    }
  }, [graphRenderData.links, graphRenderData.nodes])

  useEffect(() => {
    let cancelled = false

    if (!paletteSeed || !clusterResult?.nodeToCluster) {
      setEffectiveGraphRenderData(graphRenderData)
      return
    }

    detachPromise((async () => {
      const startedAt = getNowMs()
      const { applyClusterPalette } = await import('@/lib/graph-cluster-palette')
      if (cancelled) return
      const next = applyClusterPalette({
        graphRenderData,
        paletteSeed,
        clusterResult,
      })
      if (!cancelled) {
        setEffectiveGraphRenderData(next)
      }
      const durationMs = Math.max(0, getNowMs() - startedAt)
      const traceKey = [
        paletteSeed,
        graphRenderData.nodes.length,
        graphRenderData.links.length,
        clusterResult.clusterCount,
        Math.round(durationMs),
      ].join(':')
      if (lastPaletteTraceKeyRef.current !== traceKey) {
        lastPaletteTraceKeyRef.current = traceKey
        reportGraphCanvasTrace({
          event: 'graph_cluster_palette',
          duration_ms: durationMs,
          input_node_count: graphRenderData.nodes.length,
          input_link_count: graphRenderData.links.length,
          output_node_count: next.nodes.length,
          output_link_count: next.links.length,
        })
      }
    })())

    return () => {
      cancelled = true
    }
  }, [clusterResult, graphRenderData, paletteSeed])

  const semanticNodes = useMemo(
    () =>
      graphRenderData.nodes.slice(0, SEMANTIC_LIST_ITEM_LIMIT).map((node, index) => {
        const nodeRecord = node as unknown as Record<string, unknown>
        const meta = (nodeRecord.meta ?? {}) as Record<string, unknown>
        const nodeId =
          typeof nodeRecord.id === 'string' && nodeRecord.id.trim().length > 0 ? nodeRecord.id : `node-${index + 1}`
        const type = primitiveText(meta.type ?? nodeRecord.type, 'unknown').trim() || 'unknown'
        const kind = primitiveText(meta.kind, 'entity').trim() || 'entity'
        return {
          id: nodeId,
          label: normalizeNodeLabel(nodeRecord, nodeId),
          type,
          kind,
          raw: node,
        }
      }),
    [graphRenderData.nodes]
  )
  const semanticLinks = useMemo(
    () =>
      graphRenderData.links.slice(0, SEMANTIC_LIST_ITEM_LIMIT).map((link, index) => {
        const linkRecord = link as unknown as Record<string, unknown>
        const meta = (linkRecord.meta ?? {}) as Record<string, unknown>
        const source = normalizeLinkEndpoint(linkRecord.source)
        const target = normalizeLinkEndpoint(linkRecord.target)
        const relation = primitiveText(linkRecord.label ?? linkRecord.relation ?? meta.kind, '关联').trim() || '关联'
        return {
          id: `${source}-${target}-${index}`,
          source,
          target,
          relation,
        }
      }),
    [graphRenderData.links]
  )
  const semanticRelationSummary = useMemo(() => {
    const counts = new Map<string, number>()
    for (const link of semanticLinks) {
      counts.set(link.relation, (counts.get(link.relation) ?? 0) + 1)
    }

    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([relation, count]) => ({ relation, count }))
  }, [semanticLinks])
  const focusSemanticNode = useCallback(
    (nodeId: string) => {
      graph3dRef.current?.focusNode(nodeId)
      graph2dRef.current?.focusNode(nodeId)
    },
    [graph2dRef, graph3dRef]
  )
  const setSemanticNodeButtonRef = useCallback((nodeId: string, element: HTMLButtonElement | null) => {
    if (element) {
      semanticNodeButtonRefs.current.set(nodeId, element)
      return
    }
    semanticNodeButtonRefs.current.delete(nodeId)
  }, [])

  const moveKeyboardRovingFocus = useCallback((direction: 1 | -1) => {
    if (!semanticNodes.length) return

    const nextIndex = getNextKeyboardRovingIndex(keyboardRovingIndex, semanticNodes.length, direction)
    if (nextIndex < 0) return

    const nextNode = semanticNodes[nextIndex]
    const focusNextNode = () => {
      setKeyboardRovingIndex(nextIndex)
      focusSemanticNode(nextNode.id)
      onNodeClick(nextNode.raw)
      semanticNodeButtonRefs.current.get(nextNode.id)?.focus()
    }

    if (!isSemanticListVisible) {
      setIsSemanticListVisible(true)
      globalThis.window.requestAnimationFrame(focusNextNode)
      return
    }

    focusNextNode()
  }, [focusSemanticNode, isSemanticListVisible, keyboardRovingIndex, onNodeClick, semanticNodes])

  const handleCanvasKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (viewMode !== '3d') return
    if (event.key !== 'Tab') return
    if (event.altKey || event.ctrlKey || event.metaKey) return
    if (event.target !== event.currentTarget) return

    event.preventDefault()
    moveKeyboardRovingFocus(event.shiftKey ? -1 : 1)
  }, [moveKeyboardRovingFocus, viewMode])

  useEffect(() => {
    setKeyboardRovingIndex((currentIndex) => {
      if (!semanticNodes.length) return -1
      return currentIndex >= semanticNodes.length ? semanticNodes.length - 1 : currentIndex
    })
  }, [semanticNodes.length])

  return (
    <div
      ref={viewportRef}
      className="relative h-full min-h-0 w-full flex-1 overflow-hidden bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      tabIndex={0}
      role="grid"
      aria-label="知识图谱画布，按 Tab 浏览节点"
      aria-describedby={viewMode === '3d' ? `${semanticPanelId}-keyboard-help ${semanticPanelId}-keyboard-status` : undefined}
      onKeyDown={handleCanvasKeyDown}
    >
      <div
        className="absolute inset-0 z-0"
        style={getCanvasBackdropStyle(isDark)}
      />
      {graphRenderData.nodes.length > 0 ? (
        <>
          {viewMode === '3d' ? (
            graphViewportWidth > 0 && graphViewportHeight > 0 ? (
              <KnowledgeGraph3D
                ref={graph3dRef}
                data={effectiveGraphRenderData}
                width={graphViewportWidth}
                height={graphViewportHeight}
                onNodeClick={onNodeClick}
                onNodeRightClick={onNodeRightClick}
                onLinkClick={onLinkClick}
                onLinkRightClick={onLinkRightClick}
                onBackgroundClick={onBackgroundClick}
                onBackgroundRightClick={onBackgroundRightClick}
                highlightedNodeIds={highlightedNodeIds}
                highlightedLinkIds={highlightedLinkIds}
                selectedNodeId={selectedNodeId}
                showEdgeLabels={showEdgeLabels}
                layoutMode={layoutMode}
              />
            ) : (
              <div className="absolute inset-0 z-10 flex items-center justify-center">
                <GraphLoadingIndicator
                  className="rounded-md border border-border bg-background px-6 py-5"
                  message="正在准备图谱画布…"
                  srMessage="正在准备图谱画布"
                />
              </div>
            )
          ) : (
            <GraphViewer
              ref={graph2dRef}
              data={effectiveGraphRenderData}
              onNodeClick={onNodeClick}
              onNodeRightClick={onNodeRightClick}
              onLinkClick={onLinkClick}
              onLinkRightClick={onLinkRightClick}
              onBackgroundClick={onBackgroundClick}
              onBackgroundRightClick={onBackgroundRightClick}
              highlightedNodeIds={highlightedNodeIds}
              highlightedLinkIds={highlightedLinkIds}
              selectedNodeId={selectedNodeId}
              showEdgeLabels={showEdgeLabels}
              layoutMode={layoutMode}
            />
          )}
          <aside
            className={cn(
              'pointer-events-none absolute z-20',
              isSemanticListVisible
                ? 'inset-x-2 bottom-2 md:inset-x-auto md:bottom-auto md:right-4 md:top-20 md:w-72'
                : 'right-3 top-20'
            )}
          >
            <TooltipProvider delayDuration={100}>
              <div
                className={cn(
                  'pointer-events-auto overflow-hidden rounded-md border border-border bg-background',
                  isSemanticListVisible && 'max-h-[min(50dvh,26rem)] md:w-72 md:max-h-[calc(100dvh-12rem)]'
                )}
              >
                <div
                  className={cn(
                    'flex items-center gap-2',
                    isSemanticListVisible ? 'border-b border-border px-3 py-2' : 'p-1'
                  )}
                >
                  {isSemanticListVisible ? (
                    <>
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Network className="size-4" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h2 className="text-sm font-medium text-foreground">语义索引</h2>
                        <p className="text-xs leading-5 text-muted-foreground">
                          {semanticNodeCount} 个节点，{semanticLinkCount} 条关系
                        </p>
                      </div>
                    </>
                  ) : null}

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-10 shrink-0 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label={isSemanticListVisible ? '隐藏语义列表' : '显示语义列表'}
                        aria-expanded={isSemanticListVisible}
                        aria-controls={semanticPanelId}
                        onClick={() => setIsSemanticListVisible((visible) => !visible)}
                      >
                        {isSemanticListVisible ? (
                          <PanelRightClose className="size-4" aria-hidden="true" />
                        ) : (
                          <PanelRightOpen className="size-4" aria-hidden="true" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="rounded-md text-xs">
                      {isSemanticListVisible ? '隐藏语义列表' : '显示语义列表'}
                    </TooltipContent>
                  </Tooltip>
                </div>

                {viewMode === '3d' ? (
                  <p id={`${semanticPanelId}-keyboard-help`} className="sr-only">
                    3D 视图为视觉展示，语义列表提供可读结构；按 Tab 键逐个聚焦节点，按 Shift 与 Tab 键反向切换。
                  </p>
                ) : null}
                <p
                  id={`${semanticPanelId}-keyboard-status`}
                  aria-live="polite"
                  className="sr-only"
                >
                  {keyboardRovingIndex >= 0 && semanticNodes[keyboardRovingIndex]
                    ? `键盘当前聚焦：${semanticNodes[keyboardRovingIndex].label}（${keyboardRovingIndex + 1}/${semanticNodes.length}）`
                    : '键盘当前聚焦：尚未选中节点'}
                </p>
                <section
                  id={semanticPanelId}
                  hidden={!isSemanticListVisible}
                  aria-label="知识图谱语义结构列表"
                  className="max-h-[calc(50dvh-3.5rem)] space-y-4 overflow-y-auto p-3 md:max-h-[calc(100dvh-16rem)]"
                >
                  {isSemanticListVisible ? (
                    <>
                      <section aria-labelledby={`${semanticPanelId}-nodes`}>
                        <div className="flex items-center justify-between gap-2">
                          <h3 id={`${semanticPanelId}-nodes`} className="text-xs font-medium text-muted-foreground">
                            节点
                          </h3>
                          <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
                            <Rows3 className="size-3.5" aria-hidden="true" />
                            {semanticNodeCount}
                          </span>
                        </div>
                        <div className="mt-2 grid grid-cols-5 gap-2 sm:grid-cols-7 md:grid-cols-5">
                          {semanticNodes.map((node, index) => {
                            const tone = getSemanticNodeTone(`${node.id}:${node.type}:${node.kind}`)
                            const isActive = selectedNodeId === node.id || keyboardRovingIndex === index

                            return (
                              <Tooltip key={node.id}>
                                <TooltipTrigger asChild>
                                  <button
                                    ref={(element) => setSemanticNodeButtonRef(node.id, element)}
                                    type="button"
                                    className={cn(
                                      'flex size-11 items-center justify-center rounded-md border bg-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                                      isActive
                                        ? 'border-primary bg-primary/5'
                                        : 'border-border hover:border-primary/40 hover:bg-muted/50'
                                    )}
                                    aria-label={`聚焦节点：${node.label}`}
                                    aria-pressed={selectedNodeId === node.id}
                                    onFocus={() => {
                                      setKeyboardRovingIndex(index)
                                      focusSemanticNode(node.id)
                                    }}
                                    onClick={() => {
                                      setKeyboardRovingIndex(index)
                                      focusSemanticNode(node.id)
                                      if (globalThis.window.matchMedia('(max-width: 767px)').matches) {
                                        setIsSemanticListVisible(false)
                                      }
                                      onNodeClick(node.raw)
                                    }}
                                  >
                                    <span
                                      className="size-3 rounded-full border border-foreground/10"
                                      style={{ backgroundColor: tone }}
                                    />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent
                                  side="left"
                                  align="center"
                                  className="max-w-64 rounded-md border-border bg-popover px-3 py-2 text-xs text-foreground"
                                >
                                  <p className="font-medium leading-5">{node.label}</p>
                                  <p className="mt-0.5 break-all leading-5 text-muted-foreground">
                                    节点编号：{node.id} · {node.kind} · {node.type}
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            )
                          })}
                        </div>
                      </section>

                      <section aria-labelledby={`${semanticPanelId}-links`}>
                        <div className="flex items-center justify-between gap-2">
                          <h3 id={`${semanticPanelId}-links`} className="text-xs font-medium text-muted-foreground">
                            关系
                          </h3>
                          <span className="rounded-md border border-border bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
                            {semanticLinkCount}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {semanticRelationSummary.map((item) => (
                            <span
                              key={item.relation}
                              className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/30 px-2 py-1 text-xs text-muted-foreground"
                            >
                              {item.relation}
                              <span className="tabular-nums text-foreground">{item.count}</span>
                            </span>
                          ))}
                          {isSemanticListTruncated ? (
                            <span className="inline-flex items-center rounded-md border border-dashed border-border px-2 py-1 text-xs text-muted-foreground">
                              仅显示前 {SEMANTIC_LIST_ITEM_LIMIT} 项
                            </span>
                          ) : null}
                        </div>
                      </section>

                      {keyboardRovingIndex >= 0 && semanticNodes[keyboardRovingIndex] ? (
                        <p className="border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
                          当前聚焦：
                          <span className="font-medium text-foreground">
                            {semanticNodes[keyboardRovingIndex].label}
                          </span>
                        </p>
                      ) : null}
                    </>
                  ) : null}
                </section>
              </div>
            </TooltipProvider>
          </aside>
        </>
      ) : (
        <div className="absolute inset-x-0 bottom-0 top-16 z-10 flex items-center justify-center px-4 py-6 md:px-6">
          {isLoading ? (
            <div className="w-full max-w-xl border-y border-border py-6">
              <div className="flex items-center gap-3">
                <Skeleton className="size-10 rounded-md" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-44" />
                  <Skeleton className="h-4 max-w-72" />
                </div>
              </div>
              <div className="mt-5 space-y-3">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ) : (
            <section className="mx-auto flex w-full max-w-[36rem] flex-col items-center justify-center px-4 py-10 text-center md:px-8 md:py-14">
              <div className="mb-5 flex items-center justify-center">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 180 72"
                  className="h-[76px] w-[190px] md:h-[82px] md:w-[204px]"
                >
                  <path
                    d="M36 46H90M90 46H144M90 46V22"
                    fill="none"
                    stroke="hsl(var(--border) / 0.85)"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                  <circle cx="36" cy="46" r="8.7" fill="hsl(var(--background))" stroke="hsl(var(--border) / 0.9)" strokeWidth="1.5" />
                  <circle cx="144" cy="46" r="8.7" fill="hsl(var(--background))" stroke="hsl(var(--border) / 0.9)" strokeWidth="1.5" />
                  <circle cx="90" cy="22" r="10.2" fill="hsl(var(--primary) / 0.08)" stroke="hsl(var(--primary) / 0.45)" strokeWidth="1.6" />
                  <circle cx="90" cy="46" r="8.7" fill="hsl(var(--background))" stroke="hsl(var(--border) / 0.9)" strokeWidth="1.5" />
                  <circle cx="36" cy="46" r="2" fill="hsl(var(--foreground) / 0.45)" />
                  <circle cx="90" cy="46" r="2" fill="hsl(var(--foreground) / 0.45)" />
                  <circle cx="144" cy="46" r="2" fill="hsl(var(--foreground) / 0.45)" />
                  <circle cx="90" cy="22" r="2.7" fill="hsl(var(--primary))" />
                </svg>
              </div>
              <h2 className="mx-auto w-full max-w-[19rem] text-xl font-semibold text-foreground">
                {hasActiveScope ? '当前范围暂无图谱' : '选择知识库图谱'}
              </h2>
              <p className="mx-auto mt-3 w-full max-w-[30rem] text-sm leading-6 text-muted-foreground">
                {hasActiveScope ? (
                  '当前知识库范围还没有可视化结果。请先执行知识图谱抽取，或切换到其他已有图谱的范围。'
                ) : (
                  '选择已有知识库图谱，或导入 JSON、JSONL 格式的图谱文件。'
                )}
              </p>
              <div className="mx-auto mt-6 flex w-full max-w-[30rem] flex-wrap items-center justify-center gap-2">
                <Button
                  className="h-10 rounded-md px-4 text-sm font-medium"
                  onClick={onTriggerManualKgUpload}
                >
                  <Network className="size-4" aria-hidden="true" />
                  导入图谱文件
                </Button>
                <Button
                  variant="outline"
                  className="h-10 rounded-md px-4 text-sm font-medium"
                  onClick={onOpenGraphPicker}
                >
                  选择图谱
                </Button>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
