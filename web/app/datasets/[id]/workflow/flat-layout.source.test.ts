import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const pageSource = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8')
const editorSource = readFileSync(
  resolve(__dirname, '../../../../components/workflow/workflow-editor.tsx'),
  'utf8'
)

describe('数据集工作流页扁平化契约', () => {
  it('接入共享详情壳层并收敛页面操作', () => {
    expect(pageSource).toContain('<DatasetDetailShell')
    expect(pageSource).toContain('activeSection="workflow"')
    expect(pageSource).toContain('datasetName={dataset?.name}')
    expect(pageSource).toContain('保存布局')
    expect(pageSource).toContain('更多操作')
    expect(pageSource).toContain('导出 JSON')
    expect(pageSource).toContain('导入 JSON')
    expect(pageSource).not.toContain('<PageScaffold')
  })

  it('保留配置导入导出、画布编辑和节点详情能力', () => {
    expect(pageSource).toContain('datasetApi.exportConfig')
    expect(pageSource).toContain('datasetApi.importConfig')
    expect(pageSource).toContain('<WorkflowEditor')
    expect(pageSource).toContain('onWorkflowLayoutChange')
    expect(pageSource).toContain('copySelectedJson')
  })

  it('保护未保存布局并覆盖移动端程序化导航', () => {
    expect(pageSource).toContain('useUnsavedNavigationGuard')
    expect(pageSource).toContain('enabled: hasUnsavedLayoutChanges && !saving')
    expect(pageSource).toContain('onSectionNavigate={navigationGuard.requestNavigation}')
    expect(pageSource).toContain('navigationGuard.navigationPending')
    expect(pageSource).toContain('放弃更改并离开')
  })

  it('移除旧装饰表面和用户可见内部状态', () => {
    for (const source of [pageSource, editorSource]) {
      expect(source).not.toContain('gradient')
      expect(source).not.toContain('backdrop-blur')
      expect(source).not.toContain('rounded-2xl')
      expect(source).not.toContain('rounded-xl')
      expect(source).not.toContain('rounded-[')
      expect(source).not.toContain('shadow-[')
    }
    expect(pageSource).not.toContain('text-[11px]')
    expect(pageSource).not.toContain('CONFIG GRAPH')
    expect(pageSource).not.toContain('replace=true')
  })
})
