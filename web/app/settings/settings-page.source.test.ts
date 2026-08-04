import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const settingsPageSource = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8')
const settingsStateSource = readFileSync(
  resolve(__dirname, 'use-settings-page-state.ts'),
  'utf8'
)
const settingsGroupSource = readFileSync(resolve(__dirname, 'settings-sections.ts'), 'utf8')

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

  it('使用固定保存栏展示未保存数量和保存状态', () => {
    expect(settingsPageSource).toContain('data-testid="settings-save-bar"')
    expect(settingsPageSource).toContain('state.dirtySectionCount')
    expect(settingsPageSource).toContain('所有设置已保存')
    expect(settingsPageSource).toContain('放弃未保存的修改？')
  })

  it('按后端写能力进入只读模式', () => {
    expect(settingsPageSource).toContain('settingsWritable={state.settingsWritable}')
    expect(settingsPageSource).toContain('只有系统所有者可以修改')
    expect(settingsPageSource.match(/<fieldset disabled={!settingsWritable}/g)).toHaveLength(5)
    expect(settingsPageSource).toContain('if (!settingsWritable) return null')
  })

  it('功能开关只保留一个知识图谱入口并接收只读状态', () => {
    const knowledgeSection = settingsPageSource.slice(
      settingsPageSource.indexOf("visibleSectionIdSet.has('settings-knowledge')"),
      settingsPageSource.indexOf("visibleSectionIdSet.has('settings-retrieval')")
    )
    expect(settingsPageSource).not.toContain('RetrievalEnhancementSection')
    expect(settingsPageSource).toContain('disabled={!settingsWritable}')
    expect(settingsPageSource.match(/<FeatureFlagsSection/g)).toHaveLength(1)
    expect(knowledgeSection).toContain('<SettingsSubsection title="功能开关" advanced>')
    expect(knowledgeSection).toContain('<FeatureFlagsSection')
  })

  it('保存失败保持可见并允许再次保存', () => {
    const saveSettingsSource = settingsStateSource.slice(
      settingsStateSource.indexOf('const saveSettings = async'),
      settingsStateSource.indexOf('const toggleFeature')
    )
    const failureBranchSource = saveSettingsSource.slice(
      saveSettingsSource.indexOf('catch (error)'),
      saveSettingsSource.indexOf('finally')
    )

    expect(failureBranchSource).toContain("type: 'error'")
    expect(failureBranchSource).not.toContain('setTimeout')
    expect(saveSettingsSource).toContain('setSaving(false)')
  })
})
