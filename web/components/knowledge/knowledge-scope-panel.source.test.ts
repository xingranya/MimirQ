import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  resolve(__dirname, 'knowledge-scope-panel.tsx'),
  'utf8'
)

describe('知识库范围筛选面板', () => {
  it('使用共享下拉控件和统一尺寸', () => {
    expect(source).toContain('onValueChange={setDatasetScope}')
    expect(source).toContain('disabled={datasetsLoading}')
    expect(source).toContain("'h-9 w-full rounded-md")
    expect(source).not.toContain('datasetListExpanded')
    expect(source).not.toContain('ChevronDown')
  })

  it('目录请求区分加载、失败和可用状态', () => {
    expect(source).toContain('folderTreeQuery.isPending')
    expect(source).toContain('folderTreeQuery.isError')
    expect(source).toContain("formatApiError(folderTreeQuery.error, '目录加载失败')")
    expect(source).toContain('onClick={() => folderTreeQuery.refetch()}')
    expect(source).toContain('hasDirectoryFilter')
  })

  it('保持扁平视觉和可读字号', () => {
    expect(source).not.toContain('gradient')
    expect(source).not.toContain('backdrop-blur')
    expect(source).not.toContain('rounded-[')
    expect(source).not.toContain('rounded-xl')
    expect(source).not.toContain('rounded-full')
    expect(source).not.toContain('shadow-[')
    expect(source).not.toContain('hover:-translate')
    expect(source).not.toMatch(/text-\[(?:8|9|10|11)px\]/)
    expect(source).not.toContain('Scope Navigator')
  })
})
