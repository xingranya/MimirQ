import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(__dirname, 'data-annotator.tsx'), 'utf8')
const messages = readFileSync(
  resolve(__dirname, '../../i18n/messages/zh-CN/governance.ts'),
  'utf8'
)

describe('数据标注面板视觉与文案契约', () => {
  it('使用扁平表面和统一控件圆角', () => {
    expect(source).not.toMatch(/rounded-(?:xl|2xl|3xl)|shadow-\[|shadow-inner|backdrop-blur/)
    expect(source).toContain("'focus-ring rounded-md border px-3 py-2 text-left transition-colors'")
    expect(source).toContain('rounded-lg border border-border bg-muted/20 p-4')
  })

  it('选项状态可读，图标操作带说明', () => {
    expect(source).toContain('aria-pressed={selected}')
    expect(source).toContain('aria-pressed={isSelected}')
    expect(source).toContain('<IconButton')
    expect(source).toContain("label={t('a11y.deleteAnnotation'")
    expect(source).not.toContain('tag.source')
    expect(source).not.toContain('tag.label || tag.type')
  })

  it('中文文案不暴露内部缩写或占位式省略号', () => {
    expect(messages).toContain('优先识别个人信息、密钥和实体线索')
    expect(messages).toContain('同时使用本地规则、AI 语义和敏感检测')
    expect(messages).not.toContain("description: 'PII、密钥和实体线索优先'")
    expect(messages).not.toContain("activePrompt: '请在右侧选中文本...'")
  })
})
