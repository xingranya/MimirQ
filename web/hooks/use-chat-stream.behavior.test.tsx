// @vitest-environment happy-dom

import React, { act, useRef, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Message } from '@/types'
import { API_LONG_TIMEOUT_MS, API_TIMEOUT_MS } from '@/lib/env'
import { renderHook, waitForAssertion } from '@/test/hook-harness'

const chatApiMock = vi.hoisted(() => ({
  chat: vi.fn(),
  getMessages: vi.fn(),
  streamChat: vi.fn(),
}))

const recoveryMock = vi.hoisted(() => ({
  recoverStreamedAssistantMessage: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  chatApi: chatApiMock,
}))

vi.mock('@/lib/client-logging', () => ({
  reportClientError: vi.fn(),
  reportClientWarning: vi.fn(),
}))

vi.mock('./use-chat-stream-recovery', () => recoveryMock)

import { useChatStream } from './use-chat-stream'

function createAbortError() {
  const error = new Error('aborted')
  error.name = 'AbortError'
  return error
}

function createAssistantMessage(id: string, requestId: string, content: string): Message {
  return {
    id,
    role: 'assistant',
    content,
    created_at: '2026-07-24T00:00:00Z',
    message_metadata: {
      request_id: requestId,
    },
  }
}

function createFallbackResponse() {
  return {
    assistant_message_id: 'assistant-fallback',
    request_id: 'req-fallback-chat',
    conversation_id: 'conv-fallback',
    content: 'fallback answer',
    citations: [],
    total_tokens: 0,
    total_chars: 15,
    metrics: {},
    structured: false,
  }
}

function renderChatStreamHook(onError = vi.fn()) {
  return renderHook(() => {
    const [conversationId, setConversationId] = useState<string | undefined>()
    const [messages, setMessages] = useState<Message[]>([])
    const messagesRef = useRef(messages)
    messagesRef.current = messages

    const stream = useChatStream({
      conversationId,
      setConversationId,
      messagesRef,
      setMessages,
      onError,
    })

    return {
      ...stream,
      conversationId,
      messages,
    }
  })
}

describe('useChatStream accepted-stream recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      return globalThis.setTimeout(() => callback(0), 0)
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      globalThis.clearTimeout(id)
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('keeps an accepted stream alive past the short timeout before the first event', async () => {
    vi.useFakeTimers()
    const onError = vi.fn()
    let rejectStream: ((reason?: unknown) => void) | null = null

    chatApiMock.streamChat.mockImplementation(async (_request: unknown, _onJson: unknown, options?: { signal?: AbortSignal; onOpen?: (meta: { requestId: string; conversationId?: string }) => void }) => {
      options?.onOpen?.({ requestId: 'req-accepted', conversationId: 'conv-accepted' })
      return await new Promise<never>((_resolve, reject) => {
        rejectStream = reject
        options?.signal?.addEventListener('abort', () => reject(createAbortError()), { once: true })
      })
    })
    recoveryMock.recoverStreamedAssistantMessage.mockResolvedValue(
      createAssistantMessage('assistant-recovered', 'req-accepted', 'recovered answer')
    )

    const hook = renderChatStreamHook(onError)

    act(() => {
      void hook.result.current.sendMessage('hello')
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(hook.result.current.isLoading).toBe(true)

    await act(async () => {
      vi.advanceTimersByTime(API_TIMEOUT_MS + 1)
      await Promise.resolve()
    })

    expect(recoveryMock.recoverStreamedAssistantMessage).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
    expect(hook.result.current.isLoading).toBe(true)

    await act(async () => {
      rejectStream?.(createAbortError())
      await Promise.resolve()
    })

    await waitForAssertion(() => {
      expect(recoveryMock.recoverStreamedAssistantMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 'conv-accepted',
          requestId: 'req-accepted',
        })
      )
      expect(hook.result.current.messages.at(-1)).toMatchObject({
        id: 'assistant-recovered',
        content: 'recovered answer',
      })
      expect(hook.result.current.isLoading).toBe(false)
    })

    expect(chatApiMock.chat).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
    hook.unmount()
  })

  it('times out an accepted stream that never emits an event', async () => {
    vi.useFakeTimers()
    const onError = vi.fn()

    chatApiMock.streamChat.mockImplementation(async (_request: unknown, _onJson: unknown, options?: { signal?: AbortSignal; onOpen?: (meta: { requestId: string; conversationId?: string }) => void }) => {
      options?.onOpen?.({ requestId: 'req-silent', conversationId: 'conv-silent' })
      return await new Promise<never>((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => reject(createAbortError()), { once: true })
      })
    })
    recoveryMock.recoverStreamedAssistantMessage.mockResolvedValue(null)

    const hook = renderChatStreamHook(onError)

    act(() => {
      void hook.result.current.sendMessage('hello')
    })

    await act(async () => {
      await Promise.resolve()
      vi.advanceTimersByTime(API_LONG_TIMEOUT_MS + 1)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(onError).toHaveBeenCalledWith('Request timed out')
    expect(hook.result.current.isLoading).toBe(false)
    hook.unmount()
  })

  it('does not replay an accepted request when recovery finds nothing', async () => {
    const onError = vi.fn()
    let rejectStream: ((reason?: unknown) => void) | null = null

    chatApiMock.streamChat.mockImplementation(async (_request: unknown, _onJson: unknown, options?: { signal?: AbortSignal; onOpen?: (meta: { requestId: string; conversationId?: string }) => void }) => {
      options?.onOpen?.({ requestId: 'req-stream', conversationId: 'conv-stream' })
      return await new Promise<never>((_resolve, reject) => {
        rejectStream = reject
        options?.signal?.addEventListener('abort', () => reject(createAbortError()), { once: true })
      })
    })
    recoveryMock.recoverStreamedAssistantMessage.mockResolvedValue(null)

    const hook = renderChatStreamHook(onError)

    act(() => {
      void hook.result.current.sendMessage('hello')
    })

    await act(async () => {
      rejectStream?.(createAbortError())
      await Promise.resolve()
    })

    await waitForAssertion(() => {
      expect(recoveryMock.recoverStreamedAssistantMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 'conv-stream',
          requestId: 'req-stream',
        })
      )
      expect(onError).toHaveBeenCalledWith(
        'Chat stream interrupted before completion and could not be recovered'
      )
    })

    expect(chatApiMock.chat).not.toHaveBeenCalled()
    hook.unmount()
  })

  it('does not replay a request after the accepted stream reports an error', async () => {
    const onError = vi.fn()

    chatApiMock.streamChat.mockImplementation(
      async (
        _request: unknown,
        onJson: (json: string) => void,
        options?: {
          onOpen?: (meta: { requestId: string; conversationId?: string }) => void
        }
      ) => {
        options?.onOpen?.({ requestId: 'req-error', conversationId: 'conv-error' })
        onJson(JSON.stringify({ type: 'error', data: { message: '模型服务暂不可用' } }))
        return { requestId: 'req-error', conversationId: 'conv-error' }
      }
    )

    const hook = renderChatStreamHook(onError)

    act(() => {
      void hook.result.current.sendMessage('hello')
    })

    await waitForAssertion(() => {
      expect(onError).toHaveBeenCalledWith('模型服务暂不可用')
      expect(hook.result.current.isLoading).toBe(false)
    })

    expect(chatApiMock.chat).not.toHaveBeenCalled()
    expect(recoveryMock.recoverStreamedAssistantMessage).not.toHaveBeenCalled()
    hook.unmount()
  })

  it('ignores a second send before the loading state rerenders', async () => {
    chatApiMock.streamChat.mockImplementation(async (_request: unknown, _onJson: unknown, options?: { signal?: AbortSignal }) => {
      return await new Promise<never>((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => reject(createAbortError()), { once: true })
      })
    })

    const hook = renderChatStreamHook()

    act(() => {
      void hook.result.current.sendMessage('first')
      void hook.result.current.sendMessage('second')
    })

    expect(chatApiMock.streamChat).toHaveBeenCalledTimes(1)
    expect(hook.result.current.messages.filter((message) => message.role === 'user')).toHaveLength(1)

    act(() => {
      hook.result.current.stopGeneration()
    })
    await waitForAssertion(() => {
      expect(hook.result.current.isLoading).toBe(false)
    })
    hook.unmount()
  })

  it('preserves user-stop semantics for partial streamed content', async () => {
    const onError = vi.fn()

    chatApiMock.streamChat.mockImplementation(async (_request: unknown, onJson: (json: string) => void, options?: { signal?: AbortSignal; onOpen?: (meta: { requestId: string; conversationId?: string }) => void }) => {
      options?.onOpen?.({ requestId: 'req-stop', conversationId: 'conv-stop' })
      onJson(JSON.stringify({ type: 'token', data: { content: 'partial answer' } }))
      return await new Promise<never>((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => reject(createAbortError()), { once: true })
      })
    })

    const hook = renderChatStreamHook(onError)

    act(() => {
      void hook.result.current.sendMessage('hello')
    })

    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      hook.result.current.stopGeneration()
    })

    await waitForAssertion(() => {
      expect(hook.result.current.messages.at(-1)).toMatchObject({
        role: 'assistant',
        content: 'partial answer',
        message_metadata: { stopped: true },
      })
      expect(hook.result.current.isLoading).toBe(false)
    })

    expect(recoveryMock.recoverStreamedAssistantMessage).not.toHaveBeenCalled()
    expect(chatApiMock.chat).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
    hook.unmount()
  })

  it('在 done 前至少呈现两次可见增量', async () => {
    let emitEvent: ((json: string) => void) | undefined
    let finishStream: (() => void) | undefined

    chatApiMock.streamChat.mockImplementation(async (_request: unknown, onJson: (json: string) => void, options?: { onOpen?: (meta: { requestId: string; conversationId?: string }) => void }) => {
      options?.onOpen?.({ requestId: 'req-incremental', conversationId: 'conv-incremental' })
      emitEvent = onJson
      await new Promise<void>((resolve) => {
        finishStream = resolve
      })
      return { requestId: 'req-incremental', conversationId: 'conv-incremental' }
    })

    const hook = renderChatStreamHook()
    act(() => {
      void hook.result.current.sendMessage('hello')
    })

    await waitForAssertion(() => expect(emitEvent).toBeTypeOf('function'))

    act(() => {
      emitEvent?.(JSON.stringify({ type: 'token', data: { content: '第一段' } }))
    })
    await waitForAssertion(() => expect(hook.result.current.currentResponse).toBe('第一段'))

    act(() => {
      emitEvent?.(JSON.stringify({ type: 'token', data: { content: '，第二段' } }))
    })
    await waitForAssertion(() => expect(hook.result.current.currentResponse).toBe('第一段，第二段'))
    expect(hook.result.current.messages.filter((message) => message.role === 'assistant')).toHaveLength(0)

    act(() => {
      emitEvent?.(JSON.stringify({
        type: 'done',
        data: {
          assistant_message_id: 'assistant-incremental',
          conversation_id: 'conv-incremental',
        },
      }))
      finishStream?.()
    })

    await waitForAssertion(() => {
      expect(hook.result.current.messages.at(-1)).toMatchObject({
        id: 'assistant-incremental',
        content: '第一段，第二段',
      })
      expect(hook.result.current.isLoading).toBe(false)
    })
    hook.unmount()
  })

  it('网络合并大块 token 时仍按帧呈现正文', async () => {
    const frames: Array<{ id: number; callback: FrameRequestCallback }> = []
    let nextFrameId = 0
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      nextFrameId += 1
      frames.push({ id: nextFrameId, callback })
      return nextFrameId
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      const index = frames.findIndex((frame) => frame.id === id)
      if (index >= 0) frames.splice(index, 1)
    })

    let emitEvent: ((json: string) => void) | undefined
    let finishStream: (() => void) | undefined
    chatApiMock.streamChat.mockImplementation(async (_request: unknown, onJson: (json: string) => void, options?: { onOpen?: (meta: { requestId: string; conversationId?: string }) => void }) => {
      options?.onOpen?.({ requestId: 'req-merged', conversationId: 'conv-merged' })
      emitEvent = onJson
      await new Promise<void>((resolve) => {
        finishStream = resolve
      })
      return { requestId: 'req-merged', conversationId: 'conv-merged' }
    })

    const hook = renderChatStreamHook()
    act(() => {
      void hook.result.current.sendMessage('hello')
    })
    await waitForAssertion(() => expect(emitEvent).toBeTypeOf('function'))

    const answer = '流'.repeat(360)
    act(() => {
      emitEvent?.(JSON.stringify({ type: 'token', data: { content: answer } }))
      emitEvent?.(JSON.stringify({
        type: 'done',
        data: {
          assistant_message_id: 'assistant-merged',
          conversation_id: 'conv-merged',
        },
      }))
      finishStream?.()
    })

    act(() => {
      frames.shift()?.callback(0)
    })
    expect(hook.result.current.currentResponse).toBe(answer.slice(0, 120))
    expect(hook.result.current.messages.filter((message) => message.role === 'assistant')).toHaveLength(0)

    act(() => {
      frames.shift()?.callback(16)
    })
    expect(hook.result.current.currentResponse).toBe(answer.slice(0, 240))
    expect(hook.result.current.messages.filter((message) => message.role === 'assistant')).toHaveLength(0)

    await act(async () => {
      frames.shift()?.callback(32)
      await Promise.resolve()
    })
    await waitForAssertion(() => {
      expect(hook.result.current.messages.at(-1)).toMatchObject({
        id: 'assistant-merged',
        content: answer,
      })
      expect(hook.result.current.isLoading).toBe(false)
    })
    hook.unmount()
  })
})
