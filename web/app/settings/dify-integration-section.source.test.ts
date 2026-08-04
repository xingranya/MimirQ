import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  new URL('./_sections/dify-integration-section.tsx', import.meta.url),
  'utf8'
)

describe('Dify 接入区块视觉契约', () => {
  it('使用线性分隔布局并移除旧装饰样式', () => {
    expect(source).toContain('border-t border-border')
    expect(source).toContain('xl:border-r')
    expect(source).not.toContain('linear-gradient')
    expect(source).not.toContain('shadow-')
    expect(source).not.toMatch(/rounded-\[(?:9|1\d|2\d)px\]/)
    expect(source).not.toContain('rounded-full')
  })

  it('保留启用、重试、绑定和删除操作', () => {
    expect(source).toContain('切换 Dify 外部知识库接入')
    expect(source).toContain('重新加载')
    expect(source).toContain('生成绑定')
    expect(source).toContain('删除 ${bindingId} 绑定')
  })

  it('为可编辑字段提供可访问标签', () => {
    for (const id of [
      'dify-api-key',
      'dify-knowledge-id',
      'dify-account-id',
      'dify-top-k-max',
    ]) {
      expect(source).toContain(`htmlFor="${id}"`)
      expect(source).toContain(`id="${id}"`)
    }
  })
})
