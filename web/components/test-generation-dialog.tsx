/**
 * 测试问题生成弹窗。
 */

'use client'

import { useQuery } from '@tanstack/react-query'
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  MessageSquare,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { formatApiError } from '@/lib/api-errors'
import { chatApi, datasetApi, documentApi, evaluationApi } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { cn } from '@/lib/utils'
import type {
  Conversation,
  Dataset,
  Document,
  GeneratedQuestion,
  TestGenFromConversationsRequest,
  TestGenFromDocsRequest,
} from '@/types'

interface TestGenerationDialogProps {
  open: boolean
  onClose: () => void
  onGenerated?: () => void
  initialSourceType?: 'documents' | 'conversations'
  initialDatasetId?: string
  initialDocumentIds?: string[]
}

type SourceType = 'documents' | 'conversations'
type Step = 'select_source' | 'configure' | 'preview'

const TEST_GEN_DOCUMENT_PARAMS = { limit: 100, status: 'completed' as const }
const TEST_GEN_CONVERSATION_PARAMS = { limit: 100 }
const EMPTY_DOCUMENTS: Document[] = []
const EMPTY_CONVERSATIONS: Conversation[] = []
const EMPTY_DATASETS: Dataset[] = []
const ALL_DATASETS_VALUE = '__all_datasets__'
const DEFAULT_QUESTION_TYPES = ['factual', 'multi_hop', 'comparison']

const QUESTION_TYPE_OPTIONS = [
  { key: 'factual', label: '事实型', description: '核对文档中的明确信息' },
  { key: 'multi_hop', label: '推理型', description: '组合多处信息后回答' },
  { key: 'comparison', label: '对比型', description: '比较两个概念或对象' },
  { key: 'conditional', label: '条件型', description: '根据指定条件推导答案' },
  { key: 'unanswerable', label: '不可回答', description: '验证系统是否会拒绝臆测' },
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function getQuestionType(metadata: unknown): string | null {
  if (!isRecord(metadata)) return null
  return typeof metadata.question_type === 'string' && metadata.question_type.trim()
    ? metadata.question_type
    : null
}

function selectableDocumentIds(documents: Document[], datasetId: string): Set<string> {
  return new Set(
    documents
      .filter((document) => !datasetId || document.dataset_id === datasetId)
      .map((document) => document.id)
  )
}

export function TestGenerationDialog({
  open,
  onClose,
  onGenerated,
  initialSourceType,
  initialDatasetId,
  initialDocumentIds,
}: Readonly<TestGenerationDialogProps>) {
  const initialDocumentIdsKey = (initialDocumentIds ?? []).join(',')
  const normalizedInitialDocumentIds = useMemo(
    () => (initialDocumentIdsKey ? initialDocumentIdsKey.split(',') : []),
    [initialDocumentIdsKey]
  )

  const [step, setStep] = useState<Step>('select_source')
  const [sourceType, setSourceType] = useState<SourceType>('documents')
  const [selectedDatasetId, setSelectedDatasetId] = useState('')
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<Set<string>>(new Set())
  const [selectedConversationIds, setSelectedConversationIds] = useState<Set<string>>(new Set())
  const [numQuestions, setNumQuestions] = useState(10)
  const [questionTypes, setQuestionTypes] = useState<string[]>(DEFAULT_QUESTION_TYPES)
  const [qualityThreshold, setQualityThreshold] = useState(0.7)
  const [autoSave, setAutoSave] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedQuestions, setGeneratedQuestions] = useState<GeneratedQuestion[]>([])
  const [savedCaseIds, setSavedCaseIds] = useState<string[]>([])
  const [error, setError] = useState('')

  const documentsQuery = useQuery({
    queryKey: queryKeys.documents.list(TEST_GEN_DOCUMENT_PARAMS),
    enabled: open && sourceType === 'documents',
    queryFn: () => documentApi.list(TEST_GEN_DOCUMENT_PARAMS),
  })
  const datasetsQuery = useQuery({
    queryKey: queryKeys.datasets.exhaustive({ purpose: 'test-generation' }),
    enabled: open && sourceType === 'documents',
    queryFn: () => datasetApi.listAll(),
  })
  const conversationsQuery = useQuery({
    queryKey: queryKeys.chat.conversations(TEST_GEN_CONVERSATION_PARAMS),
    enabled: open && sourceType === 'conversations',
    queryFn: () => chatApi.listConversations(TEST_GEN_CONVERSATION_PARAMS),
  })

  const documents = documentsQuery.data?.items ?? EMPTY_DOCUMENTS
  const datasets = datasetsQuery.data ?? EMPTY_DATASETS
  const conversations = conversationsQuery.data?.items ?? EMPTY_CONVERSATIONS
  const visibleDocuments = useMemo(
    () =>
      documents.filter(
        (document) => !selectedDatasetId || document.dataset_id === selectedDatasetId
      ),
    [documents, selectedDatasetId]
  )
  const visibleDocumentIds = useMemo(
    () => selectableDocumentIds(documents, selectedDatasetId),
    [documents, selectedDatasetId]
  )
  const isLoadingData =
    (sourceType === 'documents' && (documentsQuery.isLoading || datasetsQuery.isLoading)) ||
    (sourceType === 'conversations' && conversationsQuery.isLoading)
  const sourceLoadError =
    sourceType === 'documents'
      ? documentsQuery.error || datasetsQuery.error
      : conversationsQuery.error

  useEffect(() => {
    if (open) {
      const hasDocumentPreset = normalizedInitialDocumentIds.length > 0
      setStep(hasDocumentPreset ? 'configure' : 'select_source')
      setSourceType(hasDocumentPreset ? 'documents' : initialSourceType || 'documents')
      setSelectedDatasetId(initialDatasetId || '')
      setSelectedDocumentIds(new Set(normalizedInitialDocumentIds))
      setSelectedConversationIds(new Set())
    } else {
      setStep('select_source')
      setSourceType('documents')
      setSelectedDatasetId('')
      setSelectedDocumentIds(new Set())
      setSelectedConversationIds(new Set())
    }

    setNumQuestions(10)
    setQuestionTypes(DEFAULT_QUESTION_TYPES)
    setQualityThreshold(0.7)
    setAutoSave(false)
    setIsGenerating(false)
    setGeneratedQuestions([])
    setSavedCaseIds([])
    setError('')
  }, [initialDatasetId, initialSourceType, normalizedInitialDocumentIds, open])

  useEffect(() => {
    if (!selectedDatasetId || documentsQuery.isLoading) return
    setSelectedDocumentIds((current) => {
      const next = new Set(Array.from(current).filter((id) => visibleDocumentIds.has(id)))
      return next.size === current.size ? current : next
    })
  }, [documentsQuery.isLoading, selectedDatasetId, visibleDocumentIds])

  const handleClose = () => {
    if (!isGenerating) onClose()
  }

  const handleSourceChange = (nextSource: SourceType) => {
    setSourceType(nextSource)
    setError('')
    if (nextSource === 'documents') {
      setSelectedConversationIds(new Set())
      return
    }
    setSelectedDatasetId('')
    setSelectedDocumentIds(new Set())
  }

  const handleDatasetChange = (value: string) => {
    setSelectedDatasetId(value === ALL_DATASETS_VALUE ? '' : value)
    setSelectedDocumentIds(new Set())
    setError('')
  }

  const toggleDocument = (documentId: string) => {
    setSelectedDocumentIds((current) => {
      const next = new Set(current)
      if (next.has(documentId)) next.delete(documentId)
      else next.add(documentId)
      return next
    })
  }

  const toggleConversation = (conversationId: string) => {
    setSelectedConversationIds((current) => {
      const next = new Set(current)
      if (next.has(conversationId)) next.delete(conversationId)
      else next.add(conversationId)
      return next
    })
  }

  const toggleQuestionType = (type: string) => {
    setQuestionTypes((current) =>
      current.includes(type) ? current.filter((item) => item !== type) : [...current, type]
    )
  }

  const retrySourceLoad = () => {
    if (sourceType === 'documents') {
      void Promise.all([documentsQuery.refetch(), datasetsQuery.refetch()])
      return
    }
    void conversationsQuery.refetch()
  }

  const handleGenerate = async () => {
    if (isGenerating) return
    if (sourceType === 'documents' && selectedDocumentIds.size === 0 && !selectedDatasetId) {
      toast.error('请选择知识库或至少一个文档')
      return
    }
    if (sourceType === 'conversations' && selectedConversationIds.size === 0) {
      toast.error('请至少选择一个对话')
      return
    }
    if (sourceType === 'documents' && questionTypes.length === 0) {
      toast.error('请至少选择一种问题类型')
      return
    }

    setIsGenerating(true)
    setError('')

    try {
      let result
      if (sourceType === 'documents') {
        const params: TestGenFromDocsRequest = {
          dataset_id: selectedDatasetId || undefined,
          document_ids: Array.from(selectedDocumentIds),
          num_questions: numQuestions,
          question_types: questionTypes,
          auto_save_as_cases: autoSave,
        }
        result = await evaluationApi.generateFromDocuments(params)
      } else {
        const params: TestGenFromConversationsRequest = {
          conversation_ids: Array.from(selectedConversationIds),
          num_questions: numQuestions,
          quality_threshold: qualityThreshold,
          auto_save_as_cases: autoSave,
        }
        result = await evaluationApi.generateFromConversations(params)
      }

      if (result.status !== 'completed') {
        const message = result.error_message || '暂时无法生成问题，请稍后重试。'
        setError(message)
        toast.error(message)
        return
      }

      setGeneratedQuestions(result.generated_questions)
      setSavedCaseIds(result.saved_case_ids || [])
      setStep('preview')
      toast.success(
        autoSave
          ? `已生成 ${result.generated_questions.length} 个问题，写入 ${result.saved_case_ids?.length || 0} 个用例`
          : `已生成 ${result.generated_questions.length} 个问题`
      )
    } catch (generationError: unknown) {
      const message = formatApiError(generationError, '暂时无法生成问题，请稍后重试。')
      setError(message)
      toast.error(message)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleDeleteQuestion = (index: number) => {
    setGeneratedQuestions((current) => current.filter((_, itemIndex) => itemIndex !== index))
  }

  const handleFinish = () => {
    if (savedCaseIds.length > 0) onGenerated?.()
    handleClose()
  }

  const canContinue =
    !isLoadingData &&
    !sourceLoadError &&
    ((sourceType === 'documents' &&
      (selectedDocumentIds.size > 0 ||
        (Boolean(selectedDatasetId) && visibleDocuments.length > 0))) ||
      (sourceType === 'conversations' && selectedConversationIds.size > 0))

  if (!open) return null

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) handleClose()
      }}
    >
      <DialogContent
        closeDisabled={isGenerating}
        onEscapeKeyDown={(event) => {
          if (isGenerating) event.preventDefault()
        }}
        onPointerDownOutside={(event) => {
          if (isGenerating) event.preventDefault()
        }}
        className="flex max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-3xl flex-col gap-0 overflow-hidden rounded-lg border-border bg-background p-0 shadow-lg sm:max-h-[min(88dvh,760px)]"
      >
        <header className="border-b border-border px-4 py-4 pr-14 sm:px-6">
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Sparkles className="size-4" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold">生成测试问题</DialogTitle>
              <DialogDescription className="mt-1 text-sm">
                {step === 'select_source' && '选择用于生成问题的内容范围。'}
                {step === 'configure' && '设置问题数量、类型和保存方式。'}
                {step === 'preview' && '检查本次生成结果。'}
              </DialogDescription>
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
          {step === 'select_source' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  aria-pressed={sourceType === 'documents'}
                  onClick={() => handleSourceChange('documents')}
                  className={cn(
                    'min-w-0 rounded-md border p-4 text-left transition-colors duration-150 focus-ring motion-reduce:transition-none',
                    sourceType === 'documents'
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-background hover:bg-muted/40'
                  )}
                >
                  <FileText className="mb-3 size-5 text-primary" />
                  <span className="block text-sm font-medium text-foreground">知识库文档</span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    从已完成解析的文档中生成问题
                  </span>
                </button>
                <button
                  type="button"
                  aria-pressed={sourceType === 'conversations'}
                  onClick={() => handleSourceChange('conversations')}
                  className={cn(
                    'min-w-0 rounded-md border p-4 text-left transition-colors duration-150 focus-ring motion-reduce:transition-none',
                    sourceType === 'conversations'
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-background hover:bg-muted/40'
                  )}
                >
                  <MessageSquare className="mb-3 size-5 text-primary" />
                  <span className="block text-sm font-medium text-foreground">历史对话</span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    从已有对话中提取可复用问题
                  </span>
                </button>
              </div>

              {sourceType === 'documents' ? (
                <section className="space-y-4" aria-labelledby="test-generation-document-scope">
                  <div>
                    <h3 id="test-generation-document-scope" className="text-sm font-medium">
                      文档范围
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      选择知识库后会显示其中的文档；不勾选文档时使用整个知识库。
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="test-generation-dataset" className="text-sm font-medium">
                      知识库
                    </label>
                    <Select
                      value={selectedDatasetId || ALL_DATASETS_VALUE}
                      onValueChange={handleDatasetChange}
                    >
                      <SelectTrigger id="test-generation-dataset" aria-label="选择知识库">
                        <SelectValue placeholder="全部知识库" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_DATASETS_VALUE}>全部知识库</SelectItem>
                        {datasets.map((dataset) => (
                          <SelectItem key={dataset.id} value={dataset.id}>
                            {dataset.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium">文档</span>
                      <span className="text-xs text-muted-foreground">
                        已选 {selectedDocumentIds.size} 项
                      </span>
                    </div>
                    <div className="max-h-64 overflow-y-auto overscroll-contain rounded-md border border-border">
                      {isLoadingData ? (
                        <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                          正在加载文档
                        </div>
                      ) : sourceLoadError ? (
                        <div className="flex min-h-32 flex-col items-center justify-center gap-3 px-4 text-center">
                          <p className="text-sm text-muted-foreground">
                            文档范围加载失败，请重新加载。
                          </p>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={retrySourceLoad}
                          >
                            重新加载
                          </Button>
                        </div>
                      ) : visibleDocuments.length === 0 ? (
                        <div className="flex min-h-32 items-center justify-center px-4 text-sm text-muted-foreground">
                          {selectedDatasetId ? '当前知识库暂无已完成文档' : '暂无可用文档'}
                        </div>
                      ) : (
                        visibleDocuments.map((document) => (
                          <label
                            key={document.id}
                            className="flex min-w-0 cursor-pointer items-center gap-3 border-b border-border px-3 py-3 last:border-b-0 hover:bg-muted/40"
                          >
                            <input
                              type="checkbox"
                              checked={selectedDocumentIds.has(document.id)}
                              onChange={() => toggleDocument(document.id)}
                              className="size-4 shrink-0 accent-primary"
                            />
                            <FileText className="size-4 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1 truncate text-sm">
                              {document.filename}
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {document.chunk_count} 个切片
                            </span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                </section>
              ) : (
                <section className="space-y-2" aria-labelledby="test-generation-conversations">
                  <div className="flex items-center justify-between gap-3">
                    <h3 id="test-generation-conversations" className="text-sm font-medium">
                      对话范围
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      已选 {selectedConversationIds.size} 项
                    </span>
                  </div>
                  <div className="max-h-72 overflow-y-auto overscroll-contain rounded-md border border-border">
                    {isLoadingData ? (
                      <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                        正在加载对话
                      </div>
                    ) : sourceLoadError ? (
                      <div className="flex min-h-32 flex-col items-center justify-center gap-3 px-4 text-center">
                        <p className="text-sm text-muted-foreground">对话加载失败，请重新加载。</p>
                        <Button type="button" size="sm" variant="outline" onClick={retrySourceLoad}>
                          重新加载
                        </Button>
                      </div>
                    ) : conversations.length === 0 ? (
                      <div className="flex min-h-32 items-center justify-center px-4 text-sm text-muted-foreground">
                        暂无可用对话
                      </div>
                    ) : (
                      conversations.map((conversation) => (
                        <label
                          key={conversation.id}
                          className="flex min-w-0 cursor-pointer items-center gap-3 border-b border-border px-3 py-3 last:border-b-0 hover:bg-muted/40"
                        >
                          <input
                            type="checkbox"
                            checked={selectedConversationIds.has(conversation.id)}
                            onChange={() => toggleConversation(conversation.id)}
                            className="size-4 shrink-0 accent-primary"
                          />
                          <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate text-sm">
                            {conversation.title || `对话 ${conversation.id.slice(0, 8)}`}
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {conversation.message_count} 条消息
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </section>
              )}
            </div>
          )}

          {step === 'configure' && (
            <div className="space-y-6">
              <div className="border-b border-border pb-4">
                <p className="text-sm font-medium">本次范围</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {sourceType === 'documents'
                    ? selectedDocumentIds.size > 0
                      ? `${selectedDocumentIds.size} 个文档`
                      : '当前知识库中的全部已完成文档'
                    : `${selectedConversationIds.size} 个对话`}
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <label htmlFor="test-generation-count" className="text-sm font-medium">
                    生成数量
                  </label>
                  <output htmlFor="test-generation-count" className="text-sm tabular-nums">
                    {numQuestions} 个
                  </output>
                </div>
                <input
                  id="test-generation-count"
                  type="range"
                  min="1"
                  max="50"
                  value={numQuestions}
                  onChange={(event) => setNumQuestions(Number(event.target.value))}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>1</span>
                  <span>50</span>
                </div>
              </div>

              {sourceType === 'documents' ? (
                <fieldset className="space-y-3">
                  <legend className="text-sm font-medium">问题类型</legend>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {QUESTION_TYPE_OPTIONS.map((option) => {
                      const selected = questionTypes.includes(option.key)
                      return (
                        <button
                          key={option.key}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => toggleQuestionType(option.key)}
                          className={cn(
                            'rounded-md border p-3 text-left transition-colors duration-150 focus-ring motion-reduce:transition-none',
                            selected
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:bg-muted/40'
                          )}
                        >
                          <span className="block text-sm font-medium">{option.label}</span>
                          <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                            {option.description}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </fieldset>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <label htmlFor="test-generation-quality" className="text-sm font-medium">
                      质量阈值
                    </label>
                    <output htmlFor="test-generation-quality" className="text-sm tabular-nums">
                      {qualityThreshold.toFixed(1)}
                    </output>
                  </div>
                  <input
                    id="test-generation-quality"
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={qualityThreshold}
                    onChange={(event) => setQualityThreshold(Number(event.target.value))}
                    className="w-full accent-primary"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>保留更多结果</span>
                    <span>只保留高质量结果</span>
                  </div>
                </div>
              )}

              <div className="flex items-start justify-between gap-4 border-y border-border py-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium">生成后立即写入用例库</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    默认仅预览。启用后，生成成功的用例会立即保存，关闭弹窗不会撤销。
                  </p>
                </div>
                <Switch
                  checked={autoSave}
                  onCheckedChange={setAutoSave}
                  aria-label="生成后立即写入用例库"
                  className="mt-0.5 shrink-0"
                />
              </div>

              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive"
                >
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <p>{error}</p>
                </div>
              )}
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 border-b border-border pb-4 text-sm">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                <div>
                  <p className="font-medium">已生成 {generatedQuestions.length} 个问题</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {autoSave
                      ? `其中 ${savedCaseIds.length} 个已写入用例库。已保存用例请到评测中心管理。`
                      : '本次结果仅供预览，关闭后不会写入用例库。'}
                  </p>
                </div>
              </div>

              {generatedQuestions.length === 0 ? (
                <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
                  本次没有生成可用问题
                </div>
              ) : (
                <ol className="divide-y divide-border rounded-md border border-border">
                  {generatedQuestions.map((question, index) => {
                    const questionType = getQuestionType(question.metadata)
                    return (
                      <li
                        key={`${question.question}-${question.expected_answer || ''}-${questionType || ''}`}
                        className="flex min-w-0 items-start gap-3 p-4"
                      >
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="break-words text-sm font-medium leading-6">
                            {question.question}
                          </p>
                          {question.expected_answer && (
                            <p className="mt-2 break-words text-xs leading-5 text-muted-foreground">
                              <span className="font-medium text-foreground">参考答案：</span>
                              {question.expected_answer}
                            </p>
                          )}
                          {questionType && (
                            <span className="mt-2 inline-flex rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              {questionType}
                            </span>
                          )}
                        </div>
                        {!autoSave && (
                          <button
                            type="button"
                            onClick={() => handleDeleteQuestion(index)}
                            aria-label={`从预览中移除第 ${index + 1} 个问题`}
                            title="从预览中移除"
                            className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-destructive/10 hover:text-destructive focus-ring motion-reduce:transition-none"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </li>
                    )
                  })}
                </ol>
              )}
            </div>
          )}
        </div>

        <footer className="flex flex-col gap-3 border-t border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="min-h-5 text-xs text-muted-foreground" aria-live="polite">
            {isGenerating
              ? '正在生成问题，完成前请保持弹窗打开。'
              : step === 'select_source'
                ? '第 1 步，共 3 步'
                : step === 'configure'
                  ? '第 2 步，共 3 步'
                  : '第 3 步，共 3 步'}
          </div>
          <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
            {step === 'select_source' && (
              <Button type="button" onClick={() => setStep('configure')} disabled={!canContinue}>
                下一步
                <ChevronRight className="ml-1 size-4" />
              </Button>
            )}

            {step === 'configure' && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep('select_source')}
                  disabled={isGenerating}
                >
                  <ChevronLeft className="mr-1 size-4" />
                  上一步
                </Button>
                <Button type="button" onClick={handleGenerate} disabled={isGenerating}>
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin motion-reduce:animate-none" />
                      正在生成…
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 size-4" />
                      生成问题
                    </>
                  )}
                </Button>
              </>
            )}

            {step === 'preview' && (
              <>
                <Button type="button" variant="outline" onClick={() => setStep('configure')}>
                  重新生成
                </Button>
                <Button type="button" onClick={handleFinish}>
                  <CheckCircle2 className="mr-2 size-4" />
                  完成
                </Button>
              </>
            )}
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  )
}
