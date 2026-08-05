import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  resolve(__dirname, 'pipeline-options-panel.tsx'),
  'utf8'
)

describe('管线选项面板视觉契约', () => {
  it('使用轻边界和统一圆角，不保留旧装饰样式', () => {
    expect(source).not.toMatch(/linear-gradient|backdrop-blur|shadow-\[/)
    expect(source).not.toMatch(/rounded-\[|rounded-(?:xl|2xl|3xl|full)/)
    expect(source).toContain('rounded-lg border border-border/70')
  })

  it('对外文案使用中文能力名称，内部缩写仅保留在配置键中', () => {
    expect(source).toContain("label: '语义向量索引'")
    expect(source).toContain("label: '关键词索引'")
    expect(source).toContain("label: '知识图谱抽取'")
    expect(source).toContain("title: '向量表示'")
    expect(source).not.toContain('Economical (省成本)')
    expect(source).not.toContain('High-quality (高质量)')
    expect(source).not.toContain('KG 抽取')
  })
})
