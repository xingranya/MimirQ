import { describe, expect, it, vi } from 'vitest'

import type { ParsedFileData } from '@/store/use-parsed-files-store'

import {
  fetchAllGovernanceDocuments,
  GovernanceDocumentSyncUnavailableError,
  reconcileGovernanceFiles,
  settleGovernanceDocumentSources,
} from './governance-document-sync'

function governanceFile(
  id: string,
  source: ParsedFileData['source'],
  datasetId: string | null,
  markdownContent = ''
): ParsedFileData {
  return {
    id,
    filename: `${id}.md`,
    fileType: 'md',
    fileSize: 1,
    markdownContent,
    parsedAt: '2026-08-02T00:00:00Z',
    parser: 'Markdown',
    datasetId,
    source,
  }
}

describe('fetchAllGovernanceDocuments', () => {
  it('按总数读取所有分页', async () => {
    const allItems = Array.from({ length: 450 }, (_, index) => index)
    const fetchPage = vi.fn(async ({ skip, limit }) => ({
      total: allItems.length,
      items: allItems.slice(skip, skip + limit),
    }))

    const result = await fetchAllGovernanceDocuments(fetchPage)

    expect(result).toHaveLength(450)
    expect(fetchPage.mock.calls.map(([params]) => params.skip)).toEqual([0, 200, 400])
  })

  it('后端单页上限小于请求值时仍继续读取', async () => {
    const allItems = Array.from({ length: 250 }, (_, index) => index)
    const fetchPage = vi.fn(async ({ skip }) => ({
      total: allItems.length,
      items: allItems.slice(skip, skip + 100),
    }))

    const result = await fetchAllGovernanceDocuments(fetchPage)

    expect(result).toHaveLength(250)
    expect(fetchPage).toHaveBeenCalledTimes(3)
  })
})

describe('settleGovernanceDocumentSources', () => {
  it('单个来源失败时保留成功来源并返回失败范围', async () => {
    const result = await settleGovernanceDocumentSources(
      Promise.reject(new Error('parsing unavailable')),
      Promise.resolve(['knowledge-document'])
    )

    expect(result).toMatchObject({
      parsingItems: [],
      knowledgeItems: ['knowledge-document'],
      syncedSources: ['knowledge_base'],
      failedSources: ['parsing_workspace'],
    })
  })

  it('两个来源均失败时抛出明确错误，不返回空成功结果', async () => {
    const request = settleGovernanceDocumentSources(
      Promise.reject(new Error('parsing unavailable')),
      Promise.reject(new Error('knowledge unavailable'))
    )

    await expect(request).rejects.toBeInstanceOf(GovernanceDocumentSyncUnavailableError)
    await expect(request).rejects.toMatchObject({
      failures: [{ source: 'parsing_workspace' }, { source: 'knowledge_base' }],
    })
  })

  it('两个来源恢复后返回完整结果并清空失败范围', async () => {
    const result = await settleGovernanceDocumentSources(
      Promise.resolve(['parsing-document']),
      Promise.resolve(['knowledge-document'])
    )

    expect(result).toMatchObject({
      parsingItems: ['parsing-document'],
      knowledgeItems: ['knowledge-document'],
      syncedSources: ['parsing_workspace', 'knowledge_base'],
      failedSources: [],
      failures: [],
    })
  })
})

describe('reconcileGovernanceFiles', () => {
  it('删除完整同步范围内服务端已不存在的记录', () => {
    const result = reconcileGovernanceFiles({
      currentFiles: [
        governanceFile('stale', 'knowledge_base', 'dataset-a'),
        governanceFile('other-dataset', 'knowledge_base', 'dataset-b'),
        governanceFile('local-draft', undefined, 'dataset-a'),
        governanceFile('parsing-cached', 'parsing_workspace', 'dataset-a'),
      ],
      remoteFiles: [],
      syncedSources: new Set(['knowledge_base']),
      datasetId: 'dataset-a',
    })

    expect(result.map((file) => file.id)).toEqual([
      'other-dataset',
      'local-draft',
      'parsing-cached',
    ])
  })

  it('远端记录更新时保留本地治理内容和流程状态', () => {
    const current = governanceFile('shared', 'knowledge_base', 'dataset-a', '本地治理内容')
    current.chunkStatus = 'ready'
    const remote = governanceFile('shared', 'knowledge_base', 'dataset-a', '远端内容')
    remote.filename = '服务端名称.md'

    const result = reconcileGovernanceFiles({
      currentFiles: [current],
      remoteFiles: [remote],
      syncedSources: new Set(['knowledge_base']),
      datasetId: 'dataset-a',
    })

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      filename: '服务端名称.md',
      markdownContent: '本地治理内容',
      chunkStatus: 'ready',
    })
  })
})
