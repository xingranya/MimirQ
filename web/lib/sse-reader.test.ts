import { describe, expect, it, vi } from 'vitest'

import { readSseDataStrings } from './sse-reader'

describe('readSseDataStrings', () => {
  it('支持任意网络 chunk 边界并逐块上报大小', async () => {
    const encoder = new TextEncoder()
    const payload = 'data: {"type":"token","data":{"content":"你好"}}\r\n\r\ndata: {"type":"done","data":{}}\n\n'
    const bytes = encoder.encode(payload)
    const cuts = [5, 19, 47, bytes.byteLength]
    let start = 0
    const chunks = cuts.map((end) => {
      const chunk = bytes.slice(start, end)
      start = end
      return chunk
    })
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk)
        controller.close()
      },
    })
    const onData = vi.fn()
    const onChunk = vi.fn()

    await readSseDataStrings(body.getReader(), onData, undefined, onChunk)

    expect(onData.mock.calls.map(([data]) => data)).toEqual([
      '{"type":"token","data":{"content":"你好"}}',
      '{"type":"done","data":{}}',
    ])
    expect(onChunk.mock.calls.map(([chunk]) => chunk.byteLength)).toEqual(
      chunks.map((chunk) => chunk.byteLength)
    )
  })
})
