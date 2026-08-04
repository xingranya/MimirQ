'use client'

import { useState, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { SearchInput } from '@/components/ui/search-input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  promptTemplateApi,
  PromptTemplate,
  PromptTemplateCreate,
} from '@/lib/api'
import {
  Plus,
  Edit,
  Trash2,
  Copy,
  Check,
  X,
  Eye,
  Wand2,
  MessageSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'
import { NavigationVisibilityGate } from '@/components/auth/navigation-visibility-gate'
import { KgExtractPromptSettings } from '@/components/kg-extract-prompt-settings'
import { KgPredicateOntologySettings } from '@/components/kg-predicate-ontology-settings'
import { AppFrame } from '@/components/app-frame'
import { AnalysisPageShell } from '@/components/ui/analysis-page-shell'
import { cn } from '@/lib/utils'
import { formatApiError } from '@/lib/api-errors'
import { reportClientError } from '@/lib/client-logging'
import { queryKeys } from '@/lib/query-keys'
import { EmptyState } from '@/components/ui/empty-state'
import { PageSkeleton } from '@/components/ui/page-skeleton'

// 场景分类与内置提示词的 category 字段保持一致。
const SCENARIO_DEFINITIONS: Array<{
  value: string
  label: string
  match: (category: string | null | undefined) => boolean
}> = [
  { value: 'all', label: '全部', match: () => true },
  {
    value: 'rag_answer',
    label: '问答',
    match: (c) => c === 'rag_answer',
  },
  {
    value: 'rag_query_rewrite',
    label: '查询改写',
    match: (c) => c === 'rag_query_rewrite',
  },
  {
    value: 'rag_post_retrieval',
    label: '后处理',
    match: (c) => c === 'rag_post_retrieval',
  },
  {
    value: 'kg',
    label: '图谱',
    match: (c) =>
      c === 'kg_extract' ||
      c === 'kg_canonicalize' ||
      c === 'kg_verbalize',
  },
  {
    value: 'chunk_meta',
    label: '分块元数据',
    match: (c) => c === 'chunk_meta',
  },
  {
    value: 'evaluation',
    label: '评测',
    match: (c) => c === 'llm_judge' || c === 'testset_generation',
  },
  {
    value: 'vertical',
    label: '行业',
    match: (c) => typeof c === 'string' && c.startsWith('vertical_'),
  },
]

const CATEGORY_LABELS: Record<string, string> = {
  rag_answer: '问答',
  rag_query_rewrite: '查询改写',
  rag_post_retrieval: '检索后处理',
  kg_extract: '图谱抽取',
  kg_canonicalize: '实体规范化',
  kg_verbalize: '图谱表述',
  chunk_meta: '分块元数据',
  llm_judge: '模型评审',
  testset_generation: '测试集生成',
}

function getCategoryLabel(category: string | null | undefined): string {
  const value = String(category || '').trim()
  if (!value) return '未分类'
  return CATEGORY_LABELS[value] || value
}

function getVisiblePageNumbers(currentPage: number, totalPages: number): number[] {
  const count = Math.min(5, totalPages)
  const start = Math.min(
    Math.max(1, currentPage - Math.floor(count / 2)),
    Math.max(1, totalPages - count + 1)
  )
  return Array.from({ length: count }, (_, index) => start + index)
}

export default function PromptsPage() {
  return (
    <NavigationVisibilityGate moduleKey="prompts" pageName="提示词">
      <PromptsPageContent />
    </NavigationVisibilityGate>
  )
}

function PromptsPageContent() {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<PromptTemplate | null>(
    null
  )
  const [previewTemplate, setPreviewTemplate] = useState<PromptTemplate | null>(
    null
  )
  const [deleteTemplateTarget, setDeleteTemplateTarget] =
    useState<PromptTemplate | null>(null)

  // 批量选择。
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // 筛选和搜索。
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [scenarioFilter, setScenarioFilter] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [syncingBuiltins, setSyncingBuiltins] = useState(false)
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [batchAction, setBatchAction] = useState<
    'activate' | 'deactivate' | 'delete' | null
  >(null)

  // 表单草稿。
  const [formData, setFormData] = useState<PromptTemplateCreate>({
    name: '',
    description: '',
    content: '',
    variables: [],
    category: '',
    tags: [],
    is_active: true,
  })

  const templatesQuery = useQuery<PromptTemplate[]>({
    queryKey: queryKeys.prompts.list({ exhaustive: true }),
    queryFn: () => promptTemplateApi.listAll(),
  })
  const templates = useMemo(
    () => templatesQuery.data ?? [],
    [templatesQuery.data]
  )
  const loading = templatesQuery.isLoading
  const templateLoadError = templatesQuery.error
    ? formatApiError(templatesQuery.error, '加载提示词模板失败')
    : ''

  const refreshTemplates = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.prompts.all })

  // 当前租户下已使用的分类。
  const categories = useMemo(() => {
    const cats = new Set(
      templates
        .map((t) => t.category)
        .filter(
          (cat): cat is string =>
            typeof cat === 'string' && cat.trim().length > 0
        )
    )
    return Array.from(cats)
  }, [templates])

  // 按搜索、场景、分类和状态筛选。
  const filteredTemplates = useMemo(() => {
    return templates.filter((template) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const matchesSearch =
          template.name.toLowerCase().includes(query) ||
          template.description?.toLowerCase().includes(query) ||
          template.content.toLowerCase().includes(query) ||
          template.tags.some((tag) => tag.toLowerCase().includes(query))
        if (!matchesSearch) return false
      }

      if (scenarioFilter !== 'all') {
        const def = SCENARIO_DEFINITIONS.find(
          (d) => d.value === scenarioFilter
        )
        if (def && !def.match(template.category)) return false
      }

      if (categoryFilter !== 'all' && template.category !== categoryFilter) {
        return false
      }

      if (statusFilter === 'active' && !template.is_active) return false
      if (statusFilter === 'inactive' && template.is_active) return false

      return true
    })
  }, [templates, searchQuery, scenarioFilter, categoryFilter, statusFilter])

  // 每个场景的模板数量。
  const scenarioCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const def of SCENARIO_DEFINITIONS) {
      counts[def.value] = templates.filter((t) =>
        def.match(t.category)
      ).length
    }
    return counts
  }, [templates])

  const activeCount = useMemo(
    () => templates.filter((template) => template.is_active).length,
    [templates]
  )
  const inactiveCount = templates.length - activeCount
  const pendingValidationCount = useMemo(
    () => templates.filter((template) => template.usage_count === 0).length,
    [templates]
  )
  const totalPages = Math.max(1, Math.ceil(filteredTemplates.length / pageSize))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const paginatedTemplates = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize
    return filteredTemplates.slice(start, start + pageSize)
  }, [filteredTemplates, pageSize, safeCurrentPage])
  const currentPageIds = useMemo(
    () =>
      paginatedTemplates
        .filter((template) => !template.is_system)
        .map((template) => template.id),
    [paginatedTemplates]
  )
  const allCurrentPageSelected =
    currentPageIds.length > 0 &&
    currentPageIds.every((id) => selectedIds.has(id))

  const activeStatusBadgeClass =
    'rounded-md border-info/30 bg-info/10 text-info'
  const inactiveStatusBadgeClass =
    'rounded-md border-border bg-muted/50 text-muted-foreground'

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, scenarioFilter, categoryFilter, statusFilter, pageSize])

  useEffect(() => {
    const writableIds = new Set(
      templates
        .filter((template) => !template.is_system)
        .map((template) => template.id)
    )
    setSelectedIds((previous) => {
      const next = new Set(
        Array.from(previous).filter((id) => writableIds.has(id))
      )
      return next.size === previous.size ? previous : next
    })
  }, [templates])

  const formatDateTime = (value?: string) => {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '-'
    const pad = (part: number) => String(part).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
  }

  // 批量选择。
  const handleSelectAll = () => {
    if (allCurrentPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const id of currentPageIds) next.delete(id)
        return next
      })
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const id of currentPageIds) next.add(id)
        return next
      })
    }
  }

  const handleSelectOne = (id: string) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return

    setBatchAction('delete')
    try {
      await Promise.all(
        Array.from(selectedIds).map((id) => promptTemplateApi.delete(id))
      )
      toast.success(`已删除 ${selectedIds.size} 个模板`)
      setSelectedIds(new Set())
      await refreshTemplates()
    } catch (error) {
      toast.error(formatApiError(error, '批量删除失败'))
      reportClientError('Failed to batch delete prompt templates', error)
    } finally {
      setBatchAction(null)
    }
  }

  const handleBatchActivate = async (activate: boolean) => {
    if (selectedIds.size === 0) return

    setBatchAction(activate ? 'activate' : 'deactivate')
    try {
      await Promise.all(
        Array.from(selectedIds).map((id) =>
          promptTemplateApi.update(id, { is_active: activate })
        )
      )
      toast.success(
        `已${activate ? '启用' : '停用'} ${selectedIds.size} 个模板`
      )
      setSelectedIds(new Set())
      await refreshTemplates()
    } catch (error) {
      toast.error(formatApiError(error, '批量操作失败'))
      reportClientError('Failed to batch update prompt templates', error)
    } finally {
      setBatchAction(null)
    }
  }

  const handleCreate = () => {
    setEditingTemplate(null)
    setFormData({
      name: '',
      description: '',
      content: '',
      variables: [],
      category: '',
      tags: [],
      is_active: true,
    })
    setDialogOpen(true)
  }

  const handleEdit = (template: PromptTemplate) => {
    setEditingTemplate(template)
    setFormData({
      name: template.name,
      description: template.description || '',
      content: template.content,
      variables: template.variables,
      category: template.category || '',
      tags: template.tags,
      is_active: template.is_active,
    })
    setDialogOpen(true)
  }

  const handlePreview = (template: PromptTemplate) => {
    setPreviewTemplate(template)
    setPreviewDialogOpen(true)
  }

  const handleSave = async () => {
    const name = formData.name.trim()
    const content = formData.content.trim()
    if (!name || !content) {
      toast.error('请填写模板名称和内容')
      return
    }

    const payload: PromptTemplateCreate = {
      ...formData,
      name,
      content,
      description: formData.description?.trim() || '',
      category: formData.category?.trim() || '',
      variables: Array.from(
        new Set((formData.variables || []).map((item) => item.trim()).filter(Boolean))
      ),
      tags: Array.from(
        new Set((formData.tags || []).map((item) => item.trim()).filter(Boolean))
      ),
    }

    setSavingTemplate(true)
    try {
      if (editingTemplate) {
        await promptTemplateApi.update(editingTemplate.id, payload)
        toast.success('模板已更新')
      } else {
        await promptTemplateApi.create(payload)
        toast.success('模板已创建')
      }
      setDialogOpen(false)
      await refreshTemplates()
    } catch (error) {
      toast.error(formatApiError(error, '保存失败'))
      reportClientError('Failed to save prompt template', error)
    } finally {
      setSavingTemplate(false)
    }
  }

  const handleDelete = async (template: PromptTemplate) => {
    try {
      await promptTemplateApi.delete(template.id)
      toast.success('模板已删除')
      await refreshTemplates()
    } catch (error) {
      toast.error(formatApiError(error, '删除失败'))
      reportClientError('Failed to delete prompt template', error)
    }
  }

  const handleDuplicate = async (template: PromptTemplate) => {
    try {
      await promptTemplateApi.duplicate(template.id)
      toast.success('模板已复制')
      await refreshTemplates()
    } catch (error) {
      toast.error(formatApiError(error, '复制失败'))
      reportClientError('Failed to duplicate prompt template', error)
    }
  }

  const handleToggleActive = async (template: PromptTemplate) => {
    try {
      await promptTemplateApi.update(template.id, {
        is_active: !template.is_active,
      })
      toast.success(template.is_active ? '模板已停用' : '模板已启用')
      await refreshTemplates()
    } catch (error) {
      toast.error(formatApiError(error, '更新失败'))
      reportClientError('Failed to toggle prompt template active state', error)
    }
  }

  const handleSyncBuiltins = async () => {
    setSyncingBuiltins(true)
    try {
      const result = await promptTemplateApi.syncBuiltins()
      toast.success(`内置模板已同步：新增 ${result.created}，更新 ${result.updated}`)
      await refreshTemplates()
    } catch (error) {
      toast.error(formatApiError(error, '同步内置模板失败'))
      reportClientError('Failed to sync builtin prompt templates', error)
    } finally {
      setSyncingBuiltins(false)
    }
  }

  return (
    <AppFrame>
      <AnalysisPageShell
        title="提示词模板"
        icon={Wand2}
        iconImage="prompts"
        iconColor="text-primary"
        description="管理对话、图谱和评测使用的提示词模板。"
        size="full"
        actions={
          <Button
            onClick={handleCreate}
            className="h-10 gap-2 rounded-md px-4 text-sm font-semibold"
          >
            <Plus className="size-4" aria-hidden="true" />
            创建模板
          </Button>
        }
        bodyGutter="none"
        bodyClassName="!pb-0"
        bodyContainerClassName="max-w-none"
      >
        <div className="min-h-0 space-y-4 bg-transparent px-4 pb-4 md:px-6">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>共 {templates.length} 个模板</span>
            <span>{activeCount} 个已启用</span>
            <span>{inactiveCount} 个已停用</span>
            <span>{pendingValidationCount} 个尚未使用</span>
          </div>
          <Tabs
            value={scenarioFilter}
            onValueChange={setScenarioFilter}
            className="w-full"
          >
            <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-md border border-border bg-muted/30 p-1">
              {SCENARIO_DEFINITIONS.map((def) => (
                <TabsTrigger
                  key={def.value}
                  value={def.value}
                  className="h-9 gap-1.5 rounded-sm px-3 text-sm font-medium data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:ring-1 data-[state=active]:ring-border"
                >
                  <span>{def.label}</span>
                  <Badge
                    variant="secondary"
                    className="h-5 min-w-6 justify-center rounded-sm bg-muted px-1.5 text-xs font-semibold text-muted-foreground data-[active=true]:bg-primary/10 data-[active=true]:text-primary"
                    data-active={scenarioFilter === def.value}
                  >
                    {scenarioCounts[def.value] ?? 0}
                  </Badge>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <section className="border-y border-border bg-background">
            <div className="flex flex-col gap-3 border-b border-border py-4 xl:flex-row xl:items-center">
              <SearchInput
                value={searchQuery}
                onValueChange={setSearchQuery}
                placeholder="搜索模板名称、描述、内容或标签..."
                containerClassName="min-w-0 flex-1"
                inputClassName="h-10 rounded-md border-border bg-background text-sm"
              />
              <div className="grid grid-cols-2 gap-3 md:flex md:items-center">
                <Select
                  value={categoryFilter}
                  onValueChange={setCategoryFilter}
                >
                  <SelectTrigger className="h-10 w-full rounded-md border-border bg-background text-sm md:w-[160px]">
                    <SelectValue placeholder="所有分类" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">所有分类</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {getCategoryLabel(cat)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-10 w-full rounded-md border-border bg-background text-sm md:w-[150px]">
                    <SelectValue placeholder="所有状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">所有状态</SelectItem>
                    <SelectItem value="active">已启用</SelectItem>
                    <SelectItem value="inactive">已停用</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSyncBuiltins}
                  disabled={syncingBuiltins}
                  className="h-10 gap-1.5 rounded-md border-border bg-background px-3 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60"
                >
                  <Wand2 className="size-4" />
                  {syncingBuiltins ? '同步中' : '同步内置模板'}
                </Button>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="group h-10 justify-between rounded-md border-border bg-background px-3 text-left text-sm text-foreground shadow-none hover:bg-muted data-[state=open]:border-primary/40 md:w-[220px]"
                    >
                      <span className="mr-2 flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Wand2 className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">
                        图谱场景配置
                      </span>
                      <ChevronDown className="ml-2 size-4 shrink-0 text-muted-foreground/70 transition-transform group-data-[state=open]:rotate-180 group-data-[state=open]:text-primary" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    className="max-h-[76vh] w-[min(520px,calc(100vw-2rem))] overflow-y-auto rounded-md border-border bg-background p-0 shadow-md"
                  >
                    <div className="border-b border-border bg-background px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-foreground">
                            图谱场景配置
                          </div>
                          <div className="mt-1 text-xs leading-5 text-muted-foreground">
                            为图谱抽取和关系治理选择提示词模板。
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground">高级设置</span>
                      </div>
                    </div>
                    <div className="space-y-3 bg-background p-3">
                      <KgExtractPromptSettings templates={templates} />
                      <KgPredicateOntologySettings />
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {selectedIds.size > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-info/20 bg-info/5 px-3 py-2.5 md:px-4">
                <div className="flex items-center gap-2">
                  <Checkbox checked={true} onCheckedChange={handleSelectAll} />
                  <span className="text-xs font-medium text-info">
                    已选择 {selectedIds.size} 个模板
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-md border-info/30 bg-background px-2.5 text-xs text-info hover:bg-info/10"
                    onClick={() => handleBatchActivate(true)}
                    disabled={batchAction !== null}
                  >
                    {batchAction === 'activate' ? '启用中' : '批量启用'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-md border-border bg-background px-2.5 text-xs text-foreground hover:bg-muted"
                    onClick={() => handleBatchActivate(false)}
                    disabled={batchAction !== null}
                  >
                    {batchAction === 'deactivate' ? '停用中' : '批量停用'}
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-8 rounded-md px-2.5 text-xs"
                        disabled={batchAction !== null}
                      >
                        <Trash2 className="mr-1 size-3" />
                        批量删除
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>批量删除模板？</AlertDialogTitle>
                        <AlertDialogDescription>
                          你将删除{' '}
                          <span className="font-mono">{selectedIds.size}</span>{' '}
                          个提示词模板。此操作不可撤销。
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleBatchDelete}
                          disabled={batchAction !== null}
                        >
                          {batchAction === 'delete' ? '删除中' : '删除'}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ) : null}

            {(() => {
              if (loading) {
                return <PageSkeleton className="py-8" />
              }

              if (templateLoadError) {
                return (
                  <EmptyState
                    icon={MessageSquare}
                    title="提示词模板加载失败"
                    description={templateLoadError}
                  >
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 rounded-md"
                      onClick={() => templatesQuery.refetch()}
                    >
                      <RefreshCw className="mr-2 size-4" aria-hidden="true" />
                      重新加载
                    </Button>
                  </EmptyState>
                )
              }

              if (filteredTemplates.length === 0) {
                return (
                  <EmptyState
                    icon={MessageSquare}
                    title="暂无提示词模板"
                    description={
                      templates.length === 0
                        ? '还没有创建任何提示词模板。'
                        : '没有找到匹配的模板，请尝试调整筛选条件。'
                    }
                  >
                    {templates.length === 0 ? (
                      <Button
                        onClick={handleCreate}
                        className="h-9 rounded-md bg-primary px-3 text-xs text-primary-foreground hover:bg-primary/90"
                      >
                        <Plus className="mr-2 size-4" />
                        创建第一个模板
                      </Button>
                    ) : null}
                  </EmptyState>
                )
              }

              return (
                <>
                  <div>
                    <div>
                      <div className="grid grid-cols-[32px_minmax(0,1fr)] items-center gap-x-2 border-b border-border bg-muted/40 px-3 py-3 text-xs font-semibold text-muted-foreground lg:grid-cols-[40px_minmax(220px,1fr)_90px_64px_130px_136px_184px] lg:px-4">
                        <Checkbox
                          checked={allCurrentPageSelected}
                          onCheckedChange={handleSelectAll}
                        />
                        <div>模板</div>
                        <div className="hidden lg:block">分类</div>
                        <div className="hidden lg:block">使用</div>
                        <div className="hidden lg:block">变量</div>
                        <div className="hidden lg:block">更新时间</div>
                        <div className="hidden lg:block">操作</div>
                      </div>
                      <div className="max-h-[calc(100vh-360px)] divide-y divide-border overflow-y-auto">
                        {paginatedTemplates.map((template) => (
                          <div
                            key={template.id}
                            className={cn(
                              'grid grid-cols-[32px_minmax(0,1fr)] items-center gap-x-2 gap-y-2 px-3 py-3 text-sm transition-colors hover:bg-muted/40 lg:grid-cols-[40px_minmax(220px,1fr)_90px_64px_130px_136px_184px] lg:px-4',
                              selectedIds.has(template.id) && 'bg-info/5'
                            )}
                          >
                            <div>
                              <Checkbox
                                checked={selectedIds.has(template.id)}
                                disabled={template.is_system}
                                onCheckedChange={() =>
                                  handleSelectOne(template.id)
                                }
                                aria-label={
                                  template.is_system
                                    ? `${template.name} 是系统模板，不能批量操作`
                                    : `选择模板 ${template.name}`
                                }
                              />
                            </div>
                            <button
                              type="button"
                              className="min-w-0 text-left"
                              onClick={() => handlePreview(template)}
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="truncate font-semibold text-foreground">
                                  {template.name}
                                </span>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    'h-5 px-1.5 text-xs',
                                    template.is_active
                                      ? activeStatusBadgeClass
                                      : inactiveStatusBadgeClass
                                  )}
                                >
                                  {template.is_active ? '启用' : '停用'}
                                </Badge>
                              </div>
                              <div className="mt-1 truncate text-xs text-muted-foreground">
                                {template.description || '无描述'}
                              </div>
                            </button>
                            <div className="hidden text-muted-foreground lg:block">
                              {getCategoryLabel(template.category)}
                            </div>
                            <div className="hidden tabular-nums text-muted-foreground lg:block">
                              {template.usage_count}
                            </div>
                            <div className="hidden min-w-0 flex-wrap gap-1 lg:flex">
                              {template.variables.length > 0 ? (
                                <>
                                  {template.variables
                                    .slice(0, 2)
                                    .map((variable) => (
                                      <Badge
                                        key={variable}
                                        variant="secondary"
                                        className="h-6 rounded-md bg-muted px-2 font-mono text-xs font-medium text-foreground/85"
                                      >
                                        {`{${variable}}`}
                                      </Badge>
                                    ))}
                                  {template.variables.length > 2 ? (
                                    <span className="text-xs text-muted-foreground/70">
                                      +{template.variables.length - 2}
                                    </span>
                                  ) : null}
                                </>
                              ) : (
                                <span className="text-muted-foreground/70">-</span>
                              )}
                            </div>
                            <div className="hidden tabular-nums text-muted-foreground lg:block">
                              {formatDateTime(template.updated_at)}
                            </div>
                            <div className="col-start-2 flex flex-wrap items-center gap-1.5 lg:col-start-auto">
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-8 w-8 rounded-md border-border"
                                onClick={() => handlePreview(template)}
                                aria-label={`预览模板 ${template.name}`}
                                title="预览"
                              >
                                <Eye className="size-4" aria-hidden="true" />
                              </Button>
                              {template.is_system ? null : (
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="h-8 w-8 rounded-md border-border"
                                  onClick={() => handleEdit(template)}
                                  aria-label={`编辑模板 ${template.name}`}
                                  title="编辑"
                                >
                                  <Edit className="size-4" aria-hidden="true" />
                                </Button>
                              )}
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-8 w-8 rounded-md border-border"
                                onClick={() => handleDuplicate(template)}
                                aria-label={`复制模板 ${template.name}`}
                                title="复制"
                              >
                                <Copy className="size-4" aria-hidden="true" />
                              </Button>
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-8 w-8 rounded-md border-border"
                                onClick={() => handleToggleActive(template)}
                                aria-label={`${template.is_active ? '停用' : '启用'}模板 ${template.name}`}
                                title={template.is_active ? '停用' : '启用'}
                              >
                                {template.is_active ? (
                                  <X className="size-4" aria-hidden="true" />
                                ) : (
                                  <Check className="size-4" aria-hidden="true" />
                                )}
                              </Button>
                              {template.is_system ? null : (
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="h-8 w-8 rounded-md border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                  onClick={() =>
                                    setDeleteTemplateTarget(template)
                                  }
                                  aria-label={`删除模板 ${template.name}`}
                                  title="删除"
                                >
                                  <Trash2 className="size-4" aria-hidden="true" />
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 border-t border-border px-3 py-3 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between md:px-4">
                    <div>共 {filteredTemplates.length} 条</div>
                    <div className="flex flex-wrap items-center justify-end gap-3">
                      <Select
                        value={String(pageSize)}
                        onValueChange={(value) => setPageSize(Number(value))}
                      >
                      <SelectTrigger className="h-9 w-[112px] rounded-md border-border bg-background text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[10, 20, 50].map((size) => (
                            <SelectItem key={size} value={String(size)}>
                              {size} 条/页
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 w-9 rounded-lg border-border p-0"
                        aria-label="上一页"
                        title="上一页"
                        disabled={safeCurrentPage <= 1}
                        onClick={() =>
                          setCurrentPage((page) => Math.max(1, page - 1))
                        }
                      >
                        <ChevronLeft className="size-4" />
                      </Button>
                      {getVisiblePageNumbers(safeCurrentPage, totalPages).map((page) => (
                        <Button
                          key={page}
                          variant={
                            safeCurrentPage === page ? 'default' : 'outline'
                          }
                          size="sm"
                          className={cn(
                            'h-9 w-9 rounded-md p-0 text-sm',
                            safeCurrentPage === page
                              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                              : 'border-border bg-card text-muted-foreground'
                          )}
                          onClick={() => setCurrentPage(page)}
                        >
                          {page}
                        </Button>
                      ))}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 w-9 rounded-lg border-border p-0"
                        aria-label="下一页"
                        title="下一页"
                        disabled={safeCurrentPage >= totalPages}
                        onClick={() =>
                          setCurrentPage((page) =>
                            Math.min(totalPages, page + 1)
                          )
                        }
                      >
                        <ChevronRight className="size-4" />
                      </Button>
                      <span>前往</span>
                      <Input
                        type="number"
                        min={1}
                        max={totalPages}
                        aria-label="页码"
                        value={String(safeCurrentPage)}
                        onChange={(event) => {
                          const value = Number(event.target.value)
                          if (
                            Number.isFinite(value) &&
                            value >= 1 &&
                            value <= totalPages
                          )
                            setCurrentPage(value)
                        }}
                        className="h-9 w-16 rounded-md border-border text-center text-sm"
                      />
                      <span>页</span>
                    </div>
                  </div>
                </>
              )
            })()}
          </section>
        </div>

        <AlertDialog
          open={Boolean(deleteTemplateTarget)}
          onOpenChange={(open) => {
            if (!open) setDeleteTemplateTarget(null)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>删除模板？</AlertDialogTitle>
              <AlertDialogDescription>
                你将删除提示词模板{' '}
                <span className="font-mono">
                  {deleteTemplateTarget?.name || '-'}
                </span>
                <span>。此操作不可撤销。</span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  const target = deleteTemplateTarget
                  setDeleteTemplateTarget(null)
                  if (target) void handleDelete(target)
                }}
              >
                删除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* 模板预览。 */}
        <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
          <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto overscroll-contain rounded-md border border-border bg-background no-scrollbar">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {previewTemplate?.name}
                {previewTemplate?.is_system && (
                  <Badge variant="secondary">系统</Badge>
                )}
                {previewTemplate?.is_active ? (
                  <Badge
                    variant="outline"
                    className={cn('h-5 text-xs', activeStatusBadgeClass)}
                  >
                    <Check className="mr-1 size-3" />
                    启用
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className={cn('h-5 text-xs', inactiveStatusBadgeClass)}
                  >
                    <X className="mr-1 size-3" />
                    停用
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription>
                {previewTemplate?.description || '无描述'}
              </DialogDescription>
            </DialogHeader>

            {previewTemplate && (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label className="text-sm font-medium">分类</Label>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {getCategoryLabel(previewTemplate.category)}
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">使用次数</Label>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {previewTemplate.usage_count}
                    </p>
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-medium">支持的变量</Label>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {previewTemplate.variables.length > 0 ? (
                      previewTemplate.variables.map((v) => (
                        <Badge key={v} variant="secondary">
                          {`{${v}}`}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground">无</span>
                    )}
                  </div>
                </div>

                {previewTemplate.tags.length > 0 && (
                  <div>
                    <Label className="text-sm font-medium">标签</Label>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {previewTemplate.tags.map((tag) => (
                        <Badge key={tag} variant="outline">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <Label className="text-sm font-medium">模板内容</Label>
                  <div className="mt-2 rounded-md bg-muted/60 p-4">
                    <pre className="whitespace-pre-wrap font-mono text-sm">
                      {previewTemplate.content}
                    </pre>
                  </div>
                </div>
              </div>
            )}

            <DialogFooter>
              {previewTemplate && !previewTemplate.is_system && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setPreviewDialogOpen(false)
                    handleEdit(previewTemplate)
                  }}
                >
                  <Edit className="mr-2 h-4 w-4" />
                  编辑
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => setPreviewDialogOpen(false)}
              >
                关闭
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 创建或编辑模板。 */}
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            if (!savingTemplate) setDialogOpen(open)
          }}
        >
          <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto overscroll-contain rounded-md border border-border bg-background no-scrollbar">
            <DialogHeader>
              <DialogTitle className="text-base font-semibold">
                {editingTemplate ? '编辑模板' : '创建新模板'}
              </DialogTitle>
              <DialogDescription>
                可在模板中使用 {'{context}'}、{'{question}'}、{'{history}'} 等变量。
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label htmlFor="name">名称（必填）</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="例如：法律顾问助手"
                  className="h-10 rounded-md"
                />
              </div>

              <div>
                <Label htmlFor="description">描述</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="简要说明模板用途"
                  className="h-10 rounded-md"
                />
              </div>

              <div>
                <Label htmlFor="category">分类标识</Label>
                <Input
                  id="category"
                  value={formData.category}
                  onChange={(e) =>
                    setFormData({ ...formData, category: e.target.value })
                  }
                  placeholder="例如：rag_answer"
                  className="h-10 rounded-md"
                />
              </div>

              <div>
                <Label htmlFor="content">模板内容（必填）</Label>
                <Textarea
                  id="content"
                  value={formData.content}
                  onChange={(e) =>
                    setFormData({ ...formData, content: e.target.value })
                  }
                  placeholder="输入提示词内容，可使用 {context}、{question}、{history} 等变量"
                  className="min-h-[300px] rounded-md font-mono text-sm"
                />
              </div>

              <div>
                <Label htmlFor="variables">支持的变量（用逗号分隔）</Label>
                <Input
                  id="variables"
                  value={formData.variables?.join(', ')}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      variables: e.target.value
                        .split(',')
                        .map((v) => v.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="context, question, history"
                  className="h-10 rounded-md"
                />
              </div>

              <div>
                <Label htmlFor="tags">标签（用逗号分隔）</Label>
                <Input
                  id="tags"
                  value={formData.tags?.join(', ')}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      tags: e.target.value
                        .split(',')
                        .map((t) => t.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="专业, 简洁, 正式"
                  className="h-10 rounded-md"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={savingTemplate}
              >
                取消
              </Button>
              <Button
                onClick={handleSave}
                disabled={
                  savingTemplate ||
                  !formData.name.trim() ||
                  !formData.content.trim()
                }
              >
                {savingTemplate ? (
                  <Loader2
                    className="mr-2 size-4 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                ) : null}
                {savingTemplate ? '保存中' : '保存'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AnalysisPageShell>
    </AppFrame>
  )
}
