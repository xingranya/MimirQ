import { describe, expect, it } from 'vitest'

import {
  URL_BATCH_MAX_ACCESS_MEMBER_LENGTH,
  analyzeAccessMembers,
  analyzeUrlBatch,
  buildUrlBatchRunPayload,
} from './knowledge-url-batch-dialog.payload'

describe('批量网址导入参数', () => {
  it('分别报告非法、重复、超量和过长的网址', () => {
    const urls = [
      'https://a.example',
      'https://a.example',
      'ftp://a.example',
      `https://example.com/${'a'.repeat(2000)}`,
      ...Array.from({ length: 51 }, (_, index) => `https://${index}.example`),
    ].join('\n')

    const analysis = analyzeUrlBatch(urls)

    expect(analysis.urls).toHaveLength(50)
    expect(analysis.invalidCount).toBe(1)
    expect(analysis.duplicateCount).toBe(1)
    expect(analysis.overflowCount).toBe(2)
    expect(analysis.tooLongCount).toBe(1)
  })

  it('报告成员重复、超量和单项过长', () => {
    const raw = [
      'alice',
      'alice',
      'x'.repeat(URL_BATCH_MAX_ACCESS_MEMBER_LENGTH + 1),
      ...Array.from({ length: 201 }, (_, index) => `member-${index}`),
    ].join('\n')

    expect(analyzeAccessMembers(raw)).toMatchObject({
      duplicateCount: 1,
      overflowCount: 2,
      tooLongCount: 1,
    })
  })

  it('按选择的知识库和访问范围构造任务', () => {
    const payload = buildUrlBatchRunPayload({
      datasetId: 'dataset-1',
      datasetDefaultValue: '__default__',
      urls: ['https://example.com/manual.pdf'],
      filename: ' 产品手册.pdf ',
      parserBackend: 'auto',
      chunkStrategy: 'langchain_recursive',
      accessMode: 'partial_members',
      accessMembers: ['alice', 'bob'],
      accessGroupIds: ['group-1', 'group-1'],
    })

    expect(payload.dataset_id).toBe('dataset-1')
    expect(payload.config.filename).toBe('产品手册.pdf')
    expect(payload.config.access).toEqual({
      mode: 'partial_members',
      partial_member_list: ['alice', 'bob'],
      partial_group_list: ['group-1'],
    })
  })
})
