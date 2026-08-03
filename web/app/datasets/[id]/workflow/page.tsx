'use client'

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Download, FileUp, Layers, Loader2, MoreHorizontal, Save } from 'lucide-react'

import { AppFrame } from '@/components/app-frame'
import { DatasetDetailShell } from '@/components/datasets/dataset-detail-shell'
import { Panel } from '@/components/ui/panel'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Textarea } from '@/components/ui/textarea'

import { WorkflowEditor } from '@/components/workflow/workflow-editor'
import { useUnsavedNavigationGuard } from '@/hooks/use-unsaved-navigation-guard'
import { datasetApi } from '@/lib/api'
import { formatApiError } from '@/lib/api-errors'
import { reportClientError } from '@/lib/client-logging'
import { buildDatasetConfigGraph } from '@/lib/dataset-config-graph'
import type { GraphNode } from '@/lib/graph-parser'
import { queryKeys } from '@/lib/query-keys'
import { useRouter } from '@/i18n/navigation'
import { cn, detachPromise } from '@/lib/utils'

import type { Dataset, DatasetConfigBundle, DatasetConfigExport, DatasetConfigImportRequest } from '@/types'

type DatasetWorkflowGraphNode = GraphNode & {
  meta?: {
    configured?: boolean
    summary?: string[]
    json?: unknown
  }
}

function asDatasetId(raw: unknown): string | null {
  if (typeof raw === 'string' && raw.trim()) return raw
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0]
  return null
}

function downloadJson(value: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function normalizeImportedBundle(raw: unknown): DatasetConfigBundle | null {
  if (!raw || typeof raw !== 'object') return null
  if ('config' in raw && raw.config && typeof raw.config === 'object') return raw.config
  return raw
}

export default function DatasetWorkflowPage() {
  const router = useRouter()
  const params = useParams()
  const routeParams = params as Readonly<Record<string, string | string[] | undefined>>
  const datasetId = asDatasetId(routeParams.id)

  const importInputRef = useRef<HTMLInputElement>(null)

  const [workingConfig, setWorkingConfig] = useState<DatasetConfigBundle | null>(null)
  const [selectedNode, setSelectedNode] = useState<DatasetWorkflowGraphNode | null>(null)

  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)

  const [importOpen, setImportOpen] = useState(false)
  const [importFileName, setImportFileName] = useState<string>('')
  const [importBundle, setImportBundle] = useState<DatasetConfigBundle | null>(null)

  const datasetQuery = useQuery({
    queryKey: queryKeys.datasets.detail(datasetId || ''),
    queryFn: () => {
      if (!datasetId) throw new Error('缺少数据集 ID')
      return datasetApi.get(datasetId)
    },
    enabled: Boolean(datasetId),
  })
  const configQuery = useQuery({
    queryKey: queryKeys.datasets.config(datasetId || ''),
    queryFn: () => {
      if (!datasetId) throw new Error('缺少数据集 ID')
      return datasetApi.exportConfig(datasetId)
    },
    enabled: Boolean(datasetId),
  })
  const dataset = (datasetQuery.data ?? null) as Dataset | null
  const exportRes = (configQuery.data ?? null) as DatasetConfigExport | null
  const loading = datasetQuery.isFetching || configQuery.isFetching
  const loadError = datasetQuery.error ?? configQuery.error
  const loadErrorUpdatedAt = Math.max(
    datasetQuery.errorUpdatedAt,
    configQuery.errorUpdatedAt
  )
  const { refetch: refetchDataset } = datasetQuery
  const { refetch: refetchConfig } = configQuery
  const refreshWorkflow = useCallback(async () => {
    await Promise.all([refetchDataset(), refetchConfig()])
  }, [refetchConfig, refetchDataset])

  const importKeys = useMemo(() => {
    if (!importBundle || typeof importBundle !== 'object') return []
    return Object.keys(importBundle).sort((a, b) => a.localeCompare(b))
  }, [importBundle])

  const activeConfig = workingConfig ?? exportRes?.config ?? null
  const graph = useMemo(() => buildDatasetConfigGraph(activeConfig ?? {}), [activeConfig])
  const savedConfigJson = useMemo(() => JSON.stringify(exportRes?.config ?? null), [exportRes?.config])
  const workingConfigJson = useMemo(() => JSON.stringify(workingConfig ?? null), [workingConfig])
  const hasUnsavedLayoutChanges = !!workingConfig && workingConfigJson !== savedConfigJson

  const selectedMeta = selectedNode?.meta
  const selectedSummary = Array.isArray(selectedMeta?.summary) ? selectedMeta.summary : []
  const selectedJson = selectedMeta?.json
  const configuredNodeCount = graph.nodes.filter((node) => {
    const meta = (node as DatasetWorkflowGraphNode).meta
    return meta?.configured === true
  }).length
  const configVersionLabel = exportRes?.version ? String(exportRes.version) : '—'
  const layoutStatusLabel = loading ? '加载中' : hasUnsavedLayoutChanges ? '有未保存布局' : '已同步'
  const selectedMetaStatusText =
    selectedMeta?.configured === false
      ? '未单独配置，继承默认策略'
      : selectedMeta?.configured === true
        ? '已配置'
        : '点击左侧节点查看摘要与 JSON'
  const selectedJsonText = useMemo(() => {
    if (selectedJson === undefined) return ''
    try {
      return JSON.stringify(selectedJson, null, 2)
    } catch {
      if (
        typeof selectedJson === 'string'
        || typeof selectedJson === 'number'
        || typeof selectedJson === 'boolean'
        || typeof selectedJson === 'bigint'
      ) {
        return String(selectedJson)
      }
      return '[无法序列化的 JSON]'
    }
  }, [selectedJson])

  useEffect(() => {
    if (!loadError) return
    toast.error(formatApiError(loadError, '加载工作流配置失败'))
  }, [loadError, loadErrorUpdatedAt])

  useEffect(() => {
    if (!exportRes) return
    setWorkingConfig(exportRes.config ?? {})
    setSelectedNode(null)
  }, [exportRes])

  const doExport = useCallback(async () => {
    if (!datasetId) return
    setExporting(true)
    try {
      const exp = await datasetApi.exportConfig(datasetId)
      const id8 = datasetId.slice(0, 8)
      const name = (dataset?.name || 'dataset').replaceAll(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 60)
      downloadJson(exp, `dataset-config-${name}-${id8}.json`)
      toast.success('已导出配置')
    } catch (e: unknown) {
      reportClientError('Failed to export dataset config', e)
      toast.error(formatApiError(e, '导出失败'))
    } finally {
      setExporting(false)
    }
  }, [dataset?.name, datasetId])

  const onPickImportFile = useCallback(async (file: File | null) => {
    if (!file) return
    setImporting(true)
    try {
      const text = await file.text()
      const raw = JSON.parse(text)
      const bundle = normalizeImportedBundle(raw)
      if (!bundle) {
        toast.error('JSON 格式不正确，需要包含配置对象或 config 字段')
        return
      }
      setImportFileName(file.name || 'config.json')
      setImportBundle(bundle)
      setImportOpen(true)
    } catch (e: unknown) {
      reportClientError('Failed to parse dataset config import JSON', e)
      toast.error('解析 JSON 文件失败')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }, [])

  const doImport = useCallback(async () => {
    if (!datasetId || !importBundle) return
    setImporting(true)
    try {
      const payload: DatasetConfigImportRequest = { config: importBundle, replace: true }
      await datasetApi.importConfig(datasetId, payload)
      toast.success('已导入并覆盖当前配置')
      setImportOpen(false)
      setImportBundle(null)
      setImportFileName('')
      await refreshWorkflow()
    } catch (e: unknown) {
      reportClientError('Failed to import dataset config', e)
      toast.error(formatApiError(e, '导入失败'))
    } finally {
      setImporting(false)
    }
  }, [datasetId, importBundle, refreshWorkflow])

  const onWorkflowLayoutChange = useCallback((workflowLayout: Record<string, unknown>) => {
    startTransition(() => {
      setWorkingConfig((prev) => ({
        ...(prev ?? exportRes?.config),
        workflow_layout: workflowLayout,
      }))
    })
  }, [exportRes?.config])

  const doSaveLayout = useCallback(async () => {
    if (!datasetId || !workingConfig) return
    setSaving(true)
    try {
      const payload: DatasetConfigImportRequest = { config: workingConfig, replace: true }
      await datasetApi.importConfig(datasetId, payload)
      toast.success('已保存工作流布局')
      await refreshWorkflow()
    } catch (e: unknown) {
      reportClientError('Failed to save workflow layout', e)
      toast.error(formatApiError(e, '保存失败'))
    } finally {
      setSaving(false)
    }
  }, [datasetId, refreshWorkflow, workingConfig])

  const copySelectedJson = useCallback(async () => {
    if (!selectedJsonText.trim()) return
    try {
      await navigator.clipboard.writeText(selectedJsonText)
      toast.success('已复制 JSON')
    } catch (e) {
      reportClientError('Failed to copy selected workflow JSON', e)
      toast.error('复制失败')
    }
  }, [selectedJsonText])

  const navigateAfterConfirm = useCallback((href: string) => router.push(href), [router])
  const navigationGuard = useUnsavedNavigationGuard({
    enabled: hasUnsavedLayoutChanges && !saving,
    onNavigate: navigateAfterConfirm,
  })

  return (
    <AppFrame>
      <DatasetDetailShell
        activeSection="workflow"
        datasetId={datasetId || ''}
        datasetName={dataset?.name}
        title="工作流配置"
        description="查看配置链路、调整节点布局，并导入或导出完整配置。"
        icon={Layers}
        onSectionNavigate={navigationGuard.requestNavigation}
        bodyClassName="h-full overflow-hidden bg-background pb-3"
        bodyContainerClassName="h-full min-h-0 overflow-hidden"
        actions={
          <>
            {hasUnsavedLayoutChanges ? (
              <Badge variant="soft" className="h-7 rounded-md px-2 text-xs">
                有未保存更改
              </Badge>
            ) : null}
            <Button
              size="sm"
              onClick={() => detachPromise(doSaveLayout())}
              disabled={saving || !datasetId || !workingConfig || !hasUnsavedLayoutChanges}
              className="h-9 rounded-md"
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : (
                <Save className="size-4" aria-hidden="true" />
              )}
              {saving ? '正在保存' : '保存布局'}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 rounded-md">
                  <MoreHorizontal className="size-4" aria-hidden="true" />
                  更多操作
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-md">
                <DropdownMenuItem
                  disabled={exporting}
                  onSelect={() => detachPromise(doExport())}
                >
                  {exporting ? (
                    <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  ) : (
                    <Download className="size-4" aria-hidden="true" />
                  )}
                  导出 JSON
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={importing}
                  onSelect={() => importInputRef.current?.click()}
                >
                  {importing ? (
                    <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  ) : (
                    <FileUp className="size-4" aria-hidden="true" />
                  )}
                  导入 JSON
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      >
        <input
          ref={importInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(event) => detachPromise(onPickImportFile(event.target.files?.[0] || null))}
        />

        <div className="h-full min-h-0 overflow-y-auto xl:overflow-hidden">
          <div className="grid min-h-full grid-cols-1 gap-3 xl:h-full xl:min-h-0 xl:grid-cols-[minmax(0,1fr)_360px]">
            <Panel padding="none" className="flex min-h-[560px] min-w-0 flex-col overflow-hidden rounded-md border-border bg-card shadow-none xl:min-h-0">
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div className="min-w-0">
                  <div className="text-base font-semibold text-foreground">配置链路图</div>
                  <div className="mt-1 text-sm text-muted-foreground">拖动节点只调整展示布局，不会改变业务配置值。</div>
                </div>
                <div className="hidden shrink-0 text-right text-xs text-muted-foreground md:block">
                  <div>版本 {configVersionLabel}</div>
                  <div className="mt-1">{graph.nodes.length} 个节点 · {graph.links.length} 条连接 · {configuredNodeCount} 个已配置</div>
                </div>
              </div>
              <div className="h-[500px] min-h-0 xl:h-auto xl:flex-1">
                <WorkflowEditor
                  graph={graph}
                  workflowLayout={workingConfig?.workflow_layout ?? null}
                  onWorkflowLayoutChange={onWorkflowLayoutChange}
                  onNodeSelect={(node) => setSelectedNode(node)}
                />
              </div>
            </Panel>

            <Panel className="flex min-h-[420px] flex-col overflow-hidden rounded-md border-border bg-card p-0 shadow-none xl:min-h-0">
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold text-foreground">
                    {selectedNode?.label ? String(selectedNode.label) : '节点详情'}
                  </div>
                  <div className="mt-1 text-sm leading-5 text-muted-foreground">{selectedMetaStatusText}</div>
                </div>
                {selectedJsonText.trim() ? (
                  <Button variant="outline" size="sm" onClick={() => detachPromise(copySelectedJson())} className="h-8 shrink-0 rounded-md px-2.5 text-xs">
                    复制 JSON
                  </Button>
                ) : null}
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 xl:min-h-0">
                {selectedSummary.length > 0 ? (
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-foreground">摘要</div>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedSummary.slice(0, 20).map((summary, index) => (
                        <Badge key={`${String(summary)}-${index}`} variant="outline" className="rounded-md font-mono text-xs">
                          {String(summary)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="space-y-2">
                  <div className="text-sm font-medium text-foreground">节点配置</div>
                  <Textarea
                    value={selectedJsonText || ''}
                    readOnly
                    className="min-h-[320px] resize-none rounded-md border-border bg-muted/20 font-mono text-xs leading-5 shadow-none"
                    placeholder="选择链路图中的节点后查看配置"
                  />
                </div>
              </div>

              <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
                <span>配置版本 <span className="font-mono text-foreground">{configVersionLabel}</span></span>
                <span className={cn('font-medium', hasUnsavedLayoutChanges ? 'text-warning' : 'text-foreground')}>{layoutStatusLabel}</span>
              </div>
            </Panel>
          </div>
        </div>

        <Dialog open={importOpen} onOpenChange={(open) => setImportOpen(open)}>
          <DialogContent className="rounded-md">
            <DialogHeader>
              <DialogTitle>导入工作流配置？</DialogTitle>
              <DialogDescription>
                导入会覆盖当前数据集配置和未保存的布局，请确认文件来源可靠。
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="text-sm">
                文件：<span className="font-mono">{importFileName || 'config.json'}</span>
              </div>
              {importKeys.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-sm font-medium text-foreground">包含的配置项</div>
                  <div className="flex flex-wrap gap-2">
                    {importKeys.slice(0, 24).map((k) => (
                      <Badge key={k} variant="outline" className="rounded-md font-mono text-xs">
                        {k}
                      </Badge>
                    ))}
                    {importKeys.length > 24 ? (
                      <Badge variant="secondary" className="rounded-md font-mono text-xs">
                        +{importKeys.length - 24} 项
                      </Badge>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setImportOpen(false)
                  setImportBundle(null)
                  setImportFileName('')
                }}
                disabled={importing}
              >
                取消
              </Button>
              <Button onClick={() => detachPromise(doImport())} disabled={importing || !importBundle || !datasetId} className="gap-2">
                {importing ? <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" /> : null}
                导入并覆盖
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={navigationGuard.navigationPending}
          onOpenChange={(open) => {
            if (!open) navigationGuard.cancelNavigation()
          }}
        >
          <DialogContent className="rounded-md">
            <DialogHeader>
              <DialogTitle>离开工作流配置？</DialogTitle>
              <DialogDescription>
                当前布局尚未保存，离开后这些更改会丢失。
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={navigationGuard.cancelNavigation}>
                继续编辑
              </Button>
              <Button variant="destructive" onClick={navigationGuard.confirmNavigation}>
                放弃更改并离开
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DatasetDetailShell>
    </AppFrame>
  )
}
