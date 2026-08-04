import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  get: vi.fn(),
}))

vi.mock('@/lib/api/core', () => ({
  apiClient: { get: api.get },
}))

import { listAllPromptTemplates } from './prompts'

describe('listAllPromptTemplates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('按后端上限读取全部提示词模板', async () => {
    api.get
      .mockResolvedValueOnce({
        data: {
          total: 405,
          items: Array.from({ length: 200 }, (_, index) => ({
            id: `prompt-${index}`,
          })),
        },
      })
      .mockResolvedValueOnce({
        data: {
          total: 405,
          items: Array.from({ length: 200 }, (_, index) => ({
            id: `prompt-${200 + index}`,
          })),
        },
      })
      .mockResolvedValueOnce({
        data: {
          total: 405,
          items: Array.from({ length: 5 }, (_, index) => ({
            id: `prompt-${400 + index}`,
          })),
        },
      })

    const templates = await listAllPromptTemplates()

    expect(templates).toHaveLength(405)
    expect(api.get).toHaveBeenNthCalledWith(1, '/prompt-templates', {
      params: { skip: 0, limit: 200 },
    })
    expect(api.get).toHaveBeenNthCalledWith(2, '/prompt-templates', {
      params: { skip: 200, limit: 200 },
    })
    expect(api.get).toHaveBeenNthCalledWith(3, '/prompt-templates', {
      params: { skip: 400, limit: 200 },
    })
  })

  it('保留筛选条件并在重复页面时停止', async () => {
    const page = Array.from({ length: 50 }, (_, index) => ({
      id: `prompt-${index}`,
    }))
    api.get
      .mockResolvedValueOnce({ data: { total: 500, items: page } })
      .mockResolvedValueOnce({ data: { total: 500, items: page } })

    const templates = await listAllPromptTemplates({
      category: 'rag_answer',
      is_active: true,
      pageSize: 50,
    })

    expect(templates).toHaveLength(50)
    expect(api.get).toHaveBeenCalledTimes(2)
    expect(api.get).toHaveBeenNthCalledWith(2, '/prompt-templates', {
      params: {
        category: 'rag_answer',
        is_active: true,
        skip: 50,
        limit: 50,
      },
    })
  })
})
