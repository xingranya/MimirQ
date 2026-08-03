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

  it('统计可信度保留双端布局并使用中文字段', () => {
    const source = readFileSync(
      resolve(__dirname, 'ablation-statistics-panel.tsx'),
      'utf8'
    )

    expect(source).toContain('统计可信度')
    expect(source).toContain('置信区间')
    expect(source).toContain('等待逐项分数')
    expect(source).toContain('md:hidden')
    expect(source).toContain('overflow-x-auto')
    expect(source).not.toContain('Bootstrap CI')
    expect(source).not.toContain('p-value')
    expect(source).not.toContain('待 per-case')
    expect(source).not.toContain('rounded-lg')
    expect(source).not.toContain('shadow-')
  })

  it('案例下钻提供错误反馈和中文详情', () => {
    const source = readFileSync(
      resolve(__dirname, 'ablation-case-drilldown.tsx'),
      'utf8'
    )

    expect(source).toContain("toast.error(formatApiError(error, '加载案例明细失败'))")
    expect(source).toContain('逐条案例下钻')
    expect(source).toContain('基准回答')
    expect(source).toContain('目标回答')
    expect(source).toContain('aria-expanded=')
    expect(source).not.toContain('Per-case 失败钻取')
    expect(source).not.toContain('Base answer')
    expect(source).not.toContain('Target answer')
    expect(source).not.toContain('rounded-lg')
    expect(source).not.toMatch(/text-\[(?:9|10|11)(?:\.\d+)?px\]/)
  })

  it('检索调参页使用扁平布局并在窄屏顺序排列', () => {
    const source = readFileSync(
      resolve(__dirname, 'retrieval-ablations-page.tsx'),
      'utf8'
    )

    expect(source).toContain('grid min-h-0 grid-cols-1 gap-4')
    expect(source).toContain('xl:grid-cols-[320px_minmax(0,1fr)]')
    expect(source).toContain('2xl:grid-cols-[320px_minmax(0,1fr)_320px]')
    expect(source).toContain('显示参数配置')
    expect(source).toContain('显示评测排行')
    expect(source).toContain('标准样本')
    expect(source).not.toContain('h-[111.111%]')
    expect(source).not.toContain('scale-[0.9]')
    expect(source).not.toContain('grid-cols-[390px_minmax(0,1fr)_360px]')
    expect(source).not.toContain('ablation-empty-illustration')
    expect(source).not.toMatch(/rounded-(?:xl|2xl|3xl|full)/)
    expect(source).not.toMatch(/text-\[(?:9|10|11)(?:\.\d+)?px\]/)
    expect(source).not.toContain('shadow-')
    expect(source).not.toContain('Golden/Regression')
    expect(source).not.toContain('reranker ON/OFF')
  })
})
