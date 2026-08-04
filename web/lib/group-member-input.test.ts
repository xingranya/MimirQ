import { describe, expect, it } from 'vitest'

import {
  MAX_GROUP_MEMBERS_PER_REQUEST,
  normalizeGroupMemberIds,
} from './group-member-input'

describe('成员组批量成员输入', () => {
  it('允许最多 200 个不同的成员标识', () => {
    const raw = Array.from(
      { length: MAX_GROUP_MEMBERS_PER_REQUEST },
      (_, index) => `member-${index + 1}`
    ).join('\n')

    const result = normalizeGroupMemberIds(raw)

    expect(result.error).toBeUndefined()
    expect(result.ids).toHaveLength(MAX_GROUP_MEMBERS_PER_REQUEST)
  })

  it('超过 200 人时拒绝整批输入并报告实际数量', () => {
    const raw = Array.from(
      { length: MAX_GROUP_MEMBERS_PER_REQUEST + 1 },
      (_, index) => `member-${index + 1}`
    ).join(',')

    expect(normalizeGroupMemberIds(raw)).toEqual({
      ids: [],
      error: '一次最多添加 200 人，当前输入 201 个不同的成员标识。请分批添加。',
    })
  })

  it('去重后未超过上限时正常提交', () => {
    const raw = Array.from(
      { length: MAX_GROUP_MEMBERS_PER_REQUEST + 1 },
      (_, index) => `member-${(index % MAX_GROUP_MEMBERS_PER_REQUEST) + 1}`
    ).join(';')

    const result = normalizeGroupMemberIds(raw)

    expect(result.error).toBeUndefined()
    expect(result.ids).toHaveLength(MAX_GROUP_MEMBERS_PER_REQUEST)
  })

  it('拒绝超过字段长度限制的成员标识', () => {
    expect(normalizeGroupMemberIds('a'.repeat(256))).toEqual({
      ids: [],
      error: '成员标识过长，最多 255 个字符。',
    })
  })
})
