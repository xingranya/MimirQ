import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(__dirname, 'data-classifier.tsx'), 'utf8')
const messages = readFileSync(
  resolve(__dirname, '../../i18n/messages/zh-CN/governance.ts'),
  'utf8'
)

describe('分类归档面板视觉与交互契约', () => {
  it('使用扁平表面和统一控件圆角', () => {
    expect(source).not.toMatch(/rounded-(?:xl|2xl|3xl)|shadow-\[|backdrop-blur/)
    expect(source).toContain('border-y border-border py-4')
    expect(source).toContain('rounded-md border p-3 text-left')
  })

  it('分类、标签和展开状态具有明确语义', () => {
    expect(source).toContain('aria-pressed={isSelected}')
    expect(source).toContain('<IconButton')
    expect(source).toContain('aria-expanded={showAllTags}')
    expect(source).toContain("tags.join('、')")
  })

  it('自动分类使用实际标签值并隐藏内部接口口吻', () => {
    expect(source).toContain('getGovernanceDocumentTagValue(categoryTag)')
    expect(messages).toContain("success: '已推荐 {count} 个分类标签'")
    expect(messages).not.toContain("success: '后端已返回 {count} 个分类标签'")
    expect(messages).not.toContain("showMore: '显示更多...'")
  })
})
