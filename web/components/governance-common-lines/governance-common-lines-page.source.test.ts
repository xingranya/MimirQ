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
})
