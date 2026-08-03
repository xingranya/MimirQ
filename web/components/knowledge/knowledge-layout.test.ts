import { describe, expect, it } from 'vitest'

import { resolveKnowledgeDocumentGridColumns } from './knowledge-layout'

describe('知识库文档网格布局', () => {
  it.each([
    { isMobile: true, isTablet: false, columns: 1 },
    { isMobile: false, isTablet: true, columns: 2 },
    { isMobile: false, isTablet: false, columns: 3 },
  ])('按当前断点返回 $columns 列', ({ isMobile, isTablet, columns }) => {
    expect(resolveKnowledgeDocumentGridColumns(isMobile, isTablet)).toBe(columns)
  })
})
