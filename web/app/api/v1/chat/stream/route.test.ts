import { afterEach, describe, expect, it, vi } from 'vitest'

import { POST } from './route'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('聊天流式代理', () => {
  it('在上游结束前立即透传首个 SSE 数据块', async () => {
    vi.stubEnv('API_INTERNAL_URL', 'http://mimirq-api:8000')
    const upstream = new TransformStream<Uint8Array, Uint8Array>()
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(upstream.readable, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'X-Conversation-ID': 'conversation-1',
          'X-Request-ID': 'request-1',
        },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const response = await POST(
      new Request('http://localhost/api/v1/chat/stream', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
          'X-Request-ID': 'request-1',
        },
        body: JSON.stringify({ message: '测试流式回答' }),
      })
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/event-stream')
    expect(response.headers.get('cache-control')).toBe('no-cache, no-transform')
    expect(response.headers.get('x-conversation-id')).toBe('conversation-1')

    const reader = response.body!.getReader()
    const firstRead = reader.read()
    await upstream.writable.getWriter().write(
      new TextEncoder().encode('data: {"type":"event"}\n\n')
    )
    const firstChunk = await firstRead

    expect(new TextDecoder().decode(firstChunk.value)).toBe(
      'data: {"type":"event"}\n\n'
    )
    expect(firstChunk.done).toBe(false)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://mimirq-api:8000/api/v1/chat/stream',
      expect.objectContaining({ method: 'POST', cache: 'no-store' })
    )
    await reader.cancel()
  })
})
