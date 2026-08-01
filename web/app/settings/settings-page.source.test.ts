import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const settingsPageSource = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8')

const settingsGroupSource = settingsPageSource.slice(
  settingsPageSource.indexOf('export const SETTINGS_SECTIONS'),
  settingsPageSource.indexOf('const SETTINGS_SECTION_BY_ID')
)

describe('设置页信息架构', () => {
  it('只保留五个一级任务分组', () => {
    expect(settingsGroupSource.match(/id: 'settings-[^']+'/g)).toHaveLength(5)
    expect(settingsGroupSource).toContain("label: '运行状态'")
    expect(settingsGroupSource).toContain("label: '模型与服务'")
    expect(settingsGroupSource).toContain("label: '知识处理'")
    expect(settingsGroupSource).toContain("label: '检索与生成'")
    expect(settingsGroupSource).toContain("label: '平台、权限与可观测性'")
    expect(settingsPageSource.match(/<SettingsSectionFrame section=/g)).toHaveLength(5)
  })

  it('提供搜索、空状态和移动端分组选择器', () => {
    expect(settingsPageSource).toContain('data-testid="settings-search"')
    expect(settingsPageSource).toContain('data-testid="settings-search-empty"')
    expect(settingsPageSource).toContain('data-testid="settings-mobile-group-select"')
  })

  it('保留原有设置能力', () => {
    const preservedSections = [
      'SystemStatusSection',
      'RuntimeControlsSection',
      'ModelProvidersSection',
      'ObjectStorageSection',
      'DifyIntegrationSection',
      'ParserServicesSection',
      'GovernanceSection',
      'UrlIngestSection',
      'IndustryRulesSection',
      'RagSection',
      'RetrievalEnhancementSection',
      'FeatureFlagsSection',
      'LtrModelRegistrySection',
      'FrontendPreferencesSection',
      'NavigationVisibilitySection',
      'ObservabilitySection',
    ]

    for (const sectionName of preservedSections) {
      expect(settingsPageSource).toContain(`<${sectionName}`)
    }
  })

  it('低频能力使用高级配置折叠容器', () => {
    expect(settingsPageSource).toContain('data-testid="settings-advanced-section"')
    expect(settingsPageSource.match(/<SettingsSubsection[^>]+advanced>/g)?.length).toBeGreaterThanOrEqual(6)
  })
})
