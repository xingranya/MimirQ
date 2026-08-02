/**
 * 主对话区域组件
 */
'use client'

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  useLayoutEffect,
} from 'react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { ArrowDown, Database, Send, StopCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useQuery } from '@tanstack/react-query'
import { useChat } from '@/hooks/use-chat'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { datasetApi, promptTemplateApi, settingsApi } from '@/lib/api'
import { ChatMessageItem } from '@/components/chat/message-item'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { VoiceModeOverlay } from '@/components/chat/voice-mode-overlay'
import { ConversationSummaryDialog } from '@/components/chat/conversation-summary-dialog'
import { RagTraceDialog } from '@/components/rag-trace/rag-trace-dialog'
import getCaretCoordinates from 'textarea-caret'
import { SlashMenu } from '@/components/chat/slash-menu'
import { globalEventBus } from '@/lib/event-bus'
import { useRouter } from '@/i18n/navigation'
import { queryKeys } from '@/lib/query-keys'
import { reportClientError } from '@/lib/client-logging'
import { useDocumentView } from '@/store/document-view'
import { BRAND_CONFIG } from '@/lib/brand'
import {
  ConversationSettingsSheet,
  type ConversationRagConfig,
} from '@/components/chat/conversation-settings-sheet'

const DEFAULT_VISIBLE_MESSAGES = 80
const LOAD_MORE_STEP = 40
const CHAT_PROMPT_TEMPLATE_PARAMS = { is_active: true, limit: 50 }

function escapeAttributeSelector(value: string): string {
  if (typeof globalThis.CSS?.escape === 'function') {
    return globalThis.CSS.escape(value)
  }
  return String(value).replace(/["\\\]]/g, String.raw`\$&`)
}

export function ChatArea({
  initialConversationId,
  initialPrompt,
  initialAutoSendPrompt,
  initialOpenRagSettings,
  onConversationId,
  onPromptConsumed,
}: Readonly<{
  initialConversationId?: string
  initialPrompt?: string
  initialAutoSendPrompt?: boolean
  initialOpenRagSettings?: boolean
  onConversationId?: (conversationId: string) => void
  onPromptConsumed?: () => void
}> = {}) {
  const router = useRouter()
  const t = useTranslations('Chat')
  const activeDocumentId = useDocumentView((state) => state.documentId)
  const [inputValue, setInputValue] = useState(() => (initialPrompt || '').trim())
  const [promptTemplateId, setPromptTemplateId] = useState<string>('')
  const [selectedDatasetId, setSelectedDatasetId] = useState('')
  const [showRagSettings, setShowRagSettings] = useState(Boolean(initialOpenRagSettings))
  const [deepReasoningEnabled, setDeepReasoningEnabled] = useState(false)
  const [hasSystemRagDefaults, setHasSystemRagDefaults] = useState(false)
  const [ragConfigDirty, setRagConfigDirty] = useState(false)
  const [ragConfig, setRagConfig] = useState<ConversationRagConfig>(() => ({
    top_k: 5,
    score_threshold: 0.7,
    retrieval_mode: 'hybrid',
    use_graph: false,
    enable_multi_query: false,
    enable_hyde: false,
    metadata_filter: undefined,
  }))
  const [metadataFilterMode, setMetadataFilterMode] = useState<'all' | 'exclude_qa' | 'qa_only' | 'custom'>('all')
  const [metadataFilterText, setMetadataFilterText] = useState('')
  const [metadataFilterError, setMetadataFilterError] = useState<string | null>(null)
  const [structuredOutput, setStructuredOutput] = useState(false)
  const [structuredPreset, setStructuredPreset] = useState<string>('')
  const [enableLongTermMemory, setEnableLongTermMemory] = useState(false)
  const [enableSummaryMemory, setEnableSummaryMemory] = useState(false)
  const [summaryDialogOpen, setSummaryDialogOpen] = useState(false)
  const [traceDialogOpen, setTraceDialogOpen] = useState(false)
  const [visibleCount, setVisibleCount] = useState(DEFAULT_VISIBLE_MESSAGES)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const prevInitialConversationIdRef = useRef<string | undefined>(initialConversationId)
  const autoScrollRef = useRef(true)
  const [isNearBottom, setIsNearBottom] = useState(true)
  const [focusedMessageId, setFocusedMessageId] = useState<string | null>(null)
  const scrollRafRef = useRef<number | null>(null)
  const scrollEventRafRef = useRef<number | null>(null)
  const focusMessageTimerRef = useRef<number | null>(null)
  const pendingPrependScrollRef = useRef<{ top: number; height: number } | null>(null)
  const autoSendPromptRef = useRef(false)
  // Slash Menu State
  const [slashOpen, setSlashOpen] = useState(false)
  const [slashPos, setSlashPos] = useState({ top: 0, left: 0 })
  const [voiceModeOpen, setVoiceModeOpen] = useState(false)
  const activeDocumentIds = useMemo(
    () => (activeDocumentId ? [activeDocumentId] : undefined),
    [activeDocumentId]
  )

  const settingsQuery = useQuery({
    queryKey: queryKeys.settings.snapshot,
    queryFn: () => settingsApi.get(),
    staleTime: 60_000,
  })

  const datasetsQuery = useQuery({
    queryKey: queryKeys.datasets.exhaustive({ purpose: 'chat-rag-settings' }),
    queryFn: () => datasetApi.listAll(),
    staleTime: 60_000,
  })

  const promptTemplatesQuery = useQuery({
    queryKey: queryKeys.prompts.list(CHAT_PROMPT_TEMPLATE_PARAMS),
    queryFn: async () => {
      const response = await promptTemplateApi.list(CHAT_PROMPT_TEMPLATE_PARAMS)
      return response.items || []
    },
    staleTime: 60_000,
  })

  const datasets = useMemo(
    () => datasetsQuery.data ?? [],
    [datasetsQuery.data]
  )
  const promptTemplates = useMemo(() => promptTemplatesQuery.data || [], [promptTemplatesQuery.data])
  const datasetsLoading = datasetsQuery.isLoading
  const focusMessageById = useCallback((messageId: string) => {
    const container = scrollContainerRef.current
    if (!container) return false

    const node = container.querySelector<HTMLElement>(
      `[data-chat-message-id="${escapeAttributeSelector(messageId)}"]`
    )
    if (!node) return false

    node.scrollIntoView({ behavior: 'smooth', block: 'center' })
    node.focus({ preventScroll: true })
    setFocusedMessageId(messageId)
    if (focusMessageTimerRef.current != null) {
      globalThis.window.clearTimeout(focusMessageTimerRef.current)
    }
    focusMessageTimerRef.current = globalThis.window.setTimeout(() => {
      setFocusedMessageId((current) => (current === messageId ? null : current))
      focusMessageTimerRef.current = null
    }, 1800)
    return true
  }, [])

  useEffect(() => {
    const system = settingsQuery.data
    if (!system || hasSystemRagDefaults) return

    setHasSystemRagDefaults(true)
    setRagConfig((prev) => {
      const isDefault =
        prev.top_k === 5 &&
        prev.score_threshold === 0.7 &&
        prev.retrieval_mode === 'hybrid' &&
        prev.use_graph === false
      if (!isDefault) return prev
      return {
        ...prev,
        top_k: system.rag?.retrieval_top_k ?? prev.top_k,
        score_threshold: system.rag?.similarity_threshold ?? prev.score_threshold,
      }
    })
  }, [hasSystemRagDefaults, settingsQuery.data])

  useEffect(() => {
    setSelectedDatasetId((current) => {
      const trimmed = String(current || '').trim()
      if (trimmed && datasets.some((dataset) => dataset.id === trimmed)) return trimmed
      return String(datasets[0]?.id || '')
    })
  }, [datasets])

  const selectedDataset = useMemo(
    () => datasets.find((dataset) => dataset.id === selectedDatasetId),
    [datasets, selectedDatasetId]
  )

  const applyMetadataFilterPreset = useCallback(
    (mode: 'all' | 'exclude_qa' | 'qa_only' | 'custom') => {
      setMetadataFilterMode(mode)
      setRagConfigDirty(true)
      setMetadataFilterError(null)

      if (mode === 'all') {
        setMetadataFilterText('')
        setRagConfig((prev) => ({ ...prev, metadata_filter: undefined }))
        return
      }

      if (mode === 'exclude_qa') {
        const filter = { file_type: { $ne: 'qa' } }
        setMetadataFilterText(JSON.stringify(filter, null, 2))
        setRagConfig((prev) => ({ ...prev, metadata_filter: filter }))
        return
      }

      if (mode === 'qa_only') {
        const filter = { file_type: { $eq: 'qa' } }
        setMetadataFilterText(JSON.stringify(filter, null, 2))
        setRagConfig((prev) => ({ ...prev, metadata_filter: filter }))
      }

      // 自定义模式保留当前文本，后续副作用会负责解析。
    },
    []
  )

  useEffect(() => {
    if (metadataFilterMode !== 'custom') return

    const raw = (metadataFilterText || '').trim()
    if (!raw) {
      setMetadataFilterError(null)
      setRagConfig((prev) => ({ ...prev, metadata_filter: undefined }))
      return
    }

    try {
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setMetadataFilterError(t('metadataFilterObjectError'))
        setRagConfig((prev) => ({ ...prev, metadata_filter: undefined }))
        return
      }
      setMetadataFilterError(null)
      setRagConfig((prev) => ({ ...prev, metadata_filter: parsed }))
    } catch {
      setMetadataFilterError(t('metadataFilterInvalidJson'))
      setRagConfig((prev) => ({ ...prev, metadata_filter: undefined }))
    }
  }, [metadataFilterMode, metadataFilterText, t])

  const handleKeyUp = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === '/') {
      const el = e.currentTarget
      const caret = getCaretCoordinates(el, el.selectionEnd)
      const rect = el.getBoundingClientRect()
      setSlashPos({
        top: rect.top + caret.top + 20, // offset
        left: rect.left + caret.left
      })
      setSlashOpen(true)
    }
  }, [])

  const handlePrefillInput = useCallback((nextValue: string) => {
    const prompt = nextValue.trim()
    if (!prompt) return

    setInputValue(prompt)
    setSlashOpen(false)

    globalThis.window.requestAnimationFrame(() => {
      const textarea = textareaRef.current
      if (!textarea) return
      textarea.focus()
      const end = prompt.length
      textarea.setSelectionRange(end, end)
    })
  }, [])

  const handleSlashSelect = useCallback((cmd: string) => {
    setSlashOpen(false)

    if (cmd === 'knowledge') {
      router.push('/knowledge')
      return
    }

    if (cmd === 'history') {
      router.push('/history')
      return
    }

    if (cmd === 'prompt') {
      handlePrefillInput(t('slashPromptSummary'))
      return
    }

    if (cmd === 'cite_analysis') {
      handlePrefillInput(t('slashPromptCiteAnalysis'))
      return
    }

    if (cmd === 'config') {
      setShowRagSettings(true)
      toast.info(t('openRagConfig'))
      return
    }

    if (cmd === 'clear') {
      setInputValue('')
      toast.info(t('clearInput'))
    }
  }, [handlePrefillInput, router, t])

  useEffect(() => {
    const unsubscribe = globalEventBus.on('chat:send', (prompt: string) => {
      setInputValue(prompt)
    })

    return () => unsubscribe()
  }, [])

  useEffect(() => {
    return () => {
      if (focusMessageTimerRef.current != null) {
        globalThis.window.clearTimeout(focusMessageTimerRef.current)
      }
    }
  }, [])

  const effectiveChatRagConfig = useMemo(() => {
    const baseConfig = ragConfigDirty || hasSystemRagDefaults ? ragConfig : {
      enable_multi_query: ragConfig.enable_multi_query,
      enable_hyde: ragConfig.enable_hyde,
    }

    if (!deepReasoningEnabled) return baseConfig

    const topK = Number.isFinite(ragConfig.top_k) ? ragConfig.top_k : 5
    return {
      ...baseConfig,
      top_k: Math.max(topK, 8),
      retrieval_mode: 'hybrid',
      enable_multi_query: true,
      multi_query_count: 3,
      enable_hyde: true,
    }
  }, [deepReasoningEnabled, hasSystemRagDefaults, ragConfig, ragConfigDirty])

  const openCommandMenu = useCallback((query = '') => {
    globalEventBus.emit('command-menu:set-open', { open: true, query })
  }, [])

  const {
    messages,
    isLoading,
    currentResponse,
    currentCitations,
    currentSteps,
    sendMessage,
    stopGeneration,
    conversationId,
    loadConversation,
    resetConversation,
  } = useChat({
    conversationId: initialConversationId,
    documentIds: activeDocumentIds,
    datasetId: activeDocumentIds?.length ? undefined : selectedDatasetId || undefined,
    promptTemplateId: promptTemplateId || undefined,
    ragConfig: effectiveChatRagConfig,
    structuredOutput,
    structuredPreset: structuredPreset || undefined,
    enableLongTermMemory,
    enableSummaryMemory,
    onConversationId,
    onError: (error) => {
      reportClientError('Chat request failed', error)
      toast.error(error || t('requestFailed'))
    },
  })

  useEffect(() => {
    const unsubscribe = globalEventBus.on('chat:focus-message', ({ messageId }) => {
      const id = String(messageId || '').trim()
      if (!id) return

      if (messages.some((message) => message.id === id)) {
        setVisibleCount((current) => Math.max(current, messages.length))
      }

      globalThis.window.requestAnimationFrame(() => {
        if (focusMessageById(id)) return
        globalThis.window.setTimeout(() => {
          focusMessageById(id)
        }, 80)
      })
    })

    return () => unsubscribe()
  }, [focusMessageById, messages])

  // Sync URL conversation -> local state
  useEffect(() => {
    const prev = (prevInitialConversationIdRef.current || '').trim()
    const desired = (initialConversationId || '').trim()
    prevInitialConversationIdRef.current = initialConversationId

    const current = (conversationId || '').trim()
    if (desired) {
      if (desired !== current) {
        loadConversation(desired).catch((err) => {
          reportClientError('Failed to load conversation', err)
        })
      }
      return
    }
    if (prev && current) {
      resetConversation()
    }
  }, [initialConversationId, conversationId, loadConversation, resetConversation])

  useEffect(() => {
    setVisibleCount(DEFAULT_VISIBLE_MESSAGES)
  }, [conversationId])

  const updateAutoScroll = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const nearBottom = distanceToBottom < 160
    autoScrollRef.current = nearBottom
    setIsNearBottom((prev) => (prev === nearBottom ? prev : nearBottom))
  }, [])

  const handleScroll = useCallback(() => {
    if (scrollEventRafRef.current != null) return
    scrollEventRafRef.current = globalThis.window.requestAnimationFrame(() => {
      scrollEventRafRef.current = null
      updateAutoScroll()
    })
  }, [updateAutoScroll])

  const scheduleScrollToBottom = useCallback((behavior: ScrollBehavior) => {
    if (!autoScrollRef.current) return
    if (scrollRafRef.current != null) return
    scrollRafRef.current = globalThis.window.requestAnimationFrame(() => {
      scrollRafRef.current = null
      messagesEndRef.current?.scrollIntoView({ behavior })
    })
  }, [])

  const jumpToBottom = useCallback(() => {
    autoScrollRef.current = true
    setIsNearBottom(true)
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const handleLoadMore = useCallback(() => {
    const el = scrollContainerRef.current
    if (el) {
      pendingPrependScrollRef.current = { top: el.scrollTop, height: el.scrollHeight }
    }
    setVisibleCount((count) => Math.min(messages.length, count + LOAD_MORE_STEP))
  }, [messages.length])

  // Preserve scroll position when revealing older messages.
  useLayoutEffect(() => {
    const pending = pendingPrependScrollRef.current
    if (!pending) return
    const el = scrollContainerRef.current
    if (!el) {
      pendingPrependScrollRef.current = null
      return
    }
    const delta = el.scrollHeight - pending.height
    el.scrollTop = pending.top + delta
    pendingPrependScrollRef.current = null
    updateAutoScroll()
  }, [visibleCount, updateAutoScroll])

  useEffect(() => {
    if (messages.length === 0) return
    scheduleScrollToBottom('smooth')
  }, [messages.length, scheduleScrollToBottom])

  useEffect(() => {
    if (!currentResponse) return
    scheduleScrollToBottom('auto')
  }, [currentResponse, scheduleScrollToBottom])

  useEffect(() => {
    updateAutoScroll()
    return () => {
      if (scrollRafRef.current != null) {
        globalThis.window.cancelAnimationFrame(scrollRafRef.current)
        scrollRafRef.current = null
      }
      if (scrollEventRafRef.current != null) {
        globalThis.window.cancelAnimationFrame(scrollEventRafRef.current)
        scrollEventRafRef.current = null
      }
    }
  }, [updateAutoScroll])

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
    }
  }, [inputValue])

  useEffect(() => {
    const p = (initialPrompt || '').trim()
    if (!p) return
    setInputValue((prev) => (prev.trim() ? prev : p))
  }, [initialPrompt])

  useEffect(() => {
    if (initialOpenRagSettings) setShowRagSettings(true)
  }, [initialOpenRagSettings])

  const hasDocumentScope = Boolean(activeDocumentIds?.length)
  const hasChatScope = hasDocumentScope || Boolean(selectedDatasetId)
  const datasetScopeReady = hasDocumentScope || !datasetsLoading

  const hiddenCount = Math.max(0, messages.length - visibleCount)
  const visibleMessages = useMemo(
    () => messages.slice(-visibleCount),
    [messages, visibleCount]
  )

  const submitMessage = useCallback((nextMessage: string) => {
    if (!nextMessage.trim() || isLoading) return false
    if (!hasChatScope) {
      toast.error(datasetsLoading ? t('datasetScopeLoading') : t('datasetScopeRequired'))
      return false
    }
    sendMessage(nextMessage)
    return true
  }, [datasetsLoading, hasChatScope, isLoading, sendMessage, t])

  const handleSend = useCallback(() => {
    if (!submitMessage(inputValue)) return
    setInputValue('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }, [inputValue, submitMessage])

  useEffect(() => {
    const unsubscribe = globalEventBus.on('chat:submit', (payload: string) => {
      const prompt = payload.trim()
      if (!prompt) return
      if (submitMessage(prompt)) {
        setInputValue('')
        if (textareaRef.current) textareaRef.current.style.height = 'auto'
        return
      }
      setInputValue(prompt)
    })

    return () => unsubscribe()
  }, [submitMessage])

  useEffect(() => {
    const p = (initialPrompt || '').trim()
    if (!initialAutoSendPrompt || !p) return
    if (autoSendPromptRef.current) return
    if (isLoading) return
    if (!datasetScopeReady || !hasChatScope) return

    if (!submitMessage(p)) return
    autoSendPromptRef.current = true
    setInputValue('')
    onPromptConsumed?.()
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [datasetScopeReady, hasChatScope, initialAutoSendPrompt, initialPrompt, isLoading, onPromptConsumed, submitMessage])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const handleRagConfigChange = useCallback((patch: Partial<ConversationRagConfig>) => {
    setRagConfigDirty(true)
    setRagConfig((current) => ({ ...current, ...patch }))
  }, [])

  const isWelcomeState = messages.length === 0 && !isLoading

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-background relative transition-colors duration-200 motion-reduce:transition-none">
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className={cn(
          'flex-1 overflow-y-auto overscroll-contain px-4 pb-4 scroll-smooth no-scrollbar md:px-6',
          isWelcomeState && 'overflow-hidden'
        )}
        role="log"
        aria-live="polite"
        aria-busy={isLoading}
      >
        <div
          className={cn(
            'mx-auto flex min-h-full w-full flex-col py-8 md:py-10',
            isWelcomeState ? 'max-w-6xl' : 'max-w-[44rem]'
          )}
        >
          {isWelcomeState && (
            <div className="flex-1 flex justify-center">
              <WelcomeScreen />
            </div>
          )}

          {hiddenCount > 0 && (
            <div className="flex justify-center py-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLoadMore}
                className="rounded-md text-xs text-muted-foreground hover:bg-secondary"
              >
                {t('showEarlierMessages')}（{hiddenCount}）
              </Button>
            </div>
          )}

          <div className="space-y-6">
            {visibleMessages.map((message) => (
              <div
                key={message.id}
                data-chat-message-id={message.id}
                tabIndex={-1}
                className={cn(
                  'rounded-lg outline-none transition-shadow duration-300 motion-reduce:transition-none motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-200 motion-safe:ease-out',
                  focusedMessageId === message.id && 'ring-2 ring-primary/35 ring-offset-2 ring-offset-background shadow-lg shadow-primary/10'
                )}
              >
                <ChatMessageItem message={message} />
              </div>
            ))}

            {isLoading && (
              <ChatMessageItem
                message={{
                  id: 'streaming',
                  role: 'assistant',
                  content: currentResponse,
                  citations: currentCitations,
                  steps: currentSteps,
                  created_at: new Date().toISOString(),
                }}
                isStreaming
              />
            )}
          </div>

          <div ref={messagesEndRef} className="h-4" />
        </div>
      </div>

      {!isNearBottom && (messages.length > 0 || Boolean(currentResponse)) && (
        <div className="flex shrink-0 justify-center px-4 py-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={jumpToBottom}
            className="rounded-md border border-border"
            aria-label={t('jumpToLatestMessage')}
            title={t('jumpToLatestMessage')}
          >
            <ArrowDown className="size-4 mr-1" />
            {t('jumpToLatest')}
          </Button>
        </div>
      )}

      <div
        className="z-10 shrink-0 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-2 md:px-6"
      >
        <div className="mx-auto w-full max-w-[48rem]">
          <div
            aria-label={t('conversationSettings')}
            className="mb-2 flex items-center justify-between gap-2"
          >
            <div className="min-w-0">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={t('selectDataset')}
                    className="h-8 max-w-full gap-2 rounded-md border border-border bg-background px-3 text-foreground hover:border-primary/40 hover:bg-muted md:max-w-[14rem]"
                  >
                    <Database className="w-3.5 h-3.5 text-primary" />
                    <span className="max-w-[12rem] truncate text-xs">
                      {hasDocumentScope
                        ? t('currentDocumentScope')
                        : selectedDataset?.name || (datasetsLoading ? t('datasetScopeLoading') : t('selectDataset'))}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-2" align="start">
                  <div className="px-2 pb-2">
                    <div className="text-xs font-medium text-muted-foreground">{t('selectDataset')}</div>
                    <div className="mt-1 text-[11px] text-muted-foreground/80">{t('datasetScopeHint')}</div>
                  </div>
                  <div className="max-h-60 overflow-y-auto overscroll-contain no-scrollbar space-y-1">
                    {datasetsLoading ? (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">{t('datasetScopeLoading')}</div>
                    ) : datasets.length === 0 ? (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">{t('datasetScopeEmpty')}</div>
                    ) : (
                      datasets.map((dataset) => (
                        <button
                          type="button"
                          key={dataset.id}
                          className={cn(
                            'flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary',
                            selectedDatasetId === dataset.id && 'bg-secondary/50 font-medium text-primary'
                          )}
                          onClick={() => setSelectedDatasetId(dataset.id)}
                        >
                          <span className="truncate">{dataset.name}</span>
                          {dataset.description ? (
                            <span className="truncate text-[11px] text-muted-foreground/70">{dataset.description}</span>
                          ) : null}
                        </button>
                      ))
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <ConversationSettingsSheet
                conversationId={conversationId}
                deepReasoningEnabled={deepReasoningEnabled}
                enableLongTermMemory={enableLongTermMemory}
                enableSummaryMemory={enableSummaryMemory}
                metadataFilterError={metadataFilterError}
                metadataFilterMode={metadataFilterMode}
                metadataFilterText={metadataFilterText}
                onDeepReasoningChange={setDeepReasoningEnabled}
                onLongTermMemoryChange={setEnableLongTermMemory}
                onMetadataFilterModeChange={applyMetadataFilterPreset}
                onMetadataFilterTextChange={(value) => {
                  setRagConfigDirty(true)
                  setMetadataFilterText(value)
                }}
                onOpenChange={setShowRagSettings}
                onOpenSummary={() => {
                  setShowRagSettings(false)
                  setSummaryDialogOpen(true)
                }}
                onOpenTools={() => {
                  setShowRagSettings(false)
                  openCommandMenu('/')
                }}
                onOpenTrace={() => {
                  setShowRagSettings(false)
                  setTraceDialogOpen(true)
                }}
                onOpenVoice={() => {
                  setShowRagSettings(false)
                  setVoiceModeOpen(true)
                }}
                onPromptTemplateChange={setPromptTemplateId}
                onRagConfigChange={handleRagConfigChange}
                onStructuredOutputChange={setStructuredOutput}
                onStructuredPresetChange={setStructuredPreset}
                onSummaryMemoryChange={setEnableSummaryMemory}
                open={showRagSettings}
                promptTemplateId={promptTemplateId}
                promptTemplates={promptTemplates}
                ragConfig={ragConfig}
                structuredOutput={structuredOutput}
                structuredPreset={structuredPreset}
            />
          </div>

          <div className="relative overflow-hidden rounded-lg border border-border bg-background transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
            <Label htmlFor="chat-composer" className="sr-only">
              {t('messageInput')}
            </Label>
            <textarea
              id="chat-composer"
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onKeyUp={handleKeyUp}
              placeholder={t('composerPlaceholder')}
              autoFocus
              className="max-h-[200px] min-h-24 w-full resize-none bg-transparent px-4 pb-14 pt-3 pr-16 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/70 no-scrollbar"
              rows={1}
            />

            <div className="absolute bottom-3 right-3">
              {isLoading ? (
                <Button
                  size="icon"
                  variant="outline"
                  onClick={stopGeneration}
                  className="size-9 rounded-md border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  title={t('stopGeneration')}
                  aria-label={t('stopGeneration')}
                >
                  <StopCircle className="size-4" />
                </Button>
              ) : (
                <Button
                  size="icon"
                  onClick={handleSend}
                  disabled={!inputValue.trim() || !hasChatScope}
                  className="size-9 rounded-md"
                  title={hasChatScope ? t('send') : (datasetsLoading ? t('datasetScopeLoading') : t('datasetScopeRequired'))}
                  aria-label={t('send')}
                >
                  <Send className="size-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <SlashMenu
        open={slashOpen}
        onOpenChange={setSlashOpen}
        onSelect={handleSlashSelect}
        position={slashPos}
      />

      <VoiceModeOverlay
        isOpen={voiceModeOpen}
        onClose={() => setVoiceModeOpen(false)}
        onSend={(text) => {
          if (submitMessage(text)) {
            setVoiceModeOpen(false)
          }
        }}
      />

      <ConversationSummaryDialog
        open={summaryDialogOpen}
        onOpenChange={setSummaryDialogOpen}
        conversationId={conversationId}
      />
      <RagTraceDialog
        open={traceDialogOpen}
        onOpenChange={setTraceDialogOpen}
        conversationId={conversationId ?? null}
      />
    </div>
  )
}

function WelcomeScreen() {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col items-center justify-center px-4 py-8 md:px-8">
      <div className="flex flex-col items-center space-y-3 text-center animate-fade-in-up">
        <div className="flex w-full justify-center">
          <Image
            src={BRAND_CONFIG.wordmarkSrc}
            alt={BRAND_CONFIG.name}
            width={300}
            height={80}
            priority
            unoptimized
            className="h-auto w-[min(72vw,300px)] select-none object-contain"
          />
        </div>
        <p className="text-sm text-muted-foreground">{BRAND_CONFIG.assistantName}</p>
      </div>
    </div>
  )
}
