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
})
