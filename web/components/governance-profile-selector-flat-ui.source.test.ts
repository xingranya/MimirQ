import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  resolve(__dirname, 'governance-profile-selector.tsx'),
  'utf8'
)

describe('治理预设选择器视觉契约', () => {
  it('使用统一控件尺寸和轻边界', () => {
    expect(source).not.toMatch(/linear-gradient|backdrop-blur|shadow-\[|rounded-\[|rounded-(?:xl|2xl|3xl|full)/)
    expect(source).toContain('rounded-md border-border/70 bg-background')
    expect(source).toContain('rounded-md border-primary bg-primary')
  })

  it('对外文案直接描述配置操作并保留导入导出接口', () => {
    expect(source).toContain('选择治理预设')
    expect(source).toContain('导入配置')
    expect(source).toContain('导出配置')
    expect(source).not.toContain('Profiles/脚本')
    expect(source).toContain('pipelineApi.importGovernanceProfiles')
    expect(source).toContain('pipelineApi.exportGovernanceProfile')
  })
})
