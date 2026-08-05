import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  resolve(__dirname, 'evaluation-data-ops-panel.tsx'),
  'utf8'
)

describe('评测数据操作面板视觉契约', () => {
  it('使用扁平区块和统一操作控件', () => {
    expect(source).not.toMatch(
      /linear-gradient|backdrop-blur|shadow-\[|shadow-inner|rounded-(?:xl|2xl|3xl)/
    )
    expect(source).toContain('rounded-lg border border-border/70 bg-background')
    expect(source).toContain('shadow-none')
    expect(source).not.toContain('<details\n        open')
  })

  it('用户文案不暴露评测内部缩写，保留各项接口操作', () => {
    expect(source).toContain('生成困难样例')
    expect(source).toContain('知识图谱诊断记录')
    expect(source).toContain('导入测试样例')
    expect(source).not.toContain('生成 hardcases')
    expect(source).not.toContain('KG 诊断 Runs')
    expect(source).toContain('evaluationApi.importRegressionCases')
    expect(source).toContain('evaluationApi.purgeRegressionRuns')
  })
})
