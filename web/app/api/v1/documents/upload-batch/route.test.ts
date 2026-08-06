import { afterEach, describe, expect, it, vi } from 'vitest'

import { POST } from './route'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('批量文档上传代理', () => {
  it('完整透传超过 10 MB 的请求流', async () => {
    vi.stubEnv('API_INTERNAL_URL', 'http://mimirq-api:8000')
    const payload = new Uint8Array(10 * 1024 * 1024 + 4096)
    payload.fill(7)
    const request = new Request('http://localhost/api/v1/documents/upload-batch', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-token',
        'Content-Type': 'multipart/form-data; boundary=test-boundary',
        'X-Request-ID': 'request-large-upload',
        'X-Tenant-ID': 'tenant-1',
      },
      body: payload,
    })
    const originalBody = request.body
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { total: 1, successful_count: 1, failed_count: 0 },
          { status: 201, headers: { 'X-Request-ID': 'request-large-upload' } }
        )
      )
    vi.stubGlobal('fetch', fetchMock)

    const response = await POST(request)

    expect(response.status).toBe(201)
    expect(response.headers.get('x-request-id')).toBe('request-large-upload')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { duplex?: string }]
    expect(url).toBe('http://mimirq-api:8000/api/v1/documents/upload-batch')
    expect(init.body).toBe(originalBody)
    expect(init.duplex).toBe('half')
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer test-token')
    expect(new Headers(init.headers).get('x-tenant-id')).toBe('tenant-1')

    const forwarded = await new Response(init.body).arrayBuffer()
    expect(forwarded.byteLength).toBe(payload.byteLength)
  })

  it('上游连接失败时返回可识别的 502', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection reset')))

    const response = await POST(
      new Request('http://localhost/api/v1/documents/upload-batch', {
        method: 'POST',
        body: new Uint8Array([1, 2, 3]),
      })
    )

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({
      detail: '上传服务暂时不可用，请稍后重试',
    })
  })
})
