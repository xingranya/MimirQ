import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  resolve(__dirname, 'conversation-ops-panel.tsx'),
  'utf8'
)

describe('对话工具面板视觉契约', () => {
  it('使用紧凑扁平面板，不保留装饰渐变和胶囊标签', () => {
    expect(source).not.toMatch(
      /linear-gradient|backdrop-blur|shadow-\[|rounded-\[|rounded-(?:xl|2xl|3xl|full)/
    )
    expect(source).toContain('border-border/70 bg-background shadow-none')
    expect(source).toContain('对话工具')
    expect(source).not.toContain('对话运维工具箱')
  })

  it('保留导出、检查点查询和清理功能', () => {
    expect(source).toContain('chatApi.exportConversation')
    expect(source).toContain('chatApi.listCheckpoints')
    expect(source).toContain('chatApi.deleteCheckpoints')
    expect(source).toContain('aria-expanded={panelOpen}')
  })
})
