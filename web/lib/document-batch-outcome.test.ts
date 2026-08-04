import { describe, expect, it } from 'vitest'

import {
  createDocumentBatchOutcome,
  formatDocumentBatchOutcome,
} from './document-batch-outcome'

describe('文档批量操作结果', () => {
  it('全部被拒绝时保留选择并显示错误', () => {
    const outcome = createDocumentBatchOutcome(
      ['doc-a', 'doc-b'],
      { deleted: 0, denied: ['doc-a', 'doc-b'] },
      'deleted'
    )

    expect(outcome).toMatchObject({
      status: 'error',
      succeeded: 0,
      failed: 2,
      denied: 2,
      remainingIds: ['doc-a', 'doc-b'],
    })
    expect(
      formatDocumentBatchOutcome(outcome, {
        successVerb: '已删除',
        completeFailure: '未能删除所选文档',
      })
    ).toBe('未能删除所选文档（无权操作 2 份）。')
  })

  it('部分成功时只保留明确失败的文档', () => {
    const outcome = createDocumentBatchOutcome(
      ['doc-a', 'doc-b', 'doc-c'],
      { moved: 1, denied: ['doc-b'], conflicts: ['doc-c'] },
      'moved'
    )

    expect(outcome).toMatchObject({
      status: 'warning',
      succeeded: 1,
      failed: 2,
      remainingIds: ['doc-b', 'doc-c'],
    })
    expect(
      formatDocumentBatchOutcome(outcome, {
        successVerb: '已移动',
        completeFailure: '未能移动所选文档',
      })
    ).toBe('已移动 1 份文档，2 份未处理（无权操作 1 份、状态冲突 1 份）。')
  })

  it('全部成功时清空选择', () => {
    const outcome = createDocumentBatchOutcome(
      ['doc-a', 'doc-b'],
      { updated: 2 },
      'updated'
    )

    expect(outcome.status).toBe('success')
    expect(outcome.remainingIds).toEqual([])
  })

  it('失败身份不完整时保守保留原选择', () => {
    const outcome = createDocumentBatchOutcome(
      ['doc-a', 'doc-b'],
      { queued: 1, skipped: 1 },
      'queued'
    )

    expect(outcome.status).toBe('warning')
    expect(outcome.remainingIds).toEqual(['doc-a', 'doc-b'])
  })
})
