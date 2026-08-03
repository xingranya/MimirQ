import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const pageSource = fs.readFileSync(
  path.resolve(__dirname, 'governance-common-lines-page.tsx'),
  'utf8'
)

describe('重复内容治理页面', () => {
  it('加载可写模板时只读取数据，不自动创建默认模板', () => {
    const listStart = pageSource.indexOf(
      'async function listWritableCommonLineProfiles'
    )
    const componentStart = pageSource.indexOf(
      'export function GovernanceCommonLinesPage'
    )
    const listSource = pageSource.slice(listStart, componentStart)

    expect(listStart).toBeGreaterThanOrEqual(0)
    expect(componentStart).toBeGreaterThan(listStart)
    expect(listSource).toContain('pipelineApi.listGovernanceProfiles')
    expect(listSource).not.toContain('createGovernanceProfile')
    expect(pageSource).not.toContain('DEFAULT_COMMON_LINES_PROFILE')
  })

  it('仅在用户明确操作后更新治理模板', () => {
    expect(pageSource).toContain('const applyToProfile = useCallback')
    expect(pageSource).toContain('const importProcessingScripts = useCallback')
    expect(pageSource).toContain('pipelineApi.updateGovernanceProfile')
  })

  it('使用扁平响应式工作台并保留完整入口', () => {
    expect(pageSource).toContain('扫描文档')
    expect(pageSource).toContain('写入模板')
    expect(pageSource).toContain('处理脚本（高级）')
    expect(pageSource).toContain('href="/data-governance/profiles"')
    expect(pageSource).toContain('md:grid-cols-[40px_minmax(0,1fr)_7rem_7rem]')
    expect(pageSource).not.toContain('KnowledgeOpsHero')
    expect(pageSource).not.toContain('min-w-[720px]')
    expect(pageSource).not.toMatch(/rounded-(?:xl|2xl|3xl|full)/)
    expect(pageSource).not.toContain('backdrop-blur')
    expect(pageSource).not.toContain('shadow-soft')
    expect(pageSource).not.toContain('shadow-subtle')
    expect(pageSource).not.toMatch(/text-\[(?:9|10|11)(?:\.\d+)?px\]/)
  })

  it('不向用户暴露内部字段和开发术语', () => {
    expect(pageSource).not.toContain('persist_parsed_content')
    expect(pageSource).not.toContain('processing_scripts 中')
    expect(pageSource).not.toContain('tag 搜索')
    expect(pageSource).not.toContain('写入治理配置')
    expect(pageSource).not.toContain('后端')
  })
})
