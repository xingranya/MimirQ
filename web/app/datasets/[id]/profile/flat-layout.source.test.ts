import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const pageSource = readFileSync(resolve(__dirname, 'page-client.tsx'), 'utf8')
const routeSource = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8')

describe('数据集画像页扁平化契约', () => {
  it('接入共享详情壳层并收敛页面操作', () => {
    expect(pageSource).toContain('<DatasetDetailShell')
    expect(pageSource).toContain('activeSection="profile"')
    expect(pageSource).toContain('datasetName={dataset?.name}')
    expect(pageSource).toContain('刷新画像')
    expect(pageSource).toContain('导出 JSON')
    expect(pageSource).toContain('导出 HTML')
    expect(pageSource).not.toContain('<PageScaffold')
    expect(pageSource).not.toContain('router.push')
  })

  it('保留深度扫描、分页、重试和文档详情能力', () => {
    expect(pageSource).toContain('startDeepScan')
    expect(pageSource).toContain('fetchNextFindingPage')
    expect(pageSource).toContain('fetchNextBucketPage')
    expect(pageSource).toContain('documentApi.batchRetry')
    expect(pageSource).toContain('<DocumentDetailDialog')
  })

  it('移除旧装饰表面和用户可见内部英文', () => {
    expect(pageSource).not.toContain('gradient')
    expect(pageSource).not.toContain('backdrop-blur')
    expect(pageSource).not.toContain('rounded-2xl')
    expect(pageSource).not.toContain('rounded-xl')
    expect(pageSource).not.toContain('rounded-[')
    expect(pageSource).not.toContain('shadow-[')
    expect(pageSource).not.toContain('showing ')
    expect(pageSource).not.toContain('best-effort')
    expect(routeSource).toContain('srMessage="正在加载数据集画像"')
  })
})
