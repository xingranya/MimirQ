import { describe, expect, it } from 'vitest'

import {
  resolveExecutionStatusCounts,
  resolveTaskQueueStatusLabel,
} from './execution-monitor-access'

describe('执行监控权限降级', () => {
  it('系统汇总不可用时按可见文档统计状态', () => {
    const documents = [
      { status: 'completed' },
      { status: 'processing' },
      { status: 'queued' },
      { status: 'failed' },
      { status: 'quarantined' },
    ]

    expect(
      resolveExecutionStatusCounts(null, documents as never)
    ).toEqual({
      completed: 1,
      processing: 1,
      pending: 1,
      failed: 1,
      quarantined: 1,
    })
  })

  it('系统汇总可用时优先采用后端统计', () => {
    expect(
      resolveExecutionStatusCounts(
        {
          by_status: {
            completed: 8,
            processing: 3,
            pending: 2,
            failed: 1,
            quarantined: 4,
          },
        } as never,
        [{ status: 'failed' }] as never
      )
    ).toEqual({
      completed: 8,
      processing: 3,
      pending: 2,
      failed: 1,
      quarantined: 4,
    })
  })

  it('权限不足和接口失败使用不同状态文案', () => {
    const base = {
      demoMode: false,
      accessLoading: false,
      canReadObservability: true,
      queryFetching: false,
      queryError: false,
      hasSnapshot: false,
    }

    expect(
      resolveTaskQueueStatusLabel({
        ...base,
        canReadObservability: false,
      })
    ).toBe('无队列查看权限')
    expect(
      resolveTaskQueueStatusLabel({ ...base, queryError: true })
    ).toBe('队列读取失败')
  })
})
