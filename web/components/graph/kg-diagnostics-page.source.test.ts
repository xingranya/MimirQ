import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const source = fs.readFileSync(path.resolve(__dirname, 'kg-diagnostics-page.tsx'), 'utf8')

describe('图谱诊断页面源码契约', () => {
  it('保留质量报告、诊断运行、历史记录和双版本对比接口', () => {
    expect(source).toContain('evaluationApi.getKgQualityReport')
    expect(source).toContain('evaluationApi.runKgSearchDiagnostics')
    expect(source).toContain('evaluationApi.listKgSearchDiagnosticsRuns')
    expect(source).toContain('evaluationApi.getKgSearchDiagnosticsRun')
    expect(source).toContain('buildKgDiagnosticsDiff')
  })

  it('保留结果和差异导出', () => {
    expect(source).toContain('downloadJson(runResp')
    expect(source).toContain('downloadJson(')
    expect(source).toContain('kg_diagnostics_diff_')
  })

  it('移动端使用页面滚动且运行记录表在内部滚动', () => {
    expect(source).toContain('h-full overflow-y-auto bg-background')
    expect(source).toContain('xl:h-full xl:min-h-0')
    expect(source).toContain('overflow-x-auto')
    expect(source).toContain('min-w-[860px]')
    expect(source).toContain('sm:flex-row')
  })

  it('使用扁平视觉和可读字号', () => {
    expect(source).not.toContain('backdrop-blur')
    expect(source).not.toContain('radial-gradient')
    expect(source).not.toContain('linear-gradient')
    expect(source).not.toContain('rounded-[')
    expect(source).not.toMatch(/rounded-(?:xl|2xl|3xl)/)
    expect(source).not.toContain('shadow-[')
    expect(source).not.toMatch(/text-\[(?:[0-9]|1[01])(?:\.[0-9]+)?px\]/)
  })

  it('用户文案不暴露旧英文术语', () => {
    expect(source).toContain('技能抽取')
    expect(source).toContain('关系抽取')
    expect(source).toContain('模型生成')
    expect(source).not.toContain('KG Eval')
    expect(source).not.toContain('LLM 生成')
    expect(source).not.toContain("'Hardcase MRR'")
    expect(source).not.toContain("'Baseline MRR'")
  })
})
