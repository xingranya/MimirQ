import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiMock = vi.hoisted(() => ({
  getGraph: vi.fn(),
  details: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  kgApi: {
    getGraph: apiMock.getGraph,
  },
  metaApi: {
    details: apiMock.details,
  },
}))

import { GraphService } from './graph-service'

describe('GraphService.fetchInitialGraph', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMock.details.mockResolvedValue({ features: { kg_enabled: true } })
  })

  it('把接口成功返回的空图保留为真实空数据', async () => {
    apiMock.getGraph.mockResolvedValue({ nodes: [], links: [] })

    await expect(
      GraphService.fetchInitialGraph({ datasetId: 'dataset-empty' })
    ).resolves.toEqual({ nodes: [], links: [] })
  })

  it('把权限和网络错误交给调用方处理', async () => {
    const error = new Error('forbidden')
    apiMock.getGraph.mockRejectedValue(error)

    await expect(
      GraphService.fetchInitialGraph({ datasetId: 'dataset-forbidden' })
    ).rejects.toBe(error)
  })
})
