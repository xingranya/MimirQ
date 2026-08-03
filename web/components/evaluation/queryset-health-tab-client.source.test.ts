import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  resolve(__dirname, 'queryset-health-tab-client.tsx'),
  'utf8'
)

describe('检索集健康度页面', () => {
  it('使用中文指标和退化原因', () => {
    expect(source).toContain("hit_at_k_drop: '命中率下降'")
    expect(source).toContain("p95_latency_regression: '响应延迟上升'")
    expect(source).toContain('平均倒数排名')
    expect(source).toContain('归一化增益')
    expect(source).not.toContain('文件路径:')
    expect(source).not.toContain('owner/admin')
    expect(source).not.toContain('生成时间=')
  })

  it('为加载和差异错误提供页面内恢复入口', () => {
    expect(source).toContain('无法加载健康记录')
    expect(source).toContain('重新加载')
    expect(source).toContain('无法生成快照差异，请重试。')
    expect(source).toContain('重新计算')
    expect(source).toContain('请选择两个不同的快照进行比较。')
  })

  it('最近运行在移动端使用列表并保留桌面表格', () => {
    expect(source).toContain('md:hidden')
    expect(source).toContain('hidden max-h-[320px] overflow-auto md:block')
    expect(source).toContain('min-w-[720px]')
    expect(source).toContain('<article')
    expect(source).toContain('<dl')
  })

  it('遵循扁平视觉约束', () => {
    expect(source).not.toContain('variant="glass"')
    expect(source).not.toMatch(/rounded-(?:xl|2xl|3xl|full)/)
    expect(source).not.toContain('shadow-')
    expect(source).not.toContain('backdrop-blur')
    expect(source).not.toMatch(/text-\[(?:9|10|11)(?:\.\d+)?px\]/)
  })
})
