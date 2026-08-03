import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const pageSource = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8')

describe('数据集入库策略页扁平化契约', () => {
  it('接入共享详情壳层并保留唯一主操作', () => {
    expect(pageSource).toContain('<DatasetDetailShell')
    expect(pageSource).toContain('activeSection="ingestion"')
    expect(pageSource).toContain('datasetName={dataset?.name}')
    expect(pageSource).toContain('保存策略')
    expect(pageSource).toContain('disabled={saving || !policy || !isDirty}')
    expect(pageSource).not.toContain('<PageScaffold')
  })

  it('保留规则、模板、预览和策略接口能力', () => {
    expect(pageSource).toContain('applyDraft')
    expect(pageSource).toContain('applyTemplate')
    expect(pageSource).toContain('pipelineApi.ingestionPreview')
    expect(pageSource).toContain('datasetApi.updateIngestionPolicy')
    expect(pageSource).toContain('生成预览')
  })

  it('为桌面链接和移动端选择器提供未保存保护', () => {
    expect(pageSource).toContain('useUnsavedNavigationGuard')
    expect(pageSource).toContain('onSectionNavigate={navigationGuard.requestNavigation}')
    expect(pageSource).toContain('navigationGuard.navigationPending')
    expect(pageSource).toContain('navigationGuard.confirmNavigation')
    expect(pageSource).toContain('放弃更改并离开')
  })

  it('移除旧装饰表面并使用面向用户的中文标签', () => {
    expect(pageSource).not.toContain('gradient')
    expect(pageSource).not.toContain('backdrop-blur')
    expect(pageSource).not.toContain('rounded-2xl')
    expect(pageSource).not.toContain('rounded-xl')
    expect(pageSource).not.toContain('rounded-[')
    expect(pageSource).not.toContain('shadow-[')
    expect(pageSource).not.toContain('text-[11px]')
    expect(pageSource).toContain('文件名正则（可选）')
    expect(pageSource).toContain('切片策略（可选覆盖）')
    expect(pageSource).toContain('高级策略参数（JSON，可选）')
  })
})
