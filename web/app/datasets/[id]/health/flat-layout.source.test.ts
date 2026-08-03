import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const pageSource = readFileSync(resolve(__dirname, 'page-client.tsx'), 'utf8')
const routeSource = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8')

describe('数据集健康页扁平化契约', () => {
  it('接入共享详情壳层并保留刷新和导出操作', () => {
    expect(pageSource).toContain('<DatasetDetailShell')
    expect(pageSource).toContain('activeSection="health"')
    expect(pageSource).toContain('datasetName={dataset?.name}')
    expect(pageSource).toContain('datasetQuery.refetch()')
    expect(pageSource).toContain('healthQuery.refetch()')
    expect(pageSource).toContain('导出 JSON')
    expect(pageSource).toContain('导出 MD')
    expect(pageSource).not.toContain('<PageScaffold')
    expect(pageSource).not.toContain('router.push')
  })

  it('移除旧装饰表面和用户可见内部英文', () => {
    expect(pageSource).not.toContain('gradient')
    expect(pageSource).not.toContain('backdrop-blur')
    expect(pageSource).not.toContain('rounded-2xl')
    expect(pageSource).not.toContain('rounded-xl')
    expect(pageSource).not.toContain('rounded-[')
    expect(pageSource).not.toContain('shadow-[')
    expect(pageSource).not.toContain('updated ')
    expect(pageSource).not.toContain('Secrets')
    expect(pageSource).not.toContain('rule-based')
    expect(routeSource).toContain('srMessage="正在加载数据集健康状况"')
  })
})
