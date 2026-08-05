import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const treeSource = readFileSync(resolve(__dirname, 'category-tree.tsx'), 'utf8')
const multiSelectSource = readFileSync(resolve(__dirname, 'category-multi-select.tsx'), 'utf8')

describe('数据集分类交互视觉契约', () => {
  it('分类树和选择面板使用扁平边界', () => {
    for (const source of [treeSource, multiSelectSource]) {
      expect(source).not.toMatch(/linear-gradient|backdrop-blur|shadow-\[|rounded-\[|rounded-(?:xl|2xl|3xl|full)/)
    }
    expect(treeSource).toContain('rounded-lg border border-border/60 bg-background')
    expect(multiSelectSource).toContain("cn('rounded-lg', className)")
  })

  it('图标按钮提供可识别标签，保留分类管理和多选保存流程', () => {
    expect(treeSource).toContain('<IconButton label="新建分类"')
    expect(treeSource).toContain("label={selectedId ? '删除当前分类' : '请选择分类后删除'}")
    expect(multiSelectSource).toContain('datasetApi.setCategories')
    expect(multiSelectSource).toContain('setDraft([])')
  })
})
