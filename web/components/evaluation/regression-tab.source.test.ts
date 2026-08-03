import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(__dirname, 'regression-tab.tsx'), 'utf8')
const metricSource = readFileSync(
  resolve(__dirname, 'ragas-metric-selector.tsx'),
  'utf8'
)

describe('回归评测工作区源码契约', () => {
  it('使用面向用户的中文评测文案', () => {
    expect(source).toContain('使用模型复核答案')
    expect(source).toContain('回归评测已开始')
    expect(source).toContain('业务元数据召回')
    expect(source).toContain("label: '已完成'")
    expect(source).toContain("label: '运行中'")
    expect(source).not.toContain('Golden 评测')
    expect(source).not.toContain('LLM-as-Judge')

    expect(metricSource).toContain("label: '忠实度'")
    expect(metricSource).toContain("label: '回答相关性'")
    expect(metricSource).toContain("label: '引用准确率'")
    expect(metricSource).not.toContain('Faithfulness（忠实度）')
    expect(metricSource).not.toContain("cost: 'LLM'")
  })

  it('保留加载、失败和空回答的恢复状态', () => {
    expect(source).toContain('无法加载运行详情')
    expect(source).toContain('重新加载')
    expect(source).toContain('正在加载运行详情')
    expect(source).toContain("if (!answer) return '暂无回答'")
  })

  it('在窄屏使用纵向布局且配置收起后不保留空列', () => {
    expect(source).toContain('grid-cols-1 gap-4 overflow-y-auto')
    expect(source).toContain('显示评测配置')
    expect(source).not.toContain('xl:grid-cols-[0px_minmax(0,1fr)]')
    expect(source).not.toContain("'w-1/3'")
  })

  it('遵循扁平视觉约束', () => {
    expect(source).not.toMatch(/rounded-(?:xl|2xl|3xl|full)/)
    expect(source).not.toContain('shadow-')
    expect(source).not.toContain('backdrop-blur')
    expect(source).not.toContain('absolute')
    expect(source).not.toMatch(/text-\[(?:9|10|11)(?:\.\d+)?px\]/)
  })
})
