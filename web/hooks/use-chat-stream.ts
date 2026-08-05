'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import type { Citation, Message, StreamEvent } from '@/types'
import { API_LONG_TIMEOUT_MS, API_TIMEOUT_MS } from '@/lib/env'
import { chatApi } from '@/lib/api'
import { reportClientError, reportClientWarning } from '@/lib/client-logging'
import { toTrimmedPrimitiveString } from '@/lib/primitive-text'
import { createStreamDiagnostics, utf8ByteLength, type StreamDiagnostics } from '@/lib/stream-diagnostics'

import {
  buildChatRequest,
  buildDoneAssistantMessage,
  buildFallbackAssistantMessage,
  getAssistantMessageId,
  getCitations,
  getConversationId,
  getHistory,
  getStepList,
  getStreamEventMessage,
  getTokenContent,
  type ChatRagConfig,
} from './use-chat-formatter'
import { recoverStreamedAssistantMessage } from './use-chat-stream-recovery'

type MutableRef<T> = {
  current: T
}

const CURRENT_RESPONSE_FRAME_CHARS = 120

type UseChatStreamOptions = {
  conversationId?: string
  setConversationId: (conversationId: string | undefined) => void
  messagesRef: MutableRef<Message[]>
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
  documentIds?: string[]
  datasetId?: string
  promptTemplateId?: string
  ragConfig?: ChatRagConfig
  structuredOutput?: boolean
  structuredPreset?: string
  enableLongTermMemory?: boolean
  enableSummaryMemory?: boolean
  onConversationId?: (conversationId: string) => void
  onError?: (error: string) => void
}

function parseStreamEvent(jsonStr: string): StreamEvent | null {
  try {
    return JSON.parse(jsonStr) as StreamEvent
  } catch (err) {
    reportClientError('Failed to parse SSE event', err)
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function useChatStream({
  conversationId,
  setConversationId,
  messagesRef,
  setMessages,
  documentIds,
  datasetId,
  promptTemplateId,
  ragConfig,
  structuredOutput,
  structuredPreset,
  enableLongTermMemory,
  enableSummaryMemory,
  onConversationId,
  onError,
}: UseChatStreamOptions) {
  const [isLoading, setIsLoading] = useState(false)
  const [currentResponse, setCurrentResponse] = useState('')
  const [currentCitations, setCurrentCitations] = useState<Citation[]>([])
  const [currentSteps, setCurrentSteps] = useState<string[]>([])

  const abortControllerRef = useRef<AbortController | null>(null)
  const activeConversationIdRef = useRef<string | undefined>(conversationId)
  const fullResponseRef = useRef('')
  const visibleResponseRef = useRef('')
  const currentStepsRef = useRef<string[]>([])
  const currentCitationsRef = useRef<Citation[]>([])
  const rafIdRef = useRef<number | null>(null)
  const responseRenderWaitersRef = useRef<Array<() => void>>([])
  const streamRequestIdRef = useRef<string | null>(null)
  const stopActiveRequestRef = useRef<(() => void) | null>(null)
  const streamDiagnosticsRef = useRef<StreamDiagnostics | null>(null)
  const renderedResponseLengthRef = useRef(0)

  const clearRaf = useCallback(() => {
    if (rafIdRef.current != null) {
      globalThis.window.cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
    }
  }, [])

  const resolveResponseRenderWaiters = useCallback(() => {
    const waiters = responseRenderWaitersRef.current
    responseRenderWaitersRef.current = []
    for (const resolve of waiters) resolve()
  }, [])

  const resetTransientState = useCallback(() => {
    clearRaf()
    resolveResponseRenderWaiters()
    setCurrentResponse('')
    setCurrentCitations([])
    setCurrentSteps([])
    streamRequestIdRef.current = null
    fullResponseRef.current = ''
    visibleResponseRef.current = ''
    currentStepsRef.current = []
    currentCitationsRef.current = []
  }, [clearRaf, resolveResponseRenderWaiters])

  useEffect(() => {
    activeConversationIdRef.current = conversationId
  }, [conversationId])

  useEffect(() => {
    if (!currentResponse) {
      renderedResponseLengthRef.current = 0
      return
    }

    const previousLength = renderedResponseLengthRef.current
    const addedContent = currentResponse.slice(previousLength)
    renderedResponseLengthRef.current = currentResponse.length
    streamDiagnosticsRef.current?.record('ui_render', utf8ByteLength(addedContent))
  }, [currentResponse])

  useEffect(() => {
    return () => {
      stopActiveRequestRef.current?.()
      abortControllerRef.current?.abort()
      clearRaf()
    }
  }, [clearRaf])

  const flushCurrentResponseUpdate = useCallback(() => {
    clearRaf()
    const targetResponse = fullResponseRef.current
    if (visibleResponseRef.current !== targetResponse) {
      visibleResponseRef.current = targetResponse
      setCurrentResponse(targetResponse)
    }
    resolveResponseRenderWaiters()
  }, [clearRaf, resolveResponseRenderWaiters])

  const scheduleCurrentResponseUpdate = useCallback(() => {
    if (rafIdRef.current != null) return
    if (globalThis.document.hidden) {
      flushCurrentResponseUpdate()
      return
    }

    const renderNextFrame = () => {
      rafIdRef.current = globalThis.window.requestAnimationFrame(() => {
        rafIdRef.current = null
        const targetResponse = fullResponseRef.current
        const nextLength = Math.min(
          targetResponse.length,
          visibleResponseRef.current.length + CURRENT_RESPONSE_FRAME_CHARS
        )
        if (nextLength > visibleResponseRef.current.length) {
          const nextResponse = targetResponse.slice(0, nextLength)
          visibleResponseRef.current = nextResponse
          setCurrentResponse(nextResponse)
        }

        if (visibleResponseRef.current.length < fullResponseRef.current.length) {
          renderNextFrame()
        } else {
          resolveResponseRenderWaiters()
        }
      })
    }

    renderNextFrame()
  }, [flushCurrentResponseUpdate, resolveResponseRenderWaiters])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (globalThis.document.hidden) flushCurrentResponseUpdate()
    }
    globalThis.document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => globalThis.document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [flushCurrentResponseUpdate])

  const waitForCurrentResponseUpdate = useCallback(async () => {
    if (visibleResponseRef.current.length >= fullResponseRef.current.length && rafIdRef.current == null) return
    scheduleCurrentResponseUpdate()
    await new Promise<void>((resolve) => {
      responseRenderWaitersRef.current.push(resolve)
    })
  }, [scheduleCurrentResponseUpdate])

  const appendStep = useCallback((message: string | null) => {
    if (!message) return
    const nextSteps = [...currentStepsRef.current, message]
    currentStepsRef.current = nextSteps
    setCurrentSteps(nextSteps)
  }, [])

  const updateConversation = useCallback(
    (nextConversationId: string) => {
      if (!nextConversationId || nextConversationId === (conversationId || '')) return
      activeConversationIdRef.current = nextConversationId
      setConversationId(nextConversationId)
      onConversationId?.(nextConversationId)
    },
    [conversationId, onConversationId, setConversationId]
  )

  const stopGeneration = useCallback(() => {
    stopActiveRequestRef.current?.()
  }, [])

  const sendMessage = useCallback(
    async (message: string) => {
      if (!message.trim() || isLoading || abortControllerRef.current) return

      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: message,
        created_at: new Date().toISOString(),
      }

      setMessages((prev) => [...prev, userMessage])
      setIsLoading(true)
      resetTransientState()

      const controller = new AbortController()
      abortControllerRef.current = controller
      let userStopped = false
      const stopActiveRequest = () => {
        userStopped = true
        controller.abort()
      }
      stopActiveRequestRef.current = stopActiveRequest

      let didTimeout = false
      let timeoutId: number | undefined
      const armTimeout = (timeoutMs: number) => {
        if (timeoutId !== undefined) globalThis.window.clearTimeout(timeoutId)
        timeoutId = globalThis.window.setTimeout(() => {
          didTimeout = true
          controller.abort()
        }, timeoutMs)
      }
      armTimeout(API_TIMEOUT_MS)

      try {
        const effectiveRagConfig = ragConfig
        const useGraph = Boolean(effectiveRagConfig?.use_graph)
        const chatRequest = buildChatRequest({
          conversationId,
          message,
          history: getHistory(messagesRef.current),
          documentIds,
          datasetId,
          promptTemplateId,
          structuredOutput,
          structuredPreset,
          enableLongTermMemory,
          enableSummaryMemory,
          ragConfig: effectiveRagConfig,
          useGraph,
        })

        let citations: Citation[] = []
        let sawFirstEvent = false
        let sawDone = false
        let streamAccepted = false
        let streamError: Error | null = null
        let doneEvent: { data: Record<string, unknown>; requestId?: string } | null = null
        let doneCommitted = false
        const streamDiagnostics = createStreamDiagnostics()
        streamDiagnosticsRef.current = streamDiagnostics

        const commitDoneMessage = async () => {
          if (!doneEvent || doneCommitted) return
          doneCommitted = true
          await waitForCurrentResponseUpdate()

          const { data: doneData, requestId } = doneEvent
          updateConversation(getConversationId(doneData.conversation_id))
          const assistantMessage = buildDoneAssistantMessage({
            assistantMessageId: getAssistantMessageId(doneData.assistant_message_id || doneData.message_id),
            content: fullResponseRef.current,
            citations,
            steps: getStepList(currentStepsRef.current),
            doneData,
            structuredOutput,
            requestId,
          })

          setMessages((prev) => [...prev, assistantMessage])
          resetTransientState()
        }

        try {
          await chatApi.streamChat(
            chatRequest,
            (jsonStr) => {
              sawFirstEvent = true
              armTimeout(API_LONG_TIMEOUT_MS)

              const event = parseStreamEvent(jsonStr)
              if (!event) return

              if (event.type === 'citations') {
                citations = getCitations(event.data)
                currentCitationsRef.current = citations
                setCurrentCitations(citations)
                return
              }

              const stepMessage = getStreamEventMessage(event.type, event.data)
              if (stepMessage) {
                appendStep(stepMessage)
                return
              }

              if (event.type === 'token') {
                fullResponseRef.current += getTokenContent(event.data)
                scheduleCurrentResponseUpdate()
                return
              }

              if (event.type === 'done') {
                if (timeoutId !== undefined) globalThis.window.clearTimeout(timeoutId)
                sawDone = true
                doneEvent = {
                  data: isRecord(event.data) ? event.data : {},
                  requestId: event.request_id,
                }
                return
              }

              if (event.type === 'error') {
                const payload = isRecord(event.data) ? event.data : {}
                streamError = new Error(toTrimmedPrimitiveString(payload.message, 'Unknown error'))
              }
            },
            {
              signal: controller.signal,
              onOpen: ({ requestId, conversationId: openedConversationId }) => {
                streamAccepted = true
                streamRequestIdRef.current = requestId
                armTimeout(API_LONG_TIMEOUT_MS)
                if (openedConversationId) {
                  activeConversationIdRef.current = openedConversationId
                  updateConversation(openedConversationId)
                }
              },
              diagnostics: streamDiagnostics,
            }
          )

          if (streamError) throw streamError
          if (!sawFirstEvent || !sawDone) {
            throw new Error('SSE stream ended unexpectedly')
          }
          await commitDoneMessage()
        } catch (streamErr) {
          const streamWasAborted = (streamErr as { name?: string })?.name === 'AbortError'
          if (streamError) throw streamError
          if (streamWasAborted && (!streamAccepted || userStopped)) throw streamErr

          if (sawDone) {
            reportClientWarning('SSE closed after done', streamErr)
            await commitDoneMessage()
          } else if (streamAccepted && !streamError) {
            const recoveredMessage = await recoverStreamedAssistantMessage({
              conversationId: String(activeConversationIdRef.current || ''),
              requestId: String(streamRequestIdRef.current || ''),
              getMessages: (nextConversationId, params) => chatApi.getMessages(nextConversationId, params),
            })

            if (recoveredMessage) {
              setMessages((prev) => {
                if (prev.some((item) => item.id === recoveredMessage.id)) return prev
                return [...prev, recoveredMessage]
              })
              resetTransientState()
            } else if (streamWasAborted && didTimeout) {
              throw streamErr
            } else {
              throw new Error('Chat stream interrupted before completion and could not be recovered')
            }
          } else {
            reportClientWarning('SSE unavailable; falling back to non-streaming chat', streamErr)
            armTimeout(API_LONG_TIMEOUT_MS)

            const response = await chatApi.chat(chatRequest, { signal: controller.signal })
            if (timeoutId !== undefined) globalThis.window.clearTimeout(timeoutId)

            updateConversation(getConversationId(response.conversation_id))
            setMessages((prev) => [
              ...prev,
              buildFallbackAssistantMessage({
                response,
                structuredOutput,
                structuredPreset,
              }),
            ])
            resetTransientState()
          }
        }

      } catch (err) {
        const maybeError = err as { name?: string; code?: string; message?: string }
        const isAbort =
          maybeError?.name === 'AbortError' || maybeError?.name === 'CanceledError' || maybeError?.code === 'ERR_CANCELED'

        if (isAbort) {
          if (didTimeout) {
            onError?.('Request timed out')
          } else if (userStopped) {
            // User stopped generation: preserve whatever was already streamed
            // instead of letting the in-flight bubble vanish once isLoading
            // flips to false. Commit the partial answer as a stopped message.
            const partialContent = fullResponseRef.current
            if (partialContent) {
              setMessages((prev) => [
                ...prev,
                {
                  id: Date.now().toString(),
                  role: 'assistant',
                  content: partialContent,
                  citations: currentCitationsRef.current,
                  steps: getStepList(currentStepsRef.current),
                  message_metadata: { stopped: true },
                  created_at: new Date().toISOString(),
                },
              ])
            }
            resetTransientState()
          } else {
            onError?.(maybeError?.message || 'Failed to send message')
          }
        } else {
          reportClientError('Chat request failed', err)
          onError?.(maybeError?.message || 'Failed to send message')
        }
      } finally {
        if (timeoutId !== undefined) globalThis.window.clearTimeout(timeoutId)
        clearRaf()
        if (abortControllerRef.current === controller) {
          setIsLoading(false)
          abortControllerRef.current = null
        }
        if (stopActiveRequestRef.current === stopActiveRequest) {
          stopActiveRequestRef.current = null
        }
      }
    },
    [
      appendStep,
      clearRaf,
      conversationId,
      datasetId,
      documentIds,
      enableLongTermMemory,
      enableSummaryMemory,
      isLoading,
      messagesRef,
      onError,
      promptTemplateId,
      ragConfig,
      resetTransientState,
      scheduleCurrentResponseUpdate,
      setMessages,
      structuredOutput,
      structuredPreset,
      updateConversation,
      waitForCurrentResponseUpdate,
    ]
  )

  return {
    isLoading,
    currentResponse,
    currentCitations,
    currentSteps,
    sendMessage,
    stopGeneration,
    resetTransientState,
  }
}
