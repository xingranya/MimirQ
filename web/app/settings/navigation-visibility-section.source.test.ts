import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const source = readFileSync(
  resolve(__dirname, '_sections/navigation-visibility-section.tsx'),
  'utf8'
)

describe('普通用户入口显示设置', () => {
  it('保留模块分组、开关和保存契约', () => {
    expect(source).toContain('MODULE_GROUPS.map')
    expect(source).toContain('<SettingsSwitch')
    expect(source).toContain('updateNavigation({ user_visible_modules:')
    expect(source).toContain('normalizeNavigationModules')
  })

  it('使用单层列表和清晰的组间分隔', () => {
    expect(source).toContain('xl:divide-x xl:divide-border')
    expect(source).toContain('divide-y divide-border')
    expect(source).toContain("checked\n                          ? 'bg-primary/5'")
  })

  it('移除嵌套卡片、阴影和过小字号', () => {
    expect(source).not.toContain('rounded-[')
    expect(source).not.toContain('shadow-')
    expect(source).not.toMatch(/text-\[(?:9|10|11)(?:\.\d+)?px\]/)
  })
})
