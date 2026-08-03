import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('消融分析响应式布局', () => {
  it.each([
    'ablation-statistics-panel.tsx',
    'ablation-case-drilldown.tsx',
  ])('%s 同时提供移动详情和桌面滚动表格', (fileName) => {
    const source = readFileSync(resolve(__dirname, fileName), 'utf8')

    expect(source).toContain('md:hidden')
    expect(source).toContain('overflow-x-auto')
    expect(source).toMatch(/min-w-\[6[28]0px\]/)
    expect(source).not.toContain('mt-3 overflow-hidden')
  })

  it('运行对比在窄屏使用可折行列表', () => {
    const source = readFileSync(
      resolve(__dirname, 'ablation-comparison-matrix.tsx'),
      'utf8'
    )

    expect(source).toContain('sm:grid-cols-2 xl:grid-cols-3')
    expect(source).toContain('多次运行对比')
    expect(source).toContain('优选候选')
    expect(source).not.toContain('min-w-[720px]')
    expect(source).not.toContain('overflow-auto')
    expect(source).not.toMatch(/rounded-(?:xl|2xl|3xl|full)/)
    expect(source).not.toMatch(/text-\[(?:9|10|11)(?:\.\d+)?px\]/)
    expect(source).not.toContain('shadow-')
  })

  it('批量参数组合把技术字段收进高级说明', () => {
    const source = readFileSync(
      resolve(__dirname, 'ablation-grid-panel.tsx'),
      'utf8'
    )

    expect(source).toContain('批量参数组合')
    expect(source).toContain('查看支持的参数字段')
    expect(source).toContain('创建 {variants.length} 个评测任务')
    expect(source).not.toContain('笛卡尔网格批量')
    expect(source).not.toContain('批量创建 Runs')
    expect(source).not.toMatch(/rounded-(?:xl|2xl|3xl|full)/)
    expect(source).not.toMatch(/text-\[(?:9|10|11)(?:\.\d+)?px\]/)
    expect(source).not.toContain('shadow-')
  })

  it('参数影响使用分隔列表和稳定比例条', () => {
    const source = readFileSync(
      resolve(__dirname, 'ablation-parameter-impact-panel.tsx'),
      'utf8'
    )

    expect(source).toContain('divide-y divide-border')
    expect(source).toContain('参数影响排序')
    expect(source).toContain('同一参数至少需要两个取值')
    expect(source).not.toContain('rag_params / ablation_variant')
    expect(source).not.toContain('Sobol')
    expect(source).not.toMatch(/rounded-(?:xl|2xl|3xl|full)/)
    expect(source).not.toMatch(/text-\[(?:9|10|11)(?:\.\d+)?px\]/)
    expect(source).not.toContain('shadow-')
  })

  it('分组差异移除嵌套卡片和内部术语', () => {
    const source = readFileSync(
      resolve(__dirname, 'ablation-slice-diff-panel.tsx'),
      'utf8'
    )

    expect(source).toContain('分组评测')
    expect(source).toContain('基准 {bucket.items_before} 个样本')
    expect(source).toContain('divide-y divide-border')
    expect(source).not.toContain('diff.slice_diffs')
    expect(source).not.toContain('Slice-based eval')
    expect(source).not.toContain('before {bucket.items_before}')
    expect(source).not.toMatch(/rounded-(?:xl|2xl|3xl|full)/)
    expect(source).not.toMatch(/text-\[(?:9|10|11)(?:\.\d+)?px\]/)
    expect(source).not.toContain('shadow-')
  })

  it('效率前沿修正坐标系并隔离图表标签', () => {
    const source = readFileSync(
      resolve(__dirname, 'ablation-pareto-panel.tsx'),
      'utf8'
    )

    expect(source).toContain('viewBox="0 0 100 100"')
    expect(source).toContain('aspect-[16/9] min-h-64')
    expect(source).toContain('(point.latency - minLatency) / latencyRange')
    expect(source).toContain('效率前沿')
    expect(source).toContain('响应延迟')
    expect(source).not.toContain('radial-gradient')
    expect(source).not.toContain('linear-gradient')
    expect(source).not.toContain('hover:scale')
    expect(source).not.toMatch(/rounded-(?:xl|2xl|3xl)/)
    expect(source).not.toMatch(/text-\[(?:9|10|11)(?:\.\d+)?px\]/)
    expect(source).not.toContain('shadow-')
  })
})
