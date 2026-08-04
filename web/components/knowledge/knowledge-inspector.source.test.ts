import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const inspectorSource = readFileSync(
  resolve(__dirname, 'knowledge-inspector.tsx'),
  'utf8'
)
const pageSource = readFileSync(resolve(__dirname, 'knowledge-page.tsx'), 'utf8')
const documentsPanelSource = readFileSync(
  resolve(__dirname, 'knowledge-documents-panel.tsx'),
  'utf8'
)

describe('知识库文档详情面板', () => {
  it('显示知识库名称和用户可读解析器名称', () => {
    expect(inspectorSource).toContain('datasetLabelById?.[datasetId]')
    expect(inspectorSource).toContain('getParserLabel(parserBackend)')
    expect(inspectorSource).not.toContain('{selected.dataset_id}')
    expect(
      pageSource.match(
        /<KnowledgeInspector[\s\S]*?datasetLabelById=\{datasetLabelById\}[\s\S]*?\/>/g
      )
    ).toHaveLength(2)
    expect(documentsPanelSource).toContain('datasetLabelById={datasetLabelById}')
  })

  it('保留切片管理与健康审计入口', () => {
    expect(inspectorSource).toContain('buildChunkPreviewDocumentHref(selected.id)')
    expect(inspectorSource).toContain('href={`/knowledge/${selected.id}/health`}')
    expect(inspectorSource).toContain('切片管理')
    expect(inspectorSource).toContain('健康审计')
  })

  it('长文本和窄屏操作保持可读', () => {
    expect(inspectorSource).toContain('break-words text-sm font-semibold')
    expect(inspectorSource).toContain('break-all font-medium leading-5')
    expect(inspectorSource).toContain('grid grid-cols-1 gap-2 sm:grid-cols-2')
  })

  it('保持扁平视觉和可读字号', () => {
    expect(inspectorSource).not.toContain('gradient')
    expect(inspectorSource).not.toContain('backdrop-blur')
    expect(inspectorSource).not.toContain('rounded-[')
    expect(inspectorSource).not.toContain('rounded-xl')
    expect(inspectorSource).not.toContain('rounded-full')
    expect(inspectorSource).not.toContain('shadow-[')
    expect(inspectorSource).not.toMatch(/text-\[(?:8|9|10|11)px\]/)
  })
})
