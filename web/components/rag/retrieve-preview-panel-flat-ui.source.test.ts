import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(__dirname, 'retrieve-preview-panel.tsx'), 'utf8')

describe('语义检索预览面板视觉契约', () => {
  it('使用扁平表面和统一圆角，不保留旧式装饰', () => {
    expect(source).not.toMatch(
      /linear-gradient|radial-gradient|backdrop-blur|shadow-\[|rounded-\[|tracking-\[/
    )
    expect(source).toContain("'border-border bg-card shadow-none'")
    expect(source).toContain("'flex h-full min-h-0 flex-col overflow-hidden bg-background'")
  })

  it('隐藏内部术语、数据集编号和键盘提示', () => {
    expect(source).not.toMatch(
      /Retrieval Workbench|Family Hit|Active Hit|Score |Top-K|Chunk ID|Matched Terms|\d+ tokens|Enter 发送|Shift \+ Enter/
    )
    expect(source).toContain("? '当前数据集'")
    expect(source).toContain('混合检索')
    expect(source).toContain('相关度')
    expect(source).toContain('文本片段编号')
  })

  it('保留真实检索、文档联动和完整参数能力', () => {
    expect(source).toContain('ragApi.retrieveEvidence')
    expect(source).toContain('prefetchDocumentView')
    expect(source).toContain('openDocument(documentId')
    expect(source).toContain('<Switch')
    expect(source).toContain('onCheckedChange={setEnableWeightRerank}')
    expect(source).not.toContain('seedRecentQueries')
  })
})
