import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const workbenchSource = readFileSync(resolve(__dirname, 'index.tsx'), 'utf8')
const sidebarSource = readFileSync(resolve(__dirname, 'sidebar.tsx'), 'utf8')
const catalogSource = readFileSync(
  resolve(__dirname, '../../../../i18n/messages/zh-CN/chunk-preview.ts'),
  'utf8'
)

describe('分块预览工作台壳层', () => {
  it('空状态只保留文档选择、示例和指南入口', () => {
    expect(workbenchSource).toContain('id="chunk-empty-file-input"')
    expect(workbenchSource).toContain('onDrop={handleDrop}')
    expect(workbenchSource).toContain('onClick={loadExample}')
    expect(workbenchSource).toContain('setHelpOpen(true)')
    expect(workbenchSource).not.toContain('data-chunk-empty-visual-map')
    expect(workbenchSource).not.toContain('visualSteps')
    expect(workbenchSource).not.toContain('processCards')
  })

  it('移除装饰背景、虚构指标和旧式容器', () => {
    for (const value of [workbenchSource, sidebarSource]) {
      expect(value).not.toContain('bg-[radial-gradient')
      expect(value).not.toContain('bg-[linear-gradient')
      expect(value).not.toContain('backdrop-blur')
      expect(value).not.toContain('shadow-[')
      expect(value).not.toContain('rounded-2xl')
      expect(value).not.toContain('rounded-3xl')
      expect(value).not.toContain('text-[9px]')
      expect(value).not.toContain('text-[10px]')
      expect(value).not.toContain('text-[11px]')
    }

    expect(workbenchSource).not.toContain('KnowledgeOpsFlowCard')
    expect(workbenchSource).not.toContain('Knowledge Ops')
    expect(workbenchSource).not.toContain('文档资产治理中枢')
  })

  it('保留桌面工作区和移动端参数弹层', () => {
    expect(workbenchSource).toContain('<Sidebar variant="pane" />')
    expect(workbenchSource).toContain('<OriginalPreview />')
    expect(workbenchSource).toContain('<ChunkList />')
    expect(workbenchSource).toContain('<WorkbenchPanelDialog')
    expect(workbenchSource).toContain('<Sidebar variant="dialog" />')
  })

  it('删除未接入渲染链路的旧空状态副本并使用上线文案', () => {
    expect(
      existsSync(resolve(__dirname, '../empty-state.tsx'))
    ).toBe(false)
    expect(catalogSource).toContain("title: '选择文档，检查切块效果'")
    expect(catalogSource).toContain("title: '切块预览'")
    expect(catalogSource).toContain("settingsPanelTitle: '切块参数'")
  })
})
