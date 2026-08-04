import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(__dirname, 'document-health-page.tsx'), 'utf8')

describe('文档健康审计页视觉与文案契约', () => {
  it('保留四项真实概览并使用折叠明细', () => {
    expect(source).toContain('label="解析质量"')
    expect(source).toContain('label="内容覆盖"')
    expect(source).toContain('label="知识图谱"')
    expect(source).toContain('label="检索命中"')
    expect(source.match(/<HealthDetails/g)).toHaveLength(4)
    expect(source).toContain('<details')
  })

  it('区分加载、失败重试、空数据和完整数据', () => {
    expect(source).toContain('<DocumentHealthLoading')
    expect(source).toContain('<QueryErrorState')
    expect(source).toContain('title="文档健康数据加载失败"')
    expect(source).toContain('暂无健康数据')
    expect(source).toContain('{data ? (')
  })

  it('不向用户展示内部编号、环境变量和工程术语', () => {
    expect(source).not.toContain('data.document_id')
    expect(source).not.toContain('data.dataset_id')
    expect(source).not.toContain('PII-safe')
    expect(source).not.toContain('Parse score')
    expect(source).not.toContain('Overlap waste')
    expect(source).not.toContain('ENABLE_METRICS_LOG')
    expect(source).not.toContain('扫描 trace')
    expect(source).not.toContain('唯一 chunk')
    expect(source).not.toContain('KG 链路')
  })

  it('使用扁平表面、统一圆角和可读字号', () => {
    expect(source).not.toContain('gradient')
    expect(source).not.toContain('backdrop-blur')
    expect(source).not.toContain('rounded-[')
    expect(source).not.toContain('rounded-xl')
    expect(source).not.toContain('rounded-2xl')
    expect(source).not.toContain('rounded-full')
    expect(source).not.toContain('shadow-[')
    expect(source).not.toContain('shadow-strong')
    expect(source).not.toMatch(/text-\[(?:8|9|10|11)px\]/)
  })
})
