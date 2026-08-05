import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const emptyStateSource = readFileSync(resolve(__dirname, 'empty-state.tsx'), 'utf8')
const dropZoneSource = readFileSync(resolve(__dirname, 'drop-zone.tsx'), 'utf8')

describe('入库入口与空状态视觉和行为契约', () => {
  it('空状态只保留说明和真实操作', () => {
    expect(emptyStateSource).toContain('data-ingestion-empty-state="empty"')
    expect(emptyStateSource).toContain('上传样本评估')
    expect(emptyStateSource).toContain('正式入库')
    expect(emptyStateSource).not.toMatch(
      /radial-gradient|linear-gradient|rounded-\[|rounded-2xl|shadow-soft|animate-pulse/
    )
    expect(emptyStateSource).not.toContain('<svg')
    expect(emptyStateSource).not.toContain('预留区')
  })

  it('上传弹窗区分加载、失败和空数据状态', () => {
    expect(dropZoneSource).toContain('datasetsQuery.isLoading')
    expect(dropZoneSource).toContain('datasetsQuery.isError')
    expect(dropZoneSource).toContain('<QueryErrorState')
    expect(dropZoneSource).toContain('还没有可用的数据集')
    expect(dropZoneSource).toContain('void datasetsQuery.refetch()')
  })

  it('限制文件预览数量并为选择控件提供标签', () => {
    expect(dropZoneSource).toContain('pendingDropFiles?.slice(0, 5)')
    expect(dropZoneSource).toContain('另有 {remainingFileCount} 个文件')
    expect(dropZoneSource).toContain('htmlFor="drop-zone-dataset"')
    expect(dropZoneSource).toContain('id="drop-zone-parser"')
    expect(dropZoneSource).toContain('自动选择（推荐）')
    expect(dropZoneSource).toContain('handleDropConfirmOpenChange(false)')
  })

  it('拖放提示使用扁平紧凑表面', () => {
    expect(dropZoneSource).toContain('w-full max-w-sm rounded-md border border-dashed')
    expect(dropZoneSource).not.toMatch(/backdrop-blur|shadow-lg|rounded-xl/)
  })
})
