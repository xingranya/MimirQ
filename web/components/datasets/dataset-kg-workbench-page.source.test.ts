import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const pageSource = readFileSync(
  resolve(__dirname, 'dataset-kg-workbench-page.tsx'),
  'utf8'
)

describe('数据集知识图谱工作台', () => {
  it('使用共享数据集壳层并保持客户端导航', () => {
    expect(pageSource).toContain('<DatasetDetailShell')
    expect(pageSource).toContain('activeSection="kg"')
    expect(pageSource).toContain('router.push(scopedGraphUrl)')
    expect(pageSource).not.toContain('<AppFrame>')
    expect(pageSource).not.toContain('<PageScaffold')
    expect(pageSource).not.toContain('<Panel')
  })

  it('保留抽取、统计、搜索和图谱画布接口', () => {
    expect(pageSource).toContain('kgApi.extract(')
    expect(pageSource).toContain('kgApi.getStats(')
    expect(pageSource).toContain('kgApi.searchGraphNodes(')
    expect(pageSource).toContain('GraphService.fetchInitialGraph(')
    expect(pageSource).toContain('<GraphViewer')
  })

  it('低频操作集中收纳且页面文案完成中文化', () => {
    expect(pageSource).toContain('aria-label="更多图谱操作"')
    expect(pageSource).toContain('图谱快照')
    expect(pageSource).toContain('图谱诊断')
    expect(pageSource).toContain('抽取设置')
    expect(pageSource).toContain('预览设置')
    expect(pageSource).not.toContain('text-[11px]')
    expect(pageSource).not.toContain('backdrop-blur')
    expect(pageSource).not.toContain('rounded-xl')
    expect(pageSource).not.toContain('rounded-2xl')
  })
})
