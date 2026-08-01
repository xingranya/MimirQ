import { describe, expect, it } from 'vitest'

import {
  createStreamDiagnostics,
  type StreamDiagnosticEntry,
} from './stream-diagnostics'

describe('StreamDiagnostics', () => {
  it('只记录时序元数据并支持后端 request id', () => {
    const entries: StreamDiagnosticEntry[] = []
    const diagnostics = createStreamDiagnostics('client-request', (entry) => entries.push(entry))

    diagnostics.record('request_start')
    diagnostics.setRequestId('backend-request')
    diagnostics.record('network_chunk', 128)
    diagnostics.record('token')

    expect(entries).toHaveLength(3)
    expect(entries[1]).toMatchObject({
      requestId: 'backend-request',
      eventType: 'network_chunk',
      chunkBytes: 128,
    })
    expect(Object.keys(entries[2])).toEqual(['requestId', 'eventType', 'elapsedMs'])
  })
})
