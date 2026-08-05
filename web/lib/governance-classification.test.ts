import { describe, expect, it } from 'vitest'

import {
  dedupeGovernanceTags,
  getGovernanceDocumentTagValue,
  selectGovernanceCategoryTag,
} from '@/lib/governance-classification'
import type { AutoDocumentTag } from '@/types'

const categoryTag: AutoDocumentTag = {
  type: 'category',
  value: '入库流程',
  label: '分类',
  confidence: 0.76,
  source: 'cpu',
}

describe('治理自动分类转换', () => {
  it('优先使用后端标签的实际值', () => {
    expect(getGovernanceDocumentTagValue(categoryTag)).toBe('入库流程')
    expect(
      getGovernanceDocumentTagValue({
        ...categoryTag,
        type: 'sensitivity',
        value: 'internal',
        label: '敏感级别',
      })
    ).toBe('内部')
  })

  it('优先选择分类候选，不把类型名称保存为分类', () => {
    const topicTag: AutoDocumentTag = {
      ...categoryTag,
      type: 'topic',
      value: '知识库',
      label: '主题',
    }

    expect(selectGovernanceCategoryTag([topicTag, categoryTag])).toBe(categoryTag)
  })

  it('清理手动标签两侧空白并去重', () => {
    expect(dedupeGovernanceTags([' 重要 ', '重要', '', '内部'])).toEqual([
      '重要',
      '内部',
    ])
  })
})
