import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const routeErrorSource = readFileSync(resolve(__dirname, 'route-error.tsx'), 'utf8')
const routeLoadingSource = readFileSync(resolve(__dirname, 'route-loading.tsx'), 'utf8')
const appLoadingSource = readFileSync(resolve(__dirname, '../app/loading.tsx'), 'utf8')
const settingsLoadingSource = readFileSync(
  resolve(__dirname, '../app/settings/loading.tsx'),
  'utf8'
)
const knowledgeLoadingSource = readFileSync(
  resolve(__dirname, '../app/knowledge/loading.tsx'),
  'utf8'
)
const datasetDetailLoadingSource = readFileSync(
  resolve(__dirname, '../app/datasets/[id]/loading.tsx'),
  'utf8'
)
const graphLoadingSource = readFileSync(resolve(__dirname, '../app/graph/loading.tsx'), 'utf8')
const evaluationsLoadingSource = readFileSync(
  resolve(__dirname, '../app/evaluations/loading.tsx'),
  'utf8'
)
const notFoundSource = readFileSync(resolve(__dirname, '../app/not-found.tsx'), 'utf8')

describe('全站路由边界视觉契约', () => {
  it('错误重试保留当前文档与应用壳层', () => {
    expect(routeErrorSource).toContain('retryRouteAfterBoundaryError(reset)')
    expect(routeErrorSource).not.toContain('location.reload')
    expect(routeErrorSource).not.toContain('window.location')
  })

  it('错误页和未找到页使用扁平状态布局', () => {
    for (const source of [routeErrorSource, notFoundSource]) {
      expect(source).not.toContain('gradient')
      expect(source).not.toContain('backdrop-blur')
      expect(source).not.toContain('shadow-')
      expect(source).not.toMatch(/rounded-(?:xl|2xl|3xl|full)/)
    }
  })

  it('加载骨架匹配 224px 侧栏且读屏只播报一次', () => {
    expect(appLoadingSource).toContain('w-56')
    expect(appLoadingSource).not.toContain('w-[280px]')
    expect(appLoadingSource).not.toMatch(/rounded-(?:xl|2xl|3xl)/)
    expect(routeLoadingSource).toContain('加载中…')
    expect(routeLoadingSource).not.toContain('<span className="sr-only">Loading</span>')
  })

  it('设置和知识库页面复用统一的扁平加载状态', () => {
    for (const source of [
      settingsLoadingSource,
      knowledgeLoadingSource,
      datasetDetailLoadingSource,
      graphLoadingSource,
      evaluationsLoadingSource,
    ]) {
      expect(source).toContain("import { RouteLoading } from '@/components/route-loading'")
      expect(source).toContain('return <RouteLoading />')
      expect(source).not.toContain('Skeleton')
      expect(source).not.toMatch(/rounded-(?:xl|2xl|3xl)/)
    }
  })
})
