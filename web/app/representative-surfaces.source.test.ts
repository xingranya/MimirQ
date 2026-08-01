import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const knowledgeSource = readFileSync(
  resolve(__dirname, '../components/knowledge/knowledge-page.tsx'),
  'utf8'
)
const historySource = readFileSync(resolve(__dirname, 'history/page-client.tsx'), 'utf8')
const graphHeaderSource = readFileSync(
  resolve(__dirname, 'graph/_components/graph-page-header.tsx'),
  'utf8'
)

describe('代表性页面扁平化视觉契约', () => {
  it('知识库复用统一管理页头和分段控件', () => {
    expect(knowledgeSource).toContain('<KnowledgeOpsHero')
    expect(knowledgeSource).toContain('eyebrow={null}')
    expect(knowledgeSource).toContain("? 'bg-primary text-primary-foreground'")
    expect(knowledgeSource).not.toContain('bg-[linear-gradient')
  })

  it('历史页使用无毛玻璃、无大圆角的列表工作区', () => {
    expect(historySource).toContain('data-history-main-empty="true"')
    expect(historySource).toContain('rounded-md border border-transparent')
    expect(historySource).not.toContain('backdrop-blur')
    expect(historySource).not.toContain('rounded-[')
    expect(historySource).not.toContain('shadow-[')
  })

  it('图谱顶栏保持平面工具栏结构', () => {
    expect(graphHeaderSource).toContain('border-b border-border bg-background')
    expect(graphHeaderSource).toContain('rounded-md border border-border bg-muted')
    expect(graphHeaderSource).not.toContain('gradient')
    expect(graphHeaderSource).not.toContain('backdrop-blur')
    expect(graphHeaderSource).not.toContain('rounded-[')
  })
})
