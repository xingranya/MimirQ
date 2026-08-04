import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sidebarSource = readFileSync(resolve(__dirname, 'sidebar-client.tsx'), 'utf8')
const catalogSource = readFileSync(
  resolve(__dirname, '../../../../i18n/messages/zh-CN/chunk-preview.ts'),
  'utf8'
)

describe('分块预览参数侧栏', () => {
  it('默认折叠预览性能和入库管线高级配置', () => {
    expect(sidebarSource.match(/<details\b/g)).toHaveLength(2)
    expect(sidebarSource).toContain('data-preview-performance-panel')
    expect(sidebarSource).toContain("label={t('sidebar.ingestionPipeline')}")
    expect(sidebarSource).not.toMatch(/<details[^>]*\bopen\b/)
  })

  it('文件操作常驻显示且不覆盖文件内容', () => {
    expect(sidebarSource).toContain('onClick={() => toggleIngestFileSelection(f.id)}')
    expect(sidebarSource).toContain('if (fileIndex >= 0) removeFile(fileIndex)')
    expect(sidebarSource).not.toContain('group-hover:opacity')
    expect(sidebarSource).not.toContain('opacity-0')
    expect(sidebarSource).not.toContain('absolute right-')
  })

  it('保留预览、取消、入库、插件、推荐和历史操作', () => {
    expect(sidebarSource).toContain('onClick={() => runPreview()}')
    expect(sidebarSource).toContain('cancelPreview()')
    expect(sidebarSource).toContain('onClick={submitSelectedFiles}')
    expect(sidebarSource).toContain("t('sidebar.pythonPlugins.applySelected')")
    expect(sidebarSource).toContain("t('sidebar.recommendations.applyAll')")
    expect(sidebarSource).toContain('clearRunHistory()')
  })

  it('使用扁平样式和可读字号', () => {
    for (const forbidden of [
      'bg-[linear-gradient',
      'bg-[radial-gradient',
      'backdrop-blur',
      'shadow-[',
      'rounded-xl',
      'rounded-2xl',
      'rounded-3xl',
      'blur-3xl',
      'font-black',
    ]) {
      expect(sidebarSource).not.toContain(forbidden)
    }
    expect(sidebarSource).not.toMatch(/text-\[(?:[0-9]|1[01])(?:\.[0-9]+)?px\]/)
  })

  it('中文侧栏不暴露内部配置术语', () => {
    expect(catalogSource).toContain("title: '文档范围'")
    expect(catalogSource).toContain("pipelineSummary: '数据集入库配置'")
    expect(catalogSource).toContain("goldenTitle: '标准回归用例'")
    expect(catalogSource).toContain("title: '参数建议'")

    for (const oldCopy of [
      "title: 'Dataset Scope'",
      "governanceOff: 'Governance Off'",
      "vectorOff: 'Vector Off'",
      "applySuggestedPipelinePatchError: '应用 suggested pipeline patch 失败'",
      "parserStrategy: 'parser: {parser} · strategy: {strategy}'",
      "goldenTitle: 'Golden 回归集'",
      "title: 'RECOMMENDATIONS'",
    ]) {
      expect(catalogSource).not.toContain(oldCopy)
    }
  })
})
