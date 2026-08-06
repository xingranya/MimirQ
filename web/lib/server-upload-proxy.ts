const REQUEST_HEADER_ALLOWLIST = [
  'accept',
  'accept-language',
  'authorization',
  'content-length',
  'content-type',
  'cookie',
  'x-request-id',
  'x-tenant-id',
  'x-user-id',
] as const

const RESPONSE_HEADER_ALLOWLIST = [
  'content-disposition',
  'content-length',
  'content-type',
  'location',
  'retry-after',
  'x-request-id',
] as const

type StreamingRequestInit = RequestInit & {
  duplex: 'half'
}

function resolveUpstreamBaseUrl(): string {
  const candidates = [
    process.env.API_INTERNAL_URL,
    process.env.NEXT_PUBLIC_API_URL,
    'http://127.0.0.1:8000',
  ]

  for (const candidate of candidates) {
    const normalized = String(candidate || '')
      .trim()
      .replace(/\/+$/, '')
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

/**
 * 将文档上传请求体作为流直接传给后端，避免 Next.js rewrite 代理截断大文件。
 */
export async function proxyDocumentUpload(
  request: Request,
  endpoint: 'upload' | 'upload-batch'
): Promise<Response> {
  const requestHeaders = copyAllowedHeaders(request.headers, REQUEST_HEADER_ALLOWLIST)
  const requestInit: StreamingRequestInit = {
    method: 'POST',
    headers: requestHeaders,
    body: request.body,
    cache: 'no-store',
    redirect: 'manual',
    signal: request.signal,
    duplex: 'half',
  }

  try {
    const upstream = await fetch(
      `${resolveUpstreamBaseUrl()}/api/v1/documents/${endpoint}`,
      requestInit
    )
    const responseHeaders = copyAllowedHeaders(upstream.headers, RESPONSE_HEADER_ALLOWLIST)
    responseHeaders.set('cache-control', 'no-store')

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    })
  } catch {
    return Response.json({ detail: '上传服务暂时不可用，请稍后重试' }, { status: 502 })
  }
}
