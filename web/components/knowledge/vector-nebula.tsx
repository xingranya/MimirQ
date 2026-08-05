'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useTheme } from 'next-themes'
import { useQuery } from '@tanstack/react-query'
import { Database, Info, Loader2, PanelLeftClose, RotateCcw } from 'lucide-react'
import * as THREE from 'three'
import type { ForceGraphMethods } from 'react-force-graph-3d'

import { IconButton } from '@/components/ui/icon-button'
import { QueryErrorState } from '@/components/ui/query-error-state'
import { useResizeObserver } from '@/hooks/use-resize-observer'
import { formatApiError } from '@/lib/api-errors'
import { documentApi } from '@/lib/api/documents'
import { getCssHslColor } from '@/lib/css-vars'
import { queryKeys } from '@/lib/query-keys'

const THREE_CLOCK_DEPRECATION_WARNING = 'THREE.THREE.Clock'
const DOCUMENT_LIMIT = 8
const CHUNK_LIMIT = 80

function isThreeClockDeprecationWarning(args: unknown[]): boolean {
  return args.some((arg) => typeof arg === "string" && arg.includes(THREE_CLOCK_DEPRECATION_WARNING))
}

async function withSuppressedThreeClockWarning<T>(action: () => Promise<T>): Promise<T> {
  const originalWarn = console.warn
  console.warn = (...args: unknown[]) => {
    if (isThreeClockDeprecationWarning(args)) return
    originalWarn(...args)
  }
  try {
    return await action()
  } finally {
    console.warn = originalWarn
  }
}

const ForceGraph3D = dynamic(() => withSuppressedThreeClockWarning(() => import('react-force-graph-3d')), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-background">
      <Loader2 className="size-6 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
      <span className="sr-only">正在加载语义分布画布</span>
    </div>
  ),
})

type ClusterVisualStyle = {
  spread: number
  sizeRange: [number, number]
  geometry: 'sphere' | 'icosahedron' | 'octahedron' | 'dodecahedron'
}

type ClusterDefinition = {
  label: string
  color: string
  count: number
  chunkCount: number
  center: { x: number; y: number; z: number }
  style: ClusterVisualStyle
}

type NebulaNode = {
  id: string
  group: string
  color: string
  val: number
  x: number
  y: number
  z: number
  content: string
  documentId: string
  documentName: string
  chunkIndex: number | null
  style: ClusterVisualStyle
}

type NebulaLink = {
  source: string
  target: string
  color: string
}

type NebulaData = {
  nodes: NebulaNode[]
  links: NebulaLink[]
  clusters: ClusterDefinition[]
  summary: {
    listedDocumentCount: number
    requestedDocumentCount: number
    loadedDocumentCount: number
    failedDocumentCount: number
    omittedDocumentCount: number
  }
}

type DocumentListItem = {
  id: string
  filename?: string | null
  file_type?: string | null
  file_size?: number | null
  status?: string | null
  metadata?: Record<string, unknown> | null
}

type DocumentChunkItem = {
  id: string
  content: string
  chunk_index: number
}

const EMPTY_NEBULA: NebulaData = {
  nodes: [],
  links: [],
  clusters: [],
  summary: {
    listedDocumentCount: 0,
    requestedDocumentCount: 0,
    loadedDocumentCount: 0,
    failedDocumentCount: 0,
    omittedDocumentCount: 0,
  },
}

const TYPE_STYLES: Record<string, Omit<ClusterDefinition, "count" | "chunkCount" | "center">> = {
  pdf: {
    label: "PDF 文档",
    color: "#2563eb",
    style: {
      spread: 58,
      sizeRange: [0.8, 1.9],
      geometry: "icosahedron",
    },
  },
  xlsx: {
    label: "表格文档",
    color: "#10b981",
    style: {
      spread: 42,
      sizeRange: [0.9, 2.2],
      geometry: "octahedron",
    },
  },
  html: {
    label: "网页 / HTML",
    color: "#f97316",
    style: {
      spread: 46,
      sizeRange: [0.8, 1.7],
      geometry: "dodecahedron",
    },
  },
  default: {
    label: "其他文档",
    color: "#8b5cf6",
    style: {
      spread: 52,
      sizeRange: [0.75, 1.6],
      geometry: "sphere",
    },
  },
}

function hashString(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.codePointAt(i) ?? 0
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function unitFromHash(value: string, salt: string): number {
  return (hashString(`${salt}:${value}`) % 10000) / 10000
}

function getDocumentType(document: DocumentListItem): string {
  const rawType = String(document.file_type || document.filename?.split(".").pop() || "default").toLowerCase()
  if (rawType.includes("pdf")) return "pdf"
  if (rawType.includes("xls") || rawType.includes("csv")) return "xlsx"
  if (rawType.includes("html") || rawType.includes("htm")) return "html"
  return "default"
}

function clusterCenter(index: number): { x: number; y: number; z: number } {
  const angle = index * 2.399963
  const radius = 70 + index * 18
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
    z: (index % 2 === 0 ? 1 : -1) * (24 + index * 9),
  }
}

function createClusterGeometry(geometry: ClusterVisualStyle["geometry"], size: number): THREE.BufferGeometry {
  if (geometry === "icosahedron") return new THREE.IcosahedronGeometry(size, 0)
  if (geometry === "octahedron") return new THREE.OctahedronGeometry(size, 0)
  if (geometry === "dodecahedron") return new THREE.DodecahedronGeometry(size, 0)
  return new THREE.SphereGeometry(size, 10, 10)
}

export function buildNebula(
  documents: DocumentListItem[],
  chunksByDocument: Map<string, DocumentChunkItem[]>,
  summary: NebulaData['summary'] = EMPTY_NEBULA.summary
): NebulaData {
  const documentsWithChunks = documents.filter(
    (document) => (chunksByDocument.get(document.id)?.length || 0) > 0
  )
  const clusterKeys = Array.from(new Set(documentsWithChunks.map(getDocumentType)))
  const clusterByKey = new Map<string, ClusterDefinition>()

  clusterKeys.forEach((key, index) => {
    const style = TYPE_STYLES[key] || TYPE_STYLES.default
    const docs = documentsWithChunks.filter((document) => getDocumentType(document) === key)
    clusterByKey.set(key, {
      ...style,
      count: docs.length,
      chunkCount: docs.reduce(
        (sum, document) => sum + (chunksByDocument.get(document.id)?.length || 0),
        0
      ),
      center: clusterCenter(index),
    })
  })

  const nodes: NebulaNode[] = []
  const links: NebulaLink[] = []

  for (const document of documentsWithChunks) {
    const clusterKey = getDocumentType(document)
    const cluster = clusterByKey.get(clusterKey) || {
      ...TYPE_STYLES.default,
      count: 1,
      chunkCount: 0,
      center: clusterCenter(clusterByKey.size),
    }
    const chunks = chunksByDocument.get(document.id) || []
    chunks.forEach((chunk, index) => {
      const [minSize, maxSize] = cluster.style.sizeRange
      const id = String(chunk.id)
      const spread = cluster.style.spread
      const nodeId = `${document.id}:${id}`
      const sizeByLength = Math.min(1, Math.max(0.15, (chunk.content || "").length / 1600))
      nodes.push({
        id: nodeId,
        group: cluster.label,
        color: cluster.color,
        val: minSize + sizeByLength * (maxSize - minSize),
        x: cluster.center.x + (unitFromHash(nodeId, "x") - 0.5) * spread,
        y: cluster.center.y + (unitFromHash(nodeId, "y") - 0.5) * spread,
        z: cluster.center.z + (unitFromHash(nodeId, "z") - 0.5) * spread,
        content: chunk.content,
        documentId: document.id,
        documentName: document.filename || document.id,
        chunkIndex: Number.isFinite(chunk.chunk_index) ? chunk.chunk_index : index,
        style: cluster.style,
      })

      if (index > 0) {
        const previous = chunks[index - 1]
        links.push({
          source: `${document.id}:${previous.id}`,
          target: nodeId,
          color: cluster.color,
        })
      }
    })
  }

  return {
    nodes,
    links,
    clusters: Array.from(clusterByKey.values()),
    summary,
  }
}

export async function loadVectorNebulaData(): Promise<NebulaData> {
  const documentList = await documentApi.list({ limit: 24, status: 'completed' })
  const documents = (documentList.items || []) as DocumentListItem[]
  const requestedDocuments = documents.slice(0, DOCUMENT_LIMIT)
  const chunksByDocument = new Map<string, DocumentChunkItem[]>()
  const results = await Promise.allSettled(
    requestedDocuments.map(async (document) => {
      const chunkList = await documentApi.listChunks(document.id, { limit: CHUNK_LIMIT })
      return { document, chunks: (chunkList.items || []) as DocumentChunkItem[] }
    })
  )

  const loadedDocuments: DocumentListItem[] = []
  let failedDocumentCount = 0
  for (const result of results) {
    if (result.status === 'rejected') {
      failedDocumentCount += 1
      continue
    }
    loadedDocuments.push(result.value.document)
    chunksByDocument.set(result.value.document.id, result.value.chunks)
  }

  return buildNebula(loadedDocuments, chunksByDocument, {
    listedDocumentCount: documents.length,
    requestedDocumentCount: requestedDocuments.length,
    loadedDocumentCount: loadedDocuments.length,
    failedDocumentCount,
    omittedDocumentCount: Math.max(0, documents.length - requestedDocuments.length),
  })
}

export function VectorNebula() {
  const { resolvedTheme } = useTheme()
  const viewportRef = useRef<HTMLDivElement>(null)
  const fgRef = useRef<ForceGraphMethods | undefined>(undefined)
  const [isOverviewOpen, setIsOverviewOpen] = useState(true)
  const { width, height } = useResizeObserver(viewportRef)
  const nebulaQuery = useQuery({
    queryKey: queryKeys.documents.nebula,
    queryFn: loadVectorNebulaData,
  })
  const data = nebulaQuery.data ?? EMPTY_NEBULA
  const loading = nebulaQuery.isFetching
  const error = nebulaQuery.error
    ? formatApiError(nebulaQuery.error, "语义星云数据加载失败")
    : null

  useEffect(() => {
    const originalWarn = console.warn
    const patchedWarn = (...args: unknown[]) => {
      // react-force-graph-3d still emits this upstream Three.js deprecation in dev.
      if (isThreeClockDeprecationWarning(args)) return
      originalWarn(...args)
    }
    console.warn = patchedWarn
    return () => {
      if (console.warn === patchedWarn) {
        console.warn = originalWarn
      }
    }
  }, [])

  const isDark = resolvedTheme === 'dark'
  const bgColor = getCssHslColor('--background', isDark ? '#0f1722' : '#f8fafc')
  const totalChunks = useMemo(
    () => data.clusters.reduce((sum, cluster) => sum + cluster.chunkCount, 0),
    [data.clusters]
  )
  const hasData = data.nodes.length > 0

  return (
    <div
      ref={viewportRef}
      className="relative h-full min-h-[520px] w-full overflow-hidden bg-background"
      data-vector-nebula="true"
      aria-busy={loading}
    >
      {width > 0 && height > 0 ? (
        <ForceGraph3D
          ref={fgRef}
          width={width}
          height={height}
          graphData={data}
          backgroundColor={bgColor}
          showNavInfo={false}
          nodeLabel={(rawNode: unknown) => {
            const node = rawNode as NebulaNode
            return `${node.group} · ${node.documentName}\n切片 ${node.chunkIndex ?? '-'}\n${node.content.slice(0, 220)}`
          }}
          nodeColor="color"
          nodeRelSize={1.2}
          nodeOpacity={0.92}
          nodeResolution={10}
          linkColor={(rawLink: unknown) => (rawLink as NebulaLink).color}
          linkOpacity={0.18}
          enableNodeDrag={false}
          cooldownTicks={0}
          onNodeClick={(rawNode: unknown) => {
            const node = rawNode as NebulaNode
            const distance = 40
            const distRatio = 1 + distance / Math.max(1, Math.hypot(node.x, node.y, node.z))
            fgRef.current?.cameraPosition(
              { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio },
              node,
              600
            )
          }}
          nodeThreeObject={(rawNode: unknown) => {
            const node = rawNode as NebulaNode
            const [minSize] = node.style.sizeRange
            const coreSize = Math.max(node.val ?? minSize, minSize)
            const geometry = createClusterGeometry(node.style.geometry, coreSize)
            const material = new THREE.MeshBasicMaterial({ color: node.color })
            return new THREE.Mesh(geometry, material)
          }}
        />
      ) : (
        <div className="flex h-full min-h-[520px] items-center justify-center">
          <Loader2 className="size-6 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
          <span className="sr-only">正在准备语义分布画布</span>
        </div>
      )}

      <div className="absolute right-3 top-3 z-20 flex items-center gap-2 sm:right-4 sm:top-4">
        <IconButton
          label="重置语义分布视图"
          variant="outline"
          className="size-10 rounded-md border-border bg-background"
          disabled={!hasData}
          onClick={() => fgRef.current?.zoomToFit(500, 48)}
        >
          <RotateCcw className="size-4" aria-hidden="true" />
        </IconButton>
        {!isOverviewOpen ? (
          <IconButton
            label="显示语义分布概览"
            variant="outline"
            className="size-10 rounded-md border-border bg-background"
            onClick={() => setIsOverviewOpen(true)}
          >
            <Info className="size-4" aria-hidden="true" />
          </IconButton>
        ) : null}
      </div>

      {isOverviewOpen ? (
        <aside className="absolute inset-x-3 bottom-3 z-20 max-h-[min(46dvh,360px)] overflow-y-auto rounded-md border border-border bg-background p-4 sm:bottom-auto sm:left-4 sm:right-auto sm:top-4 sm:max-h-[calc(100%-2rem)] sm:w-[360px]">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-base font-semibold text-foreground">语义分布</h1>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                按文档类型查看已完成入库的内容切片。
              </p>
            </div>
            <IconButton
              label="收起语义分布概览"
              variant="ghost"
              className="size-9 rounded-md"
              onClick={() => setIsOverviewOpen(false)}
            >
              <PanelLeftClose className="size-4" aria-hidden="true" />
            </IconButton>
          </div>

          <div className="mt-4 border-t border-border pt-4">
            {loading && !hasData ? (
              <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                正在读取可视化切片…
              </div>
            ) : error && !hasData ? (
              <QueryErrorState
                title="语义分布加载失败"
                description={error}
                retrying={loading}
                onRetry={() => {
                  void nebulaQuery.refetch()
                }}
                className="border-0 bg-transparent p-0"
              />
            ) : !hasData && data.summary.failedDocumentCount > 0 ? (
              <QueryErrorState
                title="切片暂时无法读取"
                description="文档列表已加载，但本次切片请求均未成功。请重新加载。"
                retrying={loading}
                onRetry={() => {
                  void nebulaQuery.refetch()
                }}
                className="border-0 bg-transparent p-0"
              />
            ) : !hasData ? (
              <div className="flex items-start gap-3" role="status">
                <Database className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium text-foreground">暂无可视化切片</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    请先上传文档并等待入库完成，然后重新加载。
                  </p>
                </div>
              </div>
            ) : (
              <div>
                {error ? (
                  <p className="mb-4 border-y border-warning/30 bg-warning/10 px-3 py-2 text-sm leading-6 text-foreground" role="status">
                    刷新失败，当前继续显示上一次成功读取的结果。
                  </p>
                ) : null}

                <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <div>
                    <dt className="text-xs text-muted-foreground">已读取文档</dt>
                    <dd className="mt-1 text-sm font-semibold text-foreground">
                      {data.summary.loadedDocumentCount} 篇
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">可视化切片</dt>
                    <dd className="mt-1 text-sm font-semibold text-foreground">{totalChunks} 个</dd>
                  </div>
                </dl>

                {data.summary.failedDocumentCount > 0 ? (
                  <p className="mt-4 border-y border-warning/30 bg-warning/10 px-3 py-2 text-sm leading-6 text-foreground" role="status">
                    {data.summary.failedDocumentCount} 篇文档暂时无法读取，当前画布只显示其余结果。
                  </p>
                ) : null}

                <div className="mt-4 border-t border-border">
                  {data.clusters.map((cluster) => (
                    <div key={cluster.label} className="flex items-center gap-3 border-b border-border py-3">
                      <span
                        className="size-3 shrink-0 rounded-sm border border-border"
                        style={{ backgroundColor: cluster.color }}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 text-sm font-medium text-foreground">
                        {cluster.label}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {cluster.count} 篇 · {cluster.chunkCount} 个切片
                      </span>
                    </div>
                  ))}
                </div>

                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  单次最多读取 {DOCUMENT_LIMIT} 篇文档，每篇最多 {CHUNK_LIMIT} 个切片。
                  {data.summary.omittedDocumentCount > 0
                    ? ` 还有 ${data.summary.omittedDocumentCount} 篇文档未加入本次画布。`
                    : ''}
                </p>
              </div>
            )}
          </div>
        </aside>
      ) : null}
    </div>
  )
}
