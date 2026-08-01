export type StreamDiagnosticEventType =
  | 'request_start'
  | 'headers'
  | 'network_chunk'
  | 'event'
  | 'citations'
  | 'token'
  | 'done'
  | 'error'
  | 'ui_render'

export type StreamDiagnosticEntry = Readonly<{
  requestId: string
  eventType: StreamDiagnosticEventType
  elapsedMs: number
  chunkBytes?: number
}>

export type StreamDiagnostics = Readonly<{
  setRequestId: (requestId: string) => void
  record: (eventType: StreamDiagnosticEventType, chunkBytes?: number) => StreamDiagnosticEntry
}>

export const STREAM_DIAGNOSTIC_EVENT = 'seeway:chat-stream-diagnostic'

function nowMs(): number {
  return typeof globalThis.performance?.now === 'function'
    ? globalThis.performance.now()
    : Date.now()
}

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

export function emitStreamDiagnostic(entry: StreamDiagnosticEntry): void {
  if (typeof globalThis.window === 'undefined') return
  globalThis.window.dispatchEvent(
    new CustomEvent<StreamDiagnosticEntry>(STREAM_DIAGNOSTIC_EVENT, { detail: entry })
  )
}

export function createStreamDiagnostics(
  initialRequestId = 'pending',
  onEntry?: (entry: StreamDiagnosticEntry) => void
): StreamDiagnostics {
  const startedAt = nowMs()
  let requestId = initialRequestId

  return {
    setRequestId(nextRequestId) {
      const normalized = nextRequestId.trim()
      if (normalized) requestId = normalized
    },
    record(eventType, chunkBytes) {
      const entry: StreamDiagnosticEntry = {
        requestId,
        eventType,
        elapsedMs: Math.max(0, nowMs() - startedAt),
        ...(typeof chunkBytes === 'number' ? { chunkBytes } : {}),
      }
      onEntry?.(entry)
      emitStreamDiagnostic(entry)
      return entry
    },
  }
}
