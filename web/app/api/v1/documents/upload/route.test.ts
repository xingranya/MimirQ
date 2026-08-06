import { afterEach, describe, expect, it, vi } from 'vitest'

import { POST } from './route'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('单文档上传代理', () => {
  it('把上传请求转发到单文件接口', async () => {
    vi.stubEnv('API_INTERNAL_URL', 'http://mimirq-api:8000')
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ id: 'document-1', status: 'pending' }, { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    const response = await POST(
      new Request('http://localhost/api/v1/documents/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'multipart/form-data; boundary=test-boundary' },
        body: new Uint8Array([1, 2, 3]),
      })
    )

    expect(response.status).toBe(201)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://mimirq-api:8000/api/v1/documents/upload',
      expect.objectContaining({ method: 'POST', duplex: 'half' })
    )
  })
})
