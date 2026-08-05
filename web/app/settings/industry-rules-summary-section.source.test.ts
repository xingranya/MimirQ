import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const summarySource = readFileSync(
  resolve(__dirname, '_sections/industry-rules-summary-section.tsx'),
  'utf8'
)
const settingsPageSource = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8')
const workbenchPageSource = readFileSync(
  resolve(__dirname, '../governance/industry-rules/page.tsx'),
  'utf8'
)
const workbenchSource = readFileSync(
  resolve(__dirname, '../../components/industry-rules/industry-rules-workbench.tsx'),
  'utf8'
)

describe('设置页行业规则入口', () => {
  it('使用专用工作台入口，不在设置页维护独立编辑草稿', () => {
    expect(summarySource).toContain('href="/governance/industry-rules"')
    expect(summarySource).toContain('打开行业规则')
    expect(summarySource).not.toContain('useState')
    expect(summarySource).not.toContain('industryRulesApi')
    expect(settingsPageSource).toContain('<IndustryRulesSummarySection />')
    expect(settingsPageSource).not.toContain('IndustryRulesSection')
  })

  it('行业规则页只挂载一次应用壳层，并使用完整草稿保护', () => {
    expect(workbenchPageSource).not.toContain('import { AppFrame }')
    expect(workbenchPageSource).not.toContain('<AppFrame>')
    expect(workbenchPageSource).toContain('<IndustryRulesWorkbench />')
    expect(workbenchSource).toContain('useUnsavedNavigationGuard')
    expect(workbenchSource).toContain('hasUnsavedChanges')
  })
})
