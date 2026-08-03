import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const pageSource = fs.readFileSync(
  path.resolve(__dirname, 'governance-profiles-page.tsx'),
  'utf8'
)

describe('治理模板列表页', () => {
  it('只突出新建模板，并把低频操作收进更多菜单', () => {
    expect(pageSource).toContain('actions={')
    expect(pageSource).toContain('新建模板')
    expect(pageSource).toContain('更多模板操作')
    expect(pageSource).toContain('导入时覆盖同名模板')
    expect(pageSource).toContain('/data-governance/common-lines')
    expect(pageSource).not.toContain('KnowledgeOpsHero')
    expect(pageSource).not.toContain('KnowledgeOpsFlowCard')
  })

  it('保留模板的完整管理操作', () => {
    expect(pageSource).toContain('copyProfile(profile)')
    expect(pageSource).toContain('exportOne(profile)')
    expect(pageSource).toContain('exportAsIngestionPolicy(profile)')
    expect(pageSource).toContain('setDeleteTarget(profile)')
    expect(pageSource).toContain('importGovernanceProfiles')
  })

  it('使用扁平列表并移除旧装饰样式和内部文案', () => {
    expect(pageSource).toContain('divide-y divide-border')
    expect(pageSource).not.toContain('rounded-2xl')
    expect(pageSource).not.toContain('shadow-soft')
    expect(pageSource).not.toContain('pipeline_patch 编排')
    expect(pageSource).not.toContain('ingestion policy')
    expect(pageSource).not.toContain('暂无 Profiles')
  })
})
