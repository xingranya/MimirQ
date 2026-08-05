import { beforeEach, describe, expect, it, vi } from 'vitest'

const postMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api/core', () => ({
  apiClient: { post: postMock },
  openapiRequest: vi.fn(),
}))

import { pipelineApi } from './pipeline'

describe('入库策略预览接口', () => {
  beforeEach(() => {
    postMock.mockReset()
    postMock.mockResolvedValue({ data: {} })
  })

  it('把当前策略草稿写入 multipart 请求', async () => {
    const file = new File(['preview'], 'preview.pdf', { type: 'application/pdf' })
    const policy = {
      version: '1',
      rules: [
        {
          id: 'draft-rule',
          name: '草稿规则',
          enabled: true,
          match: { extensions: ['.pdf'], filename_regex: null },
          preprocess: { enabled: false, steps: [] },
          parser_backend: 'auto',
          chunk_strategy: null,
          governance_profile_ref: null,
          pipeline_patch: {},
        },
      ],
    }
    const controller = new AbortController()

    await pipelineApi.ingestionPreview(
      file,
      {
        dataset_id: 'dataset-1',
        diff_max_lines: 2000,
        policy,
      },
      { signal: controller.signal }
    )

    expect(postMock).toHaveBeenCalledTimes(1)
    const [path, formData] = postMock.mock.calls[0] as [string, FormData]
    expect(path).toBe('/pipeline/ingestion-preview')
    expect(formData.get('dataset_id')).toBe('dataset-1')
    expect(formData.get('diff_max_lines')).toBe('2000')
    expect(formData.get('policy_json')).toBe(JSON.stringify(policy))
    expect(postMock.mock.calls[0]?.[2]).toEqual({
      timeout: expect.any(Number),
      signal: controller.signal,
    })
  })
})
