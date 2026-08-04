import { describe, expect, it } from 'vitest'

import {
  glossaryDraftValidationError,
  industryRulesDraftFingerprints,
  intentsDraftValidationError,
  patternsDraftValidationError,
  type IndustryRulesDraft,
} from './industry-rules-draft'

function createDraft(): IndustryRulesDraft {
  return {
    glossaryEntries: [
      { id: 'local-a', term: '授权', aliasesText: '权限, 许可' },
    ],
    patternEntries: [
      {
        id: 'local-b',
        markersText: '报错, 失败',
        followup: '请提供错误信息',
        enabled: true,
      },
    ],
    intentEntries: [
      {
        id: 'local-c',
        name: '故障排查',
        keywordsText: '报错, 异常',
        route: 'support',
      },
    ],
  }
}

describe('行业规则草稿指纹', () => {
  it('忽略本地行标识，但保留新增的空白编辑行', () => {
    const first = createDraft()
    const second = createDraft()
    second.glossaryEntries = [
      { ...second.glossaryEntries[0], id: 'another-id' },
    ]

    expect(industryRulesDraftFingerprints(second)).toEqual(
      industryRulesDraftFingerprints(first)
    )

    second.glossaryEntries = [
      ...second.glossaryEntries,
      { id: 'empty', term: '', aliasesText: '' },
    ]
    expect(industryRulesDraftFingerprints(second).glossary).not.toBe(
      industryRulesDraftFingerprints(first).glossary
    )
  })

  it('分别识别术语、模式和意图修改', () => {
    const baseline = createDraft()
    const baselineFingerprints = industryRulesDraftFingerprints(baseline)
    const changed = createDraft()
    changed.patternEntries = [
      { ...changed.patternEntries[0], enabled: false },
    ]
    const changedFingerprints = industryRulesDraftFingerprints(changed)

    expect(changedFingerprints.glossary).toBe(baselineFingerprints.glossary)
    expect(changedFingerprints.patterns).not.toBe(
      baselineFingerprints.patterns
    )
    expect(changedFingerprints.intents).toBe(baselineFingerprints.intents)
  })

  it('次要字段先于主字段输入时仍会标记草稿变化', () => {
    const baseline = createDraft()
    baseline.glossaryEntries = []
    baseline.patternEntries = []
    baseline.intentEntries = []
    const baselineFingerprints = industryRulesDraftFingerprints(baseline)

    const partialDraft = createDraft()
    partialDraft.glossaryEntries = [
      { id: 'glossary-empty', term: '', aliasesText: '权限别名' },
    ]
    partialDraft.patternEntries = [
      {
        id: 'pattern-empty',
        markersText: '',
        followup: '请补充报错截图',
        enabled: true,
      },
    ]
    partialDraft.intentEntries = [
      {
        id: 'intent-empty',
        name: '',
        keywordsText: '授权, 权限',
        route: 'support',
      },
    ]
    const partialFingerprints = industryRulesDraftFingerprints(partialDraft)

    expect(partialFingerprints.glossary).not.toBe(
      baselineFingerprints.glossary
    )
    expect(partialFingerprints.patterns).not.toBe(
      baselineFingerprints.patterns
    )
    expect(partialFingerprints.intents).not.toBe(
      baselineFingerprints.intents
    )
  })

  it('保存前指出缺少必填主字段的具体行', () => {
    expect(
      glossaryDraftValidationError([
        { id: 'first', term: '授权', aliasesText: '' },
        { id: 'second', term: '', aliasesText: '权限' },
      ])
    ).toBe('第 2 条术语缺少术语名称')
    expect(
      patternsDraftValidationError([
        {
          id: 'pattern',
          markersText: '',
          followup: '请补充截图',
          enabled: true,
        },
      ])
    ).toBe('第 1 条问题模式缺少触发词')
    expect(
      intentsDraftValidationError([
        {
          id: 'intent',
          name: '',
          keywordsText: '授权',
          route: 'support',
        },
      ])
    ).toBe('第 1 条意图缺少意图名称')
  })
})
