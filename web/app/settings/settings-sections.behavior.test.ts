import { describe, expect, it } from 'vitest'

import { findSettingsSectionMatches } from './settings-sections'

describe('设置二级搜索', () => {
  it.each([
    ['MagicPDF', 'settings-knowledge', 'parser-services'],
    ['TextIn', 'settings-knowledge', 'parser-services'],
    ['ETL4LLM', 'settings-knowledge', 'parser-services'],
    ['对象存储', 'settings-models', 'object-storage'],
    ['行业规则', 'settings-knowledge', 'industry-rules'],
    ['Access Key', 'settings-models', 'object-storage'],
    ['Trace', 'settings-platform', 'observability'],
  ])('搜索 %s 时定位到 %s/%s', (query, sectionId, subsectionId) => {
    const matches = findSettingsSectionMatches(query)

    expect(matches).toHaveLength(1)
    expect(matches[0]?.section.id).toBe(sectionId)
    expect(matches[0]?.matchedSubsectionIds).toContain(subsectionId)
  })

  it('一级任务词只筛选分组，不误展开全部高级配置', () => {
    const matches = findSettingsSectionMatches('外部服务')

    expect(matches).toHaveLength(1)
    expect(matches[0]?.section.id).toBe('settings-models')
    expect(matches[0]?.matchedSubsectionIds).toEqual([])
  })

  it('空搜索返回五组，无匹配时返回空结果', () => {
    expect(findSettingsSectionMatches('')).toHaveLength(5)
    expect(findSettingsSectionMatches('不存在的配置词')).toEqual([])
  })
})
