// @vitest-environment happy-dom

import { useRef, useState } from 'react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { GraphData } from '@/lib/graph-parser'
import { renderHook, waitForAssertion } from '@/test/hook-harness'
import type { KGEntityDetailResponse, KGEventDetailResponse, KGStatsResponse, RagTrace } from '@/types'

import type { GraphNodeLike } from './graph-page-utils'

const graphServiceMock = vi.hoisted(() => ({
  fetchInitialGraph: vi.fn(),
}))

const apiMock = vi.hoisted(() => ({
  details: vi.fn(),
  getStats: vi.fn(),
}))

vi.mock('@/lib/graph-service', () => ({
  GraphService: graphServiceMock,
}))

vi.mock('@/lib/api', () => ({
  metaApi: {
    details: apiMock.details,
  },
}))

vi.mock('@/lib/api/graph', () => ({
  kgApi: {
    getStats: apiMock.getStats,
  },
}))

vi.mock('@/lib/client-logging', () => ({
  reportClientError: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    message: vi.fn(),
    success: vi.fn(),
  },
}))

import { useGraphDataLoading } from './use-graph-data-loading'

type TestScope = {
  hasScope: boolean
  directDocIds: string[]
  datasetId: string | null
  pipelineHash: string | null
  docLimit: number
}

function createScope(datasetId: string, documentId: string): TestScope {
  return {
    hasScope: true,
    directDocIds: [documentId],
    datasetId,
    pipelineHash: null,
    docLimit: 200,
  }
}

function createGraph(id: string): GraphData {
  return {
    nodes: [{ id, label: id }],
    links: [],
  }
}

function renderGraphDataLoadingHook() {
  let scope = createScope('dataset-a', 'document-a')
  let scopedDocumentIds = ['document-a']
  const resetPathMode = vi.fn()
  const resetConnectMode = vi.fn()
  const resetExplainMode = vi.fn()

  const hook = renderHook(() => {
    const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] })
    const [fileName, setFileName] = useState<string | null>(null)
    const [dataSource, setDataSource] = useState<'live' | 'file'>('live')
    const [traceReplay, setTraceReplay] = useState<RagTrace | null>(null)
    const [kgStats, setKgStats] = useState<KGStatsResponse | null>(null)
    const [kgNodeDetail, setKgNodeDetail] = useState<KGEntityDetailResponse | KGEventDetailResponse | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [isDetailOpen, setIsDetailOpen] = useState(false)
    const [selectedNode, setSelectedNode] = useState<GraphNodeLike | null>(null)
    const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d')
    const traceFileInputRef = useRef<HTMLInputElement>(null)
    const manualKgFileInputRef = useRef<HTMLInputElement>(null)

    const dataLoading = useGraphDataLoading({
      scope,
      scopedDocumentIds,
      scopedDatasetDocIdsLoading: false,
      scopeParams: {
        document_ids: scopedDocumentIds,
        dataset_id: scope.datasetId || undefined,
      },
      includeEntityLinks: true,
      includeRelationLinks: false,
      minSharedEvents: 2,
      maxEntityLinks: 1000,
      setGraphData,
      setFileName,
      setDataSource,
      setTraceReplay,
      setKgStats,
      setKgNodeDetail,
      setIsLoading,
      setIsDetailOpen,
      setSelectedNode,
      setViewMode,
      traceFileInputRef,
      manualKgFileInputRef,
      resetPathMode,
      resetConnectMode,
      resetExplainMode,
    })

    return {
      ...dataLoading,
      graphData,
      fileName,
      dataSource,
      traceReplay,
      kgStats,
      kgNodeDetail,
      isLoading,
      isDetailOpen,
      selectedNode,
      viewMode,
    }
  })

  return {
    hook,
    switchScope(datasetId: string, documentId: string) {
      scope = createScope(datasetId, documentId)
      scopedDocumentIds = [documentId]
      hook.rerender()
    },
  }
}

describe('useGraphDataLoading 作用域隔离', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMock.details.mockResolvedValue({ features: { kg_enabled: true } })
    apiMock.getStats.mockResolvedValue({})
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('切换后的图谱请求失败时清除旧数据，并能重试当前范围', async () => {
    graphServiceMock.fetchInitialGraph
      .mockResolvedValueOnce(createGraph('node-a'))
      .mockRejectedValueOnce({
        response: {
          status: 403,
          data: { detail: '无权查看该知识库图谱' },
        },
      })
      .mockResolvedValueOnce(createGraph('node-b'))

    const { hook, switchScope } = renderGraphDataLoadingHook()

    await waitForAssertion(() => {
      expect(hook.result.current.graphData.nodes.map((node) => node.id)).toEqual(['node-a'])
      expect(hook.result.current.loadError).toBeNull()
    })

    switchScope('dataset-b', 'document-b')

    await waitForAssertion(() => {
      expect(hook.result.current.isLoading).toBe(false)
      expect(hook.result.current.graphData).toEqual({ nodes: [], links: [] })
      expect(hook.result.current.loadError).toContain('无权查看该知识库图谱')
    })
    expect(graphServiceMock.fetchInitialGraph).toHaveBeenCalledTimes(2)

    await act(async () => {
      await hook.result.current.retryInitialData()
    })

    await waitForAssertion(() => {
      expect(hook.result.current.graphData.nodes.map((node) => node.id)).toEqual(['node-b'])
      expect(hook.result.current.loadError).toBeNull()
    })
    expect(graphServiceMock.fetchInitialGraph).toHaveBeenCalledTimes(3)
    hook.unmount()
  })

  it('快速切换范围时不让旧请求覆盖当前图谱', async () => {
    let resolveFirstRequest: ((graph: GraphData) => void) | null = null
    graphServiceMock.fetchInitialGraph
      .mockImplementationOnce(
        () =>
          new Promise<GraphData>((resolve) => {
            resolveFirstRequest = resolve
          })
      )
      .mockResolvedValueOnce(createGraph('node-b'))

    const { hook, switchScope } = renderGraphDataLoadingHook()

    await waitForAssertion(() => {
      expect(graphServiceMock.fetchInitialGraph).toHaveBeenCalledTimes(1)
    })

    switchScope('dataset-b', 'document-b')

    await waitForAssertion(() => {
      expect(hook.result.current.graphData.nodes.map((node) => node.id)).toEqual(['node-b'])
    })

    await act(async () => {
      resolveFirstRequest?.(createGraph('late-node-a'))
      await Promise.resolve()
    })

    expect(hook.result.current.graphData.nodes.map((node) => node.id)).toEqual(['node-b'])
    expect(hook.result.current.loadError).toBeNull()
    hook.unmount()
  })
})
