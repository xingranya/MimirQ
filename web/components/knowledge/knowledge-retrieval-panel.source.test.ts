import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const panelSource = readFileSync(
  resolve(__dirname, 'knowledge-retrieval-panel.tsx'),
  'utf8'
)
const pageSource = readFileSync(resolve(__dirname, 'knowledge-page.tsx'), 'utf8')
const hookSource = readFileSync(
  resolve(__dirname, '../../hooks/use-index-audit.ts'),
  'utf8'
)

describe('知识库索引审计面板', () => {
  it('只展示后端真实返回或明确标注的汇总数据', () => {
    expect(panelSource).not.toContain('estimateIndexSizeBytes')
    expect(panelSource).not.toContain('embeddingDims')
    expect(panelSource).not.toContain('索引大小')
    expect(panelSource).toContain("return { label: '汇总数据', tone: 'info' as const }")
    expect(panelSource).toContain("return { label: '尚未审计', tone: 'neutral' as const }")
  })

  it('用数据集名称替代用户可见的原始标识', () => {
    expect(panelSource).toContain('selectedDatasetLabel?.trim()')
    expect(pageSource).toContain('selectedDatasetLabel={selectedDatasetLabel}')
  })

  it('提供审计失败、重试、空状态和一致性明细', () => {
    expect(panelSource).toContain('role="alert"')
    expect(panelSource).toContain('重新运行')
    expect(panelSource).toContain('运行索引审计')
    expect(panelSource).toContain('一致性检查')
    expect(panelSource).toContain('后端缺失向量样本')
  })

  it('使用自然中文反馈', () => {
    expect(hookSource).toContain("toast.error('请先选择数据集')")
    expect(hookSource).toContain("toast.success('索引审计已完成')")
    expect(hookSource).not.toContain("toast.success('Index Audit")
    expect(hookSource).not.toContain("toast.error('请先选择数据集再运行 Index Audit')")
  })

  it('保持扁平视觉和可读字号', () => {
    expect(panelSource).not.toContain('gradient')
    expect(panelSource).not.toContain('backdrop-blur')
    expect(panelSource).not.toContain('rounded-[')
    expect(panelSource).not.toContain('rounded-xl')
    expect(panelSource).not.toContain('rounded-2xl')
    expect(panelSource).not.toContain('rounded-full')
    expect(panelSource).not.toContain('shadow-[')
    expect(panelSource).not.toContain('shadow-strong')
    expect(panelSource).not.toContain('hover:-translate')
    expect(panelSource).not.toMatch(/text-\[(?:8|9|10|11)px\]/)
  })
})
