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
})
