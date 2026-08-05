import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  resolve(__dirname, '_sections/industry-rules-section.tsx'),
  'utf8'
)

describe('设置页行业规则视觉契约', () => {
  it('使用扁平背景和明确的规则工作台文案', () => {
    expect(source).not.toContain('linear-gradient')
    expect(source).not.toContain('后端规则接口')
    expect(source).toContain('打开规则工作台')
    expect(source).toContain('自动改写')
  })

  it('规则集选择项保留按钮语义，不使用胶囊标签', () => {
    expect(source).toContain('aria-pressed={item.name === trimmedRulesetName}')
    expect(source).toContain("'rounded-md border px-2 py-1")
    expect(source).not.toContain("'rounded-full border px-2 py-0.5")
  })

  it('仅在当前规则集载入成功且账号可写时允许保存', () => {
    expect(source).toContain('loadedRulesetName === trimmedRulesetName')
    expect(source).toContain('rulesetsQuery.data?.can_manage === true')
    expect(source).toContain('!canManageRules || !hasLoadedSelectedRuleset')
    expect(source).toContain('payload.ruleset.name !== trimmedRulesetName')
    expect(source).toContain('disabled={disabled}')
  })
})
