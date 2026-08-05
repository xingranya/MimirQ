import { describe, expect, it } from 'vitest'

import {
  findGovernanceSelectionRange,
  normalizeGovernanceSelectedText,
} from '@/lib/governance-annotation-selection'

describe('数据标注选区映射', () => {
  it('保留精确匹配的原文偏移', () => {
    const content = '前言：适用范围。结尾。'
    const selection = findGovernanceSelectionRange(content, '适用范围')

    expect(selection).toEqual({
      start: content.indexOf('适用范围'),
      end: content.indexOf('适用范围') + '适用范围'.length,
      text: '适用范围',
    })
  })

  it('连续空白被浏览器压缩后仍映射到原始文本', () => {
    const content = '前言\n\n  第十二条\t适用范围\n结尾'
    const expectedText = '第十二条\t适用范围'
    const start = content.indexOf('第十二条')
    const selection = findGovernanceSelectionRange(content, '第十二条 适用范围')

    expect(selection).toEqual({
      start,
      end: start + expectedText.length,
      text: expectedText,
    })
  })

  it('无法匹配时不生成错误标注', () => {
    expect(normalizeGovernanceSelectedText('  第一条\n  第二条  ')).toBe('第一条 第二条')
    expect(findGovernanceSelectionRange('第一条', '不存在的内容')).toBeNull()
  })
})
