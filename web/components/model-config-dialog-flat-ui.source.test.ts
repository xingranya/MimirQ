import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  resolve(__dirname, 'model-config-dialog.tsx'),
  'utf8'
)

describe('模型配置弹窗视觉契约', () => {
  it('保留弹窗滚动边界并移除旧装饰样式', () => {
    expect(source).toContain('max-h-[calc(100dvh-1rem)] overflow-y-auto')
    expect(source).not.toMatch(/rounded-2xl|shadow-strong|linear-gradient|backdrop-blur/)
    expect(source).toContain('rounded-lg border border-border')
  })

  it('移动端字段和操作按钮保持可用，文案直接面向用户', () => {
    expect(source).toContain('grid-cols-1')
    expect(source).toContain('sm:flex-row')
    expect(source).toContain('访问密钥')
    expect(source).toContain('服务地址')
    expect(source).toContain('最多输出字数')
    expect(source).not.toContain('获取 Key')
    expect(source).not.toContain('Max Tokens')
  })
})
