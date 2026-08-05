// @vitest-environment happy-dom

import React, { act, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const chatApiMock = vi.hoisted(() => ({
  deleteConversation: vi.fn(),
  getMessages: vi.fn(),
  listConversations: vi.fn(),
}))
const toastMock = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}))

vi.mock('@/components/app-frame', () => ({
  AppFrame: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-app-frame': 'true' }, children),
}))
vi.mock('@/lib/api', () => ({ chatApi: chatApiMock }))
vi.mock('@/i18n/navigation', () => ({
  Link: ({ prefetch: _prefetch, ...props }: React.ComponentProps<'a'> & { prefetch?: boolean }) =>
    React.createElement('a', props),
  usePathname: () => '/history',
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}))
vi.mock('sonner', () => ({ toast: toastMock }))

import HistoryPageClient, { ConversationItem, deleteConversationFromHistory } from './page-client'
import { queryKeys } from '@/lib/query-keys'

beforeEach(() => {
  ;(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  chatApiMock.deleteConversation.mockResolvedValue(undefined)
  chatApiMock.getMessages.mockResolvedValue({
    conversation_id: 'conversation-default',
    messages: [],
    returned: 0,
    has_more: false,
  })
  chatApiMock.listConversations.mockResolvedValue({
    items: [],
    total: 0,
    returned: 0,
    has_more: false,
    next_skip: null,
  })
  globalThis.window.matchMedia =
    globalThis.window.matchMedia ||
    ((query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as MediaQueryList)
  globalThis.window.requestAnimationFrame =
    globalThis.window.requestAnimationFrame ||
    ((cb: FrameRequestCallback) => setTimeout(() => cb(0), 0) as unknown as number)
  globalThis.IntersectionObserver =
    globalThis.IntersectionObserver ||
    class IntersectionObserver {
      disconnect() {}
      observe() {}
      unobserve() {}
    }
})

afterEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
})

describe('history page delete action', () => {
  it('shows a recoverable error instead of an empty archive when the first list request fails', async () => {
    chatApiMock.listConversations.mockRejectedValueOnce(new Error('network unavailable'))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(HistoryPageClient, { initialConversationId: null })
        )
      )
    })

    await act(async () => {
      await vi.waitFor(() => expect(container.textContent).toContain('loadConversationListFailed'))
    })
    expect(container.querySelector('[data-history-empty-archive="true"]')).toBeNull()

    const retryButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.includes('重新加载')
    )
    expect(retryButton).not.toBeUndefined()
    act(() => retryButton?.click())

    await act(async () => {
      await vi.waitFor(() => expect(chatApiMock.listConversations).toHaveBeenCalledTimes(2))
      await vi.waitFor(() =>
        expect(container.querySelector('[data-history-empty-archive="true"]')).not.toBeNull()
      )
    })

    act(() => root.unmount())
  })

  it('keeps the previous conversation list visible when a background refresh fails', async () => {
    const conversation = {
      id: 'conversation-snapshot',
      title: 'Saved conversation',
      message_count: 1,
      last_message: 'saved message',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    chatApiMock.listConversations.mockRejectedValueOnce(new Error('refresh failed'))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(HistoryPageClient, {
            initialConversations: [conversation],
            initialConversationTotal: 1,
            initialConversationsLoaded: true,
          })
        )
      )
    })

    await act(async () => {
      await vi.waitFor(() =>
        expect(container.textContent).toContain('refreshConversationListFailed')
      )
    })
    expect(container.textContent).toContain(conversation.title)
    expect(container.querySelector('[data-history-empty-archive="true"]')).toBeNull()

    act(() => root.unmount())
  })

  it('loads conversations at runtime when the server shell no longer prefetched them', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(HistoryPageClient, { initialConversationId: null })
        )
      )
    })

    await act(async () => {
      await vi.waitFor(() =>
        expect(chatApiMock.listConversations).toHaveBeenCalledWith({
          skip: 0,
          limit: 100,
        })
      )
      await vi.waitFor(() =>
        expect(container.querySelector('[data-history-empty-archive="true"]')).not.toBeNull()
      )
    })

    act(() => root.unmount())
  })

  it('searches the complete server-side history and renders zero-match semantics', async () => {
    const selectedConversation = {
      id: 'conversation-current',
      title: 'Current selection',
      message_count: 1,
      last_message: 'current message',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    const olderMatch = {
      id: 'conversation-101',
      title: 'Older matching conversation',
      message_count: 1,
      last_message: 'needle in an older page',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    }
    chatApiMock.listConversations.mockImplementation(async (params?: { q?: string }) => {
      if (params?.q === 'needle') {
        return {
          items: [olderMatch],
          total: 1,
          returned: 1,
          has_more: false,
          next_skip: null,
        }
      }
      if (params?.q === 'missing') {
        return {
          items: [],
          total: 0,
          returned: 0,
          has_more: false,
          next_skip: null,
        }
      }
      return {
        items: [selectedConversation],
        total: 101,
        returned: 1,
        has_more: true,
        next_skip: 100,
      }
    })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(HistoryPageClient, {
            initialConversationId: selectedConversation.id,
            initialSelectedConversation: selectedConversation,
          })
        )
      )
    })
    await act(async () => {
      await vi.waitFor(() => expect(chatApiMock.listConversations).toHaveBeenCalled())
    })

    const input = container.querySelector<HTMLInputElement>(
      'input[placeholder="searchPlaceholder"]'
    )
    expect(input).not.toBeNull()
    expect(input?.maxLength).toBe(500)
    const recentButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent === '最近'
    )
    expect(recentButton).not.toBeUndefined()
    act(() => recentButton?.click())
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    act(() => {
      valueSetter?.call(input, 'needle')
      input?.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await act(async () => {
      await vi.waitFor(() =>
        expect(chatApiMock.listConversations).toHaveBeenCalledWith({
          skip: 0,
          limit: 100,
          q: 'needle',
        })
      )
      await vi.waitFor(() => expect(container.textContent).toContain(olderMatch.title))
    })

    act(() => {
      valueSetter?.call(input, 'missing')
      input?.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      await vi.waitFor(() =>
        expect(chatApiMock.listConversations).toHaveBeenCalledWith({
          skip: 0,
          limit: 100,
          q: 'missing',
        })
      )
      await vi.waitFor(() => expect(container.textContent).toContain('noMatchedConversation'))
    })
    expect(container.textContent).not.toContain('加载更早记录')
    expect(container.textContent).toContain(selectedConversation.title)

    act(() => root.unmount())
  })

  it('loads messages directly for a deep-linked conversation outside the first conversation page', async () => {
    chatApiMock.listConversations.mockResolvedValue({
      items: Array.from({ length: 100 }, (_, index) => ({
        id: `conversation-${index + 1}`,
        title: `Conversation ${index + 1}`,
        message_count: 1,
        last_message: `message ${index + 1}`,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      })),
      total: 150,
      returned: 100,
      has_more: true,
      next_skip: 100,
    })
    chatApiMock.getMessages.mockImplementation(
      async (_conversationId: string, params?: { before?: string }) => {
        if (params?.before === 'message-1') {
          return {
            conversation_id: 'conversation-150',
            messages: [
              {
                id: 'message-0',
                role: 'user',
                content: 'earlier question',
                created_at: '2026-01-01T00:00:00Z',
              },
            ],
            returned: 1,
            has_more: false,
          }
        }

        return {
          conversation_id: 'conversation-150',
          messages: [
            {
              id: 'message-1',
              role: 'assistant',
              content: 'legacy answer',
              created_at: '2026-01-02T00:00:00Z',
            },
          ],
          returned: 1,
          has_more: true,
        }
      }
    )

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(HistoryPageClient, { initialConversationId: 'conversation-150' })
        )
      )
    })

    await act(async () => {
      await vi.waitFor(() =>
        expect(chatApiMock.getMessages).toHaveBeenCalledWith('conversation-150', {
          limit: 80,
          before: undefined,
        })
      )
      await vi.waitFor(() => expect(container.textContent).toContain('legacy answer'))
    })

    expect(container.querySelector('[data-history-main-empty="true"]')).toBeNull()
    const loadOlderButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>('button')
    ).find((button) => button.textContent === 'loadOlderMessages')
    expect(loadOlderButton).not.toBeUndefined()
    expect(chatApiMock.getMessages).toHaveBeenCalledTimes(1)

    act(() => loadOlderButton?.click())
    await act(async () => {
      await vi.waitFor(() =>
        expect(chatApiMock.getMessages).toHaveBeenCalledWith('conversation-150', {
          limit: 40,
          before: 'message-1',
        })
      )
      await vi.waitFor(() => expect(container.textContent).toContain('earlier question'))
    })

    act(() => root.unmount())
  })

  it('shows a recoverable error for a rejected deep link and restores the conversation after retry', async () => {
    chatApiMock.getMessages.mockRejectedValueOnce(new Error('conversation not found'))
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(HistoryPageClient, { initialConversationId: 'missing-conversation' })
        )
      )
    })

    await act(async () => {
      await vi.waitFor(() =>
        expect(container.textContent).toContain('loadConversationMessagesFailed')
      )
    })

    expect(container.querySelector('[data-history-main-empty="true"]')).toBeNull()
    expect(container.querySelector('[aria-label="继续当前对话"]')).toBeNull()
    expect(container.querySelector('[aria-label="进行对话分析评测"]')).toBeNull()
    expect(container.querySelector('[aria-label="查看数据追踪"]')).toBeNull()

    const retryButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.includes('重新加载')
    )
    expect(retryButton).not.toBeUndefined()
    act(() => retryButton?.click())
    await act(async () => {
      await vi.waitFor(() => expect(chatApiMock.getMessages).toHaveBeenCalledTimes(2))
      await vi.waitFor(() =>
        expect(container.querySelector('[aria-label="继续当前对话"]')).not.toBeNull()
      )
    })

    act(() => root.unmount())
  })

  it('keeps deep-linked message snapshots visible when their background refresh fails', async () => {
    const conversation = {
      id: 'conversation-message-snapshot',
      title: 'Snapshot conversation',
      message_count: 1,
      last_message: 'saved answer',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    const message = {
      id: 'message-snapshot',
      role: 'assistant' as const,
      content: 'saved answer',
      created_at: '2026-01-01T00:00:00Z',
    }
    chatApiMock.listConversations.mockResolvedValue({
      items: [conversation],
      total: 1,
      returned: 1,
      has_more: false,
      next_skip: null,
    })
    chatApiMock.getMessages.mockRejectedValueOnce(new Error('refresh failed'))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(HistoryPageClient, {
            initialConversationId: conversation.id,
            initialConversations: [conversation],
            initialSelectedConversation: conversation,
            initialMessages: [message],
            initialConversationTotal: 1,
            initialConversationsLoaded: true,
          })
        )
      )
    })

    await act(async () => {
      await vi.waitFor(() =>
        expect(container.textContent).toContain('refreshConversationMessagesFailed')
      )
    })
    expect(container.textContent).toContain(message.content)
    expect(container.querySelector('[data-history-main-empty="true"]')).toBeNull()

    act(() => root.unmount())
  })

  it('confirms deletion, calls the API, and removes the cached conversation', async () => {
    const queryClient = new QueryClient()
    const conversation = {
      id: 'conversation-1',
      title: 'Delete me',
      message_count: 1,
      last_message: 'hello',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    const cacheKey = queryKeys.chat.conversationPages({ limit: 100 })
    const searchCacheKey = queryKeys.chat.conversationPages({ limit: 100, q: 'delete' })
    const commandCacheKey = queryKeys.chat.conversations({ limit: 6, q: 'delete' })
    queryClient.setQueryData(cacheKey, {
      pages: [{ items: [conversation], returned: 1, total: 2, has_more: true, next_skip: 1 }],
      pageParams: [0],
    })
    queryClient.setQueryData(searchCacheKey, {
      pages: [{ items: [conversation], returned: 1, total: 2, has_more: true, next_skip: 1 }],
      pageParams: [0],
    })
    queryClient.setQueryData(commandCacheKey, [conversation])
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    function Harness() {
      const [confirming, setConfirming] = useState(false)
      return React.createElement(ConversationItem, {
        conversation: conversation as never,
        isSelected: false,
        isDeleting: false,
        onSelect: () => undefined,
        onDelete: () => setConfirming(true),
        showDeleteConfirm: confirming,
        onConfirmDelete: () => {
          void deleteConversationFromHistory(conversation.id, queryClient)
        },
        onCancelDelete: () => setConfirming(false),
      })
    }

    act(() => root.render(React.createElement(Harness)))
    const deleteButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="deleteConversation"]'
    )
    expect(deleteButton).not.toBeNull()
    act(() => deleteButton?.click())
    const confirmButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="confirmDeleteConversation"]'
    )
    expect(confirmButton).not.toBeNull()
    act(() => confirmButton?.click())

    await vi.waitFor(() =>
      expect(chatApiMock.deleteConversation).toHaveBeenCalledWith('conversation-1')
    )
    await vi.waitFor(() => {
      const cached = queryClient.getQueryData<{ pages: Array<{ items: unknown[] }> }>(cacheKey)
      expect(cached?.pages[0].items).toEqual([])
      const searched = queryClient.getQueryData<{ pages: Array<{ items: unknown[] }> }>(
        searchCacheKey
      )
      expect(searched?.pages[0].items).toEqual([])
      expect(queryClient.getQueryState(cacheKey)?.isInvalidated).toBe(true)
      expect(queryClient.getQueryState(searchCacheKey)?.isInvalidated).toBe(true)
      expect(queryClient.getQueryState(commandCacheKey)?.isInvalidated).toBe(true)
    })
    act(() => root.unmount())
  })

  it('blocks duplicate delete requests and keeps the conversation visible after failure', async () => {
    const conversation = {
      id: 'conversation-delete-failure',
      title: 'Keep this conversation',
      message_count: 1,
      last_message: 'hello',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    let rejectDelete: (reason?: unknown) => void = () => undefined
    chatApiMock.deleteConversation.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectDelete = reject
        })
    )
    chatApiMock.listConversations.mockResolvedValue({
      items: [conversation],
      total: 1,
      returned: 1,
      has_more: false,
      next_skip: null,
    })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(HistoryPageClient, {
            initialConversations: [conversation],
            initialConversationTotal: 1,
            initialConversationsLoaded: true,
          })
        )
      )
    })

    const deleteButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="deleteConversation"]'
    )
    expect(deleteButton).not.toBeNull()
    act(() => deleteButton?.click())
    const confirmButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="confirmDeleteConversation"]'
    )
    expect(confirmButton).not.toBeNull()

    act(() => {
      confirmButton?.click()
      confirmButton?.click()
    })
    await act(async () => {
      await vi.waitFor(() => expect(chatApiMock.deleteConversation).toHaveBeenCalledTimes(1))
      await vi.waitFor(() => expect(confirmButton?.disabled).toBe(true))
    })

    await act(async () => {
      rejectDelete(new Error('delete failed'))
      await vi.waitFor(() =>
        expect(toastMock.error).toHaveBeenCalledWith('deleteConversationFailed')
      )
    })
    expect(container.textContent).toContain(conversation.title)

    act(() => root.unmount())
  })
})
