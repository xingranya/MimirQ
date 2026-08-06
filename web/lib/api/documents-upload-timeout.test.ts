import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiClient } from '@/lib/api/core'
import { documentApi } from '@/lib/api/documents'
import { API_LONG_TIMEOUT_MS } from '@/lib/env'

describe('文档上传超时配置', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('单文件和批量上传都使用长超时', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: {} })
    const file = new File(['content'], 'document.txt', { type: 'text/plain' })

    await documentApi.upload(file)
    await documentApi.uploadBatch([file])

    expect(post).toHaveBeenNthCalledWith(
      1,
      '/documents/upload',
      expect.any(FormData),
      expect.objectContaining({ timeout: API_LONG_TIMEOUT_MS })
    )
    expect(post).toHaveBeenNthCalledWith(
      2,
      '/documents/upload-batch',
      expect.any(FormData),
      expect.objectContaining({ timeout: API_LONG_TIMEOUT_MS })
    )
  })
})
