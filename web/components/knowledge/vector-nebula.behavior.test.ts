import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  listChunks: vi.fn(),
}))

vi.mock('next/dynamic', () => ({
  default: () => () => null,
}))
vi.mock('@/lib/api/documents', () => ({
  documentApi: {
    list: mocks.list,
    listChunks: mocks.listChunks,
  },
}))

import { buildNebula, loadVectorNebulaData } from './vector-nebula'

const documentItem = (id: string, filename: string) => ({
  id,
  filename,
  file_type: filename.split('.').pop(),
})

describe('语义分布数据', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('没有真实切片时不使用文档信息伪造节点', () => {
    const data = buildNebula(
      [documentItem('doc-1', '合同.pdf')],
      new Map([['doc-1', []]])
    )

    expect(data.nodes).toEqual([])
    expect(data.links).toEqual([])
    expect(data.clusters).toEqual([])
  })

  it('按真实切片生成节点、顺序连线和文档类型分组', () => {
    const data = buildNebula(
      [documentItem('doc-1', '合同.pdf')],
      new Map([
        ['doc-1', [
          { id: 'chunk-1', content: '第一条', chunk_index: 0 },
          { id: 'chunk-2', content: '第二条', chunk_index: 1 },
        ]],
      ])
    )

    expect(data.nodes).toHaveLength(2)
    expect(data.links).toEqual([
      expect.objectContaining({ source: 'doc-1:chunk-1', target: 'doc-1:chunk-2' }),
    ])
    expect(data.clusters).toEqual([
      expect.objectContaining({ label: 'PDF 文档', count: 1, chunkCount: 2 }),
    ])
  })

  it('保留成功结果并统计逐文档读取失败', async () => {
    mocks.list.mockResolvedValue({
      items: [
        documentItem('doc-1', '合同.pdf'),
        documentItem('doc-2', '台账.xlsx'),
        documentItem('doc-3', '说明.html'),
      ],
    })
    mocks.listChunks.mockImplementation(async (documentId: string) => {
      if (documentId === 'doc-2') throw new Error('forbidden')
      if (documentId === 'doc-3') return { items: [] }
      return { items: [{ id: 'chunk-1', content: '可用内容', chunk_index: 0 }] }
    })

    const data = await loadVectorNebulaData()

    expect(data.nodes).toHaveLength(1)
    expect(data.summary).toEqual({
      listedDocumentCount: 3,
      requestedDocumentCount: 3,
      loadedDocumentCount: 2,
      failedDocumentCount: 1,
      omittedDocumentCount: 0,
    })
  })

  it('限制单次切片请求数量并记录未加入画布的文档', async () => {
    mocks.list.mockResolvedValue({
      items: Array.from({ length: 10 }, (_, index) =>
        documentItem(`doc-${index}`, `文档-${index}.pdf`)
      ),
    })
    mocks.listChunks.mockResolvedValue({ items: [] })

    const data = await loadVectorNebulaData()

    expect(mocks.listChunks).toHaveBeenCalledTimes(8)
    expect(data.summary.omittedDocumentCount).toBe(2)
  })
})
