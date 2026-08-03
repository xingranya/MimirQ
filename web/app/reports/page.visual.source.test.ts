import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const readReportSource = (file: string) =>
  readFileSync(resolve(__dirname, file), 'utf8')

const heroSource = readReportSource('components/reports-page-hero.tsx')
const controlSource = readReportSource('components/reports-control-panel.tsx')
const atomsSource = readReportSource('components/report-atoms.tsx')
const panelsSource = readReportSource('components/report-panels.tsx')
const dashboardSource = readReportSource('components/reports-dashboard.tsx')
const resultSource = readReportSource('components/reports-result-section.tsx')
const tokenSource = readReportSource('report-tokens.ts')
const formatSource = readReportSource('report-format.ts')
const visualSource = [
  heroSource,
  controlSource,
  atomsSource,
  panelsSource,
  dashboardSource,
  resultSource,
  tokenSource,
].join('\n')

describe('数据报告页面视觉与交互契约', () => {
  it('使用紧凑页头和单一主操作', () => {
    expect(heroSource).toContain('data-reports-header="true"')
    expect(heroSource.match(/<DataPill/g)).toHaveLength(3)
    expect(controlSource).toContain('REPORT_PRIMARY_ACTION_CLASS')
    expect(controlSource).toContain("report ? '重新生成' : '生成报告'")
    expect(heroSource).not.toContain('Report Ops')
  })

  it('遵循扁平视觉约束', () => {
    expect(visualSource).not.toMatch(/rounded-(?:xl|2xl|3xl|full)/)
    expect(visualSource).not.toContain('rounded-[')
    expect(visualSource).not.toContain('shadow-')
    expect(visualSource).not.toContain('backdrop-blur')
    expect(visualSource).not.toContain('linear-gradient')
    expect(visualSource).not.toContain('tracking-[')
    expect(visualSource).not.toMatch(/text-\[(?:9|10|11)(?:\.\d+)?px\]/)
    expect(dashboardSource).not.toContain('index="0')
  })

  it('风险记录在手机上改为列表并保留桌面表格', () => {
    expect(panelsSource).toContain('space-y-2 md:hidden')
    expect(panelsSource).toContain('hidden overflow-auto rounded-md')
    expect(panelsSource).toContain('min-w-[640px]')
    expect(panelsSource).toContain('<article')
  })

  it('报告失败时提供页面内恢复入口', () => {
    expect(resultSource).toContain('onRetry: () => void')
    expect(resultSource).toContain('报告加载失败')
    expect(resultSource).toContain('重新加载')
  })

  it('使用面向用户的中文审计文案', () => {
    const copySource = [controlSource, panelsSource, heroSource, formatSource].join(
      '\n'
    )
    expect(copySource).toContain('问答审计报告')
    expect(copySource).toContain('知识图谱建议')
    expect(copySource).toContain('元数据召回率')
    expect(copySource).not.toContain('Golden')
    expect(copySource).not.toContain('RAG Audit')
    expect(copySource).not.toContain('Report Ops')
  })
})
