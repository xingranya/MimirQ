import { afterEach, describe, expect, it, vi } from 'vitest'

import { chatApi } from './api/chat'
import { createStreamDiagnostics, type StreamDiagnosticEntry } from './stream-diagnostics'

const originalFetch = globalThis.fetch

describe('chatApi.streamChat', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('surfaces request and conversation ids as soon as the stream opens', async () => {
    const encoder = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"done","data":{}}\n\n'))
        controller.close()
      },
    })

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(body, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'X-Request-ID': 'req-stream-1',
          'X-Conversation-ID': 'conv-stream-1',
        },
      })
    ) as typeof fetch

    const onOpen = vi.fn()
    const events: string[] = []
    const diagnosticsEntries: StreamDiagnosticEntry[] = []

    const result = await chatApi.streamChat(
      { message: 'hello', stream: true } as any,
      (json) => events.push(json),
      {
        onOpen,
        diagnostics: createStreamDiagnostics('pending', (entry) => diagnosticsEntries.push(entry)),
      }
    )

    expect(onOpen).toHaveBeenCalledWith({
      requestId: 'req-stream-1',
      conversationId: 'conv-stream-1',
    })
    expect(events).toEqual(['{"type":"done","data":{}}'])
    expect(result).toEqual({
      requestId: 'req-stream-1',
      conversationId: 'conv-stream-1',
    })
    expect(diagnosticsEntries.map((entry) => entry.eventType)).toEqual([
      'request_start',
      'headers',
      'network_chunk',
      'done',
    ])
    expect(diagnosticsEntries.at(-1)?.requestId).toBe('req-stream-1')
  })
})
