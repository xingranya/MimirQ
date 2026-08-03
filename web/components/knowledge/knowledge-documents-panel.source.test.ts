import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('知识库文档面板视觉契约', () => {
  const source = readFileSync(
    resolve(__dirname, 'knowledge-documents-panel.tsx'),
    'utf8'
  )

  it('保持扁平视觉并移除装饰性效果', () => {
    expect(source).not.toContain('backdrop-blur')
    expect(source).not.toContain('linear-gradient')
    expect(source).not.toContain('radial-gradient')
    expect(source).not.toContain('rounded-[')
    expect(source).not.toContain('rounded-xl')
    expect(source).not.toContain('rounded-2xl')
    expect(source).not.toContain('shadow-[')
    expect(source).not.toContain('hover:-translate')
  })

  it('让表格和卡片操作在窄屏及触屏上可用', () => {
    expect(source).toContain('min-w-full overflow-x-auto')
    expect(source).toContain('min-w-[920px]')
    expect(source).not.toContain('contextualRevealClassName')
  })
})
