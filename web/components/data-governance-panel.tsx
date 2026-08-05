/**
 * 数据治理工作台组件
 * 功能：质量检测、智能清洗、数据标注、分类归档
 */
'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ShieldCheck,
  Sparkles,
  Tag,
  FolderTree,
  FileText,
  Upload,
  Save,
  RotateCcw,
  Trash2,
  Eye,
  Search,
  Wrench,
  ScanLine,
  FileSearch,
  Hash,
  Layers,
  X,
  Info,
  AlertTriangle,
  Copy,
  Check,
  CheckCircle2,
  Loader2,
  PanelRightOpen,
  PanelRightClose,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import {
  KnowledgeOpsHero,
  KNOWLEDGE_OPS_SUMMARY_PANEL_CLASS,
} from '@/components/ui/knowledge-ops-hero'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { UnsavedChangesDialog } from '@/components/ui/unsaved-changes-dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PipelineRail, WorkbenchScaffold } from '@/components/workbench'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { useRouter } from '@/i18n/navigation'
import { useUnsavedNavigationGuard } from '@/hooks/use-unsaved-navigation-guard'
import { useMediaQuery } from '@/hooks/use-media-query'
import { ROOT_FOLDER_ID, useParsedFiles, type ParsedFileData } from '@/store/use-parsed-files-store'
import { cn, formatFileSize, detachPromise } from '@/lib/utils'
import { getDocContentFromCache } from '@/lib/doc-content-cache'
import { QualityChecker } from '@/components/data-governance/quality-checker'
import { DataCleaner } from '@/components/data-governance/data-cleaner'
import { DataAnnotator } from '@/components/data-governance/data-annotator'
import { DataClassifier } from '@/components/data-governance/data-classifier'
import { GovernanceSyncStatus } from '@/components/data-governance/governance-sync-status'
import { datasetApi, documentApi, parsingApi } from '@/lib/api'
import { reportClientError, reportClientWarning } from '@/lib/client-logging'
import { useParserBackendPreference } from '@/contexts/parser-backend-context'
import { MarkdownRenderer } from '@/components/markdown/markdown-renderer'

import { DocumentFolderTree, getFileIcon } from '@/components/document-library/folder-tree'
import { extractZipFiles, isZipFile } from '@/lib/zip'
import { UPLOAD_ACCEPT_WITH_ZIP, ZIP_ALLOWED_EXTENSIONS } from '@/lib/upload-extensions'
import { getParserLabel } from '@/lib/parser-options'
import { resolveParserBackendForFilename } from '@/lib/parser-compat'
import { resolveParsingWorkspaceDataset } from '@/lib/parsing-workspace-dataset'
import { deleteGovernanceFileFromBackend } from '@/lib/governance-file-delete'
import { filterGovernanceFiles } from '@/lib/governance-file-search'
import {
  GovernanceContentIncompleteError,
  saveGovernanceFileToBackend,
} from '@/lib/governance-file-save'
import {
  fetchAllGovernanceDocuments,
  GovernanceDocumentSyncUnavailableError,
  reconcileGovernanceFiles,
  settleGovernanceDocumentSources,
  type GovernanceRemoteSource,
} from '@/lib/governance-document-sync'
import {
  cloneGovernanceDocumentState,
  createEmptyGovernanceDocumentState,
  governanceDocumentStateFingerprint,
  readGovernanceDocumentState,
  serializeGovernanceDocumentState,
  type GovernanceDocumentState,
} from '@/lib/governance-document-state'

const GOVERNANCE_TAB_CONFIGS = [
  { id: 'quality', icon: ScanLine },
  { id: 'clean', icon: Wrench },
  { id: 'annotate', icon: Tag },
  { id: 'classify', icon: FolderTree },
] as const

type GovernanceTab = (typeof GOVERNANCE_TAB_CONFIGS)[number]['id']
type DatasetOption = {
  id: string
  name: string
}

type GovernanceDocument = Awaited<ReturnType<typeof documentApi.list>>['items'][number]
type GovernanceParsingDocument = Awaited<
  ReturnType<typeof parsingApi.listDocuments>
>['items'][number]

function getGovernanceNextChunkStatus(
  fileId: string,
  markReadyFileIds: Set<string>,
  markSubmittedFileIds: Set<string>
): 'ready' | 'submitted' | undefined {
  if (markSubmittedFileIds.has(fileId)) return 'submitted'
  if (markReadyFileIds.has(fileId)) return 'ready'
  return undefined
}

function getScoreBadgeClass(score: number): string {
  if (score >= 80) return 'bg-success/12 text-success border-success/25'
  if (score >= 60) return 'bg-warning/15 text-warning border-warning/30'
  return 'bg-rose/12 text-rose border-rose/25'
}

function getAvgScoreFillClass(avgScore: number): string {
  if (avgScore >= 80) return 'bg-success'
  if (avgScore >= 60) return 'bg-warning'
  if (avgScore > 0) return 'bg-rose'
  return 'bg-primary/60'
}

const ALL_DATASETS_VALUE = '__all_datasets__'
const EMPTY_UPLOAD_FORMATS = ['PDF', 'Word', 'Excel', 'TXT', 'MD', 'ZIP'] as const
const EMPTY_UPLOAD_STEPS = ['parse', 'quality', 'clean'] as const
const GOVERNANCE_CONTENT_READ_LIMIT = 2_000_000

type DataGovernanceTranslator = ReturnType<typeof useTranslations>

function EmptyStructurePreview({ t }: Readonly<{ t: DataGovernanceTranslator }>) {
  const previewNodes = [
    {
      label: t('emptyUpload.structureNodes.root'),
      value: '0',
      tone: 'primary',
    },
    {
      label: t('emptyUpload.structureNodes.sections'),
      value: '—',
      tone: 'info',
    },
    {
      label: t('emptyUpload.structureNodes.signals'),
      value: '—',
      tone: 'success',
    },
  ] as const

  return (
    <div data-governance-empty-structure-rail="true" className="min-w-0">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-medium text-muted-foreground">
            {t('emptyUpload.structureTitle')}
          </div>
          <div className="mt-1 text-sm font-semibold text-foreground">
            {t('emptyUpload.structureEmptyTitle')}
          </div>
        </div>
        <div className="grid size-8 place-items-center rounded-md border border-border bg-muted text-primary">
          <FolderTree className="size-4" />
        </div>
      </div>

      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        {t('emptyUpload.structureEmptyDescription')}
      </p>

      <div className="mt-4 divide-y divide-border/50">
        {previewNodes.map((node) => (
          <div
            key={node.label}
            className="grid grid-cols-[2rem_minmax(0,1fr)] items-center gap-3 py-2.5"
          >
            <span
              aria-hidden
              className={cn(
                'text-[11px] font-semibold tabular-nums',
                node.tone === 'primary' && 'text-primary',
                node.tone === 'info' && 'text-info',
                node.tone === 'success' && 'text-success'
              )}
            >
              {node.value}
            </span>
            <span className="min-w-0 text-xs font-medium text-foreground/86">{node.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function normalizeBackendCandidate(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function mapBackendStatusToGovernanceStatus(status: unknown): ParsedFileData['status'] {
  const normalized = typeof status === 'string' ? status.toLowerCase() : ''
  if (['completed', 'complete', 'ready', 'parsed', 'done', 'success'].includes(normalized))
    return 'parsed'
  if (['processing', 'parsing', 'running'].includes(normalized)) return 'parsing'
  if (['failed', 'failure', 'error'].includes(normalized)) return 'error'
  if (['pending', 'queued', 'waiting'].includes(normalized)) return 'pending'
  return 'parsed'
}

function isParsingWorkspaceDocument(doc: GovernanceDocument): boolean {
  const meta = doc.metadata
  return meta?.workspace === 'parsing'
}

function mapKnowledgeDocumentToGovernanceFile(
  doc: GovernanceDocument,
  datasetNameById: Map<string, string>
): ParsedFileData {
  const meta = doc.metadata
  const backendCandidate =
    normalizeBackendCandidate(meta?.parser_backend) ||
    normalizeBackendCandidate(meta?.parser_backend_requested) ||
    'auto'
  const resolved = resolveParserBackendForFilename(doc.filename || 'document', backendCandidate)
  const backend = resolved.backend || backendCandidate
  const datasetId = doc.dataset_id || null

  return {
    id: String(doc.id || '').trim(),
    filename: doc.filename || 'document',
    fileType: doc.file_type || '',
    fileSize: Number(doc.file_size || 0),
    markdownContent: '',
    originalMarkdownContent: '',
    parsedAt: String(doc.updated_at || doc.created_at || new Date().toISOString()),
    parser: getParserLabel(backend),
    parserBackend: backend,
    folderId: ROOT_FOLDER_ID,
    datasetId,
    datasetName: datasetId ? datasetNameById.get(datasetId) || datasetId : null,
    source: 'knowledge_base',
    sourcePath: typeof meta?.source_path === 'string' ? meta.source_path : null,
    governanceState: readGovernanceDocumentState(meta) ?? undefined,
    status: mapBackendStatusToGovernanceStatus(doc.status),
    error: doc.error_message || undefined,
  }
}

function mapParsingDocumentToGovernanceFile(
  doc: GovernanceParsingDocument,
  datasetNameById: Map<string, string>
): ParsedFileData {
  const meta = doc.metadata
  const backendCandidate =
    normalizeBackendCandidate(meta?.parser_backend) ||
    normalizeBackendCandidate(meta?.parser_backend_requested) ||
    'auto'
  const resolved = resolveParserBackendForFilename(doc.filename || 'document', backendCandidate)
  const backend = resolved.backend || backendCandidate
  const targetDataset = resolveParsingWorkspaceDataset(meta, datasetNameById)

  return {
    id: String(doc.id || '').trim(),
    filename: doc.filename || 'document',
    fileType: doc.file_type || '',
    fileSize: Number(doc.file_size || 0),
    markdownContent: '',
    originalMarkdownContent: '',
    parsedAt: String(doc.updated_at || doc.created_at || new Date().toISOString()),
    parser: getParserLabel(backend),
    parserBackend: backend,
    folderId: ROOT_FOLDER_ID,
    datasetId: targetDataset.datasetId,
    datasetName: targetDataset.datasetName,
    source: 'parsing_workspace',
    governanceState: readGovernanceDocumentState(meta) ?? undefined,
    status: mapBackendStatusToGovernanceStatus(doc.status),
    error: doc.error_message || undefined,
  }
}

// 文件治理状态
interface FileGovernanceState extends GovernanceDocumentState {
  id: string
  originalContent: string
  cleanedContent: string
  savedContent: string
  savedGovernanceState: GovernanceDocumentState
  isModified: boolean
}

function applyGovernanceStatePatch(
  current: FileGovernanceState,
  patch: Partial<GovernanceDocumentState> & { cleanedContent?: string }
): FileGovernanceState {
  const next = { ...current, ...patch }
  return {
    ...next,
    isModified:
      next.cleanedContent !== next.savedContent ||
      governanceDocumentStateFingerprint(next) !==
        governanceDocumentStateFingerprint(next.savedGovernanceState),
  }
}

export function DataGovernancePanel() {
  const t = useTranslations('DataGovernancePanel')
  const router = useRouter()
  const searchParams = useSearchParams()
  const files = useParsedFiles((state) => state.files)
  const libraryFolders = useParsedFiles((state) => state.folders)
  const activeFolderId = useParsedFiles((state) => state.activeFolderId)
  const setActiveFolderId = useParsedFiles((state) => state.setActiveFolderId)
  const createFolder = useParsedFiles((state) => state.createFolder)
  const isLoaded = useParsedFiles((state) => state.isLoaded)
  const addParsedFile = useParsedFiles((state) => state.addParsedFile)
  const setParsedFiles = useParsedFiles((state) => state.setParsedFiles)
  const updateParsedFile = useParsedFiles((state) => state.updateParsedFile)
  const removeFile = useParsedFiles((state) => state.removeFile)
  const { parserBackend } = useParserBackendPreference()

  // UI 状态
  const [activeTab, setActiveTab] = useState<GovernanceTab>('quality')
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'edit' | 'preview' | 'original'>('preview')
  const [fileSearchQuery, setFileSearchQuery] = useState('')
  const [previewFormat, setPreviewFormat] = useState<'rendered' | 'markdown'>('rendered')
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [deleteFileOpen, setDeleteFileOpen] = useState(false)
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null)
  const [savingGovernance, setSavingGovernance] = useState(false)
  const [pendingDatasetScope, setPendingDatasetScope] = useState<string | null | undefined>(
    undefined
  )
  const [deleteFileTarget, setDeleteFileTarget] = useState<{
    id: string
    filename: string
  } | null>(null)
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(() => {
    const fromUrl = (searchParams.get('dataset_id') || '').trim()
    return fromUrl || null
  })
  const uploadAbortRef = useRef<AbortController | null>(null)
  const headerTitle = t('header.title')
  const headerSubtitle = t('header.subtitle')
  const governanceTabs = useMemo(
    () =>
      GOVERNANCE_TAB_CONFIGS.map(({ id, icon }) => ({
        id,
        icon,
        label: t(`tabs.${id}.label`),
        desc: t(`tabs.${id}.description`),
      })),
    [t]
  )

  useEffect(() => {
    return () => {
      uploadAbortRef.current?.abort()
    }
  }, [])

  // Optional deep link from /chunk-preview (best-effort, non-breaking).
  useEffect(() => {
    const raw = (searchParams.get('tab') || '').trim()
    if (!raw) return
    if (governanceTabs.some((tab) => tab.id === raw)) {
      setActiveTab(raw as GovernanceTab)
    }
  }, [governanceTabs, searchParams])

  const inboundDatasetId = useMemo(() => {
    const datasetId = (searchParams.get('dataset_id') || '').trim()
    return datasetId || null
  }, [searchParams])

  useEffect(() => {
    setSelectedDatasetId(inboundDatasetId)
    setActiveFolderId(ROOT_FOLDER_ID)
    setSelectedFileId(null)
  }, [inboundDatasetId, setActiveFolderId])

  const datasetsQuery = useQuery({
    queryKey: ['data-governance', 'datasets'],
    enabled: isLoaded,
    queryFn: async (): Promise<DatasetOption[]> => {
      const datasets = await datasetApi.listAll()
      return datasets.map((dataset) => ({
        id: String(dataset.id),
        name: dataset.name || String(dataset.id),
      }))
    },
  })

  const availableDatasets = useMemo(() => datasetsQuery.data || [], [datasetsQuery.data])
  const datasetNameById = useMemo(
    () => new Map(availableDatasets.map((dataset) => [dataset.id, dataset.name])),
    [availableDatasets]
  )
  const datasetNameSignature = useMemo(
    () => availableDatasets.map((dataset) => `${dataset.id}:${dataset.name}`).join('|'),
    [availableDatasets]
  )
  const selectedDatasetName = selectedDatasetId
    ? datasetNameById.get(selectedDatasetId) || selectedDatasetId
    : null
  const activeFolderLabel = useMemo(() => {
    if (!activeFolderId || activeFolderId === ROOT_FOLDER_ID) return t('sidebar.allFolders')
    return (
      libraryFolders.find((folder) => folder.id === activeFolderId)?.name || t('sidebar.rootFolder')
    )
  }, [activeFolderId, libraryFolders, t])

  const documentSyncQuery = useQuery({
    queryKey: ['data-governance', 'library-documents', datasetNameSignature, selectedDatasetId],
    enabled: isLoaded,
    queryFn: async ({
      signal,
    }): Promise<{
      files: ParsedFileData[]
      syncedSources: GovernanceRemoteSource[]
      failedSources: GovernanceRemoteSource[]
    }> => {
      let sourceResult
      try {
        sourceResult = await settleGovernanceDocumentSources(
          fetchAllGovernanceDocuments((params) =>
            parsingApi.listDocuments(
              {
                ...params,
                dataset_id: selectedDatasetId || undefined,
              },
              { signal }
            )
          ),
          fetchAllGovernanceDocuments((params) =>
            documentApi.list(
              {
                ...params,
                dataset_id: selectedDatasetId,
              },
              { signal }
            )
          )
        )
      } catch (error) {
        if (error instanceof GovernanceDocumentSyncUnavailableError) {
          error.failures.forEach((failure) =>
            reportClientWarning('Failed to sync governance documents', failure.reason, {
              tags: { source: failure.source },
            })
          )
        }
        throw error
      }

      sourceResult.failures.forEach((failure) =>
        reportClientWarning('Failed to sync governance documents', failure.reason, {
          tags: { source: failure.source },
        })
      )
      return {
        files: [
          ...sourceResult.parsingItems.map((doc) =>
            mapParsingDocumentToGovernanceFile(doc, datasetNameById)
          ),
          ...sourceResult.knowledgeItems
            .filter((doc) => !isParsingWorkspaceDocument(doc))
            .map((doc) => mapKnowledgeDocumentToGovernanceFile(doc, datasetNameById)),
        ].filter((file) => file.id),
        syncedSources: sourceResult.syncedSources,
        failedSources: sourceResult.failedSources,
      }
    },
  })

  useEffect(() => {
    if (!isLoaded || !documentSyncQuery.data) return

    const currentFiles = useParsedFiles.getState().files || []
    setParsedFiles(
      reconcileGovernanceFiles({
        currentFiles,
        remoteFiles: documentSyncQuery.data.files,
        syncedSources: new Set(documentSyncQuery.data.syncedSources),
        datasetId: selectedDatasetId,
      })
    )
  }, [documentSyncQuery.data, isLoaded, selectedDatasetId, setParsedFiles])

  const cancelUploadAndParse = useCallback(() => {
    uploadAbortRef.current?.abort()
    uploadAbortRef.current = null
    setUploading(false)
    toast.info(t('toasts.uploadCancelled'))
  }, [t])

  // 文件治理状态
  const [governanceStates, setGovernanceStates] = useState<Record<string, FileGovernanceState>>({})
  const hasUnsavedGovernanceChanges = useMemo(
    () => Object.values(governanceStates).some((state) => state.isModified),
    [governanceStates]
  )
  const navigate = useCallback((href: string) => router.push(href), [router])
  const navigationGuard = useUnsavedNavigationGuard({
    enabled: hasUnsavedGovernanceChanges,
    onNavigate: navigate,
  })
  const applyDatasetScopeChange = useCallback(
    (nextDatasetId: string | null) => {
      setSelectedDatasetId(nextDatasetId)
      setSelectedFileId(null)
      setActiveFolderId(ROOT_FOLDER_ID)

      const params = new URLSearchParams(searchParams.toString())
      if (nextDatasetId) params.set('dataset_id', nextDatasetId)
      else params.delete('dataset_id')
      const query = params.toString()
      router.replace(query ? `/data-governance?${query}` : '/data-governance')
    },
    [router, searchParams, setActiveFolderId]
  )
  const handleDatasetScopeChange = useCallback(
    (value: string) => {
      const nextDatasetId = value === ALL_DATASETS_VALUE ? null : value
      if (nextDatasetId === selectedDatasetId) return
      if (hasUnsavedGovernanceChanges) {
        setPendingDatasetScope(nextDatasetId)
        return
      }
      applyDatasetScopeChange(nextDatasetId)
    },
    [applyDatasetScopeChange, hasUnsavedGovernanceChanges, selectedDatasetId]
  )
  const discardAllGovernanceChanges = useCallback(() => {
    setGovernanceStates((current) =>
      Object.fromEntries(
        Object.entries(current).map(([fileId, state]) => [
          fileId,
          state.isModified
            ? {
                ...state,
                cleanedContent: state.savedContent,
                ...cloneGovernanceDocumentState(state.savedGovernanceState),
                isModified: false,
              }
            : state,
        ])
      )
    )
  }, [])
  const [truncatedContentFileIds, setTruncatedContentFileIds] = useState<Set<string>>(
    () => new Set()
  )
  const [selectedChunkFileIds, setSelectedChunkFileIds] = useState<Set<string>>(() => new Set())

  // 侧边栏状态
  const [sidebarWidth, setSidebarWidth] = useState(240)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const sidebarRef = useRef<HTMLDivElement>(null)

  // 治理面板状态（右侧）
  const [panelWidth, setPanelWidth] = useState(336)
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false)
  const [isPanelResizing, setIsPanelResizing] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const contentScrollRef = useRef<HTMLDivElement>(null)
  const isCompactLayout = useMediaQuery('(max-width: 1279.98px)')
  const wasCompactLayoutRef = useRef(false)

  useEffect(() => {
    if (isCompactLayout && !wasCompactLayoutRef.current) {
      setIsSidebarCollapsed(true)
      setIsPanelCollapsed(true)
    } else if (!isCompactLayout && wasCompactLayoutRef.current) {
      setIsSidebarCollapsed(false)
      setIsPanelCollapsed(false)
    }
    wasCompactLayoutRef.current = isCompactLayout
  }, [isCompactLayout])

  const openFilePanel = useCallback(() => {
    setIsPanelCollapsed(true)
    setIsSidebarCollapsed(false)
  }, [])

  const openGovernancePanel = useCallback(() => {
    setIsSidebarCollapsed(true)
    setIsPanelCollapsed(false)
  }, [])

  const closeCompactPanels = useCallback(() => {
    setIsSidebarCollapsed(true)
    setIsPanelCollapsed(true)
  }, [])

  // When switching the selected file, reset the main preview pane so it doesn't look"half scrolled".
  useEffect(() => {
    if (!selectedFileId) return
    const raf = globalThis.window.requestAnimationFrame(() => {
      contentScrollRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    })
    return () => globalThis.window.cancelAnimationFrame(raf)
  }, [selectedFileId])

  const startResizing = useCallback(
    (e: React.MouseEvent) => {
      if (isCompactLayout) return
      e.preventDefault()
      setIsResizing(true)
    },
    [isCompactLayout]
  )

  const startPanelResizing = useCallback(
    (e: React.MouseEvent) => {
      if (isCompactLayout) return
      e.preventDefault()
      setIsPanelResizing(true)
    },
    [isCompactLayout]
  )

  const stopResizing = useCallback(() => {
    setIsResizing(false)
    setIsPanelResizing(false)
  }, [])

  const resize = useCallback(
    (mouseMoveEvent: MouseEvent) => {
      if (isResizing && sidebarRef.current) {
        // 计算相对于视口的位置
        const sidebarLeft = sidebarRef.current.getBoundingClientRect().left
        const newWidth = mouseMoveEvent.clientX - sidebarLeft

        // 限制最小和最大宽度
        if (newWidth > 200 && newWidth < 500) {
          setSidebarWidth(newWidth)
        }
      }

      if (isPanelResizing && panelRef.current) {
        // 右侧面板宽度 = 视口宽度 - 鼠标 X
        const newWidth = globalThis.window.innerWidth - mouseMoveEvent.clientX

        if (newWidth > 300 && newWidth < 800) {
          setPanelWidth(newWidth)
        }
      }
    },
    [isResizing, isPanelResizing]
  )

  useEffect(() => {
    if (isResizing || isPanelResizing) {
      globalThis.window.addEventListener('mousemove', resize)
      globalThis.window.addEventListener('mouseup', stopResizing)
    }
    return () => {
      globalThis.window.removeEventListener('mousemove', resize)
      globalThis.window.removeEventListener('mouseup', stopResizing)
    }
  }, [isResizing, isPanelResizing, resize, stopResizing])

  const scopedFiles = useMemo(() => {
    if (!selectedDatasetId) return files
    return files.filter((file) => file.datasetId === selectedDatasetId)
  }, [files, selectedDatasetId])

  const datasetDocumentCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const file of files) {
      if (!file.datasetId) continue
      counts.set(file.datasetId, (counts.get(file.datasetId) || 0) + 1)
    }
    return counts
  }, [files])

  // 选中的文件
  const selectedFile = scopedFiles.find((f) => f.id === selectedFileId) || null
  const governanceState = selectedFileId ? governanceStates[selectedFileId] : null

  const folderFiles = useMemo(() => {
    if (!activeFolderId || activeFolderId === ROOT_FOLDER_ID) return scopedFiles

    const childrenByParentId = new Map<string, string[]>()
    for (const folder of libraryFolders) {
      const parentId = folder.parentId || ROOT_FOLDER_ID
      const list = childrenByParentId.get(parentId) || []
      list.push(folder.id)
      childrenByParentId.set(parentId, list)
    }

    const allowedFolderIds = new Set<string>()
    const stack = [activeFolderId]
    while (stack.length > 0) {
      const current = stack.pop()
      if (!current) continue
      if (allowedFolderIds.has(current)) continue
      allowedFolderIds.add(current)
      const children = childrenByParentId.get(current) || []
      for (const childId of children) stack.push(childId)
    }

    return scopedFiles.filter((f) => allowedFolderIds.has(f.folderId || ROOT_FOLDER_ID))
  }, [scopedFiles, activeFolderId, libraryFolders])
  const visibleFiles = useMemo(
    () => filterGovernanceFiles(folderFiles, fileSearchQuery),
    [fileSearchQuery, folderFiles]
  )

  const readyChunkFiles = useMemo(
    () => visibleFiles.filter((file) => file.chunkStatus === 'ready'),
    [visibleFiles]
  )
  const selectedReadyChunkFiles = useMemo(
    () => readyChunkFiles.filter((file) => selectedChunkFileIds.has(file.id)),
    [readyChunkFiles, selectedChunkFileIds]
  )
  const selectedReadyChunkCount = selectedReadyChunkFiles.length
  const selectedContentIsTruncated = selectedFileId
    ? truncatedContentFileIds.has(selectedFileId)
    : false
  const selectedReadyContainsTruncatedContent = selectedReadyChunkFiles.some((file) =>
    truncatedContentFileIds.has(file.id)
  )

  const updateContentTruncationState = useCallback((fileId: string, contentTruncated: boolean) => {
    setTruncatedContentFileIds((previous) => {
      const next = new Set(previous)
      if (contentTruncated) next.add(fileId)
      else next.delete(fileId)
      if (next.size === previous.size && next.has(fileId) === previous.has(fileId)) {
        return previous
      }
      return next
    })
  }, [])

  useEffect(() => {
    const readyIds = new Set(readyChunkFiles.map((file) => file.id))
    setSelectedChunkFileIds((prev) => {
      const next = new Set(Array.from(prev).filter((id) => readyIds.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [readyChunkFiles])

  const toggleChunkFileSelection = useCallback((fileId: string) => {
    setSelectedChunkFileIds((prev) => {
      const next = new Set(prev)
      if (next.has(fileId)) next.delete(fileId)
      else next.add(fileId)
      return next
    })
  }, [])

  // 初始化文件治理状态
  const initializeGovernanceState = useCallback(
    (
      file: Pick<
        ParsedFileData,
        'id' | 'markdownContent' | 'originalMarkdownContent' | 'governanceState'
      >
    ) => {
      const originalContent = file.originalMarkdownContent ?? file.markdownContent
      const cleanedContent = file.markdownContent
      const persistedGovernance = cloneGovernanceDocumentState(
        file.governanceState || createEmptyGovernanceDocumentState()
      )
      setGovernanceStates((prev) => {
        const existing = prev[file.id]
        if (existing) {
          // 刷新后可能先建立空状态，正文返回时只补齐一次。
          const hasAnyExistingContent = Boolean(
            (existing.originalContent || '').trim() || (existing.cleanedContent || '').trim()
          )
          const hasIncomingContent = Boolean(originalContent.trim() || cleanedContent.trim())
          if (hasAnyExistingContent || !hasIncomingContent) return prev
          return {
            ...prev,
            [file.id]: {
              ...existing,
              originalContent,
              cleanedContent,
              savedContent: cleanedContent,
              savedGovernanceState: cloneGovernanceDocumentState(existing),
              isModified: false,
            },
          }
        }
        return {
          ...prev,
          [file.id]: {
            id: file.id,
            originalContent,
            cleanedContent,
            savedContent: cleanedContent,
            savedGovernanceState: cloneGovernanceDocumentState(persistedGovernance),
            ...persistedGovernance,
            isModified: false,
          },
        }
      })
    },
    []
  )

  // 刷新后先从浏览器缓存恢复正文，缓存缺失时再读取后端内容。
  useEffect(() => {
    const file = selectedFile
    if (!file) return
    const id = (file?.id || '').trim()
    if (!id) return
    if ((file?.markdownContent || '').trim()) {
      updateContentTruncationState(
        id,
        file.source === 'knowledge_base' &&
          Math.max(file.markdownContent.length, file.originalMarkdownContent?.length || 0) >=
            GOVERNANCE_CONTENT_READ_LIMIT
      )
      initializeGovernanceState(file)
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const cached = await getDocContentFromCache(id)
        if (cancelled) return
        const markdown = (cached?.markdownContent || '').trim()
        const original = (cached?.originalMarkdownContent || '').trim()
        if (markdown || original) {
          const nextMarkdown = markdown || original
          const nextOriginal = original || markdown
          updateContentTruncationState(
            id,
            file.source === 'knowledge_base' &&
              Math.max(nextMarkdown.length, nextOriginal.length) >= GOVERNANCE_CONTENT_READ_LIMIT
          )
          updateParsedFile(id, {
            markdownContent: nextMarkdown,
            originalMarkdownContent: nextOriginal,
          })
          initializeGovernanceState({
            id,
            markdownContent: nextMarkdown,
            originalMarkdownContent: nextOriginal,
            governanceState: file.governanceState,
          })
          return
        }
      } catch (error) {
        reportClientWarning('Failed to restore governance content from cache', error)
      }

      try {
        let remote
        let contentTruncated = false
        if (file.source === 'knowledge_base') {
          remote = await documentApi.getParsedContent(id, {
            max_chars: GOVERNANCE_CONTENT_READ_LIMIT,
          })
          contentTruncated = Boolean(
            remote.markdown_truncated || remote.original_markdown_truncated
          )
        } else {
          remote = await parsingApi.getContent(id)
        }
        if (cancelled) return
        updateContentTruncationState(id, contentTruncated)
        const markdown = (remote?.markdown_content || '').trim()
        const original = (remote?.original_markdown_content || '').trim()
        if (!markdown && !original) return
        const nextMarkdown = markdown || original
        const nextOriginal = original || markdown
        updateParsedFile(id, {
          markdownContent: nextMarkdown,
          originalMarkdownContent: nextOriginal,
        })
        initializeGovernanceState({
          id,
          markdownContent: nextMarkdown,
          originalMarkdownContent: nextOriginal,
          governanceState: file.governanceState,
        })
      } catch (error) {
        reportClientWarning('Failed to load governance document content', error)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [initializeGovernanceState, selectedFile, updateContentTruncationState, updateParsedFile])

  const handleDeleteFile = useCallback(
    async (fileId: string) => {
      const target = files.find((f) => f.id === fileId)
      if (!target) return

      setDeletingFileId(fileId)
      try {
        await deleteGovernanceFileFromBackend(fileId, target.source, {
          deleteKnowledgeDocument: documentApi.delete,
          deleteParsingDocument: parsingApi.delete,
        })
      } catch (error) {
        reportClientError('Failed to delete governance file', error)
        toast.error(t('toasts.fileDeleteFailed'))
        return
      } finally {
        setDeletingFileId(null)
      }

      removeFile(fileId)
      setGovernanceStates((prev) => {
        if (!prev[fileId]) return prev
        const next = { ...prev }
        delete next[fileId]
        return next
      })
      if (selectedFileId === fileId) {
        setSelectedFileId(null)
      }
      toast.success(t('toasts.fileDeleted'))
    },
    [files, removeFile, selectedFileId, t]
  )

  // 初始化时自动选择第一个文件
  useEffect(() => {
    if (!isLoaded) return

    if (folderFiles.length === 0) {
      setSelectedFileId(null)
      return
    }

    const stillVisible = selectedFileId && folderFiles.some((f) => f.id === selectedFileId)
    if (!stillVisible) {
      setSelectedFileId(folderFiles[0].id)
      initializeGovernanceState(folderFiles[0])
    }
  }, [folderFiles, initializeGovernanceState, isLoaded, selectedFileId])

  // 拖放处理
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  // 上传并解析（支持 .zip 批量解压）
  const handleUploadAndParse = useCallback(
    async (incomingFiles: File[]) => {
      uploadAbortRef.current?.abort()
      const controller = new AbortController()
      uploadAbortRef.current = controller
      setUploading(true)
      try {
        const baseFolderId = activeFolderId || ROOT_FOLDER_ID

        const folderIdByKey = new Map<string, string>()
        for (const f of libraryFolders) {
          folderIdByKey.set(`${f.parentId || ROOT_FOLDER_ID}::${f.name}`, f.id)
        }

        const getOrCreateFolder = (parentId: string, name: string) => {
          const trimmed = name.trim()
          const key = `${parentId}::${trimmed}`
          const cached = folderIdByKey.get(key)
          if (cached) return cached

          const existing = libraryFolders.find(
            (f) => (f.parentId || ROOT_FOLDER_ID) === parentId && f.name === trimmed
          )
          if (existing) {
            folderIdByKey.set(key, existing.id)
            return existing.id
          }

          const newId = createFolder(trimmed, parentId)
          folderIdByKey.set(key, newId)
          return newId
        }

        const expanded: Array<{ file: File; folderId: string }> = []
        let skipped = 0
        let added = 0

        for (const file of incomingFiles) {
          if (isZipFile(file)) {
            let extractedCount = 0
            let addedInZip = 0
            let skippedInZip = 0
            try {
              const extracted = await extractZipFiles(file)
              extractedCount = extracted.length
              for (const item of extracted) {
                const parts = item.path.split('/').filter(Boolean)
                const filename = parts.pop()
                if (!filename) continue

                const ext = filename.split('.').pop()?.toLowerCase() || ''
                if (!ZIP_ALLOWED_EXTENSIONS.has(ext)) {
                  skipped += 1
                  skippedInZip += 1
                  continue
                }

                let folderId = baseFolderId
                for (const segment of parts) {
                  folderId = getOrCreateFolder(folderId, segment)
                }

                expanded.push({ file: item.file, folderId })
                added += 1
                addedInZip += 1
              }
            } catch (e) {
              reportClientError('Failed to extract governance ZIP upload', e)
              toast.error(t('toasts.zipExtractFailed', { filename: file.name }))
            }

            if (addedInZip === 0) {
              toast.warning(
                extractedCount === 0
                  ? t('toasts.zipNoFilesFound', { filename: file.name })
                  : t('toasts.zipNoSupportedFiles', { filename: file.name })
              )
            } else {
              toast.success(
                skippedInZip > 0
                  ? t('toasts.zipAddedWithSkipped', {
                      added: addedInZip,
                      skipped: skippedInZip,
                    })
                  : t('toasts.zipAdded', { added: addedInZip })
              )
            }
            continue
          }

          const ext = file.name.split('.').pop()?.toLowerCase() || ''
          if (!ZIP_ALLOWED_EXTENSIONS.has(ext)) {
            skipped += 1
            continue
          }

          expanded.push({ file, folderId: baseFolderId })
          added += 1
        }

        for (const { file, folderId } of expanded) {
          // 使用 preview 接口快速获取 Markdown
          if (controller.signal.aborted || uploadAbortRef.current !== controller) return
          const data = await documentApi.preview(file, parserBackend, undefined, {
            signal: controller.signal,
            dataset_id: selectedDatasetId || undefined,
          })
          if (controller.signal.aborted || uploadAbortRef.current !== controller) return

          // 拼接 segments 获取全文
          const markdownContent = data.segments.map((s) => s.content).join('\n\n')

          const newId = addParsedFile({
            filename: file.name,
            fileType: file.name.split('.').pop()?.toLowerCase() || '',
            fileSize: file.size,
            markdownContent,
            parser: data.parser_backend,
            folderId,
            datasetId: selectedDatasetId,
            datasetName: selectedDatasetName,
          })

          // 如果是第一个文件，则自动选中
          initializeGovernanceState({ id: newId, markdownContent })
          setSelectedFileId((prev) => prev ?? newId)
        }

        if (added > 0) toast.success(t('toasts.parsedAndAdded', { count: added }))
        if (skipped > 0) toast.warning(t('toasts.skippedUnsupported', { count: skipped }))
      } catch (error) {
        if (controller.signal.aborted || uploadAbortRef.current !== controller) return
        reportClientError('Failed to parse governance file', error)
        toast.error(t('toasts.parseFailed'))
      } finally {
        if (uploadAbortRef.current === controller) {
          uploadAbortRef.current = null
          setUploading(false)
        }
      }
    },
    [
      activeFolderId,
      addParsedFile,
      createFolder,
      initializeGovernanceState,
      libraryFolders,
      parserBackend,
      selectedDatasetId,
      selectedDatasetName,
      t,
    ]
  )

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const files = Array.from(e.dataTransfer.files)
      if (files.length > 0) {
        await handleUploadAndParse(files)
      }
    },
    [handleUploadAndParse]
  )

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files ? Array.from(e.target.files) : []
      if (files.length > 0) {
        await handleUploadAndParse(files)
      }
      e.target.value = ''
    },
    [handleUploadAndParse]
  )

  // 获取当前显示内容
  const displayContent = useMemo(() => {
    if (!governanceState) return ''
    return viewMode === 'original'
      ? governanceState.originalContent
      : governanceState.cleanedContent
  }, [governanceState, viewMode])
  const libraryOnlyNotice = t('libraryFile.notice')

  // 文件选择
  const handleSelectFile = useCallback(
    (fileId: string) => {
      const file = scopedFiles.find((f) => f.id === fileId)
      if (file) {
        setSelectedFileId(fileId)
        initializeGovernanceState(file)
        if (isCompactLayout) setIsSidebarCollapsed(true)
      }
    },
    [initializeGovernanceState, isCompactLayout, scopedFiles]
  )

  // 手动编辑回调
  const handleManualEdit = useCallback(
    (newContent: string) => {
      if (!selectedFileId) return
      setGovernanceStates((prev) => ({
        ...prev,
        [selectedFileId]: applyGovernanceStatePatch(prev[selectedFileId], {
          cleanedContent: newContent,
        }),
      }))
    },
    [selectedFileId]
  )

  // 质量检测完成回调
  const handleQualityCheck = useCallback(
    (result: { score: number; issues: FileGovernanceState['issues'] }) => {
      if (!selectedFileId) return
      setGovernanceStates((prev) => ({
        ...prev,
        [selectedFileId]: applyGovernanceStatePatch(prev[selectedFileId], {
          qualityScore: result.score,
          issues: result.issues,
        }),
      }))
    },
    [selectedFileId]
  )

  // 清洗完成回调
  const handleClean = useCallback(
    (cleanedContent: string) => {
      if (!selectedFileId) return
      setGovernanceStates((prev) => ({
        ...prev,
        [selectedFileId]: applyGovernanceStatePatch(prev[selectedFileId], {
          cleanedContent,
        }),
      }))
    },
    [selectedFileId]
  )

  // 标注完成回调
  const handleAnnotate = useCallback(
    (annotations: FileGovernanceState['annotations']) => {
      if (!selectedFileId) return
      setGovernanceStates((prev) => ({
        ...prev,
        [selectedFileId]: applyGovernanceStatePatch(prev[selectedFileId], {
          annotations,
        }),
      }))
    },
    [selectedFileId]
  )

  const handleDocumentTags = useCallback(
    (tags: string[]) => {
      if (!selectedFileId) return
      setGovernanceStates((prev) => {
        const current = prev[selectedFileId]
        const mergedTags = Array.from(new Set([...(current.tags || []), ...tags.filter(Boolean)]))
        return {
          ...prev,
          [selectedFileId]: applyGovernanceStatePatch(current, {
            tags: mergedTags,
          }),
        }
      })
    },
    [selectedFileId]
  )

  // 分类完成回调
  const handleClassify = useCallback(
    (category: string, tags: string[]) => {
      if (!selectedFileId) return
      setGovernanceStates((prev) => ({
        ...prev,
        [selectedFileId]: applyGovernanceStatePatch(prev[selectedFileId], {
          category,
          tags,
        }),
      }))
    },
    [selectedFileId]
  )

  // 重置文件状态
  const handleReset = useCallback(() => {
    if (!selectedFileId || !governanceState) return
    setGovernanceStates((prev) => ({
      ...prev,
      [selectedFileId]: {
        ...governanceState,
        cleanedContent: governanceState.savedContent,
        ...cloneGovernanceDocumentState(governanceState.savedGovernanceState),
        isModified: false,
      },
    }))
  }, [selectedFileId, governanceState])

  // 将治理后的内容写回共享存储，供 /chunk-preview 使用最新版本
  const persistGovernanceEdits = useCallback(
    async (options?: { markReadyFileIds?: Set<string>; markSubmittedFileIds?: Set<string> }) => {
      const markReadyFileIds = options?.markReadyFileIds || new Set<string>()
      const markSubmittedFileIds = options?.markSubmittedFileIds || new Set<string>()

      for (const f of files) {
        const state = governanceStates[f.id]
        const nextChunkStatus = getGovernanceNextChunkStatus(
          f.id,
          markReadyFileIds,
          markSubmittedFileIds
        )
        if (!state && !nextChunkStatus) continue

        // 旧数据缺少 originalMarkdownContent 时用当前内容补齐，避免后续保存覆盖
        const originalMarkdownContent =
          typeof f.originalMarkdownContent === 'string'
            ? f.originalMarkdownContent
            : f.markdownContent

        const shouldUpdateMarkdown =
          state?.cleanedContent != null && state.cleanedContent !== f.markdownContent
        const shouldSetOriginal = Boolean(state) && typeof f.originalMarkdownContent !== 'string'
        const shouldPersistGovernance = Boolean(state?.isModified)

        if (
          truncatedContentFileIds.has(f.id) &&
          (shouldUpdateMarkdown ||
            shouldSetOriginal ||
            shouldPersistGovernance ||
            Boolean(nextChunkStatus))
        ) {
          throw new GovernanceContentIncompleteError()
        }

        if (
          shouldUpdateMarkdown ||
          shouldSetOriginal ||
          shouldPersistGovernance ||
          nextChunkStatus
        ) {
          const nextMarkdownContent = shouldUpdateMarkdown
            ? state?.cleanedContent || ''
            : f.markdownContent
          const governanceSnapshot = state ? cloneGovernanceDocumentState(state) : null
          const governanceFingerprint = state ? governanceDocumentStateFingerprint(state) : null
          if (shouldUpdateMarkdown || shouldSetOriginal || shouldPersistGovernance) {
            await saveGovernanceFileToBackend(
              f.id,
              f.source,
              {
                markdown_content: nextMarkdownContent,
                original_markdown_content: originalMarkdownContent,
                governance: state ? serializeGovernanceDocumentState(state) : undefined,
              },
              {
                updateKnowledgeDocument: documentApi.updateParsedContent,
                updateParsingDocument: parsingApi.updateContent,
              },
              { contentTruncated: truncatedContentFileIds.has(f.id) }
            )
          }

          await updateParsedFile(f.id, {
            ...(shouldUpdateMarkdown ? { markdownContent: state?.cleanedContent } : {}),
            ...(shouldSetOriginal ? { originalMarkdownContent } : {}),
            ...(governanceSnapshot ? { governanceState: governanceSnapshot } : {}),
            ...(nextChunkStatus ? { chunkStatus: nextChunkStatus } : {}),
          })

          if (state && governanceSnapshot && governanceFingerprint) {
            setGovernanceStates((previous) => {
              const current = previous[f.id]
              if (
                !current ||
                current.cleanedContent !== nextMarkdownContent ||
                governanceDocumentStateFingerprint(current) !== governanceFingerprint
              ) {
                return previous
              }
              return {
                ...previous,
                [f.id]: {
                  ...current,
                  savedContent: current.cleanedContent,
                  savedGovernanceState: cloneGovernanceDocumentState(current),
                  isModified: false,
                },
              }
            })
          }
        }
      }
    },
    [files, governanceStates, truncatedContentFileIds, updateParsedFile]
  )

  const persistGovernanceEditsSafely = useCallback(
    async (options?: {
      markReadyFileIds?: Set<string>
      markSubmittedFileIds?: Set<string>
    }): Promise<boolean> => {
      setSavingGovernance(true)
      try {
        await persistGovernanceEdits(options)
        return true
      } catch (error) {
        reportClientError('Failed to persist governance edits', error)
        toast.error(
          error instanceof GovernanceContentIncompleteError
            ? t('toasts.truncatedContentReadOnly')
            : t('toasts.resultsSaveFailed')
        )
        return false
      } finally {
        setSavingGovernance(false)
      }
    },
    [persistGovernanceEdits, t]
  )

  const handleSave = useCallback(async () => {
    if (!selectedFileId) return
    const saved = await persistGovernanceEditsSafely({
      markReadyFileIds: new Set([selectedFileId]),
    })
    if (!saved) return
    setSelectedChunkFileIds((prev) => new Set(prev).add(selectedFileId))
    toast.success(t('toasts.resultsSaved'))
  }, [persistGovernanceEditsSafely, selectedFileId, t])

  const handleSubmitSelectedToChunkPreview = useCallback(async () => {
    if (!selectedReadyChunkFiles.length) {
      toast.error(t('toasts.noChunkReadySelection'))
      return
    }

    const targetIds = new Set(selectedReadyChunkFiles.map((file) => file.id))
    const saved = await persistGovernanceEditsSafely({
      markSubmittedFileIds: targetIds,
    })
    if (!saved) return
    setSelectedChunkFileIds(new Set())
    toast.success(
      t('toasts.submittedToChunkPreview', {
        count: selectedReadyChunkFiles.length,
      })
    )
    const params = new URLSearchParams()
    if (selectedDatasetId) params.set('dataset_id', selectedDatasetId)
    const query = params.toString()
    router.push(query ? `/chunk-preview?${query}` : '/chunk-preview')
  }, [persistGovernanceEditsSafely, router, selectedDatasetId, selectedReadyChunkFiles, t])

  const handlePushToChunkPreview = useCallback(async () => {
    if (selectedReadyChunkFiles.length > 0) {
      await handleSubmitSelectedToChunkPreview()
      return
    }
    let saved = false
    if (selectedFileId) {
      saved = await persistGovernanceEditsSafely({
        markSubmittedFileIds: new Set([selectedFileId]),
      })
    } else {
      saved = await persistGovernanceEditsSafely()
    }
    if (!saved) return
    const params = new URLSearchParams()
    if (selectedDatasetId) params.set('dataset_id', selectedDatasetId)
    const query = params.toString()
    router.push(query ? `/chunk-preview?${query}` : '/chunk-preview')
  }, [
    handleSubmitSelectedToChunkPreview,
    persistGovernanceEditsSafely,
    router,
    selectedDatasetId,
    selectedFileId,
    selectedReadyChunkFiles.length,
  ])

  // 统计数据
  const stats = useMemo(() => {
    const scopedIds = new Set(scopedFiles.map((file) => file.id))
    const scopedStates = Object.values(governanceStates).filter((state) => scopedIds.has(state.id))
    const totalFiles = scopedFiles.length
    const completedFiles = scopedStates.filter((s) => s.qualityScore > 0).length
    const modifiedFiles = scopedStates.filter((s) => s.isModified).length
    const avgScore =
      scopedStates.filter((s) => s.qualityScore > 0).reduce((sum, s) => sum + s.qualityScore, 0) /
        completedFiles || 0

    return { totalFiles, completedFiles, modifiedFiles, avgScore }
  }, [governanceStates, scopedFiles])

  const governanceHeroSummary = (
    <div className={KNOWLEDGE_OPS_SUMMARY_PANEL_CLASS}>
      <span className="font-medium text-foreground">文件</span>
      <span className="tabular-nums text-foreground">{stats.totalFiles}</span>
      <span className="h-3.5 w-px bg-border" aria-hidden="true" />
      <span>已完成</span>
      <span className="tabular-nums text-foreground">{stats.completedFiles}</span>
    </div>
  )

  const governanceSyncStatus = (
    <GovernanceSyncStatus
      failedSources={documentSyncQuery.data?.failedSources || []}
      hasFiles={scopedFiles.length > 0}
      isError={documentSyncQuery.isError}
      isFetching={documentSyncQuery.isFetching}
      onRetry={() => detachPromise(documentSyncQuery.refetch())}
    />
  )

  // 空状态上传引导
  if (isLoaded && files.length === 0) {
    return (
      <WorkbenchScaffold
        title={headerTitle}
        badge={t('header.emptyBadge')}
        iconImage="data-governance"
        icon={ShieldCheck}
        iconColor="text-success"
        compactHeader
        description={headerSubtitle}
        size="full"
        bodyClassName="px-0 pb-0"
        header={
          <KnowledgeOpsHero
            iconImage="data-governance"
            title={headerTitle}
            description={headerSubtitle}
            eyebrow={null}
            badge={null}
            summary={governanceHeroSummary}
          />
        }
        pipelineRail={<PipelineRail />}
        mainPanel={
          <div className="flex min-h-0 flex-1 flex-col">
            {documentSyncQuery.isPending ? (
              <div
                role="status"
                aria-live="polite"
                className="flex min-h-[40vh] flex-1 items-center justify-center gap-3 p-6 text-muted-foreground"
              >
                <Loader2
                  className="size-5 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
                <span className="text-sm font-medium">{t('sync.loading')}</span>
              </div>
            ) : documentSyncQuery.isError ? (
              <div className="p-4 md:p-6">{governanceSyncStatus}</div>
            ) : (
              <>
                {documentSyncQuery.data?.failedSources.length ? (
                  <div className="border-b border-border p-3 md:px-4">{governanceSyncStatus}</div>
                ) : null}
                <div className="flex flex-1 items-start justify-start overflow-y-auto bg-background p-4 md:p-6 lg:items-center lg:justify-center">
                  <div
                    data-governance-empty-workbench="true"
                    className={cn(
                      'w-full max-w-5xl transition-colors duration-150 motion-reduce:transition-none',
                      isDragging && 'bg-primary/[0.03]'
                    )}
                  >
                    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                      <div className="min-w-0">
                        <button
                          type="button"
                          className={cn(
                            'flex min-h-[300px] w-full flex-col items-center justify-center rounded-md border border-dashed border-border bg-background px-6 py-8 text-center transition-colors duration-150 focus-ring motion-reduce:transition-none',
                            isDragging && 'border-primary bg-primary/[0.03]'
                          )}
                          onDragOver={handleDragOver}
                          onDragLeave={handleDragLeave}
                          onDrop={handleDrop}
                          onClick={() => globalThis.document.getElementById('file-upload')?.click()}
                          disabled={uploading}
                          aria-label={t('emptyUpload.openUploadDialog')}
                        >
                          <div className="mb-4 grid size-12 place-items-center rounded-md border border-border bg-muted text-primary">
                            {uploading ? (
                              <Loader2 className="size-5 animate-spin motion-reduce:animate-none" />
                            ) : (
                              <Upload className="size-5" />
                            )}
                          </div>

                          <h3 className="max-w-xl text-balance text-xl font-semibold text-foreground">
                            {uploading
                              ? t('emptyUpload.uploadingTitle')
                              : t('emptyUpload.idleTitle')}
                          </h3>
                          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                            {uploading
                              ? t('emptyUpload.uploadingDescription')
                              : t('emptyUpload.idleDescription')}
                          </p>
                          <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">
                            {t('emptyUpload.dropCta')}
                          </p>
                        </button>

                        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                          {EMPTY_UPLOAD_FORMATS.map((format) => (
                            <span
                              key={format}
                              className="rounded-md border border-border bg-muted/30 px-2.5 py-1 text-xs font-medium text-muted-foreground"
                            >
                              {format}
                            </span>
                          ))}
                        </div>

                        <div className="mt-5 flex flex-col items-center justify-center gap-3 sm:flex-row">
                          <div className="relative">
                            <input
                              type="file"
                              multiple
                              accept={UPLOAD_ACCEPT_WITH_ZIP}
                              className="hidden"
                              id="file-upload"
                              onChange={handleFileSelect}
                              disabled={uploading}
                            />
                            <label
                              htmlFor="file-upload"
                              className={cn(
                                'inline-flex h-10 cursor-pointer items-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary/90 focus-ring motion-reduce:transition-none',
                                uploading && 'cursor-not-allowed opacity-50'
                              )}
                            >
                              <Upload className="size-4" />
                              {t('emptyUpload.selectLocalFiles')}
                            </label>
                          </div>
                          {uploading && (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={cancelUploadAndParse}
                              className="h-10 gap-2 rounded-md border-border bg-background px-5 text-muted-foreground hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                            >
                              <X className="size-4" />
                              {t('emptyUpload.cancelParsing')}
                            </Button>
                          )}
                        </div>

                        <div className="mt-6 grid gap-4 border-t border-border pt-5 sm:grid-cols-3">
                          {EMPTY_UPLOAD_STEPS.map((step, index) => (
                            <div key={step} className="flex items-center gap-2 text-left">
                              <span className="grid size-6 shrink-0 place-items-center rounded-md bg-primary/10 text-xs font-semibold text-primary">
                                {index + 1}
                              </span>
                              <span className="text-xs font-semibold text-foreground">
                                {t(`emptyUpload.stages.${step}`)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-6 border-t border-border pt-6 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                        <EmptyStructurePreview t={t} />
                        <div>
                          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                            <CheckCircle2 className="size-4 text-primary" />
                            {t('emptyUpload.intakeChecksTitle')}
                          </div>
                          <div className="mt-3 divide-y divide-border">
                            {[
                              t('emptyUpload.intakeChecks.structure'),
                              t('emptyUpload.intakeChecks.quality'),
                              t('emptyUpload.intakeChecks.cleaning'),
                            ].map((item) => (
                              <div
                                key={item}
                                className="flex items-center gap-2 py-2.5 text-xs text-foreground"
                              >
                                <Check className="size-3.5 text-success" />
                                <span>{item}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        }
      />
    )
  }

  const contentBody = (() => {
    if (viewMode === 'edit') {
      return (
        <div className="grid h-full grid-cols-2 gap-4">
          <div className="flex h-full flex-col overflow-hidden rounded-md border border-border bg-muted">
            <div className="px-4 py-2 bg-muted border-b border-border text-xs font-medium text-muted-foreground">
              {t('canvas.livePreview')}
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain no-scrollbar p-6">
              <MarkdownRenderer markdown={displayContent || ''} />
            </div>
          </div>
          <div className="flex h-full flex-col overflow-hidden rounded-md border border-border bg-card">
            <div className="px-4 py-2 bg-muted border-b border-border text-xs font-medium text-muted-foreground">
              {t('canvas.sourceEditor')}
            </div>
            <textarea
              value={displayContent}
              onChange={(e) => handleManualEdit(e.target.value)}
              className="flex-1 w-full p-6 resize-none outline-none font-mono text-sm leading-relaxed text-foreground"
              spellCheck={false}
            />
          </div>
        </div>
      )
    }

    if (displayContent?.includes(libraryOnlyNotice)) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-8 text-center">
          <div className="mb-6 flex size-12 items-center justify-center rounded-md border border-border bg-muted">
            <FileText className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-2 truncate max-w-lg">
            {selectedFile?.filename || t('libraryFile.unknownFile')}
          </h3>
          <div className="flex items-center gap-2 mb-8">
            <span className="rounded-md border border-border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {t('libraryFile.badge')}
            </span>
            <span className="flex items-center gap-1 rounded-md border border-warning/30 bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning dark:bg-warning/20">
              <div className="w-1.5 h-1.5 rounded-full bg-warning/10 dark:bg-warning/20" />
              {t('libraryFile.pending')}
            </span>
          </div>

          <div className="mb-8 max-w-md rounded-md border border-border bg-muted p-5 text-left">
            <p className="text-sm text-muted-foreground leading-relaxed flex gap-3">
              <Info className="w-5 h-5 text-info flex-shrink-0 mt-0.5" />
              {t('libraryFile.description', { notice: libraryOnlyNotice })}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              className="gap-2 bg-card hover:bg-muted text-foreground/80 border-border"
              onClick={() => {
                if (selectedFile?.filename) {
                  navigator.clipboard.writeText(selectedFile.filename)
                  toast.success(t('toasts.filenameCopied'))
                }
              }}
            >
              <Copy className="w-4 h-4" />
              {t('libraryFile.copyName')}
            </Button>
            <ConfirmDialog
              title={t('libraryFile.removeDialog.title')}
              description={t('libraryFile.removeDialog.description')}
              confirmLabel={t('libraryFile.removeDialog.confirm')}
              cancelLabel={t('libraryFile.removeDialog.cancel')}
              confirmVariant="destructive"
              confirmDisabled={!selectedFileId}
              onConfirm={() => {
                if (!selectedFileId) return
                const { removeFile } = useParsedFiles.getState()
                removeFile(selectedFileId)
                setSelectedFileId(null)
                toast.success(t('toasts.fileRemoved'))
              }}
            >
              <Button
                variant="outline"
                className="gap-2 bg-card hover:bg-destructive/10 dark:bg-destructive/20 text-foreground/80 hover:text-destructive dark:text-destructive/85 border-border hover:border-destructive/30"
                disabled={!selectedFileId}
              >
                <Trash2 className="w-4 h-4" />
                {t('libraryFile.removeButton')}
              </Button>
            </ConfirmDialog>
          </div>
        </div>
      )
    }

    if (previewFormat === 'rendered') {
      return (
        <div className="prose prose-slate dark:prose-invert max-w-none prose-headings:text-foreground prose-p:text-muted-foreground prose-a:text-info dark:prose-a:text-info">
          <MarkdownRenderer markdown={displayContent || ''} />
        </div>
      )
    }

    return (
      <pre className="font-mono text-sm leading-relaxed whitespace-pre-wrap break-words text-foreground">
        {displayContent || ''}
      </pre>
    )
  })()

  return (
    <WorkbenchScaffold
      title={headerTitle}
      badge={t('header.mainBadge')}
      iconImage="data-governance"
      icon={ShieldCheck}
      iconColor="text-info"
      compactHeader
      description={t('header.workspaceSubtitle')}
      header={
        <KnowledgeOpsHero
          iconImage="data-governance"
          title={headerTitle}
          description={t('header.workspaceSubtitle')}
          eyebrow={null}
          badge={null}
          summary={governanceHeroSummary}
          actions={
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                disabled={!governanceState?.isModified}
                className="gap-1.5 h-8 text-xs"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {t('actions.reset')}
              </Button>
              <Button
                variant="info"
                size="sm"
                onClick={handleSave}
                disabled={!governanceState || savingGovernance || selectedContentIsTruncated}
                className="gap-2 h-8 text-xs"
              >
                {savingGovernance ? (
                  <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" />
                ) : (
                  <Save className="size-3.5" />
                )}
                {t('actions.save')}
              </Button>
              <div className="w-px h-4 bg-border dark:bg-card mx-1" />
              <Button
                variant="outline"
                size="sm"
                onClick={handleSubmitSelectedToChunkPreview}
                disabled={
                  selectedReadyChunkCount === 0 ||
                  savingGovernance ||
                  selectedReadyContainsTruncatedContent
                }
                className="gap-2 h-8 text-xs"
              >
                <Layers className="w-3.5 h-3.5" />
                {t('actions.submitSelectedToChunkPreview', {
                  count: selectedReadyChunkCount,
                })}
              </Button>
            </>
          }
        />
      }
      actions={
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={!governanceState?.isModified}
            className="gap-1.5 h-8 text-xs"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {t('actions.reset')}
          </Button>
          <Button
            variant="info"
            size="sm"
            onClick={handleSave}
            disabled={!governanceState || savingGovernance || selectedContentIsTruncated}
            className="gap-2 h-8 text-xs"
          >
            {savingGovernance ? (
              <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" />
            ) : (
              <Save className="size-3.5" />
            )}
            {t('actions.save')}
          </Button>
          <div className="w-px h-4 bg-border dark:bg-card mx-1" />
          <Button
            variant="outline"
            size="sm"
            onClick={handleSubmitSelectedToChunkPreview}
            disabled={
              selectedReadyChunkCount === 0 ||
              savingGovernance ||
              selectedReadyContainsTruncatedContent
            }
            className="gap-2 h-8 text-xs"
          >
            <Layers className="w-3.5 h-3.5" />
            {t('actions.submitSelectedToChunkPreview', {
              count: selectedReadyChunkCount,
            })}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handlePushToChunkPreview}
            disabled={
              !isLoaded ||
              files.length === 0 ||
              savingGovernance ||
              selectedContentIsTruncated ||
              selectedReadyContainsTruncatedContent
            }
            className="gap-2 h-8 text-xs"
          >
            <Layers className="w-3.5 h-3.5" />
            {t('actions.pushToChunkPreview')}
          </Button>
        </div>
      }
      size="full"
      bodyClassName="px-0 pb-0"
      pipelineRail={<PipelineRail />}
      mainPanel={
        <div className="flex-1 flex flex-col bg-background text-foreground min-h-0">
          {documentSyncQuery.isError || documentSyncQuery.data?.failedSources.length ? (
            <div className="border-b border-border p-3 md:px-4">{governanceSyncStatus}</div>
          ) : null}
          <div className="flex-1 flex overflow-hidden min-h-0 relative bg-background">
            {/* 左侧文件列表 */}
            <aside
              ref={sidebarRef}
              className={cn(
                'group/sidebar absolute inset-y-0 left-0 z-40 flex flex-shrink-0 flex-col border-r border-border bg-card transition-[width,transform] duration-200 ease-out motion-reduce:transition-none xl:relative xl:z-10',
                isSidebarCollapsed
                  ? 'w-0 -translate-x-full border-r-0 xl:translate-x-0'
                  : 'translate-x-0 shadow-lg xl:shadow-none'
              )}
              style={{
                width: isSidebarCollapsed ? 0 : isCompactLayout ? 'min(88vw, 320px)' : sidebarWidth,
              }}
            >
              {/* 折叠/展开按钮 */}
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'absolute right-2 top-3 z-30 h-8 w-8 rounded-md border border-border bg-card text-muted-foreground transition-opacity hover:bg-muted hover:text-foreground xl:-right-3 xl:h-6 xl:w-6 xl:opacity-0 xl:group-hover/sidebar:opacity-100',
                  isSidebarCollapsed && 'hidden xl:flex xl:-right-8 xl:translate-x-2 xl:opacity-100'
                )}
                onClick={() => (isSidebarCollapsed ? openFilePanel() : setIsSidebarCollapsed(true))}
                title={isSidebarCollapsed ? t('sidebar.expand') : t('sidebar.collapse')}
                aria-label={isSidebarCollapsed ? t('sidebar.expand') : t('sidebar.collapse')}
              >
                {isSidebarCollapsed ? (
                  <PanelRightOpen className="w-3 h-3" />
                ) : (
                  <PanelRightClose className="w-3 h-3" />
                )}
              </Button>

              <div
                className={cn(
                  'flex-1 flex flex-col min-h-0 w-full overflow-hidden',
                  isSidebarCollapsed && 'invisible'
                )}
              >
                {/* 目录切换与搜索 */}
                <div className="p-3 border-b border-border space-y-3">
                  <Select
                    value={activeFolderId || ROOT_FOLDER_ID}
                    onValueChange={setActiveFolderId}
                  >
                    <SelectTrigger className="h-9 text-xs bg-muted border-border text-foreground/80 focus:bg-card focus-ring transition-colors duration-200 motion-reduce:transition-none">
                      <div className="flex items-center gap-2 truncate">
                        <FolderTree className="w-3.5 h-3.5 text-primary" />
                        <span className="truncate">{activeFolderLabel}</span>
                      </div>
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border text-foreground/80">
                      <SelectItem value={ROOT_FOLDER_ID}>{t('sidebar.allFolders')}</SelectItem>
                      {libraryFolders.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder={t('sidebar.searchPlaceholder')}
                      value={fileSearchQuery}
                      onChange={(event) => setFileSearchQuery(event.target.value)}
                      className="w-full rounded-md border border-border bg-muted py-1.5 pl-9 pr-9 text-xs text-foreground/80 placeholder:text-muted-foreground focus:bg-card focus:outline-none focus:border-primary/30 focus-ring transition-colors duration-200 motion-reduce:transition-none"
                    />
                    {fileSearchQuery ? (
                      <button
                        type="button"
                        onClick={() => setFileSearchQuery('')}
                        className="absolute right-1 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-ring-soft motion-reduce:transition-none"
                        aria-label={t('sidebar.clearSearch')}
                        title={t('sidebar.clearSearch')}
                      >
                        <X className="size-3.5" />
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="border-b border-border">
                  <div className="space-y-1.5 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-foreground">
                        {t('scope.title')}
                      </span>
                      <span
                        className={cn(
                          'rounded-md border px-1.5 py-0.5 text-[10px] font-medium tabular-nums transition-colors',
                          selectedDatasetId
                            ? 'border-info/30 bg-info/15 text-info'
                            : 'border-border/60 bg-muted/60 text-muted-foreground'
                        )}
                      >
                        {selectedDatasetId ? t('scope.datasetScoped') : t('scope.datasetAll')}
                      </span>
                    </div>
                    <Select
                      value={selectedDatasetId || ALL_DATASETS_VALUE}
                      onValueChange={handleDatasetScopeChange}
                    >
                      <SelectTrigger
                        className={cn(
                          'h-8 text-[11px] font-medium bg-card border-border/60 text-foreground transition-colors duration-200 motion-reduce:transition-none',
                          'hover:border-info/40 focus:border-info/60 data-[state=open]:border-info/60',
                          'focus-visible:ring-2 focus-visible:ring-info/20 focus-visible:ring-offset-0',
                          'dark:bg-card'
                        )}
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <FolderTree className="w-3.5 h-3.5 text-info/80 flex-shrink-0" />
                          <SelectValue placeholder={t('scope.placeholder')} />
                        </div>
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border/60 text-foreground">
                        <SelectItem value={ALL_DATASETS_VALUE} className="text-[12px]">
                          <span className="flex items-center gap-1.5">
                            <span
                              aria-hidden
                              className="size-1.5 rounded-full bg-muted-foreground/50"
                            />
                            {t('scope.allDatasets')}
                          </span>
                        </SelectItem>
                        {availableDatasets.map((dataset) => (
                          <SelectItem key={dataset.id} value={dataset.id} className="text-[12px]">
                            <span className="flex items-center gap-1.5">
                              <span aria-hidden className="size-1.5 rounded-full bg-info/70" />
                              <span className="truncate">{dataset.name}</span>
                              <span className="ml-auto pl-2 text-[10px] tabular-nums text-muted-foreground/70">
                                {datasetDocumentCounts.get(dataset.id) || 0}
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* 可折叠的文件目录树 */}
                {/* Folder tree section */}
                <div className="space-y-1.5 border-b border-border/40 px-3 py-2">
                  <div className="flex items-center gap-1.5 px-1">
                    <FolderTree className="size-3 text-muted-foreground/65" />
                    <span className="text-xs font-medium text-muted-foreground">
                      {t('sidebar.foldersHeader')}
                    </span>
                    <span className="ml-auto text-[10px] tabular-nums text-muted-foreground/60">
                      {libraryFolders.length}
                    </span>
                  </div>
                  <div className="-mx-1 max-h-44 overflow-y-auto overscroll-contain no-scrollbar px-1">
                    <DocumentFolderTree />
                  </div>
                </div>

                <div className="flex items-center justify-between px-4 pt-3 pb-1.5">
                  <h3 className="text-xs font-medium text-muted-foreground">
                    {t('sidebar.filesTitle', { count: visibleFiles.length })}
                  </h3>
                </div>

                <div className="flex-1 overflow-y-auto overscroll-contain no-scrollbar px-3 pb-3 space-y-2">
                  {visibleFiles.length === 0 ? (
                    <div className="text-xs text-muted-foreground text-center py-8">
                      {fileSearchQuery.trim()
                        ? t('sidebar.noSearchResults')
                        : t('sidebar.emptyDirectory')}
                    </div>
                  ) : (
                    visibleFiles.map((file) => {
                      const state = governanceStates[file.id]
                      const hasIssue = state?.issues.some((i) => i.type === 'error')
                      const score = state?.qualityScore || 0
                      const isReadyForChunk = file.chunkStatus === 'ready'
                      const isSubmittedForChunk = file.chunkStatus === 'submitted'
                      const isSelectedForChunk = selectedChunkFileIds.has(file.id)

                      return (
                        <div key={file.id} className="group relative">
                          <button
                            type="button"
                            onClick={() => handleSelectFile(file.id)}
                            className={cn(
                              'relative w-full cursor-pointer overflow-hidden rounded-md border p-3 text-left transition-colors duration-150 motion-reduce:transition-none',
                              selectedFileId === file.id
                                ? 'border-primary/40 bg-primary/[0.04]'
                                : 'border-border bg-card hover:border-primary/25 hover:bg-muted/40'
                            )}
                            aria-label={t('a11y.openFile', {
                              filename: file.filename,
                            })}
                          >
                            {selectedFileId === file.id ? (
                              <span
                                aria-hidden
                                className="absolute left-0 top-2 bottom-2 w-[2px] rounded-full bg-info"
                              />
                            ) : null}
                            <div className="flex items-start gap-3">
                              {/* File Icon */}
                              {getFileIcon(
                                file.filename,
                                cn(
                                  'size-10 rounded-lg border transition-colors motion-reduce:transition-none flex-shrink-0',
                                  selectedFileId === file.id
                                    ? 'border-info/30 ring-1 ring-info/15'
                                    : 'border-border/60 group-hover:border-info/30'
                                )
                              )}

                              <div className="flex-1 min-w-0">
                                {/* Row 1: Filename & Score */}
                                <div className="flex items-center justify-between mb-1">
                                  <div
                                    className={cn(
                                      'text-sm font-medium truncate transition-colors',
                                      selectedFileId === file.id
                                        ? 'text-foreground'
                                        : 'text-foreground/85 group-hover:text-foreground'
                                    )}
                                  >
                                    {file.filename}
                                  </div>
                                  {score > 0 ? (
                                    <span
                                      className={cn(
                                        'flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-md font-medium tabular-nums border',
                                        getScoreBadgeClass(score)
                                      )}
                                    >
                                      {t('sidebar.scoreLabel', { score })}
                                    </span>
                                  ) : (
                                    <span className="flex-shrink-0 text-[10px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded-md border border-border/60 font-medium tabular-nums">
                                      {t('sidebar.notScanned')}
                                    </span>
                                  )}
                                </div>

                                {/* Row 2: Metadata (Size & Date) */}
                                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/80 mb-1.5 tabular-nums">
                                  <span>{formatFileSize(file.fileSize)}</span>
                                  <span className="text-muted-foreground/40">·</span>
                                  <span>
                                    {file.parsedAt
                                      ? new Date(file.parsedAt).toLocaleDateString([], {
                                          year: 'numeric',
                                          month: '2-digit',
                                          day: '2-digit',
                                        })
                                      : ''}
                                  </span>
                                  {file.datasetName ? (
                                    <>
                                      <span className="text-muted-foreground/40">·</span>
                                      <span className="truncate">{file.datasetName}</span>
                                    </>
                                  ) : null}
                                </div>

                                {/* Row 3: Badges & Actions */}
                                <div className="flex items-center justify-between h-5 pr-8">
                                  <div className="flex items-center gap-2">
                                    {file.source ? (
                                      <span className="flex items-center gap-1 rounded border border-border bg-muted/60 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
                                        {file.source === 'knowledge_base'
                                          ? t('scope.sourceKnowledge')
                                          : t('scope.sourceParsing')}
                                      </span>
                                    ) : null}
                                    {state?.isModified && (
                                      <span className="text-[9px] text-accent flex items-center gap-1 bg-accent/10 px-1.5 py-0.5 rounded border border-accent/25 font-medium">
                                        <Sparkles className="w-2.5 h-2.5" /> {t('sidebar.cleaned')}
                                      </span>
                                    )}
                                    {isReadyForChunk ? (
                                      <span className="text-[9px] text-info flex items-center gap-1 bg-info/10 px-1.5 py-0.5 rounded border border-info/20 font-medium">
                                        {t('sidebar.chunkReady')}
                                      </span>
                                    ) : null}
                                    {isSubmittedForChunk ? (
                                      <span className="text-[9px] text-success flex items-center gap-1 bg-success/10 px-1.5 py-0.5 rounded border border-success/20 font-medium">
                                        {t('sidebar.chunkSubmitted')}
                                      </span>
                                    ) : null}
                                    {hasIssue && (
                                      <span className="text-[9px] text-rose flex items-center gap-1 bg-rose/10 px-1.5 py-0.5 rounded border border-rose/25 font-medium">
                                        <AlertTriangle className="w-2.5 h-2.5" />{' '}
                                        {t('sidebar.needsAttention')}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </button>
                          {file.source === 'knowledge_base' ? null : (
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteFileTarget({
                                  id: file.id,
                                  filename: file.filename,
                                })
                                setDeleteFileOpen(true)
                              }}
                              className="absolute bottom-2.5 right-2.5 opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-rose hover:bg-rose/10 rounded transition-opacity transition-colors duration-150 motion-reduce:transition-none"
                              aria-label={t('a11y.deleteFile', {
                                filename: file.filename,
                              })}
                              title={t('dialogs.deleteFile.confirm')}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {isReadyForChunk ? (
                            <button
                              type="button"
                              onClick={() => toggleChunkFileSelection(file.id)}
                              aria-pressed={isSelectedForChunk}
                              aria-label={t('a11y.toggleChunkFile', {
                                filename: file.filename,
                              })}
                              className={cn(
                                'absolute right-2.5 top-2.5 grid h-5 w-5 place-items-center rounded-md border text-[10px] transition-colors duration-150 motion-reduce:transition-none',
                                isSelectedForChunk
                                  ? 'border-primary bg-primary text-primary-foreground'
                                  : 'border-border/70 bg-background/90 text-muted-foreground hover:border-info/35 hover:bg-info/10 hover:text-info'
                              )}
                            >
                              {isSelectedForChunk ? <Check className="h-3 w-3" /> : null}
                            </button>
                          ) : null}
                        </div>
                      )
                    })
                  )}
                </div>

                {/* 底部统计栏 */}
                {/* Footer KPI bar */}
                <div className="mt-auto space-y-1.5 border-t border-border bg-muted/30 px-3 py-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t('stats.storage')}
                    </span>
                    <span className="text-[10px] tabular-nums text-muted-foreground/80">
                      {t('stats.processedRatio', {
                        done: stats.completedFiles,
                        total: stats.totalFiles,
                      })}
                    </span>
                  </div>
                  <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted/80 ring-1 ring-inset ring-border/50">
                    <div
                      className={cn(
                        'h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none',
                        getAvgScoreFillClass(stats.avgScore)
                      )}
                      style={{
                        width:
                          stats.totalFiles > 0
                            ? `${Math.min(100, Math.round((stats.completedFiles / stats.totalFiles) * 100))}%`
                            : '0%',
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground/70 tabular-nums">
                    <span>
                      {stats.totalFiles > 0
                        ? `${Math.round((stats.completedFiles / stats.totalFiles) * 100)}%`
                        : '0%'}
                    </span>
                    <span>
                      {stats.avgScore > 0
                        ? t('stats.avgScoreInline', {
                            score: stats.avgScore.toFixed(1),
                          })
                        : `${t('stats.avgScore')} —`}
                    </span>
                  </div>
                </div>
              </div>

              {/* 拖拽手柄 */}
              <button
                type="button"
                className={cn(
                  'absolute right-0 top-0 z-20 hidden h-full w-1 cursor-col-resize border-0 bg-transparent p-0 opacity-0 transition-colors hover:bg-primary/10 hover:opacity-100 active:bg-primary/30 dark:hover:bg-primary/20 xl:block',
                  isResizing && 'bg-primary opacity-100'
                )}
                aria-label={t('sidebar.adjustWidth')}
                onMouseDown={startResizing}
              />
            </aside>

            {isCompactLayout && (!isSidebarCollapsed || !isPanelCollapsed) ? (
              <button
                type="button"
                className="absolute inset-0 z-30 bg-black/25"
                onClick={closeCompactPanels}
                aria-label={t('layout.closePanels')}
              />
            ) : null}

            {/* 主内容区（中间 + 右侧面板） */}
            <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden xl:flex-row">
              {selectedFile && governanceState ? (
                <>
                  <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-3 xl:hidden">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 rounded-md px-2.5"
                      onClick={openFilePanel}
                    >
                      <FileText className="size-3.5" />
                      {t('layout.files')}
                    </Button>
                    <span className="min-w-0 flex-1 truncate text-center text-xs font-medium text-muted-foreground">
                      {selectedFile.filename}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 rounded-md px-2.5"
                      onClick={openGovernancePanel}
                    >
                      <Wrench className="size-3.5" />
                      {t('layout.tools')}
                    </Button>
                  </div>

                  {/* 中间预览画布 */}
                  <div className="flex-1 flex flex-col overflow-hidden relative z-0">
                    {/* 画布工具栏 */}
                    <div className="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-1 rounded-md border border-border bg-card p-1 transition-colors duration-150 motion-reduce:transition-none xl:top-4">
                      {/* Segmented view-mode control */}
                      <div className="flex items-center rounded-md bg-muted/60 p-0.5">
                        {(['preview', 'edit', 'original'] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => setViewMode(mode)}
                            aria-pressed={viewMode === mode}
                            className={cn(
                              'rounded-md px-3 py-1 text-xs font-medium transition-colors duration-150 motion-reduce:transition-none focus-ring-soft',
                              viewMode === mode
                                ? 'bg-background text-primary'
                                : 'text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]'
                            )}
                          >
                            {t(`canvas.viewModes.${mode}`)}
                          </button>
                        ))}
                      </div>

                      <div className="w-px h-3 bg-border mx-1" />

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        onClick={() =>
                          setPreviewFormat((prev) =>
                            prev === 'rendered' ? 'markdown' : 'rendered'
                          )
                        }
                        title={
                          previewFormat === 'rendered'
                            ? t('canvas.viewSource')
                            : t('canvas.viewRendered')
                        }
                        aria-label={
                          previewFormat === 'rendered'
                            ? t('canvas.viewSource')
                            : t('canvas.viewRendered')
                        }
                      >
                        {previewFormat === 'rendered' ? (
                          <Hash className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                      </Button>
                    </div>

                    {/* 左侧栏展开按钮 */}
                    {isSidebarCollapsed && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setIsSidebarCollapsed(false)}
                        className="absolute left-4 top-4 z-20 hidden h-8 w-8 rounded-md border border-border bg-card text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-primary motion-reduce:transition-none xl:inline-flex"
                        aria-label={t('sidebar.expand')}
                        title={t('sidebar.expand')}
                      >
                        <PanelRightOpen className="w-4 h-4" />
                      </Button>
                    )}

                    {isPanelCollapsed && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setIsPanelCollapsed(false)}
                        className="absolute right-4 top-4 z-20 hidden h-8 w-8 rounded-md border border-border bg-card text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-primary motion-reduce:transition-none xl:inline-flex"
                        aria-label={t('panel.expand')}
                        title={t('panel.expand')}
                      >
                        <PanelRightClose className="w-4 h-4 rotate-180" />
                      </Button>
                    )}

                    {/* 内容区域 */}
                    <div
                      ref={contentScrollRef}
                      className="flex-1 overflow-y-auto overscroll-contain no-scrollbar p-4 md:p-8"
                    >
                      <div
                        className={cn('mx-auto', viewMode === 'edit' ? 'max-w-full' : 'max-w-4xl')}
                      >
                        {selectedContentIsTruncated ? (
                          <div className="mb-4 flex items-start gap-3 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-foreground">
                            <AlertTriangle
                              className="mt-0.5 size-4 shrink-0 text-warning"
                              aria-hidden="true"
                            />
                            <div>
                              <p className="font-medium">{t('canvas.truncatedTitle')}</p>
                              <p className="mt-1 text-muted-foreground">
                                {t('canvas.truncatedDescription')}
                              </p>
                            </div>
                          </div>
                        ) : null}
                        {/* 纸张效果容器 */}
                        <div
                          className={cn(
                            'relative min-h-[800px] overflow-hidden rounded-md border border-border bg-card',
                            viewMode === 'edit'
                              ? 'h-[calc(100vh-140px)] border-0 shadow-none bg-transparent'
                              : 'p-10 md:p-14'
                          )}
                        >
                          {/* 治理状态徽章 */}
                          {viewMode !== 'edit' && governanceState.isModified && (
                            <div className="absolute top-0 right-0 p-4">
                              <span className="rounded-md border border-accent/30 bg-accent/10 px-2 py-1 text-xs font-medium text-accent dark:bg-accent/20">
                                {t('canvas.modified')}
                              </span>
                            </div>
                          )}

                          <div data-governance-selection-root="true">{contentBody}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 右侧治理工具面板 */}
                  <div
                    ref={panelRef}
                    className={cn(
                      'group/panel absolute inset-y-0 right-0 z-40 flex flex-shrink-0 flex-col border-l border-border bg-card transition-[width,transform] duration-200 ease-out motion-reduce:transition-none xl:relative xl:z-10',
                      isPanelCollapsed
                        ? 'w-0 translate-x-full border-l-0 xl:translate-x-0'
                        : 'translate-x-0 shadow-lg xl:shadow-none'
                    )}
                    style={{
                      width: isPanelCollapsed
                        ? 0
                        : isCompactLayout
                          ? 'min(100%, 400px)'
                          : panelWidth,
                    }}
                  >
                    {/* Toolbox header — compact */}
                    <div className="flex-shrink-0 border-b border-border/60 bg-card">
                      <div className="flex items-center justify-between px-4 pt-3 pb-2 gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-primary" />
                          <h2 className="truncate text-xs font-medium text-foreground">
                            {t('panel.title')}
                          </h2>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-muted-foreground hover:bg-muted"
                          aria-label={t('panel.collapse')}
                          title={t('panel.collapse')}
                          onClick={() => setIsPanelCollapsed(true)}
                        >
                          <PanelRightClose className="w-4 h-4 rotate-180" />
                        </Button>
                      </div>

                      {/* Token-colored tab pills */}
                      <div className="px-3 pb-2.5">
                        <div className="flex items-center gap-1 rounded-md border border-border bg-muted/60 p-0.5">
                          {governanceTabs.map((tab) => {
                            const Icon = tab.icon
                            const isActive = activeTab === tab.id
                            return (
                              <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={cn(
                                  'relative flex-1 flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors duration-150 motion-reduce:transition-none focus-ring-soft',
                                  isActive
                                    ? 'bg-background text-primary'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-card/95'
                                )}
                                title={tab.label}
                                aria-pressed={isActive}
                              >
                                <Icon className="size-3.5" />
                                <span className="truncate">{tab.label}</span>
                                {tab.id === 'clean' && governanceState.isModified && (
                                  <span className="absolute right-1 top-1 size-1.5 rounded-full bg-primary" />
                                )}
                              </button>
                            )
                          })}
                        </div>
                        {/* Active tool subhead — replaces the old info banner */}
                        <p className="mt-2 px-1 text-[11px] leading-snug text-muted-foreground/80 flex items-start gap-1.5">
                          <Info className="w-3 h-3 mt-0.5 flex-shrink-0 text-muted-foreground/50" />
                          <span>{governanceTabs.find((tab) => tab.id === activeTab)?.desc}</span>
                        </p>
                      </div>
                    </div>

                    {/* 工具内容区 */}
                    <div
                      key={`${selectedFileId}:${activeTab}`}
                      data-governance-tool-scroll="true"
                      className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-surface-2 custom-scrollbar"
                    >
                      {activeTab === 'quality' && (
                        <QualityChecker
                          content={governanceState.originalContent}
                          initialScore={governanceState.qualityScore}
                          initialIssues={governanceState.issues}
                          onComplete={handleQualityCheck}
                        />
                      )}
                      {activeTab === 'clean' && (
                        <DataCleaner
                          content={governanceState.originalContent}
                          cleanedContent={governanceState.cleanedContent}
                          onClean={handleClean}
                        />
                      )}
                      {activeTab === 'annotate' && (
                        <DataAnnotator
                          content={governanceState.cleanedContent}
                          annotations={governanceState.annotations}
                          onAnnotate={handleAnnotate}
                          onDocumentTags={handleDocumentTags}
                        />
                      )}
                      {activeTab === 'classify' && (
                        <DataClassifier
                          content={governanceState.cleanedContent}
                          initialCategory={governanceState.category}
                          initialTags={governanceState.tags}
                          onClassify={handleClassify}
                        />
                      )}
                    </div>

                    {/* 拖拽手柄 */}
                    <button
                      type="button"
                      className={cn(
                        'absolute left-0 top-0 z-20 hidden h-full w-1 cursor-col-resize border-0 bg-transparent p-0 opacity-0 transition-colors hover:bg-primary/10 hover:opacity-100 active:bg-primary/30 dark:hover:bg-primary/20 xl:block',
                        isPanelResizing && 'bg-primary opacity-100'
                      )}
                      aria-label={t('panel.adjustWidth')}
                      onMouseDown={startPanelResizing}
                    />
                  </div>
                </>
              ) : (
                // 空状态占位
                <div className="flex flex-1 flex-col items-center justify-center bg-muted/30 p-6 text-center">
                  <div className="mb-4 flex size-12 items-center justify-center rounded-md border border-border bg-background">
                    <FileSearch className="size-5 text-muted-foreground" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold text-foreground">
                    {t('emptySelection.title')}
                  </h3>
                  <p className="max-w-sm text-sm leading-6 text-muted-foreground">
                    {t('emptySelection.description')}
                  </p>
                </div>
              )}
            </main>
          </div>

          <AlertDialog
            open={deleteFileOpen}
            onOpenChange={(open) => {
              setDeleteFileOpen(open)
              if (!open) setDeleteFileTarget(null)
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('dialogs.deleteFile.title')}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t('dialogs.deleteFile.description', {
                    filename: deleteFileTarget?.filename || '-',
                  })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('dialogs.deleteFile.cancel')}</AlertDialogCancel>
                <AlertDialogAction
                  disabled={Boolean(deletingFileId)}
                  onClick={() => {
                    const id = deleteFileTarget?.id
                    if (!id) return
                    detachPromise(handleDeleteFile(id))
                  }}
                >
                  {deletingFileId ? (
                    <Loader2 className="mr-2 size-4 animate-spin motion-reduce:animate-none" />
                  ) : null}
                  {t('dialogs.deleteFile.confirm')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <UnsavedChangesDialog
            open={navigationGuard.navigationPending || pendingDatasetScope !== undefined}
            onOpenChange={(open) => {
              if (open) return
              setPendingDatasetScope(undefined)
              navigationGuard.cancelNavigation()
            }}
            onDiscard={() => {
              discardAllGovernanceChanges()
              if (pendingDatasetScope !== undefined) {
                const nextDatasetId = pendingDatasetScope
                setPendingDatasetScope(undefined)
                applyDatasetScopeChange(nextDatasetId)
                return
              }
              navigationGuard.confirmNavigation()
            }}
            title="放弃未保存的治理修改？"
            description="当前文档的治理结果尚未保存。继续后，这些修改将丢失。"
          />
        </div>
      }
    />
  )
}
