/** 数据集基准样本管理组件。 */

'use client'

import {
  useMemo,
  useRef,
  useState,
  useEffect,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { evaluationApi, ragApi } from '@/lib/api'
import type {
  Citation,
  RegressionCase,
  RegressionCaseCreate,
  RegressionReferenceSource,
} from '@/types'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Search,
  Trash2,
  Plus,
  Loader2,
  CheckSquare,
  Square,
  Tag,
  Calendar,
  FileText,
  Upload,
  Star,
} from 'lucide-react'
import { toast } from 'sonner'
import { toTrimmedPrimitiveString } from '@/lib/primitive-text'
import { cn, detachPromise } from '@/lib/utils'
import { formatApiError } from '@/lib/api-errors'
import { resolveEvidencePackDataset } from '@/lib/evaluation-evidence-pack'
import { queryKeys } from '@/lib/query-keys'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface TestCaseManagerProps {
  datasetId?: string | null
  onRunTests?: (caseIds: string[]) => void
  onCaseSelected?: (caseId: string | null) => void
  dense?: boolean
}

const REGRESSION_CASE_PAGE_LIMIT = 200
const REGRESSION_CASE_FETCH_MAX = 1000
const EVIDENCE_PACK_MAX_BYTES = 5 * 1024 * 1024

type EvidencePackDraft = {
  dataset_id?: string
  query?: string
  query_for_retrieval?: string
  metrics?: Record<string, unknown> | null
  citations?: Citation[]
  exported_at?: string
  source?: 'retrieve_preview' | 'evidence_pack'
  has_evidence?: boolean | null
  abstain_triggered?: boolean | null
  abstain_reason?: string | null
  selected_chunk_ids?: unknown[]
  [key: string]: unknown
}

type TestCaseRowProps = {
  caseItem: RegressionCase
  isSelected: boolean
  isChecked: boolean
  isGolden: boolean
  dense?: boolean
  onSelectCase: (caseItem: RegressionCase) => void
  onToggleSelect: (caseId: string) => void
  onToggleGolden: (caseItem: RegressionCase) => Promise<void>
  onDelete: (caseId: string) => Promise<void>
}

const GOLDEN_TAG = 'golden'
const GOLDEN_DRAFT_TAG = 'golden_draft'
const TEST_CASE_TAG_LABELS: Readonly<Record<string, string>> = {
  [GOLDEN_TAG]: '基准',
  [GOLDEN_DRAFT_TAG]: '基准草稿',
  from_retrieval_preview: '检索结果',
  evidence_pack: '证据包',
}

function isGoldenCase(caseItem: RegressionCase): boolean {
  const tags = Array.isArray(caseItem.tags) ? caseItem.tags : []
  return tags.includes(GOLDEN_TAG) || tags.includes(GOLDEN_DRAFT_TAG)
}

function testCaseTagLabel(tag: string): string {
  return TEST_CASE_TAG_LABELS[tag] || tag
}

function TestCaseRow({
  caseItem,
  isSelected,
  isChecked,
  isGolden,
  dense = false,
  onSelectCase,
  onToggleSelect,
  onToggleGolden,
  onDelete,
}: Readonly<TestCaseRowProps>) {
  const handleSelect = () => {
    onSelectCase(caseItem)
  }

  const handleToggleSelect = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    onToggleSelect(caseItem.id)
  }

  const handleToggleGolden = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    detachPromise(onToggleGolden(caseItem))
  }

  const hasManualGolden =
    Array.isArray(caseItem.tags) && caseItem.tags.includes(GOLDEN_TAG)
  const hasDraftGolden =
    Array.isArray(caseItem.tags) && caseItem.tags.includes(GOLDEN_DRAFT_TAG)
  const goldenActionLabel = hasManualGolden
    ? hasDraftGolden
      ? '取消人工确认，保留基准草稿'
      : '移出基准样本'
    : isGolden
      ? '确认为基准样本'
      : '设为基准样本'

  const handleDeleteConfirm = () => {
    detachPromise(onDelete(caseItem.id))
  }

  return (
    <div
      className={cn(
        'border-b border-border transition-colors last:border-b-0 hover:bg-muted/30 motion-reduce:transition-none',
        dense ? 'px-3 py-3' : 'px-4 py-3',
        isSelected && 'bg-primary/5'
      )}
    >
      <div className="flex items-start gap-2 sm:gap-3">
        <button
          type="button"
          onClick={handleToggleSelect}
          className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={isChecked ? '取消选择评测样本' : '选择评测样本'}
        >
          {isChecked ? (
            <CheckSquare className="size-4 text-primary" aria-hidden="true" />
          ) : (
            <Square className="size-4" aria-hidden="true" />
          )}
        </button>

        <button
          type="button"
          className="min-w-0 flex-1 rounded-md px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={handleSelect}
        >
          <div className="line-clamp-2 text-sm font-medium leading-6 text-foreground">
            {caseItem.question}
          </div>

          {caseItem.expected_answer ? (
            <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              标准答案：{caseItem.expected_answer}
            </div>
          ) : null}

          {caseItem.tags && caseItem.tags.length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {caseItem.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                >
                  <Tag className="size-3" aria-hidden="true" />
                  {testCaseTagLabel(tag)}
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="size-3.5" aria-hidden="true" />
              {new Date(caseItem.created_at).toLocaleDateString()}
            </span>
            {caseItem.document_ids?.length ? (
              <span className="flex items-center gap-1">
                <FileText className="size-3.5" aria-hidden="true" />
                {caseItem.document_ids.length} 文档
              </span>
            ) : null}
            {caseItem.reference_sources?.length ? (
              <span className="flex items-center gap-1">
                <Star className="size-3.5" aria-hidden="true" />
                标准证据 {caseItem.reference_sources.length}
              </span>
            ) : null}
          </div>
        </button>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={handleToggleGolden}
            className={cn(
              'flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isGolden && 'text-warning hover:text-warning'
            )}
            aria-label={goldenActionLabel}
            title={goldenActionLabel}
          >
            <Star
              className="size-4"
              fill={isGolden ? 'currentColor' : 'none'}
              aria-hidden="true"
            />
          </button>

          <ConfirmDialog
            title="删除该评测样本？"
            description="删除后无法恢复。"
            confirmLabel="删除"
            cancelLabel="返回"
            confirmVariant="destructive"
            onConfirm={handleDeleteConfirm}
          >
            <button
              type="button"
              className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="删除评测样本"
              title="删除"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </ConfirmDialog>
        </div>
      </div>
    </div>
  )
}

export function TestCaseManager({
  datasetId,
  onRunTests,
  onCaseSelected,
  dense = false,
}: Readonly<TestCaseManagerProps>) {
  const queryClient = useQueryClient()
  const onCaseSelectedRef = useRef(onCaseSelected)
  const datasetIdRef = useRef(datasetId)

  const [searchQuery, setSearchQuery] = useState('')
  const [goldenOnly, setGoldenOnly] = useState(false)
  const [selectedCaseIds, setSelectedCaseIds] = useState<Set<string>>(new Set())
  const [selectedCase, setSelectedCase] = useState<RegressionCase | null>(null)

  // 创建用例的状态
  const [isCreating, setIsCreating] = useState(false)
  const [newQuestion, setNewQuestion] = useState('')
  const [newExpectedAnswer, setNewExpectedAnswer] = useState('')

  // 证据包导入后可直接生成回归样本。
  const evidenceFileInputRef = useRef<HTMLInputElement>(null)
  const [evidenceDialogOpen, setEvidenceDialogOpen] = useState(false)
  const [evidencePack, setEvidencePack] = useState<EvidencePackDraft | null>(
    null
  )
  const [evidenceLoading, setEvidenceLoading] = useState(false)
  const [evidenceQuestion, setEvidenceQuestion] = useState('')
  const [evidenceExpectedAnswer, setEvidenceExpectedAnswer] = useState('')
  const [evidenceSelectedChunkIds, setEvidenceSelectedChunkIds] = useState<
    Set<string>
  >(new Set())
  const [evidenceCreating, setEvidenceCreating] = useState(false)

  useEffect(() => {
    onCaseSelectedRef.current = onCaseSelected
  }, [onCaseSelected])

  useEffect(() => {
    datasetIdRef.current = datasetId
  }, [datasetId])

  const evidenceCitations = useMemo(() => {
    const items = evidencePack?.citations
    return Array.isArray(items) ? items : []
  }, [evidencePack])

  const evidenceDatasetId = useMemo(() => {
    const resolution = resolveEvidencePackDataset(
      datasetId,
      evidencePack?.dataset_id
    )
    return resolution.ok ? resolution.datasetId : ''
  }, [datasetId, evidencePack])

  const regressionCaseParams = useMemo(
    () => ({
      limit: REGRESSION_CASE_PAGE_LIMIT,
      fetch_max: REGRESSION_CASE_FETCH_MAX,
      dataset_id: datasetId || undefined,
    }),
    [datasetId]
  )

  const regressionCasesQuery = useQuery({
    queryKey: queryKeys.evaluations.regressionCases(regressionCaseParams),
    enabled: Boolean(datasetId),
    queryFn: async () => {
      if (!datasetId) return { total: 0, items: [], fullyLoaded: true }
      const firstPage = await evaluationApi.listRegressionCases({
        skip: 0,
        limit: REGRESSION_CASE_PAGE_LIMIT,
        dataset_id: datasetId,
      })
      const total = Number(firstPage.total ?? 0)
      const targetTotal = Math.min(total, REGRESSION_CASE_FETCH_MAX)
      const items = [...(firstPage.items || [])]

      for (
        let skip = items.length;
        skip < targetTotal;
        skip += REGRESSION_CASE_PAGE_LIMIT
      ) {
        const nextPage = await evaluationApi.listRegressionCases({
          skip,
          limit: REGRESSION_CASE_PAGE_LIMIT,
          dataset_id: datasetId,
        })
        const nextItems = nextPage.items || []
        if (!nextItems.length) break
        items.push(...nextItems)
      }

      return {
        total,
        items,
        fullyLoaded: items.length >= total,
      }
    },
  })

  const cases = useMemo(
    () => (datasetId ? (regressionCasesQuery.data?.items ?? []) : []),
    [datasetId, regressionCasesQuery.data]
  )
  const caseTotal = datasetId
    ? Number(regressionCasesQuery.data?.total ?? cases.length)
    : 0
  const casesFullyLoaded = regressionCasesQuery.data?.fullyLoaded ?? true
  const isLoading = Boolean(datasetId) && regressionCasesQuery.isLoading

  const invalidateRegressionCases = () =>
    queryClient.invalidateQueries({
      queryKey: queryKeys.evaluations.regressionCases(regressionCaseParams),
    })

  const createCaseMutation = useMutation({
    mutationFn: (payload: RegressionCaseCreate) =>
      evaluationApi.createRegressionCase(payload),
    onSuccess: invalidateRegressionCases,
  })

  const deleteCasesMutation = useMutation({
    mutationFn: (caseIds: string[]) =>
      Promise.all(
        caseIds.map((caseId) => evaluationApi.deleteRegressionCase(caseId))
      ),
    onSettled: invalidateRegressionCases,
  })

  const patchCaseTagsMutation = useMutation({
    mutationFn: ({
      caseId,
      tags,
    }: {
      caseId: string
      tags: string[]
    }) => evaluationApi.patchRegressionCase(caseId, { tags }),
    onSuccess: invalidateRegressionCases,
  })

  useEffect(() => {
    setSelectedCaseIds(new Set())
    setSelectedCase(null)
    setIsCreating(false)
    setNewQuestion('')
    setNewExpectedAnswer('')
    setEvidenceDialogOpen(false)
    setEvidencePack(null)
    setEvidenceQuestion('')
    setEvidenceExpectedAnswer('')
    setEvidenceSelectedChunkIds(new Set())
    onCaseSelectedRef.current?.(null)
  }, [datasetId])

  useEffect(() => {
    if (!regressionCasesQuery.error) return
    console.error('加载评测样本失败:', regressionCasesQuery.error)
    toast.error(formatApiError(regressionCasesQuery.error, '加载评测样本失败'))
  }, [regressionCasesQuery.error])

  const goldenCount = useMemo(() => {
    return (cases || []).filter(isGoldenCase).length
  }, [cases])
  const standardAnswerCount = useMemo(() => {
    return (cases || []).filter(
      (c) =>
        typeof c.expected_answer === 'string' &&
        c.expected_answer.trim().length > 0
    ).length
  }, [cases])
  const referenceSourceCount = useMemo(() => {
    return (cases || []).reduce(
      (total, c) =>
        total +
        (Array.isArray(c.reference_sources) ? c.reference_sources.length : 0),
      0
    )
  }, [cases])
  const goldenCaseIds = useMemo(() => {
    return (cases || []).filter(isGoldenCase).map((c) => c.id)
  }, [cases])

  // 过滤用例
  const filteredCases = cases.filter((c) => {
    const query = searchQuery.toLowerCase()
    const searchable = [
      c.question,
      c.expected_answer,
      ...(Array.isArray(c.tags) ? c.tags : []),
    ]
      .join(' ')
      .toLowerCase()
    if (!searchable.includes(query)) return false
    if (!goldenOnly) return true
    return isGoldenCase(c)
  })
  const allFilteredCasesSelected =
    filteredCases.length > 0 &&
    filteredCases.every((caseItem) => selectedCaseIds.has(caseItem.id))

  // 切换选择
  const toggleSelect = (caseId: string) => {
    const newSet = new Set(selectedCaseIds)
    if (newSet.has(caseId)) {
      newSet.delete(caseId)
    } else {
      newSet.add(caseId)
    }
    setSelectedCaseIds(newSet)
  }

  // 全选/取消全选
  const toggleSelectAll = () => {
    setSelectedCaseIds((current) => {
      const next = new Set(current)
      if (allFilteredCasesSelected) {
        filteredCases.forEach((caseItem) => next.delete(caseItem.id))
      } else {
        filteredCases.forEach((caseItem) => next.add(caseItem.id))
      }
      return next
    })
  }

  // 删除用例
  const handleDelete = async (caseId: string) => {
    try {
      await deleteCasesMutation.mutateAsync([caseId])
      toast.success('评测样本已删除')
      setSelectedCaseIds((current) => {
        const next = new Set(current)
        next.delete(caseId)
        return next
      })
      if (selectedCase?.id === caseId) {
        setSelectedCase(null)
        onCaseSelected?.(null)
      }
    } catch (error) {
      console.error('删除失败:', error)
      toast.error(formatApiError(error, '删除失败'))
    }
  }

  // 批量删除
  const handleBatchDelete = async () => {
    if (selectedCaseIds.size === 0) return
    const deletingCaseIds = Array.from(selectedCaseIds)

    try {
      await deleteCasesMutation.mutateAsync(deletingCaseIds)
      toast.success(`已删除 ${deletingCaseIds.length} 个评测样本`)
      setSelectedCaseIds(new Set())
      if (selectedCase && deletingCaseIds.includes(selectedCase.id)) {
        setSelectedCase(null)
        onCaseSelected?.(null)
      }
    } catch (error) {
      console.error('批量删除失败:', error)
      toast.error(formatApiError(error, '批量删除失败'))
    }
  }

  // 创建用例
  const handleCreate = async () => {
    const q = (newQuestion || '').trim()
    if (!q) {
      toast.error('请输入问题')
      return
    }
    const requestedDatasetId = String(datasetId || '').trim()
    if (!requestedDatasetId) {
      toast.error('请先选择数据集')
      return
    }

    setEvidenceLoading(true)
    try {
      const res = await ragApi.retrieveEvidence({
        query: q,
        dataset_id: requestedDatasetId,
      })
      if (String(datasetIdRef.current || '').trim() !== requestedDatasetId) {
        toast.info('数据集已切换，请重新检索标准证据')
        return
      }
      const citations = Array.isArray(res?.citations)
        ? (res.citations as unknown as Citation[])
        : []
      if (!citations.length) {
        toast.error('未检索到可用证据，请检查数据集是否已完成入库')
        return
      }

      const exportedAt = new Date().toISOString()
      setEvidencePack({
        dataset_id: requestedDatasetId,
        query: q,
        query_for_retrieval: res?.query_for_retrieval || q,
        metrics: res?.metrics || null,
        citations,
        exported_at: exportedAt,
        source: 'retrieve_preview',
        has_evidence: (res as any)?.has_evidence ?? null,
        abstain_triggered: (res as any)?.abstain_triggered ?? null,
        abstain_reason: (res as any)?.abstain_reason ?? null,
      })
      setEvidenceQuestion(q)
      setEvidenceExpectedAnswer(newExpectedAnswer || '')

      // 默认选择第一条证据，用户仍可继续调整。
      const firstChunkId = toTrimmedPrimitiveString(citations?.[0]?.chunk_id)
      setEvidenceSelectedChunkIds(
        firstChunkId ? new Set([firstChunkId]) : new Set()
      )

      setIsCreating(false)
      setEvidenceDialogOpen(true)
    } catch (error) {
      console.error('检索预览失败:', error)
      toast.error(formatApiError(error, '检索预览失败'))
    } finally {
      setEvidenceLoading(false)
    }
  }

  const handleChooseEvidencePack = () => {
    if (!datasetId) {
      toast.error('请先选择数据集')
      return
    }
    evidenceFileInputRef.current?.click()
  }

  const handleEvidencePackFile = async (file: File | null) => {
    if (!file) return
    if (file.size > EVIDENCE_PACK_MAX_BYTES) {
      toast.error('证据包不能超过 5 MB')
      if (evidenceFileInputRef.current) evidenceFileInputRef.current.value = ''
      return
    }
    try {
      const raw = await file.text()
      const parsed = JSON.parse(raw)
      const citations = Array.isArray(parsed?.citations)
        ? (parsed.citations as Citation[])
        : []
      if (!citations.length) {
        toast.error('证据包中没有可用证据')
        return
      }

      const activeDatasetId = String(datasetIdRef.current || '').trim()
      const resolution = resolveEvidencePackDataset(
        activeDatasetId,
        typeof parsed?.dataset_id === 'string' ? parsed.dataset_id : ''
      )
      if (!resolution.ok && resolution.reason === 'missing_active_dataset') {
        toast.error('证据包未指定数据集，且当前也没有选择数据集')
        return
      }
      if (!resolution.ok) {
        toast.error('证据包属于其他数据集，请切换到对应数据集后再导入')
        return
      }

      const q = typeof parsed?.query === 'string' ? parsed.query : ''
      setEvidencePack({
        ...parsed,
        dataset_id: resolution.datasetId,
        source: 'evidence_pack',
      })
      setEvidenceQuestion(String(q || '').trim())
      setEvidenceExpectedAnswer('')

      const selectedChunkIds = Array.isArray(parsed?.selected_chunk_ids)
        ? parsed.selected_chunk_ids
        : []
      const normalizedSelected = selectedChunkIds
        .map((x: any) => toTrimmedPrimitiveString(x))
        .filter(Boolean)

      // 优先恢复导出时的选择，否则默认选择第一条证据。
      const firstChunkId = toTrimmedPrimitiveString(citations?.[0]?.chunk_id)
      setEvidenceSelectedChunkIds(
        (() => {
          if (normalizedSelected.length) {
            return new Set(normalizedSelected)
          } else if (firstChunkId) {
            return new Set([firstChunkId])
          } else {
            return new Set()
          }
        })()
      )
      setEvidenceDialogOpen(true)
    } catch (err: any) {
      console.error('证据包解析失败', err)
      toast.error('证据包解析失败，请确认文件为有效的 JSON 格式')
    } finally {
      // 清空文件选择，允许再次选择同一文件。
      if (evidenceFileInputRef.current) evidenceFileInputRef.current.value = ''
    }
  }

  const handleCreateCaseFromEvidencePack = async () => {
    const resolution = resolveEvidencePackDataset(
      datasetIdRef.current,
      evidencePack?.dataset_id
    )
    if (!resolution.ok) {
      toast.error('当前数据集已变化，请重新选择标准证据')
      return
    }
    const ds = resolution.datasetId
    const q = (evidenceQuestion || '').trim()
    if (!q) {
      toast.error('请输入问题')
      return
    }
    if (!evidenceSelectedChunkIds.size) {
      toast.error('请至少选择一条标准证据')
      return
    }

    const sourceTag =
      evidencePack?.source === 'retrieve_preview'
        ? 'from_retrieval_preview'
        : 'evidence_pack'
    const selected = new Set(Array.from(evidenceSelectedChunkIds || []))
    const refs: RegressionReferenceSource[] = (evidenceCitations || [])
      .filter((c: any) => selected.has(String(c?.chunk_id || '')))
      .map((c: any) => ({
        document_id: String(c?.document_id || ''),
        chunk_id: String(c?.chunk_id || ''),
        page_number:
          typeof c?.page_number === 'number' ? c.page_number : undefined,
        start_char:
          typeof c?.start_char === 'number' ? c.start_char : undefined,
        end_char: typeof c?.end_char === 'number' ? c.end_char : undefined,
        doc_pipeline_key:
          typeof c?.doc_pipeline_key === 'string'
            ? c.doc_pipeline_key
            : undefined,
        pipeline_hash:
          typeof c?.pipeline_hash === 'string' ? c.pipeline_hash : undefined,
        quote:
          typeof c?.chunk_content === 'string' ? c.chunk_content : undefined,
        label:
          sourceTag === 'from_retrieval_preview'
            ? 'ground_truth'
            : 'evidence_pack',
      }))
      .filter((r) => !!r.document_id && !!r.chunk_id)

    if (!refs.length) {
      toast.error('选中的证据缺少文档或切片信息，请重新选择')
      return
    }

    setEvidenceCreating(true)
    try {
      const payload: RegressionCaseCreate = {
        question: q,
        dataset_id: ds,
        expected_answer: evidenceExpectedAnswer?.trim()
          ? evidenceExpectedAnswer.trim()
          : undefined,
        reference_sources: refs,
        tags: [GOLDEN_TAG, sourceTag],
        extra: {
          evidence_pack_exported_at: evidencePack?.exported_at || null,
          query_for_retrieval: evidencePack?.query_for_retrieval || null,
          retrieval_metrics: evidencePack?.metrics || null,
          has_evidence: evidencePack?.has_evidence ?? null,
          abstain_triggered: evidencePack?.abstain_triggered ?? null,
          abstain_reason: evidencePack?.abstain_reason ?? null,
          created_from:
            sourceTag === 'from_retrieval_preview'
              ? 'regression.test_case_manager'
              : 'regression.evidence_pack_import',
        },
      }
      await createCaseMutation.mutateAsync(payload)
      toast.success('已创建基准评测样本')
      setEvidenceDialogOpen(false)
      setEvidencePack(null)
      setEvidenceSelectedChunkIds(new Set())
      setIsCreating(false)
      setNewQuestion('')
      setNewExpectedAnswer('')
    } catch (err: any) {
      console.error('从证据包创建评测样本失败', err)
      toast.error(formatApiError(err, '创建评测样本失败'))
    } finally {
      setEvidenceCreating(false)
    }
  }

  // 选择用例
  const handleSelectCase = (caseItem: RegressionCase) => {
    setSelectedCase(caseItem)
    onCaseSelected?.(caseItem.id)
  }

  const handleToggleGolden = async (caseItem: RegressionCase) => {
    const prevTags = Array.isArray(caseItem.tags) ? caseItem.tags : []
    const hasGolden = prevTags.includes(GOLDEN_TAG)
    const hasGoldenDraft = prevTags.includes(GOLDEN_DRAFT_TAG)
    const nextTags = hasGolden
      ? prevTags.filter((t) => t !== GOLDEN_TAG)
      : [...prevTags, GOLDEN_TAG]

    try {
      const updated = await patchCaseTagsMutation.mutateAsync({
        caseId: caseItem.id,
        tags: nextTags,
      })
      if (selectedCase?.id === caseItem.id) {
        setSelectedCase(updated)
        onCaseSelected?.(updated.id)
      }
      if (hasGolden && hasGoldenDraft) {
        toast.success('已取消人工确认，样本仍保留为基准草稿')
      } else {
        toast.success(hasGolden ? '已移出基准样本' : '已设为基准样本')
      }
    } catch (error) {
      console.error('更新基准标记失败:', error)
      toast.error(formatApiError(error, '更新基准标记失败'))
    }
  }

  const handleRunCaseIds = (caseIds: string[], emptyMessage: string) => {
    if (!datasetId) {
      toast.error('请先选择数据集')
      return
    }
    if (caseIds.length === 0) {
      toast.error(emptyMessage)
      return
    }
    onRunTests?.(caseIds)
  }

  // 运行选中的测试
  const handleRunSelected = () => {
    handleRunCaseIds(Array.from(selectedCaseIds), '请先选择评测样本')
  }

  const handleRunGolden = () => {
    handleRunCaseIds(goldenCaseIds, '当前数据集暂无基准样本')
  }

  const handleRunAll = () => {
    handleRunCaseIds(
      cases.map((caseItem) => caseItem.id),
      '当前数据集暂无评测样本'
    )
  }

  let caseListContent: ReactNode
  if (isLoading) {
    caseListContent = (
      <div
        className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"
        role="status"
      >
        <Loader2
          className="size-5 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
        正在加载评测样本…
      </div>
    )
  } else if (regressionCasesQuery.isError) {
    caseListContent = (
      <div
        className="flex min-h-80 items-center justify-center px-6 py-12 text-center"
        role="alert"
      >
        <div className="max-w-sm">
          <div className="text-sm font-semibold text-foreground">
            评测样本加载失败
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            请检查网络连接后重试。已有样本不会受到影响。
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-4 h-9 rounded-md px-3 text-sm"
            onClick={() => detachPromise(regressionCasesQuery.refetch())}
          >
            重新加载
          </Button>
        </div>
      </div>
    )
  } else if (filteredCases.length === 0) {
    const emptyTitle = datasetId
      ? searchQuery || goldenOnly
        ? '没有匹配的评测样本'
        : '暂无基准评测样本'
      : '先选择数据集'
    const emptyDescription = datasetId
      ? searchQuery || goldenOnly
        ? '当前筛选条件没有命中样本，可以清空筛选或新增一条可复用标准问答。'
        : '添加标准问题、答案和证据，用于持续检查检索与回答质量。'
      : '基准样本按数据集管理，选择数据集后即可开始创建。'

    caseListContent = (
      <div
        className={cn(
          'flex h-full min-h-80 items-center justify-center px-6 text-center',
          dense ? 'py-10' : 'py-12'
        )}
      >
        <div className="max-w-md">
          <div className="mx-auto flex size-12 items-center justify-center rounded-md border border-border bg-muted/30">
            <FileText className="size-5 text-primary" aria-hidden="true" />
          </div>
          <div className="mt-4 text-base font-semibold text-foreground">
            {emptyTitle}
          </div>
          <div className="mt-2 text-sm leading-6 text-muted-foreground">
            {emptyDescription}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {(searchQuery || goldenOnly) && datasetId ? (
              <Button
                size="sm"
                variant="outline"
                className="h-9 rounded-md px-3 text-sm"
                onClick={() => {
                  setSearchQuery('')
                  setGoldenOnly(false)
                }}
              >
                清空筛选
              </Button>
            ) : null}
            <Button
              size="sm"
              className="h-9 gap-2 rounded-md px-3 text-sm"
              onClick={() => setIsCreating(true)}
              disabled={!datasetId}
            >
              <Plus className="size-4" aria-hidden="true" />
              新增标准问答
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-9 gap-2 rounded-md px-3 text-sm"
              onClick={handleChooseEvidencePack}
              disabled={!datasetId}
            >
              <Upload className="size-4" aria-hidden="true" />
              导入证据包
            </Button>
          </div>
        </div>
      </div>
    )
  } else {
    caseListContent = (
      <>
        <div
          className={cn(
            'border-b flex items-center gap-2',
            dense ? 'border-border/60 px-3 py-2' : 'border-border px-4 py-2'
          )}
        >
          <button
            type="button"
            onClick={toggleSelectAll}
            className="flex min-h-9 items-center gap-2 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground motion-reduce:transition-none"
          >
            {allFilteredCasesSelected ? (
              <CheckSquare className="size-4" aria-hidden="true" />
            ) : (
              <Square className="size-4" aria-hidden="true" />
            )}
            全选
          </button>
        </div>

        <div>
          {filteredCases.map((caseItem) => {
            const isGolden = isGoldenCase(caseItem)
            return (
              <TestCaseRow
                key={caseItem.id}
                caseItem={caseItem}
                isSelected={selectedCase?.id === caseItem.id}
                isChecked={selectedCaseIds.has(caseItem.id)}
                isGolden={isGolden}
                dense={dense}
                onSelectCase={handleSelectCase}
                onToggleSelect={toggleSelect}
                onToggleGolden={handleToggleGolden}
                onDelete={handleDelete}
              />
            )
          })}
        </div>
      </>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* 顶部操作栏 */}
      <div
        className={cn(
          'border-b border-border bg-background',
          dense ? 'px-3 py-3' : 'p-4'
        )}
      >
        <div className="mb-3 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">
              基准评测样本
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              用固定的问题、答案和证据持续检查检索与回答质量。
            </p>
            {dense ? (
              <div
                aria-label="基准评测样本统计"
                className="mt-2 flex flex-wrap items-center gap-2"
              >
                <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                  样本 {caseTotal}
                  {!casesFullyLoaded ? ` · 已加载 ${cases.length}` : ''}
                </span>
                <span className="rounded-md bg-warning/10 px-2 py-1 text-xs text-warning">
                  基准 {goldenCount}
                </span>
                <span className="rounded-md bg-success/10 px-2 py-1 text-xs text-success">
                  标准答案 {standardAnswerCount}
                </span>
                <span className="rounded-md bg-info/10 px-2 py-1 text-xs text-info">
                  标准证据 {referenceSourceCount}
                </span>
                <span className="rounded-md bg-primary/10 px-2 py-1 text-xs text-primary">
                  已选 {selectedCaseIds.size}
                </span>
              </div>
            ) : null}
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto xl:justify-end">
            {cases.length > 0 && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 gap-2 rounded-md px-3 text-sm"
                  onClick={handleRunGolden}
                  disabled={!datasetId || goldenCaseIds.length === 0}
                >
                  <Star className="size-4" aria-hidden="true" />
                  {casesFullyLoaded ? '运行基准' : '运行已加载基准'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 rounded-md px-3 text-sm"
                  onClick={handleRunAll}
                  disabled={!datasetId || cases.length === 0}
                >
                  {casesFullyLoaded ? '运行全部' : '运行已加载样本'}
                </Button>
              </>
            )}
            {selectedCaseIds.size > 0 && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 rounded-md px-3 text-sm"
                  onClick={handleRunSelected}
                >
                  运行选中（{selectedCaseIds.size}）
                </Button>
                <ConfirmDialog
                  title="批量删除评测样本？"
                  description={`将删除 ${selectedCaseIds.size} 个评测样本。此操作不可恢复。`}
                  confirmLabel="删除"
                  cancelLabel="返回"
                  confirmVariant="destructive"
                  onConfirm={() => detachPromise(handleBatchDelete())}
                >
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 gap-2 rounded-md px-3 text-sm text-destructive hover:text-destructive"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                    删除
                  </Button>
                </ConfirmDialog>
              </>
            )}
            <input
              ref={evidenceFileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) =>
                detachPromise(
                  handleEvidencePackFile(e.target.files?.[0] || null)
                )
              }
            />
            <Button
              size="sm"
              variant="outline"
              className="h-9 gap-2 rounded-md px-3 text-sm"
              onClick={handleChooseEvidencePack}
              disabled={!datasetId}
              title={datasetId ? '导入证据包 JSON 文件' : '请先选择数据集'}
            >
              <Upload className="size-4" aria-hidden="true" />
              导入证据包
            </Button>
            <Button
              size="sm"
              className="h-9 gap-2 rounded-md px-3 text-sm"
              onClick={() => setIsCreating(true)}
              disabled={!datasetId}
            >
              <Plus className="size-4" aria-hidden="true" />
              新增标准问答
            </Button>
          </div>
        </div>

        <div className="relative max-w-2xl">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="text"
            placeholder="搜索问题、答案或标签"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 rounded-md border-border bg-background pl-9 text-sm"
            aria-label="搜索评测样本"
          />
        </div>

        <div
          className={cn(
            'flex items-center justify-start gap-3',
            dense ? 'mt-2' : 'mt-3'
          )}
        >
          <Button
            size="sm"
            variant={goldenOnly ? 'default' : 'outline'}
            className={cn(
              'gap-2',
              goldenOnly &&
                'bg-warning/15 text-warning hover:bg-warning/20',
              'h-9 rounded-md border-border px-3 text-sm'
            )}
            onClick={() => {
              setGoldenOnly((v) => !v)
              setSelectedCaseIds(new Set())
            }}
            disabled={!datasetId}
            title={datasetId ? '只显示基准评测样本' : '请先选择数据集'}
          >
            <Star
              className="size-4"
              fill={goldenOnly ? 'currentColor' : 'none'}
              aria-hidden="true"
            />
            只看基准样本
          </Button>
        </div>
      </div>

      <Dialog
        open={isCreating}
        onOpenChange={(open) => {
          if (!open && evidenceLoading) return
          setIsCreating(open)
        }}
      >
        <DialogContent className="max-h-[min(90dvh,720px)] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>新增标准问答</DialogTitle>
            <DialogDescription>
              输入标准问题和答案，系统会先检索可作为评测依据的证据。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="regression-case-question">标准问题</Label>
              <Textarea
                id="regression-case-question"
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                placeholder="输入用于评测检索与回答效果的问题"
                className="min-h-24 resize-none rounded-md text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="regression-case-answer">标准答案（推荐）</Label>
              <Textarea
                id="regression-case-answer"
                value={newExpectedAnswer}
                onChange={(e) => setNewExpectedAnswer(e.target.value)}
                placeholder="输入可用于结果比对的标准答案"
                className="min-h-24 resize-none rounded-md text-sm"
              />
            </div>
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              每个评测样本至少需要一条标准证据。下一步可以从检索结果中选择，也可以导入已有证据包。
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setIsCreating(false)
                setNewQuestion('')
                setNewExpectedAnswer('')
              }}
              disabled={evidenceLoading}
            >
              取消
            </Button>
            <Button
              size="sm"
              className="gap-2"
              onClick={() => detachPromise(handleCreate())}
              disabled={evidenceLoading || !datasetId || !newQuestion.trim()}
            >
              {evidenceLoading ? (
                <>
                  <Loader2
                    className="size-4 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                  检索中…
                </>
              ) : (
                '检索并选择标准证据'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={evidenceDialogOpen}
        onOpenChange={(open) => {
          if (!open && evidenceCreating) return
          setEvidenceDialogOpen(open)
        }}
      >
        <DialogContent className="flex max-h-[min(90dvh,760px)] max-w-3xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b border-border px-6 py-4 text-left">
            <DialogTitle>选择标准证据</DialogTitle>
            <DialogDescription>
              核对问题和答案，至少选择一条证据后创建基准评测样本。
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 text-xs text-muted-foreground">
              <span>
                来源：
                {evidencePack?.source === 'evidence_pack'
                  ? '导入的证据包'
                  : '当前数据集检索结果'}
              </span>
              <span>写入当前数据集 · 共 {evidenceCitations.length} 条证据</span>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="evidence-case-question">标准问题</Label>
                <Textarea
                  id="evidence-case-question"
                  value={evidenceQuestion}
                  onChange={(e) => setEvidenceQuestion(e.target.value)}
                  placeholder="输入用于评测检索与回答效果的问题"
                  className="min-h-24 resize-none rounded-md text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="evidence-case-answer">标准答案（推荐）</Label>
                <Textarea
                  id="evidence-case-answer"
                  value={evidenceExpectedAnswer}
                  onChange={(e) => setEvidenceExpectedAnswer(e.target.value)}
                  placeholder="输入可用于结果比对的标准答案"
                  className="min-h-24 resize-none rounded-md text-sm"
                />
              </div>
            </div>

            <section aria-labelledby="evidence-selection-title">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h4
                  id="evidence-selection-title"
                  className="text-sm font-semibold text-foreground"
                >
                  标准证据
                </h4>
                <span className="text-xs text-muted-foreground" aria-live="polite">
                  已选 {evidenceSelectedChunkIds.size} 条，共{' '}
                  {evidenceCitations.length} 条
                </span>
              </div>
              <div className="max-h-72 overflow-y-auto rounded-md border border-border">
                {evidenceCitations.map((citation: Citation, index: number) => {
                  const chunkId = String(citation?.chunk_id || '')
                  const checked =
                    Boolean(chunkId) && evidenceSelectedChunkIds.has(chunkId)
                  const documentLabel = String(
                    citation?.document_name ||
                      citation?.document_id ||
                      '未命名文档'
                  )
                  const snippet = String(citation?.chunk_content || '').slice(
                    0,
                    180
                  )
                  const checkboxId = `evidence-citation-${index}`

                  return (
                    <div
                      key={chunkId || index}
                      className={cn(
                        'flex items-start gap-3 border-b border-border px-3 py-3 last:border-b-0 hover:bg-muted/30',
                        !chunkId && 'opacity-60'
                      )}
                    >
                      <Checkbox
                        id={checkboxId}
                        className="mt-1 shrink-0 rounded-sm"
                        disabled={!chunkId}
                        checked={checked}
                        onCheckedChange={(nextChecked) => {
                          const next = new Set(evidenceSelectedChunkIds)
                          if (nextChecked === true) next.add(chunkId)
                          else next.delete(chunkId)
                          setEvidenceSelectedChunkIds(next)
                        }}
                        aria-describedby={`${checkboxId}-description`}
                      />
                      <Label
                        htmlFor={checkboxId}
                        className={cn(
                          'min-w-0 flex-1 cursor-pointer font-normal',
                          !chunkId && 'cursor-not-allowed'
                        )}
                      >
                        <span
                          className="block truncate text-sm font-medium text-foreground"
                          title={documentLabel}
                        >
                          {index + 1}. {documentLabel}
                        </span>
                        <span
                          id={`${checkboxId}-description`}
                          className="mt-1 block text-sm leading-6 text-muted-foreground"
                        >
                          {snippet || '该证据没有可预览的正文。'}
                          {snippet.length >= 180 ? '…' : ''}
                        </span>
                        {citation?.page_number ? (
                          <span className="mt-1 block text-xs text-muted-foreground">
                            第 {String(citation.page_number)} 页
                          </span>
                        ) : null}
                      </Label>
                    </div>
                  )
                })}
              </div>
            </section>
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t border-border bg-background px-6 py-4">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEvidenceDialogOpen(false)}
              disabled={evidenceCreating}
            >
              取消
            </Button>
            <Button
              size="sm"
              className="gap-2"
              onClick={() => detachPromise(handleCreateCaseFromEvidencePack())}
              disabled={
                evidenceCreating ||
                !evidenceDatasetId ||
                !evidenceQuestion.trim() ||
                evidenceSelectedChunkIds.size === 0
              }
            >
              {evidenceCreating ? (
                <>
                  <Loader2
                    className="size-4 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                  创建中…
                </>
              ) : (
                '创建基准样本'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 用例列表 */}
      <div className="flex-1 overflow-y-auto overscroll-contain custom-scrollbar">
        {caseListContent}
      </div>

      {/* 底部统计 */}
      {filteredCases.length > 0 || selectedCaseIds.size > 0 ? (
        <div
          className={cn(
            'border-t border-border bg-background text-xs text-muted-foreground',
            dense ? 'px-3 py-2.5' : 'px-4 py-3'
          )}
        >
          已显示 {filteredCases.length} 个评测样本
          {selectedCaseIds.size > 0 && `，已选择 ${selectedCaseIds.size} 个`}
        </div>
      ) : null}
    </div>
  )
}
