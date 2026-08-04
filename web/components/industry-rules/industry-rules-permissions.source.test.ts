import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const pageSource = readFileSync(
  resolve(__dirname, '../../app/governance/industry-rules/page.tsx'),
  'utf8'
)
const workbenchSource = readFileSync(
  resolve(__dirname, 'industry-rules-workbench.tsx'),
  'utf8'
)

function functionBody(name: string): string {
  const match = workbenchSource.match(
    new RegExp(`const ${name} = \\([\\s\\S]*?\\n  \\}`)
  )
  expect(match, `未找到 ${name}`).not.toBeNull()
  return match?.[0] || ''
}

describe('行业规则权限契约', () => {
  it('页面读取前先经过租户设置权限门禁', () => {
    expect(pageSource).toContain('<TenantPermissionGate')
    expect(pageSource).toContain('TENANT_PERMISSIONS.SETTINGS_READ')
    expect(pageSource).toContain('pageName="行业规则库"')
  })

  it('使用接口返回的真实管理能力，不在前端猜测角色', () => {
    expect(workbenchSource).toContain("rulesetsQuery.data?.can_manage === true")
    expect(workbenchSource).toContain('当前账号只有查看权限')
    expect(workbenchSource).not.toContain("role === 'owner'")
  })

  it('只读账号不能编辑、保存或接受规则候选', () => {
    expect(workbenchSource).toContain(
      '!canManageRules || draftUnavailable || savingGlossary'
    )
    expect(workbenchSource).toContain(
      '!canManageRules || draftUnavailable || savingPatterns'
    )
    expect(workbenchSource).toContain(
      '!canManageRules || draftUnavailable || savingIntents'
    )
    expect(workbenchSource).toContain('readOnly={glossaryEditingDisabled}')
    expect(workbenchSource).toContain('readOnly={patternsEditingDisabled}')
    expect(workbenchSource).toContain('readOnly={intentsEditingDisabled}')
    expect(workbenchSource).toContain('disabled={glossaryEditingDisabled}')
    expect(workbenchSource).toContain('disabled={patternsEditingDisabled}')
    expect(workbenchSource).toContain('disabled={intentsEditingDisabled}')
    expect(workbenchSource).toContain(
      '当前账号可查看、预览和导出规则，只有平台所有者可以修改。'
    )
    expect(functionBody('setGlossaryEntry')).toContain(
      'if (glossaryEditingDisabled) return'
    )
    expect(functionBody('setPatternEntry')).toContain(
      'if (patternsEditingDisabled) return'
    )
    expect(functionBody('setIntentEntry')).toContain(
      'if (intentsEditingDisabled) return'
    )
  })
})
