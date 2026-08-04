'use client'

import {
  ArrowRightLeft,
  BarChart3,
  Database,
  Download,
  FileJson,
  FolderOpen,
  GitCompare,
  Hash,
  Layers,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react'
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'

import { AppFrame } from '@/components/app-frame'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/ui/page-header'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { formatApiError } from '@/lib/api-errors'
import { datasetApi } from '@/lib/api/datasets'
import { documentApi } from '@/lib/api/documents'
import { kgApi } from '@/lib/api/graph'
import { metaApi } from '@/lib/api/meta'
import { reportApi } from '@/lib/api/reports'
import { sanitizeFilename } from '@/lib/sanitize'
import { cn, detachPromise } from '@/lib/utils'
import type { Dataset, KGGraphResponse } from '@/types'

import { JsonCodePane } from './components/json-code-pane'
import { SnapshotAuditPanel } from './components/snapshot-audit-panel'
import { SnapshotDiffView } from './components/snapshot-diff-view'
import { SnapshotGraphCanvas } from './components/snapshot-graph-canvas'
import { SnapshotNodeDetailsRail } from './components/snapshot-node-details-rail'
import { SnapshotStudioToolbar } from './components/snapshot-studio-toolbar'
import {
  DiffEmptyState,
  SnapshotInlineStat,
  WorkspaceSection,
  getHashPairIcon,
} from './components/shared'
import {
  DIFF_KEYS,
  SNAPSHOT_HEADER_ACTION_CLASS,
  SNAPSHOT_ICON_ACTION_CLASS,
  SNAPSHOT_PRIMARY_COMPARE_CLASS,
  SNAPSHOT_SECONDARY_ACTION_CLASS,
} from './constants'
import { buildSnapshotStudioGraphFromKgGraph } from './snapshot-graph'
import type {
  PipelineCandidate,
  SnapshotDeltaRow,
  SnapshotDiffPayload,
  SnapshotPayload,
  SnapshotView,
  StudioCanvasView,
  WorkspaceTab,
} from './types'
import {
  auditSeverityForDriftScore,
  compactHashLabel,
  copyToClipboard,
  downloadJson,
  exactDiffCount,
  firstDisplayString,
  getDatasetLabel,
  getDocumentMetaValue,
  getHashPairStatus,
  getHashPairTone,
  getScopeDocumentCountLabel,
  getSelectedDatasetLabel,
  getSnapshotScopeSubtitle,
  mergePipelineCandidate,
  parseDocumentIds,
  prettyJson,
  sortPipelineCandidates,
} from './utils'

export function KGSnapshotsPage() {
  const searchParams = useSearchParams()
  const scopeParamKey = searchParams.toString()
  const datasetIdFromUrl = useMemo(() => {
    return (new URLSearchParams(scopeParamKey).get('dataset_id') || '').trim()
  }, [scopeParamKey])

  const [pipelineHashA, setPipelineHashA] = useState('')
  const [pipelineHashB, setPipelineHashB] = useState('')
  const [documentIdsRaw, setDocumentIdsRaw] = useState('')
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [datasetsLoading, setDatasetsLoading] = useState(false)
  const [selectedDatasetId, setSelectedDatasetId] = useState(datasetIdFromUrl)
  const [pipelineCandidates, setPipelineCandidates] = useState<PipelineCandidate[]>([])
  const [pipelineCandidatesLoading, setPipelineCandidatesLoading] = useState(false)
  const [pipelineCandidatesError, setPipelineCandidatesError] = useState<string | null>(null)
  const [advancedHashOpen, setAdvancedHashOpen] = useState(false)
  const [liveGraph, setLiveGraph] = useState<KGGraphResponse | null>(null)
  const [liveGraphLoading, setLiveGraphLoading] = useState(false)
  const [liveGraphError, setLiveGraphError] = useState<string | null>(null)
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('studio')
  const [activeView, setActiveView] = useState<SnapshotView>('diff')
  const [studioCanvasView, setStudioCanvasView] =
    useState<StudioCanvasView>('graph')
  const [studioSearch, setStudioSearch] = useState('')
  const [studioNodeType, setStudioNodeType] = useState('all')
  const [studioRelationType, setStudioRelationType] = useState('all')
  const [studioLayout, setStudioLayout] = useState('force')
  const [selectedStudioNodeId, setSelectedStudioNodeId] = useState('')
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false)
  const [includeZeroDeltas, setIncludeZeroDeltas] = useState(true)
  const [compactAuditRows, setCompactAuditRows] = useState(true)

  const [snapA, setSnapA] = useState<SnapshotPayload | null>(null)
  const [snapB, setSnapB] = useState<SnapshotPayload | null>(null)
  const [diff, setDiff] = useState<SnapshotDiffPayload | null>(null)
  const [latencyMs, setLatencyMs] = useState<number | null>(null)
  const [isRunning, setIsRunning] = useState(false)

  const documentIds = useMemo(
    () => parseDocumentIds(documentIdsRaw),
    [documentIdsRaw]
  )
  const selectedDataset = useMemo(
    () => datasets.find((dataset) => dataset.id === selectedDatasetId) ?? null,
    [datasets, selectedDatasetId]
  )
  const scopeDatasetId = selectedDatasetId || undefined
  const scopeDocumentIds = documentIds.length > 0 ? documentIds : undefined
  const scopeDocumentIdsKey = scopeDocumentIds?.join(',') ?? ''
  const selectedDatasetLabel = getSelectedDatasetLabel(selectedDataset, selectedDatasetId)
  const scopeDocumentCountLabel = getScopeDocumentCountLabel(documentIds.length, selectedDatasetId)

  useEffect(() => {
    setSelectedDatasetId(datasetIdFromUrl)
    setPipelineHashA('')
    setPipelineHashB('')
    setSnapA(null)
    setSnapB(null)
    setDiff(null)
  }, [datasetIdFromUrl])

  useEffect(() => {
    let cancelled = false
    setDatasetsLoading(true)
    ;(async () => {
      try {
        const result = await datasetApi.listAll()
        if (!cancelled) {
          setDatasets(result)
        }
      } catch {
        if (!cancelled) setDatasets([])
      } finally {
        if (!cancelled) setDatasetsLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const selectedDataset = selectedDatasetId.trim()
    setPipelineCandidatesLoading(true)
    setPipelineCandidatesError(null)
    ;(async () => {
      const candidateMap = new Map<string, PipelineCandidate>()
      try {
        if (selectedDataset) {
          const report = await reportApi.getDatasetReport(selectedDataset).catch(() => null)
          for (const version of report?.pipeline_versions ?? []) {
            mergePipelineCandidate(candidateMap, {
              hash: String(version.pipeline_hash || '').trim(),
              documents: Number(version.documents ?? 0) || 0,
              source: 'report',
              active: String(version.pipeline_hash || '').trim() === String(report?.pipeline_hash || '').trim(),
            })
          }
          const reportHash = String(report?.pipeline_hash || '').trim()
          if (reportHash) {
            const profile = report?.profile && typeof report.profile === 'object' ? report.profile : {}
            mergePipelineCandidate(candidateMap, {
              hash: reportHash,
              documents: Number((profile as Record<string, unknown>).document_count ?? 0) || 0,
              source: 'report',
              active: true,
            })
          }
        }

        const documents = await documentApi
          .list({
            skip: 0,
            limit: 200,
            dataset_id: selectedDataset || null,
            order_by: 'created_at',
            order_dir: 'desc',
          })
          .catch(() => null)

        for (const document of documents?.items ?? []) {
          const activeHash = firstDisplayString(
            getDocumentMetaValue(document, 'active_pipeline_hash')
          )
          const currentHash = firstDisplayString(getDocumentMetaValue(document, 'pipeline_hash'))
          if (activeHash) {
            mergePipelineCandidate(candidateMap, {
              hash: activeHash,
              documents: 1,
              source: 'documents',
              active: true,
            })
          }
          if (currentHash) {
            mergePipelineCandidate(candidateMap, {
              hash: currentHash,
              documents: 1,
              source: 'documents',
              active: currentHash === activeHash,
            })
          }
        }

        if (!cancelled) {
          const next = sortPipelineCandidates(Array.from(candidateMap.values()))
          setPipelineCandidates(next)
          setPipelineHashB((current) =>
            current.trim() ? current : next[0]?.hash ?? ''
          )
          setPipelineHashA((current) =>
            current.trim() ? current : next[1]?.hash ?? ''
          )
        }
      } catch (err) {
        if (!cancelled) {
          setPipelineCandidates([])
          setPipelineCandidatesError(formatApiError(err, '快照候选加载失败'))
        }
      } finally {
        if (!cancelled) setPipelineCandidatesLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [selectedDatasetId])

  const snapAJson = useMemo(
    () => prettyJson(snapA ?? { hint: '点击左侧“导出 A”生成快照。' }),
    [snapA]
  )
  const snapBJson = useMemo(
    () => prettyJson(snapB ?? { hint: '点击左侧“导出 B”生成快照。' }),
    [snapB]
  )
  const diffJson = useMemo(
    () => prettyJson(diff ?? { hint: '点击左侧“开始对比”生成差异结果。' }),
    [diff]
  )

  const diffDelta = useMemo(() => {
    const delta =
      diff?.delta && typeof diff.delta === 'object' ? diff.delta : null
    const entityTypesDelta = Array.isArray(diff?.entity_types_delta)
      ? diff.entity_types_delta
      : []
    return { delta, entityTypesDelta }
  }, [diff])
  const deferredEntityTypesDelta = useDeferredValue(diffDelta.entityTypesDelta)

  async function runExport(which: 'a' | 'b'): Promise<void> {
    const pipelineHash = (which === 'a' ? pipelineHashA : pipelineHashB).trim()
    if (!pipelineHash) {
      toast.error(which === 'a' ? '请选择快照 A' : '请选择快照 B')
      return
    }

    setIsRunning(true)
    try {
      const snapshot = await kgApi.exportSnapshot({
        pipeline_hash: pipelineHash,
        dataset_id: scopeDatasetId,
        document_ids: scopeDocumentIds,
        include_details: true,
      })
      if (which === 'a') {
        setSnapA(snapshot)
        setActiveView('a')
      } else {
        setSnapB(snapshot)
        setActiveView('b')
      }
      toast.success(`已导出 ${which.toUpperCase()} 快照`)
    } catch (err) {
      toast.error(formatApiError(err, '导出图谱快照失败'))
    } finally {
      setIsRunning(false)
    }
  }

  async function runCompare(): Promise<void> {
    const a = pipelineHashA.trim()
    const b = pipelineHashB.trim()
    if (!a || !b) {
      toast.error('请选择快照 A 和快照 B')
      return
    }
    if (a === b) {
      toast.error('快照 A 和快照 B 不能选择同一版本')
      return
    }

    setIsRunning(true)
    setLatencyMs(null)
    try {
      const start = Date.now()
      const [snapshotA, snapshotB] = await Promise.all([
        kgApi.exportSnapshot({
          pipeline_hash: a,
          dataset_id: scopeDatasetId,
          document_ids: scopeDocumentIds,
          include_details: true,
        }),
        kgApi.exportSnapshot({
          pipeline_hash: b,
          dataset_id: scopeDatasetId,
          document_ids: scopeDocumentIds,
          include_details: true,
        }),
      ])
      const result = await kgApi.diffSnapshots({
        snapshot_a: snapshotA,
        snapshot_b: snapshotB,
      })
      setLatencyMs(Math.max(0, Date.now() - start))
      setSnapA(snapshotA)
      setSnapB(snapshotB)
      setDiff(result)
      setActiveView('diff')
      toast.success('已生成对比结果')
    } catch (err) {
      toast.error(formatApiError(err, '图谱快照对比失败'))
    } finally {
      setIsRunning(false)
    }
  }

  async function runBackendCompare(): Promise<void> {
    const a = pipelineHashA.trim()
    const b = pipelineHashB.trim()
    if (!a || !b) {
      toast.error('请选择快照 A 和快照 B')
      return
    }
    if (a === b) {
      toast.error('快照 A 和快照 B 不能选择同一版本')
      return
    }

    setIsRunning(true)
    setLatencyMs(null)
    try {
      const start = Date.now()
      const result = await kgApi.compareSnapshots({
        pipeline_hash_a: a,
        pipeline_hash_b: b,
        dataset_id: scopeDatasetId,
        document_ids: scopeDocumentIds,
      })
      setLatencyMs(Math.max(0, Date.now() - start))
      setDiff(result)
      setActiveView('diff')
      toast.success('服务端对比完成')
    } catch (err) {
      toast.error(formatApiError(err, '服务端对比失败'))
    } finally {
      setIsRunning(false)
    }
  }

  const hashAValue = pipelineHashA.trim()
  const hashBValue = pipelineHashB.trim()
  const liveGraphPipelineHash = hashBValue || hashAValue || undefined
  const hasHashA = Boolean(hashAValue)
  const hasHashB = Boolean(hashBValue)
  const hashATitle = hashAValue || '未设置'
  const hashBTitle = hashBValue || '未设置'
  const hashPairStatus = getHashPairStatus(hasHashA, hasHashB)
  const hashPairTitle = `A: ${hashAValue || '未填写'}\nB: ${hashBValue || '未填写'}`
  const hashPairTone = getHashPairTone(hasHashA, hasHashB)
  const hashPairIcon = getHashPairIcon(hasHashA, hasHashB)
  const diffBaseName =
    sanitizeFilename(
      `kg_snapshot_${hashAValue || 'A'}_vs_${hashBValue || 'B'}`
    ) || 'kg_snapshot'
  const snapshotScopeSubtitle = getSnapshotScopeSubtitle(
    scopeDocumentIds?.length ?? 0,
    scopeDatasetId,
    selectedDatasetLabel
  )
  const snapshotAFileName =
    sanitizeFilename(`kg_snapshot_${hashAValue || 'A'}`) || 'kg_snapshot_A'
  const snapshotBFileName =
    sanitizeFilename(`kg_snapshot_${hashBValue || 'B'}`) || 'kg_snapshot_B'
  useEffect(() => {
    let cancelled = false
    setLiveGraphLoading(true)
    setLiveGraphError(null)
    ;(async () => {
      try {
        const meta = await metaApi.details().catch(() => null)
        if (meta?.features?.kg_enabled === false) {
          if (!cancelled) {
            setLiveGraph({ nodes: [], links: [] })
            setLiveGraphError(
              '图谱功能尚未启用。请在设置中开启图谱抽取后刷新。'
            )
          }
          return
        }

        const graph = await kgApi.getGraph({
          dataset_id: scopeDatasetId,
          document_ids: scopeDocumentIds,
          pipeline_hash: liveGraphPipelineHash,
          max_events: 80,
          max_entities: 80,
          max_links: 160,
          include_entity_links: true,
          include_relation_links: true,
          min_shared_events: 1,
          max_entity_links: 160,
        })
        if (!cancelled) setLiveGraph(graph)
      } catch (err) {
        if (!cancelled) {
          setLiveGraph({ nodes: [], links: [] })
          setLiveGraphError(formatApiError(err, '图谱读取失败'))
        }
      } finally {
        if (!cancelled) setLiveGraphLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    liveGraphPipelineHash,
    selectedDatasetId,
    scopeDatasetId,
    scopeDocumentIds,
    scopeDocumentIdsKey,
  ])

  const studioGraph = useMemo(
    () => buildSnapshotStudioGraphFromKgGraph(liveGraph),
    [liveGraph]
  )
  const nodeTypes = useMemo(
    () => Array.from(new Set(studioGraph.nodes.map((node) => node.type))),
    [studioGraph.nodes]
  )
  const relationTypes = useMemo(
    () => Array.from(new Set(studioGraph.links.map((link) => link.label))),
    [studioGraph.links]
  )
  const selectedStudioNode = useMemo(() => {
    if (!selectedStudioNodeId) return null
    return (
      studioGraph.nodes.find((node) => node.id === selectedStudioNodeId) ?? null
    )
  }, [selectedStudioNodeId, studioGraph.nodes])
  useEffect(() => {
    if (studioGraph.nodes.length === 0) {
      if (selectedStudioNodeId) setSelectedStudioNodeId('')
      return
    }
    if (
      selectedStudioNodeId &&
      !studioGraph.nodes.some((node) => node.id === selectedStudioNodeId)
    ) {
      setSelectedStudioNodeId('')
    }
  }, [selectedStudioNodeId, studioGraph.nodes])

  const deltaRows = useMemo<SnapshotDeltaRow[]>(() => {
    return DIFF_KEYS.map((key) => {
      const a = Number(snapA?.[key] ?? 0)
      const b = Number(snapB?.[key] ?? 0)
      const d = Number(diffDelta.delta?.[key] ?? b - a)
      return {
        key,
        a: Number.isFinite(a) ? a : 0,
        b: Number.isFinite(b) ? b : 0,
        delta: Number.isFinite(d) ? d : 0,
      }
    })
  }, [diffDelta.delta, snapA, snapB])
  const driftScore = useMemo(() => {
    const denominator = deltaRows.reduce(
      (acc, row) => acc + Math.max(Math.max(row.a, row.b), 1),
      0
    )
    if (denominator <= 0) return 0
    const totalDelta = deltaRows.reduce(
      (acc, row) => acc + Math.abs(row.delta),
      0
    )
    return totalDelta / denominator
  }, [deltaRows])
  const auditSeverity = auditSeverityForDriftScore(driftScore)
  const auditDriftRows = useMemo(() => {
    return [...deferredEntityTypesDelta].sort(
      (a, b) => Math.abs(Number(b.delta ?? 0)) - Math.abs(Number(a.delta ?? 0))
    )
  }, [deferredEntityTypesDelta])
  const diffOverview = useMemo(() => {
    const nodeAdded = exactDiffCount(diff?.node_diff, 'added_count')
    const nodeRemoved = exactDiffCount(diff?.node_diff, 'removed_count')
    const nodeChanged = exactDiffCount(diff?.node_diff, 'changed_count')
    const edgeAdded = exactDiffCount(diff?.edge_diff, 'added_count')
    const edgeRemoved = exactDiffCount(diff?.edge_diff, 'removed_count')
    return [
      {
        label: '节点变化',
        value: nodeAdded + nodeRemoved + nodeChanged,
        tone: 'bg-muted-foreground/50',
      },
      { label: '属性变化', value: nodeChanged, tone: 'bg-success' },
      { label: '新增关系', value: edgeAdded, tone: 'bg-destructive' },
      { label: '删除关系', value: edgeRemoved, tone: 'bg-destructive' },
      {
        label: '重要变化',
        value: driftScore >= 0.35 ? 1 : 0,
        tone: 'bg-warning',
      },
    ]
  }, [diff, driftScore])
  const formInputClassName =
    'h-10 rounded-md border-border bg-background text-sm shadow-none'
  const formTextareaClassName =
    'min-h-[108px] resize-none rounded-md border-border bg-background text-sm shadow-none'

  return (
    <AppFrame showBackground={false}>
      <div className="flex min-h-full flex-col bg-background lg:h-full lg:min-h-0">
        <header className="shrink-0 border-b border-border bg-background">
          <div className="px-4 py-3 md:px-6">
            <PageHeader
              title="图谱快照"
              description="对比同一数据集不同入库/治理版本生成的图谱快照，并快速判断结构波动。"
              iconImage="kg-snapshot"
              icon={GitCompare}
              iconColor="text-info"
              compact
              className="p-0"
            >
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(SNAPSHOT_HEADER_ACTION_CLASS, 'gap-1.5')}
                  title={
                    hashAValue && hashBValue
                      ? '重新导出并刷新 A/B 对比结果'
                      : '先填写快照 A / 快照 B'
                  }
                  disabled={isRunning || !hashAValue || !hashBValue}
                  onClick={() => detachPromise(runCompare())}
                >
                  <RefreshCcw
                    className={cn('h-3.5 w-3.5', isRunning && 'animate-spin')}
                    aria-hidden="true"
                  />
                  刷新对比
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  className={SNAPSHOT_ICON_ACTION_CLASS}
                  title="清空"
                  onClick={() => {
                    setSnapA(null)
                    setSnapB(null)
                    setDiff(null)
                    setLatencyMs(null)
                    startTransition(() => {
                      setWorkspaceTab('studio')
                      setActiveView('diff')
                      setStudioCanvasView('graph')
                    })
                    toast.message('已清空')
                  }}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>

                <Button
                  variant="outline"
                  size="icon"
                  className={SNAPSHOT_ICON_ACTION_CLASS}
                  onClick={() => setLeftSidebarCollapsed((prev) => !prev)}
                  aria-label={
                    leftSidebarCollapsed ? '展开参数栏' : '折叠参数栏'
                  }
                  title={leftSidebarCollapsed ? '展开参数栏' : '折叠参数栏'}
                >
                  {leftSidebarCollapsed ? (
                    <PanelLeftOpen className="h-4 w-4" />
                  ) : (
                    <PanelLeftClose className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </PageHeader>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
          <aside
            className={cn(
              'flex w-full flex-none flex-col border-b border-border bg-background transition-[width,opacity] duration-150 motion-reduce:transition-none lg:min-h-0 lg:w-[280px] lg:border-b-0 lg:border-r',
              leftSidebarCollapsed
                ? 'hidden overflow-hidden border-0 opacity-0 lg:flex lg:w-0'
                : 'opacity-100'
            )}
          >
            <div className="flex min-h-0 flex-col lg:h-full">
              <div className="shrink-0 border-b border-border bg-background px-4 py-3">
                <div className="grid grid-cols-2 gap-1 rounded-md border border-border bg-muted/30 p-1">
                  <button
                    type="button"
                    className={cn(
                      'inline-flex h-9 items-center justify-center gap-1.5 rounded-sm text-xs font-medium transition-colors',
                      workspaceTab === 'studio'
                        ? 'bg-background text-primary ring-1 ring-border'
                        : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                    )}
                    onClick={() => {
                      startTransition(() => setWorkspaceTab('studio'))
                    }}
                  >
                    <FileJson className="h-3.5 w-3.5" aria-hidden="true" />
                    工作台
                  </button>
                  <button
                    type="button"
                    className={cn(
                      'inline-flex h-9 items-center justify-center gap-1.5 rounded-sm text-xs font-medium transition-colors',
                      workspaceTab === 'audit'
                        ? 'bg-background text-primary ring-1 ring-border'
                        : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                    )}
                    onClick={() => {
                      startTransition(() => setWorkspaceTab('audit'))
                    }}
                  >
                    <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
                    评估
                  </button>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <SnapshotInlineStat
                    icon={hashPairIcon}
                    label="A/B"
                    value={hashPairStatus}
                    valueTitle={hashPairTitle}
                    tone={hashPairTone}
                  />
                  {typeof latencyMs === 'number' ? (
                    <SnapshotInlineStat
                      icon={<Sparkles className="h-3.5 w-3.5" />}
                      label="耗时"
                      value={`${latencyMs} ms`}
                      tone="neutral"
                    />
                  ) : null}
                </div>
              </div>

              <div className="min-h-0 flex-1 px-4 py-4 lg:overflow-y-auto">
                <div className="space-y-3">
                  <WorkspaceSection
                    icon={<Hash className="h-3.5 w-3.5" />}
                    label="快照版本"
                    hint={selectedDatasetId ? '已绑定数据集' : '全局候选'}
                  >
                    <div className="space-y-2.5">
                      <div className="rounded-md bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
                        选择数据集后会读取可对比版本。通常用 B 表示当前版本，A 表示之前的版本。
                      </div>

                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-muted-foreground">
                          {pipelineCandidatesLoading
                            ? '正在加载版本…'
                            : pipelineCandidatesError || (
                                pipelineCandidates.length > 0
                                  ? `已发现 ${pipelineCandidates.length} 个版本`
                                  : '当前数据集暂无可对比版本'
                              )}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                          onClick={() => setAdvancedHashOpen((value) => !value)}
                        >
                          {advancedHashOpen ? '收起手填' : '手动填写'}
                        </Button>
                      </div>

                      <div className="space-y-1.5">
                        <Label
                          htmlFor="pipeline-hash-a"
                          className="flex items-center gap-1.5 text-xs font-semibold text-foreground"
                        >
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-sm bg-success/10 text-xs font-bold text-success">
                            A
                          </span>
                          <span>快照 A</span>
                        </Label>
                        <select
                          id="pipeline-hash-a"
                          value={pipelineHashA}
                          onChange={(e) => setPipelineHashA(e.target.value)}
                          className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground outline-none transition-colors hover:bg-muted focus:ring-2 focus:ring-primary/20"
                        >
                          <option value="">
                            {pipelineCandidatesLoading ? '正在加载版本…' : '选择旧版本'}
                          </option>
                          {pipelineHashA &&
                          !pipelineCandidates.some((item) => item.hash === pipelineHashA) ? (
                            <option value={pipelineHashA}>
                              手动版本 · {compactHashLabel(pipelineHashA)}
                            </option>
                          ) : null}
                          {pipelineCandidates.map((item) => (
                            <option key={`a:${item.hash}`} value={item.hash}>
                              {item.active ? '当前' : '历史'} · {compactHashLabel(item.hash)} · {item.documents} 文档
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <Label
                          htmlFor="pipeline-hash-b"
                          className="flex items-center gap-1.5 text-xs font-semibold text-foreground"
                        >
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-sm bg-info/10 text-xs font-bold text-info">
                            B
                          </span>
                          <span>快照 B</span>
                        </Label>
                        <select
                          id="pipeline-hash-b"
                          value={pipelineHashB}
                          onChange={(e) => setPipelineHashB(e.target.value)}
                          className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground outline-none transition-colors hover:bg-muted focus:ring-2 focus:ring-primary/20"
                        >
                          <option value="">
                            {pipelineCandidatesLoading ? '正在加载版本…' : '选择当前版本'}
                          </option>
                          {pipelineHashB &&
                          !pipelineCandidates.some((item) => item.hash === pipelineHashB) ? (
                            <option value={pipelineHashB}>
                              手动版本 · {compactHashLabel(pipelineHashB)}
                            </option>
                          ) : null}
                          {pipelineCandidates.map((item) => (
                            <option key={`b:${item.hash}`} value={item.hash}>
                              {item.active ? '当前' : '历史'} · {compactHashLabel(item.hash)} · {item.documents} 文档
                            </option>
                          ))}
                        </select>
                      </div>

                      {advancedHashOpen ? (
                        <div className="space-y-2 rounded-md border border-border bg-muted/20 p-2.5">
                          <Input
                            aria-label="手动填写快照 A 哈希"
                            placeholder="手动填写快照 A 哈希"
                            value={pipelineHashA}
                            onChange={(e) => setPipelineHashA(e.target.value)}
                            className={formInputClassName}
                          />
                          <Input
                            aria-label="手动填写快照 B 哈希"
                            placeholder="手动填写快照 B 哈希"
                            value={pipelineHashB}
                            onChange={(e) => setPipelineHashB(e.target.value)}
                            className={formInputClassName}
                          />
                        </div>
                      ) : null}
                    </div>
                  </WorkspaceSection>

                  <WorkspaceSection
                    icon={<Layers className="h-3.5 w-3.5" />}
                    label="作用范围"
                    hint="数据集绑定"
                  >
                    <div className="space-y-1.5">
                      <Label
                        htmlFor="snapshot-dataset"
                        className="text-xs font-semibold text-foreground"
                      >
                        数据集
                      </Label>
                      <select
                        id="snapshot-dataset"
                        value={selectedDatasetId}
                        onChange={(event) => {
                          setSelectedDatasetId(event.target.value)
                          setPipelineHashA('')
                          setPipelineHashB('')
                          setSnapA(null)
                          setSnapB(null)
                          setDiff(null)
                        }}
                        className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground outline-none transition-colors hover:bg-muted focus:ring-2 focus:ring-primary/20"
                      >
                        <option value="">
                          {datasetsLoading ? '正在加载数据集…' : '全部数据集'}
                        </option>
                        {datasets.map((dataset) => (
                          <option key={dataset.id} value={dataset.id}>
                            {getDatasetLabel(dataset)}
                          </option>
                        ))}
                      </select>
                      <div className="text-xs leading-5 text-muted-foreground">
                        {selectedDatasetId
                          ? '系统会按数据集读取可访问文档，文档编号只用于排查单个文件或指定子集。'
                          : '选择全部数据集时，将读取当前账号可访问的全部图谱数据。'}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label
                        htmlFor="document-ids"
                        className="text-xs font-semibold text-foreground"
                      >
                        文档覆盖
                      </Label>
                      <Textarea
                        id="document-ids"
                        placeholder="按逗号或换行填写文档编号；留空使用后端按数据集解析的文档范围。"
                        value={documentIdsRaw}
                        onChange={(e) => setDocumentIdsRaw(e.target.value)}
                        rows={4}
                        className={cn(formTextareaClassName, 'min-h-[88px]')}
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <SnapshotInlineStat
                        icon={<Database className="h-3.5 w-3.5" />}
                        label="数据集"
                        value={selectedDatasetLabel}
                        valueClassName="max-w-[118px] truncate"
                        tone={selectedDatasetId ? 'neutral' : 'muted'}
                      />
                      <SnapshotInlineStat
                        icon={<FolderOpen className="h-3.5 w-3.5" />}
                        label="文档范围"
                        value={
                          documentIds.length
                            ? `${documentIds.length} 覆盖`
                            : scopeDocumentCountLabel
                        }
                        tone={scopeDocumentIds?.length ? 'neutral' : 'muted'}
                      />
                      <SnapshotInlineStat
                        icon={<ShieldCheck className="h-3.5 w-3.5" />}
                        label="模式"
                        value="脱敏"
                        tone="muted"
                      />
                    </div>
                  </WorkspaceSection>
                </div>
              </div>

              <div className="shrink-0 border-t border-border bg-background px-4 py-4">
                <div>
                  <div className="mb-2 flex items-center justify-between gap-2 px-1">
                    <div className="text-xs font-semibold text-foreground">
                      快照操作
                    </div>
                    <span className="text-xs text-muted-foreground">限制返回数量</span>
                  </div>

                  <Button
                    className={SNAPSHOT_PRIMARY_COMPARE_CLASS}
                    onClick={() => detachPromise(runCompare())}
                    disabled={isRunning}
                  >
                    {isRunning ? (
                      <RefreshCcw
                        className="h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <GitCompare className="h-4 w-4" aria-hidden="true" />
                    )}
                    {isRunning ? '对比中…' : '开始对比'}
                  </Button>

                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    <Button
                      variant="outline"
                      className={SNAPSHOT_SECONDARY_ACTION_CLASS}
                      onClick={() => detachPromise(runExport('a'))}
                      disabled={isRunning}
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      导出 A
                    </Button>
                    <Button
                      variant="outline"
                      className={SNAPSHOT_SECONDARY_ACTION_CLASS}
                      onClick={() => detachPromise(runExport('b'))}
                      disabled={isRunning}
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      导出 B
                    </Button>
                    <Button
                      variant="outline"
                      className={SNAPSHOT_SECONDARY_ACTION_CLASS}
                      onClick={() => detachPromise(runBackendCompare())}
                      disabled={isRunning}
                    >
                      <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden="true" />
                      服务端
                    </Button>
                  </div>
                </div>

                <p className="mt-2.5 px-1 text-xs leading-5 text-muted-foreground">
                  对比会检查节点、关系和属性版本。需要继续追踪时，可前往图谱诊断查看明细。
                </p>
              </div>
            </div>
          </aside>

          <div className="flex min-h-[620px] min-w-0 flex-1 bg-background lg:min-h-0">
            <section className="min-w-0 flex-1 bg-background">
              {workspaceTab === 'studio' ? (
                <div className="flex h-full min-h-0 flex-col">
                  <SnapshotStudioToolbar
                    searchValue={studioSearch}
                    nodeType={studioNodeType}
                    relationType={studioRelationType}
                    nodeTypes={nodeTypes}
                    relationTypes={relationTypes}
                    layout={studioLayout}
                    studioView={studioCanvasView}
                    activeSnapshotView={activeView}
                    onSearchChange={setStudioSearch}
                    onNodeTypeChange={setStudioNodeType}
                    onRelationTypeChange={setStudioRelationType}
                    onLayoutChange={setStudioLayout}
                    onStudioViewChange={(value) => {
                      startTransition(() => setStudioCanvasView(value))
                    }}
                    onSnapshotViewChange={(value) => {
                      startTransition(() => {
                        setActiveView(value)
                        setStudioCanvasView('table')
                      })
                    }}
                    onDiffClick={() => {
                      startTransition(() => {
                        setActiveView('diff')
                        setStudioCanvasView('table')
                      })
                      detachPromise(runCompare())
                    }}
                    isRunning={isRunning}
                  />
                  {studioCanvasView === 'graph' ? (
                    <SnapshotGraphCanvas
                      nodes={studioGraph.nodes}
                      links={studioGraph.links}
                      layout={studioLayout}
                      selectedNodeId={selectedStudioNode?.id ?? ''}
                      searchValue={studioSearch}
                      nodeType={studioNodeType}
                      relationType={studioRelationType}
                      nodeCount={studioGraph.nodes.length}
                      relationCount={studioGraph.links.length}
                      isLoading={liveGraphLoading}
                      emptyMessage={
                        liveGraphError ||
                        (selectedDatasetId
                          ? '当前数据集没有图谱节点，请确认文档已完成入库并开启图谱抽取。'
                          : '当前可访问范围内没有图谱节点。')
                      }
                      onSelectNode={setSelectedStudioNodeId}
                    />
                  ) : studioCanvasView === 'stats' ? (
                    <SnapshotAuditPanel
                      deltaRows={deltaRows}
                      typeDriftRows={auditDriftRows}
                      severity={auditSeverity}
                      driftScore={driftScore}
                      includeZeroDeltas={includeZeroDeltas}
                      compactRows={compactAuditRows}
                      onIncludeZeroDeltasChange={setIncludeZeroDeltas}
                      onCompactRowsChange={setCompactAuditRows}
                    />
                  ) : (
                    <Tabs
                      value={activeView}
                      onValueChange={(value) => {
                        startTransition(() =>
                          setActiveView(value as SnapshotView)
                        )
                      }}
                      className="flex h-full min-h-0 flex-col"
                    >
                      <TabsContent value="diff" className="mt-0 min-h-0 flex-1">
                        <SnapshotDiffView
                          titleA={`快照 A · ${hashATitle}`}
                          titleB={`快照 B · ${hashBTitle}`}
                          subtitleA={snapshotScopeSubtitle}
                          subtitleB={snapshotScopeSubtitle}
                          leftCode={snapAJson}
                          rightCode={snapBJson}
                          diff={diff}
                          typeDrift={auditDriftRows}
                          isEmpty={!diff}
                          emptyState={
                            <DiffEmptyState
                              title="还没有对比结果"
                              description="选择快照 A 和快照 B，可按需限定文档范围，然后点击「开始对比」查看节点和关系变化。"
                              hint={
                                hasHashA && hasHashB
                                  ? '已就绪：直接点击「开始对比」'
                                  : '请先选择快照 A 和快照 B'
                              }
                            />
                          }
                          onCopy={() =>
                            detachPromise(
                              copyToClipboard(diffJson, '差异数据')
                            )
                          }
                          onDownload={() => {
                            downloadJson(
                              diff ?? {},
                              `${diffBaseName}.diff.json`
                            )
                            toast.success('已导出差异数据')
                          }}
                        />
                      </TabsContent>

                      <TabsContent value="a" className="mt-0 min-h-0 flex-1">
                        <JsonCodePane
                          label="A 视图"
                          title="快照内容"
                          subtitle={
                            hashAValue ? `版本 · ${hashAValue}` : '尚未导出'
                          }
                          code={snapAJson}
                          isEmpty={!snapA}
                          emptyState={
                            <DiffEmptyState
                              title="A 视图为空"
                              description="先在左侧填写快照 A，然后点击「导出 A」即可在此查看明细快照 JSON。"
                              hint={
                                hasHashA
                                  ? '已填写快照 A，可点击「导出 A」'
                                  : '请先填写快照 A'
                              }
                            />
                          }
                          onCopy={() =>
                            detachPromise(
                              copyToClipboard(snapAJson, '快照 A 数据')
                            )
                          }
                          onDownload={() => {
                            downloadJson(
                              snapA ?? {},
                              `${snapshotAFileName}.json`
                            )
                            toast.success('已导出快照 A')
                          }}
                        />
                      </TabsContent>

                      <TabsContent value="b" className="mt-0 min-h-0 flex-1">
                        <JsonCodePane
                          label="B 视图"
                          title="快照内容"
                          subtitle={
                            hashBValue ? `版本 · ${hashBValue}` : '尚未导出'
                          }
                          code={snapBJson}
                          isEmpty={!snapB}
                          emptyState={
                            <DiffEmptyState
                              title="B 视图为空"
                              description="先在左侧填写快照 B，然后点击「导出 B」即可在此查看明细快照 JSON。"
                              hint={
                                hasHashB
                                  ? '已填写快照 B，可点击「导出 B」'
                                  : '请先填写快照 B'
                              }
                            />
                          }
                          onCopy={() =>
                            detachPromise(
                              copyToClipboard(snapBJson, '快照 B 数据')
                            )
                          }
                          onDownload={() => {
                            downloadJson(
                              snapB ?? {},
                              `${snapshotBFileName}.json`
                            )
                            toast.success('已导出快照 B')
                          }}
                        />
                      </TabsContent>
                    </Tabs>
                  )}
                </div>
              ) : (
                <SnapshotAuditPanel
                  deltaRows={deltaRows}
                  typeDriftRows={auditDriftRows}
                  severity={auditSeverity}
                  driftScore={driftScore}
                  includeZeroDeltas={includeZeroDeltas}
                  compactRows={compactAuditRows}
                  onIncludeZeroDeltasChange={setIncludeZeroDeltas}
                  onCompactRowsChange={setCompactAuditRows}
                />
              )}
            </section>
            <SnapshotNodeDetailsRail
              selectedNode={selectedStudioNode}
              diffOverview={diffOverview}
              onClose={() => setSelectedStudioNodeId('')}
              onSelectRelationTarget={setSelectedStudioNodeId}
            />
          </div>
        </div>
      </div>
    </AppFrame>
  )
}
