const REQUEST_HEADER_ALLOWLIST = [
  'accept',
  'accept-language',
  'authorization',
  'content-type',
  'cookie',
  'x-request-id',
] as const

const RESPONSE_HEADER_ALLOWLIST = [
  'access-control-expose-headers',
  'content-type',
  'retry-after',
  'x-assistant-message-id',
  'x-conversation-id',
  'x-request-id',
] as const

export const dynamic = 'force-dynamic'

function resolveUpstreamBaseUrl(): string {
  const candidates = [
    process.env.API_INTERNAL_URL,
    process.env.NEXT_PUBLIC_API_URL,
    'http://127.0.0.1:8000',
  ]

  for (const candidate of candidates) {
    const normalized = String(candidate || '').trim().replace(/\/+$/, '')
    if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
      return normalized
    }
  }

  return 'http://127.0.0.1:8000'
}

function copyAllowedHeaders(source: Headers, names: readonly string[]): Headers {
  const headers = new Headers()
  for (const name of names) {
    const value = source.get(name)
    if (value) headers.set(name, value)
  }
  return headers
}

export async function POST(request: Request): Promise<Response> {
  const requestHeaders = copyAllowedHeaders(request.headers, REQUEST_HEADER_ALLOWLIST)
  requestHeaders.set('accept', 'text/event-stream')
  requestHeaders.set('content-type', 'application/json')

  try {
    const upstream = await fetch(`${resolveUpstreamBaseUrl()}/api/v1/chat/stream`, {
      method: 'POST',
      headers: requestHeaders,
      body: await request.text(),
      cache: 'no-store',
      signal: request.signal,
    })
    const responseHeaders = copyAllowedHeaders(upstream.headers, RESPONSE_HEADER_ALLOWLIST)
    responseHeaders.set('cache-control', 'no-cache, no-transform')
    responseHeaders.set('x-accel-buffering', 'no')

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    })
  } catch {
    return Response.json(
      { detail: '对话服务暂时不可用，请稍后重试' },
      { status: 502 }
    )
  }
}
