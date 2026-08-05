// 仅检查源码契约，不替代行为测试。
import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

describe('history route source', () => {
  it('keeps the server wrapper auth-agnostic and lets the client fetch authenticated history data', () => {
    const page = fs.readFileSync(path.resolve(__dirname, 'page.tsx'), 'utf8')
    const client = fs.readFileSync(path.resolve(__dirname, 'page-client.tsx'), 'utf8')

    expect(page).not.toContain("'use client'")
    expect(page).toContain("import HistoryPageClient from './page-client'")
    expect(page).toContain('export default async function HistoryPage')
    expect(page).toContain('<HistoryPageClient initialConversationId={sp?.id || null} />')
    expect(page).not.toContain('getServerHistoryPageData')
    expect(page).not.toContain('initialConversationsLoaded={false}')

    expect(client).toContain("'use client'")
    expect(client).toContain('initialConversations')
    expect(client).toContain('initialMessages')
    expect(client).toContain('initialConversationId')
    expect(client).toContain(
      "import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'"
    )
    expect(client).toContain('queryKey: queryKeys.chat.conversationPages(conversationListParams)')
    expect(client).toContain('...(conversationSearchTerm ? { q: conversationSearchTerm } : {})')
    expect(client).toContain('maxLength={500}')
    expect(client).toContain('getNextPageParam: (lastPage, allPages) =>')
    expect(client).toContain('data-history-sidebar-scroll')
    expect(client).toContain('conversationLoadMoreRef')
    expect(client).toContain('globalThis.window.setInterval')
    expect(client).toContain("queryKey: queryKeys.chat.messages(selectedConversationId || '')")
    expect(client).not.toContain('useState<Conversation[]>(initialConversations)')
    expect(client).not.toContain('useState<Message[]>(initialMessages)')
    expect(client).toContain('initialMessages')
  })

  it('suppresses hydration drift for relative activity timestamps in the sidebar list', () => {
    const client = fs.readFileSync(path.resolve(__dirname, 'page-client.tsx'), 'utf8')

    expect(client).toContain('<time')
    expect(client).toContain('suppressHydrationWarning')
    expect(client).toMatch(
      /dateTime=\{\s*conversation\.last_message_at\s*\|\|\s*conversation\.updated_at\s*\|\|\s*conversation\.created_at\s*\}/
    )
    expect(client).toMatch(
      /formatRelativeTime\(\s*conversation\.last_message_at\s*\|\|\s*conversation\.updated_at,\s*locale,\s*t\('justNow'\)\s*\)/
    )
  })

  it('suppresses hydration drift for message-group date labels in the active conversation pane', () => {
    const client = fs.readFileSync(path.resolve(__dirname, 'page-client.tsx'), 'utf8')

    expect(client).toMatch(
      /<div\s+suppressHydrationWarning\s+className="whitespace-nowrap text-xs font-medium text-muted-foreground\/60"\s*>/
    )
    expect(client).toContain('{group.label}')
  })

  it('suppresses hydration drift for selected-conversation created-at chips', () => {
    const client = fs.readFileSync(path.resolve(__dirname, 'page-client.tsx'), 'utf8')

    expect(client).toContain('<span suppressHydrationWarning>')
    expect(client).toContain('{formatDate(displayConversation.created_at, locale)}')
  })

  it('keeps conversation actions reachable on touch screens without covering content', () => {
    const client = fs.readFileSync(path.resolve(__dirname, 'page-client.tsx'), 'utf8')

    expect(client).toContain('py-2 pl-3 pr-12')
    expect(client).toContain(
      'opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100'
    )
    expect(client).toContain("label={t('deleteConversation')}")
  })

  it('suppresses hydration drift for sidebar conversation-group labels', () => {
    const client = fs.readFileSync(path.resolve(__dirname, 'page-client.tsx'), 'utf8')

    expect(client).toContain('<span suppressHydrationWarning>{group}</span>')
  })

  it('uses UTC day bucketing for sidebar and message grouping to avoid timezone-driven hydration drift', () => {
    const client = fs.readFileSync(path.resolve(__dirname, 'page-client.tsx'), 'utf8')

    expect(client).toContain('getUTCFullYear')
    expect(client).toContain('getUTCMonth')
    expect(client).toContain('getUTCDate')
  })
})
