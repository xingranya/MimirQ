'use client'

import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Remote } from 'comlink'
import { useParams } from 'next/navigation'
import { toast } from 'sonner'
import {
  Loader2,
  Maximize2,
  MoreHorizontal,
  Network,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Wrench,
} from 'lucide-react'

import { DatasetDetailShell } from '@/components/datasets/dataset-detail-shell'
import { GraphViewer, type GraphViewerRef } from '@/components/graph/graph-viewer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageLoading } from '@/components/ui/page-loading'
import { Skeleton } from '@/components/ui/skeleton'
import { useRouter } from '@/i18n/navigation'

import { datasetApi, documentApi, kgApi } from '@/lib/api'
import { formatApiError } from '@/lib/api-errors'
import { reportClientError, reportClientWarning } from '@/lib/client-logging'
import { applyClusterPalette } from '@/lib/graph-cluster-palette'
import type { GraphClusterResult } from '@/lib/graph-clustering'
import type { GraphData } from '@/lib/graph-parser'
import { queryKeys } from '@/lib/query-keys'
import { cn, detachPromise } from '@/lib/utils'
import { GraphService } from '@/lib/graph-service'
import type { GraphClusteringWorkerApi } from '@/workers/graph-clustering.worker'

import type { Document, KGExtractResponse, KGGraphNode, KGStatsResponse } from '@/types'

function asDatasetId(raw: unknown): string | null {
  if (typeof raw === 'string' && raw.trim()) return raw
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0]
  return null
}

function limitPositiveInt(raw: unknown, fallback: number, opts?: { min?: number; max?: number }): number {
  const n = Math.floor(Number(raw))
  if (!Number.isFinite(n)) return fallback
  const min = opts?.min ?? 1
  const max = opts?.max ?? 10_000
  return Math.min(max, Math.max(min, n))
}

function primitiveText(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return fallback
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>
): Promise<void> {
  const resolvedConcurrency = Math.max(1, Math.floor(concurrency))
  let nextIndex = 0

  async function runOne() {
    for (;;) {
      const current = nextIndex
      nextIndex += 1
      if (current >= items.length) return
      await worker(items[current], current)
    }
  }

  await Promise.all(Array.from({ length: Math.min(resolvedConcurrency, items.length) }, () => runOne()))
}

const DOCS_LOADING_SKELETON_KEYS = ['docs-loading-1', 'docs-loading-2', 'docs-loading-3', 'docs-loading-4']
const SEARCH_RESULTS_SKELETON_KEYS = ['search-loading-1', 'search-loading-2', 'search-loading-3']
const GRAPH_STATS_SKELETON_KEYS = ['graph-stat-loading-1', 'graph-stat-loading-2', 'graph-stat-loading-3', 'graph-stat-loading-4']
const KG_WORKBENCH_DOCUMENT_PARAMS = {
  skip: 0,
  limit: 100,
  order_by: 'created_at' as const,
  order_dir: 'desc' as const,
}
const EMPTY_DOCS: Document[] = []

function formatDocumentStatus(status: string): string {
  const labels: Record<string, string> = {
    completed: '已完成',
    failed: '失败',
    indexed: '已入库',
    parsed: '已解析',
    pending: '等待处理',
    processing: '处理中',
    quarantined: '已隔离',
  }
  return labels[status.toLowerCase()] || status
}

function DocsLoadingSkeleton() {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <div className="border-b border-border pb-3">
        <PageLoading
          className="min-h-0 flex-none justify-start"
          message="正在加载文档"
          srMessage="正在加载数据集文档"
        />
      </div>
      <div className="mt-3 space-y-2">
        {DOCS_LOADING_SKELETON_KEYS.map((key) => (
          <div
            key={key}
            className="flex items-start gap-3 rounded-md bg-background px-3 py-3"
          >
            <Skeleton className="mt-0.5 h-4 w-4 rounded-sm" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
            <Skeleton className="h-7 w-16 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  )
}

function SearchResultsSkeleton() {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <div className="space-y-2">
        {SEARCH_RESULTS_SKELETON_KEYS.map((key) => (
          <div key={key} className="rounded-md bg-background px-3 py-3">
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="mt-2 h-3 w-2/5" />
          </div>
        ))}
      </div>
    </div>
  )
}

function GraphPreviewSkeleton() {
  return (
    <div className="flex h-full min-h-[520px] items-center justify-center p-6">
      <div className="w-full max-w-3xl rounded-md border border-border bg-background p-6">
        <PageLoading
          className="min-h-0 flex-none justify-start"
          message="正在构建图谱预览"
          srMessage="正在加载数据集图谱预览"
        />
        <div className="mt-5 flex flex-wrap gap-2">
          {GRAPH_STATS_SKELETON_KEYS.map((key) => (
            <Skeleton key={key} className="h-6 w-24 rounded-md" />
          ))}
        </div>
        <div className="mt-6 grid gap-3 lg:grid-cols-[minmax(0,1.45fr)_minmax(260px,0.85fr)]">
          <Skeleton className="h-[320px] w-full rounded-md" />
          <div className="space-y-3">
            <Skeleton className="h-24 w-full rounded-md" />
            <Skeleton className="h-24 w-full rounded-md" />
            <Skeleton className="h-10 w-40 rounded-md" />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function DatasetKGWorkbenchPage() {
  const router = useRouter()
  const params = useParams()
  const datasetId = asDatasetId((params as Record<string, unknown>)?.id)

  const graphRef = useRef<GraphViewerRef>(null)
  const graphClusteringSeqRef = useRef(0)
  const graphClusteringWorkerRef = useRef<Worker | null>(null)
  const graphClusteringApiRef = useRef<Remote<GraphClusteringWorkerApi> | null>(null)
  const graphClusteringDisabledRef = useRef(false)

  const [activeDocQuery, setActiveDocQuery] = useState('')
  const [docQuery, setDocQuery] = useState('')

  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(() => new Set())

  // 图谱抽取参数
  const [pipelineHash, setPipelineHash] = useState('')
  const [replaceExisting, setReplaceExisting] = useState(true)
  const [pruneOrphans, setPruneOrphans] = useState(false)
  const [bulkMaxDocs, setBulkMaxDocs] = useState(20)
  const [bulkConcurrency, setBulkConcurrency] = useState(3)
  const [extractRunning, setExtractRunning] = useState(false)
  const [singleExtractingDocId, setSingleExtractingDocId] = useState<string | null>(null)
  const [extractProgress, setExtractProgress] = useState<{ done: number; total: number } | null>(null)
  const [extractResults, setExtractResults] = useState<Record<string, { ok: true; res: KGExtractResponse } | { ok: false; error: string }>>({})

  // 图谱预览状态
  const [graphLoading, setGraphLoading] = useState(false)
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [graphClusterResult, setGraphClusterResult] = useState<GraphClusterResult | null>(null)
  const [selectedGraphNodeId, setSelectedGraphNodeId] = useState<string | null>(null)
  const [graphStats, setGraphStats] = useState<KGStatsResponse | null>(null)
  const [includeEntityLinks, setIncludeEntityLinks] = useState(true)
  const [includeRelationLinks, setIncludeRelationLinks] = useState(false)
  const [minSharedEvents, setMinSharedEvents] = useState(2)
  const [graphMaxDocs, setGraphMaxDocs] = useState(50)

  // 图谱节点搜索
  const [searchQuery, setSearchQuery] = useState('')
  const [searchKind, setSearchKind] = useState<'all' | 'entity' | 'event'>('entity')
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchResults, setSearchResults] = useState<KGGraphNode[]>([])

  const datasetQuery = useQuery({
    queryKey: datasetId ? queryKeys.datasets.detail(datasetId) : queryKeys.datasets.detail(''),
    enabled: Boolean(datasetId),
    queryFn: () => datasetApi.get(datasetId as string),
  })
  const docsQuery = useQuery({
    queryKey: datasetId
      ? queryKeys.documents.list({
          ...KG_WORKBENCH_DOCUMENT_PARAMS,
          dataset_id: datasetId,
          q: activeDocQuery || null,
        })
      : queryKeys.documents.list(KG_WORKBENCH_DOCUMENT_PARAMS),
    enabled: Boolean(datasetId),
    queryFn: () =>
      documentApi.list({
        ...KG_WORKBENCH_DOCUMENT_PARAMS,
        dataset_id: datasetId as string,
        q: activeDocQuery || null,
      }),
  })

  const dataset = datasetQuery.data ?? null
  const docs = docsQuery.data?.items ?? EMPTY_DOCS
  const docsTotal = Number(docsQuery.data?.total || 0)
  const docsLoading = docsQuery.isLoading || docsQuery.isFetching

  const scopedDocIds = useMemo(() => Array.from(selectedDocIds), [selectedDocIds])
  const effectivePipelineHash = useMemo(() => pipelineHash.trim() || undefined, [pipelineHash])
  const graphPaletteSeed = useMemo(() => datasetId || effectivePipelineHash || null, [datasetId, effectivePipelineHash])

  const graphPreviewData = useMemo(() => {
    if (!graphData) return null
    return applyClusterPalette({
      graphRenderData: graphData,
      paletteSeed: graphPaletteSeed,
      clusterResult: graphClusterResult,
    })
  }, [graphClusterResult, graphData, graphPaletteSeed])

  const selectedNodeDetail = useMemo(() => {
    if (!graphData || !selectedGraphNodeId) return null

    const selectedNode = graphData.nodes.find((node) => String(node.id || '') === selectedGraphNodeId)
    if (!selectedNode) return null

    const nodeRecord = selectedNode as unknown as Record<string, unknown>
    const meta = (nodeRecord.meta ?? {}) as Record<string, unknown>
    const label = primitiveText(nodeRecord.label ?? nodeRecord.name, selectedGraphNodeId).trim() || selectedGraphNodeId
    const type = primitiveText(meta.type ?? nodeRecord.type, 'unknown').trim() || 'unknown'
    const kind = primitiveText(meta.kind ?? nodeRecord.kind, 'entity').trim() || 'entity'

    let degree = 0
    for (const link of graphData.links) {
      const source = typeof link.source === 'object' && link.source
        ? String((link.source as { id?: string }).id ?? '')
        : String(link.source ?? '')
      const target = typeof link.target === 'object' && link.target
        ? String((link.target as { id?: string }).id ?? '')
        : String(link.target ?? '')
      if (source === selectedGraphNodeId || target === selectedGraphNodeId) {
        degree += 1
      }
    }

    const cluster = Math.max(1, Math.floor(Number(graphClusterResult?.nodeToCluster?.[selectedGraphNodeId] ?? 1)))
    return {
      id: selectedGraphNodeId,
      label,
      type,
      kind,
      degree,
      cluster,
    }
  }, [graphClusterResult, graphData, selectedGraphNodeId])

  useEffect(() => {
    const error = datasetQuery.error || docsQuery.error
    if (!error) return
    reportClientError('Failed to load dataset KG workbench', error)
    toast.error(formatApiError(error, '加载数据失败'))
  }, [datasetQuery.error, docsQuery.error])

  useEffect(() => {
    const seq = ++graphClusteringSeqRef.current
    let cancelled = false

    if (!graphData?.nodes.length) {
      setGraphClusterResult(null)
      return
    }

    const nodes = graphData.nodes.map((node) => ({ id: node.id, label: node.label }))
    const links = graphData.links.map((link) => ({ source: link.source, target: link.target, label: link.label }))

    const computeOnMainThread = async () => {
      try {
        const { computeConnectedComponents } = await import('@/lib/graph-clustering')
        if (cancelled) return
        const result = computeConnectedComponents({ nodes, links })
        if (graphClusteringSeqRef.current === seq) {
          setGraphClusterResult(result)
        }
      } catch (e) {
        reportClientWarning('Failed to compute dataset graph clusters', e)
        if (graphClusteringSeqRef.current === seq) {
          setGraphClusterResult(null)
        }
      }
    }

    if (graphClusteringDisabledRef.current || typeof Worker === 'undefined') {
      detachPromise(computeOnMainThread())
      return () => {
        cancelled = true
      }
    }

    detachPromise((async () => {
      try {
        let api = graphClusteringApiRef.current
        if (!graphClusteringWorkerRef.current || !api) {
          const { wrap } = await import('comlink')
          if (cancelled) return
          graphClusteringWorkerRef.current = new Worker(
            new URL('../../workers/graph-clustering.worker.ts', import.meta.url),
            { type: 'module' }
          )
          api = wrap<GraphClusteringWorkerApi>(graphClusteringWorkerRef.current)
          graphClusteringApiRef.current = api
        }

        const result = await api.computeConnectedComponents({ nodes, links })
        if (cancelled) return
        if (graphClusteringSeqRef.current !== seq) return
        setGraphClusterResult(result)
      } catch (e) {
        reportClientWarning('Dataset graph clustering worker failed; falling back to main thread', e)
        graphClusteringDisabledRef.current = true
        detachPromise(computeOnMainThread())
      }
    })())

    return () => {
      cancelled = true
    }
  }, [graphData])

  useEffect(() => {
    return () => {
      graphClusteringApiRef.current = null
      graphClusteringWorkerRef.current?.terminate()
      graphClusteringWorkerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!graphData?.nodes.length) {
      setSelectedGraphNodeId(null)
      return
    }

    setSelectedGraphNodeId((prev) => {
      if (!prev) return null
      const stillExists = graphData.nodes.some((node) => String(node.id || '') === prev)
      return stillExists ? prev : null
    })
  }, [graphData])

  const toggleDoc = useCallback((docId: string, checked: boolean) => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(docId)
      else next.delete(docId)
      return next
    })
  }, [])

  const selectAllLoaded = useCallback(() => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev)
      docs.forEach((d) => {
        const id = String(d.id || '')
        if (id) next.add(id)
      })
      return next
    })
  }, [docs])

  const clearSelection = useCallback(() => setSelectedDocIds(new Set()), [])

  const extractOneDoc = useCallback(async (docId: string) => {
    const id = String(docId || '').trim()
    if (!id) return
    if (singleExtractingDocId) return

    setSingleExtractingDocId(id)
    try {
      const res = await kgApi.extract(id, {
        async: false,
        pipeline_hash: effectivePipelineHash,
        replace_existing: replaceExisting,
        prune_orphan_entities: pruneOrphans,
      })
      setExtractResults((prev) => ({ ...prev, [id]: { ok: true, res } }))
      toast.success(`图谱抽取完成，共生成 ${Number(res?.event_count || 0)} 个事件`)
    } catch (e: unknown) {
      const msg = formatApiError(e, '图谱抽取失败')
      setExtractResults((prev) => ({ ...prev, [id]: { ok: false, error: msg } }))
      toast.error(msg)
    } finally {
      setSingleExtractingDocId(null)
    }
  }, [effectivePipelineHash, pruneOrphans, replaceExisting, singleExtractingDocId])

  const extractSelected = useCallback(async () => {
    if (extractRunning) return
    if (scopedDocIds.length === 0) {
      toast.error('请先选择要抽取的文档')
      return
    }

    const maxDocs = limitPositiveInt(bulkMaxDocs, 20, { min: 1, max: 200 })
    const concurrency = limitPositiveInt(bulkConcurrency, 3, { min: 1, max: 8 })
    const docIds = scopedDocIds.slice(0, maxDocs)

    if (scopedDocIds.length > docIds.length) {
      toast.message(`本次处理前 ${docIds.length} 篇文档，共选择 ${scopedDocIds.length} 篇`)
    }

    setExtractRunning(true)
    setExtractProgress({ done: 0, total: docIds.length })
    setExtractResults({})

    const nextResults: Record<string, { ok: true; res: KGExtractResponse } | { ok: false; error: string }> = {}

    try {
      await runWithConcurrency(docIds, concurrency, async (docId) => {
        try {
          const res = await kgApi.extract(docId, {
            async: false,
            pipeline_hash: effectivePipelineHash,
            replace_existing: replaceExisting,
            prune_orphan_entities: pruneOrphans,
          })
          nextResults[docId] = { ok: true, res }
        } catch (e: unknown) {
          const msg = formatApiError(e, '图谱抽取失败')
          nextResults[docId] = { ok: false, error: msg }
        } finally {
          setExtractProgress((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev))
          setExtractResults({ ...nextResults })
        }
      })

      const okCount = Object.values(nextResults).filter((x) => x.ok).length
      const failCount = docIds.length - okCount
      if (failCount > 0) {
        toast.warning(`已完成 ${okCount} 篇，${failCount} 篇处理失败`)
      } else {
        toast.success(`已完成 ${okCount} 篇文档的图谱抽取`)
      }
    } finally {
      setExtractRunning(false)
    }
  }, [
    bulkConcurrency,
    bulkMaxDocs,
    effectivePipelineHash,
    extractRunning,
    pruneOrphans,
    replaceExisting,
    scopedDocIds,
  ])

  const loadGraphPreview = useCallback(async () => {
    if (!datasetId) return
    if (graphLoading) return
    if (scopedDocIds.length === 0) {
      toast.error('请先选择要预览的文档范围')
      return
    }

    const maxDocs = limitPositiveInt(graphMaxDocs, 50, { min: 1, max: 200 })
    const docIds = scopedDocIds.slice(0, maxDocs)
    if (scopedDocIds.length > docIds.length) {
      toast.message(`预览前 ${docIds.length} 篇文档，共选择 ${scopedDocIds.length} 篇`)
    }

    setGraphLoading(true)
    setGraphClusterResult(null)
    setSelectedGraphNodeId(null)
    try {
      const [graph, stats] = await Promise.all([
        GraphService.fetchInitialGraph({
          includeEntityLinks,
          includeRelationLinks,
          minSharedEvents: includeRelationLinks ? minSharedEvents : undefined,
          maxEntityLinks: 1000,
          documentIds: docIds,
          pipelineHash: effectivePipelineHash,
        }),
        kgApi.getStats({ document_ids: docIds, pipeline_hash: effectivePipelineHash }).catch(() => null),
      ])

      setGraphData(graph)
      setGraphStats(stats)
    } catch (e: unknown) {
      reportClientError('Failed to load dataset KG graph preview', e)
      toast.error(formatApiError(e, '加载图预览失败'))
      setGraphData(null)
      setGraphClusterResult(null)
      setSelectedGraphNodeId(null)
      setGraphStats(null)
    } finally {
      setGraphLoading(false)
    }
  }, [
    datasetId,
    effectivePipelineHash,
    graphLoading,
    graphMaxDocs,
    includeEntityLinks,
    includeRelationLinks,
    minSharedEvents,
    scopedDocIds,
  ])

  const scopedGraphUrl = useMemo(() => {
    const maxDocs = limitPositiveInt(graphMaxDocs, 50, { min: 1, max: 200 })
    const docIds = scopedDocIds.slice(0, maxDocs)
    const qs = new URLSearchParams()
    if (docIds.length) qs.set('document_ids', docIds.join(','))
    if (effectivePipelineHash) qs.set('pipeline_hash', effectivePipelineHash)
    const query = qs.toString()
    return query ? `/graph?${query}` : '/graph'
  }, [effectivePipelineHash, graphMaxDocs, scopedDocIds])

  const runQuickSearch = useCallback(async () => {
    const q = searchQuery.trim()
    if (!q) return
    if (searchLoading) return
    if (scopedDocIds.length === 0) {
      toast.error('请先选择文档范围')
      return
    }

    const maxDocs = limitPositiveInt(graphMaxDocs, 50, { min: 1, max: 200 })
    const docIds = scopedDocIds.slice(0, maxDocs)

    setSearchLoading(true)
    try {
      const nodes = await kgApi.searchGraphNodes({
        q,
        kind: searchKind === 'all' ? 'all' : searchKind,
        limit: 20,
        document_ids: docIds,
        pipeline_hash: effectivePipelineHash,
      })
      setSearchResults(Array.isArray(nodes) ? nodes : [])
      if (!nodes?.length) {
        toast.message('未找到匹配节点')
      }
    } catch (e: unknown) {
      reportClientError('Dataset KG quick search failed', e)
      toast.error(formatApiError(e, '图谱搜索失败'))
      setSearchResults([])
    } finally {
      setSearchLoading(false)
    }
  }, [effectivePipelineHash, graphMaxDocs, scopedDocIds, searchKind, searchLoading, searchQuery])

  return (
    <DatasetDetailShell
      activeSection="kg"
      datasetId={datasetId || ''}
      datasetName={dataset?.name}
      title="知识图谱"
      description="选择参与构图的文档，抽取实体与事件，并检查它们之间的关系。"
      icon={Network}
      bodyContainerClassName="min-h-0"
      actions={
        <>
          <Button
            size="sm"
            className="h-9 gap-2 rounded-md"
            onClick={() => detachPromise(loadGraphPreview())}
            disabled={graphLoading || scopedDocIds.length === 0}
          >
            {graphLoading ? (
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <RefreshCw className="size-4" aria-hidden="true" />
            )}
            预览图谱
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-9 rounded-md"
                aria-label="更多图谱操作"
                title="更多图谱操作"
              >
                <MoreHorizontal className="size-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 rounded-md">
              <DropdownMenuItem
                onSelect={() => detachPromise(docsQuery.refetch())}
                disabled={docsLoading}
              >
                <RefreshCw className="size-4" aria-hidden="true" />
                刷新文档
              </DropdownMenuItem>
              {datasetId ? (
                <DropdownMenuItem onSelect={() => router.push(`/datasets/${datasetId}/ingestion`)}>
                  <Settings2 className="size-4" aria-hidden="true" />
                  入库设置
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => router.push('/graph/diagnostics')}>
                <Wrench className="size-4" aria-hidden="true" />
                图谱诊断
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => router.push('/graph/snapshots')}>
                <Sparkles className="size-4" aria-hidden="true" />
                图谱快照
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => router.push(scopedGraphUrl)}
                disabled={scopedDocIds.length === 0}
              >
                <Maximize2 className="size-4" aria-hidden="true" />
                打开全图
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
    >
      <div
        data-kg-workbench="true"
        className="grid min-h-0 overflow-hidden rounded-md border border-border bg-background lg:grid-cols-[360px_minmax(0,1fr)]"
      >
        <aside className="min-w-0 border-b border-border lg:border-b-0 lg:border-r">
          <section className="p-4" aria-labelledby="kg-document-scope-title">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 id="kg-document-scope-title" className="text-base font-semibold text-foreground">
                  文档范围
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  已选 {scopedDocIds.length} 篇，共 {docsTotal} 篇
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-md px-2"
                  onClick={selectAllLoaded}
                  disabled={docs.length === 0}
                >
                  全选
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-md px-2"
                  onClick={clearSelection}
                  disabled={selectedDocIds.size === 0}
                >
                  清空
                </Button>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <Input
                value={docQuery}
                onChange={(event) => setDocQuery(event.target.value)}
                placeholder="搜索文档名称"
                aria-label="搜索文档名称"
                className="h-9 min-w-0 rounded-md"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') setActiveDocQuery(docQuery.trim())
                }}
              />
              <Button
                variant="outline"
                size="icon"
                className="size-9 shrink-0 rounded-md"
                onClick={() => setActiveDocQuery(docQuery.trim())}
                disabled={docsLoading}
                aria-label="搜索文档"
                title="搜索文档"
              >
                {docsLoading ? (
                  <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                ) : (
                  <Search className="size-4" aria-hidden="true" />
                )}
              </Button>
            </div>

            <div className="mt-3 max-h-[360px] space-y-1 overflow-y-auto overscroll-contain pr-1">
              {docsLoading ? (
                <DocsLoadingSkeleton />
              ) : docs.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  没有找到可用文档
                </div>
              ) : (
                docs.map((doc) => {
                  const id = String(doc.id || '')
                  const filename = String(doc.filename || id || '')
                  const status = String(doc.status || '')
                  const checked = selectedDocIds.has(id)
                  const isExtracting = singleExtractingDocId === id

                  return (
                    <div
                      key={id}
                      className={cn(
                        'flex min-w-0 items-start gap-2 rounded-md border px-3 py-2 transition-colors',
                        checked
                          ? 'border-primary/40 bg-primary/5'
                          : 'border-transparent hover:bg-muted/60'
                      )}
                    >
                      <Checkbox
                        id={`kg-doc-${id}`}
                        checked={checked}
                        onCheckedChange={(value) => toggleDoc(id, Boolean(value))}
                        className="mt-0.5"
                        aria-label={`选择文档 ${filename || id}`}
                      />
                      <label htmlFor={`kg-doc-${id}`} className="min-w-0 flex-1 cursor-pointer">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {filename || id}
                        </span>
                        <span className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                          <span className="truncate font-mono">{id}</span>
                          {status ? (
                            <Badge variant="outline" className="shrink-0 rounded-md px-1.5 py-0 text-xs">
                              {formatDocumentStatus(status)}
                            </Badge>
                          ) : null}
                        </span>
                      </label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 shrink-0 gap-1 rounded-md px-2 text-xs"
                        disabled={isExtracting}
                        onClick={() => detachPromise(extractOneDoc(id))}
                      >
                        {isExtracting ? (
                          <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                        ) : (
                          <Sparkles className="size-3.5" aria-hidden="true" />
                        )}
                        抽取
                      </Button>
                    </div>
                  )
                })
              )}
            </div>
          </section>

          <section className="border-t border-border p-4" aria-labelledby="kg-extract-title">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 id="kg-extract-title" className="text-base font-semibold text-foreground">
                  图谱抽取
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">从选中文档中提取实体和事件。</p>
              </div>
              {extractProgress ? (
                <span className="text-sm tabular-nums text-muted-foreground">
                  {extractProgress.done}/{extractProgress.total}
                </span>
              ) : null}
            </div>

            <details className="group mt-3 rounded-md border border-border bg-muted/20">
              <summary className="flex h-9 cursor-pointer list-none items-center gap-2 px-3 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
                <Settings2 className="size-4 text-muted-foreground" aria-hidden="true" />
                抽取设置
              </summary>
              <div className="grid gap-3 border-t border-border p-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2 lg:col-span-1 xl:col-span-2">
                  <Label htmlFor="kg-pipeline-hash" className="text-sm">流程版本</Label>
                  <Input
                    id="kg-pipeline-hash"
                    value={pipelineHash}
                    onChange={(event) => setPipelineHash(event.target.value)}
                    placeholder="留空则使用当前版本"
                    className="h-9 rounded-md font-mono text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="kg-bulk-max-docs" className="text-sm">单次文档数</Label>
                  <Input
                    id="kg-bulk-max-docs"
                    value={String(bulkMaxDocs)}
                    onChange={(event) => setBulkMaxDocs(limitPositiveInt(event.target.value, 20, { min: 1, max: 200 }))}
                    className="h-9 rounded-md text-sm tabular-nums"
                    inputMode="numeric"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="kg-bulk-concurrency" className="text-sm">并发任务数</Label>
                  <Input
                    id="kg-bulk-concurrency"
                    value={String(bulkConcurrency)}
                    onChange={(event) => setBulkConcurrency(limitPositiveInt(event.target.value, 3, { min: 1, max: 8 }))}
                    className="h-9 rounded-md text-sm tabular-nums"
                    inputMode="numeric"
                  />
                </div>
                <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm text-foreground">
                  <Checkbox checked={replaceExisting} onCheckedChange={(value) => setReplaceExisting(Boolean(value))} />
                  覆盖已有结果
                </label>
                <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm text-foreground">
                  <Checkbox checked={pruneOrphans} onCheckedChange={(value) => setPruneOrphans(Boolean(value))} />
                  清理孤立实体
                </label>
              </div>
            </details>

            <Button
              className="mt-3 h-9 w-full gap-2 rounded-md"
              onClick={() => detachPromise(extractSelected())}
              disabled={extractRunning || scopedDocIds.length === 0}
            >
              {extractRunning ? (
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : (
                <Sparkles className="size-4" aria-hidden="true" />
              )}
              抽取选中文档
            </Button>

            {Object.keys(extractResults).length > 0 ? (
              <div className="mt-3">
                <h3 className="text-sm font-medium text-foreground">最近结果</h3>
                <div className="mt-2 max-h-40 space-y-1 overflow-y-auto overscroll-contain pr-1">
                  {Object.entries(extractResults)
                    .slice(0, 50)
                    .map(([docId, result]) => (
                      <div key={docId} className="flex min-w-0 items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5">
                        <span className="truncate font-mono text-xs text-muted-foreground">{docId}</span>
                        {result.ok ? (
                          <Badge variant="outline" className="shrink-0 rounded-md text-xs">
                            {result.res.event_count} 个事件
                          </Badge>
                        ) : (
                          <Badge variant="soft" className="shrink-0 rounded-md text-xs" title={result.error}>
                            处理失败
                          </Badge>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            ) : null}
          </section>

          <section className="border-t border-border p-4" aria-labelledby="kg-search-title">
            <h2 id="kg-search-title" className="text-base font-semibold text-foreground">图谱搜索</h2>
            <div className="mt-3 flex gap-2">
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="搜索实体或事件"
                aria-label="搜索图谱节点"
                className="h-9 min-w-0 rounded-md"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') detachPromise(runQuickSearch())
                }}
              />
              <Button
                variant="outline"
                size="icon"
                className="size-9 shrink-0 rounded-md"
                onClick={() => detachPromise(runQuickSearch())}
                disabled={searchLoading || !searchQuery.trim()}
                aria-label="搜索图谱"
                title="搜索图谱"
              >
                {searchLoading ? (
                  <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                ) : (
                  <Search className="size-4" aria-hidden="true" />
                )}
              </Button>
            </div>
            <div className="mt-2 flex rounded-md bg-muted p-1" aria-label="节点类型">
              {([
                ['entity', '实体'],
                ['event', '事件'],
                ['all', '全部'],
              ] as const).map(([value, label]) => (
                <Button
                  key={value}
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'h-8 flex-1 rounded-md px-2 text-sm shadow-none',
                    searchKind === value
                      ? 'bg-background text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  onClick={() => setSearchKind(value)}
                  aria-pressed={searchKind === value}
                >
                  {label}
                </Button>
              ))}
            </div>

            {searchLoading ? (
              <div className="mt-3"><SearchResultsSkeleton /></div>
            ) : searchResults.length > 0 ? (
              <div className="mt-3 max-h-56 space-y-1 overflow-y-auto overscroll-contain pr-1">
                {searchResults.map((node) => (
                  <button
                    key={node.id}
                    type="button"
                    className="w-full rounded-md px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                    onClick={() => {
                      const nodeId = String(node.id || '')
                      setSelectedGraphNodeId(nodeId)
                      graphRef.current?.focusNode(nodeId)
                      toast.message(`已定位到 ${String(node.label || node.id)}`)
                    }}
                  >
                    <span className="block truncate text-sm font-medium text-foreground">{String(node.label || node.id)}</span>
                    <span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">{String(node.id)}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">输入关键词查找当前文档范围内的节点。</p>
            )}
          </section>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-col" aria-labelledby="kg-preview-title">
          <header className="border-b border-border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 id="kg-preview-title" className="text-base font-semibold text-foreground">图谱预览</h2>
                <p className="mt-1 text-sm text-muted-foreground">查看选中文档中的实体、事件和关系。</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-2 rounded-md"
                onClick={() => router.push(scopedGraphUrl)}
                disabled={scopedDocIds.length === 0}
              >
                <Maximize2 className="size-4" aria-hidden="true" />
                打开全图
              </Button>
            </div>

            {graphLoading ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {GRAPH_STATS_SKELETON_KEYS.map((key) => (
                  <Skeleton key={key} className="h-6 w-24 rounded-md" />
                ))}
              </div>
            ) : graphStats || graphClusterResult ? (
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                {graphStats ? (
                  <>
                    <Badge variant="outline" className="rounded-md text-xs">实体 {Number(graphStats.entities || 0)}</Badge>
                    <Badge variant="outline" className="rounded-md text-xs">事件 {Number(graphStats.events || 0)}</Badge>
                    <Badge variant="outline" className="rounded-md text-xs">关系 {Number(graphStats.links || 0)}</Badge>
                  </>
                ) : null}
                {graphClusterResult ? (
                  <>
                    <Badge variant="secondary" className="rounded-md text-xs">群组 {graphClusterResult.clusterCount}</Badge>
                    <Badge variant="secondary" className="rounded-md text-xs">最大群组 {Number(graphClusterResult.clusterSizes[0] || 0)}</Badge>
                  </>
                ) : null}
              </div>
            ) : null}

            <details className="mt-3 rounded-md border border-border bg-muted/20">
              <summary className="flex h-9 cursor-pointer list-none items-center gap-2 px-3 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
                <Settings2 className="size-4 text-muted-foreground" aria-hidden="true" />
                预览设置
              </summary>
              <div className="grid gap-3 border-t border-border p-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor="kg-preview-max-docs" className="text-sm">最多加载文档</Label>
                  <Input
                    id="kg-preview-max-docs"
                    value={String(graphMaxDocs)}
                    onChange={(event) => setGraphMaxDocs(limitPositiveInt(event.target.value, 50, { min: 1, max: 200 }))}
                    className="h-9 rounded-md text-sm tabular-nums"
                    inputMode="numeric"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="kg-min-shared-events" className="text-sm">最少共享事件</Label>
                  <Input
                    id="kg-min-shared-events"
                    value={String(minSharedEvents)}
                    onChange={(event) => setMinSharedEvents(limitPositiveInt(event.target.value, 2, { min: 1, max: 10 }))}
                    className="h-9 rounded-md text-sm tabular-nums"
                    inputMode="numeric"
                    disabled={!includeRelationLinks}
                  />
                </div>
                <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm text-foreground sm:self-end">
                  <Checkbox checked={includeEntityLinks} onCheckedChange={(value) => setIncludeEntityLinks(Boolean(value))} />
                  显示实体关联
                </label>
                <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm text-foreground sm:self-end">
                  <Checkbox checked={includeRelationLinks} onCheckedChange={(value) => setIncludeRelationLinks(Boolean(value))} />
                  显示关系连线
                </label>
              </div>
            </details>
          </header>

          {selectedNodeDetail ? (
            <section className="border-b border-border bg-muted/20 px-4 py-3" aria-label="节点详情">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                <span className="font-medium text-foreground">{selectedNodeDetail.label}</span>
                <span className="text-muted-foreground">类型 {selectedNodeDetail.type}</span>
                <span className="text-muted-foreground">类别 {selectedNodeDetail.kind}</span>
                <span className="text-muted-foreground">连接 {selectedNodeDetail.degree}</span>
                <Badge variant="secondary" className="rounded-md text-xs">群组 {selectedNodeDetail.cluster}</Badge>
                <span className="min-w-0 truncate font-mono text-xs text-muted-foreground" title={selectedNodeDetail.id}>
                  {selectedNodeDetail.id}
                </span>
              </div>
            </section>
          ) : null}

          <div className="relative h-[clamp(420px,62vh,720px)] min-h-0 overflow-hidden bg-muted/10 lg:flex-1">
            {graphData && graphPreviewData ? (
              <GraphViewer
                ref={graphRef}
                data={graphPreviewData}
                onNodeClick={(node) => {
                  const nodeId = String(node?.id || '').trim()
                  if (!nodeId) return
                  setSelectedGraphNodeId(nodeId)
                }}
                selectedNodeId={selectedGraphNodeId}
                onBackgroundClick={() => setSelectedGraphNodeId(null)}
              />
            ) : graphLoading ? null : (
              <div className="flex h-full items-center justify-center px-6 text-center">
                <div className="max-w-sm">
                  <Network className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
                  <p className="mt-3 text-sm font-medium text-foreground">尚未加载图谱</p>
                  <p className="mt-1 text-sm text-muted-foreground">选择文档后，点击页面顶部的“预览图谱”。</p>
                </div>
              </div>
            )}
            {graphLoading ? (
              <div className="absolute inset-0 z-10 bg-background/90">
                <GraphPreviewSkeleton />
              </div>
            ) : null}
          </div>
        </main>
      </div>
    </DatasetDetailShell>
  )
}
