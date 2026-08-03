import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const pageSource = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8')

describe('数据集表格资产页扁平化契约', () => {
  it('接入共享详情壳层并移除重复导航', () => {
    expect(pageSource).toContain('<DatasetDetailShell')
    expect(pageSource).toContain('activeSection="tables"')
    expect(pageSource).toContain('datasetName={dataset?.name}')
    expect(pageSource).not.toContain('<PageScaffold')
    expect(pageSource).not.toContain('router.push')
  })

  it('用标签页按需展示表格分析能力', () => {
    expect(pageSource).toContain('<Tabs defaultValue="overview"')
    expect(pageSource).toContain('<TabsTrigger value="overview"')
    expect(pageSource).toContain('<TabsTrigger value="sql"')
    expect(pageSource).toContain('<TabsTrigger value="ask"')
    expect(pageSource).toContain('<TabsTrigger value="semantic"')
    expect(pageSource).toContain('xl:overflow-hidden')
    expect(pageSource).toContain('overflow-y-auto')
  })

  it('保留详情、查询、问答和语义过滤接口', () => {
    expect(pageSource).toContain('datasetApi.getTable')
    expect(pageSource).toContain('datasetApi.queryTable')
    expect(pageSource).toContain('datasetApi.askTable')
    expect(pageSource).toContain('datasetApi.lotusSemFilter')
    expect(pageSource).toContain('<TableResult ariaLabel="数据表查询结果"')
    expect(pageSource).toContain('<TableResult ariaLabel="语义过滤结果"')
  })

  it('移除旧装饰表面和用户可见内部开关名', () => {
    expect(pageSource).not.toContain('gradient')
    expect(pageSource).not.toContain('backdrop-blur')
    expect(pageSource).not.toContain('rounded-2xl')
    expect(pageSource).not.toContain('rounded-xl')
    expect(pageSource).not.toContain('rounded-[')
    expect(pageSource).not.toContain('shadow-[')
    expect(pageSource).not.toContain('text-[11px]')
    expect(pageSource).not.toContain('TABLE_NL2SQL_ENABLED')
    expect(pageSource).not.toContain('TABLE_LOTUS_ENABLED')
  })
})
