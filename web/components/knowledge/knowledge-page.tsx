'use client'

/**
 * 知识库管理页面
 * 重构为更贴近设计稿的密集型管理工作台，同时保留共享 workbench 能力。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  Activity,
  CheckCircle,
  Database,
  Eye,
  FileStack,
  Filter,
  HardDrive,
  History,
  Layers,
  LayoutGrid,
  ListIcon,
  Loader2,
  Maximize2,
  Minimize2,
  Plus,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Transition,
} from 'framer-motion'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { AppFrame } from '@/components/app-frame'
import { DocumentViewerPanel } from '@/components/document-viewer-panel'
import { KnowledgeDocumentsPanel } from '@/components/knowledge/knowledge-documents-panel'
import { KnowledgeInspector } from '@/components/knowledge/knowledge-inspector'
import { KnowledgeRetrievalPanel } from '@/components/knowledge/knowledge-retrieval-panel'
import { KnowledgeScopePanel } from '@/components/knowledge/knowledge-scope-panel'
import {
  KnowledgeConnectorRunsPanel,
  KnowledgeSettingsPanel,
} from '@/components/knowledge/knowledge-settings-panel'
import {
  parseKnowledgeQueryState,
  serializeKnowledgeQueryState,
  type KnowledgeQueryState,
} from '@/components/knowledge/use-knowledge-query-state'
import { useKnowledgeScrollContainer } from '@/components/knowledge/use-knowledge-scroll-container'
import { KnowledgeWorkbenchActions } from '@/components/knowledge/knowledge-workbench-actions'
import { RetrievePreviewPanel } from '@/components/rag/retrieve-preview-panel'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import {
  KNOWLEDGE_OPS_BACKGROUND_CLASS,
  KNOWLEDGE_OPS_SUMMARY_PANEL_CLASS,
  KnowledgeOpsHero,
} from '@/components/ui/knowledge-ops-hero'
import { WorkbenchPanelDialog, WorkbenchScaffold } from '@/components/workbench'

import { useConnectorRuns } from '@/hooks/use-connector-runs'
import { useDatasets } from '@/hooks/use-datasets'
import { useDocuments } from '@/hooks/use-documents'
import { useIsMobile, useIsTablet } from '@/hooks/use-media-query'
import { Link, useRouter } from '@/i18n/navigation'
import { documentApi } from '@/lib/api'
import { formatApiError } from '@/lib/api-errors'
import { buildChunkPreviewDocumentHref } from '@/lib/chunk-preview-links'
import {
  createDocumentBatchOutcome,
  formatDocumentBatchOutcome,
  type DocumentBatchOutcome,
} from '@/lib/document-batch-outcome'
import {
  createDocumentUploadOutcome,
  formatDocumentUploadOutcome,
} from '@/lib/document-upload-outcome'
import { cn, detachPromise, formatFileSize } from '@/lib/utils'
import { useDocumentView } from '@/store/document-view'
import { resolveKnowledgeDocumentGridColumns } from '@/components/knowledge/knowledge-layout'

const DATASET_ALL = '__all__'
const KNOWLEDGE_BACKGROUND_CLASS = KNOWLEDGE_OPS_BACKGROUND_CLASS
const KNOWLEDGE_GRID_OVERLAY_CLASS =
  'hidden'
const KNOWLEDGE_WORKBENCH_SURFACE_CLASS =
  'border-border bg-background shadow-none'
const DOCUMENTS_PAGE_SIZE = 20
type TabKey = 'documents' | 'retrieval' | 'settings'

const LIFECYCLE_BATCH_COPY = {
  enable: { successVerb: '已启用', completeFailure: '未能启用所选文档' },
  disable: { successVerb: '已禁用', completeFailure: '未能禁用所选文档' },
  archive: { successVerb: '已归档', completeFailure: '未能归档所选文档' },
  unarchive: { successVerb: '已取消归档', completeFailure: '未能取消所选文档的归档' },
} as const

function showBatchOutcome(outcome: DocumentBatchOutcome, message: string) {
  if (outcome.status === 'error') {
    toast.error(message)
    return
  }
  if (outcome.status === 'warning') {
    toast.warning(message)
    return
  }
  toast.success(message)
}

export default function KnowledgePage() {
  const t = useTranslations('KnowledgePage')
  // t("header.title")
  // t("stats.totalDocuments")
  // label: t(`tabs.${tab.key}.label`)
  const scopeT = useTranslations('KnowledgeScopePanel')
  const router = useRouter()
  const searchParams = useSearchParams()
  const reduceMotion = useReducedMotion()
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const { openDocument } = useDocumentView()

  const initialQueryStateRef = useRef<KnowledgeQueryState | null>(null)
  initialQueryStateRef.current ??= parseKnowledgeQueryState(
    new URLSearchParams(searchParams.toString()),
    { datasetAllValue: DATASET_ALL }
  )
  const initialQueryState = initialQueryStateRef.current

  const [activeTab, setActiveTab] = useState<TabKey>(
    initialQueryState.activeTab
  )
  const [desktopScopeCollapsed, setDesktopScopeCollapsed] = useState(false)
  const [datasetScope, setDatasetScope] = useState<string>(
    initialQueryState.datasetScope
  )
  const [docFilter, setDocFilter] = useState(initialQueryState.docFilter)
  const [statusFilter, setStatusFilter] = useState(
    initialQueryState.statusFilter
  )
  const [lifecycleFilter, setLifecycleFilter] = useState(
    initialQueryState.lifecycleFilter
  )
  const [folderPath, setFolderPath] = useState<string | null>(
    initialQueryState.folderPath
  )
  const [sortKey, setSortKey] = useState(initialQueryState.sortKey)
  const [sortDir, setSortDir] = useState(initialQueryState.sortDir)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(
    initialQueryState.viewMode
  )
  const [documentsPage, setDocumentsPage] = useState(1)
  const [activeConnectorRunId, setActiveConnectorRunId] = useState<
    string | null
  >(initialQueryState.connectorRunId)
  const [peekingDocId, setPeekingDocId] = useState<string | null>(null)
  const [showConnectorRunsPanel, setShowConnectorRunsPanel] = useState(false)
  const setShowTaskCenter = setShowConnectorRunsPanel
  const [mobileScopeOpen, setMobileScopeOpen] = useState(false)
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false)
  const [mobileRunsOpen, setMobileRunsOpen] = useState(false)

  useEffect(() => {
    const parsed = parseKnowledgeQueryState(
      new URLSearchParams(searchParams.toString()),
      {
        datasetAllValue: DATASET_ALL,
      }
    )

    setActiveTab(parsed.activeTab)
    setDatasetScope(parsed.datasetScope)
    setDocFilter(parsed.docFilter)
    setStatusFilter(parsed.statusFilter)
    setLifecycleFilter(parsed.lifecycleFilter)
    setFolderPath(parsed.folderPath)
    setSortKey(parsed.sortKey)
    setSortDir(parsed.sortDir)
    setViewMode(parsed.viewMode)
    setActiveConnectorRunId(parsed.connectorRunId)
  }, [searchParams])

  useEffect(() => {
    const nextQuery = serializeKnowledgeQueryState(
      {
        activeTab,
        viewMode,
        docFilter,
        statusFilter,
        lifecycleFilter,
        datasetScope,
        folderPath,
        sortKey,
        sortDir,
        connectorRunId: activeTab === 'settings' ? activeConnectorRunId : null,
      },
      { datasetAllValue: DATASET_ALL }
    )
    const currentQuery = searchParams.toString()
    if (nextQuery === currentQuery) return
    router.replace(nextQuery ? `/knowledge?${nextQuery}` : '/knowledge')
  }, [
    activeConnectorRunId,
    activeTab,
    datasetScope,
    docFilter,
    folderPath,
    lifecycleFilter,
    router,
    searchParams,
    sortDir,
    sortKey,
    statusFilter,
    viewMode,
  ])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault()
        setDesktopScopeCollapsed((prev) => !prev)
      }
    }

    globalThis.window.addEventListener('keydown', handleKeyDown)
    return () => globalThis.window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const selectedDatasetId =
    datasetScope === DATASET_ALL ? undefined : datasetScope
  const documentsModeActive = activeTab === 'documents'
  const {
    datasets,
    isLoading: datasetsLoading,
    error: datasetsError,
    refreshDatasets,
  } = useDatasets()

  const {
    documents,
    isLoading,
    loadDocuments,
    deleteDocument,
    uploadDocuments,
    uploadDocumentFromUrl,
  } = useDocuments({
    dataset_id: selectedDatasetId,
    status:
      documentsModeActive && statusFilter !== 'all' ? statusFilter : undefined,
    lifecycle:
      documentsModeActive && lifecycleFilter !== 'all'
        ? lifecycleFilter
        : undefined,
    source_path_prefix: documentsModeActive
      ? folderPath || undefined
      : undefined,
  })

  const {
    connectorRuns,
    connectorRunsLoading,
    loadConnectorRuns,
    cancelConnectorRun,
    resumeConnectorRun,
    retryFailedConnectorRun,
  } = useConnectorRuns({
    selectedDatasetId,
  })

  const scopedDocuments = useMemo(() => {
    if (!selectedDatasetId) return documents
    return documents.filter(
      (doc) => String(doc.dataset_id || '') === selectedDatasetId
    )
  }, [documents, selectedDatasetId])

  const handleImportedDatasetResolved = useCallback((datasetId: string) => {
    const resolvedDatasetId = datasetId.trim()
    if (!resolvedDatasetId) return
    setDatasetScope(resolvedDatasetId)
    setFolderPath(null)
    setDocumentsPage(1)
    setActiveTab('documents')
    detachPromise(refreshDatasets())
  }, [refreshDatasets])

  const filteredDocuments = useMemo(() => {
    const term = docFilter.trim().toLowerCase()
    const next = scopedDocuments.filter((doc) => {
      if (!term) return true
      return (
        doc.filename.toLowerCase().includes(term) ||
        doc.id.toLowerCase().includes(term) ||
        (doc.dataset_id || '').toLowerCase().includes(term)
      )
    })

    next.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      if (sortKey === 'filename')
        return a.filename.localeCompare(b.filename) * dir
      if (sortKey === 'file_size') return (a.file_size - b.file_size) * dir
      return (
        (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) *
        dir
      )
    })

    return next
  }, [docFilter, scopedDocuments, sortDir, sortKey])
  const documentsPageCount = Math.max(
    1,
    Math.ceil(filteredDocuments.length / DOCUMENTS_PAGE_SIZE)
  )
  const paginatedDocuments = useMemo(
    () =>
      filteredDocuments.slice(
        (documentsPage - 1) * DOCUMENTS_PAGE_SIZE,
        documentsPage * DOCUMENTS_PAGE_SIZE
      ),
    [documentsPage, filteredDocuments]
  )
  const documentsEmptySurface =
    documentsModeActive && !isLoading && filteredDocuments.length === 0

  const { sentinelRef: mainPaneSentinelRef, scrollEl: mainPaneScrollEl } =
    useKnowledgeScrollContainer()
  const [documentsScrollEl, setDocumentsScrollEl] =
    useState<HTMLDivElement | null>(null)

  const docGridColumns = resolveKnowledgeDocumentGridColumns(isMobile, isTablet)
  const docGridRowCount = Math.ceil(paginatedDocuments.length / docGridColumns)
  // eslint-disable-next-line react-hooks/incompatible-library
  const docsGridVirtualizer = useVirtualizer({
    count: docGridRowCount,
    getScrollElement: () => documentsScrollEl ?? mainPaneScrollEl,
    estimateSize: () => 280,
    overscan: 5,
  })
  const docsTableVirtualizer = useVirtualizer({
    count: paginatedDocuments.length,
    getScrollElement: () => documentsScrollEl ?? mainPaneScrollEl,
    estimateSize: () => 108,
    overscan: 10,
  })

  useEffect(() => {
    setDocumentsPage(1)
  }, [
    datasetScope,
    docFilter,
    folderPath,
    lifecycleFilter,
    sortDir,
    sortKey,
    statusFilter,
  ])

  useEffect(() => {
    setDocumentsPage((current) => Math.min(current, documentsPageCount))
  }, [documentsPageCount])

  useEffect(() => {
    const scrollTarget =
      activeTab === 'documents'
        ? documentsScrollEl ?? mainPaneScrollEl
        : mainPaneScrollEl
    scrollTarget?.scrollTo({
      top: 0,
      behavior: reduceMotion ? 'auto' : 'smooth',
    })
  }, [activeTab, documentsScrollEl, mainPaneScrollEl, reduceMotion])

  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([])
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false)
  const [batchDeleting, setBatchDeleting] = useState(false)
  const [batchLifecycleWorking, setBatchLifecycleWorking] = useState(false)
  const [batchReingestWorking, setBatchReingestWorking] = useState(false)

  const selectedSet = useMemo(() => new Set(selectedDocIds), [selectedDocIds])
  const allVisibleSelected =
    paginatedDocuments.length > 0 &&
    paginatedDocuments.every((doc) => selectedSet.has(doc.id))
  const selectedDocuments = useMemo(
    () => filteredDocuments.filter((doc) => selectedSet.has(doc.id)),
    [filteredDocuments, selectedSet]
  )

  const anySelectedEnabled = useMemo(
    () => selectedDocuments.some((doc) => !doc.disabled_at),
    [selectedDocuments]
  )
  const anySelectedDisabled = useMemo(
    () => selectedDocuments.some((doc) => doc.disabled_at),
    [selectedDocuments]
  )
  const anySelectedArchived = useMemo(
    () => selectedDocuments.some((doc) => doc.archived_at),
    [selectedDocuments]
  )
  const anySelectedNotArchived = useMemo(
    () => selectedDocuments.some((doc) => !doc.archived_at),
    [selectedDocuments]
  )

  useEffect(() => {
    const validIds = new Set(scopedDocuments.map((doc) => doc.id))
    setSelectedDocIds((prev) => {
      const next = prev.filter((id) => validIds.has(id))
      return next.length === prev.length ? prev : next
    })
  }, [scopedDocuments])

  useEffect(() => {
    if (activeTab !== 'documents') {
      setSelectedDocIds([])
      setPeekingDocId(null)
      setShowConnectorRunsPanel(false)
      setMobileInspectorOpen(false)
      setMobileRunsOpen(false)
    }
  }, [activeTab])

  const activeTasksCount = useMemo(
    () =>
      connectorRuns.filter(
        (run) => run.status === 'running' || run.status === 'pending'
      ).length,
    [connectorRuns]
  )

  const totalDocs = scopedDocuments.length
  const completedDocsValue = scopedDocuments.filter(
    (doc) => doc.status === 'completed'
  ).length
  const processingDocsValue = scopedDocuments.filter(
    (doc) => doc.status === 'processing' || doc.status === 'pending'
  ).length
  const failedDocsValue = scopedDocuments.filter(
    (doc) => doc.status === 'failed'
  ).length
  const quarantinedDocsValue = scopedDocuments.filter(
    (doc) => doc.status === 'quarantined'
  ).length
  const totalChunksValue = scopedDocuments.reduce(
    (sum, doc) => sum + (doc.chunk_count || 0),
    0
  )
  const totalSizeValue = formatFileSize(
    scopedDocuments.reduce((sum, doc) => sum + doc.file_size, 0)
  )
  const readyRate =
    totalDocs > 0 ? Math.round((completedDocsValue / totalDocs) * 100) : 0

  const selectedDataset = useMemo(
    () => datasets.find((dataset) => dataset.id === selectedDatasetId) || null,
    [datasets, selectedDatasetId]
  )

  const selectedDatasetLabel = selectedDataset?.name || selectedDatasetId

  const datasetLabelById = useMemo(() => {
    const map: Record<string, string> = {}
    for (const dataset of datasets) {
      map[dataset.id] = dataset.name
    }
    return map
  }, [datasets])

  const retrievalDatasetIds = useMemo(
    () => datasets.map((dataset) => dataset.id).filter(Boolean),
    [datasets]
  )

  const documentScopeSummary = useMemo(
    () => (
      <div className="inline-flex max-w-full flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
        <span className="inline-flex items-center gap-2 font-medium text-foreground">
          <Database className="size-4 text-info" />
          数据范围
          <span className="max-w-[14rem] truncate font-semibold text-foreground">
            {selectedDatasetLabel || scopeT('dataset.all')}
          </span>
        </span>
        <span className="h-4 w-px bg-border" />
        <span className="inline-flex items-center gap-2 font-medium text-foreground">
          <Eye className="size-4 text-info" />
          可见
          <span className="font-semibold tabular-nums text-info">
            {filteredDocuments.length}
          </span>
        </span>
        <span className="h-4 w-px bg-border" />
        <span className="inline-flex items-center gap-2 font-medium text-foreground">
          <Activity className="size-4 text-success" />
          生命周期
          <span className="font-semibold text-success">
            {lifecycleFilter}
          </span>
        </span>
      </div>
    ),
    [filteredDocuments.length, lifecycleFilter, scopeT, selectedDatasetLabel]
  )

  const summaryCards = useMemo(
    () => [
      {
        icon: FileStack,
        label: '文档总数',
        value: totalDocs,
        caption: `${datasets.length} 库`,
        iconShell: 'bg-info/10 text-info',
      },
      {
        icon: CheckCircle,
        label: '已完成',
        value: completedDocsValue,
        caption: `可用 ${readyRate}%`,
        iconShell: 'bg-success/10 text-success',
      },
      {
        icon: Layers,
        label: '处理中',
        value: processingDocsValue + quarantinedDocsValue + failedDocsValue,
        caption: `${quarantinedDocsValue} 隔离 · ${failedDocsValue} 失败`,
        iconShell: 'bg-warning/10 text-warning',
      },
      {
        icon: HardDrive,
        label: '总体体量',
        value: totalSizeValue,
        caption: `${totalChunksValue} 分块`,
        iconShell: 'bg-info/10 text-info',
      },
    ],
    [
      completedDocsValue,
      datasets.length,
      failedDocsValue,
      processingDocsValue,
      quarantinedDocsValue,
      readyRate,
      totalChunksValue,
      totalDocs,
      totalSizeValue,
    ]
  )

  const settingsSummaryCards = useMemo(
    () => [
      {
        icon: FileStack,
        label: '文档总数',
        value: totalDocs,
        caption: `${completedDocsValue} 已就绪`,
        iconShell: 'bg-info/10 text-info',
      },
      {
        icon: CheckCircle,
        label: '已就绪数',
        value: completedDocsValue,
        caption: `健康 ${readyRate}%`,
        iconShell: 'bg-success/10 text-success',
      },
      {
        icon: Database,
        label: '知识分类',
        value: datasets.length,
        caption: '数据集范围',
        iconShell: 'bg-primary/10 text-primary',
      },
      {
        icon: HardDrive,
        label: '存储占用',
        value: totalSizeValue,
        caption: `${totalChunksValue} 分块`,
        iconShell: 'bg-info/10 text-info',
      },
    ],
    [
      completedDocsValue,
      datasets.length,
      readyRate,
      totalChunksValue,
      totalDocs,
      totalSizeValue,
    ]
  )

  const handleDatasetScopeChange = useCallback((value: string) => {
    setDatasetScope(value)
    setFolderPath(null)
  }, [])

  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files
      if (!files?.length) return

      try {
        const response = await uploadDocuments(Array.from(files))
        const outcome = createDocumentUploadOutcome(response)
        const message = formatDocumentUploadOutcome(outcome, {
          successVerb: '已上传',
          completeFailure: t('toasts.uploadFailed'),
        })

        if (outcome.status === 'error') {
          toast.error(message)
          return
        }
        if (outcome.status === 'warning') toast.warning(message)
        else toast.success(message)
      } catch (err) {
        toast.error(formatApiError(err, t('toasts.uploadFailed')))
      }
    },
    [t, uploadDocuments]
  )

  const toggleDocSelection = useCallback((docId: string) => {
    setSelectedDocIds((prev) =>
      prev.includes(docId)
        ? prev.filter((id) => id !== docId)
        : [...prev, docId]
    )
  }, [])

  const toggleSelectAllVisible = useCallback(() => {
    setSelectedDocIds((prev) => {
      if (allVisibleSelected) return []
      const next = new Set(prev)
      for (const doc of paginatedDocuments) {
        next.add(doc.id)
      }
      return Array.from(next)
    })
  }, [allVisibleSelected, paginatedDocuments])

  const runBatchLifecycle = useCallback(
    async (action: 'enable' | 'disable' | 'archive' | 'unarchive') => {
      if (selectedDocIds.length === 0) return

      setBatchLifecycleWorking(true)
      try {
        const lifecycleAction = {
          enable: documentApi.batchEnable,
          disable: documentApi.batchDisable,
          archive: documentApi.batchArchive,
          unarchive: documentApi.batchUnarchive,
        }[action]
        const result = await lifecycleAction(selectedDocIds)
        const outcome = createDocumentBatchOutcome(
          selectedDocIds,
          result,
          'updated'
        )
        setSelectedDocIds(outcome.remainingIds)
        showBatchOutcome(
          outcome,
          formatDocumentBatchOutcome(outcome, LIFECYCLE_BATCH_COPY[action])
        )
        if (outcome.succeeded > 0) await loadDocuments()
      } catch (err) {
        toast.error(formatApiError(err, t('toasts.batchLifecycleFailed')))
      } finally {
        setBatchLifecycleWorking(false)
      }
    },
    [loadDocuments, selectedDocIds, t]
  )

  const runBatchReingest = useCallback(async () => {
    if (selectedDocIds.length === 0) return

    setBatchReingestWorking(true)
    try {
      const result = await documentApi.batchReingest({
        document_ids: selectedDocIds,
        replace: false,
        force: true,
        skip_if_unchanged: false,
      })
      const outcome = createDocumentBatchOutcome(
        selectedDocIds,
        result,
        'queued'
      )
      setSelectedDocIds(outcome.remainingIds)
      showBatchOutcome(
        outcome,
        formatDocumentBatchOutcome(outcome, {
          successVerb: '已提交重新入库',
          completeFailure: '所选文档均未能提交重新入库',
        })
      )
      if (outcome.succeeded > 0) await loadDocuments()
    } catch (err) {
      toast.error(formatApiError(err, t('toasts.batchReingestFailed')))
    } finally {
      setBatchReingestWorking(false)
    }
  }, [loadDocuments, selectedDocIds, t])

  const confirmBatchDelete = useCallback(async () => {
    if (selectedDocIds.length === 0) return

    setBatchDeleting(true)
    try {
      const result = await documentApi.batchDelete(selectedDocIds)
      const outcome = createDocumentBatchOutcome(
        selectedDocIds,
        result,
        'deleted'
      )
      setSelectedDocIds(outcome.remainingIds)
      showBatchOutcome(
        outcome,
        formatDocumentBatchOutcome(outcome, {
          successVerb: '已删除',
          completeFailure: '未能删除所选文档',
        })
      )
      if (outcome.succeeded > 0) await loadDocuments()
    } catch (err) {
      toast.error(formatApiError(err, t('toasts.batchDeleteFailed')))
    } finally {
      setBatchDeleting(false)
      setBatchDeleteOpen(false)
    }
  }, [loadDocuments, selectedDocIds, t])

  const peekingDoc = useMemo(
    () => scopedDocuments.find((doc) => doc.id === peekingDocId) ?? null,
    [peekingDocId, scopedDocuments]
  )

  const scopeMode =
    activeTab === 'documents'
      ? 'documents'
      : activeTab === 'retrieval'
        ? 'retrieval'
        : 'settings'

  const tabs: Array<{ key: TabKey; label: string; icon: typeof FileStack }> = [
    { key: 'documents', label: t('tabs.documents.label'), icon: FileStack },
    { key: 'retrieval', label: t('tabs.retrieval.label'), icon: Activity },
    { key: 'settings', label: t('tabs.settings.label'), icon: Database },
  ]

  const layoutTransition: Transition = {
    type: 'spring',
    bounce: 0.12,
    duration: 0.45,
  }

  const openChunkManager = useCallback(
    (id: string) => {
      openDocument(id, undefined, undefined, { activeTab: 'chunks' })
      setPeekingDocId(null)
      setShowConnectorRunsPanel(false)
      setMobileInspectorOpen(false)
      setMobileRunsOpen(false)
    },
    [openDocument]
  )

  return (
    <AppFrame rightPanel={<DocumentViewerPanel />} withDocumentViewerPadding>
      <div
        data-knowledge-page-root="true"
        className={cn(
          'relative h-full overflow-hidden',
          KNOWLEDGE_BACKGROUND_CLASS
        )}
      >
        <div className={KNOWLEDGE_GRID_OVERLAY_CLASS} aria-hidden="true" />
      <WorkbenchScaffold
        className="relative z-10 bg-transparent"
        title={t('header.title')}
        header={
          <KnowledgeOpsHero
            iconImage="knowledge-management"
            title={t('header.title')}
            description={t('header.description')}
            eyebrow={null}
            badge={null}
            summary={
              <div className={KNOWLEDGE_OPS_SUMMARY_PANEL_CLASS}>
                <span className="font-medium text-foreground">当前范围</span>
                <span className="min-w-0 flex-1 truncate text-foreground">
                  {selectedDatasetLabel || scopeT('dataset.all')}
                </span>
                <span className="h-4 w-px bg-border" />
                <span>进行中任务</span>
                <span className="font-semibold tabular-nums text-primary">
                  {activeTasksCount}
                </span>
              </div>
            }
          />
        }
        top={
          activeTab === 'documents' ||
          activeTab === 'settings' ||
          activeTab === 'retrieval' ? (
            <div className="grid border-y border-border bg-background md:grid-cols-2 xl:grid-cols-4">
              {(activeTab === 'settings'
                ? settingsSummaryCards
                : summaryCards
              ).map((card) => (
                <div
                  key={card.label}
                  className={cn(
                    'border-0 border-r border-border last:border-r-0 hover:bg-muted/40',
                    'min-h-16 rounded-none px-4 py-3'
                  )}
                >
                  <div className="flex h-full items-center gap-3">
                    <div
                      className={cn(
                        'flex size-8 shrink-0 items-center justify-center rounded-md',
                        card.iconShell
                      )}
                    >
                      <card.icon className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs text-muted-foreground">
                        {card.label}
                      </div>
                      <div className="mt-1 flex min-w-0 items-baseline gap-2">
                        <span className="truncate text-base font-semibold leading-none tabular-nums text-foreground">
                          {card.value}
                        </span>
                        <span className="min-w-0 truncate text-xs text-muted-foreground">
                          {card.caption}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null
        }
        size="full"
        toolbar={
          <div
            className={cn(
              'flex flex-col overflow-hidden rounded-none border-y border-x-0 bg-background xl:flex-row xl:items-center xl:justify-between',
              activeTab === 'settings' ? 'gap-2 px-2 py-3' : 'gap-3 px-2 py-3'
            )}
          >
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 p-1">
                {tabs.map((tab) => (
                  <motion.button
                    key={tab.key}
                    type="button"
                    onClick={() => {
                      setActiveTab(tab.key)
                      setPeekingDocId(null)
                    }}
                    whileTap={reduceMotion ? undefined : { scale: 0.985 }}
                    className={cn(
                      'relative flex h-9 min-w-[92px] items-center justify-center gap-2 rounded-md border-0 px-3 text-[13px] font-medium transition-colors focus-ring',
                      activeTab === tab.key
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-transparent text-muted-foreground hover:bg-background hover:text-foreground'
                    )}
                  >
                    <tab.icon
                      className={cn(
                        'relative z-10 size-4'
                      )}
                    />
                    <span className="relative z-10">{tab.label}</span>
                  </motion.button>
                ))}
              </div>

              <WorkbenchPanelDialog
                open={mobileScopeOpen}
                onOpenChange={setMobileScopeOpen}
                title={t('dialogs.scope.title')}
                trigger={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-md border-border bg-background px-3 text-[13px] font-medium hover:bg-muted lg:hidden"
                  >
                    <Filter className="mr-2 size-4" />
                    筛选
                  </Button>
                }
                className="lg:hidden"
              >
                <div className="flex h-full min-h-0 flex-col overflow-hidden">
                  <KnowledgeScopePanel
                    mode={scopeMode}
                    surface="embedded"
                    datasets={datasets}
                    datasetsLoading={datasetsLoading}
                    datasetScope={datasetScope}
                    datasetAllValue={DATASET_ALL}
                    selectedDatasetId={selectedDatasetId}
                    lifecycleFilter={lifecycleFilter}
                    setLifecycleFilter={setLifecycleFilter}
                    folderPath={folderPath}
                    setFolderPath={setFolderPath}
                    statusFilter={statusFilter}
                    setStatusFilter={setStatusFilter}
                    totalDocs={totalDocs}
                    completedDocsValue={completedDocsValue}
                    processingDocsValue={processingDocsValue}
                    failedDocsValue={failedDocsValue}
                    quarantinedDocsValue={quarantinedDocsValue}
                    setDatasetScope={handleDatasetScopeChange}
                  />
                </div>
              </WorkbenchPanelDialog>

              {activeTab === 'documents' ? (
                <WorkbenchPanelDialog
                  open={mobileRunsOpen}
                  onOpenChange={setMobileRunsOpen}
                  title="任务历史"
                  trigger={
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                    className="h-9 rounded-md border-border bg-background px-3 text-[13px] font-medium hover:bg-muted xl:hidden"
                    >
                      <History className="mr-2 size-4" />
                      任务
                    </Button>
                  }
                  className="xl:hidden"
                >
                  <div className="flex h-full min-h-0 flex-col overflow-hidden">
                    <KnowledgeConnectorRunsPanel
                      selectedDatasetId={selectedDatasetId}
                      connectorRuns={connectorRuns}
                      connectorRunsLoading={connectorRunsLoading}
                      onCancelConnectorRun={cancelConnectorRun}
                      onResumeConnectorRun={resumeConnectorRun}
                      onRetryFailedConnectorRun={retryFailedConnectorRun}
                      onLoadConnectorRuns={loadConnectorRuns}
                    />
                  </div>
                </WorkbenchPanelDialog>
              ) : null}

              {peekingDoc ? (
                <WorkbenchPanelDialog
                  open={mobileInspectorOpen}
                  onOpenChange={setMobileInspectorOpen}
                  title={t('dialogs.inspector.title')}
                  trigger={
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 rounded-md border-border bg-background px-3 text-xs xl:hidden"
                    >
                      <Eye className="mr-2 size-3.5" />
                      审查
                    </Button>
                  }
                  className="xl:hidden"
                >
                  <div className="flex h-full min-h-0 flex-col overflow-hidden">
                    <KnowledgeInspector
                      embedded
                      selectedDocs={peekingDoc ? [peekingDoc] : []}
                      datasetLabelById={datasetLabelById}
                    />
                  </div>
                </WorkbenchPanelDialog>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {activeTab === 'documents' ? (
                <div className="hidden items-center rounded-md border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground xl:inline-flex">
                  <span>列表</span>
                  <span className="ml-2 font-mono tabular-nums text-foreground">
                    {filteredDocuments.length}
                  </span>
                </div>
              ) : null}

              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  'hidden h-9 rounded-md border px-3 text-[13px] font-medium lg:inline-flex',
                  desktopScopeCollapsed
                    ? 'border-border/60 bg-card text-muted-foreground'
                    : 'border-border/60 bg-card text-foreground'
                )}
                onClick={() => setDesktopScopeCollapsed((prev) => !prev)}
                aria-label={desktopScopeCollapsed ? t('actions.showScope') : t('actions.hideScope')}
              >
                {desktopScopeCollapsed ? (
                  <Maximize2 className="mr-2 size-3.5" />
                ) : (
                  <Minimize2 className="mr-2 size-3.5" />
                )}
                {desktopScopeCollapsed
                  ? t('actions.showScope')
                  : t('actions.hideScope')}
              </Button>

              {activeTab === 'documents' && (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={cn(
                      'hidden h-9 rounded-md border px-3 text-[13px] font-medium xl:inline-flex',
                      showConnectorRunsPanel || activeTasksCount > 0
                        ? 'border-primary/30 bg-primary/[0.06] text-primary '
                        : 'border-success/20 bg-success/[0.08] text-success dark:text-success'
                    )}
                    onClick={() => {
                      setShowConnectorRunsPanel((prev) => {
                        const next = !prev
                        if (next) setPeekingDocId(null)
                        return next
                      })
                    }}
                  >
                    {activeTasksCount > 0 ? (
                      <Loader2 className="mr-2 size-3.5 animate-spin" />
                    ) : (
                      <History className="mr-2 size-3.5" />
                    )}
                    {activeTasksCount > 0 ? (
                      <>
                        <span className="font-mono tabular-nums">{activeTasksCount}</span>
                        <span className="ml-1">个任务进行中</span>
                      </>
                    ) : (
                      '任务历史'
                    )}
                  </Button>

                  <KnowledgeWorkbenchActions
                    className="h-9 rounded-md border border-primary bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                    datasets={datasets}
                    datasetsLoading={datasetsLoading}
                    datasetsError={datasetsError}
                    refreshDatasets={refreshDatasets}
                    selectedDatasetId={selectedDatasetId}
                    datasetDefaultValue={DATASET_ALL}
                    handleFileUpload={handleFileUpload}
                    uploadDocumentFromUrl={uploadDocumentFromUrl}
                    loadDocuments={loadDocuments}
                    loadConnectorRuns={loadConnectorRuns}
                    onDatasetResolved={handleImportedDatasetResolved}
                    onConnectorRunCreated={(run) => { setShowTaskCenter(true); setPeekingDocId(null); setActiveTab('documents'); }}
                  />

                  <div className="inline-flex h-9 items-center gap-1 rounded-md border border-border bg-muted/40 p-1">
                    {/* layoutId="knowledge-view-mode-active-pill" */}
                    <button
                      type="button"
                      onClick={() => setViewMode('grid')}
                      className={cn(
                        'relative flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors',
                        viewMode === 'grid' && 'text-foreground'
                      )}
                    >
                      {viewMode === 'grid' ? (
                        <span className="absolute inset-0 rounded-md bg-background" />
                      ) : null}
                      <LayoutGrid
                        className={cn(
                          'relative z-10 size-3.5 transition-transform duration-200',
                          viewMode === 'grid' && 'scale-105'
                        )}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('list')}
                      className={cn(
                        'relative flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors',
                        viewMode === 'list' && 'text-foreground'
                      )}
                    >
                      {viewMode === 'list' ? (
                        <span className="absolute inset-0 rounded-md bg-background" />
                      ) : null}
                      <ListIcon
                        className={cn(
                          'relative z-10 size-3.5 transition-transform duration-200',
                          viewMode === 'list' && 'scale-105'
                        )}
                      />
                    </button>
                  </div>
                </>
              )}

              {activeTab === 'settings' ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={cn(
                      'h-9 rounded-md border px-3 text-xs font-medium',
                      showConnectorRunsPanel
                        ? 'border-primary/30 bg-primary/[0.06] text-primary '
                        : 'border-success/20 bg-success/[0.08] text-success dark:text-success'
                    )}
                    onClick={() => {
                      setShowConnectorRunsPanel((prev) => !prev)
                      setPeekingDocId(null)
                    }}
                  >
                    <History className="mr-2 size-3.5" />
                    任务历史
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    className="h-9 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                    onClick={() => setActiveTab('documents')}
                  >
                    <Plus className="mr-2 size-3.5" />
                    导入/新增
                  </Button>
                </>
              ) : null}

              <IconButton
                label="刷新文档"
                variant="outline"
                className="size-9 rounded-md border-border bg-background"
                onClick={() => detachPromise(loadDocuments())}
                disabled={isLoading}
              >
                <RefreshCw
                  className={cn('size-3.5', isLoading && 'animate-spin')}
                />
              </IconButton>
            </div>
          </div>
        }
        bodyClassName={cn(
          'bg-background pt-3',
          documentsEmptySurface ? 'min-h-0 flex-1 overflow-hidden pb-3' : undefined
        )}
        mainPaneClassName={cn(
          activeTab === 'documents' ? 'rounded-none border-0 bg-transparent shadow-none' : undefined
        )}
        mainPaneBodyClassName={cn(
          activeTab === 'documents' ? 'overflow-hidden bg-transparent p-0' : undefined,
          activeTab === 'settings' ? 'overflow-hidden p-0' : undefined,
          documentsEmptySurface ? 'min-h-0 flex-1 overflow-hidden pb-3' : undefined
        )}
        // leftPanel={!desktopScopeCollapsed ? (
        // Legacy source-test anchor:
        // rightPanel={(activeTab === 'retrieval' || peekingDocId || showTaskCenter) ? (
        leftPanel={
          desktopScopeCollapsed || activeTab === 'settings' ? null : (
              <aside
              className={cn(
                'flex h-full flex-col overflow-hidden rounded-none border-r border-y-0 border-l-0',
                KNOWLEDGE_WORKBENCH_SURFACE_CLASS
              )}
              >
              <KnowledgeScopePanel
                mode={scopeMode}
                surface="embedded"
                datasets={datasets}
                datasetsLoading={datasetsLoading}
                datasetScope={datasetScope}
                datasetAllValue={DATASET_ALL}
                selectedDatasetId={selectedDatasetId}
                lifecycleFilter={lifecycleFilter}
                setLifecycleFilter={setLifecycleFilter}
                folderPath={folderPath}
                setFolderPath={setFolderPath}
                statusFilter={statusFilter}
                setStatusFilter={setStatusFilter}
                totalDocs={totalDocs}
                completedDocsValue={completedDocsValue}
                processingDocsValue={processingDocsValue}
                failedDocsValue={failedDocsValue}
                quarantinedDocsValue={quarantinedDocsValue}
                setDatasetScope={handleDatasetScopeChange}
              />
              </aside>
          )
        }
        rightPanel={
          activeTab === 'retrieval' ||
          peekingDocId ||
          showConnectorRunsPanel ? (
            <aside
              className={cn(
                'flex h-full flex-col overflow-hidden rounded-none border-l border-y-0 border-r-0',
                KNOWLEDGE_WORKBENCH_SURFACE_CLASS
              )}
            >
              {activeTab === 'retrieval' ? (
                <KnowledgeRetrievalPanel
                  selectedDatasetId={selectedDatasetId}
                  selectedDatasetLabel={selectedDatasetLabel}
                  aggregateDocuments={totalDocs}
                  aggregateChunks={totalChunksValue}
                  compact
                />
              ) : peekingDoc ? (
                <div className="flex h-full flex-col">
                  <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-muted-foreground">
                        分块审查
                      </div>
                      <div className="mt-1 truncate text-[13px] font-medium text-foreground">
                        {peekingDoc.filename}
                      </div>
                    </div>
                    <IconButton
                      label="关闭"
                      variant="ghost"
                      className="size-8 rounded-md"
                      onClick={() => setPeekingDocId(null)}
                    >
                      <X className="size-4" />
                    </IconButton>
                  </div>
                  <div className="min-h-0 flex-1 overflow-hidden">
                    <KnowledgeInspector
                      embedded
                      selectedDocs={peekingDoc ? [peekingDoc] : []}
                      datasetLabelById={datasetLabelById}
                    />
                  </div>
                  <div className="border-t border-border/60 px-5 py-4">
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="h-9 w-full rounded-md"
                    >
                      <Link
                        href={buildChunkPreviewDocumentHref(peekingDoc.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Maximize2 className="mr-2 size-3.5" />
                        进入沉浸式预览
                      </Link>
                    </Button>
                  </div>
                </div>
              ) : (
                <KnowledgeConnectorRunsPanel
                  selectedDatasetId={selectedDatasetId}
                  connectorRuns={connectorRuns}
                  connectorRunsLoading={connectorRunsLoading}
                  onCancelConnectorRun={cancelConnectorRun}
                  onResumeConnectorRun={resumeConnectorRun}
                  onRetryFailedConnectorRun={retryFailedConnectorRun}
                  onLoadConnectorRuns={loadConnectorRuns}
                />
              )}
            </aside>
          ) : null
        }
      >
        <div
          ref={mainPaneSentinelRef}
          className="h-0 w-0"
          data-knowledge-main-scroll-sentinel="true"
          aria-hidden="true"
        />

        {activeTab === 'documents' ? (
          <motion.div
            layout={!reduceMotion}
            layoutId="knowledge-documents-surface"
            transition={layoutTransition}
            className="flex min-h-0 flex-1 flex-col"
          >
            <KnowledgeDocumentsPanel
              embedded
              isLoading={isLoading}
              documents={scopedDocuments}
              filteredDocuments={paginatedDocuments}
              totalDocumentsCount={filteredDocuments.length}
              datasets={datasets}
              selectedDatasetId={selectedDatasetId}
              selectedDatasetLabel={selectedDatasetLabel}
              datasetLabelById={datasetLabelById}
              hasActiveFilters={
                Boolean(docFilter.trim()) ||
                statusFilter !== 'all' ||
                lifecycleFilter !== 'active' ||
                Boolean(folderPath)
              }
              onSwitchToAllDatasets={() => {
                setDatasetScope(DATASET_ALL)
                setFolderPath(null)
              }}
              scopeSummary={documentScopeSummary}
              docFilter={docFilter}
              setDocFilter={setDocFilter}
              onClearFilters={() => {
                setDocFilter('')
                setStatusFilter('all')
                setLifecycleFilter('active')
                setFolderPath(null)
              }}
              sortKey={sortKey}
              sortDir={sortDir}
              setSortKey={setSortKey}
              setSortDir={setSortDir}
              viewMode={viewMode}
              docGridColumns={docGridColumns}
              docGridRowCount={docGridRowCount}
              docsGridVirtualizer={docsGridVirtualizer}
              docsTableVirtualizer={docsTableVirtualizer}
              page={documentsPage}
              pageSize={DOCUMENTS_PAGE_SIZE}
              pageCount={documentsPageCount}
              onPageChange={setDocumentsPage}
              selectedDocIds={selectedDocIds}
              setSelectedDocIds={setSelectedDocIds}
              onDocumentsChanged={loadDocuments}
              selectedSet={selectedSet}
              allVisibleSelected={allVisibleSelected}
              toggleSelectAllVisible={toggleSelectAllVisible}
              toggleDocSelection={toggleDocSelection}
              batchDeleteOpen={batchDeleteOpen}
              setBatchDeleteOpen={setBatchDeleteOpen}
              batchDeleting={batchDeleting}
              confirmBatchDelete={confirmBatchDelete}
              batchLifecycleWorking={batchLifecycleWorking}
              batchReingestWorking={batchReingestWorking}
              runBatchReingest={runBatchReingest}
              runBatchLifecycle={runBatchLifecycle}
              anySelectedDisabled={anySelectedDisabled}
              anySelectedEnabled={anySelectedEnabled}
              anySelectedArchived={anySelectedArchived}
              anySelectedNotArchived={anySelectedNotArchived}
              deleteDocument={deleteDocument}
              handleFileUpload={handleFileUpload}
              onPeek={openChunkManager}
              onScrollContainerChange={setDocumentsScrollEl}
            />

            <div className="xl:hidden">
              <AnimatePresence>
                {mobileRunsOpen ? (
                  <div className="hidden">
                    <KnowledgeConnectorRunsPanel
                      selectedDatasetId={selectedDatasetId}
                      connectorRuns={connectorRuns}
                      connectorRunsLoading={connectorRunsLoading}
                      onCancelConnectorRun={cancelConnectorRun}
                      onResumeConnectorRun={resumeConnectorRun}
                      onRetryFailedConnectorRun={retryFailedConnectorRun}
                      onLoadConnectorRuns={loadConnectorRuns}
                    />
                  </div>
                ) : null}
              </AnimatePresence>
            </div>
          </motion.div>
        ) : null}

        {activeTab === 'retrieval' && (
          <motion.div
            initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex min-h-0 flex-1 flex-col"
          >
            {/* mode="retrieval" */}
            {/* <RetrievePreviewPanel selectedDatasetId={selectedDatasetId} className="h-full border-0 bg-transparent p-0 shadow-none" /> */}
            {/* <KnowledgeRetrievalPanel selectedDatasetId={selectedDatasetId} compact /> */}
            <RetrievePreviewPanel
              selectedDatasetId={selectedDatasetId}
              availableDatasetIds={retrievalDatasetIds}
              className="h-full border-0 bg-transparent p-0 shadow-none"
            />
          </motion.div>
        )}

        {activeTab === 'settings' && (
          <motion.div
            initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              'flex min-h-0 flex-1 flex-col',
              KNOWLEDGE_WORKBENCH_SURFACE_CLASS
            )}
          >
            {/* <KnowledgeSettingsPanel selectedDatasetId={selectedDatasetId} /> */}
            <KnowledgeSettingsPanel
              selectedDatasetId={selectedDatasetId}
              selectedDataset={selectedDataset}
              datasets={datasets}
              datasetsLoading={datasetsLoading}
              datasetAllValue={DATASET_ALL}
              onDatasetScopeChange={handleDatasetScopeChange}
              settingsSidebarCollapsed={desktopScopeCollapsed}
              onGoToRetrievalTest={() => setActiveTab('retrieval')}
            />
          </motion.div>
        )}
      </WorkbenchScaffold>
      </div>
    </AppFrame>
  )
}
