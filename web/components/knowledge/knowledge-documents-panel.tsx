'use client'

import type { Dataset, Document } from '@/types'

import {
  Activity,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Database,
  Eye,
  Filter,
  Layers,
  Loader2,
  MoreVertical,
  RefreshCw,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { type Key, type ReactNode, type SyntheticEvent, useCallback, useState } from 'react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'

import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { SearchInput } from '@/components/ui/search-input'
import { Panel } from '@/components/ui/panel'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  StatusBadge,
  type StatusBadgeStatus,
} from '@/components/ui/status-badge'
import { DocumentOperationsPanel } from '@/components/documents/document-operations-panel'
import { DocumentTags } from '@/components/documents/document-tags'
import { KnowledgeInspector } from '@/components/knowledge/knowledge-inspector'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Link } from '@/i18n/navigation'
import { formatApiError } from '@/lib/api-errors'
import { buildChunkPreviewDocumentHref } from '@/lib/chunk-preview-links'
import { reportClientError } from '@/lib/client-logging'
import { cn, formatDate, formatFileSize, detachPromise } from '@/lib/utils'
import { getParserLabel } from '@/lib/parser-options'
import { getUserTagsFromDocument } from '@/lib/document-user-tags'
import { getFileTypeMeta } from '@/components/knowledge/file-type'
import { UI_LAYER_CLASS } from '@/lib/ui-layers'

type ViewMode = 'grid' | 'list'
type DocSortKey = 'created_at' | 'filename' | 'file_size'
type DocSortDir = 'asc' | 'desc'
type TranslateValue = string | number | Date
type TranslateFn = (key: string, values?: Record<string, TranslateValue>) => string
type VirtualRowLike = {
  key: Key
  index: number
  start: number
  end: number
}
type VirtualizerLike = {
  getVirtualItems: () => VirtualRowLike[]
  getTotalSize: () => number
  measureElement: (node: Element | null) => void
}

type KnowledgeDocumentsPanelProps = {
  isLoading: boolean
  documents: Document[]
  filteredDocuments: Document[]
  totalDocumentsCount: number
  datasets?: Dataset[]
  embedded?: boolean

  selectedDatasetId?: string
  selectedDatasetLabel?: string
  datasetLabelById?: Record<string, string>
  hasActiveFilters?: boolean
  onSwitchToAllDatasets?: () => void

  scopeSummary?: ReactNode

  docFilter: string
  setDocFilter: (value: string) => void
  onClearFilters: () => void

  sortKey: DocSortKey
  sortDir: DocSortDir
  setSortKey: (value: DocSortKey) => void
  setSortDir: (value: DocSortDir) => void

  viewMode: ViewMode
  docGridColumns: number
  docGridRowCount: number
  docsGridVirtualizer: VirtualizerLike
  docsTableVirtualizer: VirtualizerLike
  page: number
  pageSize: number
  pageCount: number
  onPageChange: (page: number) => void

  selectedDocIds: string[]
  setSelectedDocIds: (value: string[]) => void
  onDocumentsChanged?: () => void | Promise<void>
  selectedSet: Set<string>
  allVisibleSelected: boolean
  toggleSelectAllVisible: () => void
  toggleDocSelection: (docId: string) => void

  batchDeleteOpen: boolean
  setBatchDeleteOpen: (open: boolean) => void
  batchDeleting: boolean
  confirmBatchDelete: () => void | Promise<void>

  batchLifecycleWorking: boolean
  batchReingestWorking: boolean
  runBatchReingest: () => void | Promise<void>
  runBatchLifecycle: (
    action: 'disable' | 'enable' | 'archive' | 'unarchive'
  ) => void | Promise<void>

  anySelectedDisabled: boolean
  anySelectedEnabled: boolean
  anySelectedArchived: boolean
  anySelectedNotArchived: boolean

  deleteDocument: (id: string) => void | Promise<void>
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
  onPeek?: (docId: string) => void
  onScrollContainerChange?: (node: HTMLDivElement | null) => void
}

function getDocsGridColsClassName(docGridColumns: number): string {
  if (docGridColumns >= 5) return 'grid-cols-5'
  if (docGridColumns === 4) return 'grid-cols-4'
  if (docGridColumns === 3) return 'grid-cols-3'
  if (docGridColumns === 2) return 'grid-cols-2'
  return 'grid-cols-1'
}

function getEmptyTitle(isDatasetEmpty: boolean, docFilter: string): string {
  if (isDatasetEmpty) return '知识货架待入库'
  if (docFilter) return '没有匹配到相关文档'
  return '当前筛选无结果'
}

function getQualityColor(qualityPercent: number | null): string {
  if (qualityPercent === null) return 'text-muted-foreground/20'
  if (qualityPercent > 80) return 'text-success'
  if (qualityPercent > 50) return 'text-warning'
  return 'text-rose'
}

function getStatusBadge(
  status: string,
  t: TranslateFn
): { status: StatusBadgeStatus; label: string } {
  switch (status) {
    case 'completed':
      return { status: 'completed', label: t('status.completed') }
    case 'failed':
      return { status: 'failed', label: t('status.failed') }
    case 'quarantined':
      return { status: 'quarantined', label: t('status.quarantined') }
    case 'processing':
      return { status: 'processing', label: t('status.processing') }
    case 'pending':
      return { status: 'pending', label: t('status.pending') }
    default:
      return { status: 'pending', label: t('status.pending') }
  }
}

function getStatusBarColor(status: string) {
  if (status === 'completed') return 'bg-success'
  if (status === 'failed') return 'bg-destructive'
  if (status === 'quarantined') return 'bg-warning'
  if (status === 'processing' || status === 'pending') return 'bg-info'
  return 'bg-muted-foreground/40'
}

function getDocumentLifecycleLabel(doc: Document) {
  if (doc.archived_at) return '已归档'
  if (doc.disabled_at) return '已停用'
  return '启用中'
}

function getDocumentSourceLabel(doc: Document) {
  const metadata = (doc.metadata || {}) as Record<string, unknown>
  const source =
    typeof metadata.source === 'string' ? metadata.source.toLowerCase() : ''
  const sourcePath =
    typeof metadata.source_path === 'string' ? metadata.source_path : ''
  if (
    source.includes('connector') ||
    source.includes('crawl') ||
    source.includes('jira')
  )
    return '连接器'
  if (source.includes('url')) return 'URL 导入'
  if (sourcePath) return '目录上传'
  return '手动导入'
}

function getDocumentTagSummary(tags: string[]) {
  if (!tags.length) return '-'
  const visible = tags.slice(0, 2).join(' / ')
  return tags.length > 2 ? `${visible} +${tags.length - 2}` : visible
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function KnowledgeDocumentsPanel({
  isLoading,
  documents,
  filteredDocuments,
  totalDocumentsCount,
  datasets = [],
  embedded = false,
  selectedDatasetId,
  selectedDatasetLabel,
  datasetLabelById,
  hasActiveFilters = false,
  onSwitchToAllDatasets,
  scopeSummary,
  docFilter,
  setDocFilter,
  onClearFilters,
  sortKey,
  sortDir,
  setSortKey,
  setSortDir,
  viewMode,
  docGridColumns,
  docGridRowCount,
  docsGridVirtualizer,
  docsTableVirtualizer,
  page,
  pageSize,
  pageCount,
  onPageChange,
  selectedDocIds,
  setSelectedDocIds,
  onDocumentsChanged,
  selectedSet,
  allVisibleSelected,
  toggleSelectAllVisible,
  toggleDocSelection,
  batchDeleteOpen,
  setBatchDeleteOpen,
  batchDeleting,
  confirmBatchDelete,
  batchLifecycleWorking,
  batchReingestWorking,
  runBatchReingest,
  runBatchLifecycle,
  anySelectedDisabled,
  anySelectedEnabled,
  anySelectedArchived,
  anySelectedNotArchived,
  deleteDocument,
  onPeek,
  onScrollContainerChange,
}: Readonly<KnowledgeDocumentsPanelProps>) {
  const t = useTranslations('KnowledgeDocumentsPanel')
  // t("empty.filtered.title")
  // t("actions.clearFilters")
  // t("sort.placeholder")
  // t("empty.emptyDataset.actions.switchToAllDatasets")
  // t("empty.emptyDataset.description", {
  // t("row.parseQualityLow", {
  // t("table.columns.dataset")
  // source_path
  const [activeDrawerDoc, setActiveDrawerDoc] = useState<Document | null>(null)
  const [singleDeleteDoc, setSingleDeleteDoc] = useState<Document | null>(null)
  const [singleDeleteWorking, setSingleDeleteWorking] = useState(false)
  const [singleDeleteError, setSingleDeleteError] = useState<string | null>(
    null
  )
  const [opsOpen, setOpsOpen] = useState(false)

  const docsGridColsClassName = getDocsGridColsClassName(docGridColumns)

  const showDatasetColumn = !selectedDatasetId
  const tableColumnCount = showDatasetColumn ? 9 : 8
  const documentListGridTemplate = showDatasetColumn
    ? '2.25rem minmax(16rem,1.65fr) minmax(8.5rem,.78fr) minmax(5.5rem,.55fr) minmax(5rem,.5fr) 3.75rem 5rem 5.5rem 8.5rem'
    : '2.25rem minmax(18rem,1.8fr) minmax(5.5rem,.55fr) minmax(5rem,.5fr) 3.75rem 5rem 5.5rem 8.5rem'
  const peekChunksLabel = (() => {
    const resolved = t('actions.peekChunks')
    return resolved === 'KnowledgeDocumentsPanel.actions.peekChunks'
      ? '切片管理'
      : resolved
  })()

  const docsGridVirtualRows = docsGridVirtualizer.getVirtualItems()
  const docsTableVirtualRows = docsTableVirtualizer.getVirtualItems()
  const docsTablePaddingTop = docsTableVirtualRows.length
    ? docsTableVirtualRows[0].start
    : 0
  const docsTablePaddingBottom = docsTableVirtualRows.length
    ? docsTableVirtualizer.getTotalSize() -
      (docsTableVirtualRows.at(-1)?.end ?? 0)
    : 0
  const sectionInsetClassName = embedded ? 'px-4 py-4' : ''

  const confirmSingleDelete = useCallback(async () => {
    const doc = singleDeleteDoc
    if (!doc) return
    if (singleDeleteWorking) return

    setSingleDeleteWorking(true)
    setSingleDeleteError(null)
    try {
      await deleteDocument(doc.id)
      toast.success(t('toasts.deleteSuccess'))
      setSingleDeleteDoc(null)
    } catch (err: unknown) {
      reportClientError('Failed to delete knowledge document', err)
      setSingleDeleteError(formatApiError(err, t('singleDelete.errorFallback')))
    } finally {
      setSingleDeleteWorking(false)
    }
  }, [deleteDocument, singleDeleteDoc, singleDeleteWorking, t])

  const requestSingleDelete = useCallback((doc: Document) => {
    setSingleDeleteError(null)
    setSingleDeleteDoc(doc)
  }, [])

  const handleDrawerOpenChange = useCallback((open: boolean) => {
    if (!open) setActiveDrawerDoc(null)
  }, [])

  const buildOpenInspectorHandler = useCallback(
    (doc: Document) => (event?: SyntheticEvent) => {
      event?.stopPropagation()
      setActiveDrawerDoc(doc)
    },
    []
  )

  const copyText = useCallback(
    async (text: string, okMsg: string) => {
      try {
        await globalThis.navigator.clipboard.writeText(text)
        toast.success(okMsg)
      } catch {
        toast.error(t('toasts.copyFailed'))
      }
    },
    [t]
  )

  const renderGridDocCard = (doc: Document) => {
    const badge = getStatusBadge(doc.status, t)
    return (
      <div key={doc.id} className="h-full">
        <DocumentCard
          doc={doc}
          statusBadge={badge}
          statusBarClassName={getStatusBarColor(doc.status)}
          onRequestDelete={requestSingleDelete}
          copyText={copyText}
          t={t}
          selected={selectedSet.has(doc.id)}
          onToggleSelect={() => toggleDocSelection(doc.id)}
          onPeek={onPeek}
        />
      </div>
    )
  }

  const visibleDocumentsCount = totalDocumentsCount
  const pageStart = visibleDocumentsCount
    ? (page - 1) * pageSize + 1
    : 0
  const pageEnd = Math.min(page * pageSize, visibleDocumentsCount)
  const canGoPrevious = page > 1
  const canGoNext = page < pageCount
  const isDatasetEmpty = documents.length === 0
  const showEmptyState = visibleDocumentsCount === 0
  const compactEmptyInventory = embedded && showEmptyState
  const inventoryStatCardClassName =
    'border-l border-border px-3 py-1.5 first:border-l-0'
  const checkboxCellClassName =
    'flex size-7 items-center justify-center rounded-md border border-border bg-background'
  const checkboxInputClassName =
    'size-4 cursor-pointer rounded border-border bg-background text-primary focus-ring'
  const inventoryToolbar = (
    <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <SearchInput
        value={docFilter}
        onValueChange={setDocFilter}
        containerClassName="min-w-0 w-full xl:max-w-[480px]"
        inputClassName="h-9 rounded-lg border-border bg-background pr-4 text-sm shadow-none"
        placeholder={
          showDatasetColumn
            ? '搜索文件名 / 文档 ID / 数据集'
            : '搜索文件名 / 文档 ID'
        }
      />

      <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap lg:justify-end">
        <Select
          value={sortKey}
          onValueChange={(value) => setSortKey(value as DocSortKey)}
        >
          <SelectTrigger className="h-9 min-w-[138px] rounded-lg border-border bg-background text-sm shadow-none">
            <SelectValue placeholder={t('table.columns.name')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="created_at">按上传时间</SelectItem>
            <SelectItem value="filename">按文件名</SelectItem>
            <SelectItem value="file_size">按文件大小</SelectItem>
          </SelectContent>
        </Select>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 min-w-[72px] justify-center rounded-lg border-border bg-background px-3 text-sm shadow-none"
          onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
        >
          {sortDir === 'asc' ? '升序' : '降序'}
        </Button>

        {hasActiveFilters ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 min-w-[88px] justify-center rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-muted/50"
            onClick={onClearFilters}
          >
            <RotateCcw className="mr-2 size-3.5" />
            清空筛选
          </Button>
        ) : null}

        <Button
          type="button"
          variant={opsOpen ? 'default' : 'outline'}
          size="sm"
          className="h-9 min-w-[90px] justify-center rounded-lg px-3 text-sm font-medium"
          aria-expanded={opsOpen}
          onClick={() => setOpsOpen((open) => !open)}
        >
          <Activity className="mr-2 size-3.5" />
          运维工具
        </Button>
      </div>
    </div>
  )

  return (
    <div
      className={cn(
        'animate-in fade-in slide-in-from-bottom-4 duration-300 motion-reduce:animate-none motion-reduce:transition-none',
        embedded && 'flex h-full min-h-0 flex-col'
      )}
    >
      <AlertDialog
        open={Boolean(singleDeleteDoc)}
        onOpenChange={(open) => {
          if (open) return
          setSingleDeleteDoc(null)
          setSingleDeleteWorking(false)
          setSingleDeleteError(null)
        }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {singleDeleteDoc
                ? t('singleDelete.title')
                : t('singleDelete.titleDefault')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {singleDeleteDoc && (
                <div className="space-y-2">
                  <div>
                    {t('singleDelete.description', {
                      filename: singleDeleteDoc.filename,
                    })}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono break-all">
                    {singleDeleteDoc.id}
                  </div>
                </div>
              )}
              {singleDeleteError ? (
                <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive text-pretty">
                  {singleDeleteError}
                </div>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSingleDeleteDoc(null)}
              disabled={singleDeleteWorking}
            >
              {t('actions.cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => detachPromise(confirmSingleDelete())}
              disabled={singleDeleteWorking || !singleDeleteDoc}
            >
              {singleDeleteWorking
                ? t('actions.deleting')
                : t('actions.confirmDelete')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AnimatePresence>
        {selectedDocIds.length > 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.15 }}
            className={cn(
              'fixed bottom-2 left-2 right-2 max-w-5xl overflow-hidden rounded-lg border border-border bg-background px-3 py-2 shadow-sm md:bottom-4 md:left-[15rem] md:right-4 md:mx-auto',
              UI_LAYER_CLASS.floatingAction
            )}
          >
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <div className="flex shrink-0 items-center gap-2 border-b border-border pb-2 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-3">
                <div className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold tabular-nums text-primary">
                  {selectedDocIds.length}
                </div>
                <span className="whitespace-nowrap text-sm font-medium text-foreground">
                  {t('selection.selectedCount', {
                    count: selectedDocIds.length,
                  })}
                </span>
              </div>

              <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-0.5 pr-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-11 rounded-md px-3 text-xs font-medium hover:bg-muted/60 sm:h-9"
                  onClick={toggleSelectAllVisible}
                >
                  {allVisibleSelected
                    ? t('selection.clearSelectAll')
                    : t('selection.selectAllVisible')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-11 rounded-md px-3 text-xs font-medium hover:bg-muted/60 sm:h-9"
                  onClick={() => setSelectedDocIds([])}
                >
                  {t('actions.clearSelection')}
                </Button>
                <div className="w-px h-4 bg-border/40 mx-1" />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-11 rounded-md px-3 text-xs font-medium text-primary hover:bg-muted/60 sm:h-9"
                  onClick={() => detachPromise(runBatchReingest())}
                  disabled={
                    batchDeleting ||
                    batchLifecycleWorking ||
                    batchReingestWorking
                  }
                >
                  {batchReingestWorking ? (
                    <Loader2 className="size-3 animate-spin mr-1.5" />
                  ) : (
                    <RefreshCw className="size-3 mr-1.5" />
                  )}
                  {batchReingestWorking
                    ? t('actions.reingesting')
                    : t('actions.reingest')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-11 rounded-md px-3 text-xs font-medium hover:bg-muted/60 sm:h-9"
                  onClick={() => detachPromise(runBatchLifecycle('disable'))}
                  disabled={
                    batchDeleting ||
                    batchLifecycleWorking ||
                    !anySelectedEnabled
                  }
                >
                  {t('actions.disable')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-11 rounded-md px-3 text-xs font-medium hover:bg-muted/60 sm:h-9"
                  onClick={() => detachPromise(runBatchLifecycle('enable'))}
                  disabled={
                    batchDeleting ||
                    batchLifecycleWorking ||
                    !anySelectedDisabled
                  }
                >
                  {t('actions.enable')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-11 rounded-md px-3 text-xs font-medium hover:bg-muted/60 sm:h-9"
                  onClick={() => detachPromise(runBatchLifecycle('archive'))}
                  disabled={
                    batchDeleting ||
                    batchLifecycleWorking ||
                    !anySelectedNotArchived
                  }
                >
                  {t('actions.archive')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-11 rounded-md px-3 text-xs font-medium hover:bg-muted/60 sm:h-9"
                  onClick={() => detachPromise(runBatchLifecycle('unarchive'))}
                  disabled={
                    batchDeleting ||
                    batchLifecycleWorking ||
                    !anySelectedArchived
                  }
                >
                  {t('actions.unarchive')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-11 rounded-md bg-destructive/5 px-3 text-xs font-medium text-destructive hover:bg-destructive/15 sm:h-9"
                  onClick={() => setBatchDeleteOpen(true)}
                  disabled={batchDeleting || batchLifecycleWorking}
                >
                  <Trash2 className="size-3 mr-1.5" />
                  {t('actions.batchDelete')}
                </Button>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AlertDialog open={batchDeleteOpen} onOpenChange={setBatchDeleteOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('batchDelete.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('batchDelete.description', { count: selectedDocIds.length })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setBatchDeleteOpen(false)}
              disabled={batchDeleting}
            >
              {t('actions.cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => detachPromise(confirmBatchDelete())}
              disabled={batchDeleting || selectedDocIds.length === 0}
            >
              {batchDeleting
                ? t('actions.deleting')
                : t('actions.confirmDelete')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={Boolean(activeDrawerDoc)}
        onOpenChange={handleDrawerOpenChange}
      >
        <DialogContent className="left-auto right-0 top-0 flex h-dvh w-[min(540px,100vw)] max-w-[540px] translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-l border-border bg-background p-0 shadow-none">
          <DialogHeader className="border-b border-border px-4 py-3 pr-14 text-left">
            <DialogTitle className="text-base font-semibold leading-none text-foreground">
              文档审查视图
            </DialogTitle>
            <DialogDescription className="mt-1 text-sm leading-5 text-muted-foreground">
              管理切片、检索与健康细节，不挤占主表格宽度。
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <KnowledgeInspector
              embedded
              selectedDocs={activeDrawerDoc ? [activeDrawerDoc] : []}
            />
          </div>
        </DialogContent>
      </Dialog>

      <Sheet open={opsOpen} onOpenChange={setOpsOpen}>
        <SheetContent
          side="right"
          className="flex h-dvh w-[min(640px,calc(100vw-16px))] flex-col overflow-hidden border-l border-border bg-background p-0 shadow-none sm:max-w-[640px]"
          overlayClassName="bg-black/30"
        >
          <SheetHeader className="shrink-0 border-b border-border px-4 py-3 pr-14 text-left">
            <SheetTitle className="text-base font-semibold leading-none text-foreground">
              运维工具
            </SheetTitle>
            <SheetDescription className="mt-1 text-sm leading-5 text-muted-foreground">
              当前知识库和勾选文档的统计、解析内容、重复文件、生命周期和批量移动操作。
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2.5 [scrollbar-gutter:stable]">
            <DocumentOperationsPanel
              selectedDocumentIds={selectedDocIds}
              datasetId={selectedDatasetId}
              datasets={datasets}
              onSelectedDocumentIdsChange={setSelectedDocIds}
              onDocumentsChanged={onDocumentsChanged}
            />
          </div>
        </SheetContent>
      </Sheet>

      <div
        className={cn(
          'flex min-h-0 flex-col overflow-hidden rounded-none border-0 bg-background shadow-none dark:bg-background',
          embedded && 'h-full flex-1',
          embedded ? 'h-full' : 'min-h-[560px]'
        )}
      >
        <div className="border-b border-border bg-background px-4 py-3">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 space-y-1.5">
              <div className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <div className="flex size-7 items-center justify-center rounded-md border border-border bg-muted/40 text-primary">
                  <Database className="size-3.5" />
                </div>
                文档资产
              </div>
              <div className="text-xl font-semibold leading-tight text-foreground">
                {selectedDatasetLabel || '全部知识库文档总览'}
              </div>
              <div className="max-w-3xl text-sm leading-5 text-muted-foreground">
                集中查看文档资产、状态分布、分块体量与健康卡入口，支持直接在当前面板完成搜索和排序。
              </div>
            </div>

            <div className="grid grid-cols-3 rounded-lg border border-border xl:min-w-[330px]">
              <motion.div
                className={inventoryStatCardClassName}
              >
                <div className="text-xs font-medium leading-none text-muted-foreground">
                  当前可见
                </div>
                <div className="mt-1 text-sm font-semibold tabular-nums text-foreground">
                  {visibleDocumentsCount}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  当前列表结果
                </div>
              </motion.div>
              <motion.div
                className={inventoryStatCardClassName}
              >
                <div className="text-xs font-medium leading-none text-muted-foreground">
                  已选择
                </div>
                <div className="mt-1 text-sm font-semibold tabular-nums text-foreground">
                  {selectedDocIds.length}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  批量操作范围
                </div>
              </motion.div>
              <motion.div
                className={inventoryStatCardClassName}
              >
                <div className="text-xs font-medium leading-none text-muted-foreground">
                  展示模式
                </div>
                <div className="mt-1 text-sm font-semibold text-foreground">
                  {viewMode === 'list' ? '列表模式' : '网格模式'}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {showDatasetColumn ? '跨数据集视图' : '单数据集视图'}
                </div>
              </motion.div>
            </div>
          </div>

          {scopeSummary ? <div className="mt-2.5">{scopeSummary}</div> : null}
        </div>

        <div
          className={cn(
            'flex min-h-0 flex-1 flex-col',
            embedded && 'bg-transparent p-0 dark:bg-transparent',
            compactEmptyInventory && 'p-2'
          )}
        >
          <div
            className={cn(
              'flex min-h-0 flex-1 flex-col overflow-hidden rounded-none border-0 bg-transparent shadow-none',
              compactEmptyInventory && 'overflow-visible'
            )}
          >
            <div className="border-b border-border/45 bg-background px-3 py-2 dark:border-border/60 dark:bg-background">
              {inventoryToolbar}
            </div>
            <div
              ref={onScrollContainerChange}
              data-knowledge-documents-scroll-container="true"
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain custom-scrollbar [scrollbar-gutter:stable]"
            >
              {(() => {
            if (isLoading && isDatasetEmpty) {
              return (
                <div className="flex h-full min-h-[360px] items-center justify-center px-6 py-10 text-muted-foreground">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="size-8 animate-spin motion-reduce:animate-none" />
                    <p className="text-sm">{t('loading')}</p>
                  </div>
                </div>
              )
            }

            if (showEmptyState) {
              const emptyTitle = getEmptyTitle(isDatasetEmpty, docFilter)
              const emptyDescription = isDatasetEmpty
                ? '使用右上角「导入/新增」上传文档或创建连接器后，资产列表会在这里形成可检索的文档货架。'
                : '当前筛选条件没有命中文档，可以放宽范围、清空搜索，或切回全部数据集重新查看。'

              return (
                <div
                  data-knowledge-empty-shelf-dock="integrated-canvas"
                  className="flex min-h-0 flex-1 px-2 pb-2 pt-1.5"
                >
                  <div
                    data-knowledge-empty-shelf="true"
                    className="flex min-h-[clamp(220px,30vh,320px)] w-full flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-background px-4 py-8 text-center"
                  >
                    <div className="mb-3 flex size-11 items-center justify-center rounded-lg border border-border bg-muted/40 text-primary">
                      {isDatasetEmpty ? (
                        <Database className="size-5" />
                      ) : (
                        <Filter className="size-5" />
                      )}
                    </div>
                    <h3 className="text-base font-semibold text-foreground">
                      {emptyTitle}
                    </h3>
                    <p className="mt-2 max-w-2xl text-sm leading-5 text-muted-foreground">
                      {emptyDescription}
                    </p>

                    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            aria-label="查看入库指引"
                          >
                            入库指引
                            <ChevronDown className="ml-1.5 size-3.5 text-muted-foreground" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          sideOffset={8}
                          className="w-[min(330px,calc(100vw-16px))] p-2"
                        >
                          <div className="space-y-1">
                            <div className="rounded-md px-3 py-2 text-left">
                              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                                <Database className="size-4 text-info" />
                                导入路径
                              </div>
                              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                从右上角「导入/新增」上传文件、批量 URL
                                或连接器任务，文档会自动绑定当前数据集。
                              </p>
                            </div>
                            <div className="rounded-md px-3 py-2 text-left">
                              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                                <Filter className="size-4 text-info" />
                                筛选路径
                              </div>
                              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                当前左侧范围会影响列表结果；如果误选生命周期或状态，可以先清空筛选。
                              </p>
                            </div>
                            <div className="rounded-md px-3 py-2 text-left">
                              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                                <Layers className="size-4 text-info" />
                                质量路径
                              </div>
                              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                文档入库后可在这里查看切片数量、解析状态、健康卡和后续检索测试入口。
                              </p>
                            </div>
                          </div>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      {isDatasetEmpty ? null : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={onClearFilters}
                        >
                          <RotateCcw className="mr-2 size-3.5" />
                          清空所有筛选
                        </Button>
                      )}

                      {(selectedDatasetId || hasActiveFilters) && onSwitchToAllDatasets ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={onSwitchToAllDatasets}
                        >
                          回到全部数据集
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              )
            }

            if (viewMode === 'grid') {
              return (
                <div className={sectionInsetClassName}>
                  <div
                    aria-label={t('grid.ariaLabel')}
                    style={{
                      height: `${docsGridVirtualizer.getTotalSize()}px`,
                      width: '100%',
                      position: 'relative',
                    }}
                  >
                    {docsGridVirtualRows.map((virtualRow) => {
                      const cols = Math.max(1, docGridColumns)
                      const startIndex = virtualRow.index * cols
                      const rowDocs = filteredDocuments.slice(
                        startIndex,
                        startIndex + cols
                      )
                      const isLastRow = virtualRow.index === docGridRowCount - 1

                      return (
                        <div
                          key={virtualRow.key}
                          data-index={virtualRow.index}
                          ref={docsGridVirtualizer.measureElement}
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            transform: `translateY(${virtualRow.start}px)`,
                          }}
                          className={isLastRow ? undefined : 'pb-5'}
                        >
                          <div
                            className={cn(
                              'grid items-stretch gap-5',
                              docsGridColsClassName
                            )}
                          >
                            {rowDocs.map(renderGridDocCard)}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            }

            return (
              <>
                {/* className="group hover:bg-muted/20 transition-colors" */}
                <div className="min-w-full overflow-x-auto">
                    <table
                      aria-label={t('table.ariaLabel')}
                      className="w-full min-w-[920px] table-fixed text-left text-sm"
                    >
                      <colgroup>
                        <col className="w-9" />
                        <col />
                        {showDatasetColumn ? (
                          <col className="w-[10rem]" />
                        ) : null}
                        <col className="w-[6.5rem]" />
                        <col className="w-[6rem]" />
                        <col className="w-[4.5rem]" />
                        <col className="w-[6rem]" />
                        <col className="w-[6.5rem]" />
                        <col className="w-[8.5rem]" />
                      </colgroup>
                      {/* sticky top-0 z-10 bg-card/92 px-3 py-2 font-medium dark:bg-background/90 */}
                      <thead className="border-b border-border bg-background text-xs text-muted-foreground">
                        <tr>
                          <th
                            colSpan={tableColumnCount}
                            className="sticky top-0 z-10 bg-background px-3 py-2 font-medium dark:bg-background"
                          >
                            <div
                              className="grid items-center gap-3"
                              style={{
                                gridTemplateColumns: documentListGridTemplate,
                              }}
                            >
                              <div className={checkboxCellClassName}>
                                <input
                                  type="checkbox"
                                  className={checkboxInputClassName}
                                  checked={allVisibleSelected}
                                  onChange={toggleSelectAllVisible}
                                  aria-label={t('table.selectAllVisible')}
                                />
                              </div>
                              <div>{t('table.columns.name')}</div>
                              {showDatasetColumn ? (
                                <div>{t('table.columns.dataset')}</div>
                              ) : null}
                              <div>{t('table.columns.tags')}</div>
                              <div>{t('table.columns.status')}</div>
                              <div className="text-right tabular-nums">
                                {t('table.columns.chunks')}
                              </div>
                              <div className="text-right tabular-nums">
                                {t('table.columns.size')}
                              </div>
                              <div>{t('table.columns.uploadedAt')}</div>
                              <div className="text-right">
                                {t('table.columns.actions')}
                              </div>
                            </div>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-background dark:bg-background">
                        {docsTablePaddingTop > 0 ? (
                          <tr>
                            <td
                              colSpan={tableColumnCount}
                              className="p-0"
                              style={{ height: `${docsTablePaddingTop}px` }}
                            />
                          </tr>
                        ) : null}

                        {docsTableVirtualRows.map((virtualRow) => {
                          const doc = filteredDocuments[virtualRow.index]
                          if (!doc) return null
                          const badge = getStatusBadge(doc.status, t)
                          const tags = getUserTagsFromDocument(doc)
                          const fileType = getFileTypeMeta(doc)
                          const TypeIcon = fileType.icon
                          const datasetLabel =
                            datasetLabelById?.[doc.dataset_id || ''] || '-'
                          const metadataItems = [
                            { label: '数据集', value: datasetLabel },
                            {
                              label: '标签',
                              value: getDocumentTagSummary(tags),
                            },
                            {
                              label: '生命周期',
                              value: getDocumentLifecycleLabel(doc),
                            },
                            {
                              label: '来源',
                              value: getDocumentSourceLabel(doc),
                            },
                            {
                              label: '更新时间',
                              value: formatDate(
                                doc.updated_at || doc.created_at
                              ),
                            },
                          ]

                          return (
                            <tr
                              key={doc.id}
                              data-index={virtualRow.index}
                              ref={docsTableVirtualizer.measureElement}
                              className="group/row"
                            >
                              <td
                                colSpan={tableColumnCount}
                                className="border-b border-border/40 px-3 py-0"
                              >
                                <div className="rounded-none border-0 bg-transparent shadow-none transition-colors duration-150 group-hover/row:bg-muted/40 dark:group-hover/row:bg-muted/10">
                                  <div
                                    className="grid min-h-[54px] items-center gap-3 px-0 py-2"
                                    style={{
                                      gridTemplateColumns:
                                        documentListGridTemplate,
                                    }}
                                  >
                                    <div className={checkboxCellClassName}>
                                      <input
                                        type="checkbox"
                                        className={checkboxInputClassName}
                                        checked={selectedSet.has(doc.id)}
                                        onChange={() =>
                                          toggleDocSelection(doc.id)
                                        }
                                        aria-label={t('table.selectDocument', {
                                          filename: doc.filename,
                                        })}
                                      />
                                    </div>

                                    <div className="min-w-0">
                                      <div className="flex min-w-0 items-center gap-3">
                                        <div
                                          className={cn(
                                            'flex size-8 shrink-0 items-center justify-center rounded-md border',
                                            fileType.bg,
                                            fileType.border,
                                            fileType.color
                                          )}
                                        >
                                          <TypeIcon className="size-4.5" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <div
                                            className="mb-1 max-w-[360px] truncate text-[13px] font-semibold leading-none text-foreground/92 xl:max-w-[440px]"
                                            title={doc.filename}
                                          >
                                            {doc.filename}
                                          </div>
                                          <div className="max-w-[360px] truncate font-mono text-xs text-muted-foreground xl:max-w-[440px]">
                                            {doc.id}
                                          </div>
                                        </div>
                                      </div>
                                    </div>

                                    {showDatasetColumn ? (
                                      <div className="min-w-0 text-[12px] leading-5 text-muted-foreground/78">
                                        <span className="line-clamp-2">
                                          {datasetLabel}
                                        </span>
                                      </div>
                                    ) : null}

                                    <div className="min-w-0">
                                      {tags.length ? (
                                        <DocumentTags
                                          tags={tags}
                                          max={2}
                                          dense
                                        />
                                      ) : (
                                        <span className="text-[12px] text-muted-foreground/32">
                                          —
                                        </span>
                                      )}
                                    </div>

                                    <div className="min-w-0">
                                      <StatusBadge
                                        status={badge.status}
                                        label={badge.label}
                                        dense
                                        className="rounded-md bg-muted/50"
                                      />
                                    </div>

                                    <div className="text-right text-xs tabular-nums text-foreground/70">
                                      {doc.chunk_count ?? '0'}
                                    </div>
                                    <div className="text-right text-xs tabular-nums text-muted-foreground">
                                      {formatFileSize(doc.file_size)}
                                    </div>
                                    <div className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                                      {formatDate(doc.created_at)}
                                    </div>
                                    <div className="flex items-center justify-end gap-1">
                                      <IconButton
                                        label="查看详情"
                                        variant="ghost"
                                        className="size-9 rounded-md text-muted-foreground hover:bg-primary/8 hover:text-primary"
                                        onClick={buildOpenInspectorHandler(doc)}
                                      >
                                        <Eye className="h-3.5 w-3.5" />
                                      </IconButton>

                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-9 rounded-md px-2.5 text-xs font-medium text-primary hover:bg-primary/10"
                                        onClick={(event) => {
                                          event.stopPropagation()
                                          if (onPeek) onPeek(doc.id)
                                          else
                                            globalThis.window.open(
                                              buildChunkPreviewDocumentHref(doc.id),
                                              '_blank',
                                              'noopener,noreferrer'
                                            )
                                        }}
                                      >
                                        <Layers className="mr-1 size-3" />
                                        {peekChunksLabel}
                                      </Button>

                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <IconButton
                                            label={t('actions.moreActions')}
                                            variant="ghost"
                                            className="size-9 rounded-md text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                                          >
                                            <MoreVertical className="h-3.5 w-3.5" />
                                          </IconButton>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-56">
                                          <DropdownMenuItem
                                            onSelect={() =>
                                              detachPromise(
                                                copyText(
                                                  doc.id,
                                                  t('toasts.copyDocumentId')
                                                )
                                              )
                                            }
                                          >
                                            {t('actions.copyDocumentId')}
                                          </DropdownMenuItem>
                                          <DropdownMenuItem
                                            onSelect={() =>
                                              detachPromise(
                                                copyText(
                                                  doc.filename,
                                                  t('toasts.copyFilename')
                                                )
                                              )
                                            }
                                          >
                                            {t('actions.copyFilename')}
                                          </DropdownMenuItem>
                                          <DropdownMenuItem asChild>
                                            <Link
                                              href={`/knowledge/${doc.id}/health`}
                                              className="flex items-center"
                                            >
                                              <Activity className="mr-2 h-4 w-4" />
                                              {t('actions.healthCard')}
                                            </Link>
                                          </DropdownMenuItem>
                                          <DropdownMenuSeparator />
                                          <DropdownMenuItem
                                            className="text-destructive focus:text-destructive"
                                            onSelect={() =>
                                              requestSingleDelete(doc)
                                            }
                                          >
                                            <Trash2 className="mr-2 h-4 w-4" />
                                            {t('actions.deleteDocument')}
                                          </DropdownMenuItem>
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    </div>
                                  </div>

                                  <div className="mx-0 mb-1 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 px-12 pb-1 text-xs text-muted-foreground">
                                    {metadataItems.map((item, index) => (
                                      <div
                                        key={item.label}
                                        className={cn(
                                          'flex min-w-0 items-center gap-1.5',
                                          index > 0 &&
                                            'border-l border-border/45 pl-2.5'
                                        )}
                                      >
                                        <span className="shrink-0 text-muted-foreground/56">
                                          {item.label}
                                        </span>
                                        <span className="min-w-0 truncate text-foreground/66">
                                          {item.value}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )
                        })}

                        {docsTablePaddingBottom > 0 ? (
                          <tr>
                            <td
                              colSpan={tableColumnCount}
                              className="p-0"
                              style={{ height: `${docsTablePaddingBottom}px` }}
                            />
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-auto flex flex-col gap-2 border-t border-border bg-background px-4 py-2.5 sm:flex-row sm:items-center sm:justify-end">
                    <span className="text-xs text-muted-foreground">
                      显示 {pageStart}-{pageEnd} / 共 {visibleDocumentsCount} 条
                    </span>
                    <span
                      className="inline-flex h-9 items-center rounded-md border border-border bg-background px-2.5 text-xs text-muted-foreground"
                    >
                      {pageSize} 条/页
                    </span>
                    <div className="inline-flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-9 rounded-md"
                        disabled={!canGoPrevious}
                        aria-label="上一页"
                        onClick={() => onPageChange(page - 1)}
                      >
                        <ChevronLeft className="size-4" />
                      </Button>
                      <span className="inline-flex h-9 min-w-[5.25rem] items-center justify-center rounded-md border border-primary/20 bg-primary/[0.09] px-3 text-xs font-semibold text-primary">
                        第 {page} / {pageCount} 页
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-9 rounded-md"
                        disabled={!canGoNext}
                        aria-label="下一页"
                        onClick={() => onPageChange(page + 1)}
                      >
                        <ChevronRight className="size-4" />
                      </Button>
                    </div>
                  </div>
                </>
            )
          })()}
        </div>
      </div>
    </div>
    </div>
    </div>
  )
}

function DocumentCard({
  doc,
  statusBadge,
  statusBarClassName,
  onRequestDelete,
  copyText,
  t,
  selected,
  onToggleSelect,
  onPeek,
}: Readonly<{
  doc: Document
  statusBadge: { status: StatusBadgeStatus; label: string }
  statusBarClassName: string
  onRequestDelete: (doc: Document) => void
  copyText: (text: string, okMsg: string) => void | Promise<void>
  t: TranslateFn
  selected: boolean
  onToggleSelect: () => void
  onPeek?: (docId: string) => void
}>) {
  const peekChunksLabel = (() => {
    const resolved = t('actions.peekChunks')
    return resolved === 'KnowledgeDocumentsPanel.actions.peekChunks'
      ? '切片管理'
      : resolved
  })()
  const parserLabel = doc.metadata?.parser_backend
    ? getParserLabel(doc.metadata.parser_backend as string)
    : null
  const userTags = getUserTagsFromDocument(doc)
  const fileType = getFileTypeMeta(doc)
  const TypeIcon = fileType.icon
  const metadata = isRecord(doc.metadata) ? doc.metadata : {}
  const parseQuality = isRecord(metadata.parse_quality) ? metadata.parse_quality : {}
  const parseScoreRaw = parseQuality.score
  const parseScore =
    typeof parseScoreRaw === 'number' && Number.isFinite(parseScoreRaw)
      ? parseScoreRaw
      : null

  // 计算质量百分比和颜色
  const qualityPercent =
    parseScore === null ? null : Math.round(parseScore * 100)
  const qualityColor = getQualityColor(qualityPercent)

  return (
    <Panel
      padding="none"
      className={cn(
        'group relative flex h-full flex-col overflow-hidden rounded-lg border-border bg-card transition-colors duration-150',
        selected
          ? 'border-primary/50 bg-primary/[0.03] ring-2 ring-primary/15'
          : 'hover:border-primary/30'
      )}
    >
      <div className={cn('h-0.5 w-full', statusBarClassName)} />

      <div className="flex flex-1 flex-col p-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex size-8 items-center justify-center rounded-md border border-border bg-background">
              <input
                type="checkbox"
                className="size-4 cursor-pointer rounded border-border text-primary focus-ring"
                checked={selected}
                onChange={onToggleSelect}
                aria-label={t('table.selectDocument', { filename: doc.filename })}
              />
            </div>
            <div
              className={cn(
                'flex size-10 items-center justify-center rounded-lg border',
                fileType.bg,
                fileType.border,
                fileType.color
              )}
            >
              <TypeIcon className="size-5" />
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <StatusBadge
              status={statusBadge.status}
              label={statusBadge.label}
              dense
            />
            <div
              className={cn(
                'rounded-md border px-2 py-0.5 text-xs font-medium',
                fileType.bg,
                fileType.color,
                fileType.border
              )}
            >
              {fileType.label}
            </div>
            {qualityPercent !== null ? (
              <span className={cn('text-xs font-medium tabular-nums', qualityColor)} title={`解析质量: ${qualityPercent}%`}>
                质量 {qualityPercent}%
              </span>
            ) : null}
          </div>
        </div>

        <h3
          className="mb-3 min-h-[2.5rem] line-clamp-2 text-sm font-medium leading-snug text-foreground transition-colors group-hover:text-primary"
          title={doc.filename}
        >
          {doc.filename}
        </h3>

        {userTags.length ? (
          <DocumentTags tags={userTags} max={3} dense className="mb-4" />
        ) : null}

        <div className="mt-auto grid grid-cols-2 gap-3 border-t border-border pt-4">
          <div className="space-y-0.5">
            <p className="text-xs font-medium text-muted-foreground">
              {t('row.size')}
            </p>
            <p className="text-xs font-medium tabular-nums text-foreground/80">
              {formatFileSize(doc.file_size)}
            </p>
          </div>
          <div className="space-y-0.5">
            <p className="text-xs font-medium text-muted-foreground">
              {t('row.chunks')}
            </p>
            <p className="text-xs font-medium tabular-nums text-foreground/80">
              {doc.chunk_count ?? '-'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2.5">
        <span className="max-w-[120px] truncate text-xs font-medium text-muted-foreground">
          {parserLabel || t('row.parserAuto')}
        </span>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 rounded-md px-3 text-xs font-medium text-primary hover:bg-primary/10"
            onClick={(e) => {
              e.stopPropagation()
              if (onPeek) onPeek(doc.id)
              else
                globalThis.window.open(
                  buildChunkPreviewDocumentHref(doc.id),
                  '_blank',
                  'noopener,noreferrer'
                )
            }}
          >
            <Layers className="size-3 mr-1.5" />
            {peekChunksLabel}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton
                label={t('actions.moreActions')}
                variant="ghost"
                className="size-9 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="w-4 h-4" />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                onSelect={() =>
                  detachPromise(copyText(doc.id, t('toasts.copyDocumentId')))
                }
              >
                {t('actions.copyDocumentId')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  detachPromise(
                    copyText(doc.filename, t('toasts.copyFilename'))
                  )
                }
              >
                {t('actions.copyFilename')}
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link
                  href={`/knowledge/${doc.id}/health`}
                  className="flex items-center"
                >
                  <Activity className="mr-2 h-4 w-4" />
                  {t('actions.healthCard')}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => onRequestDelete(doc)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t('actions.deleteDocument')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {statusBadge.status === 'processing' ? (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted/40">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${doc.processing_progress || 60}%` }}
            className="h-full bg-primary"
          />
        </div>
      ) : null}
    </Panel>
  )
}
