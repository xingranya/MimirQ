import { describe, expect, it } from 'vitest'

import {
  cloneGovernanceDocumentState,
  governanceDocumentStateFingerprint,
  readGovernanceDocumentState,
  serializeGovernanceDocumentState,
} from './governance-document-state'

describe('治理文档状态', () => {
  it('从文档用户元数据恢复治理结果', () => {
    const state = readGovernanceDocumentState({
      user: {
        governance: {
          version: 1,
          annotations: [
            {
              id: 'a-1',
              text: '见外传媒',
              type: 'entity',
              label: '机构',
              start: 0,
              end: 4,
            },
          ],
          tags: ['品牌', '品牌', '知识库'],
          category: '产品资料',
          quality_score: 96,
          issues: [],
        },
      },
    })

    expect(state).toMatchObject({
      tags: ['品牌', '知识库'],
      category: '产品资料',
      qualityScore: 96,
    })
    expect(state?.annotations).toHaveLength(1)
  })

  it('序列化时限制异常值并生成稳定指纹', () => {
    const state = {
      annotations: [],
      tags: [' 已审核 ', '已审核'],
      category: '合同',
      qualityScore: 120,
      issues: [],
    }
    const serialized = serializeGovernanceDocumentState(state)
    const cloned = cloneGovernanceDocumentState(state)

    expect(serialized.tags).toEqual(['已审核'])
    expect(serialized.quality_score).toBe(100)
    expect(governanceDocumentStateFingerprint(cloned)).toBe(
      governanceDocumentStateFingerprint(state)
    )
  })

  it('忽略无效的治理元数据', () => {
    expect(readGovernanceDocumentState(null)).toBeNull()
    expect(readGovernanceDocumentState({ user: {} })).toBeNull()
  })
})
